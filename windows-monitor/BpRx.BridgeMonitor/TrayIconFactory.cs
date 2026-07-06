namespace BpRx.BridgeMonitor;

internal static class TrayIconFactory
{
    public static Icon Create(Models.HealthState state)
    {
        var color = state switch
        {
            Models.HealthState.Healthy => Color.FromArgb(22, 163, 74),
            Models.HealthState.Degraded => Color.FromArgb(217, 119, 6),
            Models.HealthState.Unhealthy => Color.FromArgb(220, 38, 38),
            _ => Color.FromArgb(100, 116, 139),
        };

        using var bitmap = new Bitmap(16, 16);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Transparent);
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        using var brush = new SolidBrush(color);
        graphics.FillEllipse(brush, 2, 2, 12, 12);
        return Icon.FromHandle(bitmap.GetHicon());
    }
}
