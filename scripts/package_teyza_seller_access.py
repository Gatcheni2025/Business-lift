from pathlib import Path
import zipfile

root=Path(__file__).resolve().parents[1]
files=['repair-seller-rules.mjs','seller-account.rules','seller-drafts.rules',
       'DEPLOY-SELLER-ACCESS.ps1','README-START-HERE.md']
target=root/'TEYZA_SELLER_ACCESS_R310_REPAIR.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root/'tools/seller-access'/name,name)
print(target.name)
