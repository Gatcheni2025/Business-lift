'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {patch,rollback,servingConfig,overlay,versionName}=require('./hosting-patch.cjs');
const {assertAdminBackend}=require('./run.cjs');
const root=path.resolve(__dirname,'../../web/teyza-admin/public'),base='sites/business-lift-3c19c/versions/';
test('Admin release accepts disabled checkout or strictly verified R99 prorated pilot/full rollout',()=>{
 const ready={ok:true,version:'3.26.0',googlePlaceClaims:true,sellerApprovalBeforeCheckout:true,
   agentCommissionEnabled:false,adminOperations:true,adminReview:true,adminProductReview:false,
   automaticProductPublication:true,adminPaystackVerify:true,adminComplimentaryAccess:true,
   manualReceiptsRetired:true,historicSellerMandatesReadOnly:true,sellerMandates:false,sellerMandateRequestV3:false,
   adminMandatePdfExport:true,adminNetcashManualSubmission:false,paystackCheckoutAvailable:false,
   sellerPaystackNewCheckoutDisabled:true,sellerMembershipBillingMode:'checkout_disabled',
   adminUsers:true,adminSellerDocuments:true,physicalGoodsPaystack:true};
 assert.doesNotThrow(()=>assertAdminBackend(ready));
 assert.throws(()=>assertAdminBackend(ready,{marketplace:true}));
 assert.doesNotThrow(()=>assertAdminBackend({...ready,marketplaceRelease:'20261126-v61',adminAgentRewardReview:true,businessOfferTerms:true,agentRewardsPagination:true,agentRewardReviewEnabled:true,agentRewardCents:9000},{marketplace:true}));
 const pilot={...ready,sellerPaystackNewCheckoutDisabled:false,sellerMembershipBillingMode:'paystack_card_subscription',
   paystackCheckoutAvailable:true,paystackRolloutMode:'pilot',membershipProrationEnabled:true,
   subscriptionMonthlyCents:9900,subscriptionTermsVersion:'seller-r99-calendar-proration-2026-11'};
 assert.doesNotThrow(()=>assertAdminBackend(pilot));
 const full={...pilot,paystackRolloutMode:'full'};
 assert.doesNotThrow(()=>assertAdminBackend(full));
 for(const unsafe of [{...pilot,paystackRolloutMode:'unexpected'},{...full,sellerPaystackNewCheckoutDisabled:true},
    {...full,paystackCheckoutAvailable:false},{...full,membershipProrationEnabled:false},
    {...full,subscriptionMonthlyCents:1000},
    {...full,subscriptionTermsVersion:'seller-r99-monthly-2026-11'}])assert.throws(()=>assertAdminBackend(unsafe));

 for(const stale of [{...ready,version:'3.20.0'},{...ready,agentCommissionEnabled:true},
   {...ready,adminProductReview:true},{...ready,automaticProductPublication:false},
   {...ready,adminComplimentaryAccess:false},{...ready,adminNetcashManualSubmission:true},
   {...ready,adminMandatePdfExport:false},{...ready,sellerMandateRequestV3:true},
   {...ready,sellerMembershipBillingMode:'paystack_card_subscription'},
   {...ready,paystackCheckoutAvailable:true}]){
   assert.throws(()=>assertAdminBackend(stale));
 }
});
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
   assert.equal(query.status,'ACTIVE','Preservation checks must list uploaded files, not only remaining uploads');
   const files=[...version.files].map(([path,hash])=>({path,hash,status:'ACTIVE'}));
   if(options.dropFile&&name===next)return {files:files.filter(f=>f.path!=='/shops.html')};return {files};
  }
  if(uri.endsWith(':populateFiles')){for(const [p,h] of Object.entries(body.files))version.files.set(p,h);
   return {uploadRequiredHashes:[...new Set(Object.values(body.files))],uploadUrl:'https://upload-firebasehosting.googleapis.com/upload/'+next+'/files'};}
  if(method==='PATCH'){if(body.config)version.config=body.config;if(body.status)version.status=body.status;return {name,...version};}
  return {name,config:version.config};
 },upload:async()=>{if(options.failUpload)throw new Error('Upload failed');}};
 return {client,source,next,calls,config,existing,versions,fetcher:async()=>({ok:true,json:async()=>({ok:true,adminNationalAcquisition:true,adminNationalAcquisitionSchema:2,adminNationalAcquisitionSummarySchema:1,adminInactivitySession:true,adminSessionRequired:true})}),backupPath:path.join(directory,'backup.json'),log:()=>{},wait:async()=>{},root,live:()=>live};
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
 const files=overlay(root);assert.equal(files.size,23);
 assert(files.has('/js/teyza-business-acquisition.js'));
 assert(fs.readFileSync(path.join(root,'admin.html'),'utf8').includes('data-admin-view="acquisition"'));
 assert(files.has('/assets/teyza-map-first.css'));
 assert(files.has('/assets/teyza-southern-africa-land.geojson'));
 const geography=JSON.parse(require('node:zlib').gunzipSync(files.get('/assets/teyza-southern-africa-land.geojson').bytes).toString('utf8'));
 assert(geography.features.some(f=>f.properties.name==='South Africa'));
 assert(geography.features.some(f=>f.properties.name==='Lesotho'));
 assert(files.has('/js/teyza-premium-coverage.mjs'));
 assert(files.has('/js/teyza-combined-coverage.mjs'));
 const premium=require('node:zlib').gunzipSync(files.get('/js/teyza-premium-coverage.mjs').bytes).toString('utf8');
 assert(premium.includes("from './teyza-combined-coverage.mjs'"));
 const combined=require('node:zlib').gunzipSync(files.get('/js/teyza-combined-coverage.mjs').bytes).toString('utf8');
 assert(combined.includes('createCombinedCoverage'));
  assert(files.has('/js/teyza-mandate-pdf.mjs'));
  assert(files.has('/js/teyza-admin-map.mjs'));
  assert(fs.readFileSync(path.join(root,'admin.html'),'utf8').includes('data-admin-view="map"'));
  const pdfSource=require('node:zlib').gunzipSync(files.get('/js/teyza-mandate-pdf.mjs').bytes).toString('utf8');
  assert(pdfSource.includes('buildMandateRequestPdf'));
  assert(pdfSource.includes('NOT BANK-AUTHENTICATED'));
 const config=servingConfig({rewrites:[{glob:'/admin',path:'/old.html'},{glob:'**',path:'/404.html'}]});
 assert.deepEqual(config.rewrites[0],{glob:'/admin',path:'/admin.html'});assert.equal(config.rewrites.at(-1).path,'/404.html');
 const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');assert(html.includes('content="R335-local-vector-map"'));
 // Inline SVG sprite references are fragment-only; fetched assets remain root-relative.
 for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g))assert(match[1].startsWith('/')||match[1].startsWith('#'));
 assert(!html.includes('.php'));assert(![...files.keys()].some(p=>p.includes('api/')));
  const css=fs.readFileSync(path.join(root,'assets/teyza-app-admin.css'),'utf8');
  assert(css.includes('.dashboard-sidebar'));
  assert(html.includes('data-admin-view="billing"'));
  assert(html.includes('Finance &amp; payments'));
  assert(html.includes('data-admin-view="overview"'));
});




test('Scoped publisher includes restricted map config only when operator supplies it',()=>{
 const {overlayPaths}=require('./hosting-patch.cjs');
 assert(overlayPaths.has('/assets/teyza-maps-config.json'));
 const previous=process.env.TEYZA_MAPS_BROWSER_KEY;
 try{
  delete process.env.TEYZA_MAPS_BROWSER_KEY;
  assert(!overlay(root).has('/assets/teyza-maps-config.json'));
  process.env.TEYZA_MAPS_BROWSER_KEY='AIza'+'A'.repeat(35);
  const files=overlay(root);
  assert(files.has('/assets/teyza-maps-config.json'));
  const json=JSON.parse(require('node:zlib').gunzipSync(files.get('/assets/teyza-maps-config.json').bytes).toString('utf8'));
  assert.equal(json.browserKey,process.env.TEYZA_MAPS_BROWSER_KEY);
  process.env.TEYZA_MAPS_BROWSER_KEY='not-a-valid-key';
  assert.throws(()=>overlay(root),/Invalid browser-restricted/);
 }finally{
  if(previous===undefined)delete process.env.TEYZA_MAPS_BROWSER_KEY;
  else process.env.TEYZA_MAPS_BROWSER_KEY=previous;
 }
});

test('Admin Google Maps authorization retains only origin referrer while removing stale no-referrer headers',()=>{
 const managed='/admin{,/**,.html,-review.html,-sellers.html,-login.html,-dashboard.html,-payments.html,-support.html,-users.html}';
 const config=servingConfig({headers:[
  {glob:'/**',headers:{'X-Frame-Options':'DENY'}},
  {glob:managed,headers:{'Referrer-Policy':'no-referrer'}},
  {glob:'/js/teyza-combined-coverage.mjs',headers:{'Referrer-Policy':'no-referrer'}}
 ]});
 assert.equal(config.headers.filter(x=>x.glob===managed).length,1);
 assert.equal(config.headers.filter(x=>x.glob==='/js/teyza-combined-coverage.mjs').length,1);
 assert(config.headers.some(x=>x.glob==='/**'&&x.headers['X-Frame-Options']==='DENY'));
 for(const h of config.headers.filter(x=>x.glob===managed||x.glob.includes('teyza-')||x.glob.startsWith('/assets/')))
  assert.equal(h.headers['Referrer-Policy'],'strict-origin-when-cross-origin');
});

test('Marketplace overlay is explicit, includes all branded Work and support assets, and excludes checkout and home',()=>{
 const {workPaths,supportPaths,preserved}=require('./hosting-patch.cjs');
 const workRoot=path.resolve(__dirname,'../../web/app-first/public');
 const files=overlay(root,{workRoot});
 for(const p of [...workPaths,...supportPaths])assert(files.has(p),p);
 for(const p of ['/index.html','/pay/index.html','/ads/index.html','/order-payment-return.html','/js/seller-web-billing.mjs','/assets/teyza-maps-config.json'])if(p!=='/assets/teyza-maps-config.json'||!process.env.TEYZA_MAPS_BROWSER_KEY)assert(!files.has(p),p);
 const config=servingConfig({headers:[{glob:'/pay/**',headers:{'Cache-Control':'no-store'}}]},{marketplace:true});
 assert(config.headers.some(x=>x.glob==='/pay/**'));
 for(const p of ['/work.html','/owner-confirm.html','/support-inbox.html'])assert(config.headers.some(x=>x.glob===p&&x.headers['X-Robots-Tag']==='noindex, nofollow'));
 const before=new Map([['/assets/teyza-maps-config.json','existing'],['/index.html','existing']]);
 assert.throws(()=>preserved(before,new Map([['/assets/teyza-maps-config.json','changed'],['/index.html','existing']]),new Map()),/not preserved/);
});

test('Marketplace publication clones once and verifies all unchanged files before publishing and rolling back',async()=>{
 const f=setup();
 for(const p of ['/assets/teyza-sprout-wordmark.svg','/assets/app/wordmark.svg','/assets/app/wordmark-light.svg','/assets/app/spaza-owner.webp','/assets/app/icon.svg','/assets/app-first.css','/assets/agent-map-first.css','/js/work-auth.mjs','/js/work-phone.mjs','/js/work-discovery.mjs','/pay/index.html','/ads/index.html','/order-payment-return.html','/assets/teyza-maps-config.json'])f.existing.set(p,'preserve-'+p);
 const workRoot=path.resolve(__dirname,'../../web/app-first/public');
 await patch({...f,workRoot});
 assert.equal(f.live(),f.next);
 assert.equal(f.calls.filter(c=>c.uri.endsWith('/channels/live/releases')).length,1);
 const files=f.versions.get(f.next).files;
 for(const p of ['/pay/index.html','/ads/index.html','/order-payment-return.html','/assets/teyza-maps-config.json','/index.html'])assert.equal(files.get(p),f.existing.get(p));
 for(const p of ['/agents.html','/work.html','/owner-confirm.html','/support-inbox.html','/assets/work.css','/assets/teyza-agents-map-first.css','/js/owner-confirm.js'])assert(files.has(p),p);
 await rollback(f);assert.equal(f.live(),f.source);
});

test('National publisher refuses missing or wrong schema before any Hosting operation, and rechecks before release',async()=>{
 for(const health of [{ok:true},{ok:true,adminNationalAcquisition:true,adminNationalAcquisitionSchema:1},{ok:true,adminNationalAcquisition:true,adminNationalAcquisitionSchema:'2'}]){
  const f=setup();f.fetcher=async()=>({ok:true,json:async()=>health});
  await assert.rejects(patch(f),/national acquisition schema 2/);assert.equal(f.calls.length,0);
 }
 const f=setup(),good=f.fetcher;let checks=0;
 f.fetcher=async()=>++checks===1?good():({ok:true,json:async()=>({ok:true})});
 await assert.rejects(patch(f),/national acquisition schema 2/);
 assert.equal(checks,2);assert.equal(f.live(),f.source);assert(!f.calls.some(c=>c.uri.endsWith('/channels/live/releases')));
});
