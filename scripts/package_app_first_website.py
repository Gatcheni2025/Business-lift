"""Package only the scoped marketing overlay and its deployment tools."""
from pathlib import Path
import hashlib,json,zipfile
r=Path(__file__).resolve().parents[1];out=r/'dist/TEYZA_APP_FIRST_WEBSITE_20261029.zip';out.parent.mkdir(exist_ok=True)
entries={}
for p in (r/'web/app-first/public').rglob('*'):
 if p.is_file():entries['public/'+p.relative_to(r/'web/app-first/public').as_posix()]=p.read_bytes()
for name in ['firebase-client.cjs','hosting-patch.cjs','check-live-seo.cjs','paths.json','run.cjs','store-links-patch.cjs','store-links.test.cjs','package.json','package-lock.json']:
 entries['tools/app-first-release/'+name]=(r/'tools/app-first-release'/name).read_bytes()
for name in ['DEPLOY-WEBSITE.ps1','ROLLBACK-WEBSITE.ps1']:entries[name]=(r/'tools/app-first-release'/name).read_bytes()
entries['DEPLOY-APP-STORES.ps1']=(r/'DEPLOY-APP-STORES.ps1').read_bytes()
entries['STORE-LINKS-README.md']=(r/'docs/TEYZA_STORES_WEBSITE.md').read_bytes()
entries['START-HERE.txt']=('''TEYZA GOOGLE PLAY + APP STORE WEBSITE UPDATE — 4 NOVEMBER 2026

1. Extract this ZIP into a new folder (do not run from the ZIP archive).
2. Use Node.js 22 or newer and your authorized Firebase CLI account.
3. Open PowerShell in the extracted folder containing DEPLOY-APP-STORES.ps1.
4. Run: firebase login
5. Run: .\\DEPLOY-APP-STORES.ps1

This scoped helper clones the current LIVE teyza.co.za Firebase Hosting version.
It updates ONLY three files: /index.html, /download.html and /assets/app-first.css.
It verifies all other files are unchanged and preserves ALL existing rewrites, routes, security headers, admin pages, backend functions and user accounts.

Do NOT run plain "firebase deploy --only hosting": this archive is a partial website overlay.
Do NOT run the legacy DEPLOY-WEBSITE.ps1 for this store-button-only update; it manages many more pages.

Play listing: https://play.google.com/store/apps/details?id=com.asiyedriver.asiye
App Store: https://apps.apple.com/za/app/id6827037733
Android test track: https://play.google.com/apps/testing/com.asiyedriver.asiye

Store link visibility is distinct from public release approval. Some links may return not-found or unavailable until each store completes its review and regional publication.
After publishing, check https://teyza.co.za/ and https://teyza.co.za/download.html.

Rollback if this remains the latest live website release:
    node .\\tools\\app-first-release\\store-links-patch.cjs rollback
Keep the generated local teyza-store-links-backup.json.
See STORE-LINKS-README.md for detailed instructions.
''' ).encode()
entries['IMPLEMENTATION-NOTES.md']=(r/'docs/TEYZA_APP_FIRST_WEBSITE.md').read_bytes()
entries['FILE-HASHES.json']=(json.dumps({name:hashlib.sha256(data).hexdigest() for name,data in entries.items()},indent=2)+'\n').encode()
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for name,data in sorted(entries.items()):z.writestr(name,data)
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 hashes=json.loads(z.read('FILE-HASHES.json'))
 for name,digest in hashes.items():assert hashlib.sha256(z.read(name)).hexdigest()==digest
 assert len([n for n in z.namelist() if n.startswith('public/')])==len(list((r/'web/app-first/public').rglob('*')))-len([p for p in (r/'web/app-first/public').rglob('*') if p.is_dir()])
print(out, out.stat().st_size,'bytes; all archive hashes verified.')
