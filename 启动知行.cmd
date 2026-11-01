@echo off
chcp 65001 >nul
cd /d "%~dp0"
where pwsh >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" (
    "%ProgramFiles%\PowerShell\7\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0platform\start-benchmark.ps1"
  ) else (
    echo 请安装 PowerShell 7 并将 pwsh 加入 PATH，然后重新启动。
  )
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0platform\start-benchmark.ps1"
)
pause
