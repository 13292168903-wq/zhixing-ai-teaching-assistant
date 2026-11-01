param([int]$Port=4180,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$nodeBinary=(Get-Command node -ErrorAction Stop).Source
if([int](& $nodeBinary -p "process.versions.node.split('.')[0]") -lt 24){throw '需要 Node.js 24 或更高版本，请安装后重新启动。'}
$projectRoot=Split-Path $PSScriptRoot -Parent
$runtime=Join-Path $PSScriptRoot 'runtime/dsh'
$runtimeArchive=Join-Path $projectRoot '知行_v0.8_DSH运行依赖.zip'
if(!(Test-Path (Join-Path $runtime 'runtime-links.json')) -and (Test-Path $runtimeArchive)){
 Write-Host '首次启动：正在还原随包提供的 DS-H 运行依赖…'
 Expand-Archive -LiteralPath $runtimeArchive -DestinationPath $projectRoot -Force
}
if(Test-Path (Join-Path $runtime 'runtime-links.json')){
 & $nodeBinary (Join-Path $PSScriptRoot 'scripts/restore-runtime-links.mjs')
 if($LASTEXITCODE){throw '运行依赖还原失败'}
 $env:HARNESS_ROOT=$runtime
}
& $nodeBinary (Join-Path $PSScriptRoot 'scripts/preflight-v08.mjs') --verify
if($LASTEXITCODE){throw '环境检查未通过。请按 README 安装 Python 解析依赖。'}
if($CheckOnly){exit 0}
$env:PORT=[string]$Port
$env:TUTOR_ENABLE_REAL_MODEL='0'
& $nodeBinary (Join-Path $PSScriptRoot 'scripts/serve-workspace.mjs')
if($LASTEXITCODE){throw '启动失败，请查看上方错误。'}
