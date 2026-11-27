"""Add a production-key APK alongside the verified signed Android App Bundle."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import subprocess

ROOT=Path(__file__).resolve().parents[1]/'apps/teyza_shopper'

def validate(badging,signature,bundle_certificate,version):
    app=re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",badging)
    name,build=version.split('+')
    if not app or app.groups()!=('com.asiyedriver.asiye',build,name):raise ValueError('APK identity or version differs from the Teyza release.')
    target=re.search(r"targetSdkVersion:'(\d+)'",badging)
    if not target or int(target[1])<36:raise ValueError('The store APK must target Android API 36 or higher.')
    # Build Tools 37 names certificates by signature scheme ("V2 Signer:")
    # instead of the older "Signer #1". Multiple schemes can use the same key.
    # The reported signer count must still be one, and every APK signer digest
    # must match the bundle. A Source Stamp certificate is not an APK signer.
    counts=re.findall(r'^Number of signers: (\d+)\s*$',signature,re.MULTILINE)
    certificates=re.findall(
        r'^(?:Signer #\d+|V[1-4](?:\.\d+)? Signer(?: #\d+)?:)'
        r' certificate SHA-256 digest: ([0-9a-fA-F]{64})\s*$',
        signature,re.MULTILINE)
    if counts!=['1'] or not certificates or 'Android Debug' in signature:
        raise ValueError('A single production upload-key signer is required.')
    pem=re.search(r'-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----',bundle_certificate)
    if not pem:raise ValueError('The signed bundle certificate could not be read.')
    expected=hashlib.sha256(ssl.PEM_cert_to_DER_cert(pem[0])).hexdigest()
    if any(certificate.lower()!=expected for certificate in certificates):
        raise ValueError('The APK and AAB were not signed with the same upload key.')
    return {'applicationId':app[1],'versionCode':int(app[2]),'versionName':app[3],
            'targetSdk':int(target[1]),'certificateSha256':expected}

def main():
    out=ROOT/'build/release';manifest=json.loads((out/'release-manifest.json').read_text())
    if manifest['signing']!='signed':raise SystemExit('Store APK packaging requires a signed AAB first.')
    sdk=Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
    directories=[p for p in (sdk/'build-tools').iterdir() if (p/'apksigner').is_file() and (p/'aapt').is_file()]
    tools=max(directories,key=lambda p:tuple(int(n) for n in re.findall(r'\d+',p.name)))
    apk=ROOT/'build/app/outputs/flutter-apk/app-release.apk'
    bundle=next(out.glob('*-signed.aab'))
    def run(args):return subprocess.check_output([str(a) for a in args],text=True,stderr=subprocess.STDOUT)
    signature=run([tools/'apksigner','verify','--verbose','--print-certs',apk])
    (out/'apk-signature.txt').write_text(signature)
    print('APK certificate verification with Android Build Tools '+tools.name+':',flush=True)
    print(signature,flush=True)
    verified=validate(run([tools/'aapt','dump','badging',apk]),signature,
                      run(['keytool','-printcert','-rfc','-jarfile',bundle]),manifest['version'])
    run([tools/'zipalign','-c','-P','16','4',apk])
    target=out/('teyza-'+manifest['version'].replace('+','-')+'-signed.apk');shutil.copy2(apk,target)
    manifest['androidStoreVerification']=verified
    manifest['apkAlignment16KiBChecked']=True
    manifest['storeFiles']={'googlePlay':bundle.name,'androidDirectInstall':target.name}
    manifest['sha256'][target.name]=hashlib.sha256(target.read_bytes()).hexdigest()
    (out/'release-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Verified production APK and AAB: same Teyza version, application ID and upload-key certificate.')

if __name__=='__main__':main()

