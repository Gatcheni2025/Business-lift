"""Create a flat combined Firebase backend and website activation kit."""
from pathlib import Path
import json,hashlib,shutil
root=Path(__file__).resolve().parents[1];stage=root/'build/teyza-field-work-deploy'
if stage.exists():shutil.rmtree(stage)
files=[root/'firebase.teyza-mobile-v39.json',root/'DEPLOY-MOBILE.ps1',root/'DEPLOY-FIELD-WORK.ps1',root/'SETUP-VERIFICATION-KEY.ps1']
files += [p for p in (root/'services/teyza-mobile-v39').rglob('*') if p.is_file() and 'node_modules' not in p.parts and not p.name.endswith('debug.log')]
for p in files:
 dest=stage/p.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
shutil.copytree(root/'web/app-first/public',stage/'public')
# The admin patch uses the same staging root, with a separate scoped overlay.
shutil.copytree(root/'web/teyza-admin/public',stage/'public',dirs_exist_ok=True)
for name in ['firebase-client.cjs','hosting-patch.cjs','reviewer.cjs','run.cjs','package.json','package-lock.json']:
 dest=stage/'tools/admin-release'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/'tools/admin-release'/name,dest)
shutil.copy2(root/'tools/admin-release/DEPLOY-ADMIN.ps1',stage/'DEPLOY-ADMIN.ps1')
for name in ['firebase-client.cjs','hosting-patch.cjs','check-live-seo.cjs','paths.json','run.cjs','package.json','package-lock.json']:
 dest=stage/'tools/app-first-release'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/'tools/app-first-release'/name,dest)
for name in ['DEPLOY-WEBSITE.ps1','ROLLBACK-WEBSITE.ps1']:shutil.copy2(root/'tools/app-first-release'/name,stage/name)
shutil.copy2(root/'docs/TEYZA_FIELD_WORK_AND_SEO.md',stage/'README-START-HERE.md')
manifest={p.relative_to(stage).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in stage.rglob('*') if p.is_file()}
(stage/'FILE-HASHES.json').write_text(json.dumps(manifest,indent=2)+'\n')
assert (stage/'DEPLOY-FIELD-WORK.ps1').exists() and (stage/'public/work.html').exists() and (stage/'public/admin.html').exists() and (stage/'DEPLOY-ADMIN.ps1').exists()
print(str(len(manifest))+' verified source files staged; flat field-work kit: '+str(stage))
