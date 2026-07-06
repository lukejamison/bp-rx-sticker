@echo off
setlocal EnableExtensions

REM BP RX Print Bridge — Windows installer
REM Run as Administrator (right-click -> Run as administrator)
REM
REM Usage:
REM   install-windows.bat
REM   install-windows.bat 172.18.129.200
REM   install-windows.bat placeholder
REM   install-windows.bat uninstall

cd /d "%~dp0"

echo.
echo BP RX Print Bridge installer
echo Directory: %~dp0
echo.

if /I "%~1"=="uninstall" (
  echo Mode: uninstall
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -Uninstall
  goto :done
)

if not "%~1"=="" (
  if /I "%~1"=="placeholder" (
    echo Mode: install with default placeholder printer IP
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
  ) else (
    echo Mode: install with printer IP %~1
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -PrinterIp "%~1"
  )
) else (
  echo Mode: install ^(interactive prompts for printer IP^)
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
)

:done
if errorlevel 1 (
  echo.
  echo Install failed. See extension\print-bridge\logs\ for details.
  pause
  exit /b 1
)

echo.
pause
