"""Build a reviewed, no-secrets, single-folder Teyza seller membership pilot kit.

No Firebase operations, Paystack calls or deployment occur here.
"""
from pathlib import Path
import hashlib, json, zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "TEYZA_SELLER_WEBSITE_PILOT_20261106.zip"
ENTRIES = {}

def include_file(file: Path, target: str):
    if not file.is_file():
        raise SystemExit(f"Required file missing: {file}")
    if file.name.startswith(".") or file.suffix.lower() in {".pem", ".p8", ".p12", ".jks", ".keystore", ".key", ".log"}:
        raise SystemExit(f"Refused secret or hidden file: {file}")
    if "node_modules" in file.parts or "__pycache__" in file.parts:
        raise SystemExit(f"Refused generated dependency: {file}")
    data = file.read_bytes()
    if target in ENTRIES:
        raise SystemExit(f"Duplicate pilot path: {target}")
    ENTRIES[target] = data

def include_tree(directory: str, target: str):
    origin = ROOT / directory
    if not origin.is_dir():
        raise SystemExit(f"Required source directory missing: {directory}")
    for item in sorted(origin.rglob("*")):
        if not item.is_file() or any(part.startswith(".") for part in item.relative_to(origin).parts):
            continue
        if "node_modules" in item.parts or "__pycache__" in item.parts or item.suffix.lower() in {
            ".pem", ".p8", ".p12", ".jks", ".keystore", ".key", ".log"
        }:
            continue
        include_file(item, target.rstrip("/") + "/" + item.relative_to(origin).as_posix())

# The website helper expects a public/ tree. The admin helper prefers web/teyza-admin/public.
include_tree("web/app-first/public", "public")
include_tree("web/app-first/public", "web/app-first/public")
include_tree("web/teyza-admin/public", "web/teyza-admin/public")
include_tree("services/teyza-mobile-v39", "services/teyza-mobile-v39")
include_tree("tools/admin-release", "tools/admin-release")
include_tree("tools/app-first-release", "tools/app-first-release")
include_tree("tools/seller-access", "tools/seller-access")
for p in [
    "DEPLOY-OPERATIONS.ps1",
    "firebase.teyza-mobile-v39.json",
    "CHECK-PILOT.ps1",
    "tools/app-first-release/DEPLOY-WEBSITE.ps1",
    "tools/app-first-release/ROLLBACK-WEBSITE.ps1",
    "docs/TEYZA_SELLER_WEBSITE_PILOT_RELEASE.md",
    "docs/TEYZA_WEBSITE_SELLER_MEMBERSHIP.md",
    "docs/TEYZA_LIVE_PAYSTACK_READINESS.md",
    "docs/TEYZA_R323_SELLER_APPROVAL_AND_TESTING.md",
]:
    name = p
    if p.startswith("tools/app-first-release/") and p.endswith(".ps1"):
        name = Path(p).name
    if p == "docs/TEYZA_SELLER_WEBSITE_PILOT_RELEASE.md":
        name = "START-HERE-PILOT.md"
    include_file(ROOT / p, name)
assert "public/js/seller-web-billing.mjs" in ENTRIES
assert "web/teyza-admin/public/admin.html" in ENTRIES
assert "tools/seller-access/read-live-rules.mjs" in ENTRIES
assert "services/teyza-mobile-v39/billing-paystack.js" in ENTRIES
assert "DEPLOY-OPERATIONS.ps1" in ENTRIES
assert not any("/.env" in name or "secret" in name.lower() or
               "serviceaccount" in name.lower() or "node_modules" in name
               for name in ENTRIES)
ENTRIES["FILE-HASHES.json"] = (json.dumps({
    path: hashlib.sha256(data).hexdigest() for path,data in sorted(ENTRIES.items())
},indent=2)+"\n").encode()
OUT.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(OUT,"w",zipfile.ZIP_DEFLATED) as z:
    for name,data in sorted(ENTRIES.items()):
        z.writestr(name,data)
with zipfile.ZipFile(OUT) as z:
    assert z.testzip() is None
    hashes=json.loads(z.read("FILE-HASHES.json"))
    for name,digest in hashes.items():
        assert hashlib.sha256(z.read(name)).hexdigest()==digest
print(OUT.name,len(ENTRIES),"files",OUT.stat().st_size,"bytes; hashes verified; no secrets; no deployment")
