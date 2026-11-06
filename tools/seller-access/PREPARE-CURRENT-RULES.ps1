$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$firebaseRoot = Join-Path $env:USERPROFILE 'Downloads\teyza-release-20261105-103713\kit\tools\admin-release\node_modules\firebase-tools'
if (-not (Test-Path -LiteralPath (Join-Path $firebaseRoot 'package.json') -PathType Leaf)) {
  throw 'Firebase CLI was not found in the existing release kit. Nothing was changed.'
}
& node '.\read-live-rules.mjs' $firebaseRoot $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw 'Rules preparation stopped. Nothing was deployed.' }
