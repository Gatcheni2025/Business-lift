'use strict';
/**
 * R327 admin-only backend deploy.
 *
 * Firebase CLI discovers every exported function in the source codebase,
 * including unpublished WhatsApp triggers that request an optional Meta token.
 * To deploy ONLY the existing teyzaMobile HTTPS handler, expose a temporary
 * entrypoint that exports only that one Cloud Function. The existing index.js,
 * other functions, live secrets and current release signing keys are unchanged.
 *
 * This runner always restores the original checked-out package.json, even on
 * errors or an interrupted Firebase subprocess. The uploaded Cloud Function
 * uses the isolated wrapper and delegates to the original teyzaMobile handler.
 */
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const source=path.join(root,'services/teyza-mobile-v39');
const manifestPath=path.join(source,'package.json');
const wrapperPath=path.join(source,'index.admin-only.js');
const configPath=path.join(root,'firebase.teyza-mobile-v39.json');
const firebaseBin=path.join(__dirname,'node_modules/firebase-tools/lib/bin/firebase.js');
const original=fs.readFileSync(manifestPath);
const manifest=JSON.parse(original.toString('utf8'));
if(manifest.main!=='index.js')throw Error('Unrecognised functions entrypoint. Stop without deploying.');
if(!fs.existsSync(wrapperPath)||!fs.existsSync(firebaseBin))
 throw Error('Admin-only wrapper or pinned Firebase CLI is unavailable.');
const firebaseConfig=JSON.parse(fs.readFileSync(configPath,'utf8'));
if(firebaseConfig?.functions?.length!==1||firebaseConfig.functions[0].codebase!=='teyza-mobile'||
   firebaseConfig.functions[0].source!=='services/teyza-mobile-v39')
 throw Error('Unexpected Firebase codebase configuration. No changes made.');
const runArgs=[
 firebaseBin,'deploy','--config','firebase.teyza-mobile-v39.json',
 '--only','functions:teyza-mobile:teyzaMobile',
 '--project','business-lift-3c19c','--non-interactive'
];
let exitCode=1;
try{
 fs.writeFileSync(manifestPath,JSON.stringify({...manifest,main:'index.admin-only.js'},null,2)+'\n');
 console.log('Deploying ONLY teyzaMobile using isolated Firebase function discovery.');
 console.log('Other triggers, including WhatsApp notifications, will not be changed.');
 const child=spawnSync(process.execPath,runArgs,{cwd:root,stdio:'inherit',env:process.env,
   windowsHide:false});
 if(child.error)throw child.error;
 exitCode=child.status??1;
 if(child.signal)console.error('Firebase deploy interrupted:',child.signal);
}finally{
 fs.writeFileSync(manifestPath,original);
 console.log('Original functions/package.json entrypoint restored.');
}
if(exitCode!==0)throw Error('Isolated teyzaMobile deploy failed. Hosting was NOT updated.');
console.log('Only teyzaMobile deploy completed; continue with guarded admin Hosting patch.');
