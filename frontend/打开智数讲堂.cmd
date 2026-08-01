@echo off
setlocal
chcp 65001 >nul

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-site.ps1"

if errorlevel 1 (
  echo.
  echo Failed to open the site.
  pause
)

endlocal
