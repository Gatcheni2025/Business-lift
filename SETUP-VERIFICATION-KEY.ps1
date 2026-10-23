$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
# Metadata only: never print the key or rotate an existing encryption key.
$metadata = & firebase functions:secrets:get TEYZA_VERIFICATION_ENCRYPTION_KEY --project business-lift-3c19c 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host 'The verification encryption secret already exists. Keeping it unchanged.'
  exit 0
}
if (($metadata | Out-String) -notmatch 'NOT_FOUND|not found|does not exist|404') {
  throw 'Could not confirm whether the encryption secret exists. Check Firebase login and project permissions before continuing.'
}
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$temporary = [System.IO.Path]::GetTempFileName()
try {
  $rng.GetBytes($bytes)
  [System.IO.File]::WriteAllText($temporary,[Convert]::ToBase64String($bytes),[System.Text.Encoding]::ASCII)
  & firebase functions:secrets:set TEYZA_VERIFICATION_ENCRYPTION_KEY --data-file $temporary --project business-lift-3c19c
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the verification encryption secret.' }
  Write-Host 'Verification encryption key created in Secret Manager. Do not rotate it while existing selfies need review.'
} finally {
  $rng.Dispose()
  Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  [Array]::Clear($bytes,0,$bytes.Length)
}
