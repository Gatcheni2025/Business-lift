$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$kitRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$firebaseRoot = Join-Path $kitRoot 'tools\admin-release\node_modules\firebase-tools'
if (-not (Test-Path -LiteralPath (Join-Path $firebaseRoot 'package.json') -PathType Leaf)) {
  # Older stand-alone repair packages relied on this already-installed CLI.
  $firebaseRoot = Join-Path $env:USERPROFILE 'Downloads\teyza-release-20261105-103713\kit\tools\admin-release\node_modules\firebase-tools'
}
if (-not (Test-Path -LiteralPath (Join-Path $firebaseRoot 'package.json') -PathType Leaf)) {
  throw 'Install the pinned admin-release Firebase CLI first (npm ci --prefix tools/admin-release). No rules were prepared.'
}
& node '.\read-live-rules.mjs' $firebaseRoot $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw 'Rules preparation stopped. Nothing was deployed.' }
