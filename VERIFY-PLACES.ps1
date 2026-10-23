$ErrorActionPreference = 'Stop'
$root = 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces'
$health = Invoke-RestMethod -Uri "$root/health" -TimeoutSec 30
if ($health.version -ne '3.6') {
  throw "Live service is version $($health.version); expected 3.6. Deploy the updated codebase first."
}
$photosChecked = 0
foreach ($kind in @('spaza', 'variety')) {
  $data = Invoke-RestMethod -Uri "$root/shopper-discover.php?lat=-29.8587&lon=31.0218&category=$kind&radius=40000" -TimeoutSec 45
  if (-not $data.ok) { throw "The $kind shop search did not succeed." }
  Write-Host "$kind : $($data.entries.Count) shops; $($data.photoCount) photo references."
  $shop = $data.entries | Where-Object { $_.photoRef } | Select-Object -First 1
  if ($null -ne $shop) {
    $ref = [Uri]::EscapeDataString($shop.photoRef)
    $photo = Invoke-WebRequest -UseBasicParsing -Uri "$root/shopper-place-photo.php?ref=$ref&w=320" -TimeoutSec 30
    if ($photo.StatusCode -ne 200 -or $photo.Headers['Content-Type'] -notmatch '^image/') {
      throw "The photo check failed for $($shop.name)."
    }
    $photosChecked++
    Write-Host "Photo loaded: $($shop.name)"
  }
}
if ($photosChecked -eq 0) { throw 'No actual shop photograph could be verified. Check Places photo access and the returned entries.' }
Write-Host 'R3.6 search and shop photograph checks passed.' -ForegroundColor Green
