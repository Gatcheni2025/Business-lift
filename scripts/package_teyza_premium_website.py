"""Package premium marketing pages and a safe, version-cloning Firebase Hosting deployer."""
from pathlib import Path
import zipfile,hashlib,json
r=Path(__file__).resolve().parents[1]
out=r/'dist/TEYZA_STORE_WEBSITE_20261105.zip'
out.parent.mkdir(exist_ok=True)
files=['index.html','download.html','how-it-works.html','for-shop-owners.html',
       'seller-subscriptions.html','support.html','register.html','agents.html']
entries={}
for f in files:
 entries['public/'+f]=(r/'web/app-first/public'/f).read_bytes()
for f in ['firebase-client.cjs','hosting-patch.cjs','paths.json','premium-site-patch.cjs',
          'premium-site.test.cjs','package.json','package-lock.json']:
 entries['tools/app-first-release/'+f]=(r/'tools/app-first-release'/f).read_bytes()
entries['DEPLOY-TEYZA-PREMIUM.ps1']=(r/'DEPLOY-TEYZA-PREMIUM.ps1').read_bytes()
entries['README.md']=(r/'docs/TEYZA_PREMIUM_WEBSITE.md').read_bytes()
entries['START-HERE.txt']=('''TEYZA STORE WEBSITE UPDATE — 5 NOVEMBER 2026

1. Download and EXTRACT the ZIP into a new local folder.
2. Open PowerShell in that extracted folder, next to DEPLOY-TEYZA-PREMIUM.ps1.
3. Run: firebase login
4. Run: .\\DEPLOY-TEYZA-PREMIUM.ps1
5. Check https://teyza.co.za/ and https://teyza.co.za/download.html.

REQUIRES Node.js 22+ and Firebase Hosting permissions for business-lift-3c19c.
The helper clones the current live Hosting version, updates only the reviewed
eight reviewed public HTML pages, and verifies all unrelated files and server
configuration are unchanged before publication.

Admin, Firebase services, user data, private work pages and mobile app binaries
are not replaced. The Vacancy footer link opens the public field-team page;
the work portal and its backend are not changed by this website update.

IMPORTANT: NEVER run firebase deploy --only hosting with this partial ZIP.
Rollback if this is still the live version:
  node .\\tools\\app-first-release\\premium-site-patch.cjs rollback

Keep the generated local teyza-premium-website-backup.json.
''').encode('utf-8')
entries['FILE-HASHES.json']=(json.dumps({k:hashlib.sha256(v).hexdigest() for k,v in entries.items()},indent=2)+'\n').encode()
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as zip:
 for name,data in sorted(entries.items()):zip.writestr(name,data)
with zipfile.ZipFile(out) as zip:
 assert zip.testzip() is None
 checks=json.loads(zip.read('FILE-HASHES.json'))
 for name,digest in checks.items():assert hashlib.sha256(zip.read(name)).hexdigest()==digest
assert len(files)==8
print(out,out.stat().st_size,'bytes; all files and hashes verified.')

