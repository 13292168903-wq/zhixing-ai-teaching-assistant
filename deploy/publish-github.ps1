param(
 [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')]
 [string]$RepositoryName = 'zhixing-ai-teaching-assistant',
 [string]$AssetsDirectory = (Join-Path $PSScriptRoot '../..'),
 [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
function Assert-NativeSuccess([string]$Message) {
 if ($LASTEXITCODE -ne 0) { throw $Message }
}
Push-Location $project
try {
 # Complete local checks before creating a repository or pushing source.
 & python (Join-Path $PSScriptRoot 'check-public-source.py')
 Assert-NativeSuccess '公开源码检查未通过。'
 $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-assets.json') -Raw | ConvertFrom-Json
 $runtimeLock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime-asset.json') -Raw | ConvertFrom-Json
 $runtimeEntry = @($manifest.assets | Where-Object { $_.asset -eq $runtimeLock.asset })
 if ($runtimeEntry.Count -ne 1 -or $runtimeEntry[0].sha256 -ne $runtimeLock.sha256) {
  throw '发布清单与运行依赖锁定信息不一致。'
 }
 $assetPaths = @()
 foreach ($asset in $manifest.assets) {
  $file = Join-Path $AssetsDirectory $asset.asset
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "缺少 Release 资产：$file" }
  if ((Get-Item -LiteralPath $file).Length -ne $asset.bytes -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256) {
   throw "Release 资产大小或 SHA256 不符：$($asset.asset)"
  }
  $assetPaths += (Resolve-Path -LiteralPath $file).Path
  Write-Host "已核对 Release 资产：$($asset.asset)"
 }
 if ($CheckOnly) { Write-Host '本地发布检查通过；未提交、推送或创建远程资源。'; return }

 & gh auth status
 Assert-NativeSuccess '请由账号本人先运行 gh auth login。'
 $owner = & gh api user --jq .login
 Assert-NativeSuccess '无法确认 GitHub 账号。'
 if (!$owner) { throw 'GitHub 账号为空。' }
 $repository = "$owner/$RepositoryName"
 & gh repo view $repository --json nameWithOwner 2>$null | Out-Null
 $repositoryExists = $LASTEXITCODE -eq 0
 if ($repositoryExists) {
  if (!(Test-Path -LiteralPath '.git')) { throw '同名仓库已存在，请绑定正确远端或选择新仓库名。' }
  $existing = & git remote get-url origin 2>$null
  Assert-NativeSuccess '同名仓库已存在且本地未绑定 origin，请先核对并绑定。'
  if ($existing -notin @("https://github.com/$repository.git", "https://github.com/$repository", "git@github.com:$repository.git")) {
   throw '现有远端与目标仓库不匹配，停止发布。'
  }
 }
 if (!(Test-Path -LiteralPath '.git')) {
  & git init -b main
  Assert-NativeSuccess '初始化 Git 仓库失败。'
 }
 & git add -- .
 Assert-NativeSuccess '暂存源码失败。'
 & git diff --cached --quiet
 if ($LASTEXITCODE -eq 1) {
  & git commit -m 'Prepare Zhixing v1 source and deployment documentation'
  Assert-NativeSuccess '提交失败，请配置自己的 Git 作者身份后重试。'
 } elseif ($LASTEXITCODE -ne 0) { throw '检查暂存区失败。' }
 if (!$repositoryExists) {
  & gh repo create $repository --public --source . --remote origin --push
  Assert-NativeSuccess '创建或推送公共仓库失败。'
 } else {
  & git push -u origin HEAD
  Assert-NativeSuccess '推送失败。'
 }
 $commit = & git rev-parse HEAD
 Assert-NativeSuccess '无法读取待发布提交。'
 & gh release view $manifest.release_tag --repo $repository 2>$null | Out-Null
 if ($LASTEXITCODE -ne 0) {
  & gh release create $manifest.release_tag @assetPaths --target $commit --repo $repository --title '知行 v1：完整便携包与 DS-H 运行依赖' --notes '依赖和便携包的 SHA256 见源码 deploy/release-assets.json；平台界面为前端易用版 v1，标签沿用依赖版本。系统运行环境需另行安装。'
 } else {
  & gh release upload $manifest.release_tag @assetPaths --repo $repository
 }
 Assert-NativeSuccess '源码已推送，但 Release 上传未完成；不会覆盖已发布的同名资产，请检查 Release。'
 Write-Host "源码：https://github.com/$repository"
 Write-Host "部署包：https://github.com/$repository/releases/tag/$($manifest.release_tag)"
} finally { Pop-Location }
