'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const code=fs.readFileSync(path.join(__dirname,'Release-Teyza-iOS-1.0.48.ps1'),'utf8');
const config=fs.readFileSync(path.join(root,'apps/teyza_shopper/pubspec.yaml'),'utf8');

test('Teyza iOS 1.0.48 is sourced from the release branch with build 58',()=>{
  assert.match(config,/^version: 1\.0\.48\+58$/m);
  assert.match(code,/\$ExpectedVersion = 'version: 1\.0\.48\+58'/);
  assert.match(code,/gh workflow run teyza-mobile-release\.yml/);
  assert.match(code,/-f signed_release=true/);
  assert.match(code,/-f qa_signing_only=false/);
  assert.match(code,/-f platforms=ios/);
  assert.match(code,/-f upload_to_testflight=true/);
  assert.match(code,/-f expected_source_sha=\$Sha/);
});

test('Version guard never compares multiline git output as a PowerShell array',()=>{
  assert.match(code,/\$SourceLines = @\(git show \$Spec\)/);
  assert.match(code,/\$VersionLines = @\(\$SourceLines \| Where-Object/);
  assert.match(code,/\$VersionLines.Count -ne 1/);
  assert.match(code,/\$VersionLines\[0\]\.Trim\(\) -cne \$ExpectedVersion/);
  assert.doesNotMatch(code,/\$SourceVersion -notmatch/);
  assert.match(code,/\$Refspec = '\+refs\/heads\/\{0\}:refs\/remotes\/origin\/\{0\}'/);
  assert.match(code,/git fetch origin \$Refspec/);
  assert.doesNotMatch(code,/git fetch origin \$ReleaseBranch/);
});
