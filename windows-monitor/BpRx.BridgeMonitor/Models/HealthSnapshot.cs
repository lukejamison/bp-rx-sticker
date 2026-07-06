namespace BpRx.BridgeMonitor.Models;

public enum HealthState
{
    Unknown,
    Healthy,
    Degraded,
    Unhealthy,
}

public sealed class HealthSnapshot
{
    public DateTimeOffset CheckedAt { get; init; } = DateTimeOffset.Now;
    public HealthState State { get; init; } = HealthState.Unknown;
    public bool IsElevated { get; init; }
    public bool BridgeOk { get; init; }
    public string? BridgeError { get; init; }
    public string? PrinterIp { get; init; }
    public int? PrinterPort { get; init; }
    public bool PrinterReachable { get; init; }
    public string? PrinterError { get; init; }
    public string? ScheduledTaskState { get; init; }
    public string? ScheduledTaskLastResult { get; init; }
    public DateTime? ScheduledTaskLastRun { get; init; }
    public string? ScheduledTaskError { get; init; }
    public int BridgeHttpStatus { get; init; }
    public string Summary => State switch
    {
        HealthState.Healthy => "All systems OK",
        HealthState.Degraded => "Bridge OK — printer unreachable",
        HealthState.Unhealthy => BridgeOk ? "Bridge task issue" : "Print bridge down",
        _ => "Checking…",
    };
}
