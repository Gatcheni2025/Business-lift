"""Report missing store-build settings by name, never their secret values."""
import base64
import binascii
import json
import os
from pathlib import Path
import re

ANDROID_SECRETS=('TEYZA_ANDROID_KEYSTORE_BASE64','TEYZA_ANDROID_STORE_PASSWORD',
                 'TEYZA_ANDROID_KEY_ALIAS','TEYZA_ANDROID_KEY_PASSWORD',
                 'TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64')
IOS_SECRETS=('TEYZA_IOS_CERTIFICATE_BASE64','TEYZA_IOS_CERTIFICATE_PASSWORD',
             'TEYZA_IOS_PROFILE_BASE64','TEYZA_IOS_KEYCHAIN_PASSWORD')
ANDROID_VARIABLES=('TEYZA_GOOGLE_WEB_CLIENT_ID',)
IOS_VARIABLES=('TEYZA_APPLE_TEAM_ID','TEYZA_GOOGLE_WEB_CLIENT_ID','TEYZA_GOOGLE_IOS_CLIENT_ID')

def report(env):
    def platform(secrets,variables):
        missing_secrets=[name for name in secrets if not env.get(name,'').strip()]
        missing_variables=[name for name in variables if not env.get(name,'').strip()]
        invalid=[]
        for name in secrets:
            value=env.get(name,'').strip()
            if name.endswith('_BASE64') and value:
                try:
                    if value!=env[name] or len(base64.b64decode(value,validate=True))<32: invalid.append(name)
                except (ValueError,binascii.Error): invalid.append(name)
        for name in variables:
            value=env.get(name,'').strip()
            if not value: continue
            if value!=env[name]: invalid.append(name);continue
            if name.endswith('_CLIENT_ID') and not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com',value): invalid.append(name)
            if name=='TEYZA_APPLE_TEAM_ID' and not re.fullmatch(r'[A-Z0-9]{10}',value): invalid.append(name)
        return {'ready':not(missing_secrets or missing_variables or invalid),
                'missingSecrets':missing_secrets,'missingVariables':missing_variables,'invalidSettings':invalid}
    android=platform(ANDROID_SECRETS,ANDROID_VARIABLES);ios=platform(IOS_SECRETS,IOS_VARIABLES)
    ready=[p for p,data in [('android',android),('ios',ios)] if data['ready']]
    pubspec=Path(__file__).resolve().parents[1]/'apps/teyza_shopper/pubspec.yaml'
    version=next(line.split(':',1)[1].strip() for line in pubspec.read_text().splitlines() if line.startswith('version:'))
    return {'version':version,'android':android,'ios':ios,
            'platforms':'all' if len(ready)==2 else ready[0] if ready else 'none',
            'complete':len(ready)==2,'storeSubmitted':False}

def main():
    result=report(os.environ)
    Path('teyza-store-configuration.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
    if os.environ.get('GITHUB_OUTPUT'):
        with Path(os.environ['GITHUB_OUTPUT']).open('a') as file:
            file.write('platforms='+result['platforms']+'\ncomplete='+str(result['complete']).lower()+'\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as file:
            file.write('# Teyza signed store files\n\n')
            for name in ['android','ios']:
                data=result[name];file.write('## '+name.upper()+' — '+('settings present' if data['ready'] else 'setup required')+'\n\n')
                for key,title in [('missingSecrets','Missing secret'),('missingVariables','Missing variable'),('invalidSettings','Invalid format')]:
                    for setting in data[key]:file.write('- '+title+': `'+setting+'`\n')
                file.write('\n')
            file.write('Add the listed settings under repository Settings > Secrets and variables > Actions, then re-run all jobs.\n')

if __name__=='__main__':main()
