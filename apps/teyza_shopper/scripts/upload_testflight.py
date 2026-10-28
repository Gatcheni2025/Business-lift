"""Upload an existing, hash-verified signed release IPA to Apple, without rebuilding."""
import base64
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import tempfile
import zipfile


def verify(folder):
    folder = Path(folder)
    manifest = json.loads((folder / 'release-manifest.json').read_text())
    if (manifest.get('platform'), manifest.get('signing'), manifest.get('bundleId')) != (
            'ios', 'signed', 'za.co.teyza.shopper'):
        raise ValueError('Expected a signed Teyza iOS release')
    packages = list(folder.glob('*.ipa'))
    if len(packages) != 1:
        raise ValueError('Expected exactly one signed IPA')
    package = packages[0]
    if hashlib.sha256(package.read_bytes()).hexdigest() != manifest['sha256'].get(package.name):
        raise ValueError('IPA does not match the release hash')
    with zipfile.ZipFile(package) as archive:
        infos = [p for p in archive.namelist() if re.fullmatch(r'Payload/[^/]+\.app/Info.plist', p)]
        if len(infos) != 1:
            raise ValueError('Expected one main iOS app')
        info = plistlib.loads(archive.read(infos[0]))
    version = str(info['CFBundleShortVersionString']) + '+' + str(info['CFBundleVersion'])
    if info['CFBundleIdentifier'] != 'za.co.teyza.shopper' or version != manifest['version']:
        raise ValueError('IPA identity/version does not match release manifest')
    print('Verified Teyza iOS ' + version, flush=True)
    return package


def main():
    package = verify(sys.argv[1])
    required = ['TEYZA_ASC_KEY_ID', 'TEYZA_ASC_ISSUER_ID', 'TEYZA_ASC_PRIVATE_KEY']
    if any(not os.environ.get(key) for key in required):
        raise ValueError('Missing App Store Connect upload credentials')
    key_id = os.environ['TEYZA_ASC_KEY_ID'].strip()
    if not re.fullmatch(r'[A-Za-z0-9]+', key_id):
        raise ValueError('Invalid Apple API key ID')
    private_key = os.environ['TEYZA_ASC_PRIVATE_KEY'].strip()
    if '-----BEGIN PRIVATE KEY-----' not in private_key:
        private_key = base64.b64decode(private_key, validate=True).decode()
    if '-----BEGIN PRIVATE KEY-----' not in private_key or '-----END PRIVATE KEY-----' not in private_key:
        raise ValueError('Apple private key must be PEM or base64 PEM')
    with tempfile.TemporaryDirectory(prefix='teyza-asc-') as directory:
        key_path = Path(directory) / ('AuthKey_' + key_id + '.p8')
        key_path.write_text(private_key + '\n')
        key_path.chmod(0o600)
        env = dict(os.environ, API_PRIVATE_KEYS_DIR=directory)
        auth = ['--apiKey', key_id, '--apiIssuer', os.environ['TEYZA_ASC_ISSUER_ID'].strip()]
        for operation in ['--validate-app', '--upload-app']:
            subprocess.run(['xcrun', 'altool', operation, '--type', 'ios', '--file', str(package), *auth],
                           env=env, check=True)
    print('Apple upload accepted. Apple processing and tester availability are separate steps.')


if __name__ == '__main__':
    main()
