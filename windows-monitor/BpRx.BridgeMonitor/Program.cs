namespace BpRx.BridgeMonitor;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) =>
        {
            MessageBox.Show(
                e.Exception.Message,
                "BP RX Bridge Monitor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        };

        const string mutexName = "BpRx.BridgeMonitor.SingleInstance";
        using var mutex = new Mutex(true, mutexName, out var createdNew);
        if (!createdNew)
        {
            MessageBox.Show(
                "BP RX Bridge Monitor is already running.\nCheck the system tray near the clock, or the BP RX window on the taskbar.",
                "BP RX Bridge Monitor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            Application.Run(new TrayAppContext());
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                ex.Message,
                "BP RX Bridge Monitor failed to start",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
