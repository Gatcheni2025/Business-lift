'use strict';
/**
 * Exact-file Teyza payment-portal publisher.
 * Never deploys the full app-first overlay, billing backend, admin or /seller guide.
 * Usage:
 *   node publish-payment-portals-only.cjs --check
 *   node publish-payment-portals-only.cjs --publish
 *   node publish-payment-portals-only.cjs --rollback <absolute-backup-json-path>
 * Requires the authorized Firebase CLI sign-in for publish/rollback.
 */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const SITE='sites/'+PROJECT;
const FILES=Object.freeze([
 '/pay.html','/pay/index.html','/ads/index.html',
 '/js/seller-web-billing.mjs','/js/ads-web-billing.mjs'
]);
const GENERATED=new Set(['/__/firebase/init.js','/__/firebase/init.json']);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const canonicalSource=(bytes,expectedLf,expectedCrLf,name)=>{
 if(sha(bytes)===expectedLf)return bytes;
 if(sha(bytes)===expectedCrLf&&bytes.includes(13)){
  const text=bytes.toString('utf8');
  if(text.replace(/\\r\\n/g,'').includes('\\r'))throw Error('Unexpected mixed line endings: '+name);
  const normal=Buffer.from(text.replace(/\\r\\n/g,'\\n'),'utf8');
  if(sha(normal)===expectedLf)return normal;
 }
 throw Error('Unapproved source bytes: '+name);
};

function checkReviewedFiles(root){
 const publicDir=path.join(root,'web/app-first/public');
 const pay=JSON.parse(fs.readFileSync(path.join(root,'docs/TEYZA_PAY_OPERATOR_SOURCE_APPROVAL_20261110.json'),'utf8'));
 const ads=JSON.parse(fs.readFileSync(path.join(root,'docs/TEYZA_ADS_OPERATOR_SOURCE_APPROVAL_20261111.json'),'utf8'));
 if(pay.decision!=='approved'||ads.decision!=='approved'||pay.operatorApprovalPr!==185||ads.operatorApprovalPr!==185)
   throw Error('PR #185 exact-source operator approval has not been recorded');
 if(pay.approvedHtmlFile!=='web/app-first/public/pay.html'||
   pay.approvedFile!=='web/app-first/public/js/seller-web-billing.mjs')throw Error('Unexpected membership approval files');
 const hashes=new Map([
  ['/pay.html',{lf:pay.approvedHtmlSha256,win:pay.approvedHtmlWindowsCrLfSha256}],
  ['/pay/index.html',{lf:pay.approvedHtmlSha256,win:pay.approvedHtmlWindowsCrLfSha256}],
  ['/js/seller-web-billing.mjs',{lf:pay.approvedSha256,win:pay.windowsWorktreeCrLfSha256}],
  ...ads.approvedFiles.map(f=>['/'+f.file.replace('web/app-first/public/',''),
    {lf:f.sha256,win:f.windowsCrLfSha256}])
 ]);
 if(hashes.size!==FILES.length||FILES.some(f=>!hashes.has(f)))throw Error('Source approvals do not cover exactly five payment portal files');
 const reviewed=new Map();
 for(const file of FILES){
  const approval=hashes.get(file);
  const bytes=canonicalSource(fs.readFileSync(path.join(publicDir,file.slice(1))),
    approval.lf,approval.win,file);
  reviewed.set(file,{raw:bytes,gzip:zlib.gzipSync(bytes,{level:9})});
 }
 for(const file of ['/ads/index.html','/js/ads-web-billing.mjs','/js/seller-web-billing.mjs']){
  const approval=hashes.get(file);
  const mirror=canonicalSource(fs.readFileSync(path.join(root,file.slice(1))),
    approval.lf,approval.win,file+' root mirror');
  if(!mirror.equals(reviewed.get(file).raw))throw Error('Root mirror differs: '+file);
 }
 if(!reviewed.get('/pay.html').raw.equals(reviewed.get('/pay/index.html').raw))throw Error('Membership route aliases differ');
 const seller=reviewed.get('/js/seller-web-billing.mjs').raw.toString('utf8');
 const ad=reviewed.get('/js/ads-web-billing.mjs').raw.toString('utf8');
 for(const [name,script] of [['membership',seller],['ads',ad]]){
  if(!script.includes('linkWithPopup(user,provider)')||
    !script.includes('signInWithEmailAndPassword')||script.includes('createUserWithEmailAndPassword')||
    !script.includes('getIdToken(true)'))
      throw Error('Existing-account safety or authenticated checkout guard missing from '+name);
 }
 return reviewed;
}
function verifyExactFileChange(before,after,expectedHashes){
 if(after.size!==before.size)throw Error('Hosting file count changed');
 if(expectedHashes.size!==FILES.length||FILES.some(f=>!expectedHashes.has(f)))throw Error('Unexpected scoped upload list');
 for(const f of FILES)if(!before.has(f)||after.get(f)!==expectedHashes.get(f))
   throw Error('Missing or changed target Hosting hash: '+f);
 for(const [name,value] of before){
  if(expectedHashes.has(name))continue;
  if(GENERATED.has(name)){
   if(!/^[a-f0-9]{64}$/.test(value)||!/^[a-f0-9]{64}$/.test(after.get(name)||''))
     throw Error('Hosting reserved resource missing: '+name);
  }else if(after.get(name)!==value)throw Error('Unrelated live Hosting file changed: '+name);
 }
}
async function live(c){return versionName((await c.hosting('GET','/'+SITE+'/channels/live')).release?.version?.name);}
async function clone(c,version){
 let result=await c.hosting('POST','/'+SITE+'/versions:clone',{sourceVersion:version,finalize:false});
 const start=Date.now();
 while(!result.done){
  if(Date.now()-start>300000)throw Error('Hosting clone timeout');
  await sleep(1000);
  result=await c.hosting('GET','/'+result.name.replace(/^\//,''));
 }
 if(result.error)throw Error(result.error.message||'Hosting clone failed');
 return versionName(result.response?.name);
}
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
 Object.fromEntries(Object.entries(v).sort()):v);
async function checkDomain(c){
 const domain=await c.hosting('GET','/projects/'+PROJECT+'/sites/'+PROJECT+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Unexpected Firebase Hosting custom domain');
}
async function publish({repo=path.resolve(__dirname,'../..')}={}){
 const files=checkReviewedFiles(repo);
 const c=await connect();
 await checkDomain(c);
 const oldVersion=await live(c),before=await allFiles(c,oldVersion);
 if(!before.has('/index.html'))throw Error('No live index.html; refusing scoped publication');
 for(const name of FILES)if(!before.has(name))throw Error('Live payment portal file missing: '+name);
 const sourceConfig=(await c.hosting('GET','/'+oldVersion)).config||{};
 const newVersion=await clone(c,oldVersion);
 const backup=path.join(repo,'hosting-backup-payment-portals-'+newVersion.split('/').at(-1)+'.json');
 const metadata={project:PROJECT,site:SITE,sourceVersion:oldVersion,patchedVersion:newVersion,
  changedFiles:[...FILES],createdAt:new Date().toISOString(),status:'STAGED'};
 fs.writeFileSync(backup,JSON.stringify(metadata,null,2)+'\n',{flag:'wx',mode:0o600});
 const compressed=new Map([...files].map(([name,{gzip}])=>[name,{gzip,hash:sha(gzip)}]));
 const hashes=new Map([...compressed].map(([name,data])=>[name,data.hash]));
 const result=await c.hosting('POST','/'+newVersion+':populateFiles',{
  files:Object.fromEntries(hashes)
 });
 for(const hash of result.uploadRequiredHashes||[]){
  const entry=[...compressed.values()].find(f=>f.hash===hash);
  if(!entry)throw Error('Hosting requested hash outside approved payment source');
  await c.upload(result.uploadUrl+'/'+hash,entry.gzip);
 }
 verifyExactFileChange(before,await allFiles(c,newVersion),hashes);
 const clonedConfig=(await c.hosting('GET','/'+newVersion)).config||{};
 if(canonical(clonedConfig)!==canonical(sourceConfig))throw Error('Cloned Hosting config changed; refuse publication');
 await c.hosting('PATCH','/'+newVersion,{status:'FINALIZED'},{updateMask:'status'});
 if(await live(c)!==oldVersion)throw Error('Concurrent Hosting publication detected; not publishing');
 await c.hosting('POST','/'+SITE+'/channels/live/releases',
  {message:'Operator-approved Teyza /pay and /ads website UI only, PR #185'},{versionName:newVersion});
 if(await live(c)!==newVersion)throw Error('Published release not confirmed live');
 metadata.status='PUBLISHED';metadata.publishedAt=new Date().toISOString();
 fs.writeFileSync(backup,JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
 console.log('Published ONLY the five verified Teyza membership/ads files.');
 console.log('Unrelated /admin, Hosting config, backend and site files were preserved.');
 console.log('Rollback metadata: '+backup);
 return metadata;
}
async function rollback(backupPath){
 const info=JSON.parse(fs.readFileSync(backupPath,'utf8'));
 if(info.project!==PROJECT||info.site!==SITE||info.status!=='PUBLISHED'||
   JSON.stringify(info.changedFiles)!==JSON.stringify(FILES))
   throw Error('Backup was not produced by a successful scoped Teyza portal release');
 const c=await connect();await checkDomain(c);
 if(await live(c)!==versionName(info.patchedVersion))
   throw Error('A newer live release exists; do not overwrite it');
 await c.hosting('POST','/'+SITE+'/channels/live/releases',
  {message:'Rollback Teyza payment portal UI only'},{versionName:versionName(info.sourceVersion)});
 if(await live(c)!==versionName(info.sourceVersion))throw Error('Rollback not confirmed');
 console.log('Rolled back to '+info.sourceVersion);
}
async function main(){
 const mode=process.argv[2],repo=path.resolve(__dirname,'../..');
 if(mode==='--check'){checkReviewedFiles(repo);console.log('PR #185 reviewed portal sources PASS; no Hosting deployment occurred');return;}
 if(mode==='--publish'){await publish({repo});return;}
 if(mode==='--rollback'&&process.argv[3]){await rollback(path.resolve(process.argv[3]));return;}
 throw Error('Use --check, --publish or --rollback <backup-json-file>. No action taken');
}
if(require.main===module)main().catch(error=>{console.error('Payment portals NOT changed:',error.message);process.exitCode=1});
module.exports={FILES,checkReviewedFiles,verifyExactFileChange,publish,rollback};
