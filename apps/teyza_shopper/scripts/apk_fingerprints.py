"""Export public test-certificate fingerprints; never export the keystore."""
import glob
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
root=Path(__file__).resolve().parents[1]
apk=root/'build/app/outputs/flutter-apk/app-arm64-v8a-release.apk'
executables=glob.glob(os.environ['ANDROID_HOME']+'/build-tools/*/apksigner')
if not executables:raise SystemExit('Android signing verifier unavailable')
report=subprocess.check_output([sorted(executables)[-1],'verify','--print-certs',str(apk)],text=True)
values={}
for key,label,length in [('sha1','SHA-1',40),('sha256','SHA-256',64)]:
    match=re.search(r'Signer #1 certificate '+label+r' digest: ([0-9a-fA-F]{'+str(length)+r'})',report)
    if not match:raise SystemExit('Missing verified certificate fingerprint: '+key)
    values[key]=match.group(1).upper()
values.update({'applicationId':'za.co.teyza.teyza_shopper','signing':'android-test-only',
    'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'sourceCommit':os.environ.get('GITHUB_SHA','')})
(apk.parent/'test-signing-fingerprints.json').write_text(json.dumps(values,indent=2)+'\n')
print('Public Android test-certificate fingerprints exported.')
