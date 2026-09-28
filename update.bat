@echo off
setlocal EnableExtensions

rem This file lives in the repo root (the folder that contains windows-monitor).
set "ROOT=%~dp0"
if exist "%ROOT%windows-monitor\BpRx.BridgeMonitor\BpRx.BridgeMonitor.csproj" goto :found

echo.
echo This is not the BP RX sticker folder.
echo.
echo Keep update.bat in the folder you git pull into
echo ^(the one that contains windows-monitor^), then run it from there.
echo.
echo Script folder: %~dp0
echo Current folder: %CD%
echo.
pause
exit /b 1

:found
cd /d "%ROOT%"

echo.
echo BP RX Bridge Monitor update
echo Folder: %CD%
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator permission...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $env:ComSpec -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
  exit /b 0
)

where dotnet >nul 2>&1
if errorlevel 1 (
  echo ERROR: dotnet was not found on PATH.
  echo Install the .NET 8 SDK, then run update.bat again.
  echo.
  pause
  exit /b 1
)

echo Stopping BP-RX-BridgeMonitor...
schtasks /End /TN "BP-RX-BridgeMonitor"
schtasks /Change /TN "BP-RX-BridgeMonitor" /DISABLE
echo Closing BpRx.BridgeMonitor.exe...
taskkill /F /IM BpRx.BridgeMonitor.exe
timeout /t 1 /nobreak >nul

echo.
echo Building...
dotnet publish "%ROOT%windows-monitor\BpRx.BridgeMonitor\BpRx.BridgeMonitor.csproj" ^
  -c Release ^
  -r win-x64 ^
  --self-contained false ^
  -p:PublishSingleFile=true ^
  -o "%ROOT%windows-monitor\publish"

if errorlevel 1 (
  echo.
  echo Build failed. Turning the monitor task back on.
  schtasks /Change /TN "BP-RX-BridgeMonitor" /ENABLE
  echo.
  echo If the error says the exe is in use, end BP RX Bridge Monitor
  echo in Task Manager, then run update.bat again.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting BP-RX-BridgeMonitor...
schtasks /Change /TN "BP-RX-BridgeMonitor" /ENABLE
schtasks /Run /TN "BP-RX-BridgeMonitor"
if errorlevel 1 (
  echo.
  echo The exe built, but the scheduled task did not start.
  echo If this PC is not set up yet, run windows-monitor\install-monitor.bat as Administrator.
  echo Exe: %ROOT%windows-monitor\publish\BpRx.BridgeMonitor.exe
  echo.
  pause
  exit /b 1
)

echo.
echo Update finished.
echo Exe: %ROOT%windows-monitor\publish\BpRx.BridgeMonitor.exe
echo.
pause
