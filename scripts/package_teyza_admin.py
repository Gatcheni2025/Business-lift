"""Package a scoped Firebase Hosting admin overlay; never a full-site replacement."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib,json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'TEYZA_ADMIN_R316_ACTIVATION_KIT.zip'
entries={}
for p in (ROOT/'web/teyza-admin/public').rglob('*'):
    if p.is_file(): entries['public/'+p.relative_to(ROOT/'web/teyza-admin/public').as_posix()]=p.read_bytes()
for name in ['package.json','package-lock.json','firebase-client.cjs','hosting-patch.cjs','reviewer.cjs','run.cjs']:
    entries['tools/admin-release/'+name]=(ROOT/'tools/admin-release'/name).read_bytes()
for name in ['DEPLOY-ADMIN.ps1','GRANT-ADMIN.ps1','ROLLBACK-ADMIN.ps1']:
    entries[name]=(ROOT/'tools/admin-release'/name).read_bytes()
entries['README-START-HERE.md']=(ROOT/'docs/TEYZA_R316_ADMIN_APPROVALS.md').read_bytes()
entries['admin-release-manifest.json']=json.dumps({'release':'R316','project':'business-lift-3c19c',
    'service':'existing teyzaMobile 3.15.0','files':{n:hashlib.sha256(b).hexdigest() for n,b in sorted(entries.items())}},indent=2).encode()
assert not any('node_modules' in n or n.endswith('.pem') or n.startswith('api/') for n in entries)
with ZipFile(OUT,'w',ZIP_DEFLATED,compresslevel=9) as z:
    for name,data in sorted(entries.items()):z.writestr(name,data)
with ZipFile(OUT) as z:assert z.testzip() is None
print(OUT.name,OUT.stat().st_size,'bytes;',len(entries),'files')
