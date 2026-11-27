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
            routes=[entry for intent in activity.findall('intent-filter') for entry in intent.findall('data')]
            self.assertEqual([(entry.get(key+'scheme'),entry.get(key+'host')) for entry in routes],[('teyza','open')])
            route_filter=activity.find('intent-filter')
            self.assertEqual(route_filter.find('action').get(key+'name'),'android.intent.action.VIEW')
            self.assertEqual({v.get(key+'name') for v in route_filter.findall('category')},
              {'android.intent.category.DEFAULT','android.intent.category.BROWSABLE'})
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
            self.assertIn('teyza', [s for v in info['CFBundleURLTypes'] for s in v['CFBundleURLSchemes']])
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


    def test_signed_google_oauth_must_match_web_client_and_existing_upload_sha1(self):
        app_id='1:983479810697:android:aabbcc'
        web='983479810697-webtest.apps.googleusercontent.com'
        sha1='a'*40
        sdk={'project_info':{'project_id':'business-lift-3c19c'},
            'client':[{'client_info':{'mobilesdk_app_id':app_id,
                'android_client_info':{'package_name':'com.asiyedriver.asiye'}},
                'oauth_client':[{'client_type':3,'client_id':web},
                    {'client_type':1,'client_id':'android-client',
                     'android_info':{'package_name':'com.asiyedriver.asiye',
                                     'certificate_hash':sha1}}]}]}
        encoded=lambda:base64.b64encode(json.dumps(sdk).encode()).decode()
        self.assertTrue(prepare.validate_android_google_oauth(encoded(),web,sha1))
        with self.assertRaises(SystemExit):
            prepare.validate_android_google_oauth(encoded(),'983479810697-wrong.apps.googleusercontent.com',sha1)
        with self.assertRaises(SystemExit):
            prepare.validate_android_google_oauth(encoded(),web,'b'*40)
        sdk['client'][0]['oauth_client']=[{'client_type':3,'client_id':web}]
        with self.assertRaises(SystemExit):
            prepare.validate_android_google_oauth(encoded(),web,sha1)
        sdk['client'][0]['oauth_client'].append({'client_type':1,
            'android_info':{'package_name':'com.other.app','certificate_hash':sha1}})
        with self.assertRaises(SystemExit):
            prepare.validate_android_google_oauth(encoded(),web,sha1)
        sdk['client'][0]['client_info']['android_client_info']['package_name']='za.co.teyza.shopper'
        with self.assertRaises(SystemExit):
            prepare.validate_android_google_oauth(encoded(),web,sha1)

    def test_signed_ios_requires_real_google_client_pair_and_apple_team(self):
        values={'TEYZA_GOOGLE_WEB_CLIENT_ID':'983479810697-webtest.apps.googleusercontent.com',
          'TEYZA_GOOGLE_IOS_CLIENT_ID':'983479810697-iostest.apps.googleusercontent.com',
          'TEYZA_FIREBASE_IOS_APP_ID':'1:983479810697:ios:4aae4823892dd145db2458',
          'TEYZA_APPLE_TEAM_ID':'TEAM1234AB'}
        with patch.dict(os.environ,values):
            self.assertTrue(prepare.validate_ios_google_oauth('signed'))
            os.environ['TEYZA_GOOGLE_IOS_CLIENT_ID']=''
            with self.assertRaises(SystemExit):
                prepare.validate_ios_google_oauth('signed')
            os.environ['TEYZA_GOOGLE_IOS_CLIENT_ID']=values['TEYZA_GOOGLE_WEB_CLIENT_ID']
            with self.assertRaises(SystemExit):
                prepare.validate_ios_google_oauth('signed')
            os.environ['TEYZA_GOOGLE_IOS_CLIENT_ID']=values['TEYZA_GOOGLE_IOS_CLIENT_ID']
            os.environ['TEYZA_FIREBASE_IOS_APP_ID']='1:983479810697:ios:badc0ffe'
            with self.assertRaises(SystemExit):
                prepare.validate_ios_google_oauth('signed')
            os.environ['TEYZA_FIREBASE_IOS_APP_ID']='1:983479810697:ios:4aae4823892dd145db2458'
            self.assertTrue(prepare.validate_ios_google_oauth('signed'))
            os.environ['TEYZA_APPLE_TEAM_ID']=''
            with self.assertRaises(SystemExit):
                prepare.validate_ios_google_oauth('signed')
        # Existing unsigned local iOS fixture tests should remain possible.
        with patch.dict(os.environ,{'TEYZA_GOOGLE_WEB_CLIENT_ID':'','TEYZA_GOOGLE_IOS_CLIENT_ID':''}):
            self.assertIsNone(prepare.validate_ios_google_oauth('unsigned'))



class NativeLaunchTests(unittest.TestCase):
    def test_android_launch_covers_dark_mode_and_android_12_without_deleting_theme_items(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(prepare, 'ROOT', Path(folder)):
            res = prepare.ROOT / 'android/app/src/main/res'
            path = res / 'values/styles.xml'
            path.parent.mkdir(parents=True)
            path.write_text('<resources><style name="LaunchTheme" parent="OriginalParent">'
                            '<item name="existingSetting">keep</item></style>'
                            '<style name="UnrelatedTheme"><item name="other">keep</item></style></resources>')
            prepare.android_launch_screen()
            first = {str(p.relative_to(res)): p.read_bytes() for p in res.rglob('*.xml')}
            prepare.android_launch_screen()
            self.assertEqual(first, {str(p.relative_to(res)): p.read_bytes() for p in res.rglob('*.xml')})
            key = '{http://schemas.android.com/apk/res/android}'
            for qualifier in ('drawable', 'drawable-v21'):
                background = ET.parse(res / qualifier / 'launch_background.xml')
                self.assertIsNone(background.find('.//bitmap'))
                icon = background.findall('item')[1]
                self.assertEqual(icon.get(key + 'drawable'), '@mipmap/ic_launcher')
                self.assertEqual(icon.get(key + 'width'), '64dp')
                self.assertEqual(icon.get(key + 'height'), '64dp')
                self.assertEqual(icon.get(key + 'gravity'), 'center')
            for qualifier in ('values', 'values-night', 'values-v31', 'values-night-v31'):
                document = ET.parse(res / qualifier / 'styles.xml')
                launch = document.find("style[@name='LaunchTheme']")
                normal = document.find("style[@name='NormalTheme']")
                self.assertEqual(launch.find("item[@name='android:windowBackground']").text, '@drawable/launch_background')
                self.assertEqual(normal.find("item[@name='android:windowBackground']").text, '@color/teyza_launch_background')
                if qualifier.endswith('v31'):
                    self.assertEqual(launch.find("item[@name='android:windowSplashScreenAnimatedIcon']").text, '@mipmap/ic_launcher')
            original = ET.parse(path)
            self.assertEqual(original.find("style[@name='LaunchTheme']").get('parent'), 'OriginalParent')
            self.assertEqual(original.find("style[@name='LaunchTheme']/item[@name='existingSetting']").text, 'keep')
            self.assertIsNotNone(original.find("style[@name='UnrelatedTheme']"))

    def test_ios_launch_keeps_constraints_and_matches_the_app_canvas(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(prepare, 'ROOT', Path(folder)):
            path = prepare.ROOT / 'ios/Runner/Base.lproj/LaunchScreen.storyboard'
            path.parent.mkdir(parents=True)
            path.write_text('<document><view key="view"><color key="backgroundColor" red="1" green="1" blue="1"/>'
                            '<constraints><constraint id="keep-centred"/></constraints></view>'
                            '<resources><image name="LaunchImage" width="168" height="185"/></resources></document>')
            prepare.ios_launch_screen()
            first = path.read_bytes()
            prepare.ios_launch_screen()
            self.assertEqual(first, path.read_bytes())
            document = ET.parse(path)
            color = document.find(".//view/color[@key='backgroundColor']")
            self.assertAlmostEqual(float(color.get('red')), 247 / 255)
            self.assertAlmostEqual(float(color.get('green')), 248 / 255)
            self.assertAlmostEqual(float(color.get('blue')), 245 / 255)
            self.assertIsNotNone(document.find(".//constraint[@id='keep-centred']"))
            self.assertEqual(document.find(".//image[@name='LaunchImage']").get('width'), '96')


if __name__=='__main__':unittest.main()

