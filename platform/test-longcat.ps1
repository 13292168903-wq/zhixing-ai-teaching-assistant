param([switch]$PromptForKey)
$ErrorActionPreference = 'Stop'
$runtimeNode = 'C:\Users\mwh\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $runtimeNode)) { $runtimeNode = (Get-Command node -ErrorAction Stop).Source }
if (-not $env:LONGCAT_API_KEY) { $env:LONGCAT_API_KEY = [Environment]::GetEnvironmentVariable('LONGCAT_API_KEY', 'User') }
if (-not $env:LONGCAT_API_KEY -and $PromptForKey) {
    $secureKey = Read-Host '请输入 LongCat API Key（仅本进程使用，不回显或写入文件）' -AsSecureString
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try { $env:LONGCAT_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
}
& $runtimeNode (Join-Path $PSScriptRoot 'scripts\longcat-v05-validation.mjs')
exit $LASTEXITCODE
