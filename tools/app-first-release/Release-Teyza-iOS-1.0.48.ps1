# Signed Teyza iOS 1.0.48 (58) upload request. Does not submit to App Review.
$ErrorActionPreference = 'Stop'
$Repo = 'Gatcheni2025/Business-lift'
$ReleaseBranch = 'release/teyza-ads-web-qa-signed-20261111'
$ExpectedVersion = 'version: 1.0.48+58'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) required.' }
gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login first.' }
$GitRoot = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Run inside a Teyza repository checkout.' }
Push-Location $GitRoot
try {
    # Explicit refspec: git fetch origin <branch> alone may only update
    # FETCH_HEAD, leaving origin/<branch> at an older commit.
    $Refspec = '+refs/heads/{0}:refs/remotes/origin/{0}' -f $ReleaseBranch
    git fetch origin $Refspec
    if ($LASTEXITCODE -ne 0) { throw 'Unable to update the Teyza remote-tracking release branch.' }
    $Spec = ('origin/{0}:apps/teyza_shopper/pubspec.yaml' -f $ReleaseBranch)
    # Native PowerShell captures each output line of git show as an array.
    # Join lines first; otherwise -notmatch returns every non-matching line
    # as a truthy array and incorrectly rejects a valid version.
    $SourceLines = @(git show $Spec)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read release version metadata from Git.' }
    $VersionLines = @($SourceLines | Where-Object { $_ -match '^version:\s*' })
    if ($VersionLines.Count -ne 1 -or $VersionLines[0].Trim() -cne $ExpectedVersion) {
        throw 'The remote release branch is not yet version 1.0.48+58.'
    }
    $Sha = (git rev-parse ('origin/{0}' -f $ReleaseBranch)).Trim()
    if ($LASTEXITCODE -ne 0 -or $Sha -notmatch '^[0-9a-f]{40}$') { throw 'Invalid release SHA.' }
    $RemoteSha = (gh api ('repos/{0}/git/ref/heads/{1}' -f $Repo,$ReleaseBranch) --jq '.object.sha').Trim()
    if ($LASTEXITCODE -ne 0 -or $RemoteSha -ne $Sha) {
        throw 'Remote release branch changed. Review before retrying.'
    }
    Write-Host ('Requesting signed Teyza iOS 1.0.48+58 from {0}' -f $Sha) -ForegroundColor Cyan
    gh workflow run teyza-mobile-release.yml --repo $Repo --ref $ReleaseBranch -f signed_release=true -f qa_signing_only=false -f direct_mandate_qa=false -f direct_mandate_debug_qa=false -f platforms=ios -f upload_to_testflight=true -f expected_source_sha=$Sha
    if ($LASTEXITCODE -ne 0) { throw 'Signed iOS workflow dispatch rejected.' }
    Write-Host 'Build requested; verify signed IPA and Apple upload under Actions. No App Store publication is implied.'
    Write-Host ('https://github.com/{0}/actions/workflows/teyza-mobile-release.yml' -f $Repo)
} finally { Pop-Location }
