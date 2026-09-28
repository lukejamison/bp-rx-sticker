@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo BP RX Bridge Monitor - build
echo Requires .NET 8 SDK: https://dotnet.microsoft.com/download
echo.

where dotnet >nul 2>&1
if errorlevel 1 (
  echo ERROR: dotnet not found on PATH.
  exit /b 1
)

echo Stopping BP RX Bridge Monitor so publish can replace the exe...
schtasks /End /TN "BP-RX-BridgeMonitor" >nul 2>&1
schtasks /Change /TN "BP-RX-BridgeMonitor" /DISABLE >nul 2>&1
taskkill /F /IM BpRx.BridgeMonitor.exe >nul 2>&1
timeout /t 1 /nobreak >nul

dotnet publish BpRx.BridgeMonitor\BpRx.BridgeMonitor.csproj ^
  -c Release ^
  -r win-x64 ^
  --self-contained false ^
  -p:PublishSingleFile=true ^
  -o publish

if errorlevel 1 (
  echo.
  echo Build failed.
  echo If the error says the exe is in use, close BP RX Bridge Monitor
  echo in Task Manager, or run this window as Administrator, then run build.bat again.
  schtasks /Change /TN "BP-RX-BridgeMonitor" /ENABLE >nul 2>&1
  exit /b 1
)

schtasks /Change /TN "BP-RX-BridgeMonitor" /ENABLE >nul 2>&1
schtasks /Run /TN "BP-RX-BridgeMonitor" >nul 2>&1

echo.
echo Built: %~dp0publish\BpRx.BridgeMonitor.exe
echo Copy the publish folder to each OneScan PC, or run from repo.
echo.
pause
