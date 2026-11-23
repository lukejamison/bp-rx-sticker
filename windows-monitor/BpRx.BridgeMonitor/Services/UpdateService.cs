using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;

namespace BpRx.BridgeMonitor.Services;

public sealed record UpdateInfo(Version Version, string Tag, string AssetUrl, string? ChecksumUrl, string Notes);

/// <summary>
/// Checks GitHub Releases for a newer build, downloads it, and hands the file swap to a
/// detached PowerShell script (the running exe cannot overwrite itself).
/// </summary>
public sealed class UpdateService
{
    private const string Repo = "lukejamison/bp-rx-sticker";
    private const string AssetName = "bp-rx-sticker-release.zip";
    private const string ChecksumName = AssetName + ".sha256";

    private static readonly HttpClient Http = CreateClient();

    public static Version CurrentVersion => Normalize(Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0));

    public static string CurrentVersionText => CurrentVersion.ToString(3);

    private static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("BpRx-BridgeMonitor");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return client;
    }

    private static Version Normalize(Version v) =>
        new(v.Major, Math.Max(v.Minor, 0), Math.Max(v.Build, 0), Math.Max(v.Revision, 0));

    /// <summary>Returns the newer release, or null when already up to date.</summary>
    public async Task<UpdateInfo?> CheckAsync(CancellationToken ct = default)
    {
        using var response = await Http.GetAsync($"https://api.github.com/repos/{Repo}/releases/latest", ct);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            throw new InvalidOperationException("No release found (repo is private or nothing has been published yet).");
        }

        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
        var root = doc.RootElement;

        var tag = root.GetProperty("tag_name").GetString() ?? "";
        if (!Version.TryParse(tag.TrimStart('v', 'V'), out var parsed)) return null;
        var latest = Normalize(parsed);
        if (latest <= CurrentVersion) return null;

        string? assetUrl = null, checksumUrl = null;
        foreach (var asset in root.GetProperty("assets").EnumerateArray())
        {
            var name = asset.GetProperty("name").GetString();
            var url = asset.GetProperty("browser_download_url").GetString();
            if (name == AssetName) assetUrl = url;
            else if (name == ChecksumName) checksumUrl = url;
        }

        if (assetUrl is null) throw new InvalidOperationException($"Release {tag} has no {AssetName} asset.");

        var notes = root.TryGetProperty("body", out var body) ? body.GetString() ?? "" : "";
        return new UpdateInfo(latest, tag, assetUrl, checksumUrl, notes);
    }

    /// <summary>
    /// Downloads and verifies the release, then launches the swap script. The caller must exit
    /// the app right after this returns successfully.
    /// </summary>
    public async Task InstallAsync(UpdateInfo update, CancellationToken ct = default)
    {
        RequireGitHubUrl(update.AssetUrl);

        var work = Path.Combine(Path.GetTempPath(), "bprx-update");
        if (Directory.Exists(work)) Directory.Delete(work, recursive: true);
        Directory.CreateDirectory(work);

        var zipPath = Path.Combine(work, AssetName);
        await using (var net = await Http.GetStreamAsync(update.AssetUrl, ct))
        await using (var file = File.Create(zipPath))
        {
            await net.CopyToAsync(file, ct);
        }

        if (update.ChecksumUrl is not null)
        {
            RequireGitHubUrl(update.ChecksumUrl);
            var expected = (await Http.GetStringAsync(update.ChecksumUrl, ct)).Trim().Split(' ', '\t')[0];
            await using var stream = File.OpenRead(zipPath);
            var actual = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct));
            if (!actual.Equals(expected, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Download failed its checksum check. Update cancelled.");
            }
        }

        var staging = Path.Combine(work, "staging");
        ZipFile.ExtractToDirectory(zipPath, staging);

        var stagedExe = Path.Combine(staging, "windows-monitor", "publish");
        if (!File.Exists(Path.Combine(stagedExe, "BpRx.BridgeMonitor.exe")))
        {
            throw new InvalidOperationException("Release zip is missing windows-monitor/publish/BpRx.BridgeMonitor.exe.");
        }

        var exeDir = AppContext.BaseDirectory.TrimEnd('\\', '/');
        var settings = new SettingsStore().Load();

        // Installed from a repo-style layout: <root>\windows-monitor\publish\exe and <root>\extension.
        var extensionDir = "";
        var root = Directory.GetParent(exeDir)?.Parent?.FullName;
        if (root is not null &&
            Directory.Exists(Path.Combine(root, "extension")) &&
            Directory.Exists(Path.Combine(staging, "extension")))
        {
            extensionDir = Path.Combine(root, "extension");
        }

        // Values are baked into the script so the scheduled-task command line stays short.
        static string Q(string s) => "'" + s.Replace("'", "''") + "'";
        var header =
            $"$MonitorPid = {Environment.ProcessId}\n" +
            $"$StagedExeDir = {Q(stagedExe)}\n" +
            $"$ExeDir = {Q(exeDir)}\n" +
            $"$StagedExtensionDir = {Q(extensionDir.Length > 0 ? Path.Combine(staging, "extension") : "")}\n" +
            $"$ExtensionDir = {Q(extensionDir)}\n" +
            $"$BridgeTask = {Q(settings.ScheduledTaskName)}\n" +
            $"$MonitorTask = {Q("BP-RX-BridgeMonitor")}\n" +
            $"$ApplyTask = {Q(ApplyTaskName)}\n" +
            $"$LogPath = {Q(Path.Combine(work, "update.log"))}\n";
        var scriptPath = Path.Combine(work, "apply-update.ps1");
        File.WriteAllText(scriptPath, header + ApplyScript);

        // The monitor itself runs from a scheduled task, and Task Scheduler can kill child
        // processes when the task's main process exits. Run the swap as its own one-shot
        // task (as SYSTEM) so it survives the monitor exiting.
        var command = $"powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{scriptPath}\"";
        var (createCode, createOut) = RunSchtasks("/Create", "/TN", ApplyTaskName, "/SC", "ONCE", "/ST", "23:59",
            "/RU", "SYSTEM", "/RL", "HIGHEST", "/F", "/TR", command);
        if (createCode != 0) throw new InvalidOperationException($"Could not schedule the update: {createOut}");

        var (runCode, runOut) = RunSchtasks("/Run", "/TN", ApplyTaskName);
        if (runCode != 0) throw new InvalidOperationException($"Could not start the update: {runOut}");
    }

    private const string ApplyTaskName = "BP-RX-ApplyUpdate";

    private static (int Code, string Output) RunSchtasks(params string[] args)
    {
        var start = new ProcessStartInfo("schtasks.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var a in args) start.ArgumentList.Add(a);
        using var p = Process.Start(start)!;
        var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
        p.WaitForExit();
        return (p.ExitCode, output.Trim());
    }

    private static void RequireGitHubUrl(string url)
    {
        var uri = new Uri(url);
        var host = uri.Host;
        if (uri.Scheme != Uri.UriSchemeHttps ||
            !(host == "github.com" || host.EndsWith(".githubusercontent.com", StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException($"Refusing to download from {host}.");
        }
    }

    // Runs after the monitor exits. appsettings.json and config.local.env are never overwritten.
    private const string ApplyScript = """
        $ErrorActionPreference = 'Continue'
        function Log($m) { Add-Content -Path $LogPath -Value ("[{0:s}] {1}" -f (Get-Date), $m) }
        Log "Applying update (monitor pid $MonitorPid)"

        $p = Get-Process -Id $MonitorPid -ErrorAction SilentlyContinue
        if ($p) { if (-not $p.WaitForExit(30000)) { Stop-Process -Id $MonitorPid -Force } }

        schtasks /End /TN $BridgeTask 2>&1 | Out-Null
        Start-Sleep -Seconds 1

        $exe = Join-Path $ExeDir 'BpRx.BridgeMonitor.exe'
        if (Test-Path $exe) { Copy-Item $exe "$exe.previous" -Force }

        robocopy $StagedExeDir $ExeDir /E /XF appsettings.json /R:3 /W:1 /NFL /NDL /NJH /NJS | Out-Null
        if ($LASTEXITCODE -ge 8) { Log "Monitor copy failed (robocopy $LASTEXITCODE)" } else { Log "Monitor files updated" }

        if ($ExtensionDir) {
            robocopy $StagedExtensionDir $ExtensionDir /E /XF config.local.env /XD logs /R:3 /W:1 /NFL /NDL /NJH /NJS | Out-Null
            if ($LASTEXITCODE -ge 8) { Log "Extension copy failed (robocopy $LASTEXITCODE)" } else { Log "Extension + bridge files updated" }
        }

        schtasks /Run /TN $BridgeTask 2>&1 | Out-Null
        schtasks /Run /TN $MonitorTask 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Log "Could not start $MonitorTask - start the monitor manually" }
        Log "Done"
        schtasks /Delete /TN $ApplyTask /F 2>&1 | Out-Null
        """;
}
