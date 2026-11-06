"""Deterministic static audit of a NOT-YET-APPROVED Teyza release candidate.

This is not a malware analysis engine and a passing result does not
override Microsoft Defender / an independent vendor analyst.
"""
from pathlib import Path
from hashlib import sha256,sha1
import json
import re
import zipfile

root=Path(__file__).resolve().parents[1]
archive=root/'dist/TEYZA_SELLER_SECURITY_REVIEW_CANDIDATE_20261106.zip'
expected_paths=json.loads((root/'tools/app-first-release/paths.json').read_text())
reviewed_browser_sha256='82f8e042d9346a34ab410fbe75f858a32c71ba8c190e3b44bc9e243f4d07506e'

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
    assert sha256(source).hexdigest()==reviewed_browser_sha256, 'Browser code changed since file-level security review'
    src=source.decode('utf-8')
    assert "https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile" in src
    assert "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js" in src
    assert "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js" in src
    assert "u.hostname==='checkout.paystack.com'" in src
    assert not re.search(r'(?i)\\b(eval\\s*\\(|new\\s+Function\\s*\\(|document\\.write\\s*\\(|child_process|javascript:|data:text/html)',src)
    assert "sk_live_" not in src and "sk_test_" not in src
    assert z.read('services/teyza-mobile-v39/billing-paystack.js')
    assert 'DEPLOY-OPERATIONS.ps1' in entries and 'CHECK-PILOT.ps1' in entries
    assert 'START-HERE-PILOT.md' in entries and 'SECURITY-REVIEW.md' in entries
    print(f'Structural and static code audit passed for {len(entries)} entries.')
    print('Candidate SHA-256:',sha256(archive.read_bytes()).hexdigest())
    print('Source browser SHA-256:',sha256(source).hexdigest())
    print('Outcome: NOT A MALWARE-CLEAN VERDICT. Vendor review required; not released for download.')
