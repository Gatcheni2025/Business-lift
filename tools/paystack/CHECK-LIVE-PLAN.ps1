param(
  [string]$PlanCode = 'PLN_ud5m0sza4kmr31f'
)

$ErrorActionPreference = 'Stop'
if ($PlanCode -notmatch '^PLN_[A-Za-z0-9]{4,64}$') {
  throw 'RESULT: Invalid plan code. Nothing was changed.'
}

$secureKey = $null
$plainKey = $null
$headers = $null
$pointer = [IntPtr]::Zero
try {
  $secureKey = Read-Host 'Paste your Paystack LIVE secret key (input hidden)' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if (-not $plainKey.StartsWith('sk_live_')) {
    throw 'A live secret key is required.'
  }
  $headers = @{ Authorization = 'Bearer ' + $plainKey }
  $result = Invoke-RestMethod -Method Get -Uri ('https://api.paystack.co/plan/' + $PlanCode) -Headers $headers -TimeoutSec 30
  $plan = $result.data
  if ($result.status -ne $true -or $plan.plan_code -ne $PlanCode -or
      $plan.domain -ne 'live' -or $plan.currency -ne 'ZAR' -or
      $plan.interval -ne 'monthly' -or $plan.amount -ne 9900 -or
      ($null -ne $plan.invoice_limit -and $plan.invoice_limit -ne 0)) {
    throw 'The plan did not match the required renewal terms.'
  }
  Write-Output 'RESULT: VERIFIED - live plan is ZAR 99.00 monthly with no fixed invoice limit. No charges or configuration changes were made.'
} catch {
  throw 'RESULT: NOT VERIFIED - check the live key and the plan in the same Paystack account. No charges or configuration changes were made.'
} finally {
  $headers = $null
  $plainKey = $null
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  if ($null -ne $secureKey) { $secureKey.Dispose() }
}
