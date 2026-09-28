using System.Runtime.InteropServices;

namespace BpRx.BridgeMonitor;

internal static class TrayIconFactory
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr handle);

    public static Icon Create(Models.HealthState state)
    {
        var color = state switch
        {
            Models.HealthState.Healthy => Color.FromArgb(22, 163, 74),
            Models.HealthState.Degraded => Color.FromArgb(217, 119, 6),
            Models.HealthState.Unhealthy => Color.FromArgb(220, 38, 38),
            _ => Color.FromArgb(100, 116, 139),
        };

        // Own a real icon copy. Icon.FromHandle() only borrows the bitmap's
        // handle; disposing that bitmap (or the temporary icon) deletes the
        // picture Windows is showing, and the tray icon vanishes.
        using var bitmap = new Bitmap(32, 32);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.Clear(Color.Transparent);
            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var brush = new SolidBrush(color);
            graphics.FillEllipse(brush, 2, 2, 28, 28);
        }

        var raw = bitmap.GetHicon();
        try
        {
            using var borrowed = Icon.FromHandle(raw);
            return (Icon)borrowed.Clone();
        }
        finally
        {
            DestroyIcon(raw);
        }
    }
}
