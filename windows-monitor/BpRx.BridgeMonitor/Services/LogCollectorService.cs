using System.Text;
using BpRx.BridgeMonitor.Models;

namespace BpRx.BridgeMonitor.Services;

public sealed class LogCollectorService
{
    private readonly string _monitorLogPath;

    public LogCollectorService()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "BpRxBridgeMonitor");
        Directory.CreateDirectory(dir);
        _monitorLogPath = Path.Combine(dir, "monitor.log");
    }

    public string MonitorLogPath => _monitorLogPath;

    public void WriteMonitorLog(string level, string message)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{level}] {message}";
        File.AppendAllText(_monitorLogPath, line + Environment.NewLine, Encoding.UTF8);
    }

    public Dictionary<string, string> CollectLogBundle(MonitorSettings settings)
    {
        var bundle = new Dictionary<string, string>
        {
            ["monitor"] = TailFile(_monitorLogPath, settings.MaxLogBytesPerFile),
        };

        if (!string.IsNullOrWhiteSpace(settings.BridgeLogDirectory) && Directory.Exists(settings.BridgeLogDirectory))
        {
            var today = Path.Combine(settings.BridgeLogDirectory, $"bridge-{DateTime.Now:yyyy-MM-dd}.log");
            if (File.Exists(today))
            {
                bundle["bridgeToday"] = TailFile(today, settings.MaxLogBytesPerFile);
            }

            var installLogs = Directory.GetFiles(settings.BridgeLogDirectory, "install-*.log")
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .Take(2);
            foreach (var file in installLogs)
            {
                bundle[$"install_{Path.GetFileName(file)}"] = TailFile(file, settings.MaxLogBytesPerFile);
            }
        }

        if (!string.IsNullOrWhiteSpace(settings.BridgeConfigPath) && File.Exists(settings.BridgeConfigPath))
        {
            bundle["bridgeConfig"] = File.ReadAllText(settings.BridgeConfigPath, Encoding.UTF8);
        }

        return bundle;
    }

    private static string TailFile(string path, int maxBytes)
    {
        if (!File.Exists(path)) return "(file not found)";

        var info = new FileInfo(path);
        if (info.Length <= maxBytes)
        {
            return File.ReadAllText(path, Encoding.UTF8);
        }

        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        stream.Seek(-maxBytes, SeekOrigin.End);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return "…(truncated)…\n" + reader.ReadToEnd();
    }
}
