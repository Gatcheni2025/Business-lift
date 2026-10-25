import base64
import hashlib
from pathlib import Path
import ssl
import sys
import unittest
sys.path.insert(0,str(Path(__file__).parent))
from teyza_store_configuration import report,ANDROID_SECRETS,IOS_SECRETS,ANDROID_VARIABLES,IOS_VARIABLES
from package_teyza_store_apk import validate

class StoreFilesTests(unittest.TestCase):
    def complete(self):
        env={key:'private-test-value' for key in ANDROID_SECRETS+IOS_SECRETS}
        for key in env:
            if key.endswith('_BASE64'):env[key]=base64.b64encode(b'private-fixture'*10).decode()
        for key in set(ANDROID_VARIABLES+IOS_VARIABLES):env[key]='test-client.apps.googleusercontent.com'
        env['TEYZA_APPLE_TEAM_ID']='ABCDE12345'
        return env
    def test_missing_settings_are_named_without_releasing_any_value(self):
        env=self.complete();del env['TEYZA_ANDROID_KEY_PASSWORD']
        result=report(env);self.assertEqual(result['platforms'],'ios');self.assertEqual(result['android']['missingSecrets'],['TEYZA_ANDROID_KEY_PASSWORD'])
        self.assertNotIn('private-test-value',str(result));self.assertNotIn('private-fixture',str(result))
    def test_partial_configuration_can_build_android_while_ios_is_blocked(self):
        env=self.complete()
        for name in IOS_SECRETS:env.pop(name)
        result=report(env);self.assertEqual(result['platforms'],'android');self.assertFalse(result['complete'])
    def test_no_credentials_never_fall_back_to_unsigned_store_files(self):
        result=report({});self.assertEqual(result['platforms'],'none');self.assertFalse(result['android']['ready']);self.assertFalse(result['ios']['ready'])
    def test_valid_complete_settings_and_invalid_formats(self):
        env=self.complete();self.assertEqual(report(env)['platforms'],'all')
        env['TEYZA_IOS_PROFILE_BASE64']='broken!';env['TEYZA_GOOGLE_WEB_CLIENT_ID']='not-a-client'
        result=report(env);self.assertEqual(result['platforms'],'none');self.assertIn('TEYZA_IOS_PROFILE_BASE64',result['ios']['invalidSettings'])
        env=self.complete();env['TEYZA_ANDROID_KEYSTORE_BASE64']+='\n'
        self.assertIn('TEYZA_ANDROID_KEYSTORE_BASE64',report(env)['android']['invalidSettings'])
    def test_production_apk_identity_target_and_certificate_match_the_bundle(self):
        der=b'synthetic-public-certificate';pem=ssl.DER_cert_to_PEM_cert(der);digest=hashlib.sha256(der).hexdigest()
        badging="package: name='za.co.teyza.teyza_shopper' versionCode='23' versionName='1.0.13'\ntargetSdkVersion:'36'"
        signature='Signer #1 certificate SHA-256 digest: '+digest
        self.assertEqual(validate(badging,signature,pem,'1.0.13+23')['targetSdk'],36)
        for wrong in [badging.replace("'36'","'35'"),badging.replace("'23'","'22'"),badging.replace('za.co.teyza.teyza_shopper','other.app')]:
            with self.assertRaises(ValueError):validate(wrong,signature,pem,'1.0.13+23')
        with self.assertRaises(ValueError):validate(badging,signature.replace(digest,'0'*64),pem,'1.0.13+23')
        with self.assertRaises(ValueError):validate(badging,signature+'\nAndroid Debug',pem,'1.0.13+23')

if __name__=='__main__':unittest.main()
