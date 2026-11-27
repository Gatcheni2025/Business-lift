"""Build a reduced *security-review candidate*, not an approved release.

Exclude all test fixtures, duplicate website trees, installers, secret files,
and optional developer-only helpers. This tool never deploys or executes JS.
The output remains quarantined from publication until external verdicts pass.
"""
from pathlib import Path
import hashlib
import io
import json
import re
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'dist/TEYZA_SELLER_SECURITY_REVIEW_CANDIDATE_20261106.zip'
files={}

def add(source, dest=None):
    path=ROOT/source
    if not path.is_file() or path.is_symlink():
        raise SystemExit('Missing or symlinked required release file: '+source)
    name=dest or source
    if name in files:
        raise SystemExit('Duplicate file: '+name)
    if any(part.startswith('.') for part in Path(name).parts) or re.search(r'(^|/)(test|tests|__pycache__|node_modules)(/|\\.)',name,re.I):
        raise SystemExit('Refusing hidden, test, dependency or build item: '+name)
    if re.search(r'(?i)(?:\\.test\\.|\\.spec\\.|\\.env|\\.pem$|\\.p8$|\\.p12$|\\.key$|\\.keystore$|\\.jks$|\\.exe$|\\.dll$|\\.bat$|\\.cmd$)',name):
        raise SystemExit('Refusing non-production or secret item: '+name)
    files[name]=path.read_bytes()

paths=json.loads((ROOT/'tools/app-first-release/paths.json').read_text())
assert all(isinstance(p,str) and re.fullmatch(r'/[A-Za-z0-9._/-]+',p) and '..' not in p for p in paths)
for website_path in paths:
    add('web/app-first/public'+website_path,'public'+website_path)
for path in sorted((ROOT/'web/teyza-admin/public').rglob('*')):
    if path.is_file():
        add(path.relative_to(ROOT).as_posix())
for path in sorted((ROOT/'services/teyza-mobile-v39').rglob('*')):
    if not path.is_file() or path.name.startswith('.') or path.name.endswith(('.test.js','.spec.js','.log')):
        continue
    if 'node_modules' in path.parts:
        continue
    # The only deployable backend content is source, runtime metadata and images.
    if path.suffix not in ('.js','.json','.png','.webp','.jpg','.jpeg'):
        continue
    if path.name in ('set-teyza-admin.js',):
        continue
    add(path.relative_to(ROOT).as_posix())
for path in ['firebase.teyza-mobile-v39.json','DEPLOY-OPERATIONS.ps1','CHECK-PILOT.ps1']:
    add(path)
for path in [
    'firebase-client.cjs','hosting-patch.cjs','reviewer.cjs','run.cjs','package.json','package-lock.json'
]:
    add('tools/admin-release/'+path)
for path in [
    'firebase-client.cjs','hosting-patch.cjs','run.cjs','paths.json','package.json','package-lock.json'
]:
    add('tools/app-first-release/'+path)
for path in [
    'DEPLOY-WEBSITE.ps1','ROLLBACK-WEBSITE.ps1'
]:
    add('tools/app-first-release/'+path,path)
for path in [
    'PREPARE-CURRENT-RULES.ps1','DEPLOY-SELLER-ACCESS.ps1',
    'read-live-rules.mjs','gate-seller-products.mjs',
    'repair-seller-rules.mjs','seller-account.rules',
    'seller-account-legacy.rules','seller-drafts.rules',
    'seller-drafts-legacy.rules','README-START-HERE.md'
]:
    add('tools/seller-access/'+path)
for source, dest in [
    ('docs/TEYZA_SELLER_WEBSITE_PILOT_RELEASE.md','START-HERE-PILOT.md'),
    ('docs/TEYZA_WEBSITE_SELLER_MEMBERSHIP.md','WEBSITE-MEMBERSHIP.md'),
    ('docs/TEYZA_SELLER_SECURITY_REVIEW.md','SECURITY-REVIEW.md'),
]:
    add(source,dest)
# Explicit structure and content policy for an unapproved security-review candidate.
assert 'public/js/seller-web-billing.mjs' in files
assert 'services/teyza-mobile-v39/billing-paystack.js' in files
assert 'services/teyza-mobile-v39/billing-paystack.test.js' not in files
assert 'tools/app-first-release/seller-web-billing.test.cjs' not in files
assert not any(name.startswith('web/app-first/public') for name in files)
assert not any('.test.' in name.lower() for name in files)
assert not any(b'sk_live_' in bytes or b'sk_test_' in bytes for name,bytes in files.items()
    if name.startswith('public/') or name.startswith('web/teyza-admin/public/'))
files['FILE-HASHES.json']=(json.dumps({
    name:hashlib.sha256(data).hexdigest()
    for name,data in sorted(files.items())
},indent=2)+'\n').encode()
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED) as out:
    for name,data in sorted(files.items()):
        out.writestr(name,data)
with zipfile.ZipFile(OUTPUT) as src:
    assert src.testzip() is None
    hashes=json.loads(src.read('FILE-HASHES.json'))
    for name,sha in hashes.items():
        assert hashlib.sha256(src.read(name)).hexdigest()==sha
    assert len(src.namelist())==len(files)
print('Security-review only:',OUTPUT.name,'files:',len(files),
      'bytes:',OUTPUT.stat().st_size,'archive-sha256:',hashlib.sha256(OUTPUT.read_bytes()).hexdigest())
print('No deployment, no live charge, no malware-clean verdict. DO NOT DISTRIBUTE until vendor review.')
