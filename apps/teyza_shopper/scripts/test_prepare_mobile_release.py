import importlib.util
import os
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare_mobile_release.py'))
prepare=importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class NativePermissionTests(unittest.TestCase):
    def test_android_background_registration_and_consent(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'TEYZA_FIREBASE_ANDROID_APP_ID':'1:983479810697:android:aabbcc'}):
            prepare.ROOT=Path(folder)
            manifest=prepare.ROOT/'android/app/src/main/AndroidManifest.xml';manifest.parent.mkdir(parents=True)
            manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>')
            gradle=prepare.ROOT/'android/app/build.gradle.kts';gradle.write_text('applicationId = "za.co.teyza.teyza_shopper"\nminSdk = flutter.minSdkVersion')
            prepare.android('test')
            root=ET.parse(manifest).getroot();key='{http://schemas.android.com/apk/res/android}'
            permissions={p.get(key+'name') for p in root.findall('uses-permission')}
            self.assertIn('android.permission.CAMERA',permissions);self.assertIn('android.permission.POST_NOTIFICATIONS',permissions)
            self.assertEqual(root.find('uses-feature').get(key+'required'),'false')
            metadata={p.get(key+'name'):p.get(key+'value') for p in root.find('application').findall('meta-data')}
            self.assertEqual(metadata['firebase_messaging_auto_init_enabled'],'false')
            values=ET.parse(prepare.ROOT/'android/app/src/main/res/values/teyza_firebase.xml').getroot()
            self.assertEqual({v.get('name'):v.text for v in values}['google_app_id'],'1:983479810697:android:aabbcc')
    def test_ios_push_and_camera_configuration_precedes_app_launch(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'TEYZA_FIREBASE_IOS_APP_ID':'1:983479810697:ios:aabbcc'}):
            prepare.ROOT=Path(folder);runner=prepare.ROOT/'ios/Runner';runner.mkdir(parents=True)
            (runner/'Info.plist').write_bytes(plistlib.dumps({}))
            (runner/'AppDelegate.swift').write_text('import Flutter\nreturn super.application(application, didFinishLaunchingWithOptions: launchOptions)')
            project=prepare.ROOT/'ios/Runner.xcodeproj/project.pbxproj';project.parent.mkdir();project.write_text('PRODUCT_BUNDLE_IDENTIFIER = za.co.teyza.shopper;\nINFOPLIST_FILE = Runner/Info.plist;\nIPHONEOS_DEPLOYMENT_TARGET = 13.0;')
            (prepare.ROOT/'ios/Podfile').write_text("# platform :ios, '13.0'\nflutter_additional_ios_build_settings(target)")
            prepare.ios();info=plistlib.loads((runner/'Info.plist').read_bytes())
            self.assertIn('NSCameraUsageDescription',info);self.assertIn('remote-notification',info['UIBackgroundModes'])
            self.assertFalse(info['FirebaseMessagingAutoInitEnabled']);self.assertEqual(info['TeyzaFirebaseAppId'],'1:983479810697:ios:aabbcc')
            self.assertEqual(plistlib.loads((runner/'Runner.entitlements').read_bytes())['aps-environment'],'production')
            delegate=(runner/'AppDelegate.swift').read_text();self.assertLess(delegate.index('FirebaseApp.configure'),delegate.index('return super.application'))
    def test_website_or_other_project_app_id_is_rejected(self):
        with patch.dict(os.environ,{'TEYZA_FIREBASE_ANDROID_APP_ID':'1:983479810697:web:aabbcc'}):
            with self.assertRaises(SystemExit):prepare.native_app_id('android')


if __name__=='__main__':unittest.main()
