'use strict';
// Publish ONLY /seller-getting-started.html through a checked clone of live Firebase Hosting.
// Do not use firebase deploy hosting; the live site has independently approved payment files.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const SITE='sites/'+PROJECT,FILE='/seller-getting-started.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function current(c){return versionName((await c.hosting('GET','/'+SITE+'/channels/live')).release?.version?.name);}
async function clone(c,source){
 let result=await c.hosting('POST','/'+SITE+'/versions:clone',{sourceVersion:source,finalize:false});
 const start=Date.now();
 while(!result.done){
  if(Date.now()-start>300000)throw Error('Clone timed out; no live release published');
  await sleep(1000);result=await c.hosting('GET','/'+(result.name.startsWith('/')?result.name.slice(1):result.name)); 
 }
 if(result.error)throw Error(result.error.message||'Hosting clone failed');
 return versionName(result.response?.name);
}
async function main(){
 const repo=path.resolve(__dirname,'../..'),sourcePath=path.join(repo,'web/app-first/public',FILE.slice(1));
 const mirrorPath=path.join(repo,FILE.slice(1));
 const raw=fs.readFileSync(sourcePath),mirror=fs.readFileSync(mirrorPath);
 if(!raw.equals(mirror))throw Error('Seller guide root/overlay mismatch. Refusing publication');
 const page=raw.toString('utf8');
 if(!page.includes('R99 per full calendar month')||page.includes('R49 for the first')||
    !page.includes('/pay/')||!page.includes('/download.html'))throw Error('Seller guide content failed release review');
 const compressed=zlib.gzipSync(raw,{level:9});
 const hash=crypto.createHash('sha256').update(compressed).digest('hex');
 const c=await connect();
 const domain=await c.hosting('GET','/projects/'+PROJECT+'/sites/'+PROJECT+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Unexpected domain');
 const beforeVersion=await current(c),before=await allFiles(c,beforeVersion);
 if(!before.has(FILE))throw Error('Seller guide not present on live Hosting. Refusing to create a new route blindly.');
 const next=await clone(c,beforeVersion);
 const backup=path.join(repo,'hosting-backup-seller-guide.json');
 fs.writeFileSync(backup,JSON.stringify({site:PROJECT,sourceVersion:beforeVersion,patchedVersion:next,
    updatedFiles:[FILE],createdAt:new Date().toISOString()},null,2),{mode:0o600});
 const result=await c.hosting('POST','/'+next+':populateFiles',{files:{[FILE]:hash}});
 for(const h of result.uploadRequiredHashes||[]){
  if(h!==hash)throw Error('Hosting unexpectedly requested another file');
  await c.upload(result.uploadUrl+'/'+h,compressed);
 }
 const after=await allFiles(c,next);
 if(after.get(FILE)!==hash)throw Error('Seller guide failed hash check');
 if(after.size!==before.size)throw Error('Live Hosting file count changed');
 for(const [file,value] of before){if(file!==FILE&&after.get(file)!==value)throw Error('Unrelated Hosting file changed: '+file);}
 await c.hosting('PATCH','/'+next,{status:'FINALIZED'},{updateMask:'status'});
 if(await current(c)!==beforeVersion)throw Error('Concurrent Hosting publication detected; nothing published');
 await c.hosting('POST','/'+SITE+'/channels/live/releases',{message:'Correct Teyza seller welcome guide only'},{versionName:next});
 if(await current(c)!==next)throw Error('New Hosting version not confirmed live');
 fs.writeFileSync(backup,JSON.stringify({site:PROJECT,sourceVersion:beforeVersion,patchedVersion:next,
    updatedFiles:[FILE],publishedAt:new Date().toISOString()},null,2),{mode:0o600});
 console.log('Published ONLY https://teyza.co.za/seller-getting-started.html');
 console.log('Other Hosting files, including /ads/ and /pay/, were preserved.');
 console.log('Rollback version details saved in '+backup);
}
if(require.main===module)main().catch(error=>{console.error('Seller guide NOT published:',error.message);process.exitCode=1;});
module.exports={main};
