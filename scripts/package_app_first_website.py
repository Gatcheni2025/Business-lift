"""Package only the scoped marketing overlay and its deployment tools."""
from pathlib import Path
import hashlib,json,zipfile
r=Path(__file__).resolve().parents[1];out=r/'dist/TEYZA_APP_FIRST_WEBSITE_20261029.zip';out.parent.mkdir(exist_ok=True)
entries={}
for p in (r/'web/app-first/public').rglob('*'):
 if p.is_file():entries['public/'+p.relative_to(r/'web/app-first/public').as_posix()]=p.read_bytes()
for name in ['firebase-client.cjs','hosting-patch.cjs','check-live-seo.cjs','paths.json','run.cjs','package.json','package-lock.json']:
 entries['tools/app-first-release/'+name]=(r/'tools/app-first-release'/name).read_bytes()
for name in ['DEPLOY-WEBSITE.ps1','ROLLBACK-WEBSITE.ps1']:entries[name]=(r/'tools/app-first-release'/name).read_bytes()
entries['START-HERE.txt']=('''TEYZA FIELD-WORK WEBSITE AND SEO UPDATE — 29 OCTOBER 2026

1. Extract this ZIP to a folder on your PC.
2. Install Node.js 22 or newer if needed.
3. Open PowerShell in the extracted folder.
4. Run: firebase login
5. Run: Unblock-File -LiteralPath '.\\DEPLOY-WEBSITE.ps1'
6. Run: .\\DEPLOY-WEBSITE.ps1

The helper reuses your Firebase CLI account for project business-lift-3c19c. It clones the current live site, changes only the reviewed marketing pages/images and registration redirects, verifies that unrelated files remain intact, and publishes. No mobile build, Functions deployment, account deletion or Firebase security-rule replacement is involved.

IMPORTANT: Do not run plain firebase deploy with this partial public folder.

The store listings were not publicly available when checked. Android is labelled early access for approved testers; iPhone is labelled coming soon. Update these labels/links when the public store releases are available. Website registration moves to app instructions; existing admin and authenticated workspace pages are preserved.

After success, check the homepage, /download.html, /register.html and /sitemap.xml. Verify both www.teyza.co.za and teyza.co.za. Submit the sitemap in Google Search Console and Bing Webmaster Tools after verifying domain ownership. Search engines decide when to index and rank pages; rankings are not guaranteed.

Rollback (only if this deployment is still live): .\\ROLLBACK-WEBSITE.ps1
Keep hosting-backup-app-first.json after publishing; it identifies the preceding release.
''').encode()
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
