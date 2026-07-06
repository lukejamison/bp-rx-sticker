@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo BP RX Bridge Monitor — build
echo Requires .NET 8 SDK: https://dotnet.microsoft.com/download
echo.

where dotnet >nul 2>&1
if errorlevel 1 (
  echo ERROR: dotnet not found on PATH.
  exit /b 1
)

dotnet publish BpRx.BridgeMonitor\BpRx.BridgeMonitor.csproj ^
  -c Release ^
  -r win-x64 ^
  --self-contained false ^
  -p:PublishSingleFile=true ^
  -o publish

if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo.
echo Built: %~dp0publish\BpRx.BridgeMonitor.exe
echo Copy the publish folder to each OneScan PC, or run from repo.
echo.
pause
