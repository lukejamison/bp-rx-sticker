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
    private HealthState? _shownIconState;

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
        menu.Items.Add("Refresh now", null, async (_, _) => await RefreshAsync(force: true));
        menu.Items.Add("Start print bridge", null, async (_, _) => await RunBridgeActionAsync(_coordinator.StartBridgeAsync, "Started"));
        menu.Items.Add("Stop print bridge", null, async (_, _) => await RunBridgeActionAsync(_coordinator.StopBridgeAsync, "Stopped"));
        menu.Items.Add("Restart print bridge", null, async (_, _) => await RestartBridgeAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Send logs to IT", null, async (_, _) => await SendLogsAsync());
        menu.Items.Add("Open log folder", null, (_, _) => OpenLogFolder());
        menu.Items.Add(new ToolStripSeparator());
        _updateItem = new ToolStripMenuItem("Check for updates", null, async (_, _) => await OnUpdateClickedAsync());
        menu.Items.Add(_updateItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => ExitThread());
        _trayIcon.ContextMenuStrip = menu;
        _trayIcon.DoubleClick += (_, _) => ShowStatusForm();

        var settings = _coordinator.Settings;
        _pollTimer = new System.Windows.Forms.Timer { Interval = Math.Max(5, settings.PollIntervalSeconds) * 1000 };
        _pollTimer.Tick += async (_, _) => await RefreshAsync();
        _pollTimer.Start();

        // Tray-only startup leaves no taskbar button, and a dead tray icon
        // (see TrayIconFactory) made the whole app look missing. Open the
        // status window so there is always something to click.
        ShowStatusForm();
        _ = RefreshAsync();

        _trayIcon.BalloonTipClicked += async (_, _) =>
        {
            if (_balloonIsUpdate && _pendingUpdate is not null) await PromptInstallAsync();
        };

        // Look for a new release shortly after start, then every 6 hours.
        _updateTimer = new System.Windows.Forms.Timer { Interval = 20_000 };
        _updateTimer.Tick += async (_, _) =>
        {
            _updateTimer.Interval = (int)TimeSpan.FromHours(6).TotalMilliseconds;
            await CheckForUpdatesAsync(manual: false);
        };
        _updateTimer.Start();
    }

    private readonly UpdateService _updater = new();
    private readonly ToolStripMenuItem _updateItem;
    private readonly System.Windows.Forms.Timer _updateTimer;
    private UpdateInfo? _pendingUpdate;
    private bool _balloonIsUpdate;
    private bool _updating;

    private async Task OnUpdateClickedAsync()
    {
        if (_pendingUpdate is not null) await PromptInstallAsync();
        else await CheckForUpdatesAsync(manual: true);
    }

    private async Task CheckForUpdatesAsync(bool manual)
    {
        if (_updating) return;
        try
        {
            var info = await _updater.CheckAsync();
            _pendingUpdate = info;
            if (info is null)
            {
                _updateItem.Text = "Check for updates";
                _statusForm?.SetUpdateAvailable(null);
                if (manual) ShowBalloon($"Up to date (v{UpdateService.CurrentVersionText}).", ToolTipIcon.Info, false);
                return;
            }

            _coordinator.Logs.WriteMonitorLog("INFO", $"Update available: {info.Tag}");
            _updateItem.Text = $"Install update v{info.Version.ToString(3)}…";
            _statusForm?.SetUpdateAvailable(info);
            ShowBalloon($"Version {info.Version.ToString(3)} is available. Click to install.", ToolTipIcon.Info, true);
            if (manual) await PromptInstallAsync();
        }
        catch (Exception ex)
        {
            _coordinator.Logs.WriteMonitorLog("WARN", $"Update check failed: {ex.Message}");
            if (manual) ShowBalloon($"Update check failed: {ex.Message}", ToolTipIcon.Error, false);
        }
    }

    public async Task PromptInstallAsync()
    {
        var info = _pendingUpdate;
        if (info is null || _updating) return;

        var answer = MessageBox.Show(
            $"Version {info.Version.ToString(3)} is available (you have {UpdateService.CurrentVersionText}).\n\n" +
            "The monitor will restart and the print bridge will restart briefly. " +
            "If the Chrome extension changed, reload it at chrome://extensions afterwards.\n\nInstall now?",
            "BP RX update", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (answer != DialogResult.Yes) return;

        _updating = true;
        try
        {
            ShowBalloon("Downloading update…", ToolTipIcon.Info, false);
            _statusForm?.SetActionMessage("Downloading update…", true);
            await _updater.InstallAsync(info);
            _coordinator.Logs.WriteMonitorLog("INFO", $"Update {info.Tag} downloaded; restarting to apply");
            ExitThread();
        }
        catch (Exception ex)
        {
            _updating = false;
            _coordinator.Logs.WriteMonitorLog("ERROR", $"Update failed: {ex.Message}");
            ShowBalloon($"Update failed: {ex.Message}", ToolTipIcon.Error, false);
            _statusForm?.SetActionMessage($"Update failed: {ex.Message}", false);
        }
    }

    private void ShowBalloon(string text, ToolTipIcon icon, bool isUpdate)
    {
        _balloonIsUpdate = isUpdate;
        _trayIcon.ShowBalloonTip(6000, "BP RX", text, icon);
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

        _statusForm = new StatusForm(_coordinator, _lastHealth)
        {
            UpdateAction = OnUpdateClickedAsync,
            OpenLogsAction = OpenLogFolder,
        };
        _statusForm.SetUpdateAvailable(_pendingUpdate);
        _statusForm.FormClosed += (_, _) => _statusForm = null;
        _statusForm.Show();
    }

    private async Task RefreshAsync(bool force = false)
    {
        try
        {
            var previous = _lastHealth?.State;
            var health = await _coordinator.CheckHealthAsync(force: force);
            _lastHealth = health;
            SetTrayIcon(health.State);
            _trayIcon.Text = TruncateTrayText($"BP RX — {health.Summary}");
            _statusForm?.UpdateHealth(health);

            if (previous is not null && previous != HealthState.Unhealthy && health.State == HealthState.Unhealthy)
            {
                _trayIcon.ShowBalloonTip(5000, "BP RX", health.Summary, ToolTipIcon.Error);
            }
        }
        catch (Exception ex)
        {
            _coordinator.Logs.WriteMonitorLog("ERROR", $"Refresh failed: {ex.Message}");
        }
    }

    private static string TruncateTrayText(string text)
    {
        return text.Length <= 63 ? text : text[..60] + "...";
    }

    private async Task RunBridgeActionAsync(Func<CancellationToken, Task<(bool Ok, string Message)>> action, string verb)
    {
        _trayIcon.ShowBalloonTip(3000, "BP RX", $"{verb} print bridge…", ToolTipIcon.Info);
        var (ok, message) = await action(CancellationToken.None);
        _coordinator.Logs.WriteMonitorLog(ok ? "INFO" : "ERROR", $"{verb} bridge: {message}");
        _trayIcon.ShowBalloonTip(5000, "BP RX", message, ok ? ToolTipIcon.Info : ToolTipIcon.Error);
        await Task.Delay(1500);
        await RefreshAsync(force: true);
    }

    private async Task RestartBridgeAsync()
    {
        _trayIcon.ShowBalloonTip(3000, "BP RX", "Restarting print bridge…", ToolTipIcon.Info);
        var (ok, message) = await _coordinator.RestartBridgeAsync();
        _coordinator.Logs.WriteMonitorLog(ok ? "INFO" : "ERROR", $"Restart bridge: {message}");
        _trayIcon.ShowBalloonTip(5000, "BP RX", message, ok ? ToolTipIcon.Info : ToolTipIcon.Error);
        await Task.Delay(2000);
        await RefreshAsync(force: true);
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
        if (_shownIconState == state && _currentIcon is not null) return;

        var next = TrayIconFactory.Create(state);
        var previous = _currentIcon;
        _currentIcon = next;
        _shownIconState = state;
        _trayIcon.Icon = next;
        _trayIcon.Visible = true;
        previous?.Dispose();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pollTimer.Stop();
            _pollTimer.Dispose();
            _updateTimer.Dispose();
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _currentIcon?.Dispose();
            _statusForm?.Dispose();
        }

        base.Dispose(disposing);
    }
}
