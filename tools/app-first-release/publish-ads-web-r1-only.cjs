'use strict';
// Scoped publication of Teyza's pre-reviewed advertiser web frontend.
// Never deploy whole Hosting site or modify /pay, admin, or backend configuration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const SITE='sites/'+PROJECT;
const ASSETS=['/ads/index.html','/js/ads-web-billing.mjs'];
const ASSET_SET=new Set(ASSETS);
const RESERVED=new Set(['/__/firebase/init.js','/__/firebase/init.json']);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?
  Object.fromEntries(Object.entries(x).sort()):x);
function verifyAdsOverlay(before,after,expected){
 if(!(expected instanceof Map)||expected.size!==2||ASSETS.some(p=>!expected.has(p)))
  throw Error('Ads publication must contain exactly two approved file paths');
 if(after.size!==new Set([...before.keys(),...ASSETS]).size)
  throw Error('Unexpected Hosting file count in ads publication');
 for(const [p,hash] of expected)
  if(after.get(p)!==hash)throw Error('Advertiser file not published correctly: '+p);
 for(const [p,hash] of before){
  if(ASSET_SET.has(p))continue;
  if(RESERVED.has(p)){
   if(!/^[a-f0-9]{64}$/.test(hash)||!/^[a-f0-9]{64}$/.test(after.get(p)||''))
    throw Error('Reserved Firebase file missing or malformed: '+p);
  }else if(after.get(p)!==hash)throw Error('Unrelated Hosting file changed: '+p);
 }
}
async function current(client){
 return versionName((await client.hosting('GET','/'+SITE+'/channels/live')).release?.version?.name);
}
async function clone(client,source){
 let job=await client.hosting('POST','/'+SITE+'/versions:clone',{sourceVersion:source,finalize:false});
 if(!job.name)throw Error('Firebase Hosting clone did not return an operation');
 const start=Date.now();
 while(!job.done){
  if(Date.now()-start>300000)throw Error('Firebase Hosting clone timed out; no release published');
  await pause(1000);
  job=await client.hosting('GET','/'+job.name.replace(/^\//,''));
 }
 if(job.error)throw Error(job.error.message||'Hosting clone failed');
 return versionName(job.response?.name);
}
function assets(root){
 const out=new Map();
 for(const p of ASSETS){
  const filename=path.join(root,'web/app-first/public',p.slice(1));
  const raw=fs.readFileSync(filename);
  if(raw.length<1000||raw.includes(Buffer.from('sk_live_'))||raw.includes(Buffer.from('sk_test_')))
   throw Error('Unsafe or incomplete advertising source: '+p);
  if(p.endsWith('.html')&&(!raw.includes(Buffer.from('id="ad-web-root"'))||
     !raw.includes(Buffer.from('src="/js/ads-web-billing.mjs"'))))
   throw Error('Advertiser page is not the reviewed website');
  if(p.endsWith('.mjs')&&(!raw.includes(Buffer.from("api('ads_checkout'"))||
     !raw.includes(Buffer.from('validAdCheckoutUrl'))||
     !raw.includes(Buffer.from("api('ads_confirm'"))))
   throw Error('Reviewed ad checkout/confirmation safeguards missing');
  const zipped=zlib.gzipSync(raw,{level:9});
  out.set(p,{hash:crypto.createHash('sha256').update(zipped).digest('hex'),bytes:zipped});
 }
 return out;
}
async function main(){
 const repo=path.resolve(__dirname,'../..');
 const files=assets(repo);
 const client=await connect();
 const domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+PROJECT+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Wrong Firebase Hosting domain');
 const source=await current(client),before=await allFiles(client,source);
 for(const p of ['/index.html','/pay/index.html','/js/seller-web-billing.mjs'])
  if(!before.has(p))throw Error('Existing working website missing: '+p);
 const config=(await client.hosting('GET','/'+source)).config||{};
 const backupPath=path.join(repo,'hosting-backup-ads-web-r1.json');
 if(fs.existsSync(backupPath))throw Error('Ads rollback record already exists; inspect before retrying');
 const target=await clone(client,source);
 fs.writeFileSync(backupPath,JSON.stringify({site:PROJECT,sourceVersion:source,
  patchedVersion:target,paths:ASSETS,createdAt:new Date().toISOString()},null,2),{mode:0o600});
 const population=await client.hosting('POST','/'+target+':populateFiles',{
  files:Object.fromEntries([...files].map(([p,v])=>[p,v.hash]))
 });
 const byHash=new Map([...files.values()].map(v=>[v.hash,v.bytes]));
 for(const h of population.uploadRequiredHashes||[]){
  if(!byHash.has(h))throw Error('Unexpected Hosting upload hash');
  await client.upload(population.uploadUrl+'/'+h,byHash.get(h));
 }
 verifyAdsOverlay(before,await allFiles(client,target),new Map([...files].map(([p,v])=>[p,v.hash])));
 const proposedConfig=(await client.hosting('GET','/'+target)).config||{};
 if(canonical(proposedConfig)!==canonical(config))
  throw Error('Hosting configuration changed; no release published');
 await client.hosting('PATCH','/'+target,{status:'FINALIZED'},{updateMask:'status'});
 if(await current(client)!==source)throw Error('Another release was published concurrently; no ads release published');
 await client.hosting('POST','/'+SITE+'/channels/live/releases',
  {message:'Teyza reviewed advertising checkout frontend only'},{versionName:target});
 if(await current(client)!==target)throw Error('Ads release not confirmed on live channel');
 fs.writeFileSync(backupPath,JSON.stringify({site:PROJECT,sourceVersion:source,
  patchedVersion:target,paths:ASSETS,publishedAt:new Date().toISOString()},null,2),{mode:0o600});
 console.log('ADS CHECKOUT FRONTEND PUBLISHED: /ads/index.html and /js/ads-web-billing.mjs');
 console.log('Existing Paystack membership, admin and all unrelated Hosting files preserved');
}
if(require.main===module)main().catch(e=>{console.error('Ads frontend NOT published:',e.message);process.exitCode=1;});
module.exports={ASSETS,verifyAdsOverlay,assets,main};
