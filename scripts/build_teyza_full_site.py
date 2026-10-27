#!/usr/bin/env python3
"""Create one consistent, deployable TEYZA public website release ZIP.

Does not include secret files, Firebase deployment configuration, or user data.
Deploy into the directory that contains the live index.html (not a subfolder).
"""
from __future__ import annotations
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from zipfile import ZipFile, ZIP_DEFLATED
import json
import re
from build_teyza_favicon import create_favicon

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
RELEASE = "TEYZA_FULL_SITE_R3_20261020"
ZIP_PATH = DIST / "TEYZA_FULL_WEBSITE_R3_READY_TO_EXTRACT.zip"
EXCLUDE = {
    # Public Firebase Web SDK config is REQUIRED by login and account modules.
    # Include js/firebase-config.js and js/firebase-settings.js in deployment.
    # These are client-side project identifiers, NOT secret server credentials.
    "api/teyza-firebase-verify.php",  # preserve live Firebase verification/server settings
}
SKIP = ("uploads/", "private_html/", "node_modules/", ".git/", "apps/", ".github/")
MANAGED = (
    "Every top-level .html page",
    "All assets/** shared CSS, SVG and frontend assets",
    "All js/*.js including required public Firebase client configuration",
    "A classic favicon.ico generated from the same growing-Y SVG",
    "All api/*.php except existing server authentication helper",
    "Public top-level PHP endpoints, robots.txt, and sitemap.xml",
)
def public_paths() -> list[Path]:
    candidates = []
    candidates.extend(ROOT.glob("*.html"))
    candidates.extend(ROOT.glob("*.php"))
    for directory, pattern in [("assets", "*"), ("js", "*.js"), ("api", "*.php")]:
        candidates.extend(p for p in ((ROOT / directory).rglob(pattern) if directory == "assets" else (ROOT / directory).glob(pattern)) if p.is_file())
    candidates.extend([ROOT / "robots.txt", ROOT / "sitemap.xml"])
    return sorted({p.relative_to(ROOT) for p in candidates if p.exists()
        and p.relative_to(ROOT).as_posix() not in EXCLUDE
        and not p.relative_to(ROOT).as_posix().startswith(SKIP)})

def bust_local_assets(html: str) -> str:
    # Version all same-origin front-end CSS/JS/SVG resources without touching
    # full-page routes, external providers, data URLs or seller action links.
    rx = re.compile(r'(?P<pre>(?:href|src)\s*=\s*["\'])(?P<url>(?:assets|js)/[^"\'<>\s]+)(?P<post>["\'])')
    def rewrite(match: re.Match[str]) -> str:
        uri = urlsplit(match.group("url"))
        if not uri.path.lower().endswith((".css", ".js", ".svg", ".png", ".jpg", ".webp")):
            return match.group(0)
        qs = [(key, val) for key, val in parse_qsl(uri.query, keep_blank_values=True) if key != "teyza_release"]
        qs.append(("teyza_release", RELEASE))
        bumped = urlunsplit(("", "", uri.path, urlencode(qs), uri.fragment))
        return match.group("pre") + bumped + match.group("post")
    return rx.sub(rewrite, html)

def checked_pages(entries: dict[str,bytes]) -> None:
    required = [
      "index.html","dashboard.html","business-profile.html",
      "seller-activation.html","retailer-dashboard.html",
      "admin-sellers.html","teyza-release-check.html",
      "assets/workspace.js","assets/workspace.css",
      "assets/teyza-sprout-wordmark.svg","assets/spaza-onboarding.css",
      "js/guard.js","js/landing-auth.js","js/business-profile.js",
      "js/firebase-settings.js","js/firebase-config.js","js/landing-firebase.js",
      "js/dashboard-data.js","js/spaza-activation.js","api/workspace.php",
    ]
    required.append("favicon.ico")
    missing = [n for n in required if not entries.get(n)]
    if missing: raise SystemExit("Missing release files: " + ", ".join(missing))
    dash = entries["dashboard.html"].decode()
    if 'id="teyzaOnboarding"' in dash or "data-ob-business-frame" in dash:
        raise SystemExit("ERROR: old nested iframe onboarding still inside dashboard")
    if RELEASE not in dash:
        raise SystemExit("Dashboard is missing the R3 source release marker")
    if "onboarding-v2.js" in dash or "dashboard-onboarding.js" in dash:
        raise SystemExit("ERROR: legacy onboarding module still imported on Spaza dashboard")
    if "SPAZA_QUICK_SETUP_20261020" not in dash:
        raise SystemExit("Spaza dashboard quick-setup compatibility marker absent")
    js = entries["assets/workspace.js"].decode()
    if "teyza-sprout-wordmark-light.svg" not in js or "teyza-logo-mark" in js:
        raise SystemExit("Legacy T-logo renderer still present")
    # Check relative <script src> and <link href> references to managed file roots.
    for name, body in entries.items():
        if not name.endswith(".html"): continue
        source = body.decode()
        for link in re.findall(r'(?:href|src)\s*=\s*["\'](/?(?:assets|js)/[^"\']+)["\']', source):
            resource = urlsplit(link).path.lstrip("/")
            if resource in EXCLUDE: continue
            if resource not in entries:
                raise SystemExit(f"Missing referenced asset in {name}: {resource}")

def main() -> None:
    DIST.mkdir(exist_ok=True)
    entries: dict[str,bytes] = {}
    for path in public_paths():
        name = path.as_posix()
        raw = (ROOT / path).read_bytes()
        if name.endswith(".html"):
            html = raw.decode("utf-8")
            html = html.replace("<head>",f'<head>\n<meta name="teyza-full-release" content="{RELEASE}">',1)
            html = bust_local_assets(html)
            raw = html.encode("utf-8")
        entries[name] = raw
    entries["favicon.ico"] = create_favicon(ROOT / "assets" / "teyza-icon.svg")
    checked_pages(entries)
    installed = {
      "release":RELEASE,
      "created_at_utc":datetime.now(timezone.utc).isoformat(timespec="seconds"),
      "release_type":"full_public_website_overlay",
      "files":{k:{"sha256":sha256(v).hexdigest(),"bytes":len(v)} for k,v in sorted(entries.items())},
      "preserved_not_overwritten":sorted(EXCLUDE),
      "managed":list(MANAGED),
    }
    entries["teyza-full-release-manifest.json"] = json.dumps(installed,indent=2).encode()
    entries["README-INSTALL-TEYZA-R3.txt"] = (
      "TEYZA FULL WEBSITE R3 — IMPORTANT DEPLOYMENT INSTRUCTIONS\n\n"
      "1. Back up the current active teyza.co.za document root and private_html.\n"
      "2. Extract THIS ZIP directly into the folder holding the live index.html and dashboard.html.\n"
      "   Do not upload without extracting; do not extract into another nested folder.\n"
      "3. Overwrite matching public HTML, JS, CSS and PHP files. Do not delete other files.\n"
      "4. Public Firebase JS config and favicon are included. If your Firebase settings\n"
      "   differ on the live domain, back them up and reconcile the project before replacing.\n"
      "   Preserve api/teyza-firebase-verify.php, private_html/, uploads/ and .htaccess.\n"
      "5. Visit https://teyza.co.za/teyza-release-check.html and confirm every check is green.\n"
      "6. If the old nested verification popup remains, ensure the dashboard.html you are viewing\n"
      "   contains the R3 marker in View Source, and clear hosting/CDN/browser caches.\n"
      "7. Test Spaza Google/email login, OTP, ID/photo camera, location, admin approval and R99\n"
      "   mandate-link display; test Other Retail / Wholesale separately before production release.\n"
      "8. R99 mandate collection is NOT live until an approved payment provider is configured.\n"
      "   No automatic debit is started or guaranteed by these files.\n"
      "\nManifest: teyza-full-release-manifest.json\n"
    ).encode("utf-8")
    with ZipFile(ZIP_PATH, "w", ZIP_DEFLATED, compresslevel=8) as zf:
        for name, content in sorted(entries.items()):
            zf.writestr(name,content)
    with ZipFile(ZIP_PATH) as zf:
        bad=zf.testzip()
        if bad:raise SystemExit(f"Corrupt ZIP entry: {bad}")
        assert len(zf.namelist())==len(entries)
    print(f"R3 complete: {ZIP_PATH.name} | {len(entries)} public files | {ZIP_PATH.stat().st_size} bytes")
    print("No nested directory and no secret/live config replacements.")
if __name__=="__main__": main()
