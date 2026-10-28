import os
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
from configure_facebook import configure

class FacebookConfigurationTests(unittest.TestCase):
    def fixture(self,root):
        (root/'pubspec.yaml').write_text('name: test\ndependencies:\n  flutter:\n    sdk: flutter\n')
        manifest=root/'android/app/src/main/AndroidManifest.xml';manifest.parent.mkdir(parents=True)
        (root/'android/build.gradle.kts').write_text('allprojects { repositories { google() } }\n')
        manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><queries><package android:name="keep.me"/></queries><application android:label="Teyza"><activity android:name="MainActivity"/></application></manifest>')
        info=root/'ios/Runner/Info.plist';info.parent.mkdir(parents=True)
        info.write_bytes(plistlib.dumps({'CFBundleURLTypes':[{'CFBundleURLSchemes':['com.googleusercontent.apps.keep','app-1-firebase']}]}))
    def test_absent_configuration_does_not_install_or_initialise_meta_sdk(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'TEYZA_FACEBOOK_APP_ID':'','TEYZA_FACEBOOK_CLIENT_TOKEN':''}):
            root=Path(folder);self.fixture(root)
            self.assertFalse(configure(root,'android'))
            self.assertNotIn('flutter_facebook_auth:',(root/'pubspec.yaml').read_text())
            self.assertIn('facebookConfigured=false',(root/'lib/facebook_bridge.dart').read_text())
            self.assertNotIn('com.facebook.sdk',(root/'android/app/src/main/AndroidManifest.xml').read_text())
    def test_partial_credentials_stop_before_changing_the_app(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'TEYZA_FACEBOOK_APP_ID':'123456789','TEYZA_FACEBOOK_CLIENT_TOKEN':''}):
            root=Path(folder);self.fixture(root);before=(root/'pubspec.yaml').read_bytes()
            with self.assertRaises(SystemExit):configure(root,'android')
            self.assertEqual(before,(root/'pubspec.yaml').read_bytes())
    def test_configured_android_preserves_existing_routes_and_disables_ad_event_collection(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'TEYZA_FACEBOOK_APP_ID':'123456789','TEYZA_FACEBOOK_CLIENT_TOKEN':'synthetic-client-token'}):
            root=Path(folder);self.fixture(root);self.assertTrue(configure(root,'android'));configure(root,'android')
            source=(root/'pubspec.yaml').read_text();self.assertEqual(source.count('flutter_facebook_auth:'),1)
            manifest=ET.parse(root/'android/app/src/main/AndroidManifest.xml').getroot();key='{http://schemas.android.com/apk/res/android}'
            self.assertEqual(manifest.find('queries/package').get(key+'name'),'keep.me')
            metadata={m.get(key+'name'):m.get(key+'value') for m in manifest.findall('application/meta-data')}
            self.assertEqual(metadata['com.facebook.sdk.AdvertiserIDCollectionEnabled'],'false')
            self.assertEqual(metadata['com.facebook.sdk.AutoLogAppEventsEnabled'],'false')
            self.assertIn('JVM_11',(root/'android/teyza-facebook-jvm.gradle').read_text())
            self.assertNotIn('validation.mode',(root/'android/teyza-facebook-jvm.gradle').read_text())
            self.assertEqual((root/'android/build.gradle.kts').read_text().count('apply(from = \"teyza-facebook-jvm.gradle\")'),1)
            self.assertIn('LoginTracking.limited',(root/'lib/facebook_bridge.dart').read_text())
    def test_ios_merges_apple_google_and_facebook_configuration(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'TEYZA_FACEBOOK_APP_ID':'123456789','TEYZA_FACEBOOK_CLIENT_TOKEN':'synthetic-client-token'}):
            root=Path(folder);self.fixture(root);configure(root,'ios');configure(root,'ios')
            info=plistlib.loads((root/'ios/Runner/Info.plist').read_bytes());schemes=[s for entry in info['CFBundleURLTypes'] for s in entry['CFBundleURLSchemes']]
            self.assertIn('com.googleusercontent.apps.keep',schemes);self.assertIn('app-1-firebase',schemes);self.assertEqual(schemes.count('fb123456789'),1)
            self.assertFalse(info['FacebookAutoLogAppEventsEnabled']);self.assertFalse(info['FacebookAdvertiserIDCollectionEnabled'])
            self.assertNotIn('NSUserTrackingUsageDescription',info)
if __name__=='__main__':unittest.main()
