using System.Diagnostics;
using System.Security.Principal;

namespace BpRx.BridgeMonitor.Services;

public static class AdminHelper
{
    public static bool IsRunningAsAdministrator()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    public static string ElevationLabel =>
        IsRunningAsAdministrator() ? "Administrator" : "Standard user (restart may fail)";

    /// <summary>
    /// Re-launch this exe with UAC elevation. Returns false if user declined or launch failed.
    /// </summary>
    public static bool TryRelaunchElevated()
    {
        try
        {
            var exe = Environment.ProcessPath ?? Application.ExecutablePath;
            var start = new ProcessStartInfo
            {
                FileName = exe,
                UseShellExecute = true,
                Verb = "runas",
            };
            Process.Start(start);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
