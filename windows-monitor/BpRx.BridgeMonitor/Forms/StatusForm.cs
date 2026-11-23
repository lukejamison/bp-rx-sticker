using BpRx.BridgeMonitor.Models;
using BpRx.BridgeMonitor.Services;

namespace BpRx.BridgeMonitor.Forms;

public sealed class StatusForm : Form
{
    private enum Level { Ok, Warn, Bad, Unknown }

    private static readonly Color Slate = Color.FromArgb(100, 116, 139);
    private static readonly Color Green = Color.FromArgb(22, 163, 74);
    private static readonly Color Amber = Color.FromArgb(217, 119, 6);
    private static readonly Color Red = Color.FromArgb(220, 38, 38);
    private static readonly Color Blue = Color.FromArgb(37, 99, 235);
    private static readonly Color PageBack = Color.FromArgb(244, 246, 248);
    private static readonly Color CardBorder = Color.FromArgb(226, 232, 240);
    private static readonly Color TextMuted = Color.FromArgb(100, 116, 139);

    private readonly MonitorCoordinator _coordinator;
    private HealthSnapshot? _lastHealth;
    private UpdateInfo? _pendingUpdate;

    // Header
    private readonly Panel _header = new();
    private readonly Label _headerTitle = new();
    private readonly Label _headerSub = new();
    private readonly Label _headerVersion = new();

    // Update banner
    private readonly Panel _updateBanner = new();
    private readonly Label _updateText = new();
    private readonly Button _updateInstallButton;

    // Status rows
    private readonly StatusRow _bridgeRow = new("Print bridge");
    private readonly StatusRow _printerRow = new("Zebra printer");
    private readonly StatusRow _taskRow = new("Bridge task");
    private readonly StatusRow _adminRow = new("Permissions");

    // Settings
    private readonly Panel _settingsCard = new();
    private readonly Button _settingsToggle;
    private readonly TextBox _logDirBox = new();
    private readonly TextBox _configPathBox = new();
    private readonly TextBox _webhookBox = new();

    private readonly Label _message = new();
    private readonly List<Button> _actionButtons = [];

    /// <summary>Invoked by the update controls (check, or install when one is pending).</summary>
    public Func<Task>? UpdateAction { get; init; }

    /// <summary>Opens the log folder (owned by the tray context).</summary>
    public Action? OpenLogsAction { get; init; }

    public StatusForm(MonitorCoordinator coordinator, HealthSnapshot? initialHealth)
    {
        _coordinator = coordinator;

        Text = $"BP RX Bridge Monitor v{UpdateService.CurrentVersionText}";
        Font = new Font("Segoe UI", 9.5f);
        AutoScaleMode = AutoScaleMode.Dpi;
        BackColor = PageBack;
        ClientSize = new Size(620, 640);
        MinimumSize = new Size(520, 520);
        StartPosition = FormStartPosition.CenterScreen;
        var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        if (exeIcon is not null) Icon = exeIcon;

        var settings = coordinator.Settings;
        _logDirBox.Text = settings.BridgeLogDirectory;
        _configPathBox.Text = settings.BridgeConfigPath;
        _webhookBox.Text = settings.LogWebhookUrl;

        BuildHeader();
        _updateInstallButton = MakeButton("Install", primary: true, async () =>
        {
            if (UpdateAction is not null) await UpdateAction();
        });
        BuildUpdateBanner();
        _settingsToggle = MakeButton("Settings", primary: false, () =>
        {
            _settingsCard.Visible = !_settingsCard.Visible;
            _settingsToggle.Text = _settingsCard.Visible ? "Hide settings" : "Settings";
        });
        BuildSettingsCard();

        var body = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            AutoScroll = true,
            Padding = new Padding(16, 12, 16, 8),
            BackColor = PageBack,
        };
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        AddBodyRow(body, MakeCard(_bridgeRow, _printerRow, _taskRow, _adminRow));
        AddBodyRow(body, BuildActions());
        AddBodyRow(body, _settingsToggle);
        AddBodyRow(body, _settingsCard);

        _message.Dock = DockStyle.Bottom;
        _message.AutoSize = false;
        _message.Height = 34;
        _message.TextAlign = ContentAlignment.MiddleLeft;
        _message.Padding = new Padding(16, 0, 16, 0);
        _message.ForeColor = TextMuted;
        _message.BackColor = Color.White;

        // Last added is docked first: body fills what's left of the bars.
        Controls.Add(body);
        Controls.Add(_message);
        Controls.Add(_updateBanner);
        Controls.Add(_header);

        SetUpdateAvailable(null);
        if (initialHealth is not null) UpdateHealth(initialHealth);
        else ApplyHeader(Level.Unknown, "Checking…", "");
    }

    // ---------- public API ----------

    public void UpdateHealth(HealthSnapshot health)
    {
        _lastHealth = health;

        var headerLevel = health.State switch
        {
            HealthState.Healthy => Level.Ok,
            HealthState.Degraded => Level.Warn,
            HealthState.Unhealthy => Level.Bad,
            _ => Level.Unknown,
        };
        ApplyHeader(headerLevel, health.Summary, $"Last checked {health.CheckedAt.LocalDateTime:T}");

        _bridgeRow.Set(
            health.BridgeOk ? Level.Ok : Level.Bad,
            health.BridgeOk ? $"Running (HTTP {health.BridgeHttpStatus})" : health.BridgeError ?? "Not reachable");

        var printerName = string.IsNullOrWhiteSpace(health.PrinterIp) ? "Printer" : $"{health.PrinterIp}:{health.PrinterPort}";
        _printerRow.Set(
            health.PrinterReachable ? Level.Ok : (health.BridgeOk ? Level.Warn : Level.Unknown),
            health.PrinterReachable ? $"{printerName} reachable" : $"{printerName} — {health.PrinterError ?? "not reachable"}");

        var taskBits = new List<string>();
        if (health.ScheduledTaskState is not null) taskBits.Add(health.ScheduledTaskState);
        if (health.ScheduledTaskLastRun is not null) taskBits.Add($"last run {health.ScheduledTaskLastRun.Value:g}");
        if (health.ScheduledTaskLastResult is not null) taskBits.Add($"result {health.ScheduledTaskLastResult}");
        if (health.ScheduledTaskError is not null) taskBits.Add(health.ScheduledTaskError);
        var taskLevel = health.ScheduledTaskState switch
        {
            "Running" or "Ready" => Level.Ok,
            "MISSING" => Level.Bad,
            null => Level.Unknown,
            _ => Level.Warn,
        };
        _taskRow.Set(taskLevel, taskBits.Count > 0 ? string.Join(" · ", taskBits) : "Unknown");

        _adminRow.Set(
            health.IsElevated ? Level.Ok : Level.Bad,
            health.IsElevated ? "Administrator — bridge controls enabled" : "Not elevated — start/stop/restart may fail. Re-launch as Administrator.");
    }

    public void SetActionMessage(string message, bool ok)
    {
        _message.Text = message;
        _message.ForeColor = ok ? Color.FromArgb(21, 128, 61) : Color.FromArgb(185, 28, 28);
    }

    public void SetUpdateAvailable(UpdateInfo? info)
    {
        _pendingUpdate = info;
        _headerVersion.Text = $"v{UpdateService.CurrentVersionText}";
        _updateBanner.Visible = info is not null;
        if (info is not null)
        {
            _updateText.Text = $"Version {info.Version.ToString(3)} is available.";
            _updateInstallButton.Text = $"Install v{info.Version.ToString(3)}";
        }

        Text = info is null
            ? $"BP RX Bridge Monitor v{UpdateService.CurrentVersionText}"
            : $"BP RX Bridge Monitor v{UpdateService.CurrentVersionText} — update available";
    }

    // ---------- building ----------

    private void BuildHeader()
    {
        _header.Dock = DockStyle.Top;
        _header.Height = 92;
        _header.Padding = new Padding(20, 14, 20, 12);

        _headerTitle.Font = new Font("Segoe UI Semibold", 18f);
        _headerTitle.ForeColor = Color.White;
        _headerTitle.AutoSize = true;
        _headerTitle.Location = new Point(20, 12);

        _headerSub.ForeColor = Color.White;
        _headerSub.AutoSize = true;
        _headerSub.Location = new Point(22, 54);

        _headerVersion.ForeColor = Color.White;
        _headerVersion.AutoSize = true;
        _headerVersion.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _headerVersion.Location = new Point(ClientSize.Width - 80, 16);

        _header.Controls.AddRange([_headerTitle, _headerSub, _headerVersion]);
    }

    private void ApplyHeader(Level level, string title, string sub)
    {
        _header.BackColor = ColorFor(level);
        _headerTitle.BackColor = _header.BackColor;
        _headerSub.BackColor = _header.BackColor;
        _headerVersion.BackColor = _header.BackColor;
        _headerTitle.Text = title;
        _headerSub.Text = sub;
    }

    private void BuildUpdateBanner()
    {
        _updateBanner.Dock = DockStyle.Top;
        _updateBanner.Height = 48;
        _updateBanner.BackColor = Color.FromArgb(219, 234, 254);
        _updateBanner.Visible = false;

        _updateText.AutoSize = true;
        _updateText.ForeColor = Color.FromArgb(30, 64, 175);
        _updateText.Font = new Font("Segoe UI Semibold", 9.5f);
        _updateText.Location = new Point(20, 14);

        _updateInstallButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _updateInstallButton.Location = new Point(ClientSize.Width - 160, 7);
        _updateBanner.Controls.AddRange([_updateText, _updateInstallButton]);
    }

    private Control BuildActions()
    {
        var flow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            WrapContents = true,
            Margin = new Padding(0, 4, 0, 4),
            BackColor = PageBack,
        };

        flow.Controls.Add(ActionButton("Restart bridge", primary: true, () => _coordinator.RestartBridgeAsync()));
        flow.Controls.Add(ActionButton("Start", primary: false, () => _coordinator.StartBridgeAsync()));
        flow.Controls.Add(ActionButton("Stop", primary: false, () => _coordinator.StopBridgeAsync()));
        flow.Controls.Add(ActionButton("Refresh", primary: false, async () =>
        {
            await Task.CompletedTask;
            return (true, "Refreshed");
        }));
        flow.Controls.Add(ActionButton("Send logs to IT", primary: false, () => _coordinator.SendLogsAsync(_lastHealth)));
        flow.Controls.Add(MakeButton("Open logs", primary: false, () => OpenLogsAction?.Invoke()));
        flow.Controls.Add(MakeButton("Check for updates", primary: false, async () =>
        {
            if (UpdateAction is not null) await UpdateAction();
        }));
        return flow;
    }

    private void BuildSettingsCard()
    {
        _settingsCard.Visible = false;
        _settingsCard.AutoSize = true;
        _settingsCard.BackColor = Color.White;
        _settingsCard.Padding = new Padding(14, 10, 14, 12);
        _settingsCard.Dock = DockStyle.Fill;
        _settingsCard.Paint += PaintBorder;

        var table = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            ColumnCount = 1,
            BackColor = Color.White,
        };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        AddField(table, "Bridge log folder", _logDirBox);
        AddField(table, "Bridge config.local.env", _configPathBox);
        AddField(table, "Log webhook URL", _webhookBox);
        var save = MakeButton("Save settings", primary: true, SaveSettings);
        save.Margin = new Padding(0, 6, 0, 0);
        table.Controls.Add(save);
        _settingsCard.Controls.Add(table);
    }

    private static void AddField(TableLayoutPanel table, string label, TextBox box)
    {
        table.Controls.Add(new Label { Text = label, AutoSize = true, ForeColor = TextMuted, Margin = new Padding(0, 6, 0, 2) });
        box.Dock = DockStyle.Fill;
        box.BorderStyle = BorderStyle.FixedSingle;
        table.Controls.Add(box);
    }

    private static void AddBodyRow(TableLayoutPanel body, Control control)
    {
        var row = body.RowCount++;
        body.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        control.Dock = DockStyle.Fill;
        if (control is Button) control.Dock = DockStyle.None;
        body.Controls.Add(control, 0, row);
    }

    private static Control MakeCard(params StatusRow[] rows)
    {
        var card = new TableLayoutPanel
        {
            AutoSize = true,
            ColumnCount = 1,
            BackColor = Color.White,
            Margin = new Padding(0, 0, 0, 8),
            Padding = new Padding(1),
        };
        card.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var row in rows)
        {
            row.Dock = DockStyle.Fill;
            card.Controls.Add(row);
        }

        card.Paint += PaintBorder;
        return card;
    }

    private static void PaintBorder(object? sender, PaintEventArgs e)
    {
        if (sender is not Control c) return;
        using var pen = new Pen(CardBorder);
        e.Graphics.DrawRectangle(pen, 0, 0, c.Width - 1, c.Height - 1);
    }

    // ---------- actions ----------

    private Button ActionButton(string text, bool primary, Func<Task<(bool Ok, string Message)>> action)
    {
        var button = MakeButton(text, primary, async () =>
        {
            foreach (var b in _actionButtons) b.Enabled = false;
            try
            {
                SetActionMessage($"{text}…", true);
                var (ok, msg) = await action();
                SetActionMessage(msg, ok);
                UpdateHealth(await _coordinator.CheckHealthAsync(force: true));
            }
            catch (Exception ex)
            {
                SetActionMessage(ex.Message, false);
            }
            finally
            {
                foreach (var b in _actionButtons) b.Enabled = true;
            }
        });
        _actionButtons.Add(button);
        return button;
    }

    private void SaveSettings()
    {
        var settings = _coordinator.Settings;
        settings.BridgeLogDirectory = _logDirBox.Text.Trim();
        settings.BridgeConfigPath = _configPathBox.Text.Trim();
        settings.LogWebhookUrl = _webhookBox.Text.Trim();
        _coordinator.SaveSettings(settings);
        SetActionMessage("Settings saved", true);
    }

    private static Button MakeButton(string text, bool primary, Func<Task> onClick)
    {
        var button = MakeButton(text, primary, () => { });
        button.Click += async (_, _) => await onClick();
        return button;
    }

    private static Button MakeButton(string text, bool primary, Action onClick)
    {
        var button = new Button
        {
            Text = text,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            MinimumSize = new Size(90, 34),
            Padding = new Padding(10, 0, 10, 0),
            Margin = new Padding(0, 0, 8, 8),
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand,
            UseVisualStyleBackColor = false,
            BackColor = primary ? Blue : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(30, 41, 59),
        };
        button.FlatAppearance.BorderColor = primary ? Blue : CardBorder;
        button.Click += (_, _) => onClick();
        return button;
    }

    private static Color ColorFor(Level level) => level switch
    {
        Level.Ok => Green,
        Level.Warn => Amber,
        Level.Bad => Red,
        _ => Slate,
    };

    // ---------- a single "dot + name + detail" line ----------

    private sealed class StatusRow : TableLayoutPanel
    {
        private readonly Label _dot = new()
        {
            Text = "●",
            Font = new Font("Segoe UI", 14f),
            AutoSize = false,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
        };

        private readonly Label _detail = new()
        {
            AutoSize = false,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.FromArgb(51, 65, 85),
        };

        public StatusRow(string name)
        {
            ColumnCount = 3;
            RowCount = 1;
            Height = 50;
            Margin = new Padding(0);
            BackColor = Color.White;
            ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 40));
            ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));
            ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            var title = new Label
            {
                Text = name,
                Font = new Font("Segoe UI Semibold", 9.5f),
                AutoSize = false,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
            };
            Controls.Add(_dot, 0, 0);
            Controls.Add(title, 1, 0);
            Controls.Add(_detail, 2, 0);
            Set(Level.Unknown, "Checking…");
        }

        public void Set(Level level, string detail)
        {
            _dot.ForeColor = ColorFor(level);
            _detail.Text = detail;
        }
    }
}
