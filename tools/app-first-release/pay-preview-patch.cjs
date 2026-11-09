'use strict';
// Teyza Pay STATIC holding page only. This deployer cannot publish checkout code,
// accept subscription consent, enable Paystack or modify Firestore.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const SITE='sites/'+PROJECT,FILES=['/pay.html','/pay/index.html'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function staticOverlay(root){
 const files=new Map();
 const contents=FILES.map(name=>fs.readFileSync(path.join(root,name.slice(1))));
 if(!contents[0].equals(contents[1]))throw Error('/pay.html and /pay/index.html do not match');
 for(let i=0;i<FILES.length;i++){
  const text=contents[i].toString('utf8');
  if(!text.includes('Secure payments are not yet available')||
    !text.includes('https://teyza.co.za/pay')||
    !text.includes('No payments or subscriptions are processed on this page.')||
    !text.includes('noindex,nofollow')||
    /<script\b|<form\b|<iframe\b|on(?:click|load|submit)\s*=|sk_live_|sk_test_|checkout\.paystack\.com|paystack\.co\/transaction\//i.test(text))
   throw Error('Static /pay content failed the no-checkout and no-script safety review');
  const bytes=zlib.gzipSync(contents[i],{level:9});
  files.set(FILES[i],{bytes,hash:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 return files;
}
function staticConfig(original){
 if(!original||typeof original!=='object'||Array.isArray(original))
   throw Error('Live Hosting configuration was unavailable');
 const config=structuredClone(original);
 const rewrites=Array.isArray(config.rewrites)?config.rewrites:[];
 if(rewrites.some(r=>['/pay','/pay/'].includes(r.glob)&&r.path!=='/pay.html'))
   throw Error('A pre-existing /pay rule requires manual review; refusing overwrite');
 const existing=rewrites.filter(r=>!['/pay','/pay/'].includes(r.glob));
 config.rewrites=[{glob:'/pay',path:'/pay.html'},{glob:'/pay/',path:'/pay.html'},...existing];
 // Deliberately preserve *all* existing headers, redirects and API rules.
 return config;
}
function canonical(value){return JSON.stringify(value,(key,v)=>
 v&&typeof v==='object'&&!Array.isArray(v)?
   Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);}
function normalized(value){
 const c=structuredClone(value??{});
 for(const k of ['headers','redirects','rewrites'])if(!c[k]?.length)delete c[k];
 return c;
}
function configEqual(a,b){return canonical(normalized(a))===canonical(normalized(b));}
function verifyFiles(before,after,files){
 for(const [name,hash] of before)if(!files.has(name)&&after.get(name)!==hash)
   throw Error('Unrelated live file was changed: '+name);
 for(const [name,asset] of files)if(after.get(name)!==asset.hash)
   throw Error('Static /pay file was not installed: '+name);
 if(after.size!==new Set([...before.keys(),...files.keys()]).size)
   throw Error('Unexpected website file count. Refusing release.');
}
async function liveVersion(client){
 const data=await client.hosting('GET','/'+SITE+'/channels/live');
 return versionName(data.release?.version?.name);
}
async function cloneVersion(client,source,wait=sleep){
 let operation=await client.hosting('POST','/'+SITE+'/versions:clone',{sourceVersion:source,finalize:false});
 if(!operation.name)throw Error('Firebase did not return a clone operation');
 const started=Date.now();
 while(!operation.done){
  if(Date.now()-started>300000)throw Error('Hosting clone timed out; nothing published');
  await wait(1000);
  operation=await client.hosting('GET','/'+operation.name.replace(/^\/+/,''));}
 if(operation.error)throw Error(operation.error.message||'Firebase clone failed');
 return versionName(operation.response?.name);
}
async function checkDomain(client){
 const domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+PROJECT+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))
   throw Error('teyza.co.za is not attached to the expected Firebase Hosting site');
}
async function inspect({client,root,log=console.log}){
 await checkDomain(client);
 const source=await liveVersion(client),original=await client.hosting('GET','/'+source);
 const config=staticConfig(original.config);
 const files=staticOverlay(root),before=await allFiles(client,source);
 log('READ-ONLY TEYZA PAY STATIC INSPECTION');
 log('Address: https://teyza.co.za/pay');
 log('Firebase project: '+PROJECT);
 log('Live version: '+source);
 log('Existing site files: '+before.size+'; static overlay files: '+files.size);
 log('Existing rewrites: '+(original.config.rewrites||[]).length+
     '; after: '+(config.rewrites||[]).length);
 log('Unchanged header rules: '+(original.config.headers||[]).length);
 log('Unchanged redirects: '+(original.config.redirects||[]).length);
 log('No subscription checkout or Paystack code is part of this overlay.');
 log('No Hosting changes were made.');
 return {source,files:files.size};
}
async function deploy({client,root,backupPath,log=console.log,wait=sleep}){
 await checkDomain(client);
 const source=await liveVersion(client),original=await client.hosting('GET','/'+source);
 if(original.status&&original.status!=='FINALIZED')
   throw Error('The live Hosting version is not finalized');
 const reviewedConfig=staticConfig(original.config);
 const files=staticOverlay(root),before=await allFiles(client,source);
 if(!before.has('/index.html')||!before.has('/admin.html'))
   throw Error('Expected Teyza home/admin site files were not found. Refusing deployment.');
 const staged=await cloneVersion(client,source,wait);
 const checkpoint=backupPath.replace(/\.json$/, '-prepared-'+staged.split('/').at(-1)+'.json');
 const backup={site:PROJECT,sourceVersion:source,patchedVersion:staged,updatedFiles:FILES,createdAt:new Date().toISOString(),kind:'static_no_payment'};
 fs.writeFileSync(checkpoint,JSON.stringify(backup,null,2),{mode:0o600});
 const populated=await client.hosting('POST','/'+staged+':populateFiles',{
  files:Object.fromEntries([...files].map(([name,file])=>[name,file.hash]))});
 const hashes=new Map([...files.values()].map(f=>[f.hash,f]));
 for(const hash of populated.uploadRequiredHashes||[]){
  if(!hashes.has(hash))throw Error('Firebase requested an unexpected file hash');
  await client.upload(populated.uploadUrl+'/'+hash,hashes.get(hash).bytes);
 }
 verifyFiles(before,await allFiles(client,staged),files);
 const currentStaged=await client.hosting('GET','/'+staged);
 if(currentStaged.status&&currentStaged.status!=='CREATED')
   throw Error('Staged Hosting version is not editable');
 // Firebase versions:clone copies content but may not preserve ServingConfig.
 // Explicitly reinstall every live rule with only the two /pay rewrites added.
 await client.hosting('PATCH','/'+staged,{config:reviewedConfig},{updateMask:'config'});
 const installed=(await client.hosting('GET','/'+staged)).config;
 if(!configEqual(installed,reviewedConfig))
   throw Error('Staged Hosting rules differ from reviewed configuration. No release published.');
 if(await liveVersion(client)!==source)
   throw Error('A newer website version appeared; no release published');
 await client.hosting('PATCH','/'+staged,{status:'FINALIZED'},{updateMask:'status'});
 if(await liveVersion(client)!==source)
   throw Error('A newer website release appeared during staging; no release published');
 const published=await client.hosting('POST','/'+SITE+'/channels/live/releases',
  {message:'Teyza Pay static coming-soon page; NO PAYMENT COLLECTION'},{versionName:staged});
 if(await liveVersion(client)!==staged)
   throw Error('Firebase did not confirm release. Inspect Hosting before retrying.');
 backup.releaseName=published.name;backup.publishedAt=new Date().toISOString();
 fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{mode:0o600});
 log('Published static (NO PAYMENT) page: https://teyza.co.za/pay');
 log('Preserved '+before.size+' existing files and all original Hosting redirects, headers and API routes.');
 return backup;
}
async function rollback({client,backupPath,log=console.log}){
 const saved=JSON.parse(fs.readFileSync(backupPath,'utf8'));
 if(saved.site!==PROJECT||saved.kind!=='static_no_payment'||!saved.publishedAt||!saved.releaseName)
   throw Error('No verified static /pay release found in rollback metadata');
 if(await liveVersion(client)!==versionName(saved.patchedVersion))
   throw Error('A newer release is live: refusing to overwrite it');
 await client.hosting('POST','/'+SITE+'/channels/live/releases',
  {message:'Rollback static Teyza Pay holding page'},{
    versionName:versionName(saved.sourceVersion)});
 log('Restored Hosting version prior to static /pay preview');
}
async function main(){
 const action=process.argv[2];
 if(!['inspect','deploy','rollback'].includes(action))
   throw Error('Usage: node pay-preview-patch.cjs inspect|deploy|rollback');
 const root=path.resolve(__dirname,'../../web/app-first/public');
 const backupPath=path.resolve(__dirname,'../../teyza-pay-static-backup.json');
 const client=await connect();
 if(action==='inspect')await inspect({client,root});
 else if(action==='deploy')await deploy({client,root,backupPath});
 else await rollback({client,backupPath});
}
if(require.main===module)main().catch(e=>{console.error('Static /pay operation blocked: '+e.message);process.exitCode=1;});
module.exports={FILES,staticOverlay,staticConfig,configEqual,verifyFiles,inspect,deploy,rollback};
