#!/usr/bin/env python3
"""TEYZA read-only private storage check and public-record emergency protection.

This ZIP never moves, reads, or overwrites customer data.
The archive contains only a temporary diagnostics endpoint, an optional
scoped Apache/LiteSpeed deny rule, and written hosting instructions.
"""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root=Path(__file__).resolve().parents[1]
dest=root/"TEYZA_STORAGE_PATH_DIAGNOSTIC_R1.zip"
instructions="""TEYZA PRIVATE DATA / CHAT 500-503 DIAGNOSTIC

URGENT PRIVACY NOTE
An earlier public_html backup contained seller JSON under
public_html/teyza-data/, but Teyza PHP reads seller records from
the sibling private_html/teyza-data/. This may be a mismatch and may
make private seller records reachable over HTTP. Verify on LIVE hosting.

STEP 1 — MAKE A PRIVATE BACKUP
Using cPanel File Manager, create/download a secure backup of the
actual seller JSON and chat data. Never upload this backup into
public_html, email it, or share sensitive account records.

STEP 2 — BLOCK PUBLIC RECORD ACCESS
If an existing public_html/teyza-data directory is present,
place the OPTIONAL_PUBLIC_FOLDER_PROTECTION/teyza-data/.htaccess file
inside THAT existing directory, not in the root public_html.
The scoped rule denies direct HTTP access to seller records. It is
only temporary defense in depth; sensitive JSON must ultimately be
stored outside the website document root.

STEP 3 — INSTALL READ-ONLY DIAGNOSTIC
Upload only api/teyza-server-health.php into the website's LIVE api/
folder. Open:
  https://www.teyza.co.za/api/teyza-server-health.php
The page returns named boolean checks, with NO personal records.

STEP 4 — RESTORE THE ORIGINAL PRIVATE DATA LOCATION
The PHP code expects private_html as a SIBLING of public_html:
  website-root/  (contains public_html/ and private_html/)
  public_html/api/workspace.php
  private_html/teyza-data/*.json
  private_html/teyza-chat/ (for seller chat)
Only if this is the actual hosting folder layout:
- Create/locate private_html outside the web-accessible document root.
- Copy each original seller JSON into private_html/teyza-data if the
  private location is empty. If seller JSON already exists, STOP:
  compare backups and reconcile; NEVER overwrite existing records.
- Make the private tree accessible to the SAME PHP service account
  as the website, following the hosting account's ownership guidance.
- Do NOT use chmod 777 or move data to a public directory.
- Preserve chat data and existing approvals and subscription records.
- Confirm the private folder is not a symlink into public_html.
- Recheck booleans in the health diagnostic.

STEP 5 — RESTORE SERVICE AND REMOVE PUBLIC COPIES
Test sign-in, workspace context, seller readiness and seller inbox.
Only after confirming existing seller records and chats in the private
location, remove any PUBLIC copies of private seller JSON after
keeping a securely stored backup. Never delete private copies.

STEP 6 — REMOVE THE DIAGNOSTIC
Delete public_html/api/teyza-server-health.php once resolved.
This is a temporary support endpoint.

This archive does NOT include or modify workspace.php, chat.php,
Firebase settings, private seller JSON, or the website .htaccess.
"""
files={
  "api/teyza-server-health.php":(root/"api/teyza-server-health.php").read_bytes(),
  "OPTIONAL_PUBLIC_FOLDER_PROTECTION/teyza-data/.htaccess":
    (root/"security/teyza-data-deny.htaccess").read_bytes(),
  "README_STORAGE_500_503.txt":instructions.encode("utf-8"),
}
with ZipFile(dest,"w",ZIP_DEFLATED) as z:
  for name,data in files.items():z.writestr(name,data)
with ZipFile(dest) as z:
  assert z.testzip() is None
  assert set(z.namelist())==set(files)
print("Validated",dest.name,"files",len(files),"bytes",dest.stat().st_size)
