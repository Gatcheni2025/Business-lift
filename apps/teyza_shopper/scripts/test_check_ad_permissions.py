from pathlib import Path
import tempfile
import unittest
import zipfile
from check_ad_permissions import check,FORBIDDEN
class BuiltManifestTests(unittest.TestCase):
 def test_sdk_permissions_fail_for_aab_and_both_apk_string_formats(self):
  for name,encoding in [('base/manifest/AndroidManifest.xml','utf-8'),('feature/manifest/AndroidManifest.xml','utf-8'),('AndroidManifest.xml','utf-8'),('AndroidManifest.xml','utf-16le')]:
   for permission in FORBIDDEN:
    with self.subTest(name=name,encoding=encoding,permission=permission),tempfile.TemporaryDirectory() as folder:
     path=Path(folder)/'app.zip'
     with zipfile.ZipFile(path,'w') as z:z.writestr(name,b'\0'+permission.encode(encoding))
     with self.assertRaisesRegex(ValueError,'contains'):check(path)
 def test_clean_manifests_pass_and_absent_manifests_fail(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'app.aab'
   with zipfile.ZipFile(path,'w') as z:z.writestr('base/manifest/AndroidManifest.xml','android.permission.CAMERA')
   check(path)
   with zipfile.ZipFile(path,'w') as z:z.writestr('unrelated.txt','hello')
   with self.assertRaisesRegex(ValueError,'No merged'):check(path)
if __name__=='__main__':unittest.main()
