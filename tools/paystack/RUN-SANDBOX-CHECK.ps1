$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
if ([int]((node -p "process.versions.node.split('.')[0]") | Select-Object -Last 1) -lt 22) {
  throw 'Node.js 22 or newer is required. Nothing was changed.'
}
& node '.\tools\paystack\sandbox-check.cjs'
if ($LASTEXITCODE -ne 0) { throw 'Sandbox check stopped. Read the RESULT above.' }
