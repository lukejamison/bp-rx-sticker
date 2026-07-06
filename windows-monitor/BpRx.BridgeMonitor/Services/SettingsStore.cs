using System.Text.Json;
using BpRx.BridgeMonitor.Models;

namespace BpRx.BridgeMonitor.Services;

public sealed class SettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public MonitorSettings Load()
    {
        var settings = new MonitorSettings();
        MergeAppSettings(settings);
        MergeUserSettings(settings);
        ApplyDefaults(settings);
        return settings;
    }

    public void Save(MonitorSettings settings)
    {
        var dir = Path.GetDirectoryName(MonitorSettings.SettingsFilePath)!;
        Directory.CreateDirectory(dir);
        File.WriteAllText(MonitorSettings.SettingsFilePath, JsonSerializer.Serialize(settings, JsonOptions));
    }

    private static void MergeAppSettings(MonitorSettings settings)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        if (!File.Exists(path)) return;

        try
        {
            var json = JsonDocument.Parse(File.ReadAllText(path));
            var root = json.RootElement;
            if (root.TryGetProperty("BridgeHealthUrl", out var url)) settings.BridgeHealthUrl = url.GetString() ?? settings.BridgeHealthUrl;
            if (root.TryGetProperty("ScheduledTaskName", out var task)) settings.ScheduledTaskName = task.GetString() ?? settings.ScheduledTaskName;
            if (root.TryGetProperty("PollIntervalSeconds", out var poll)) settings.PollIntervalSeconds = poll.GetInt32();
            if (root.TryGetProperty("LogWebhookUrl", out var webhook)) settings.LogWebhookUrl = webhook.GetString() ?? settings.LogWebhookUrl;
            if (root.TryGetProperty("MaxLogBytesPerFile", out var max)) settings.MaxLogBytesPerFile = max.GetInt32();
            if (root.TryGetProperty("BridgeLogDirectory", out var logs)) settings.BridgeLogDirectory = logs.GetString() ?? "";
            if (root.TryGetProperty("BridgeConfigPath", out var cfg)) settings.BridgeConfigPath = cfg.GetString() ?? "";
        }
        catch
        {
            // appsettings.json is optional override
        }
    }

    private static void MergeUserSettings(MonitorSettings settings)
    {
        if (!File.Exists(MonitorSettings.SettingsFilePath)) return;

        try
        {
            var saved = JsonSerializer.Deserialize<MonitorSettings>(File.ReadAllText(MonitorSettings.SettingsFilePath));
            if (saved is null) return;

            settings.BridgeHealthUrl = saved.BridgeHealthUrl;
            settings.ScheduledTaskName = saved.ScheduledTaskName;
            settings.PollIntervalSeconds = saved.PollIntervalSeconds;
            settings.LogWebhookUrl = saved.LogWebhookUrl;
            settings.MaxLogBytesPerFile = saved.MaxLogBytesPerFile;
            settings.BridgeLogDirectory = saved.BridgeLogDirectory;
            settings.BridgeConfigPath = saved.BridgeConfigPath;
        }
        catch
        {
            // corrupt settings — defaults remain
        }
    }

    private static void ApplyDefaults(MonitorSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.BridgeLogDirectory))
        {
            TryApplyBridgePaths(settings, AppContext.BaseDirectory);

            var dir = AppContext.BaseDirectory;
            for (var i = 0; i < 10 && !string.IsNullOrEmpty(dir); i++)
            {
                if (!string.IsNullOrWhiteSpace(settings.BridgeLogDirectory)) break;
                TryApplyBridgePaths(settings, dir);
                dir = Path.GetDirectoryName(dir);
            }
        }

        if (!string.IsNullOrWhiteSpace(settings.BridgeLogDirectory)) return;

        TryDiscoverFromGitApps(settings);
        if (!string.IsNullOrWhiteSpace(settings.BridgeLogDirectory)) return;

        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BP-RX", "logs"),
        };

        foreach (var candidate in candidates)
        {
            try
            {
                var full = Path.GetFullPath(candidate);
                if (Directory.Exists(full))
                {
                    settings.BridgeLogDirectory = full;
                    break;
                }
            }
            catch
            {
                // skip invalid path
            }
        }
    }

    private static void TryDiscoverFromGitApps(MonitorSettings settings)
    {
        try
        {
            var docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            var gitApps = Path.Combine(docs, "Git Apps");
            if (!Directory.Exists(gitApps)) return;

            foreach (var repo in Directory.EnumerateDirectories(gitApps, "bp-rx-sticker*", SearchOption.AllDirectories))
            {
                TryApplyBridgePaths(settings, repo);
                if (!string.IsNullOrWhiteSpace(settings.BridgeLogDirectory)) return;
            }
        }
        catch
        {
            // skip discovery errors
        }
    }

    private static void TryApplyBridgePaths(MonitorSettings settings, string baseDir)
    {
        try
        {
            var logDir = Path.GetFullPath(Path.Combine(baseDir, "extension", "print-bridge", "logs"));
            if (!Directory.Exists(logDir)) return;

            settings.BridgeLogDirectory = logDir;
            var configPath = Path.Combine(Path.GetDirectoryName(logDir)!, "config.local.env");
            if (File.Exists(configPath))
            {
                settings.BridgeConfigPath = configPath;
            }
        }
        catch
        {
            // skip invalid path
        }
    }
}
