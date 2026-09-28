using BpRx.BridgeMonitor.Models;
using BpRx.BridgeMonitor.Services;

namespace BpRx.BridgeMonitor.Forms;

public sealed class StatusForm : Form
{
    private readonly MonitorCoordinator _coordinator;
    private readonly List<Label> _wrappingLabels = [];
    private readonly TableLayoutPanel _layout;
    private readonly Label _summaryLabel;
    private readonly Label _bridgeLabel;
    private readonly Label _printerLabel;
    private readonly Label _adminLabel;
    private readonly Label _taskLabel;
    private readonly Label _checkedLabel;
    private readonly Label _actionLabel;
    private readonly TextBox _logDirBox = new();
    private readonly TextBox _configPathBox = new();
    private readonly TextBox _webhookBox = new();

    public StatusForm(MonitorCoordinator coordinator, HealthSnapshot? initialHealth)
    {
        _coordinator = coordinator;
        _summaryLabel = WrappingLabel();
        _bridgeLabel = WrappingLabel();
        _printerLabel = WrappingLabel();
        _adminLabel = WrappingLabel(new Font(SystemFonts.DefaultFont, FontStyle.Bold));
        _taskLabel = WrappingLabel();
        _checkedLabel = WrappingLabel(color: Color.Gray);
        _actionLabel = new Label
        {
            AutoSize = true,
            Dock = DockStyle.Bottom,
            ForeColor = Color.DarkGreen,
            Padding = new Padding(16, 6, 16, 6),
        };

        Text = "BP RX Bridge Monitor";
        Width = 680;
        Height = 720;
        MinimumSize = new Size(460, 420);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        MinimizeBox = true;
        ShowInTaskbar = true;
        var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        if (exeIcon is not null) Icon = exeIcon;

        var settings = coordinator.Settings;
        _logDirBox.Text = settings.BridgeLogDirectory;
        _configPathBox.Text = settings.BridgeConfigPath;
        _webhookBox.Text = settings.LogWebhookUrl;

        _layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            AutoScroll = true,
            Padding = new Padding(16),
        };
        _layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddRow(MakeSection("Status"));
        AddRow(_adminLabel);
        AddRow(_summaryLabel);
        AddRow(_bridgeLabel);
        AddRow(_printerLabel);
        AddRow(_taskLabel);
        AddRow(_checkedLabel);
        AddRow(MakeSection("Paths (save after editing)"));
        AddRow(MakeField("Bridge log folder", _logDirBox));
        AddRow(MakeField("Bridge config.local.env", _configPathBox));
        AddRow(MakeField("Log webhook URL", _webhookBox));

        var buttonRow = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            Padding = new Padding(16, 8, 16, 12),
        };

        buttonRow.Controls.Add(MakeButton("Refresh", async (_, _) =>
        {
            var health = await _coordinator.CheckHealthAsync(force: true);
            UpdateHealth(health);
        }));
        buttonRow.Controls.Add(MakeButton("Start bridge", async (_, _) =>
        {
            var (ok, msg) = await _coordinator.StartBridgeAsync();
            SetActionMessage(msg, ok);
            UpdateHealth(await _coordinator.CheckHealthAsync(force: true));
        }));
        buttonRow.Controls.Add(MakeButton("Stop bridge", async (_, _) =>
        {
            var (ok, msg) = await _coordinator.StopBridgeAsync();
            SetActionMessage(msg, ok);
            UpdateHealth(await _coordinator.CheckHealthAsync(force: true));
        }));
        buttonRow.Controls.Add(MakeButton("Restart bridge", async (_, _) =>
        {
            var (ok, msg) = await _coordinator.RestartBridgeAsync();
            SetActionMessage(msg, ok);
            UpdateHealth(await _coordinator.CheckHealthAsync(force: true));
        }));
        buttonRow.Controls.Add(MakeButton("Send logs", async (_, _) =>
        {
            var (ok, msg) = await _coordinator.SendLogsAsync(_lastHealth);
            SetActionMessage(msg, ok);
        }));
        buttonRow.Controls.Add(MakeButton("Save paths", (_, _) => SavePaths()));

        // Dock the bottom bars first (last added is docked first) so the
        // status layout cannot cover the buttons and hide the window contents.
        Controls.Add(_layout);
        Controls.Add(_actionLabel);
        Controls.Add(buttonRow);

        Load += (_, _) => UpdateWrapWidths();
        Resize += (_, _) => UpdateWrapWidths();

        if (initialHealth is not null) UpdateHealth(initialHealth);
        else _summaryLabel.Text = "Checking…";
    }

    private void AddRow(Control control)
    {
        var row = _layout.RowCount++;
        _layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        control.Dock = DockStyle.Fill;
        _layout.Controls.Add(control, 0, row);
    }

    private Label WrappingLabel(Font? font = null, Color? color = null)
    {
        var label = new Label
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 4, 0, 4),
        };
        if (font is not null) label.Font = font;
        if (color is not null) label.ForeColor = color.Value;
        _wrappingLabels.Add(label);
        return label;
    }

    private void UpdateWrapWidths()
    {
        var contentWidth = Math.Max(180, _layout.ClientSize.Width - _layout.Padding.Horizontal);
        foreach (var label in _wrappingLabels)
        {
            if (label.MaximumSize.Width != contentWidth)
                label.MaximumSize = new Size(contentWidth, 0);
        }

        var actionWidth = Math.Max(180, ClientSize.Width - 32);
        if (_actionLabel.MaximumSize.Width != actionWidth)
            _actionLabel.MaximumSize = new Size(actionWidth, 0);
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
        var panel = new TableLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            Margin = new Padding(0, 0, 0, 8),
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        panel.Controls.Add(new Label { Text = label, AutoSize = true, Dock = DockStyle.Fill }, 0, 0);
        input.Dock = DockStyle.Fill;
        input.Margin = new Padding(0, 2, 0, 0);
        panel.Controls.Add(input, 0, 1);
        return panel;
    }

    private static Button MakeButton(string text, EventHandler onClick)
    {
        var button = new Button { Text = text, AutoSize = true, Margin = new Padding(0, 0, 8, 0) };
        button.Click += onClick;
        return button;
    }
}
