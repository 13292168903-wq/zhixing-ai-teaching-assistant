param([switch]$RealModel,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$nodeBinary=(Get-Command node -ErrorAction Stop).Source
if([int](& $nodeBinary -p "process.versions.node.split('.')[0]") -lt 24){throw '需要 Node.js 24 或更高版本'}
$runtime=Join-Path $PSScriptRoot 'runtime/dsh'
if(Test-Path (Join-Path $runtime 'runtime-links.json')){& $nodeBinary (Join-Path $PSScriptRoot 'scripts/restore-runtime-links.mjs');if($LASTEXITCODE){throw '运行依赖还原失败'};$env:HARNESS_ROOT=$runtime}
& $nodeBinary (Join-Path $PSScriptRoot 'scripts/preflight-v08.mjs') --verify
if($LASTEXITCODE){throw '必需环境缺失，请查看自检说明'}
if($CheckOnly){exit 0}
if($RealModel){& $nodeBinary (Join-Path $PSScriptRoot 'scripts/serve-with-key.mjs') --pilot}
else{$env:TUTOR_ENABLE_REAL_MODEL='0';& $nodeBinary (Join-Path $PSScriptRoot 'scripts/serve-v08.mjs')}
