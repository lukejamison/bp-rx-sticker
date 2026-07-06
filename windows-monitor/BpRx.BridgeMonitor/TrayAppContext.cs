using System.Diagnostics;
using BpRx.BridgeMonitor.Forms;
using BpRx.BridgeMonitor.Models;
using BpRx.BridgeMonitor.Services;

namespace BpRx.BridgeMonitor;

internal sealed class TrayAppContext : ApplicationContext
{
    private readonly MonitorCoordinator _coordinator = new();
    private readonly NotifyIcon _trayIcon;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private StatusForm? _statusForm;
    private HealthSnapshot? _lastHealth;
    private Icon? _currentIcon;

    public TrayAppContext()
    {
        _coordinator.Logs.WriteMonitorLog("INFO",
            $"BP RX Bridge Monitor started — {AdminHelper.ElevationLabel}");

        if (!AdminHelper.IsRunningAsAdministrator())
        {
            _coordinator.Logs.WriteMonitorLog("WARN", "Not running as Administrator; bridge task controls may fail");
        }

        _trayIcon = new NotifyIcon
        {
            Visible = true,
            Text = "BP RX Bridge Monitor",
        };
        SetTrayIcon(HealthState.Unknown);

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open status", null, (_, _) => ShowStatusForm());
        menu.Items.Add("Refresh now", null, async (_, _) => await RefreshAsync());
        menu.Items.Add("Start print bridge", null, async (_, _) => await RunBridgeActionAsync(_coordinator.StartBridgeAsync, "Started"));
        menu.Items.Add("Stop print bridge", null, async (_, _) => await RunBridgeActionAsync(_coordinator.StopBridgeAsync, "Stopped"));
        menu.Items.Add("Restart print bridge", null, async (_, _) => await RestartBridgeAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Send logs to IT", null, async (_, _) => await SendLogsAsync());
        menu.Items.Add("Open log folder", null, (_, _) => OpenLogFolder());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => ExitThread());
        _trayIcon.ContextMenuStrip = menu;
        _trayIcon.DoubleClick += (_, _) => ShowStatusForm();

        var settings = _coordinator.Settings;
        _pollTimer = new System.Windows.Forms.Timer { Interval = Math.Max(5, settings.PollIntervalSeconds) * 1000 };
        _pollTimer.Tick += async (_, _) => await RefreshAsync();
        _pollTimer.Start();

        _ = RefreshAsync();
    }

    private void ShowStatusForm()
    {
        if (_statusForm is { IsDisposed: false })
        {
            _statusForm.BringToFront();
            _statusForm.Show();
            _statusForm.WindowState = FormWindowState.Normal;
            _statusForm.Activate();
            return;
        }

        _statusForm = new StatusForm(_coordinator, _lastHealth);
        _statusForm.FormClosed += (_, _) => _statusForm = null;
        _statusForm.Show();
    }

    private async Task RefreshAsync()
    {
        try
        {
            var health = await _coordinator.CheckHealthAsync();
            _lastHealth = health;
            SetTrayIcon(health.State);
            _trayIcon.Text = $"BP RX — {health.Summary}";
            _statusForm?.UpdateHealth(health);
        }
        catch (Exception ex)
        {
            _coordinator.Logs.WriteMonitorLog("ERROR", $"Refresh failed: {ex.Message}");
        }
    }

    private async Task RunBridgeActionAsync(Func<CancellationToken, Task<(bool Ok, string Message)>> action, string verb)
    {
        _trayIcon.ShowBalloonTip(3000, "BP RX", $"{verb} print bridge…", ToolTipIcon.Info);
        var (ok, message) = await action(CancellationToken.None);
        _coordinator.Logs.WriteMonitorLog(ok ? "INFO" : "ERROR", $"{verb} bridge: {message}");
        _trayIcon.ShowBalloonTip(5000, "BP RX", message, ok ? ToolTipIcon.Info : ToolTipIcon.Error);
        await Task.Delay(1500);
        await RefreshAsync();
    }

    private async Task RestartBridgeAsync()
    {
        _trayIcon.ShowBalloonTip(3000, "BP RX", "Restarting print bridge…", ToolTipIcon.Info);
        var (ok, message) = await _coordinator.RestartBridgeAsync();
        _coordinator.Logs.WriteMonitorLog(ok ? "INFO" : "ERROR", $"Restart bridge: {message}");
        _trayIcon.ShowBalloonTip(5000, "BP RX", message, ok ? ToolTipIcon.Info : ToolTipIcon.Error);
        await Task.Delay(2000);
        await RefreshAsync();
    }

    private async Task SendLogsAsync()
    {
        _trayIcon.ShowBalloonTip(3000, "BP RX", "Sending logs…", ToolTipIcon.Info);
        var (ok, message) = await _coordinator.SendLogsAsync(_lastHealth);
        _trayIcon.ShowBalloonTip(6000, "BP RX", message, ok ? ToolTipIcon.Info : ToolTipIcon.Error);
        _statusForm?.SetActionMessage(message, ok);
    }

    private void OpenLogFolder()
    {
        var settings = _coordinator.Settings;
        var folder = settings.BridgeLogDirectory;
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
        {
            folder = Path.GetDirectoryName(_coordinator.Logs.MonitorLogPath)!;
        }

        Directory.CreateDirectory(folder);
        Process.Start(new ProcessStartInfo
        {
            FileName = folder,
            UseShellExecute = true,
        });
    }

    private void SetTrayIcon(HealthState state)
    {
        _currentIcon?.Dispose();
        _currentIcon = TrayIconFactory.Create(state);
        _trayIcon.Icon = _currentIcon;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pollTimer.Stop();
            _pollTimer.Dispose();
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _currentIcon?.Dispose();
            _statusForm?.Dispose();
        }

        base.Dispose(disposing);
    }
}
