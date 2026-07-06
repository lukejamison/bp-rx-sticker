using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using BpRx.BridgeMonitor.Models;

namespace BpRx.BridgeMonitor.Services;

public sealed class BridgeHealthService
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };

    public async Task<(bool Ok, BridgeHealthResponse? Body, string? Error, int StatusCode)> CheckAsync(
        string healthUrl,
        CancellationToken ct)
    {
        try
        {
            using var response = await _http.GetAsync(healthUrl, ct);
            var status = (int)response.StatusCode;

            if (!response.IsSuccessStatusCode)
            {
                return (false, null, $"HTTP {status}", status);
            }

            var body = await response.Content.ReadFromJsonAsync<BridgeHealthResponse>(cancellationToken: ct);
            if (body?.Ok != true)
            {
                return (false, body, "Health JSON ok=false", status);
            }

            return (true, body, null, status);
        }
        catch (Exception ex)
        {
            return (false, null, ex.Message, 0);
        }
    }

    public sealed class BridgeHealthResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("printerIp")]
        public string? PrinterIp { get; set; }

        [JsonPropertyName("printerPort")]
        public int? PrinterPort { get; set; }
    }
}

public sealed class PrinterProbeService
{
    public async Task<(bool Ok, string? Error)> ProbeAsync(string ip, int port, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ip))
        {
            return (false, "No printer IP");
        }

        try
        {
            using var client = new System.Net.Sockets.TcpClient();
            using var connectTask = client.ConnectAsync(ip, port);
            var completed = await Task.WhenAny(connectTask, Task.Delay(3000, ct));
            if (completed != connectTask)
            {
                return (false, "TCP connect timed out");
            }

            await connectTask;
            return client.Connected ? (true, null) : (false, "Not connected");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }
}

public sealed class TaskSupervisorService
{
    public async Task<TaskStatusSnapshot> GetTaskStatusAsync(string taskName, CancellationToken ct)
    {
        var script =
            $"$name = '{EscapePs(taskName)}'; " +
            "$t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue; " +
            "if ($null -eq $t) { Write-Output 'STATE=MISSING'; exit 0 }; " +
            "$i = Get-ScheduledTaskInfo -TaskName $name; " +
            "Write-Output (\"STATE=\" + $t.State); " +
            "Write-Output (\"LAST_RESULT=\" + $i.LastTaskResult); " +
            "Write-Output (\"LAST_RUN=\" + $i.LastRunTime.ToString('o'))";

        var (exit, output, error) = await RunPowerShellAsync(script, ct, elevated: true);
        if (exit != 0 && string.IsNullOrWhiteSpace(output))
        {
            return new TaskStatusSnapshot(null, null, null, error ?? $"PowerShell exit {exit}");
        }

        string? state = null;
        string? lastResult = null;
        DateTime? lastRun = null;

        foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (line.StartsWith("STATE=", StringComparison.OrdinalIgnoreCase))
                state = line["STATE=".Length..];
            else if (line.StartsWith("LAST_RESULT=", StringComparison.OrdinalIgnoreCase))
                lastResult = line["LAST_RESULT=".Length..];
            else if (line.StartsWith("LAST_RUN=", StringComparison.OrdinalIgnoreCase))
            {
                var raw = line["LAST_RUN=".Length..];
                if (DateTime.TryParse(raw, out var parsed)) lastRun = parsed;
            }
        }

        return new TaskStatusSnapshot(state, lastResult, lastRun, null);
    }

    public async Task<(bool Ok, string Message)> RestartBridgeTaskAsync(string taskName, CancellationToken ct)
    {
        if (!AdminHelper.IsRunningAsAdministrator())
        {
            return (false, "Administrator rights required — re-launch the monitor as Admin");
        }

        var script =
            $"$name = '{EscapePs(taskName)}'; " +
            "Write-Output 'Stopping stale bridge processes...'; " +
            "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue | " +
            "Where-Object { $_.CommandLine -match 'print-bridge' -and $_.CommandLine -match 'server\\.js' } | " +
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; " +
            "Start-Sleep -Seconds 1; " +
            "Write-Output 'Stopping scheduled task...'; " +
            "Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue; " +
            "Start-Sleep -Seconds 2; " +
            "Write-Output 'Starting scheduled task...'; " +
            "Start-ScheduledTask -TaskName $name -ErrorAction Stop; " +
            "Start-Sleep -Seconds 2; " +
            "$t = Get-ScheduledTask -TaskName $name; " +
            "$i = Get-ScheduledTaskInfo -TaskName $name; " +
            "Write-Output (\"Restarted — State=\" + $t.State + \" LastResult=\" + $i.LastTaskResult)";

        var (exit, output, error) = await RunPowerShellAsync(script, ct, elevated: true);
        var message = string.Join(Environment.NewLine,
            output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

        if (exit != 0)
        {
            return (false, string.IsNullOrWhiteSpace(message) ? error ?? $"Restart failed (exit {exit})" : message);
        }

        return (true, string.IsNullOrWhiteSpace(message) ? "Restarted" : message);
    }

    public async Task<(bool Ok, string Message)> StopBridgeTaskAsync(string taskName, CancellationToken ct)
    {
        if (!AdminHelper.IsRunningAsAdministrator())
        {
            return (false, "Administrator rights required");
        }

        var script =
            "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue | " +
            "Where-Object { $_.CommandLine -match 'print-bridge' -and $_.CommandLine -match 'server\\.js' } | " +
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; " +
            $"Stop-ScheduledTask -TaskName '{EscapePs(taskName)}' -ErrorAction Stop; " +
            "'Stopped'";

        var (exit, output, error) = await RunPowerShellAsync(script, ct, elevated: true);
        if (exit != 0) return (false, error ?? output.Trim());
        return (true, output.Trim());
    }

    public async Task<(bool Ok, string Message)> StartBridgeTaskAsync(string taskName, CancellationToken ct)
    {
        if (!AdminHelper.IsRunningAsAdministrator())
        {
            return (false, "Administrator rights required");
        }

        var script =
            $"Start-ScheduledTask -TaskName '{EscapePs(taskName)}' -ErrorAction Stop; " +
            "'Started'";

        var (exit, output, error) = await RunPowerShellAsync(script, ct, elevated: true);
        if (exit != 0) return (false, error ?? output.Trim());
        return (true, output.Trim());
    }

    private static async Task<(int ExitCode, string Output, string? Error)> RunPowerShellAsync(
        string script,
        CancellationToken ct,
        bool elevated)
    {
        var encoded = Convert.ToBase64String(System.Text.Encoding.Unicode.GetBytes(script));
        var arguments = $"-NoProfile -ExecutionPolicy Bypass -EncodedCommand {encoded}";

        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = arguments,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        if (elevated && !AdminHelper.IsRunningAsAdministrator())
        {
            psi.Verb = "runas";
            psi.UseShellExecute = true;
            psi.RedirectStandardOutput = false;
            psi.RedirectStandardError = false;
            // runas + redirect is incompatible — caller should already be elevated via manifest
        }

        using var process = Process.Start(psi)!;
        var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
        var stderrTask = process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct);

        return (process.ExitCode, await stdoutTask, string.IsNullOrWhiteSpace(await stderrTask) ? null : await stderrTask);
    }

    private static string EscapePs(string value) => value.Replace("'", "''");
}

public sealed record TaskStatusSnapshot(
    string? State,
    string? LastResult,
    DateTime? LastRun,
    string? Error);
