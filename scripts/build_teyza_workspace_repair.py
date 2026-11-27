#!/usr/bin/env python3
"""Package a targeted, no-data-loss Teyza PHP workspace repair."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
zip_path = root / "TEYZA_PHP_WORKSPACE_500_SAFE_REPAIR.zip"
instructions = """TEYZA PHP WORKSPACE 500 — TARGETED REPAIR

BACK UP the live website and private_html/teyza-data before deploying.

1. In cPanel find the live document root containing index.html.
2. Upload and extract TEYZA_PHP_WORKSPACE_500_SAFE_REPAIR.zip there.
   The only automatically replaced file is api/workspace.php. It now
   supplies safe, specific server error codes and protects saved records.
3. Open https://teyza.co.za/api/teyza-server-health.php
   Check PHP >= 8.1, presence of the Firebase verifier, availability
   and permissions of the existing private_html/teyza-data.
4. ONLY IF firebase_verifier_present is false: copy the file from
   OPTIONAL_RESTORE_IF_MISSING/teyza-firebase-verify.php into api/
   as api/teyza-firebase-verify.php. Confirm Firebase project settings.
   Never overwrite an existing live helper without a backup.
5. If php_at_least_8_1 is false, set PHP 8.2 or 8.3 in cPanel
   after verifying compatibility with other hosted PHP applications.
6. If private_html or teyza-data is missing or unreadable, inspect
   the original folder and its backup. Do NOT create empty replacement
   seller records, move private files into public_html or chmod 777.
7. Sign in and look for a named error code. Check hosting PHP logs
   for TEYZA_WORKSPACE_*. Never share Firebase tokens or seller JSON.
8. Delete api/teyza-server-health.php once the issue is resolved.

The optional authentication helper is deliberately in a separate folder.
No customer data, database, or banking information is in this package.
"""
items = {
    "api/workspace.php": root / "api" / "workspace.php",
    "api/teyza-server-health.php": root / "api" / "teyza-server-health.php",
    "OPTIONAL_RESTORE_IF_MISSING/teyza-firebase-verify.php":
        root / "api" / "teyza-firebase-verify.php",
}
with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
    for name, source in items.items():
        if not source.is_file():
            raise SystemExit("Missing " + str(source))
        archive.write(source, name)
    archive.writestr("README_REPAIR_500.txt", instructions)
with ZipFile(zip_path) as archive:
    if archive.testzip() is not None:
        raise SystemExit("Corrupt repair ZIP")
    assert set(archive.namelist()) == set(items) | {"README_REPAIR_500.txt"}
print(f"Validated {zip_path.name} ({zip_path.stat().st_size} bytes)")
