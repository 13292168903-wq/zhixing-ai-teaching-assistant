param([switch]$LocalRules)
$ErrorActionPreference = 'Stop'
$bundledNode = 'C:\Users\mwh\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (Test-Path -LiteralPath $bundledNode) { $nodeBinary = $bundledNode } else { $nodeBinary = (Get-Command node -ErrorAction Stop).Source }
$majorVersion = [int](& $nodeBinary -p "process.versions.node.split('.')[0]")
if ($majorVersion -lt 24) { throw '需要 Node.js 24 或更高版本。' }
if ($LocalRules) { $env:TUTOR_ENGINE = 'local' }
& $nodeBinary (Join-Path $PSScriptRoot 'src\server.mjs')
