"""Fail a release if any merged AAB/APK manifest contains ad permissions."""
from pathlib import Path
import sys
import zipfile
FORBIDDEN=('com.google.android.gms.permission.AD_ID','android.permission.ACCESS_ADSERVICES_AD_ID',
           'android.permission.ACCESS_ADSERVICES_ATTRIBUTION','android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE','android.permission.ACCESS_ADSERVICES_TOPICS')
def check(path):
    path=Path(path)
    with zipfile.ZipFile(path) as package:
        manifests=[n for n in package.namelist() if n=='AndroidManifest.xml' or n.endswith('/manifest/AndroidManifest.xml')]
        if not manifests:raise ValueError('No merged Android manifest found in '+path.name)
        for name in manifests:
            data=package.read(name)
            # AAB manifests use protobuf UTF-8; APK AXML string pools can use
            # UTF-8 or UTF-16LE. Reject the permission name in either encoding.
            for permission in FORBIDDEN:
                if any(permission.encode(enc) in data for enc in ('utf-8','utf-16le')):
                    raise ValueError(path.name+': merged manifest contains '+permission)
    print(path.name+': merged manifests contain no advertising-ID/AdServices permissions')
if __name__=='__main__':
    if len(sys.argv)<2:raise SystemExit('Pass one or more built AAB/APK paths.')
    for arg in sys.argv[1:]:check(arg)
