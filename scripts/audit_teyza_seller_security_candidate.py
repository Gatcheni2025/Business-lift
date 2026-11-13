"""Deterministic static audit of a Teyza candidate with exact-file operator approval.

The owner waived the external malware-verdict requirement for this specific SHA-256.
A passing structural/source audit is NOT a third-party malware-clean verdict.
"""
from pathlib import Path
from hashlib import sha256,sha1
import json
import re
import zipfile

root=Path(__file__).resolve().parents[1]
archive=root/'dist/TEYZA_SELLER_SECURITY_REVIEW_CANDIDATE_20261106.zip'
expected_paths=json.loads((root/'tools/app-first-release/paths.json').read_text())
approval=json.loads((root/'docs/TEYZA_PAY_OPERATOR_SOURCE_APPROVAL_20261110.json').read_text())
assert approval['policyVersion']=='teyza-operator-source-approval-v1'
assert approval['approvalType']=='authorised_project_owner_and_operator'
assert approval['decision']=='approved' and approval['waivesExternalThirdPartyMalwareVerdict'] is True
assert approval['externalAnalystVerdict']=='not_received'
assert approval['approvedFile']=='web/app-first/public/js/seller-web-billing.mjs'
reviewed_browser_sha256=approval['approvedSha256']
assert re.fullmatch(r'[a-f0-9]{64}',reviewed_browser_sha256), 'Missing exact operator-approved SHA-256'
assert approval['operatorApprovalPr']==154
assert approval['canonicalRepositorySha256']==reviewed_browser_sha256

with zipfile.ZipFile(archive) as z:
    entries=z.namelist()
    assert z.testzip() is None
    assert len(entries)==len(set(entries))
    assert all(not name.startswith('/') and '\\' not in name and
               '..' not in Path(name).parts for name in entries)
    assert all(not name.lower().endswith(('.zip','.7z','.rar','.exe','.dll','.msi','.bat','.cmd','.vbs','.ps1.txt')) for name in entries)
    assert all('/node_modules/' not in name and not name.endswith(('.test.js','.test.cjs','.test.mjs','.spec.js','.spec.cjs','.spec.mjs'))
               for name in entries)
    assert not any(name.startswith('web/app-first/public/') for name in entries)
    assert not any('/.env' in name or '/.git/' in name or name.endswith(('.p8','.pem','.p12','.jks','.keystore')) for name in entries)
    assert set(name.removeprefix('public') for name in entries if name.startswith('public/'))==set(expected_paths)
    manifest=json.loads(z.read('FILE-HASHES.json'))
    assert set(manifest)==set(entries)-{'FILE-HASHES.json'}
    assert all(sha256(z.read(name)).hexdigest()==digest for name,digest in manifest.items())
    source=z.read('public/js/seller-web-billing.mjs')
    actual_browser_sha256=sha256(source).hexdigest()
    print('Git LF candidate browser SHA-256:',actual_browser_sha256)
    print('Operator-approved canonical Git LF SHA-256:',reviewed_browser_sha256)
    print('Verified Windows CRLF equivalent SHA-256:',approval['windowsWorktreeCrLfSha256'])
    assert approval['lineEndingEquivalenceVerified'] is True
    assert approval['approvedSha256Representation']=='Git checkout LF UTF-8'
    assert approval['canonicalRepositoryRepresentation']=='Git checkout LF UTF-8'
    assert actual_browser_sha256==reviewed_browser_sha256, 'Canonical Git LF source differs from operator-approved exact SHA-256'
    assert b'\r' not in source, 'Unexpected noncanonical line endings in Git source'
    windows_bytes=source.replace(b'\n',b'\r\n')
    assert sha256(windows_bytes).hexdigest()==approval['windowsWorktreeCrLfSha256'], 'Windows CRLF source differs from recorded reviewed equivalent'
    src=source.decode('utf-8')
    assert "https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile" in src
    assert "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js" in src
    assert "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js" in src
    assert "url.hostname==='checkout.paystack.com'" in src
    assert "url.protocol==='https:'" in src
    assert "!url.username && !url.password && !url.port" in src
    normalized=re.sub(r'\s+', '', src.lower())
    for token in ('eval(', 'newfunction(', 'document.write(', 'child_process', 'javascript:', 'data:text/html'):
        assert token not in normalized, 'Unexpected high-risk browser source token: '+token
    assert "sk_live_" not in src and "sk_test_" not in src
    assert z.read('services/teyza-mobile-v39/billing-paystack.js')
    assert 'DEPLOY-OPERATIONS.ps1' in entries and 'CHECK-PILOT.ps1' in entries
    assert 'START-HERE-PILOT.md' in entries and 'SECURITY-REVIEW.md' in entries
    print(f'Structural and static code audit passed for {len(entries)} entries.')
    print('Candidate SHA-256:',sha256(archive.read_bytes()).hexdigest())
    print('Source browser SHA-256:',sha256(source).hexdigest())
    print('Fingerprint gate: PASSED by exact operator-approved Git LF SHA-256 and verified CRLF byte-equivalence.')
    print('No independent malware-clean verdict; other CI/security gates and payment activation controls still apply.')
