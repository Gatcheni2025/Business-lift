'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {FILES,overlay,configWithPayRoute,deploy,rollback}=require('./pay-site-patch.cjs');
const root=path.resolve(__dirname,'../../web/app-first/public');
const BASE='sites/business-lift-3c19c/versions/';
function fixture(options={}){
 const source=BASE+'source',next=BASE+'new',files=new Map([['/admin.html','admin-hash'],['/js/admin.js','admin-js'],['/index.html','homepage'],['/api/help','api'],['/seller-subscriptions.html','old-info']]);
 const original={cleanUrls:true,rewrites:[{glob:'/api/**',function:'existingApi'},{glob:'**',path:'/404.html'}],
   headers:[{glob:'**',headers:{'Strict-Transport-Security':'max-age=31536000'}}],
   redirects:[{glob:'/existing',location:'/support.html',statusCode:302}]};
 const versions=new Map([[source,{files,config:structuredClone(original)}]]);
 let live=source;const calls=[],dir=fs.mkdtempSync(path.join(os.tmpdir(),'teyza-pay-route-'));
 const client={
  hosting:async(method,uri,body,query)=>{
   calls.push({method,uri,body,query});
   if(uri.endsWith('/customDomains/teyza.co.za'))return {name:'projects/business-lift-3c19c/sites/business-lift-3c19c/customDomains/teyza.co.za'};
   if(uri.endsWith('/channels/live/releases')){live=query.versionName;return {name:'release/new'};}
   if(uri.endsWith('/channels/live'))return {release:{version:{name:options.race&&versions.has(next)?BASE+'later':live}}};
   if(uri.endsWith('/versions:clone')){versions.set(next,{files:new Map(files),config:structuredClone(original)});return {name:'sites/business-lift-3c19c/operations/clone'};}
   if(uri.includes('/operations/'))return {done:true,response:{name:next}};
   const name=uri.slice(1).replace(/\/files$|:populateFiles$/,'');
   const v=versions.get(name);assert(v,'Unknown hosting version '+name);
   if(uri.endsWith('/files'))return {files:[...v.files].map(([path,hash])=>({path,hash,status:'ACTIVE'}))};
   if(uri.endsWith(':populateFiles')){for(const [name,hash] of Object.entries(body.files))v.files.set(name,hash);
     return {uploadRequiredHashes:Object.values(body.files),uploadUrl:'https://upload-firebasehosting.googleapis.com/upload/'+next+'/files'};}
   if(method==='PATCH'){if(body.config)v.config=structuredClone(body.config);if(body.status)v.status=body.status;}
   return {name,config:v.config};
  },
  upload:async()=>{if(options.failUpload)throw Error('Upload stopped');}
 };
 return {client,root,backupPath:path.join(dir,'backup.json'),wait:async()=>{},log:()=>{},calls,versions,source,next,original,live:()=>live};
}
test('Pay portal is standalone, matching clean URL alias with UID and recurring consent',()=>{
 assert.deepEqual(FILES,['/pay.html','/pay/index.html','/js/seller-web-billing.mjs','/seller-subscriptions.html']);
 const files=overlay(root);assert.equal(files.size,4);
});
test('Only /pay rewrites and security headers are added; existing API/admin rules preserved',()=>{
 const base={rewrites:[{glob:'/api/**',function:'existingApi'},{glob:'**',path:'/404.html'}],headers:[{glob:'**',headers:{'Strict-Transport-Security':'max-age=31536000'}}],redirects:[{glob:'/old',location:'/new',statusCode:301}]};
 const modified=configWithPayRoute(base);
 assert.equal(modified.rewrites[0].glob,'/pay');
 assert.equal(modified.rewrites[0].path,'/pay.html');
 assert.equal(modified.rewrites[1].glob,'/pay/');
 assert.deepEqual(modified.rewrites.slice(2),base.rewrites);
 assert.deepEqual(modified.redirects,base.redirects);
 assert.equal(modified.headers.find(x=>x.glob==='/pay').headers['Cache-Control'],'no-store');
 assert.equal(base.rewrites.length,2,'Original Hosting config must not be mutated');
 assert.throws(()=>configWithPayRoute({rewrites:[{glob:'/pay',function:'evilFunction'}]}),/Existing \/pay/);
});
test('Scoped Hosting clone preserves all admin/API files and refuses unexpected publish failures',async()=>{
 const x=fixture();await deploy(x);assert.equal(x.live(),x.next);
 assert.equal(x.versions.get(x.next).files.get('/admin.html'),'admin-hash');
 assert.equal(x.versions.get(x.next).files.get('/js/admin.js'),'admin-js');
 assert.equal(x.versions.get(x.next).files.get('/api/help'),'api');
 assert.equal(x.versions.get(x.next).config.rewrites.at(-1).glob,'**');
 assert(x.calls.some(c=>c.body?.status==='FINALIZED'));
 assert.equal(JSON.parse(fs.readFileSync(x.backupPath)).site,'business-lift-3c19c');
 await rollback(x);assert.equal(x.live(),x.source);
 for(const options of [{failUpload:true},{race:true}]){
   const y=fixture(options);await assert.rejects(deploy(y));
   assert(!y.calls.some(c=>c.uri.endsWith('/channels/live/releases')),'Blocked changes cannot publish');
 }
});
