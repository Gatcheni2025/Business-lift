param([switch]$Installer)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$root = (Get-Location).Path
$repo = (Resolve-Path '../..').Path
$src = Join-Path $root 'src'
$dist = Join-Path $root 'dist'
$publish = Join-Path $dist 'publish'
if (Test-Path $dist) { throw 'A build output already exists; archive it or use a fresh checkout.' }
New-Item -ItemType Directory -Path $dist | Out-Null
$icon = Join-Path $src 'teyza.ico'
& magick -background none (Join-Path $repo 'assets/teyza-icon.svg') -define 'icon:auto-resize=256,128,64,48,32,16' $icon
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $icon)) { throw 'Approved Teyza icon conversion failed.' }
$nuget = Join-Path $root 'NuGet.Config'
$tests = Join-Path $root 'tests/Teyza.Admin.PolicyTests.csproj'
$project = Join-Path $src 'Teyza.Admin.Windows.csproj'
& dotnet restore $tests --configfile $nuget
if ($LASTEXITCODE -ne 0) { throw 'Policy restore failed.' }
& dotnet run --project $tests -c Release --no-restore
if ($LASTEXITCODE -ne 0) { throw 'Policy tests failed.' }
& dotnet restore $project --configfile $nuget -r win-x64 -p:SelfContained=true
if ($LASTEXITCODE -ne 0) { throw 'Windows restore failed.' }
& dotnet publish $project -c Release -r win-x64 --self-contained true --no-restore -o $publish
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $publish 'TeyzaAdmin.exe'))) { throw 'Windows publish failed.' }
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination (Join-Path $publish 'READ-ME.txt')
Compress-Archive -Path (Join-Path $publish '*') -DestinationPath (Join-Path $dist 'Teyza-Admin-Windows-1.0.0-x64-QA.zip')
if ($Installer) {
    $iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
    if (-not (Test-Path $iscc)) { throw 'Inno Setup 6 is not installed.' }
    & $iscc "/DPublishDir=$publish" "/DOutputDir=$dist" "/DIconPath=$icon" (Join-Path $root 'installer.iss')
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $dist 'Teyza-Admin-Windows-1.0.0-x64-QA-Setup.exe'))) { throw 'Installer compilation failed.' }
}
$artifacts = Get-ChildItem $dist -File | Where-Object { $_.Extension -in @('.zip','.exe') }
$hashes = foreach ($file in $artifacts) {
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $($file.Name)"
}
$hashes | Set-Content (Join-Path $dist 'SHA256SUMS.txt') -Encoding ascii
& dotnet --info | Set-Content (Join-Path $dist 'dotnet-build-info.txt') -Encoding UTF8
Write-Host 'QA artifacts built. Publisher signing, security review and real Windows acceptance are still required.'
