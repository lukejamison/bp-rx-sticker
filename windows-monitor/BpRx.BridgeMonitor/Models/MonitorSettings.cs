namespace BpRx.BridgeMonitor.Models;

public sealed class MonitorSettings
{
    public string BridgeHealthUrl { get; set; } = "http://127.0.0.1:9101/health";
    public string ScheduledTaskName { get; set; } = "BP-RX-PrintBridge";
    public int PollIntervalSeconds { get; set; } = 15;
    public string LogWebhookUrl { get; set; } = "https://n8n.bushardspharmacy.com/webhook/bp-sticker-logs";
    public int MaxLogBytesPerFile { get; set; } = 120_000;
    public string BridgeLogDirectory { get; set; } = "";
    public string BridgeConfigPath { get; set; } = "";

    public static string SettingsFilePath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "BpRxBridgeMonitor",
            "settings.json");
}
