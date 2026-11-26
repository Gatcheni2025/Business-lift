[CmdletBinding()]
param(
 [ValidateSet('Check','Deploy','RollbackHosting')][string]$Mode='Check',
 [switch]$ConfirmDeployment,
 [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSourceSha
)
$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
function Run([string]$exe,[string[]]$arguments){
 & $exe @arguments
 if($LASTEXITCODE -ne 0){throw "$exe failed. Stop and inspect the result."}
}
$sha=(& git rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $sha -ne $ExpectedSourceSha){throw 'Unexpected source commit. No production changes.'}
if(@(& git status --porcelain --untracked-files=no).Count -ne 0){throw 'Tracked source changes are present.'}
if([int](& node -p "process.versions.node.split('.')[0]") -lt 22){throw 'Node.js 22 or newer is required.'}
if($Mode -ne 'Check' -and !$ConfirmDeployment){throw 'Explicit -ConfirmDeployment required.'}
Run 'npm' @('ci','--prefix','tools/admin-release','--ignore-scripts','--no-audit','--no-fund')
if($Mode -eq 'RollbackHosting'){
 Run 'node' @('tools/admin-release/marketplace-release.cjs','rollback-hosting')
 return
}
Run 'npm' @('ci','--prefix','services/teyza-mobile-v39','--no-audit','--no-fund')
Run 'npm' @('ci','--prefix','services/teyza-places-v34','--no-audit','--no-fund')
Run 'npm' @('test','--prefix','services/teyza-mobile-v39')
Run 'npm' @('test','--prefix','services/teyza-places-v34')
Run 'npm' @('test','--prefix','tools/admin-release')
Run 'node' @('--test','tools/admin-release/marketplace-release.test.cjs')
Run 'node' @('tools/admin-release/marketplace-release.cjs','check')
if($Mode -eq 'Check'){Write-Host 'Preflight passed. No live resources changed.';return}
Run 'node' @('tools/admin-release/marketplace-release.cjs','deploy','--confirm-v61')
