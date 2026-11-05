'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {FILES,APP_URL,PLAY_URL,overlay,assertPreserved,deploy,rollback}=require('./store-links-patch.cjs');
const root=path.resolve(__dirname,'../../web/app-first/public');
const base='sites/business-lift-3c19c/versions/';
function setup(opts={}){
  const original=base+'base',patched=base+'cloned';
  const data=new Map([['/index.html','old-home'],['/download.html','old-download'],['/assets/app-first.css','old-css'],['/admin.html','admin-private'],['/js/seller.js','seller-js']]);
  const versions=new Map([[original,new Map(data)]]),calls=[],work=fs.mkdtempSync(path.join(os.tmpdir(),'store-links-test-'));
  let live=original;
  const client={
    hosting:async(method,uri,body,query)=>{
      calls.push({method,uri,body,query});
      if(uri.endsWith('/customDomains/teyza.co.za'))return {name:opts.wrongDomain?'other':'projects/business-lift-3c19c/sites/business-lift-3c19c/customDomains/teyza.co.za'};
      if(uri.endsWith('/channels/live'))return {release:{version:{name:opts.race&&versions.has(patched)?base+'newer':live}}};
      if(uri.endsWith('/versions:clone')){versions.set(patched,new Map(versions.get(original)));return {name:'sites/business-lift-3c19c/operations/example'};}
      if(uri.includes('/operations/'))return {done:true,response:{name:patched}};
      if(uri.endsWith('/channels/live/releases')){live=query.versionName;return {name:'new-release'};}
      const key=uri.slice(1).replace(/\/files$|:populateFiles$/,'');
      const m=versions.get(key);assert(m,'Unexpected fake Hosting URL '+uri);
      if(uri.endsWith('/files'))return {files:[...m].map(([name,hash])=>({path:name,hash,status:'ACTIVE'}))};
      if(uri.endsWith(':populateFiles')){for(const [name,hash] of Object.entries(body.files))m.set(name,hash);return {uploadRequiredHashes:[...Object.values(body.files)],uploadUrl:'https://test.example/upload'};}
      return {name:key};
    },
    upload:async()=>{if(opts.failUpload)throw Error('Simulated upload failure')}
  };
  return {client,root,backupPath:path.join(work,'backup.json'),wait:async()=>{},log:()=>{},calls,versions,original,patched,data,live:()=>live};
}
test('Store website links are present on both pages, with only three scoped files',()=>{
  assert.deepEqual(FILES,['/index.html','/download.html','/assets/app-first.css']);
  const o=overlay(root);
  assert.equal(o.size,3);
  const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const download=fs.readFileSync(path.join(root,'download.html'),'utf8');
  for(const page of [home,download]){assert(page.includes(APP_URL));assert(page.includes(PLAY_URL));}
  assert(!home.includes('iPhone release coming soon'));
});
test('Hosting clone updates only store pages and CSS; unrelated file hashes remain unchanged',async()=>{
  const a=setup(),b=await deploy(a);
  assert.equal(a.live(),a.patched);assert.equal(b.sourceVersion,a.original);
  for(const [name,hash] of a.data)if(!FILES.includes(name))assert.equal(a.versions.get(a.patched).get(name),hash);
  assert(!a.calls.some(c=>c.body?.config),'Should not alter the Hosting configuration');
  assert(a.calls.some(c=>c.uri.endsWith('/channels/live/releases')));
  await rollback(a);assert.equal(a.live(),a.original);
});
test('Publishing stops on wrong domain, upload failure, concurrency or changed unrelated files',async()=>{
  for(const flag of ['wrongDomain','failUpload','race']){
    const a=setup({[flag]:true});
    await assert.rejects(deploy(a));
    assert(!a.calls.some(c=>c.uri.endsWith('/channels/live/releases')));
  }
  assert.throws(()=>assertPreserved(new Map([['/admin.html','old']]),new Map([['/admin.html','changed']]),new Map()),/Unrelated/);
});
