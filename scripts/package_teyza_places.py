"""Package the isolated Places codebase without credentials or unrelated hosting."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
paths = [root / 'firebase.teyza-places-v34.json', root / 'VERIFY-PLACES.ps1']
paths += [root / 'services/teyza-places-v34' / name for name in
          ['index.js', 'places.js', 'places.test.js', 'package.json', 'DEPLOY.md']]
target = root / 'TEYZA_PLACES_R36_DEPLOY_KIT.zip'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in paths:
        archive.write(path, path.relative_to(root).as_posix())
    archive.writestr('README-FIRST.md', (root / 'services/teyza-places-v34/DEPLOY.md').read_text())
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert 'services/teyza-places-v34/places.js' in archive.namelist()
print(target.name)
