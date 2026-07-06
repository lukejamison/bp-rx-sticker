@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo BP RX Bridge Monitor installer
echo Run as Administrator
echo.

if /I "%~1"=="uninstall" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-monitor.ps1" -Uninstall
  goto :done
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-monitor.ps1" %*

:done
if errorlevel 1 (
  echo Install failed. Run build.bat first, then retry as Admin.
  pause
  exit /b 1
)
pause
