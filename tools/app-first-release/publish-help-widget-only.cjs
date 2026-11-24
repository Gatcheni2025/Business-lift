'use strict';
// Scope-only Teyza public support launcher publisher; preserves all other assets,
// redirect rules, security headers, payment pages, ads, admin and Work.
// Usage: node tools/app-first-release/publish-help-widget-only.cjs check|deploy|rollback
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {allFiles,versionName}=require('./hosting-patch.cjs');

const SITE=PROJECT,BASE='sites/'+SITE;
const pages=['/index.html','/support.html','/for-shop-owners.html',
 '/seller-getting-started.html','/seller-subscriptions.html',
 '/register.html','/how-it-works.html','/download.html'];
const paths=[...pages,'/assets/teyza-help-widget.js','/assets/teyza-help-widget.css'];
const root=path.resolve(__dirname,'../../web/app-first/public');
const backupPath=path.resolve(__dirname,'../../hosting-backup-teyza-help-widget.json');

function managedFiles(){
  const js=fs.readFileSync(path.join(root,'assets/teyza-help-widget.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'assets/teyza-help-widget.css'),'utf8');
  if(!js.includes('https://wa.me/27798261972?text=AGENT')||
     !js.includes('Approved sellers')||!js.includes('mailto:support@teyza.co.za')||
     !css.includes('.tw-help-panel'))throw Error('Reviewed WhatsApp support popup assets missing.');
  for(const p of pages){
    const html=fs.readFileSync(path.join(root,p.slice(1)),'utf8');
    if(!html.includes('/assets/teyza-help-widget.css')||
       !html.includes('/assets/teyza-help-widget.js'))
      throw Error('Support popup integration missing: '+p);
  }
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  if(/\bR49\b|Introductory first month/i.test(index))
    throw Error('Obsolete R49 first-month offer remains in website source.');
  return new Map(paths.map(p=>{
    const bytes=zlib.gzipSync(fs.readFileSync(path.join(root,p.slice(1))),{level:9});
    return [p,{bytes,hash:crypto.createHash('sha256').update(bytes).digest('hex')}];
  }));
}
async function current(client){
  const response=await client.hosting('GET','/'+BASE+'/channels/live');
  return versionName(response.release?.version?.name);
}
async function clone(client,source){
  let result=await client.hosting('POST','/'+BASE+'/versions:clone',{sourceVersion:source,finalize:false});
  if(!result.name)throw Error('Hosting did not return a clone operation.');
  const start=Date.now();
  while(!result.done){
    if(Date.now()-start>300000)throw Error('Hosting clone timed out.');
    await new Promise(resolve=>setTimeout(resolve,1000));
    result=await client.hosting('GET','/'+(result.name.startsWith('/')?result.name.slice(1):result.name));
  }
  if(result.error)throw Error(result.error.message||'Hosting clone failed.');
  return versionName(result.response?.name);
}
function verify(before,after,managed){
  const expected=new Set([...before.keys(),...managed.keys()]);
  if(after.size!==expected.size)throw Error('Unexpected Hosting file count.');
  for(const [p,hash] of before){
    if(!managed.has(p)&&after.get(p)!==hash)throw Error('Unrelated Hosting file changed: '+p);
  }
  for(const [p,item] of managed){
    if(after.get(p)!==item.hash)throw Error('Support popup file was not verified: '+p);
  }
}
async function inspect(client){
  const domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+SITE+'/customDomains/teyza.co.za');
  if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Teyza custom domain mismatch.');
  const source=await current(client);
  const before=await allFiles(client,source);
  if(!paths.every(p=>before.has(p)))throw Error('Homepage or stylesheet does not exist in live Hosting.');
  const managed=managedFiles();
  return {source,before,managed};
}
async function check(client){
  const {source,before,managed}=await inspect(client);
  const changed=paths.filter(p=>before.get(p)!==managed.get(p).hash);
  console.log('Teyza support popup check: '+source);
  console.log('Only these Hosting files may change: '+paths.join(', '));
  console.log('Assets requiring updates: '+(changed.join(', ')||'none'));
  console.log('Payment, ads, Work, admin, security headers and redirects are preserved.');
}
async function deploy(client){
  const {source,before,managed}=await inspect(client);
  if(paths.every(p=>before.get(p)===managed.get(p).hash)){
    console.log('Support popup is already up to date. No release created.');
    return;
  }
  const original=await client.hosting('GET','/'+source);
  const candidate=await clone(client,source);
  const backup={site:SITE,sourceVersion:source,patchedVersion:candidate,createdAt:new Date().toISOString(),scope:paths};
  const checkpoint=backupPath.replace(/\.json$/,'-'+candidate.split('/').at(-1)+'.json');
  fs.writeFileSync(checkpoint,JSON.stringify(backup,null,2));
  const populated=await client.hosting('POST','/'+candidate+':populateFiles',{
    files:Object.fromEntries([...managed].map(([p,item])=>[p,item.hash]))
  });
  const byHash=new Map([...managed.values()].map(item=>[item.hash,item]));
  for(const hash of populated.uploadRequiredHashes||[]){
    const item=byHash.get(hash);
    if(!item)throw Error('Unexpected upload hash: '+hash);
    await client.upload(populated.uploadUrl+'/'+hash,item.bytes);
  }
  verify(before,await allFiles(client,candidate),managed);
  const created=await client.hosting('GET','/'+candidate);
  const canonical=v=>JSON.stringify(v,(k,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.fromEntries(Object.entries(val).sort()):val);
  if(canonical(created.config)!==canonical(original.config))throw Error('Hosting config changed. Publication blocked.');
  await client.hosting('PATCH','/'+candidate,{status:'FINALIZED'},{updateMask:'status'});
  if(await current(client)!==source)throw Error('Another website version went live. Publication blocked.');
  const release=await client.hosting('POST','/'+BASE+'/channels/live/releases',{
    message:'Teyza public contact popup and WhatsApp seller support entry'
  },{versionName:candidate});
  if(await current(client)!==candidate)throw Error('Published version was not confirmed.');
  Object.assign(backup,{releaseName:release.name,publishedAt:new Date().toISOString()});
  fs.writeFileSync(backupPath,JSON.stringify(backup,null,2));
  console.log('Published only Teyza support popup assets and public-page integrations; other Hosting assets preserved.');
  console.log('https://teyza.co.za/');
}
async function rollback(client){
  const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
  if(backup.site!==SITE||await current(client)!==versionName(backup.patchedVersion)){
    throw Error('A newer website version is live. Rollback blocked.');
  }
  await client.hosting('POST','/'+BASE+'/channels/live/releases',{
    message:'Rollback scoped Teyza website support popup'
  },{versionName:versionName(backup.sourceVersion)});
  console.log('Restored the previous Teyza website version.');
}
if(require.main===module){
  const action=process.argv[2];
  if(!['check','deploy','rollback'].includes(action))throw Error('Use check, deploy or rollback.');
  connect().then(client=>({check,deploy,rollback})[action](client))
    .catch(error=>{console.error('Scoped support popup publisher stopped: '+error.message);process.exitCode=1;});
}
module.exports={paths,managedFiles,verify,check,deploy,rollback};
