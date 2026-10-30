import importlib.util
import base64
import json
import hashlib
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
        app_id='1:983479810697:android:aabbcc'
        sdk={'project_info':{'project_id':'business-lift-3c19c'},'client':[{'client_info':{'mobilesdk_app_id':app_id,'android_client_info':{'package_name':'com.asiyedriver.asiye'}}}]}
        encoded=base64.b64encode(json.dumps(sdk).encode()).decode()
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'TEYZA_FIREBASE_ANDROID_APP_ID':app_id,'TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64':encoded}):
            prepare.ROOT=Path(folder)
            manifest=prepare.ROOT/'android/app/src/main/AndroidManifest.xml';manifest.parent.mkdir(parents=True)
            manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name=".MainActivity" android:launchMode="singleTop" android:taskAffinity="" /></application></manifest>')
            gradle=prepare.ROOT/'android/app/build.gradle.kts';gradle.write_text('applicationId = "za.co.teyza.teyza_shopper"\nminSdk = flutter.minSdkVersion')
            prepare.android('test')
            root=ET.parse(manifest).getroot();key='{http://schemas.android.com/apk/res/android}'
            permissions={p.get(key+'name') for p in root.findall('uses-permission')}
            self.assertIn('android.permission.CAMERA',permissions);self.assertIn('android.permission.POST_NOTIFICATIONS',permissions)
            self.assertEqual(root.find('uses-feature').get(key+'required'),'false')
            removed={p.get(key+'name') for p in root.findall('uses-permission') if p.get('{http://schemas.android.com/tools}node')=='remove'}
            self.assertEqual(removed,{'com.google.android.gms.permission.AD_ID','android.permission.ACCESS_ADSERVICES_AD_ID','android.permission.ACCESS_ADSERVICES_ATTRIBUTION','android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE','android.permission.ACCESS_ADSERVICES_TOPICS'})
            metadata={p.get(key+'name'):p.get(key+'value') for p in root.find('application').findall('meta-data')}
            self.assertEqual(metadata['firebase_messaging_auto_init_enabled'],'false')
            activity=root.find('application/activity')
            self.assertNotIn(key+'taskAffinity',activity.attrib)
            self.assertEqual(activity.get(key+'launchMode'),'singleTop')
            self.assertEqual(activity.get(key+'name'),'za.co.teyza.teyza_shopper.MainActivity')
            self.assertIn('applicationId = "com.asiyedriver.asiye"',gradle.read_text())
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
            self.assertIn('app-1-983479810697-ios-aabbcc', [s for v in info['CFBundleURLTypes'] for s in v['CFBundleURLSchemes']]);
            self.assertIn('NSCameraUsageDescription',info);self.assertIn('remote-notification',info['UIBackgroundModes'])
            self.assertFalse(info['FirebaseMessagingAutoInitEnabled']);self.assertEqual(info['TeyzaFirebaseAppId'],'1:983479810697:ios:aabbcc')
            self.assertEqual(plistlib.loads((runner/'Runner.entitlements').read_bytes())['aps-environment'],'production')
            delegate=(runner/'AppDelegate.swift').read_text();self.assertLess(delegate.index('FirebaseApp.configure'),delegate.index('return super.application'))
    def test_website_or_other_project_app_id_is_rejected(self):
        with patch.dict(os.environ,{'TEYZA_FIREBASE_ANDROID_APP_ID':'1:983479810697:web:aabbcc'}):
            with self.assertRaises(SystemExit):prepare.native_app_id('android')

    def test_signed_sdk_requires_matching_project_package_and_app(self):
        app_id='1:983479810697:android:aabbcc'
        config={'project_info':{'project_id':'business-lift-3c19c'},'client':[{'client_info':{
          'mobilesdk_app_id':app_id,'android_client_info':{'package_name':'com.asiyedriver.asiye'}}}]}
        encode=lambda:base64.b64encode(json.dumps(config).encode()).decode()
        with patch.dict(os.environ,{'TEYZA_FIREBASE_ANDROID_APP_ID':app_id}):
            self.assertEqual(prepare.validate_android_sdk(encode()),app_id)
            config['client'][0]['client_info']['android_client_info']['package_name']='za.co.teyza.teyza_shopper'
            with self.assertRaises(SystemExit):prepare.validate_android_sdk(encode())
            config['client'][0]['client_info']['android_client_info']['package_name']='com.asiyedriver.asiye'
            config['client'][0]['client_info']['mobilesdk_app_id']='1:983479810697:android:deadbeef'
            with self.assertRaises(SystemExit):prepare.validate_android_sdk(encode())
            config['client'][0]['client_info']['mobilesdk_app_id']=app_id
            config['project_info']['project_id']='another-project'
            with self.assertRaises(SystemExit):prepare.validate_android_sdk(encode())

    def test_signed_android_without_sdk_stops_before_changing_files(self):
        with patch.dict(os.environ,{'TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64':''}):
            with self.assertRaises(SystemExit):prepare.android('signed')

    def test_activated_native_identities_are_available_without_ci_variables(self):
        with patch.dict(os.environ,{'TEYZA_FIREBASE_ANDROID_APP_ID':'','TEYZA_FIREBASE_IOS_APP_ID':'','TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64':''}):
            self.assertEqual(prepare.native_app_id('android'),'')
            self.assertEqual(prepare.native_app_id('ios'),'1:983479810697:ios:4aae4823892dd145db2458')

    def test_legacy_firebase_registration_is_not_reused_for_the_existing_play_app(self):
        app_id='1:983479810697:android:aabbcc'
        sdk={'project_info':{'project_id':'business-lift-3c19c'},'client':[{'client_info':{'mobilesdk_app_id':app_id,'android_client_info':{'package_name':'za.co.teyza.shopper'}}}]}
        with patch.dict(os.environ,{'TEYZA_FIREBASE_ANDROID_APP_ID':app_id,'TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64':base64.b64encode(json.dumps(sdk).encode()).decode()}):
            self.assertEqual(prepare.native_app_id('android'),'')
            with self.assertRaises(SystemExit):prepare.validate_android_sdk(os.environ['TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64'])

    def test_existing_play_upload_key_must_match_the_confirmed_public_certificate(self):
        certificate=b'disposable-public-certificate-fixture'
        expected=hashlib.sha256(certificate).hexdigest()
        settings={'TEYZA_PLAY_UPLOAD_CERT_SHA256':expected,'TEYZA_ANDROID_KEYSTORE_PATH':'fixture.jks','TEYZA_ANDROID_KEY_ALIAS':'fixture','TEYZA_ANDROID_STORE_PASSWORD':'not-a-real-password'}
        with patch.dict(os.environ,settings),patch.object(prepare.subprocess,'check_output',return_value=certificate) as export:
            self.assertEqual(prepare.verify_play_upload_key(),expected)
            self.assertIn('-storepass:env',export.call_args.args[0])
            self.assertNotIn(settings['TEYZA_ANDROID_STORE_PASSWORD'],export.call_args.args[0])
            os.environ['TEYZA_PLAY_UPLOAD_CERT_SHA256']='E'*64
            with self.assertRaises(SystemExit):prepare.verify_play_upload_key()
        with patch.dict(os.environ,{'TEYZA_PLAY_UPLOAD_CERT_SHA256':''}),patch.object(prepare.subprocess,'check_output') as export:
            with self.assertRaises(SystemExit):prepare.verify_play_upload_key()
            export.assert_not_called()


if __name__=='__main__':unittest.main()

