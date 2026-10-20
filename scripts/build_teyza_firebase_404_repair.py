#!/usr/bin/env python3
"""Create the minimal Firebase browser module repair (no server credentials)."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)
OUTPUT = DIST / "TEYZA_FIREBASE_JS_404_REPAIR.zip"
PUBLIC = ["js/firebase-settings.js", "js/firebase-config.js", "js/landing-firebase.js"]

settings = (ROOT / "js/firebase-settings.js").read_text(encoding="utf-8")
for key in ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"]:
    if not re.search(r"\b" + key + r"\s*:", settings):
        raise SystemExit("Incomplete browser config: " + key)
if not all("firebase-settings.js" in (ROOT / name).read_text(encoding="utf-8") for name in PUBLIC[1:]):
    raise SystemExit("Import graph is not consistent: firebase-settings.js")
for name in PUBLIC:
    if not (ROOT / name).is_file():
        raise SystemExit("Missing required public browser script: " + name)

readme = """TEYZA Firebase sign-in browser module 404 repair

A missing /js/firebase-settings.js prevents loading the Firebase Web SDK.
This ZIP provides the exact public Firebase settings module and the two
JavaScript files that import it. It does NOT contain server private keys,
Firebase user accounts or merchant JSON records.

1. Back up live /js/firebase-settings.js, /js/firebase-config.js, and
   /js/landing-firebase.js if they exist. Do not delete any other files.
2. Upload TEYZA_FIREBASE_JS_404_REPAIR.zip to the LIVE teyza.co.za
   document root holding index.html. Extract there, so the final paths are:
     js/firebase-settings.js
     js/firebase-config.js
     js/landing-firebase.js
   If the importers already exist and you customized them, restore only
   js/firebase-settings.js rather than overwriting both importers.
3. Check the projectId matches your current Firebase project BEFORE
   overwriting customized public Firebase settings.
4. Test https://teyza.co.za/js/firebase-settings.js (HTTP 200, must
   show export const firebaseConfig) then sign in after Ctrl+Shift+R.
5. A separate HTTP 500 from api/workspace.php may remain; use
   TEYZA-PHP-WORKSPACE-500-SAFE-REPAIR and check private_html permissions.
6. Do NOT replace /api/teyza-firebase-verify.php or private_html.
7. Set file permissions to 644 and js/ directory to 755 where supported.
8. A public Firebase API key is a client identifier, not a secret
   server-side private key. Keep authentication rules and key restrictions.
"""

with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
    for name in PUBLIC:
        archive.write(ROOT / name, name)
    archive.writestr("README_FIREBASE_404.txt", readme)
with ZipFile(OUTPUT) as archive:
    if archive.testzip() is not None:
        raise SystemExit("Archive integrity failure")
    if not set(PUBLIC).issubset(set(archive.namelist())):
        raise SystemExit("Browser modules missing in archive")
print("Firebase 404 repair built:", OUTPUT.name, OUTPUT.stat().st_size, "bytes")
