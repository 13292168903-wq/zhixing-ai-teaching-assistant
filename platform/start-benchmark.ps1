param([int]$Port=4180)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'start-workspace.ps1') -Port $Port -CheckOnly
if($LASTEXITCODE){throw '启动自检失败'}
if(-not $env:LONGCAT_API_KEY){$env:LONGCAT_API_KEY=[Environment]::GetEnvironmentVariable('LONGCAT_API_KEY','User')}
if($env:LONGCAT_API_KEY){$env:TUTOR_ENABLE_REAL_MODEL='1';$env:TUTOR_PROVIDER='longcat';$env:TUTOR_MODEL_ID='LongCat-2.0'}else{$env:TUTOR_ENABLE_REAL_MODEL='0';Write-Host '未配置 LongCat 环境密钥：可运行离线检查；真实模型模式会明确拒绝。'}
$env:PORT=[string]$Port
& (Get-Command node -ErrorAction Stop).Source (Join-Path $PSScriptRoot 'scripts/serve-workspace.mjs')
