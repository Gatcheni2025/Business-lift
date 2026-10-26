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
        badging="package: name='za.co.teyza.shopper' versionCode='23' versionName='1.0.13'\ntargetSdkVersion:'36'"
        signature='Verifies\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: '+digest
        self.assertEqual(validate(badging,signature,pem,'1.0.13+23')['targetSdk'],36)
        for wrong in [badging.replace("'36'","'35'"),badging.replace("'23'","'22'"),badging.replace('za.co.teyza.shopper','other.app')]:
            with self.assertRaises(ValueError):validate(wrong,signature,pem,'1.0.13+23')
        with self.assertRaises(ValueError):validate(badging,signature.replace(digest,'0'*64),pem,'1.0.13+23')
        with self.assertRaises(ValueError):validate(badging,signature+'\nAndroid Debug',pem,'1.0.13+23')

    def test_build_tools_37_scheme_labels_match_the_same_bundle_certificate(self):
        der=b'synthetic-public-certificate';pem=ssl.DER_cert_to_PEM_cert(der);digest=hashlib.sha256(der).hexdigest()
        badging="package: name='za.co.teyza.shopper' versionCode='23' versionName='1.0.13'\ntargetSdkVersion:'36'"
        for label in ['V1 Signer:','V2 Signer:','V3.0 Signer:','V3.1 Signer:','V3.2 Signer:']:
            signature='Verifies\nNumber of signers: 1\n'+label+' certificate SHA-256 digest: '+digest
            with self.subTest(label=label):
                self.assertEqual(validate(badging,signature,pem,'1.0.13+23')['certificateSha256'],digest)
        signature='Verifies\nNumber of signers: 1\n'+''.join(
            label+' certificate SHA-256 digest: '+digest+'\n' for label in ['V2 Signer:','V3.0 Signer:'])
        self.assertEqual(validate(badging,signature,pem,'1.0.13+23')['certificateSha256'],digest)
        with self.assertRaises(ValueError):
            validate(badging,signature+'V3.1 Signer: certificate SHA-256 digest: '+'0'*64,pem,'1.0.13+23')

    def test_multiple_signers_missing_signers_and_stamp_only_are_rejected(self):
        der=b'synthetic-public-certificate';pem=ssl.DER_cert_to_PEM_cert(der);digest=hashlib.sha256(der).hexdigest()
        badging="package: name='za.co.teyza.shopper' versionCode='23' versionName='1.0.13'\ntargetSdkVersion:'36'"
        signature='Verifies\nNumber of signers: 1\nV2 Signer: certificate SHA-256 digest: '+digest
        for wrong in [signature.replace('signers: 1','signers: 2'),
                      signature.replace('Number of signers: 1\n',''),
                      signature.replace('V2 Signer:','Source Stamp Signer'),
                      signature.replace(digest,digest[:-1]),
                      signature+'\nV3.0 Signer: certificate DN: CN=Android Debug']:
            with self.subTest(signature=wrong):
                with self.assertRaises(ValueError):validate(badging,wrong,pem,'1.0.13+23')
        # A separate source stamp is deliberately excluded from APK identity.
        self.assertEqual(validate(badging,signature+'\nSource Stamp Signer certificate SHA-256 digest: '+'0'*64,pem,'1.0.13+23')['certificateSha256'],digest)

if __name__=='__main__':unittest.main()

