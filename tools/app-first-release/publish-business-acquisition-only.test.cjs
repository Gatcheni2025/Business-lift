'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paths,files,verify,assertR90Ready}=require('./publish-business-acquisition-only.cjs');
test('Business Acquisition scoped publisher preserves all unrelated site assets and requires backend',()=>{
 assert.equal(paths.length,16);assert(paths.includes('/js/teyza-combined-coverage.mjs'));assert(paths.includes('/assets/teyza-app-admin.css'));assert(paths.includes('/assets/teyza-map-first.css'));assert(paths.includes('/js/teyza-business-acquisition.js'));assert(paths.includes('/for-shop-owners.html'));assert(!paths.includes('/seller-subscriptions.html'));
 assert(!paths.includes('/agents.html'));assert(!paths.includes('/work.html'));assert(!paths.includes('/pay/index.html'));
 const items=files(),before=new Map([['/index.html','home'],['/agents.html','agents'],['/pay/index.html','pay'],...paths.filter(p=>p!=='/js/teyza-business-acquisition.js').map(p=>[p,'old'])]),after=new Map(before);
 for(const [p,v] of items)after.set(p,v.hash);
 assert.doesNotThrow(()=>verify(before,after,items));assert.throws(()=>verify(before,new Map([...after,['/agents.html','changed']]),items));
 const health={ok:true,adminBusinessAcquisition:true,adminBusinessCommunications:true,adminBusinessContactDiscovery:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true};
 assert.doesNotThrow(()=>assertR90Ready(health));assert.throws(()=>assertR90Ready({...health,adminBusinessAcquisition:false}));assert.throws(()=>assertR90Ready({...health,adminBusinessContactDiscovery:false}));
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

test('Isolated worker uses real SDK discovery and conventional external stage before precise deployment',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const s=fs.readFileSync(path.resolve(__dirname,'../admin-release/deploy-business-communication-worker.cjs'),'utf8');
 assert(s.includes('FUNCTIONS_MANIFEST_OUTPUT_PATH'));assert(s.includes("os.tmpdir()"));assert(s.includes("f===spec.entry?'index.js':f"));assert(s.includes('keys.length!==1'));assert(s.includes('discover(stage,path.join(stage.dest'));
 assert(s.includes("'functions:'+spec.codebase+':'+spec.fn"));
});

test('Contact discovery filters recorded addresses by area and protects send shortcuts',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-business-acquisition.js'),'utf8');
 const {matchesAcquisitionContact:match,nextCommunication:next,communicationPermitted:allowed}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 const caps={email:{invitation:true,welcome:true,membership:true},whatsapp:{invitation:false}};
 const p={name:'Synthetic Shop',city:'Durban',area:'Umlazi',category:'spaza',email:'shop@example.test',phone:'+27712345678',permissions:{email:{granted:true}},outbound:{}};
 assert(match(p,'Durban'));assert(match(p,'Durban Umlazi'));assert(!match(p,'Johannesburg'));assert(!match({...p,email:''},'Durban','email'));assert(match({...p,email:'',phone:''},'Durban'));assert(match({...p,email:'',phone:''},'Durban','manual'));assert(!match(p,'Durban','manual'));assert(!match({...p,email:'',phone:''},'Durban','all',true));
 assert(match({...p,email:''},'Durban','whatsapp'));assert(!match(p,'Durban','whatsapp',true));assert(!match({...p,optedOut:true},'Durban','email',true));
 assert.equal(next(p,'email',caps),'invitation');assert.equal(next(p,'whatsapp',caps),null);assert.equal(next({...p,permissions:{}},'email',caps),null);
 assert.equal(next({...p,optedOut:true},'email',caps),null);assert.equal(next({...p,outbound:{email_invitation:{status:'queued'}}},'email',caps),null);
 assert.equal(next({...p,seller:{welcomeEmailEligible:true,membershipEligible:true}},'email',caps),'welcome');
 assert.equal(next({...p,seller:{welcomeEmailEligible:true,membershipEligible:true},emailHistory:{welcome:{sentAt:1}}},'email',caps),'membership');
 assert(!allowed({...p,seller:{welcomeEmailEligible:false}},'email','welcome'));
 const m=fs.readFileSync(path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-combined-coverage.mjs'),'utf8');
 assert(m.includes('autoSearch=true,compact=false'));assert(m.includes('if(autoSearch)void searchArea(true)'));assert(m.includes('Email not supplied by Google'));assert(m.includes('renderCompactList(visible)'));assert(m.includes('if(autoSearch)void searchArea()'));assert(m.includes('shopper-place-contact.php'));assert(m.includes('pageSize+=pageLength'));assert(m.includes('stamp!==epoch'));
});

test('Pilot area resolution uses independent, exact locality centres with bounded radii and no silent fallback',async()=>{
 const path=require('node:path'),{pathToFileURL}=require('node:url');
 const {resolvePilotArea:resolve}=await import(pathToFileURL(path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-combined-coverage.mjs')).href);
 const durban=resolve(' Durban ','All provinces');assert.equal(durban.lat,-29.8579);assert.equal(durban.lng,31.0292);assert.equal(durban.radius,20000);
 assert.equal(resolve('Johannesburg','Gauteng').radius,20000);
 for(const name of ['Umlazi','KwaMashu','Inanda','Ntuzuma','Clermont','Lamontville','KwaDabeka','Soweto','Alexandra','Diepsloot','Orange Farm','Tembisa']){
  const p=resolve(name);assert(p,name);assert(p.radius>=5000&&p.radius<=8000);assert(p.lat>=-35&&p.lat<=-22&&p.lng>=16&&p.lng<=34);assert(p.source);
 }
 assert.equal(resolve('Kwa Mashu','KwaZulu-Natal').label,'KwaMashu, KwaZulu-Natal');
 assert.equal(resolve('Durban','Gauteng'),null);assert.equal(resolve('Tembisa','Eastern Cape'),null);assert.equal(resolve('No Such Town'),null);
});


test('Contact-first discovery uses safe website and WhatsApp links without claiming account verification',async()=>{
 const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
 const file=path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-business-acquisition.js');
 const src=fs.readFileSync(file,'utf8');
 const {safeBusinessWebsite,savedWhatsAppCheck,matchesAcquisitionContact}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 const {whatsappCheckUrl}=await import(pathToFileURL(path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-combined-coverage.mjs')).href);
 assert.equal(safeBusinessWebsite('https://example.test/contact'),'https://example.test/contact');
 assert.equal(safeBusinessWebsite('http://example.test/'),'http://example.test/');
 assert.equal(safeBusinessWebsite('javascript:alert(1)'),null);assert.equal(safeBusinessWebsite('https://user:pass@example.test'),null);
 for(const check of [savedWhatsAppCheck,whatsappCheckUrl]){
  assert.equal(check('071 234 5678'),'https://wa.me/27712345678');assert.equal(check('+27 31 555 0100'),'https://wa.me/27315550100');
  assert.equal(check('invalid'),null);assert.equal(check('0712345678?text=spam'),null);
 }
 assert(matchesAcquisitionContact({name:'Example',website:'https://example.test/'},'example.test'));
 assert(src.includes('ops_acquisition_place_matches'));assert(src.includes('independentSourceConfirmed'));assert(src.includes('contact_update'));
});

test('Admin acquisition confirms local area radius and prepares WhatsApp text only for opted-in records',async()=>{
 const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
 const root=path.resolve(__dirname,'../../web/teyza-admin/public/js');
 const {pilotAreaSuggestions,withinSearchRadius,resolvePilotArea}=await import(pathToFileURL(path.join(root,'teyza-combined-coverage.mjs')).href);
 const {whatsappInvitationDraft,manualWhatsappDraftUrl}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'teyza-business-acquisition.js'))).toString('base64'));
 const area=resolvePilotArea('KwaMashu');assert.equal(pilotAreaSuggestions('KwaM','KwaZulu-Natal')[0].label,'KwaMashu, KwaZulu-Natal');
 assert.equal(pilotAreaSuggestions('KwaM','Gauteng').length,0);
 assert(withinSearchRadius({latitude:-29.7416,longitude:30.9902},area));
 assert(!withinSearchRadius({latitude:-26.268,longitude:27.858},area));
 const p={name:'Example Shop',area:'KwaMashu',phone:'071 234 5678'};
 assert.match(whatsappInvitationDraft(p),/Example Shop.*KwaMashu/s);assert.match(whatsappInvitationDraft(p),/Reply STOP/);
 assert(whatsappInvitationDraft(p).includes('Android (Google Play): https://play.google.com/store/apps/details?id=com.asiyedriver.asiye'));assert(whatsappInvitationDraft(p).includes('iPhone (App Store): https://apps.apple.com/za/app/id6827037733'));assert(!whatsappInvitationDraft(p).includes('https://teyza.co.za/download.html'));
 assert.equal(manualWhatsappDraftUrl(p),null);
 const permitted={...p,permissions:{whatsapp:{granted:true}}},url=new URL(manualWhatsappDraftUrl(permitted));
 assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/27712345678');assert.equal(url.searchParams.get('text'),whatsappInvitationDraft(p));
 for(const blocked of [{...permitted,optedOut:true},{...permitted,seller:{uid:'seller'}},{...permitted,outbound:{whatsapp_invitation:{status:'queued'}}}])assert.equal(manualWhatsappDraftUrl(blocked),null);
});

test('Idle/contact/area release publishes only 15 Admin paths and requires both backend capabilities',()=>{
 const {paths,files,assertAdminReady}=require('./publish-admin-idle-contact-area-only.cjs');
 assert.equal(paths.length,15);assert(paths.includes('/js/teyza-app-admin-model.mjs'));
 for(const excluded of ['/index.html','/for-shop-owners.html','/assets/app-first.css','/support-inbox.html','/pay/index.html','/assets/teyza-map-first.css'])assert(!paths.includes(excluded));
 assert.equal(files().size,15);
 const health={ok:true,version:'3.26.0',marketplaceRelease:'20261126-v61',adminInactivitySession:true,adminSessionRequired:true,adminAreaAutocomplete:true,adminBusinessAcquisition:true,adminBusinessCommunications:true,adminBusinessContactDiscovery:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true};
 assert.doesNotThrow(()=>assertAdminReady(health));
 for(const flag of ['adminInactivitySession','adminSessionRequired','adminAreaAutocomplete'])assert.throws(()=>assertAdminReady({...health,[flag]:false}));
});

test('National contact queues exclude missing contacts without deleting their records and prepare consent-led WhatsApp only',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.resolve(__dirname,'../../web/teyza-admin/public/js/teyza-business-acquisition.js'),'utf8');
 const {matchesAcquisitionContact:match,acquisitionContactNote,manualWhatsappDraftUrl}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
 const p={name:'Synthetic',province:'Limpopo',municipality:'Polokwane',city:'Polokwane',area:'Seshego',phone:'',email:''};
 assert(!match(p,'','contactable'));assert(match(p,'Limpopo Seshego','manual'));assert(match(p,'','all'));assert.match(acquisitionContactNote(p),/No phone number or email/);
 const wa={...p,phone:'+27712345678',phoneKind:'whatsapp_only'};
 assert(match(wa,'','contactable'));assert(match(wa,'','whatsapp_only'));assert(!match(wa,'','manual'));assert.equal(manualWhatsappDraftUrl(wa),null);
 const permitted={...wa,permissions:{whatsapp:{granted:true}}};const url=new URL(manualWhatsappDraftUrl(permitted));assert.equal(url.pathname,'/27712345678');assert.match(url.searchParams.get('text'),/Synthetic/);
 assert.equal(manualWhatsappDraftUrl({...permitted,lastWhatsAppContactAt:123}),null);
 assert(!match({...p,optedOut:true},'','manual'));assert(!match({...wa,optedOut:true},'','contactable'));
 for(const completed of [{contactedAt:123},{response:'interested'},{downloadConfirmedAt:123},{seller:{status:'pending'}},{outbound:{whatsapp_invitation:{status:'queued'}}},{stage:'closed'}])assert(!match({...wa,...completed},'','contactable'));
});
