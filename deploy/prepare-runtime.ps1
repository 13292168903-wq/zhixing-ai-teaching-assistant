param([string]$Repository)
$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$lock=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime-asset.json') -Raw | ConvertFrom-Json
$archive=Join-Path $project '知行_v0.8_DSH运行依赖.zip'
if(!(Test-Path -LiteralPath $archive)){
 if($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'){throw '请指定实际 GitHub owner/repository，或将配套运行依赖 ZIP 放到项目根目录。'}
 Invoke-WebRequest -Uri "https://github.com/$Repository/releases/download/runtime-v0.8/zhixing-dsh-runtime.zip" -OutFile $archive
}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $lock.sha256){throw '运行依赖哈希不符，拒绝解压'}
Expand-Archive -LiteralPath $archive -DestinationPath $project -Force
& node (Join-Path $project 'platform/scripts/restore-runtime-links.mjs')
if($LASTEXITCODE){throw '运行依赖链接还原失败'}
Write-Host '运行依赖准备完成。请安装 Python 解析依赖，然后双击启动知行.cmd。'
