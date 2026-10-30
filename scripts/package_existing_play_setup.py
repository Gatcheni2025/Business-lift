"""Stage the setup helper for Teyza's existing Play listing; never include keys."""
from pathlib import Path
import hashlib
import json
import shutil

root = Path(__file__).resolve().parents[1]
out = root / 'build/teyza-existing-play-setup'
if out.exists():
    shutil.rmtree(out)
out.mkdir(parents=True)
files = {
    'CONNECT-PLAY-PACKAGE.ps1': 'tools/store-release/CONNECT-PLAY-PACKAGE.ps1',
    'SET-STORE-SIGNING.ps1': 'tools/store-release/SET-STORE-SIGNING.ps1',
    'README-START-HERE.md': 'docs/TEYZA_EXISTING_PLAY_APP.md',
}
hashes = {}
for target, source in files.items():
    shutil.copy2(root / source, out / target)
    hashes[target] = hashlib.sha256((out / target).read_bytes()).hexdigest()
(out / 'FILE-HASHES.json').write_text(json.dumps(hashes, indent=2) + '\n')
print('Existing Play app setup staged: public helper, key-import helper and guide; no keystore, passwords or first-key generator.')
