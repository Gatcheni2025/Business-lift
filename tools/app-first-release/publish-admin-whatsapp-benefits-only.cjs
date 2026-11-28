'use strict';
// One pinned Hosting-only release: approved WhatsApp handoff and eight benefits PNGs.
// Preserve every other Firebase Hosting file, route and security header.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const SITE=PROJECT,BASE='sites/'+SITE;
const previous=require('./publish-admin-idle-contact-area-only.cjs');
const manifest=require('./whatsapp-benefits-manifest.json');
const expectedSource='sites/'+SITE+'/versions/865c7ccb478670fd';
const categories=['food','manufacturer','other','retail','salon','service','spaza','wholesale'];
const artworkPaths=categories.map(c=>'/assets/admin-benefits/teyza-benefits-'+c+'-v1.png');
const paths=[...previous.paths,...artworkPaths];
const adminRoot=path.resolve(__dirname,'../../web/teyza-admin/public');
const backupPath=path.resolve(__dirname,'../../hosting-backup-admin-whatsapp-benefits.json');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function verifyArtwork(raw,entry){
 if(!Buffer.isBuffer(raw)||raw.length!==entry.bytes||raw.length>1048576||raw.length<33||raw.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||raw.toString('ascii',12,16)!=='IHDR'||raw.readUInt32BE(16)!==1080||raw.readUInt32BE(20)!==1350||digest(raw)!==entry.sha256)throw Error('Approved PNG integrity check failed: '+entry.path);
}
function files(){
 if(manifest.schema!==1||manifest.width!==1080||manifest.height!==1350||manifest.maxBytes!==1048576||JSON.stringify(manifest.assets.map(a=>a.path))!==JSON.stringify(artworkPaths)||JSON.stringify(manifest.assets.map(a=>a.category))!==JSON.stringify(categories))throw Error('Invalid benefits manifest.');
 const managed=previous.files();
 for(const a of manifest.assets){
  const raw=fs.readFileSync(path.join(adminRoot,a.path.slice(1)));verifyArtwork(raw,a);
  const bytes=zlib.gzipSync(raw,{level:9});managed.set(a.path,{bytes,hash:digest(bytes)});
 }
 return managed;
}
function assertBaseline(source,before){
 if(source!==expectedSource||before.size!==162||previous.paths.some(p=>!before.has(p))||artworkPaths.some(p=>before.has(p)))throw Error('Unexpected live WhatsApp benefits baseline. Hosting unchanged.');
}
function assertManaged(managed){
 if(managed.size!==23||paths.some(p=>!managed.has(p)))throw Error('Unexpected WhatsApp benefits publication scope.');
}
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
  response=await client.hosting('GET','/'+(response.name.startsWith('/')?response.name.slice(1):response.name));
 }
 if(response.error)throw Error(response.error.message||'Hosting clone failed.');
 return versionName(response.response?.name);
}
function verify(before,after,managed){
 assertManaged(managed);
 const expected=new Set([...before.keys(),...managed.keys()]);
 if(after.size!==expected.size)throw Error('Unexpected Hosting file count.');
 for(const [p,hash] of before)if(!managed.has(p)&&after.get(p)!==hash)throw Error('Unrelated Hosting asset changed: '+p);
 for(const [p,v] of managed)if(after.get(p)!==v.hash)throw Error('Agent asset was not verified: '+p);
}
function assertAdminReady(health){
 if(health?.ok!==true||health.adminNationalAcquisition!==true||health.adminNationalAcquisitionSchema!==2||health.adminNationalAcquisitionSummarySchema!==1||health.adminGuidedBusinessGrowthSchema!==1||health.adminProvinceLocalityBrowse!==true||health.adminAcquisitionReviewerFilter!==true||health.version!=='3.26.0'||health.marketplaceRelease!=='20261126-v61'||health.adminInactivitySession!==true||health.adminSessionRequired!==true||health.adminAreaAutocomplete!==true||health.adminBusinessAcquisition!==true||health.adminBusinessCommunications!==true||health.adminBusinessContactDiscovery!==true||health.agentRewardReviewEnabled!==true||health.agentRewardCents!==9000||health.agentCommissionEnabled!==false||health.fieldAgentWorkspace!==true||health.fieldAgentDiscovery!==true){
  throw Error('Matching national acquisition schema 2 and existing Admin backend capabilities are required. Hosting unchanged.');
 }
}
async function checkAdminReady(fetcher=fetch){
 const response=await fetcher('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Admin health request failed.');
 assertAdminReady(await response.json());
}
async function deploy(client,{fetcher=fetch}={}){
 await checkAdminReady(fetcher);
 const domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+SITE+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Incorrect Hosting domain; no changes made.');
 const source=await current(client);
 const before=await allFiles(client,source);
 assertBaseline(source,before);
 if([...previous.paths,'/index.html','/assets/app-first.css','/assets/app-demo.js','/assets/app/home.webp','/assets/app/nearby-shops.webp','/assets/app/spaza-owner.webp','/assets/app/demo-milk.webp','/assets/app/demo-bread.webp','/assets/app/wordmark.svg','/assets/app/icon.svg','/seller-subscriptions.html','/support.html'].some(p=>!before.has(p)))throw Error('Existing live Admin dependency missing.');
 const original=await client.hosting('GET','/'+source);
 const managed=files();assertManaged(managed);
 if(fs.existsSync(backupPath)||fs.readdirSync(path.dirname(backupPath)).some(n=>/^hosting-backup-admin-whatsapp-benefits-.*\.json$/.test(n)))throw Error('Previous benefits publication attempt exists. Stop.');
 const candidate=await clone(client,source);
 const checkpoint=backupPath.replace(/\.json$/,'-'+candidate.split('/').at(-1)+'.json');
 const backup={site:SITE,sourceVersion:source,patchedVersion:candidate,createdAt:new Date().toISOString(),scope:paths};
 fs.writeFileSync(checkpoint,JSON.stringify(backup,null,2),{flag:'wx'});
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
 await checkAdminReady(fetcher);
 if(await current(client)!==source)throw Error('Another release went live; no release was published.');
 const release=await client.hosting('POST','/'+BASE+'/channels/live/releases',{message:'Scoped Teyza Admin WhatsApp handoff and approved benefits artwork'},{versionName:candidate});
 if(await current(client)!==candidate)throw Error('Published version not confirmed.');
 Object.assign(backup,{releaseName:release.name,publishedAt:new Date().toISOString()});
 fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{flag:'wx'});
 console.log('Published scoped WhatsApp and benefits assets; all unrelated assets and config preserved.');
 console.log('https://teyza.co.za/admin');
}
async function rollback(client){
 const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
 if(backup.site!==SITE||versionName(backup.sourceVersion)!==expectedSource||JSON.stringify(backup.scope)!==JSON.stringify(paths)||await current(client)!==versionName(backup.patchedVersion))throw Error('Unexpected rollback checkpoint or newer release live; rollback blocked.');
 await client.hosting('POST','/'+BASE+'/channels/live/releases',{message:'Rollback scoped Admin WhatsApp and benefits artwork'},{versionName:expectedSource});
 if(await current(client)!==expectedSource)throw Error('Rollback version not confirmed.');
 console.log('WhatsApp benefits Hosting restored to its immediately previous website version.');
}
if(require.main===module){
 const action=process.argv[2];
 if(!['deploy','rollback'].includes(action))throw Error('Use deploy or rollback.');
 connect().then(client=>action==='deploy'?deploy(client):rollback(client)).catch(e=>{console.error('Scoped Admin release stopped: '+e.message);process.exitCode=1;});
}
module.exports={paths,artworkPaths,expectedSource,verifyArtwork,assertBaseline,verify,files,assertAdminReady,deploy,rollback};
