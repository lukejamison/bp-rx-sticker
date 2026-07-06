namespace BpRx.BridgeMonitor;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        const string mutexName = "BpRx.BridgeMonitor.SingleInstance";
        using var mutex = new Mutex(true, mutexName, out var createdNew);
        if (!createdNew)
        {
            MessageBox.Show(
                "BP RX Bridge Monitor is already running.\nCheck the system tray near the clock.",
                "BP RX Bridge Monitor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        _coordinator.Logs.WriteMonitorLog("INFO",
            $"BP RX Bridge Monitor starting — {AdminHelper.ElevationLabel}");

        Application.Run(new TrayAppContext());
    }
}
