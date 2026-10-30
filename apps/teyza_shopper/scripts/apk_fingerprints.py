"""Export public test-certificate fingerprints; never export the keystore."""
import glob
import hashlib
import json
import os
import re
from pathlib import Path
import struct
import subprocess
root=Path(__file__).resolve().parents[1]
apk=root/'build/app/outputs/flutter-apk/app-arm64-v8a-release.apk'
executables=glob.glob(os.environ['ANDROID_HOME']+'/build-tools/*/apksigner')
if not executables:raise SystemExit('Android signing verifier unavailable')
subprocess.run([sorted(executables)[-1],'verify',str(apk)],check=True)
badging=subprocess.check_output([str(Path(sorted(executables)[-1]).with_name('aapt')),'dump','badging',str(apk)],text=True)
identity=re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",badging)
version=next(line.split(':',1)[1].strip() for line in (root/'pubspec.yaml').read_text().splitlines() if line.startswith('version:'))
name,code=version.split('+')
if not identity or (identity[1],identity[3])!=('com.asiyedriver.asiye',name) or int(identity[2])<int(code):
    raise SystemExit('The compiled APK does not match the existing Teyza Play package and candidate version.')
def certificate(data):
    end=data.rfind(b'PK\x05\x06')
    if end<0:raise SystemExit('APK ZIP footer missing')
    cd=struct.unpack_from('<I',data,end+16)[0]
    if data[cd-16:cd]!=b'APK Sig Block 42':raise SystemExit('APK signing block missing')
    size=struct.unpack_from('<Q',data,cd-24)[0];pos=cd-size;stop=cd-24
    def lp(block,at):
        length=struct.unpack_from('<I',block,at)[0]
        if at+4+length>len(block):raise SystemExit('Truncated signing certificate')
        return block[at+4:at+4+length],at+4+length
    while pos<stop:
        length=struct.unpack_from('<Q',data,pos)[0]
        identifier=struct.unpack_from('<I',data,pos+8)[0]
        payload=data[pos+12:pos+8+length];pos+=8+length
        if identifier not in (0x7109871a,0xf05368c0):continue
        signers,_=lp(payload,0);signer,_=lp(signers,0);signed,_=lp(signer,0)
        _,at=lp(signed,0);certs,_=lp(signed,at);cert,_=lp(certs,0)
        return cert
    raise SystemExit('No verified v2/v3 signing certificate found')
cert=certificate(apk.read_bytes())
values={'sha1':hashlib.sha1(cert).hexdigest().upper(),'sha256':hashlib.sha256(cert).hexdigest().upper()}
# Flutter's split APKs add an ABI offset to the base version code. Export the
# compiled code and its source code separately; Play's AAB uses the base code.
values.update({'applicationId':identity[1],'versionCode':int(identity[2]),'sourceVersionCode':int(code),'versionName':identity[3],'signing':'android-test-only',
    'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'sourceCommit':os.environ.get('GITHUB_SHA','')})
(apk.parent/'test-signing-fingerprints.json').write_text(json.dumps(values,indent=2)+'\n')
print('Public Android test-certificate fingerprints exported.')
print('Verified compiled APK:',identity[1],version)

