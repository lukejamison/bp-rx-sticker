@echo off
REM BP RX Sticker — workstation cleanup (report or apply fixes)
REM   cleanup-windows.bat           Report only (safe)
REM   cleanup-windows.bat apply     Kill orphan bridge node processes
REM   cleanup-windows.bat apply remove-dupes  Also remove older duplicate repo folders

cd /d "%~dp0"

if /I "%~1"=="apply" (
  if /I "%~2"=="remove-dupes" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cleanup-windows.ps1" -Apply -RemoveDuplicateRepos
  ) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cleanup-windows.ps1" -Apply
  )
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cleanup-windows.ps1"
)

pause
