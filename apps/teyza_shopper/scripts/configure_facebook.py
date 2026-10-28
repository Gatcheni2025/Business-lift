"""Opt in to native Facebook login only with a complete Meta configuration."""
import os
from pathlib import Path
import plistlib
import re
import xml.etree.ElementTree as ET

HERE=Path(__file__).resolve().parent
DEPENDENCY='  flutter_facebook_auth: 7.1.5\n'
STUB="""// Facebook is not configured in this build. Google, Apple and email remain available.
import 'facebook_identity.dart';
const facebookConfigured=false;
Future<FacebookIdentity?> requestFacebookIdentity(String hashedNonce) async =>
  throw StateError('Facebook sign-in is not configured');
Future<void> clearFacebookSession() async {}
"""
def configure(root,platform):
    root=Path(root)
    app_id=os.environ.get('TEYZA_FACEBOOK_APP_ID','').strip()
    client=os.environ.get('TEYZA_FACEBOOK_CLIENT_TOKEN','').strip()
    if bool(app_id)!=bool(client):
        raise SystemExit('Set both TEYZA_FACEBOOK_APP_ID and TEYZA_FACEBOOK_CLIENT_TOKEN, or neither.')
    if app_id and (not re.fullmatch(r'[0-9]{5,30}',app_id) or not re.fullmatch(r'[A-Za-z0-9_-]{8,200}',client)):
        raise SystemExit('Invalid Meta app ID/client token format. Never supply a Meta app secret to a mobile build.')
    pubspec=root/'pubspec.yaml'
    if not pubspec.exists():
        return False  # Minimal unit-test wrapper; no Dart dependency to prepare.
    source=pubspec.read_text()
    source=re.sub(r'^  flutter_facebook_auth:.*\n','',source,flags=re.M)
    if app_id:
        source=source.replace('dependencies:\n','dependencies:\n'+DEPENDENCY,1)
    pubspec.write_text(source)
    bridge=root/'lib/facebook_bridge.dart';bridge.parent.mkdir(parents=True,exist_ok=True)
    bridge.write_text((HERE/'templates/facebook_bridge.dart.txt').read_text() if app_id else STUB)
    if not app_id:
        print('Facebook omitted: Meta configuration absent; existing sign-in methods retained.')
        return False
    if platform=='android':
        path=root/'android/app/src/main/AndroidManifest.xml'
        tree=ET.parse(path);manifest=tree.getroot();key='{http://schemas.android.com/apk/res/android}'
        application=manifest.find('application')
        values={'com.facebook.sdk.ApplicationId':'@string/facebook_app_id','com.facebook.sdk.ClientToken':'@string/facebook_client_token',
                'com.facebook.sdk.AutoLogAppEventsEnabled':'false','com.facebook.sdk.AdvertiserIDCollectionEnabled':'false'}
        for child in list(application.findall('meta-data')):
            if child.get(key+'name') in values:application.remove(child)
        for name,value in values.items():ET.SubElement(application,'meta-data',{key+'name':name,key+'value':value})
        queries=manifest.find('queries')
        if queries is None:queries=ET.SubElement(manifest,'queries')
        if not any(p.get(key+'authorities')=='com.facebook.katana.provider.PlatformProvider' for p in queries.findall('provider')):
            ET.SubElement(queries,'provider',{key+'authorities':'com.facebook.katana.provider.PlatformProvider'})
        tree.write(path,encoding='utf-8',xml_declaration=True)
        resources=ET.Element('resources')
        for name,value in [('facebook_app_id',app_id),('facebook_client_token',client),('fb_login_protocol_scheme','fb'+app_id)]:
            ET.SubElement(resources,'string',{'name':name,'translatable':'false'}).text=value
        destination=root/'android/app/src/main/res/values/teyza_facebook.xml';destination.parent.mkdir(parents=True,exist_ok=True)
        ET.ElementTree(resources).write(destination,encoding='utf-8',xml_declaration=True)
    else:
        path=root/'ios/Runner/Info.plist'
        with path.open('rb') as stream:info=plistlib.load(stream)
        info.update({'FacebookAppID':app_id,'FacebookClientToken':client,'FacebookDisplayName':'Teyza',
                     'FacebookAutoLogAppEventsEnabled':False,'FacebookAdvertiserIDCollectionEnabled':False})
        types=info.setdefault('CFBundleURLTypes',[])
        if not any('fb'+app_id in item.get('CFBundleURLSchemes',[]) for item in types):
            types.append({'CFBundleTypeRole':'Editor','CFBundleURLSchemes':['fb'+app_id]})
        queries=info.setdefault('LSApplicationQueriesSchemes',[])
        for value in ['fbapi','fb-messenger-share-api']:
            if value not in queries:queries.append(value)
        with path.open('wb') as stream:plistlib.dump(info,stream,sort_keys=False)
    print('Facebook native login configured. Firebase/Meta activation still requires provider-console setup.')
    return True
