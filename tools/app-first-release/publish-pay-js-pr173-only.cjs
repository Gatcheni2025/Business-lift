'use strict';
// Publish exactly /js/seller-web-billing.mjs, preserving every other live Firebase Hosting file.
// Never run firebase deploy hosting or the broad app-first overlay for this payment JS fix.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const SITE='sites/'+PROJECT,FILE='/js/seller-web-billing.mjs';
const RESERVED=new Set(['/__/firebase/init.js','/__/firebase/init.json']);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?
  Object.fromEntries(Object.entries(x).sort()):x);
function verifyOneFileChange(before,after,expectedHash){
 if(!before.has(FILE))throw Error('Live payment JavaScript missing; refusing to create a new payment asset');
 if(after.size!==before.size)throw Error('Unexpected Hosting file count');
 if(after.get(FILE)!==expectedHash)throw Error('Payment JavaScript gzip hash mismatch');
 for(const [file,value] of before){
  if(file===FILE)continue;
  if(RESERVED.has(file)){
   if(!/^[a-f0-9]{64}$/.test(value)||!/^[a-f0-9]{64}$/.test(after.get(file)||''))
     throw Error('Firebase reserved initialization file missing or invalid: '+file);
  }else if(after.get(file)!==value)throw Error('Unrelated Hosting file changed: '+file);
 }
}
async function current(c){
 return versionName((await c.hosting('GET','/'+SITE+'/channels/live')).release?.version?.name);
}
async function clone(c,source){
 let result=await c.hosting('POST','/'+SITE+'/versions:clone',{sourceVersion:source,finalize:false});
 const start=Date.now();
 while(!result.done){
  if(Date.now()-start>300000)throw Error('Hosting clone timed out; no release published');
  await sleep(1000);
  result=await c.hosting('GET','/'+result.name.replace(/^\//,''));
 }
 if(result.error)throw Error(result.error.message||'Hosting clone failed');
 return versionName(result.response?.name);
}
async function main(){
 const repo=path.resolve(__dirname,'../..');
 const source=path.join(repo,'web/app-first/public/js/seller-web-billing.mjs');
 const mirror=path.join(repo,'js/seller-web-billing.mjs');
 const approval=JSON.parse(fs.readFileSync(path.join(repo,'docs/TEYZA_PAY_OPERATOR_SOURCE_APPROVAL_20261110.json'),'utf8'));
 const original=fs.readFileSync(source),mirrorRaw=fs.readFileSync(mirror);
 const canonicalize=bytes=>{
  const rawSha=crypto.createHash('sha256').update(bytes).digest('hex');
  if(rawSha===approval.approvedSha256)return bytes;
  if(rawSha!==approval.windowsWorktreeCrLfSha256)
    throw Error('Local billing JS does not match approved LF or exact reviewed Windows CRLF fingerprint');
  const normalized=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
  if(crypto.createHash('sha256').update(normalized).digest('hex')!==approval.approvedSha256)
    throw Error('Windows billing JS cannot be normalized to approved source');
  return normalized;
 };
 const raw=canonicalize(original),mirrorBytes=canonicalize(mirrorRaw);
 if(!raw.equals(mirrorBytes))throw Error('Mirrored seller billing JS differs; no publication');
 const sha=crypto.createHash('sha256').update(raw).digest('hex');
 if(approval.operatorApprovalPr!==173||approval.approvedSha256!==sha||
    approval.canonicalRepositorySha256!==sha||approval.decision!=='approved')
   throw Error('Payment JS differs from the exact PR #173 operator-approved SHA-256');
 if(!raw.includes(Buffer.from('confirmedSellerUid:uid'))||
    !raw.includes(Buffer.from("api('seller_billing_overview')"))||
    !raw.includes(Buffer.from("checkoutBlockers(")))
   throw Error('Expected seller checkout protections missing');
 const compressed=zlib.gzipSync(raw,{level:9}),hash=crypto.createHash('sha256').update(compressed).digest('hex');
 const c=await connect();
 const domain=await c.hosting('GET','/projects/'+PROJECT+'/sites/'+PROJECT+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Unexpected Hosting domain');
 const beforeVersion=await current(c),before=await allFiles(c,beforeVersion);
 // The active Hosting site may serve advertising from /ads.html or rewrites.
 // This publisher does not touch advertisement files or routes; it preserves
 // the exact live file set, whether /ads/index.html exists or not.
 for(const page of ['/pay/index.html','/index.html',FILE]){
  if(!before.has(page))throw Error('Expected live Hosting file missing: '+page);
 }
 const next=await clone(c,beforeVersion);
 const backup=path.join(repo,'hosting-backup-pay-js-pr173.json');
 if(fs.existsSync(backup))throw Error('Previous PR173 payment rollback metadata exists; archive it before retrying');
 fs.writeFileSync(backup,JSON.stringify({site:PROJECT,sourceVersion:beforeVersion,
  patchedVersion:next,updatedFiles:[FILE],approvedSha256:sha,createdAt:new Date().toISOString()},null,2),{mode:0o600});
 const population=await c.hosting('POST','/'+next+':populateFiles',{files:{[FILE]:hash}});
 for(const requested of population.uploadRequiredHashes||[]){
  if(requested!==hash)throw Error('Unexpected Hosting upload request');
  await c.upload(population.uploadUrl+'/'+requested,compressed);
 }
 verifyOneFileChange(before,await allFiles(c,next),hash);
 const beforeConfig=(await c.hosting('GET','/'+beforeVersion)).config||{};
 const nextConfig=(await c.hosting('GET','/'+next)).config||{};
 if(canonical(beforeConfig)!==canonical(nextConfig))throw Error('Hosting configuration changed');
 await c.hosting('PATCH','/'+next,{status:'FINALIZED'},{updateMask:'status'});
 if(await current(c)!==beforeVersion)throw Error('Concurrent Hosting release detected; nothing published');
 await c.hosting('POST','/'+SITE+'/channels/live/releases',
  {message:'Operator-approved PR173 seller checkout JS only'},{versionName:next});
 if(await current(c)!==next)throw Error('New payment JS release was not confirmed live');
 fs.writeFileSync(backup,JSON.stringify({site:PROJECT,sourceVersion:beforeVersion,
  patchedVersion:next,updatedFiles:[FILE],approvedSha256:sha,publishedAt:new Date().toISOString()},null,2),{mode:0o600});
 console.log('Published ONLY /js/seller-web-billing.mjs; /pay/, /ads/ and all unrelated files preserved');
 console.log('Rollback version metadata: '+backup);
}
if(require.main===module)main().catch(error=>{console.error('Payment JS NOT published:',error.message);process.exitCode=1;});
module.exports={verifyOneFileChange,main};
