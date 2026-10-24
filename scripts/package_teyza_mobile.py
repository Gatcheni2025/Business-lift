"""Package only the isolated mobile service and its deployment helpers."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
files=[root/'firebase.teyza-mobile-v39.json']
files += [p for p in (root/'services/teyza-mobile-v39').rglob('*') if p.is_file()
          and 'node_modules' not in p.parts and not p.name.endswith('debug.log')]
files += [root/'docs/TEYZA_R312_SELLER_EXPERIENCE.md',root/'DEPLOY-MOBILE.ps1',root/'SETUP-VERIFICATION-KEY.ps1']
out=root/'TEYZA_MOBILE_R312_DEPLOY_KIT.zip'
with ZipFile(out,'w',ZIP_DEFLATED) as archive:
 for path in files:archive.write(path,path.relative_to(root))
 archive.write(root/'services/teyza-mobile-v39/DEPLOY.md','README-START-HERE.md')
print(out.name, out.stat().st_size, 'bytes')
