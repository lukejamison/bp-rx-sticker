using BpRx.BridgeMonitor.Models;

namespace BpRx.BridgeMonitor.Services;

public sealed class MonitorCoordinator
{
    private readonly SettingsStore _settingsStore = new();
    private readonly BridgeHealthService _bridgeHealth = new();
    private readonly PrinterProbeService _printerProbe = new();
    private readonly TaskSupervisorService _taskSupervisor = new();
    private readonly LogCollectorService _logs = new();
    private readonly WebhookLogUploader _uploader = new();

    public LogCollectorService Logs => _logs;

    public MonitorSettings Settings => _settingsStore.Load();

    public void SaveSettings(MonitorSettings settings) => _settingsStore.Save(settings);

    public async Task<HealthSnapshot> CheckHealthAsync(CancellationToken ct = default)
    {
        var settings = Settings;
        var checkedAt = DateTimeOffset.Now;

        var (bridgeOk, bridgeBody, bridgeError, statusCode) =
            await _bridgeHealth.CheckAsync(settings.BridgeHealthUrl, ct);

        string? printerIp = bridgeBody?.PrinterIp;
        int printerPort = bridgeBody?.PrinterPort ?? 9100;

        if (string.IsNullOrWhiteSpace(printerIp) && !string.IsNullOrWhiteSpace(settings.BridgeConfigPath))
        {
            printerIp = ReadEnvValue(settings.BridgeConfigPath, "PRINTER_IP");
            var portText = ReadEnvValue(settings.BridgeConfigPath, "PRINTER_PORT");
            if (int.TryParse(portText, out var parsedPort)) printerPort = parsedPort;
        }

        var (printerOk, printerError) = bridgeOk
            ? await _printerProbe.ProbeAsync(printerIp ?? "", printerPort, ct)
            : (false, "Bridge down — skipped printer probe");

        var taskStatus = await _taskSupervisor.GetTaskStatusAsync(settings.ScheduledTaskName, ct);

        var state = ResolveState(bridgeOk, printerOk, taskStatus.State);

        var snapshot = new HealthSnapshot
        {
            CheckedAt = checkedAt,
            State = state,
            IsElevated = AdminHelper.IsRunningAsAdministrator(),
            BridgeOk = bridgeOk,
            BridgeError = bridgeError,
            BridgeHttpStatus = statusCode,
            PrinterIp = printerIp,
            PrinterPort = printerPort,
            PrinterReachable = printerOk,
            PrinterError = printerError,
            ScheduledTaskState = taskStatus.State,
            ScheduledTaskLastResult = taskStatus.LastResult,
            ScheduledTaskLastRun = taskStatus.LastRun,
            ScheduledTaskError = taskStatus.Error,
        };

        _logs.WriteMonitorLog("INFO", $"Health={state} elevated={snapshot.IsElevated} bridge={bridgeOk} printer={printerOk} task={taskStatus.State ?? "?"}");

        return snapshot;
    }

    public Task<(bool Ok, string Message)> RestartBridgeAsync(CancellationToken ct = default) =>
        _taskSupervisor.RestartBridgeTaskAsync(Settings.ScheduledTaskName, ct);

    public Task<(bool Ok, string Message)> StopBridgeAsync(CancellationToken ct = default) =>
        _taskSupervisor.StopBridgeTaskAsync(Settings.ScheduledTaskName, ct);

    public Task<(bool Ok, string Message)> StartBridgeAsync(CancellationToken ct = default) =>
        _taskSupervisor.StartBridgeTaskAsync(Settings.ScheduledTaskName, ct);

    public async Task<(bool Ok, string Message)> SendLogsAsync(HealthSnapshot? health = null, CancellationToken ct = default)
    {
        var settings = Settings;
        var snapshot = health ?? await CheckHealthAsync(ct);
        var bundle = _logs.CollectLogBundle(settings);
        var result = await _uploader.UploadAsync(settings, snapshot, bundle, ct);

        _logs.WriteMonitorLog(result.Ok ? "INFO" : "ERROR", $"Send logs: {result.Message}");
        return result;
    }

    private static HealthState ResolveState(bool bridgeOk, bool printerOk, string? taskState)
    {
        if (!bridgeOk) return HealthState.Unhealthy;
        if (!printerOk) return HealthState.Degraded;
        if (taskState is "Running" or "Ready") return HealthState.Healthy;
        if (taskState is "MISSING") return HealthState.Unhealthy;
        return HealthState.Degraded;
    }

    private static string? ReadEnvValue(string path, string key)
    {
        if (!File.Exists(path)) return null;

        foreach (var line in File.ReadAllLines(path))
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith('#') || !trimmed.Contains('=')) continue;
            var parts = trimmed.Split('=', 2);
            if (parts[0].Trim().Equals(key, StringComparison.OrdinalIgnoreCase))
            {
                return parts[1].Trim().Trim('"');
            }
        }

        return null;
    }
}
