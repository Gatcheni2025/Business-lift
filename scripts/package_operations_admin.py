from pathlib import Path
import hashlib,json,zipfile
r=Path(__file__).resolve().parents[1];out=r/'TEYZA_ADMIN_R317_OPERATIONS_KIT.zip';entries={}
for p in (r/'web/teyza-admin/public').rglob('*'):
 if p.is_file():entries['public/'+p.relative_to(r/'web/teyza-admin/public').as_posix()]=p.read_bytes()
for p in (r/'services/teyza-mobile-v39').rglob('*'):
 if p.is_file() and 'node_modules' not in p.parts and not p.name.startswith('.') and not p.name.endswith('.log'):entries[p.relative_to(r).as_posix()]=p.read_bytes()
for name in ['package.json','package-lock.json','firebase-client.cjs','hosting-patch.cjs','reviewer.cjs','run.cjs']:entries['tools/admin-release/'+name]=(r/'tools/admin-release'/name).read_bytes()
for name in ['DEPLOY-ADMIN.ps1','GRANT-ADMIN.ps1','ROLLBACK-ADMIN.ps1']:entries[name]=(r/'tools/admin-release'/name).read_bytes()
for name in ['DEPLOY-OPERATIONS.ps1','firebase.teyza-mobile-v39.json']:entries[name]=(r/name).read_bytes()
entries['START-HERE.md']=(r/'docs/TEYZA_R317_OPERATIONS.md').read_bytes()
entries['FILE-HASHES.json']=(json.dumps({n:hashlib.sha256(b).hexdigest() for n,b in entries.items()},indent=2)+'\n').encode()
assert not any('node_modules' in n or n.endswith('.pem') or '/.env' in n for n in entries)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for n,b in entries.items():z.writestr(n,b)
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 for n,h in json.loads(z.read('FILE-HASHES.json')).items():assert hashlib.sha256(z.read(n)).hexdigest()==h
print(out.name,len(entries),'files',out.stat().st_size,'bytes; hashes verified')
