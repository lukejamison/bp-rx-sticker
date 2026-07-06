using BpRx.BridgeMonitor.Models;
using BpRx.BridgeMonitor.Services;

namespace BpRx.BridgeMonitor.Forms;

public sealed class StatusForm : Form
{
    private readonly MonitorCoordinator _coordinator;
    private readonly Label _summaryLabel = new() { AutoSize = false, Height = 40, Dock = DockStyle.Top };
    private readonly Label _bridgeLabel = new() { AutoSize = true, Dock = DockStyle.Top, Padding = new Padding(0, 8, 0, 0) };
    private readonly Label _printerLabel = new() { AutoSize = true, Dock = DockStyle.Top };
    private readonly Label _adminLabel = new() { AutoSize = true, Dock = DockStyle.Top, Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold) };
    private readonly Label _taskLabel = new() { AutoSize = true, Dock = DockStyle.Top };
    private readonly Label _checkedLabel = new() { AutoSize = true, Dock = DockStyle.Top, ForeColor = Color.Gray };
    private readonly Label _actionLabel = new() { AutoSize = false, Height = 36, Dock = DockStyle.Bottom, ForeColor = Color.DarkGreen };
    private readonly TextBox _logDirBox = new() { Dock = DockStyle.Top };
    private readonly TextBox _configPathBox = new() { Dock = DockStyle.Top };
    private readonly TextBox _webhookBox = new() { Dock = DockStyle.Top };

    public StatusForm(MonitorCoordinator coordinator, HealthSnapshot? initialHealth)
    {
        _coordinator = coordinator;
        Text = "BP RX Bridge Monitor";
        Width = 540;
        Height = 520;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        ShowInTaskbar = true;

        var settings = coordinator.Settings;
        _logDirBox.Text = settings.BridgeLogDirectory;
        _configPathBox.Text = settings.BridgeConfigPath;
        _webhookBox.Text = settings.LogWebhookUrl;

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 12,
            Padding = new Padding(16),
        };

        layout.Controls.Add(MakeSection("Status"));
        layout.Controls.Add(_adminLabel);
        layout.Controls.Add(_summaryLabel);
        layout.Controls.Add(_bridgeLabel);
        layout.Controls.Add(_printerLabel);
        layout.Controls.Add(_taskLabel);
        layout.Controls.Add(_checkedLabel);
        layout.Controls.Add(MakeSection("Paths (save after editing)"));
        layout.Controls.Add(MakeField("Bridge log folder", _logDirBox));
        layout.Controls.Add(MakeField("Bridge config.local.env", _configPathBox));
        layout.Controls.Add(MakeField("Log webhook URL", _webhookBox));

        var buttonRow = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 80,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            Padding = new Padding(16, 0, 16, 12),
        };

        buttonRow.Controls.Add(MakeButton("Refresh", async (_, _) =>
        {
            var health = await _coordinator.CheckHealthAsync();
            UpdateHealth(health);
        }));
        buttonRow.Controls.Add(MakeButton("Start bridge", async (_, _) =>
        {
            var (ok, msg) = await _coordinator.StartBridgeAsync();
            SetActionMessage(msg, ok);
            UpdateHealth(await _coordinator.CheckHealthAsync());
        }));
        buttonRow.Controls.Add(MakeButton("Stop bridge", async (_, _) =>
        {
            var (ok, msg) = await _coordinator.StopBridgeAsync();
            SetActionMessage(msg, ok);
            UpdateHealth(await _coordinator.CheckHealthAsync());
        }));
        buttonRow.Controls.Add(MakeButton("Restart bridge", async (_, _) =>
        {
            var (ok, msg) = await _coordinator.RestartBridgeAsync();
            SetActionMessage(msg, ok);
            UpdateHealth(await _coordinator.CheckHealthAsync());
        }));
        buttonRow.Controls.Add(MakeButton("Send logs", async (_, _) =>
        {
            var (ok, msg) = await _coordinator.SendLogsAsync(_lastHealth);
            SetActionMessage(msg, ok);
        }));
        buttonRow.Controls.Add(MakeButton("Save paths", (_, _) => SavePaths()));

        Controls.Add(_actionLabel);
        Controls.Add(buttonRow);
        Controls.Add(layout);

        if (initialHealth is not null) UpdateHealth(initialHealth);
        else _summaryLabel.Text = "Checking…";
    }

    private HealthSnapshot? _lastHealth;

    public void UpdateHealth(HealthSnapshot health)
    {
        _lastHealth = health;
        _summaryLabel.Text = health.Summary;
        _summaryLabel.ForeColor = health.State switch
        {
            HealthState.Healthy => Color.FromArgb(22, 101, 52),
            HealthState.Degraded => Color.FromArgb(146, 64, 14),
            HealthState.Unhealthy => Color.FromArgb(153, 27, 27),
            _ => Color.Black,
        };

        _adminLabel.Text = health.IsElevated
            ? "Running as Administrator — bridge controls enabled"
            : "Not elevated — restart/start/stop may fail (re-launch as Admin)";
        _adminLabel.ForeColor = health.IsElevated
            ? Color.FromArgb(22, 101, 52)
            : Color.FromArgb(153, 27, 27);

        _bridgeLabel.Text = health.BridgeOk
            ? $"✓ Print bridge OK (HTTP {health.BridgeHttpStatus})"
            : $"✗ Print bridge: {health.BridgeError ?? "unreachable"}";

        _printerLabel.Text = health.PrinterReachable
            ? $"✓ Printer {health.PrinterIp}:{health.PrinterPort}"
            : $"✗ Printer {health.PrinterIp}:{health.PrinterPort} — {health.PrinterError ?? "unreachable"}";

        var taskParts = new List<string>();
        if (health.ScheduledTaskState is not null) taskParts.Add(health.ScheduledTaskState);
        if (health.ScheduledTaskLastResult is not null) taskParts.Add($"last result {health.ScheduledTaskLastResult}");
        if (health.ScheduledTaskLastRun is not null) taskParts.Add($"last run {health.ScheduledTaskLastRun.Value:g}");

        _taskLabel.Text = taskParts.Count > 0
            ? $"Scheduled task ({_coordinator.Settings.ScheduledTaskName}): {string.Join(" · ", taskParts)}" +
              (health.ScheduledTaskError is not null ? $" — {health.ScheduledTaskError}" : "")
            : $"Scheduled task: unknown{(health.ScheduledTaskError is not null ? $" ({health.ScheduledTaskError})" : "")}";

        _checkedLabel.Text = $"Last checked {health.CheckedAt.LocalDateTime:T}";
    }

    public void SetActionMessage(string message, bool ok)
    {
        _actionLabel.Text = message;
        _actionLabel.ForeColor = ok ? Color.DarkGreen : Color.DarkRed;
    }

    private void SavePaths()
    {
        var settings = _coordinator.Settings;
        settings.BridgeLogDirectory = _logDirBox.Text.Trim();
        settings.BridgeConfigPath = _configPathBox.Text.Trim();
        settings.LogWebhookUrl = _webhookBox.Text.Trim();
        _coordinator.SaveSettings(settings);
        SetActionMessage("Settings saved", true);
    }

    private static Label MakeSection(string text) =>
        new() { Text = text, Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold), AutoSize = true, Margin = new Padding(0, 12, 0, 4) };

    private static Control MakeField(string label, Control input)
    {
        var panel = new Panel { Height = 56, Dock = DockStyle.Top };
        panel.Controls.Add(new Label { Text = label, Dock = DockStyle.Top, Height = 18 });
        input.Dock = DockStyle.Top;
        panel.Controls.Add(input);
        return panel;
    }

    private static Button MakeButton(string text, EventHandler onClick)
    {
        var button = new Button { Text = text, AutoSize = true, Margin = new Padding(0, 0, 8, 0) };
        button.Click += onClick;
        return button;
    }
}
