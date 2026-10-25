"""Package public store-signing instructions and a local secret-upload helper."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
target=root/'TEYZA_STORE_SIGNING_SETUP.zip'
with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=9) as archive:
    archive.write(root/'tools/store-release/SET-STORE-SIGNING.ps1','SET-STORE-SIGNING.ps1')
    archive.write(root/'docs/TEYZA_STORE_FILES.md','README-START-HERE.md')
with ZipFile(target) as archive:assert archive.testzip() is None
print(target.name,target.stat().st_size,'bytes')
