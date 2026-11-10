'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {FILES,overlay,configWithPayRoute,normalizeConfig,equal,inspect,deploy,rollback}=require('./pay-site-patch.cjs');
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
   if(uri.endsWith('/versions:clone')){versions.set(next,{files:new Map(files),config:options.emptyCloneConfig?{}:structuredClone(original),status:'CREATED'});return {name:'sites/business-lift-3c19c/operations/clone'};}
   if(uri.includes('/operations/'))return {done:true,response:{name:next}};
   const name=uri.slice(1).replace(/\/files$|:populateFiles$/,'');
   const v=versions.get(name);assert(v,'Unknown hosting version '+name);
   if(uri.endsWith('/files'))return {files:[...v.files].map(([path,hash])=>({path,hash,status:'ACTIVE'}))};
   if(uri.endsWith(':populateFiles')){for(const [name,hash] of Object.entries(body.files))v.files.set(name,hash);
     return {uploadRequiredHashes:Object.values(body.files),uploadUrl:'https://upload-firebasehosting.googleapis.com/upload/'+next+'/files'};}
   if(method==='PATCH'){if(body.config)v.config=options.rejectConfigPatch?{}:structuredClone(body.config);if(body.status)v.status=body.status;}
   return {name,config:v.config,status:v.status||'FINALIZED'};
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
 assert(equal({rewrites:[],headers:[],redirects:[]},{}),'Empty REST arrays can be omitted');
 assert(equal({rewrites:[{path:'/pay.html',glob:'/pay'}]},{rewrites:[{glob:'/pay',path:'/pay.html'}]}),'JSON key order is not semantically material');
 assert.throws(()=>configWithPayRoute({rewrites:[{glob:'/pay',function:'evilFunction'}]}),/Existing \/pay/);
 const safe=configWithPayRoute({headers:[
   {glob:'/pay',headers:{'Content-Security-Policy':"default-src 'self'",
      'Strict-Transport-Security':'max-age=31536000; includeSubDomains'}},
   {glob:'/pay/',headers:{'Cache-Control':'private, no-store',
      'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'"}}
 ]});
 const exact=safe.headers.find(x=>x.glob==='/pay');
 assert.equal(exact.headers['Content-Security-Policy'],"default-src 'self'",'Must not modify existing CSP');
 assert.equal(exact.headers['Strict-Transport-Security'],'max-age=31536000; includeSubDomains');
 assert.equal(exact.headers['Cache-Control'],'no-store');
 assert.equal(exact.headers['X-Frame-Options'],'DENY');
 assert.equal(exact.headers['Referrer-Policy'],'no-referrer');
 const slash=safe.headers.find(x=>x.glob==='/pay/');
 assert.equal(slash.headers['Cache-Control'],'private, no-store','Do not replace compliant existing cache policy');
 assert.equal(slash.headers['Content-Security-Policy'],"default-src 'none'");
 assert.equal(safe.headers.length,4);
 for(const key of ['Cache-Control','X-Frame-Options','Referrer-Policy']){
   assert.throws(()=>configWithPayRoute({headers:[{glob:'/pay',headers:{
     [key]:key==='Cache-Control'?'public,max-age=3600':key==='X-Frame-Options'?'SAMEORIGIN':'strict-origin-when-cross-origin'
   }}]}),/manual security review/,'Conflicting policy '+key+' must stop release');
 }
 assert.throws(()=>configWithPayRoute({headers:[
   {glob:'/pay',headers:{'Content-Security-Policy':'abc'}},
   {glob:'/pay',headers:{'Content-Security-Policy':'xyz'}}
 ]}),/duplicate \/pay security/);
 assert.throws(()=>configWithPayRoute({headers:[{glob:'/pay',headers:{'cache-control':'no-store','Cache-Control':'no-store'}}]}),/Conflicting duplicate/);
});
test('Scoped Hosting clone restores missing source config and preserves all admin/API files',async()=>{
 const x=fixture({emptyCloneConfig:true});await deploy(x);assert.equal(x.live(),x.next);
 assert.deepEqual(x.versions.get(x.next).config.rewrites.slice(2),x.original.rewrites);
 assert.deepEqual(x.versions.get(x.next).config.redirects,x.original.redirects);
 assert.deepEqual(x.versions.get(x.next).config.headers.at(-1),x.original.headers[0]);
 assert.equal(x.versions.get(x.next).files.get('/admin.html'),'admin-hash');
 assert.equal(x.versions.get(x.next).files.get('/js/admin.js'),'admin-js');
 assert.equal(x.versions.get(x.next).files.get('/api/help'),'api');
 assert.equal(x.versions.get(x.next).config.rewrites.at(-1).glob,'**');
 assert(x.calls.some(c=>c.body?.status==='FINALIZED'));
 assert.equal(JSON.parse(fs.readFileSync(x.backupPath)).site,'business-lift-3c19c');
 await rollback(x);assert.equal(x.live(),x.source);
 for(const options of [{failUpload:true},{race:true},{rejectConfigPatch:true,emptyCloneConfig:true}]){
   const y=fixture(options);
   const older={site:'business-lift-3c19c',publishedAt:'2026-11-01T00:00:00Z',releaseName:'previous-release'};
   fs.writeFileSync(y.backupPath,JSON.stringify(older));
   await assert.rejects(deploy(y));
   assert.deepEqual(JSON.parse(fs.readFileSync(y.backupPath)),older,'Failed staging must preserve last good rollback');
   assert(!y.calls.some(c=>c.uri.endsWith('/channels/live/releases')),'Blocked changes cannot publish');
 }
});

test('Read-only inspection checks teyza.co.za and never clones, patches or publishes',async()=>{
 const x=fixture();
 const events=[];
 const result=await inspect({...x,log:message=>events.push(message)});
 assert.equal(result.source,x.source);
 assert(events.some(x=>x.includes('https://teyza.co.za/pay')));
 assert(x.calls.every(c=>c.method==='GET'),'Inspection must never mutate Hosting');
 assert.equal(x.live(),x.source);
 assert(!fs.existsSync(x.backupPath),'Inspect does not overwrite rollback');
});
test('A forged non-published backup cannot trigger a rollback',async()=>{
 const x=fixture();
 fs.writeFileSync(x.backupPath,JSON.stringify({site:'business-lift-3c19c',sourceVersion:x.source,patchedVersion:x.next}));
 await assert.rejects(rollback(x),/successfully published/);
 assert.equal(x.live(),x.source);
});
