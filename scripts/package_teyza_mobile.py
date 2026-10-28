"""Package only the isolated mobile service and its deployment helpers."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import shutil
root=Path(__file__).resolve().parents[1]
files=[root/'firebase.teyza-mobile-v39.json']
files += [p for p in (root/'services/teyza-mobile-v39').rglob('*') if p.is_file()
          and 'node_modules' not in p.parts and not p.name.endswith('debug.log')]
files += [root/'docs/TEYZA_CATALOGUE_EXPANSION.md',root/'docs/TEYZA_CATALOGUE_IMAGES.md',root/'docs/TEYZA_ADDRESS_AUTOCOMPLETE.md',root/'docs/TEYZA_SHOP_PUBLICATION.md',root/'docs/TEYZA_SELLER_WORKSPACE.md',root/'docs/TEYZA_SELLER_MARKETPLACE.md',root/'docs/TEYZA_R313_SELLER_ONBOARDING.md',root/'docs/TEYZA_R315_UPLOADS_AND_RELEASE.md',root/'DEPLOY-MOBILE.ps1',root/'SETUP-VERIFICATION-KEY.ps1',root/'ACTIVATE-TEYZA.ps1']
stage=root/'build/teyza-mobile-deploy'
if stage.exists():shutil.rmtree(stage)
for path in files:
 target=stage/path.relative_to(root);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
shutil.copy2(root/'docs/TEYZA_CATALOGUE_EXPANSION.md',stage/'README-START-HERE.md')
out=root/'TEYZA_MOBILE_R315_DEPLOY_KIT.zip'
with ZipFile(out,'w',ZIP_DEFLATED) as archive:
 for path in files:archive.write(path,path.relative_to(root))
 archive.write(root/'docs/TEYZA_CATALOGUE_EXPANSION.md','README-START-HERE.md')
print(out.name, out.stat().st_size, 'bytes')
