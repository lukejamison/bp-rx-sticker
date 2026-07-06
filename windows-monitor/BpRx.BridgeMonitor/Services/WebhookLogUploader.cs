using System.Net.Http.Json;
using System.Text.Json;
using BpRx.BridgeMonitor.Models;

namespace BpRx.BridgeMonitor.Services;

public sealed class WebhookLogUploader
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(30) };

    public async Task<(bool Ok, string Message)> UploadAsync(
        MonitorSettings settings,
        HealthSnapshot health,
        Dictionary<string, string> logs,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(settings.LogWebhookUrl))
        {
            return (false, "Webhook URL is not configured");
        }

        var payload = new
        {
            source = "bp-rx-bridge-monitor",
            version = "0.1.0",
            machine = Environment.MachineName,
            user = $"{Environment.UserDomainName}\\{Environment.UserName}",
            timestamp = DateTimeOffset.Now.ToString("o"),
            health = new
            {
                state = health.State.ToString(),
                summary = health.Summary,
                isElevated = health.IsElevated,
                bridgeOk = health.BridgeOk,
                bridgeError = health.BridgeError,
                bridgeHttpStatus = health.BridgeHttpStatus,
                printerIp = health.PrinterIp,
                printerPort = health.PrinterPort,
                printerReachable = health.PrinterReachable,
                printerError = health.PrinterError,
                scheduledTaskState = health.ScheduledTaskState,
                scheduledTaskLastResult = health.ScheduledTaskLastResult,
                scheduledTaskLastRun = health.ScheduledTaskLastRun?.ToString("o"),
                scheduledTaskError = health.ScheduledTaskError,
                checkedAt = health.CheckedAt.ToString("o"),
            },
            settings = new
            {
                settings.BridgeHealthUrl,
                settings.ScheduledTaskName,
                settings.BridgeLogDirectory,
                settings.BridgeConfigPath,
            },
            logs,
        };

        try
        {
            using var response = await _http.PostAsJsonAsync(settings.LogWebhookUrl, payload, JsonOptions, ct);
            var body = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                return (false, $"Webhook HTTP {(int)response.StatusCode}: {body}");
            }

            return (true, $"Logs sent ({(int)response.StatusCode})");
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }
}
