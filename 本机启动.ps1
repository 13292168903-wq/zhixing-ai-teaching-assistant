param([switch]$RealModel,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$cacheNode=Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$cachePython=Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$nodeBinary=if(Test-Path -LiteralPath $cacheNode){$cacheNode}else{(Get-Command node -ErrorAction Stop).Source}
if(!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'platform/.venv/Scripts/python.exe')) -and (Test-Path -LiteralPath $cachePython)){$env:TUTOR_PYTHON=$cachePython}
Set-Location -LiteralPath $PSScriptRoot
$env:HARNESS_ROOT=Join-Path $PSScriptRoot 'platform/runtime/dsh'
& $nodeBinary 'platform/scripts/preflight-v08.mjs' --verify
if($LASTEXITCODE){throw '环境检查失败，请查看上方结果'}
if($CheckOnly){exit 0}
$env:PORT='4180'
if($RealModel){& $nodeBinary 'platform/scripts/serve-workspace-longcat.mjs'}else{$env:TUTOR_ENABLE_REAL_MODEL='0';& $nodeBinary 'platform/scripts/serve-workspace.mjs'}
