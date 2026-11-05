'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {FILES,APP_URL,PLAY_URL,overlay,assertPreserved,deploy,rollback}=require('./premium-site-patch.cjs');
const root=path.resolve(__dirname,'../../web/app-first/public');
const base='sites/business-lift-3c19c/versions/';
function setup(opts={}){
  const original=base+'base',patched=base+'cloned';
  const data=new Map([['/index.html','old-0'],['/download.html','old-1'],['/how-it-works.html','old-2'],['/for-shop-owners.html','old-3'],['/seller-subscriptions.html','old-4'],['/support.html','old-5'],['/register.html','old-6'],['/agents.html','old-agents'],['/assets/app-first.css','old-7'],['/sitemap.xml','old-8'],['/admin.html','admin-private'],['/js/seller.js','seller-js'],['/work.html','field-private']]);
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
test('Store links and footer vacancy are present on eight scoped public pages',()=>{
  assert.deepEqual(FILES,["/index.html","/download.html","/how-it-works.html","/for-shop-owners.html","/seller-subscriptions.html","/support.html","/register.html","/agents.html"]);
  const o=overlay(root);
  assert.equal(o.size,8);
  const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const download=fs.readFileSync(path.join(root,'download.html'),'utf8');
  for(const page of [home,download]){assert(page.includes(APP_URL));assert(page.includes(PLAY_URL));}
  assert(!home.includes('iPhone release coming soon'));
  for(const f of FILES.filter(p=>p!=='/agents.html')){
    const page=fs.readFileSync(path.join(root,f.slice(1)),'utf8');
    assert(page.includes('class="p-site"'));
    assert(page.indexOf('href="/agents.html"')>page.indexOf('<footer '));
    assert(page.includes('40 Courtown Crescent'));
  }
  const agents=fs.readFileSync(path.join(root,'agents.html'),'utf8');
  assert(agents.includes('Support local shops'));
  assert(!agents.includes('R99 once per eligible shop'));
  assert(!download.includes('until Google and Apple complete review'));
});
test('Hosting clone updates only the reviewed pages; CSS, sitemap and private files remain unchanged',async()=>{
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
