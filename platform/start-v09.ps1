param([switch]$RealModel,[switch]$CheckOnly)
& (Join-Path $PSScriptRoot 'start-v08.ps1') -RealModel:$RealModel -CheckOnly:$CheckOnly
exit $LASTEXITCODE
