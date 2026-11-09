'use strict';
// Scope-limited, fail-closed Firebase Hosting deploy for /pay.
// No plain firebase deploy; clone the live site and preserve admin + API files.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');
const BASE='sites/'+PROJECT;
const FILES=['/pay.html','/pay/index.html','/js/seller-web-billing.mjs','/seller-subscriptions.html'];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function overlay(root){
 const out=new Map();
 for(const name of FILES){
  const raw=fs.readFileSync(path.join(root,name.slice(1)));
  if(name==='/pay.html'||name==='/pay/index.html'){
   if(!raw.includes('id="webShopUid"')||!raw.includes('id="webCheckout"')||
      !raw.includes('noindex,nofollow')||!raw.includes('src="/js/seller-web-billing.mjs"'))
     throw Error('Website payment page failed review checks: '+name);
  }else if(name==='/js/seller-web-billing.mjs'&&
    (!raw.includes('confirmedSellerUid:uid')||!raw.includes('seller_billing_overview')))
    throw Error('Website payment script is missing identity checks');
  else if(name==='/seller-subscriptions.html'&&(!raw.includes('href="/pay"')||raw.includes('id="webCheckout"')))
    throw Error('Marketing page still contains embedded checkout');
  const bytes=zlib.gzipSync(raw,{level:9});
  out.set(name,{bytes,hash:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 if(fs.readFileSync(path.join(root,'pay.html')).compare(fs.readFileSync(path.join(root,'pay/index.html')))!==0)
   throw Error('Payment clean URL alias differs from /pay.html');
 return out;
}
function configWithPayRoute(original){
 const config=structuredClone(original||{});
 const rewrites=Array.isArray(config.rewrites)?config.rewrites:[];
 // Never displace an existing business /pay route unless it is our own.
 if(rewrites.some(r=>['/pay','/pay/'].includes(r.glob)&&r.path!=='/pay.html'))
   throw Error('Existing /pay route differs. Manual Hosting review required.');
 config.rewrites=[
  {glob:'/pay',path:'/pay.html'},{glob:'/pay/',path:'/pay.html'},
  ...rewrites.filter(r=>!['/pay','/pay/'].includes(r.glob))
 ];
 const headers=Array.isArray(config.headers)?config.headers:[];
 const payHeaders={'Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'};
 config.headers=[
  ...['/pay','/pay/','/pay.html','/pay/index.html'].map(glob=>({glob,headers:payHeaders})),
  ...headers.filter(h=>!['/pay','/pay/','/pay.html','/pay/index.html'].includes(h.glob))
 ];
 return config;
}
function assertFiles(before,after,files){
 for(const [name,hash] of before)if(!files.has(name)&&after.get(name)!==hash)
   throw Error('Unrelated Hosting file changed: '+name);
 for(const [name,info] of files)if(after.get(name)!==info.hash)
   throw Error('Expected /pay file not installed: '+name);
 if(after.size!==new Set([...before.keys(),...files.keys()]).size)
   throw Error('Unexpected Hosting file set change');
}
async function current(client){
 const channel=await client.hosting('GET','/'+BASE+'/channels/live');
 return versionName(channel.release?.version?.name);
}
async function clone(client,source,wait=pause){
 let op=await client.hosting('POST','/'+BASE+'/versions:clone',{sourceVersion:source,finalize:false});
 if(!op.name)throw Error('No clone operation returned');
 const start=Date.now();
 while(!op.done){
  if(Date.now()-start>300000)throw Error('Hosting clone timed out');
  await wait(1000);
  op=await client.hosting('GET','/'+op.name.replace(/^\/+/,''));}
 if(op.error)throw Error(op.error.message||'Hosting clone failed');
 return versionName(op.response?.name);
}
async function deploy({client,root,backupPath,wait=pause,log=console.log}){
 const domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+PROJECT+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Wrong Firebase domain');
 const source=await current(client),files=overlay(root),before=await allFiles(client,source);
 const sourceConfig=(await client.hosting('GET','/'+source)).config;
 const nextConfig=configWithPayRoute(sourceConfig);
 const version=await clone(client,source,wait);
 const backup={site:PROJECT,sourceVersion:source,patchedVersion:version,updatedFiles:FILES,createdAt:new Date().toISOString()};
 fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{mode:0o600});
 const populated=await client.hosting('POST','/'+version+':populateFiles',{
  files:Object.fromEntries([...files].map(([name,info])=>[name,info.hash]))
 });
 const byHash=new Map([...files.values()].map(info=>[info.hash,info]));
 for(const hash of populated.uploadRequiredHashes||[]){
  if(!byHash.has(hash))throw Error('Hosting requested unexpected file hash');
  await client.upload(populated.uploadUrl+'/'+hash,byHash.get(hash).bytes);
 }
 assertFiles(before,await allFiles(client,version),files);
 const clonedConfig=(await client.hosting('GET','/'+version)).config;
 if(!equal(clonedConfig,sourceConfig))throw Error('Cloned Hosting configuration differs from live before patch');
 await client.hosting('PATCH','/'+version,{config:nextConfig},{updateMask:'config'});
 const installed=(await client.hosting('GET','/'+version)).config;
 if(!equal(installed,nextConfig))throw Error('Hosting /pay routing did not verify');
 await client.hosting('PATCH','/'+version,{status:'FINALIZED'},{updateMask:'status'});
 if(await current(client)!==source)throw Error('A newer website release appeared; no /pay deployment performed');
 const release=await client.hosting('POST','/'+BASE+'/channels/live/releases',
  {message:'Teyza /pay verified website subscription portal'},{versionName:version});
 if(await current(client)!==version)throw Error('Hosting release could not be confirmed');
 backup.releaseName=release.name;backup.publishedAt=new Date().toISOString();
 fs.writeFileSync(backupPath,JSON.stringify(backup,null,2),{mode:0o600});
 log('Published /pay website. Existing Firebase admin files and unrelated routes remain preserved.');
 return backup;
}
async function rollback({client,backupPath,log=console.log}){
 const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
 if(backup.site!==PROJECT)throw Error('Backup belongs to another project');
 const old=versionName(backup.sourceVersion),updated=versionName(backup.patchedVersion);
 if(await current(client)!==updated)throw Error('Newer release is live; refusing unsafe rollback');
 await client.hosting('POST','/'+BASE+'/channels/live/releases',
  {message:'Rollback Teyza /pay website'},{versionName:old});
 log('Restored previous Teyza Hosting version');
}
async function main(){
 const action=process.argv[2];
 if(!['deploy','rollback'].includes(action))throw Error('Use deploy or rollback');
 const root=path.resolve(__dirname,'../../web/app-first/public');
 const backupPath=path.resolve(__dirname,'../../teyza-pay-website-backup.json');
 const client=await connect();
 if(action==='deploy')await deploy({client,root,backupPath});
 else await rollback({client,backupPath});
}
if(require.main===module)main().catch(e=>{console.error('Teyza /pay deployment blocked:',e.message);process.exitCode=1;});
module.exports={FILES,overlay,configWithPayRoute,assertFiles,deploy,rollback};
