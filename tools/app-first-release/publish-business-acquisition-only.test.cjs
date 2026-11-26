'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paths,files,verify,assertR90Ready}=require('./publish-business-acquisition-only.cjs');
test('Business Acquisition scoped publisher preserves all unrelated site assets and requires backend',()=>{
 assert.equal(paths.length,15);assert(paths.includes('/assets/teyza-app-admin.css'));assert(paths.includes('/assets/teyza-map-first.css'));assert(paths.includes('/js/teyza-business-acquisition.js'));assert(paths.includes('/for-shop-owners.html'));assert(!paths.includes('/seller-subscriptions.html'));
 assert(!paths.includes('/agents.html'));assert(!paths.includes('/work.html'));assert(!paths.includes('/pay/index.html'));
 const items=files(),before=new Map([['/index.html','home'],['/agents.html','agents'],['/pay/index.html','pay'],...paths.filter(p=>p!=='/js/teyza-business-acquisition.js').map(p=>[p,'old'])]),after=new Map(before);
 for(const [p,v] of items)after.set(p,v.hash);
 assert.doesNotThrow(()=>verify(before,after,items));assert.throws(()=>verify(before,new Map([...after,['/agents.html','changed']]),items));
 const health={ok:true,adminBusinessAcquisition:true,adminBusinessCommunications:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true};
 assert.doesNotThrow(()=>assertR90Ready(health));assert.throws(()=>assertR90Ready({...health,adminBusinessAcquisition:false}));
});
test('Business invitation destination shows the actual app and direct store links before optional detail',()=>{const fs=require('node:fs'),path=require('node:path');const html=fs.readFileSync(path.resolve(__dirname,'../../web/app-first/public/for-shop-owners.html'),'utf8');const main=html.slice(html.indexOf('<main id="main">'),html.indexOf('</main>'));const hero=main.slice(0,main.indexOf('data-teyza-demo'));for(const text of ['Put your business','/assets/app/home.webp','/assets/app/nearby-shops.webp','https://play.google.com/store/apps/details?id=com.asiyedriver.asiye','https://apps.apple.com/za/app/id6827037733','Get help getting started'])assert(hero.includes(text),text);assert(main.includes('example shop, items and request are illustrative'));assert(main.includes('tel:+27315661165'));assert(main.includes('Registration and verification are free'));assert(main.includes('/seller-subscriptions.html'));assert(html.includes('/assets/app-demo.js'));});

test('Approved invitation automatically personalises name, area and category; welcome remains service-only',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-business-acquisition.js'),'utf8');
 const {emailText,emailDraftAllowed}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const p={name:'Example Spaza',area:'Umlazi',city:'Durban',category:'spaza',email:'synthetic@example.test',permissions:{email:{granted:true}},optedOut:false};
 const draft=emailText('invitation',p);
 assert.equal(draft.subject,'Example Spaza – Grow your business with Teyza');
 assert(draft.body.includes('personally invite Example Spaza'));
 assert(draft.body.includes('Umlazi, Durban'));
 assert(draft.body.includes('trade prices and source stock for your spaza shop'));
 assert(draft.body.includes('discounted delivery opportunities where available'));
 assert(draft.body.includes('There is no charge to register and verify'));
 assert(draft.body.includes('optional and subject to eligibility'));
 assert(draft.body.includes('https://teyza.co.za/for-shop-owners.html'));
 assert(draft.body.includes('Reply STOP'));
 for(const category of ['retail','wholesale','food','salon','service','manufacturer','other','__proto__']){
  const d=emailText('invitation',{...p,category});
  assert(d.body.includes(p.name));assert(!d.body.includes('undefined'));assert.notEqual(d.body,draft.body);
 }
 const salon=emailText('invitation',{...p,name:'Example Salon',category:'salon',area:'Soweto',city:'Johannesburg'});
 assert(salon.body.includes('Showcase your services'));assert(salon.body.includes('Soweto, Johannesburg'));assert(!salon.body.includes('source stock for your spaza shop'));
 const welcome=emailText('welcome',p);
 assert(welcome.subject.includes(p.name));assert(welcome.body.includes('Once approved and eligible'));assert(!welcome.body.includes('discounted delivery'));assert(!welcome.body.includes('Reply STOP'));
 assert(!emailText('invitation',{...p,name:'Example\r\nBCC: hidden'}).subject.includes('\n'));
 assert(emailDraftAllowed('invitation',p));
 assert(!emailDraftAllowed('invitation',{...p,optedOut:true}));
 assert(!emailDraftAllowed('invitation',{...p,permissions:{}}));
 assert(!emailDraftAllowed('invitation',{...p,emailHistory:{invitation:{sentAt:1}}}));
 assert(!emailDraftAllowed('welcome',{...p,seller:{status:'pending'}}));
 assert(emailDraftAllowed('welcome',{...p,optedOut:true,seller:{status:'pending',welcomeEmailEligible:true}}));
 assert(!emailDraftAllowed('welcome',{...p,seller:{status:'approved',welcomeEmailEligible:false}}));
});
test('Business page includes the same five benefit pillars without guaranteed claims',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.resolve(__dirname,'../../web/app-first/public/for-shop-owners.html'),'utf8');
 for(const word of ['Get discovered.','Sell directly.','Source smarter.','Explore savings.','Grow with support.','Savings and sales are not guaranteed.'])assert(html.includes(word));
});

test('Approved asset registry uses existing website artwork, official store destinations and fail-closed video readiness',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.resolve(__dirname,'../../web/app-first/public');
 const src=fs.readFileSync(path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-business-acquisition.js'),'utf8');
 const {acquisitionAssets,acquisitionVideoSlots,isPublishedVideo}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 for(const a of acquisitionAssets){
  if(a.href.startsWith('/'))assert(fs.existsSync(path.join(root,a.href.split('#')[0])),a.href);
  else assert(['https://play.google.com/store/apps/details?id=com.asiyedriver.asiye','https://apps.apple.com/za/app/id6827037733'].includes(a.href));
 }
 assert.equal(acquisitionAssets.filter(a=>a.kind==='image').length,5);
 assert.deepEqual(acquisitionVideoSlots.map(a=>a.href),['/assets/app/teyza-business-explainer.mp4','/assets/app/teyza-business-intro.mp4']);
 const response=(type,length,ok=true,redirected=false)=>({ok,redirected,headers:new Headers({'content-type':type,'content-length':length})});
 assert(isPublishedVideo(response('video/mp4','100')));
 assert(!isPublishedVideo(response('text/html','100')));assert(!isPublishedVideo(response('video/mp4','0')));
 assert(!isPublishedVideo(response('video/mp4','100',false)));assert(!isPublishedVideo(response('video/mp4','100',true,true)));
});

test('Admin and server use the same approved message text',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-business-acquisition.js'),'utf8');
 const ui=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 const server=require('../../services/teyza-mobile-v39/business-message-templates');
 for(const category of ['spaza','retail','wholesale','food','salon','service','manufacturer','other']){
  const p={name:'Example Shop',city:'Durban',area:'Umlazi',category};
  for(const kind of ['invitation','welcome','membership'])assert.deepEqual(ui.emailText(kind,p),server.emailText(kind,p));
 }
 const css=fs.readFileSync(path.resolve(__dirname,'../../web/teyza-admin/public/assets/teyza-app-admin.css'),'utf8');
 assert(css.includes('.acq-dialog::backdrop'));assert(css.includes('.acq-email'));assert(css.includes('.login-scope svg'));
});

test('Isolated provider worker helper does not use mobile dotenv or broad deploy',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const s=fs.readFileSync(path.resolve(__dirname,'../admin-release/deploy-business-communication-worker.cjs'),'utf8');
 assert(s.includes('teyza-business-mail'));assert(s.includes('teyza-business-whatsapp'));
 assert(s.includes("functions:'+spec.codebase+':'+spec.fn"));
 assert(s.includes('enabled===true'));assert(s.includes('TEYZA_BUSINESS_MAIL_ZOHO'));
 assert(s.includes('collect(spec.entry)'));assert(!s.includes("firebase deploy --only functions"));
});

test('Worker dependency collection checks both isolated packages, including actual catalogue JSON',()=>{
 const path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
 const script=path.resolve(__dirname,'../admin-release/deploy-business-communication-worker.cjs');
 const source=path.resolve(__dirname,'../../services/teyza-mobile-v39');
 for(const channel of ['email','whatsapp']){
  const r=spawnSync(process.execPath,[script,channel,'--check-package'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const result=JSON.parse(r.stdout);
  assert.equal(result.channel,channel);
  assert.equal(result.productionWrites,false);
  assert.equal(result.entry,channel==='email'?'index.business-mail-only.js':'index.business-whatsapp-only.js');
  for(const name of ['catalogue.json','catalogue.js','domain.js','business-communications.js','business-communication-providers.js','business-message-templates.js',result.entry])assert(result.files.includes(name),name);
  assert(!result.files.includes('catalogue.json.js'));
  for(const name of result.files){
   assert(/^[A-Za-z0-9_.-]+\.(js|json)$/.test(name));
   assert(!name.startsWith('.')&&!name.includes('..')&&!name.endsWith('.test.js'));
   assert(fs.existsSync(path.join(source,name)),name);
   assert(!['index.js','index.admin-only.js','index.agent-mail-only.js','package.json','package-lock.json'].includes(name));
   assert(!name.endsWith('.pdf'));
  }
  assert.equal(new Set(result.files).size,result.files.length);
 }
});
