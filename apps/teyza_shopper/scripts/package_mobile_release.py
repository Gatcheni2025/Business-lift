"""Package binaries with hashes and truthful signing status for release review."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tarfile
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / 'build/release'
out.mkdir(parents=True, exist_ok=True)
platform = sys.argv[1]
mode = os.environ.get('SIGNING_MODE', 'unsigned')
version = next(line.split(':', 1)[1].strip() for line in
               (root/'pubspec.yaml').read_text().splitlines() if line.startswith('version:'))
manifest = {'platform': platform, 'version': version, 'signing': mode,
            'commit': os.environ.get('GITHUB_SHA', ''),
            'emailPasswordLogin': True,
            'googleLogin': bool(os.environ.get('TEYZA_GOOGLE_WEB_CLIENT_ID')) and
               (platform == 'android' or bool(os.environ.get('TEYZA_GOOGLE_IOS_CLIENT_ID'))),
            'appleLoginImplemented': platform == 'ios',
            'mobileBackendVersionRequired': '3.13.0',
            'sellerNotificationsImplemented': True, 'adminSellerReviewImplemented': True,
            'nativeSellerRegistration': True, 'sellerIdentityDocuments': True, 'sellerPhoneOtpImplemented': True,
            'deviceOtpVerified': False, 'sellingAfterCompletedSetup': True,
            'pushAppConfigured': bool(os.environ.get('TEYZA_FIREBASE_ANDROID_APP_ID' if platform == 'android' else 'TEYZA_FIREBASE_IOS_APP_ID')),
            'devicePushVerified': False,
            'catalogueProducts': 184, 'catalogueReferencePhotos': 48,
            'storeSubmitted': False, 'deviceLoginVerified': False}
if platform == 'android':
    source = root/'build/app/outputs/bundle/release/app-release.aab'
    with zipfile.ZipFile(source) as bundle:
        signatures = [name for name in bundle.namelist() if name.startswith('META-INF/') and name.endswith('.SF')]
        if bool(signatures) != (mode == 'signed'):
            raise SystemExit('Bundle signature does not match the requested release mode.')
        if 'base/manifest/AndroidManifest.xml' not in bundle.namelist():
            raise SystemExit('Android bundle is missing its base manifest.')
    if mode == 'signed':
        certificate = subprocess.check_output(['keytool', '-printcert', '-jarfile', str(source)], text=True)
        if 'Android Debug' in certificate:
            raise SystemExit('A debug certificate cannot be used as a Play upload key.')
        manifest['certificate'] = certificate
    manifest['applicationId'] = 'za.co.teyza.teyza_shopper'
    target = out/('teyza-'+version.replace('+','-')+'-'+mode+'.aab')
    shutil.copy2(source, target)
else:
    archive = root/'build/ios/archive/Runner.xcarchive'
    app = archive/'Products/Applications/Runner.app'
    with (app/'Info.plist').open('rb') as file:
        info = plistlib.load(file)
    manifest['bundleId'] = info['CFBundleIdentifier']
    if mode == 'signed':
        subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
    target = out/('teyza-'+version.replace('+','-')+'-'+mode+'.xcarchive.tar.gz')
    with tarfile.open(target, 'w:gz') as file:
        file.add(archive, arcname='Runner.xcarchive')
    if mode == 'signed':
        packages = list((root/'build/ios/ipa').glob('*.ipa'))
        if not packages:
            raise SystemExit('Signed mode must produce an IPA, not only an archive.')
        for package in packages:
            shutil.copy2(package, out/package.name)
manifest['sha256'] = {file.name:hashlib.sha256(file.read_bytes()).hexdigest()
                      for file in out.iterdir() if file.is_file()}
(out/'release-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
guide = root/'../../docs/TEYZA_R38_MOBILE_RELEASE.md'
shutil.copy2(guide, out/'README-RELEASE.md')
print(platform+' '+version+' '+mode+' release artifact prepared.')
