'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {FILES,staticOverlay,staticConfig,configEqual,inspect,deploy,rollback}=require('./pay-preview-patch.cjs');
const root=path.resolve(__dirname,'../../web/app-first/public');
const BASE='sites/business-lift-3c19c/versions/';
function fixture(options={}){
 const source=BASE+'current',staged=BASE+'staged';
 const existingFiles=new Map([
  ['/index.html','home-sha'],['/admin.html','admin-sha'],['/js/admin.js','js-sha'],['/api/help','api-sha'],['/terms.html','terms-sha']
 ]);
 const original={
  cleanUrls:true,
  redirects:Array.from({length:8},(_,i)=>({glob:'/old-'+i,location:'/new-'+i,statusCode:302})),
  rewrites:[{glob:'/api/**',function:'existing-api'},...Array.from({length:58},(_,i)=>({glob:'/old-rewrite-'+i,path:'/home.html'})),{glob:'**',path:'/preview.html'}],
  headers:Array.from({length:901},(_,i)=>({glob:'/header-test-'+i,headers:{'Cache-Control':'no-cache'}}))
 };
 const versions=new Map([[source,{files:new Map(existingFiles),config:structuredClone(original),status:'FINALIZED'}]]);
 let live=source;
 const calls=[],directory=fs.mkdtempSync(path.join(os.tmpdir(),'teyza-pay-static-'));
 const client={
  hosting:async(method,uri,body,query)=>{
   calls.push({method,uri,body,query});
   if(uri.endsWith('/customDomains/teyza.co.za'))
     return {name:'projects/business-lift-3c19c/sites/business-lift-3c19c/customDomains/teyza.co.za'};
   if(uri.endsWith('/channels/live/releases')){
     live=query.versionName;return {name:'releases/preview'};
   }
   if(uri.endsWith('/channels/live'))return {release:{version:{name:options.race&&versions.has(staged)?BASE+'external':live}}};
   if(uri.endsWith('/versions:clone')){
     versions.set(staged,{files:new Map(existingFiles),config:options.cloneEmpty?{}:structuredClone(original),status:'CREATED'});
     return {name:'sites/business-lift-3c19c/operations/clone'};
   }
   if(uri.includes('/operations/'))return {done:true,response:{name:staged}};
   const versionName=uri.slice(1).replace(/\/files$|:populateFiles$/,'');
   const obj=versions.get(versionName);
   assert(obj,'Unexpected version '+versionName);
   if(uri.endsWith('/files'))return {files:[...obj.files].map(([file,hash])=>({path:file,hash,status:'ACTIVE'}))};
   if(uri.endsWith(':populateFiles')){
     for(const [file,hash] of Object.entries(body.files))obj.files.set(file,hash);
     return {uploadRequiredHashes:Object.values(body.files),uploadUrl:'https://upload-firebasehosting.googleapis.com/upload/'+staged+'/files'};
   }
   if(method==='PATCH'){
     if(body.config)obj.config=options.invalidPatchedConfig?{}:structuredClone(body.config);
     if(body.status)obj.status=body.status;
   }
   return {name:versionName,config:obj.config,status:obj.status};
  },
  upload:async()=>{if(options.failUpload)throw Error('Upload blocked');}
 };
 return {client,root,backupPath:path.join(directory,'static-backup.json'),wait:async()=>{},log:()=>{},calls,versions,source,staged,original,live:()=>live};
}
test('Two non-transactional /pay pages match exactly and contain no checkout or scripts',()=>{
 assert.deepEqual(FILES,['/pay.html','/pay/index.html']);
 const overlay=staticOverlay(root);
 assert.equal(overlay.size,2);
 const page=fs.readFileSync(path.join(root,'pay.html'),'utf8');
 assert(page.includes('Secure payments are not yet available'));
 assert(page.includes('© 2026 TEYZA SA'));
 assert(!/<script\b|<form\b|<iframe\b|checkout\.paystack\.com|sk_live_/i.test(page));
 assert(!page.includes('seller-web-billing.mjs'));
 assert(page.includes('href="https://teyza.co.za/pay"'));
});
test('Static payment page installs only two URL rewrites and retains 901 headers',()=>{
 const f=fixture(),next=staticConfig(f.original);
 assert.equal(next.rewrites.length,f.original.rewrites.length+2);
 assert.equal(next.rewrites[0].glob,'/pay');
 assert.equal(next.rewrites[1].glob,'/pay/');
 assert.deepEqual(next.rewrites.slice(2),f.original.rewrites);
 assert.deepEqual(next.headers,f.original.headers);
 assert.deepEqual(next.redirects,f.original.redirects);
 assert.equal(next.headers.length,901);
 assert.equal(f.original.rewrites.length,60);
 assert(configEqual({redirects:[],headers:[],rewrites:[]},{}));
 assert.throws(()=>staticConfig({rewrites:[{glob:'/pay',function:'unexpected'}]}),/pre-existing \/pay/);
});
test('Read-only inspection has zero mutations and reports canonical teyza.co.za/pay',async()=>{
 const f=fixture(),output=[];
 await inspect({...f,log:v=>output.push(v)});
 assert(output.some(s=>s.includes('https://teyza.co.za/pay')));
 assert(output.some(s=>s.includes('Unchanged header rules: 901')));
 assert(f.calls.every(r=>r.method==='GET'));
 assert.equal(f.live(),f.source);
});
test('Deploy survives clone with EMPTY configuration, preserves all live files and full rules, rollback works',async()=>{
 const f=fixture({cloneEmpty:true});
 const result=await deploy(f);
 assert.equal(result.kind,'static_no_payment');
 assert.equal(f.live(),f.staged);
 const staged=f.versions.get(f.staged);
 assert.equal(staged.files.get('/admin.html'),'admin-sha');
 assert.equal(staged.files.get('/api/help'),'api-sha');
 assert.equal(staged.config.headers.length,901);
 assert.deepEqual(staged.config.redirects,f.original.redirects);
 assert.deepEqual(staged.config.rewrites.slice(2),f.original.rewrites);
 assert(fs.existsSync(f.backupPath));
 await rollback(f);
 assert.equal(f.live(),f.source);
});
test('Never publish on upload failure, unexpected serving rules or concurrent release; preserve rollback backup',async()=>{
 for(const options of [{failUpload:true},{invalidPatchedConfig:true,cloneEmpty:true},{race:true}]){
  const f=fixture(options),original={site:'business-lift-3c19c',publishedAt:'2026-11-01',releaseName:'older-static'};
  fs.writeFileSync(f.backupPath,JSON.stringify(original));
  await assert.rejects(deploy(f));
  assert.deepEqual(JSON.parse(fs.readFileSync(f.backupPath)),original);
  assert(!f.calls.some(c=>c.uri.endsWith('/channels/live/releases')));
 }
});
test('Unpublished checkpoints cannot be used to rollback',async()=>{
 const f=fixture();
 fs.writeFileSync(f.backupPath,JSON.stringify({site:'business-lift-3c19c',sourceVersion:f.source,patchedVersion:f.staged,kind:'static_no_payment'}));
 await assert.rejects(rollback(f),/No verified static/);
 assert.equal(f.live(),f.source);
});
