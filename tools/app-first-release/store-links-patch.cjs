'use strict';
// Scoped Firebase Hosting patch: update only Teyza's home, download page and store badge stylesheet.
// Other files and the active Hosting config are cloned unchanged. No plain firebase deploy.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const BASE='sites/'+PROJECT,FILES=['/index.html','/download.html','/assets/app-first.css'];
const APP_URL='https://apps.apple.com/za/app/id6827037733';
const PLAY_URL='https://play.google.com/store/apps/details?id=com.asiyedriver.asiye';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function overlay(root){
  const files=new Map();
  for(const name of FILES){
    const file=path.join(root,name.slice(1));
    const raw=fs.readFileSync(file);
    if(name.endsWith('.html')&&(!raw.includes(APP_URL)||!raw.includes(PLAY_URL))){
      throw Error('Missing reviewed store links in '+name+'. Download the current R320 branch.');
    }
    const bytes=zlib.gzipSync(raw,{level:9});
    files.set(name,{bytes,hash:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  return files;
}

async function current(client){
  const result=await client.hosting('GET','/'+BASE+'/channels/live');
  return versionName(result.release?.version?.name);
}
async function clone(client,source,wait=sleep){
  let response=await client.hosting('POST','/'+BASE+'/versions:clone',{sourceVersion:source,finalize:false});
  if(!response.name)throw Error('Firebase did not return a Hosting clone operation');
  const started=Date.now();
  while(!response.done){
    if(Date.now()-started>300000)throw Error('Hosting clone timed out; no live release was published');
    await wait(1000);
    response=await client.hosting('GET','/'+response.name.replace(/^\/+/,''));
  }
  if(response.error)throw Error(response.error.message||'Hosting clone failed');
  return versionName(response.response?.name);
}
function assertPreserved(before,after,uploaded){
  for(const [name,hash] of before){
    if(!uploaded.has(name)&&after.get(name)!==hash)throw Error('Unrelated Hosting file changed: '+name);
  }
  for(const [name,info] of uploaded){
    if(after.get(name)!==info.hash)throw Error('Store-link file not verified: '+name);
  }
  if(after.size!==new Set([...before.keys(),...uploaded.keys()]).size)throw Error('Hosting file count changed unexpectedly');
}
async function deploy({client,root,backupPath,wait=sleep,log=console.log}){
  const domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+PROJECT+'/customDomains/teyza.co.za');
  if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Wrong Firebase Hosting site or custom domain');
  const source=await current(client),before=await allFiles(client,source),files=overlay(root);
  for(const file of FILES)if(!before.has(file))throw Error('Current website is missing '+file+'. Refusing release.');
  const version=await clone(client,source,wait);
  const backup={site:PROJECT,sourceVersion:source,patchedVersion:version,updatedFiles:FILES,createdAt:new Date().toISOString()};
  fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{mode:0o600});
  log('Cloned live website. Replacing only '+FILES.join(', '));
  const population=await client.hosting('POST','/'+version+':populateFiles',{files:Object.fromEntries([...files].map(([name,info])=>[name,info.hash]))});
  const hashToFile=new Map([...files.values()].map(info=>[info.hash,info]));
  for(const hash of population.uploadRequiredHashes||[]){
    if(!hashToFile.has(hash))throw Error('Hosting requested an unexpected file hash');
    await client.upload(population.uploadUrl+'/'+hash,hashToFile.get(hash).bytes);
  }
  assertPreserved(before,await allFiles(client,version),files);
  await client.hosting('PATCH','/'+version,{status:'FINALIZED'},{updateMask:'status'});
  if(await current(client)!==source)throw Error('A newer website release appeared. Nothing was published; retry from the latest live version.');
  const release=await client.hosting('POST','/'+BASE+'/channels/live/releases',{message:'Teyza Google Play and App Store download links'},{versionName:version});
  if(await current(client)!==version)throw Error('Hosting did not confirm the new live version');
  backup.releaseName=release.name;backup.publishedAt=new Date().toISOString();
  fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{mode:0o600});
  log('Published https://teyza.co.za/ and https://teyza.co.za/download.html. All other Hosting files and routing preserved.');
  return backup;
}
async function rollback({client,backupPath,log=console.log}){
  const b=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  if(b.site!==PROJECT)throw Error('Backup is from another Firebase project');
  const oldVersion=versionName(b.sourceVersion),newVersion=versionName(b.patchedVersion);
  if(await current(client)!==newVersion)throw Error('Another release is live; refusing to overwrite it with a rollback');
  await client.hosting('POST','/'+BASE+'/channels/live/releases',{message:'Rollback Teyza app store download buttons'},{versionName:oldVersion});
  log('Reverted the store-links-only Hosting release');
}
async function main(){
  const action=process.argv[2];if(!['deploy','rollback'].includes(action))throw Error('Use deploy or rollback');
  const client=await connect(),root=path.resolve(__dirname,'../../web/app-first/public'),backupPath=path.resolve(__dirname,'../../teyza-store-links-backup.json');
  if(action==='deploy')await deploy({client,root,backupPath});else await rollback({client,backupPath});
}
if(require.main===module)main().catch(e=>{console.error('Teyza store website update stopped:',e.message);process.exitCode=1});
module.exports={FILES,APP_URL,PLAY_URL,overlay,assertPreserved,deploy,rollback};
