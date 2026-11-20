'use strict';
// Publish only the public agent recruiting page and its additive stylesheet.
// Preserve every other Firebase Hosting file, route and security header.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const SITE=PROJECT,BASE='sites/'+SITE;
const paths=['/agents.html','/assets/teyza-agents-map-first.css'];
const root=path.resolve(__dirname,'../../web/app-first/public');
const backupPath=path.resolve(__dirname,'../../hosting-backup-agents-map-first.json');
const files=()=>new Map(paths.map(p=>{
 const bytes=zlib.gzipSync(fs.readFileSync(path.join(root,p.slice(1))),{level:9});
 return [p,{bytes,hash:crypto.createHash('sha256').update(bytes).digest('hex')}];
}));
async function current(client){
 const response=await client.hosting('GET','/'+BASE+'/channels/live');
 return versionName(response.release?.version?.name);
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function clone(client,source){
 let response=await client.hosting('POST','/'+BASE+'/versions:clone',{sourceVersion:source,finalize:false});
 if(!response.name)throw Error('Hosting did not return a clone operation.');
 const started=Date.now();
 while(!response.done){
  if(Date.now()-started>300000)throw Error('Hosting clone timed out; no release published.');
  await wait(1000);
  response=await client.hosting('GET','/'+response.name.replace(/^\\/+/,''));
 }
 if(response.error)throw Error(response.error.message||'Hosting clone failed.');
 return versionName(response.response?.name);
}
function verify(before,after,managed){
 const expected=new Set([...before.keys(),...managed.keys()]);
 if(after.size!==expected.size)throw Error('Unexpected Hosting file count.');
 for(const [p,hash] of before)if(!managed.has(p)&&after.get(p)!==hash)throw Error('Unrelated Hosting asset changed: '+p);
 for(const [p,v] of managed)if(after.get(p)!==v.hash)throw Error('Agent asset was not verified: '+p);
}
async function deploy(client){
 const domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+SITE+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Incorrect Hosting domain; no changes made.');
 const source=await current(client);
 const before=await allFiles(client,source);
 if(!before.has('/agents.html')||!before.has('/index.html'))throw Error('Existing live Agents or index page missing.');
 const original=await client.hosting('GET','/'+source);
 const managed=files();
 const candidate=await clone(client,source);
 const checkpoint=backupPath.replace(/\\.json$/,'-'+candidate.split('/').at(-1)+'.json');
 const backup={site:SITE,sourceVersion:source,patchedVersion:candidate,createdAt:new Date().toISOString(),scope:paths};
 fs.writeFileSync(checkpoint,JSON.stringify(backup,null,2));
 // Do not rewrite any existing routes, headers, or payment-related configuration.
 const populated=await client.hosting('POST','/'+candidate+':populateFiles',{files:Object.fromEntries([...managed].map(([p,v])=>[p,v.hash]))});
 const byHash=new Map([...managed.values()].map(v=>[v.hash,v]));
 for(const hash of populated.uploadRequiredHashes||[]){
  const file=byHash.get(hash);
  if(!file)throw Error('Hosting requested an unexpected upload.');
  await client.upload(populated.uploadUrl+'/'+hash,file.bytes);
 }
 verify(before,await allFiles(client,candidate),managed);
 const result=await client.hosting('GET','/'+candidate);
 if(JSON.stringify(result.config)!==JSON.stringify(original.config)){
  const canonical=v=>JSON.stringify(v,(k,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.fromEntries(Object.entries(val).sort()):val);
  if(canonical(result.config)!==canonical(original.config))throw Error('Unexpected Hosting configuration change.');
 }
 await client.hosting('PATCH','/'+candidate,{status:'FINALIZED'},{updateMask:'status'});
 if(await current(client)!==source)throw Error('Another release went live; no release was published.');
 const release=await client.hosting('POST','/'+BASE+'/channels/live/releases',{message:'Scoped Teyza field-agent recruitment redesign'},{versionName:candidate});
 if(await current(client)!==candidate)throw Error('Published version not confirmed.');
 Object.assign(backup,{releaseName:release.name,publishedAt:new Date().toISOString()});
 fs.writeFileSync(backupPath,JSON.stringify(backup,null,2));
 console.log('Published Agents landing page and stylesheet only; Work, Admin, pay and all other assets preserved.');
 console.log('https://teyza.co.za/agents.html');
}
async function rollback(client){
 const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
 if(backup.site!==SITE||await current(client)!==versionName(backup.patchedVersion))throw Error('A newer release is live; rollback blocked.');
 await client.hosting('POST','/'+BASE+'/channels/live/releases',{message:'Rollback scoped Agents landing page'},{versionName:versionName(backup.sourceVersion)});
 console.log('Agents release rolled back to its immediately previous website version.');
}
if(require.main===module){
 const action=process.argv[2];
 if(!['deploy','rollback'].includes(action))throw Error('Use deploy or rollback.');
 connect().then(client=>action==='deploy'?deploy(client):rollback(client)).catch(e=>{console.error('Scoped Agents release stopped: '+e.message);process.exitCode=1;});
}
module.exports={paths,verify,files,deploy,rollback};
