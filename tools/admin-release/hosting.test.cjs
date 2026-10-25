'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {patch,rollback,servingConfig,overlay,versionName}=require('./hosting-patch.cjs');
const root=path.resolve(__dirname,'../../web/teyza-admin/public'),base='sites/business-lift-3c19c/versions/';
function setup(options={}){
 const source=base+'original',next=base+'patched',existing=new Map([['/index.html','home-hash'],['/shops.html','shops-hash'],['/js/firebase-r2.js','existing-auth-hash'],['/admin-sellers.html','old-admin']]);
 const config={cleanUrls:true,trailingSlashBehavior:'REMOVE',rewrites:[{glob:'/api/**',function:'existingApi'},{glob:'**',path:'/404.html'}],
  headers:[{glob:'**',headers:{'X-Frame-Options':'DENY'}}],redirects:[{glob:'/old-shop',location:'/shops.html',statusCode:301}]};
 let live=source;const versions=new Map([[source,{config,files:existing}]]),calls=[],directory=fs.mkdtempSync(path.join(os.tmpdir(),'teyza-admin-test-'));
 const client={hosting:async(method,uri,body,query)=>{
  calls.push({method,uri,body,query});
  if(uri.endsWith('/customDomains/teyza.co.za'))return {name:options.wrongDomain?'wrong':uri.slice(1)};
  if(uri.endsWith('/channels/live'))return {release:{version:{name:options.race&&versions.has(next)?base+'newer':live}}};
  if(uri.endsWith('/versions:clone')){versions.set(next,{config:structuredClone(config),files:new Map(existing)});return {name:'sites/business-lift-3c19c/operations/clone'};}
  if(uri.includes('/operations/'))return {done:true,response:{name:next}};
  if(uri.endsWith('/channels/live/releases')){live=query.versionName;return {name:'release/new'};}
  const name=uri.slice(1).replace(/\/files$|:populateFiles$/,'');const version=versions.get(name);assert(version,'Unknown fake route '+uri);
  if(uri.endsWith('/files')){
   const files=[...version.files].map(([path,hash])=>({path,hash,status:'ACTIVE'}));
   if(options.dropFile&&name===next)return {files:files.filter(f=>f.path!=='/shops.html')};return {files};
  }
  if(uri.endsWith(':populateFiles')){for(const [p,h] of Object.entries(body.files))version.files.set(p,h);
   return {uploadRequiredHashes:[...new Set(Object.values(body.files))],uploadUrl:'https://upload-firebasehosting.googleapis.com/upload/'+next+'/files'};}
  if(method==='PATCH'){if(body.config)version.config=body.config;if(body.status)version.status=body.status;return {name,...version};}
  return {name,config:version.config};
 },upload:async()=>{if(options.failUpload)throw new Error('Upload failed');}};
 return {client,source,next,calls,config,existing,versions,backupPath:path.join(directory,'backup.json'),log:()=>{},wait:async()=>{},root,live:()=>live};
}
test('Hosting overlay preserves unrelated files, configuration and the exact rollback version before publication',async()=>{
 const f=setup(),result=await patch(f);assert.equal(f.live(),f.next);assert.equal(result.sourceVersion,f.source);
 for(const [p,h] of f.existing)if(p!=='/admin-sellers.html')assert.equal(f.versions.get(f.next).files.get(p),h);
 assert.equal(f.versions.get(f.next).files.get('/admin/index.html'),f.versions.get(f.next).files.get('/admin.html'));
 assert.deepEqual(f.versions.get(f.next).config.redirects,f.config.redirects);
 assert(f.versions.get(f.next).config.rewrites.some(r=>r.function==='existingApi'));
 const calls=f.calls;assert(calls.findIndex(c=>c.body?.status==='FINALIZED')<calls.findIndex(c=>c.uri.endsWith('/channels/live/releases')));
 assert.equal(JSON.parse(fs.readFileSync(f.backupPath)).patchedVersion,f.next);
 await rollback(f);assert.equal(f.live(),f.source);
});
test('Missing preserved files, upload failure, wrong domain and a concurrent deployment cannot publish',async()=>{
 for(const options of [{dropFile:true},{failUpload:true},{wrongDomain:true},{race:true}]){
  const f=setup(options);await assert.rejects(patch(f));assert(!f.calls.some(c=>c.uri.endsWith('/channels/live/releases')));
 }
});
test('Rollback refuses to overwrite a later website deployment or another project',async()=>{
 const f=setup();await patch(f);await rollback(f);await assert.rejects(rollback(f),/different website release/);
 fs.writeFileSync(f.backupPath,JSON.stringify({site:'another-site'}));await assert.rejects(rollback(f),/another site/);
 assert.throws(()=>versionName('sites/other/versions/123'));assert.throws(()=>versionName(base+'../123'));
});
test('All admin aliases have absolute asset paths and only the explicit admin overlay is packaged',()=>{
 const files=overlay(root);assert.equal(files.size,10);
 const config=servingConfig({rewrites:[{glob:'/admin',path:'/old.html'},{glob:'**',path:'/404.html'}]});
 assert.deepEqual(config.rewrites[0],{glob:'/admin',path:'/admin.html'});assert.equal(config.rewrites.at(-1).path,'/404.html');
 const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');assert(html.includes('content="R316"'));
 for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g))assert(match[1].startsWith('/'));
 assert(!html.includes('.php'));assert(![...files.keys()].some(p=>p.includes('api/')));
});
