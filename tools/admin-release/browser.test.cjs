'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../web/teyza-admin/public'),repo=path.resolve(__dirname,'../..');
const output=process.env.TEYZA_ADMIN_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'teyza-admin-ui-'));
fs.mkdirSync(output,{recursive:true});
// Synthetic green square, never a real document or face.
const jpeg='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0uiiiuU5wooooAKKKKACiiigD/9k=';
const firebaseAuth=`
const listeners=[];
export const browserSessionPersistence={};
export const auth={currentUser:null};
function user(value){if(!value)return null;return {uid:value.uid||'admin1',email:value.email||'reviewer@example.test',
 getIdToken:async()=>'synthetic-token',getIdTokenResult:async()=>({claims:{teyzaAdmin:true,email_verified:true,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'password'},...value.claims}})};}
window.__setUser=value=>{window.__testIdentity=value;auth.currentUser=user(value);for(const cb of listeners)cb(auth.currentUser);};
export function getAuth(){return auth;}
export function onAuthStateChanged(a,cb){listeners.push(cb);auth.currentUser=user(window.__testIdentity);queueMicrotask(()=>cb(auth.currentUser));}
export async function setPersistence(){}
export class GoogleAuthProvider{setCustomParameters(){}}
export const EmailAuthProvider={credential:(email,password)=>({email,password})};
export async function signInWithEmailAndPassword(){window.__setUser({uid:'admin1'});return {user:auth.currentUser};}
export const signInWithPopup=signInWithEmailAndPassword;
export async function reauthenticateWithCredential(){auth.currentUser=user({uid:auth.currentUser.uid});return {user:auth.currentUser};}
export const reauthenticateWithPopup=reauthenticateWithCredential;
export async function signOut(){window.__setUser(null);}
`;
const rows=[{sellerUid:'seller1',shopName:'Corner Spaza',category:'spaza',address:'Durban',phone:'+27712345678',ownerEmail:'owner@example.test',
 evidenceId:'doc1',evidenceKind:'id',submissionId:'selfie1',submittedAt:1792910000000,expired:false},
 {sellerUid:'retail1',shopName:'Town Wholesalers',category:'retail',address:'Johannesburg',phone:'+27712345679',ownerEmail:'retail@example.test',
 evidenceId:'company1',evidenceKind:'company',companyName:'Town Retail Pty Ltd',registrationNumber:'SYNTHETIC-ONLY',submissionId:'selfie2',submittedAt:1792910000000,expired:false},
 {sellerUid:'admin1',shopName:'Reviewer Own Shop',category:'spaza',evidenceId:'own-doc',submissionId:'own-selfie',expired:false}];

async function syntheticCommandPage(body,{asOf,scanned=0,prospects=[],funnel={},queues={},next=null}={}){
 const source=fs.readFileSync(path.join(root,'js/teyza-business-acquisition.js'),'utf8');
 const {emptyCommandReport}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const counts=emptyCommandReport().counts;Object.assign(counts.funnel,funnel);Object.assign(counts.queues,queues);
 const filters=Object.fromEntries(['province','category','queue','municipality','township','municipalityCode','localityId','search','assignedTo'].map(k=>[k,String(body.data.filters?.[k]||'').trim()]));
 return {ok:true,schema:2,asOf:body.data.asOf||asOf||Date.now()-1000,filters,scanned,counts,prospects,next,complete:next===null};
}
async function main(){
 const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://local').pathname;
  const file=['/admin','/admin/','/admin.html','/admin-sellers.html'].includes(p)?path.join(root,'admin.html'):
   p==='/assets/teyza-sprout-wordmark.svg'?path.join(repo,p):path.join(root,p);
  if(!file.startsWith(root+path.sep)&&file!==path.join(repo,'/assets/teyza-sprout-wordmark.svg')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':'application/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 let browser;try{browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.TEYZA_ADMIN_CHROMIUM?{executablePath:process.env.TEYZA_ADMIN_CHROMIUM}:{})});}
 catch(error){server.close();throw error;}let count=0;
 async function pageFor({identity={uid:'admin1'},api,viewport={width:1440,height:1100},pagination=false,startView='approvals'}={}){
  const context=await browser.newContext({viewport}),page=await context.newPage(),calls=[],errors=[];let pending=structuredClone(rows),legacyUploaded=false;
  let syntheticUsers=[{uid:'admin1',email:'reviewer@example.test',displayName:'Reviewer',verified:true,disabled:false,admin:true,providers:['google.com']},
    {uid:'shopper2',email:'shopper@example.test',displayName:'Existing Shopper',verified:false,disabled:false,admin:false,providers:['password']}];
  await page.addInitScript(value=>{window.__testIdentity=value;if(value)sessionStorage.setItem('teyza-admin-idle-v1',JSON.stringify({uid:value.uid||'admin1',token:'a'.repeat(64),lastActivity:Date.now()}));},identity);
  await page.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().endsWith('firebase-app.js')?
   'export const getApps=()=>[];export const initializeApp=c=>c;':firebaseAuth}));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',async route=>{
   const body=route.request().postDataJSON();calls.push(body);
   if(api&&await api(route,body)!==false)return;
   let result={ok:true};
   if(body.action==='admin_session_start')result={ok:true,sessionToken:'b'.repeat(64),idleMs:300000};
   if(body.action==='admin_session_status')result={ok:true,active:true};
   if(body.action==='admin_session_touch')result={ok:true,idleMs:300000};
   if(body.action==='admin_session_end')result={ok:true,signedOut:true};
   if(body.action==='ops_map_shops')result={ok:true,shops:[{sellerUid:'seller1',name:'Synthetic Verified Spaza',category:'spaza',latitude:-29.86,longitude:31.01,city:'Durban',area:'Umlazi',verified:true,source:'teyza_only'}],next:null};
   if(body.action==='ops_sellers')result={ok:true,sellers:rows.map(r=>({...r,approvalStatus:'approved',subscription:'not_started'})),next:null};
   if(body.action==='ops_catalogue_queue')result={ok:true,submissions:[{sellerUid:rows[0].sellerUid,shopName:rows[0].shopName,ownerEmail:rows[0].ownerEmail,approvalStatus:'approved',productCount:1,paymentStatus:'not_started',paidMembership:false}],limited:false};
   if(body.action==='ops_seller_detail')result={ok:true,seller:{...rows[0],listingPlan:'free'},billing:{status:'not_started'},paystackMode:'test',membershipPaid:false,payments:[],
     catalogue:{status:'pending_review',products:[{id:'catalog_milk',name:'Milk',priceCents:2500,stock:4,category:'Grocery'}]},
     canApproveCatalogue:false,verification:{status:'pending_review',completed:false},entries:[],
     documents:{identity:{available:true,evidenceId:'doc1',submittedAt:1792910000000},selfie:{available:true,submissionId:'selfie1',submittedAt:1792910000000}}};
   if(body.action==='ops_users')result={ok:true,users:syntheticUsers,next:null};
   if(body.action==='ops_user_create'){
     const user={uid:'new-user1',email:body.data.email.toLowerCase(),displayName:body.data.displayName,
       verified:false,disabled:false,admin:false,providers:[],registeredRole:body.data.requestedRole,invitationStatus:'sent'};
     syntheticUsers=[...syntheticUsers,user];result={ok:true,created:true,inviteSent:true,user};
   }
   if(body.action==='ops_user_detail'){
     const user=syntheticUsers.find(x=>x.uid===body.data.userUid);
     result={ok:true,user,seller:null};
   }
   if(body.action==='ops_user_invite')result={ok:true,sent:true};
   if(body.action==='ops_user_set_disabled'){
     syntheticUsers=syntheticUsers.map(u=>u.uid===body.data.userUid?{...u,disabled:body.data.disabled}:u);
     result={ok:true,updated:true,disabled:body.data.disabled};
   }
   if(body.action==='ops_support_list')result={ok:true,tickets:[],next:null};
   if(body.action==='ops_finance_queue')result={ok:true,requests:[],next:null};
   if(body.action==='agent_admin_communications')result={ok:true,schema:1,settings:{state:'enabled',startAt:1795644000000,maxPerRun:1},rows:[{uid:'applicant1',name:'Synthetic Applicant',area:'Durban',province:'KwaZulu-Natal',applicationStatus:'pending',state:'sent',reason:'provider_accepted',sentAt:1795700000000,updatedAt:1795700000000,canRecheck:false},{uid:'agent2',name:'Synthetic Agent',area:'Umlazi',province:'KwaZulu-Natal',applicationStatus:'approved',state:'blocked_email',reason:'verified_email_required',updatedAt:1795700000000,canRecheck:true}],counts:{sent:1,blocked_email:1},next:null};
   if(body.action==='agent_admin_communications_recheck')result={ok:true,scheduled:true};
   if(body.action==='agent_admin_profiles')result={ok:true,profiles:[{uid:'applicant1',name:'Synthetic Applicant',email:'example@test.invalid',phone:'0710000000',province:'KwaZulu-Natal',area:'Durban',status:'pending',revision:0,hasDocuments:true},{uid:'agent2',name:'Synthetic Agent',province:'KwaZulu-Natal',area:'Umlazi',status:'approved',revision:1,hasDocuments:true,recruitmentSource:'meta_durban'},{uid:'legacy3',name:'Legacy Missing',province:'KwaZulu-Natal',area:'Pinetown',status:'pending',revision:legacyUploaded?3:2,hasDocuments:legacyUploaded}],next:null};
   if(body.action==='agent_admin_visits')result={ok:true,visits:[{id:'visit-test',shopName:'Demo Spaza',address:'12 Sample Road, Durban',area:'Durban',province:'KwaZulu-Natal',status:'submitted',revision:5,agentUid:'agent2',ownerConfirmed:true,progress:{sellerApproval:'approved',mandate:'signed_pending_activation',payment:'first_invoice_paid',commission:'not_eligible'},location:{latitude:-29.85,longitude:31.02,accuracy:12}}],next:null};
   if(body.action==='agent_admin_application_upload'){legacyUploaded=true;result={ok:true,saved:true};}
   if(body.action==='agent_admin_application_evidence')result={ok:true,identityType:'sa_id',identityNumber:'SYNTHETIC000',identityFile:{name:'test.jpg',mime:'image/jpeg',base64:jpeg},cvFile:{name:'cv.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4 synthetic').toString('base64')}};
   if(body.action==='agent_admin_photo')result={ok:true,imageBase64:jpeg};
   if(body.action==='admin_seller_queue')result={ok:true,sellers:body.data.after?[{...rows[0],sellerUid:'last',shopName:'Last Page Shop'}]:pending,next:pagination&&!body.data.after?'retail1':null};
   if(body.action==='seller_identity_read')result={ok:true,imageBase64:jpeg,details:{legalType:'individual',kind:'id',documentNumber:'SYNTHETIC-TEST'}};
   if(body.action==='verification_read')result={ok:true,imageBase64:jpeg};
   if(body.action==='admin_seller_review'){pending=pending.filter(s=>s.sellerUid!==body.data.sellerUid);result={ok:true,status:body.data.status};}
   await route.fulfill({json:result});
  });
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(url+'/admin');await page.bringToFront();
  if(identity&&identity.claims?.teyzaAdmin!==false&&identity.claims?.email_verified!==false){
   const nav=page.getByRole('button',{name:'Business accounts',exact:true});await nav.waitFor({state:'visible'});
   if(startView==='overview'||startView==='approvals'){
     // Map-first Admin opens national coverage; overview tests navigate explicitly.
     await page.locator('[data-admin-view="overview"]').click();
     await page.getByRole('heading',{name:'Your operations, at a glance.'}).waitFor({state:'visible'});
     if(startView==='approvals'){
       // Verification queue remains accessible through the overview summary.
       await page.locator('.overview-stat').first().click();
     }
   }
  }
  return {context,page,calls,errors};
 }
 async function check(name,fn){
  if(process.env.TEYZA_ADMIN_TEST_FILTER&&!name.includes(process.env.TEYZA_ADMIN_TEST_FILTER))return;
  await fn();count++;console.log('PASS '+name);
 }
 try{
  await check('WhatsApp diagnostics distinguish sampled delivery receipts from worker configuration',async()=>{
   const f=await pageFor({startView:'map',api:async(route,body)=>{
    if(body.action!=='ops_whatsapp_status')return false;
    await route.fulfill({json:{ok:true,enabled:true,configurationScope:'api_instance',workerRunningVerified:false,
     fields:{templateName:'synthetic_welcome',phoneNumberId:true,apiVersion:true,bodyFields:'name',headerImage:false},
     counts:{accepted:80,queued:20},sampled:100,sampleLimit:100,sampleLimited:true,
     deliveryCounts:{delivered:10,read:5,failed:2,sent:3,awaiting_receipt:60,uncertain:0,not_sent:20},
     webhookEvents:{counts:{delivered:70,sent:30},sampled:100,sampleLimited:true},
     warning:'Only a matched signed receipt confirms an individual welcome.'}});return true;
   }});
   await f.page.locator('[data-admin-view="whatsapp"]').click();
   await f.page.getByRole('heading',{name:'Welcome message delivery receipts'}).waitFor();
   await f.page.getByText('The separate sending worker has not been checked.',{exact:false}).waitFor();
   const receiptTable=f.page.getByRole('table').filter({hasText:'Matched receipt status'});
   assert.equal(await receiptTable.getByRole('row').filter({hasText:'Delivered'}).getByRole('cell').last().innerText(),'10');
   assert.equal(await receiptTable.getByRole('row').filter({hasText:'Read by recipient'}).getByRole('cell').last().innerText(),'5');
   await f.page.getByText('first 100; more exist',{exact:false}).waitFor();
   await f.page.getByText('bounded sample, not a recent-time total',{exact:false}).waitFor();
   assert.equal(await f.page.getByText('WhatsApp workers: ENABLED',{exact:false}).count(),0);
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('WhatsApp seller welcome shows acceptance, delivery and changed consent separately',async()=>{
   let welcome={currentConsent:'opted_in',queueStatus:'accepted',deliveryStatus:'awaiting_receipt',deliveryConfirmed:false,acceptedAt:1792910000000};
   const f=await pageFor({startView:'map',api:async(route,body)=>{
    if(body.action!=='ops_seller_detail')return false;
    await route.fulfill({json:{ok:true,seller:{...rows[0],approvalStatus:'approved'},
     businessAccount:{type:'Spaza shop',isPublic:true,verificationChecks:[],missingRequirements:[]},
     billing:{status:'not_started'},membershipPaid:false,payments:[],entries:[],catalogue:{products:[]},
     documents:{identity:null,selfie:null},whatsappWelcome:welcome}});return true;
   }});
   await f.page.getByRole('button',{name:'Business accounts',exact:true}).click();
   await f.page.getByRole('button',{name:'Open account'}).first().click();
   const card=f.page.locator('[data-whatsapp-welcome]');
   await card.getByText('Sending status: Accepted by Meta',{exact:true}).waitFor();
   await card.getByText('Delivery: Awaiting a signed delivery receipt',{exact:true}).waitFor();
   assert.equal(await card.locator('.notice.success').count(),0);
   welcome={...welcome,currentConsent:'opted_out',deliveryStatus:'delivered',deliveryConfirmed:true,receiptAt:1792910001000};
   await f.page.locator('#operationsPanel').getByRole('button',{name:'Refresh',exact:true}).click();
   await card.getByText('Delivery: Delivered to the recipient',{exact:true}).waitFor();
   await card.getByText('Current WhatsApp consent: Opted out',{exact:true}).waitFor();
   await f.page.locator('.ops-account-tabs').getByRole('button',{name:'Verification',exact:true}).click();
   await card.getByText('Delivery: Delivered to the recipient',{exact:true}).waitFor();
   assert(!f.calls.some(x=>/send|resend/.test(x.action)));
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('National map automatically displays authenticated registered-shop count without Google browser key',async()=>{
   const f=await pageFor({startView:'map'});
   await f.page.locator('.tp-shop-row').getByText('Synthetic Verified Spaza').waitFor();
   assert.equal(await f.page.locator('.tp-card.tp-green .tp-card-value').innerText(),'1');
   assert.equal(await f.page.locator('.tp-advanced').count(),0);
   assert(await f.page.locator('.tp-map-card details').first().evaluate(el=>el.open));
   assert.equal(await f.page.locator('.tp-combined input[type=password]').count(),0);
   assert(f.calls.some(c=>c.action==='ops_map_shops'));
   assert.equal(await f.page.locator('.tp-premium-google-key').count(),0);
   await f.page.screenshot({path:path.join(output,'admin-national-map-desktop.png'),fullPage:true});
   assert.deepEqual(f.errors,[]);
   await f.context.close();
  });
  await check('Overview uses loaded counts and the sidebar opens mandate and seller reviews on desktop and phone',async()=>{
    const f=await pageFor({startView:'overview'});
    await f.page.getByRole('heading',{name:'Your operations, at a glance.'}).waitFor();
    assert(await f.page.getByRole('button',{name:'Seller verification 3 Loaded review queue Open →'}).isVisible());
    assert(await f.page.getByRole('button',{name:'Seller records 3 Loaded seller records Open →'}).isVisible());
    assert.equal(await f.page.getByText('Total revenue',{exact:false}).count(),0);
    await f.page.locator('#sectionSearch').fill('mandate');
    assert(await f.page.getByRole('button',{name:'Finance & payments',exact:true}).isVisible());
    assert(await f.page.getByRole('button',{name:'Business accounts',exact:true}).isHidden());
    await f.page.getByRole('button',{name:'Finance & payments',exact:true}).click();
    try{await f.page.getByRole('heading',{name:'Historic Netcash mandate archive — read-only'}).waitFor({timeout:7000});}
    catch(error){
      const panel=await f.page.locator('#operationsPanel').innerText();
      const notice=await f.page.locator('#notice').innerText();
      throw Error('Mandate inbox not rendered: '+JSON.stringify({panel:panel.slice(0,1500),notice,errors:f.errors}),{cause:error});
    }
    assert.equal(await f.page.locator('#sectionSearch').inputValue(),'');
    assert(await f.page.getByRole('button',{name:'Business accounts',exact:true}).isVisible());
    const order=await f.page.locator('#operationsPanel').locator('h3').allTextContents();
    assert(order.indexOf('Choose a business for finance')<order.indexOf('Historic Netcash mandate archive — read-only'));
    assert.equal(await f.page.locator('.ops-legacy-archive').evaluate(el=>el.open),false,'Historical mandate archive is collapsed by default');
    await f.page.getByRole('button',{name:'Operations overview',exact:true}).click();
    await f.page.getByRole('heading',{name:'Your operations, at a glance.'}).waitFor();
    await f.page.screenshot({path:path.join(output,'admin-overview-desktop.png'),fullPage:true});
    await f.page.setViewportSize({width:393,height:852});
    assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await f.page.screenshot({path:path.join(output,'admin-overview-phone.png'),fullPage:true});
    await f.page.getByRole('button',{name:'Business accounts',exact:true}).click();
    await f.page.getByRole('button',{name:'Review pending business verifications'}).click();
    await f.page.locator('.seller-row').first().waitFor();
    assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Unavailable review data is not represented as zero applications',async()=>{
    const f=await pageFor({startView:'overview',api:async(route,body)=>{
      if(body.action==='admin_seller_queue'){await route.fulfill({status:503,json:{ok:false,error:'Review queue unavailable'}});return true;}
      return false;
    }});
    await f.page.getByRole('heading',{name:'Your operations, at a glance.'}).waitFor();
    assert(await f.page.getByRole('button',{name:'Seller verification — Queue unavailable — open to retry Open →'}).isVisible());
    assert(await f.page.getByText('Review queue unavailable').isVisible());
    assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Support is a true two-way WhatsApp chat with separate internal cases on desktop and mobile',async()=>{
    const current=Date.now();
    const convo={id:'seller_demoSeller1',ownerUid:'demoSeller1',source:'seller_admin_chat',
      shopName:'Durban Test Spaza',status:'open',createdAt:current-200000,
      updatedAt:current-4000,lastMessage:'Hello, I want to start selling on Teyza.',
      lastMessageAt:current-4000,whatsAppActive:true,whatsAppLastInboundAt:current-4000,
      adminUnread:1,messageCount:1};
    const previous={id:'wa_legacy_1',ownerUid:'demoSeller1',source:'whatsapp_pilot',
      subject:'WhatsApp consultant request',message:'Historical one-way support request',
      status:'open',revision:0,createdAt:current-300000};
    const test=await pageFor({startView:'overview',api:async(route,body)=>{
      if(body.action==='ops_support_list'){
        await route.fulfill({json:{ok:true,tickets:[convo,previous],next:null}});return true;
      }
      if(body.action==='ops_support_thread'){
        await route.fulfill({json:{ok:true,ticket:convo,messages:[
         ...Array.from({length:40},(_,i)=>({
           id:'in'+i,sender:'seller',source:'meta_whatsapp_support',
           text:'WhatsApp history message '+i+' — I need assistance with my shop.',
           createdAt:current-90000+i*2000
         })),
         {id:'out1',sender:'admin',text:'Welcome to Teyza!',
           whatsAppReplyStatus:'accepted',createdAt:current-2000}
        ]}});return true;
      }
      if(body.action==='ops_support_reply'){
        await route.fulfill({json:{ok:true,sent:true,messageId:body.data.messageId}});
        return true;
      }
      return false;
    }});
    await test.page.getByRole('button',{name:'Support inbox',exact:true}).click();
    await test.page.locator('.ops-chat-layout').waitFor();
    assert(await test.page.getByText('Durban Test Spaza').isVisible());
    assert.equal(await test.page.locator('.ops-support-cases > summary').count(),1);
    assert.equal(await test.page.getByText('Historical one-way support request').isVisible(),false);
    await test.page.locator('.ops-chat-item').getByText('Durban Test Spaza').click();
    await test.page.locator('.ops-chat-bubble').first().waitFor();
    assert.equal(await test.page.locator('.ops-chat-bubble').count(),41);
    assert(await test.page.getByText('Meta accepted · delivery not confirmed').isVisible());
    const layoutTest=async()=>{
      const m=await test.page.locator('.ops-chat-layout').evaluate(layout=>{
        const history=layout.querySelector('.ops-chat-messages');
        const composer=layout.querySelector('.ops-chat-composer');
        const send=composer.querySelector('button[type="submit"]');
        const outer=layout.getBoundingClientRect();
        const footer=composer.getBoundingClientRect();
        const btn=send.getBoundingClientRect();
        return {scrollHeight:history.scrollHeight,clientHeight:history.clientHeight,
          footerBottom:footer.bottom,buttonBottom:btn.bottom,layoutBottom:outer.bottom,
          footerVisible:getComputedStyle(composer).display!=='none'&&btn.height>=40};
      });
      assert(m.scrollHeight>m.clientHeight+100,'Message history must have its own scrollbar: '+JSON.stringify(m));
      assert(m.footerVisible,'Send WhatsApp reply button must remain visible');
      assert(m.footerBottom<=m.layoutBottom+3,'Reply composer must stay inside the chat panel');
      assert(m.buttonBottom<=m.layoutBottom+3,'Send button must not be pushed below the chat panel');
    };
    await layoutTest();
    await test.page.screenshot({path:path.join(output,'admin-support-desktop.png'),fullPage:true});
    // A message refresh must preserve the agent's position when reading history.
    await test.page.locator('.ops-chat-messages').evaluate(el=>{el.scrollTop=0;});
    const oldHistory=await test.page.locator('.ops-chat-messages').elementHandle();
    const refreshed=test.page.waitForResponse(response=>response.url().includes('/teyzaMobile')&&
      response.request().postDataJSON()?.action==='ops_support_thread');
    await test.page.getByRole('button',{name:'Reload messages'}).click();
    await refreshed;
    // The response can arrive before show() replaces the thread; assert on the new DOM.
    await test.page.waitForFunction(el=>!el.isConnected,oldHistory);
    await test.page.locator('.ops-chat-bubble').first().waitFor();
    assert.equal(await test.page.locator('.ops-chat-bubble').count(),41);
    assert((await test.page.locator('.ops-chat-messages').evaluate(el=>el.scrollTop))<=5,
      'Refreshing a conversation must not jump an agent away from earlier messages');
    await test.page.locator('.ops-chat-composer textarea').fill('Hello! Registration is free; we can guide you.');
    const oldComposer=await test.page.locator('.ops-chat-composer').elementHandle();
    const saved=test.page.waitForResponse(response=>response.url().includes('/teyzaMobile')&&
      response.request().postDataJSON()?.action==='ops_support_reply');
    const reloaded=test.page.waitForResponse(response=>response.url().includes('/teyzaMobile')&&
      response.request().postDataJSON()?.action==='ops_support_thread');
    await test.page.getByRole('button',{name:'Send WhatsApp reply'}).click();
    await saved;
    await reloaded;
    // Wait for the actual reply refresh and composer replacement before resizing.
    await test.page.waitForFunction(el=>!el.isConnected,oldComposer);
    assert.equal(await test.page.locator('.ops-chat-composer textarea').inputValue(),'');
    assert.equal(await test.page.locator('.ops-chat-bubble').count(),41);
    assert(test.calls.some(x=>x.action==='ops_support_reply'&&
      x.data.ticketId==='seller_demoSeller1'&&x.data.message.includes('Registration is free')));
    await test.page.setViewportSize({width:393,height:852});
    await test.page.waitForFunction(()=>{
      const layout=document.querySelector('.ops-chat-layout');
      return innerWidth===393&&matchMedia('(max-width:680px)').matches&&layout&&getComputedStyle(layout).flexDirection==='column';
    });
    await test.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await layoutTest();
    assert(await test.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await test.page.screenshot({path:path.join(output,'admin-support-phone.png'),fullPage:true});
    await test.context.close();
  });
  await check('User management creates a non-admin account, sends setup email and suspends without changing claims',async()=>{
    const f=await pageFor();
    await f.page.getByRole('button',{name:'Users & access',exact:true}).click();
    await f.page.getByRole('heading',{name:'Users & access'}).waitFor();
    const create=f.page.getByRole('button',{name:'Create account and send setup email'}).locator('xpath=..');
    const form=f.page.locator('.ops-form').first();
    await form.locator('input[name=displayName]').fill('New Teyza Seller');
    await form.locator('input[name=email]').fill('new-seller@example.test');
    await form.locator('select[name=requestedRole]').selectOption('seller');
    await form.locator('input[name=confirmed]').check();
    await form.getByRole('button',{name:'Create account and send setup email'}).click();
    await f.page.getByText('Account created. Firebase sent a password-setup email',{exact:false}).waitFor();
    const created=f.calls.find(x=>x.action==='ops_user_create');
    assert.equal(created.data.requestedRole,'seller');
    assert.equal(created.data.email,'new-seller@example.test');
    assert.equal(created.data.confirmed,true);
    assert(!JSON.stringify(created).includes('password'));
    const row=f.page.getByRole('row').filter({hasText:'new-seller@example.test'});
    await row.getByRole('button',{name:'View user'}).click();
    const inviteSent=f.page.waitForResponse(response=>response.url().includes('/teyzaMobile')&&
      response.request().postDataJSON()?.action==='ops_user_invite');
    await f.page.getByRole('button',{name:'Send password setup email'}).click();
    await inviteSent;
    assert(f.calls.some(x=>x.action==='ops_user_invite'&&x.data.userUid==='new-user1'));
    const suspension=f.page.waitForResponse(response=>response.url().includes('/teyzaMobile')&&
      response.request().postDataJSON()?.action==='ops_user_set_disabled');
    await f.page.getByRole('button',{name:'Suspend user'}).click();
    await suspension;
    assert(f.calls.some(x=>x.action==='ops_user_set_disabled'&&x.data.userUid==='new-user1'&&x.data.disabled===true));
    assert.equal(f.errors.length,0);
    await f.context.close();
  });
  await check('Users and access distinguishes account approval from pending ID and selfie verification',async()=>{
     const f=await pageFor({api:async(route,body)=>{
       if(body.action==='ops_user_detail'&&body.data.userUid==='shopper2'){
         await route.fulfill({json:{ok:true,
           user:{uid:'shopper2',email:'shopper@example.test',displayName:'Existing Shopper',
             verified:false,disabled:false,admin:false,providers:['password']},
           seller:{shopName:'Pilot Spaza',category:'spaza',approvalStatus:'approved',
             verificationStatus:'pending_review',verifiedOwner:false,registrationReady:false,
             sellingUnlocked:false,membershipPaid:false,complimentaryAccess:false}}});
         return true;
       }
       return false;
     }});
     await f.page.getByRole('button',{name:'Users & access',exact:true}).click();
     const row=f.page.getByRole('row').filter({hasText:'shopper@example.test'});
     await row.getByRole('button',{name:'View user'}).click();
     await f.page.getByText('Account approval: approved',{exact:false}).waitFor();
     await f.page.getByText('Business verification: Approved',{exact:false}).waitFor();
     await f.page.getByText('Selling: Membership or verification required',{exact:false}).waitFor();
     await f.page.getByRole('button',{name:'Open complete business account'}).click();
     await f.page.getByRole('button',{name:'Business accounts',exact:true}).waitFor();
     assert.equal(f.errors.length,0);
     await f.context.close();
   });
   await check('Unified Business Account keeps verification, selling, finance and seller chat in separate profile tabs',async()=>{
     const f=await pageFor({startView:'overview',api:async(route,body)=>{
       if(body.action==='ops_seller_detail'){
         await route.fulfill({json:{ok:true,
           seller:{...rows[0],approvalStatus:'pending',listingPlan:'free'},
           businessAccount:{approvalStatus:'pending',reviewStatus:'pending_review',
             verificationChecks:[
               {id:'email',label:'Email verified',complete:true},
               {id:'shop_front',label:'Shop-front photo submitted',complete:false}
             ],missingRequirements:['shop_front'],isPublic:false,
             type:'Spaza shop',membershipStatus:'free'},
           sellingStatus:{sellerApproved:false,shopSetupComplete:true,sellingAccessActive:false,
             canSell:false,shopStatus:'pending_review',publicProductCount:0,savedDraftCount:5,
             publicProductsAllowed:true},
           shopperVisibility:{directoryEligible:false,hasValidPin:true,latitude:-29.8,longitude:31.02},
           billing:{status:'not_started'},paystackMode:'live',membershipPaid:false,
           catalogue:{status:'waiting_for_access',products:[]},
           payments:[],entries:[],verification:{status:'pending_review',phoneVerified:true},
           documents:{identity:null,selfie:null}}});return true;
       }
       if(body.action==='ops_support_thread'){
         await route.fulfill({json:{ok:true,messages:[
           {sender:'seller',senderUid:'seller1',text:'Please explain my shop status.'}
         ]}});return true;
       }
       return false;
     }});
     await f.page.getByRole('button',{name:'Business accounts',exact:true}).click();
     await f.page.getByRole('button',{name:'Open account'}).first().click();
     await f.page.getByRole('heading',{name:'Business account overview'}).waitFor();
     await f.page.getByText('Community visibility: Not yet live').waitFor();
     assert.equal(await f.page.getByText('Paystack seller membership').count(),0);
     await f.page.locator('.ops-account-tabs').getByRole('button',{name:'Verification'}).click();
     await f.page.getByRole('heading',{name:'One business verification checklist'}).waitFor();
     await f.page.getByText('Shop-front photo submitted').waitFor();
     await f.page.locator('.ops-account-tabs').getByRole('button',{name:'Shop & selling'}).click();
     await f.page.getByRole('heading',{name:'Seller products'}).waitFor();
     assert.equal(await f.page.getByText('Payment references').count(),0);
     await f.page.locator('.ops-account-tabs').getByRole('button',{name:'Finance'}).click();
     await f.page.getByRole('heading',{name:'Paystack seller membership'}).waitFor();
     assert.equal(await f.page.getByText('Seller products',{exact:true}).count(),0);
     await f.page.locator('.ops-account-tabs').getByRole('button',{name:'Support'}).click();
     await f.page.getByRole('button',{name:'Load conversation'}).click();
     await f.page.getByText('Please explain my shop status.').waitFor();
     assert(f.calls.some(x=>x.action==='ops_support_thread'&&x.data.ticketId==='seller_seller1'));
     assert(!f.calls.some(x=>x.action==='ops_paystack_confirm'||x.action==='ops_catalogue_publish'));
     assert.deepEqual(f.errors,[]);await f.context.close();
   });
   await check('Duplicate business email shows one explicit owner conflict rather than inherited approvals',async()=>{
      const f=await pageFor({startView:'overview',api:async(route,body)=>{
        if(body.action==='ops_sellers'){
          await route.fulfill({json:{ok:true,sellers:[
            {sellerUid:'',shopName:'Account ownership conflict',
              ownerEmail:'owner@example.test',accountConflict:true,approvalStatus:'identity_conflict',
              subscription:'blocked',conflictingSellerUids:['sellerOld','sellerNew']}
          ],next:null}});return true;
        }
        return false;
      }});
      await f.page.getByRole('button',{name:'Business accounts',exact:true}).click();
      const directory=f.page.getByRole('heading',{name:'Business account directory'});
      await directory.waitFor();
      assert.equal(await f.page.getByRole('button',{name:'Open account'}).count(),0);
      assert.equal(await f.page.getByRole('button',{name:'Review conflict'}).count(),1);
      await f.page.getByRole('button',{name:'Review conflict'}).click();
      await f.page.getByText('sellerOld · sellerNew').waitFor();
      assert(!f.calls.some(x=>x.action==='ops_seller_detail'));
      assert.deepEqual(f.errors,[]);await f.context.close();
   });
   await check('Full account 503 uses explicit limited profile without pretending payments were loaded',async()=>{
      const f=await pageFor({startView:'overview',api:async(route,body)=>{
        if(body.action==='ops_seller_detail'){
          await route.fulfill({status:503,json:{error:'Shop services temporarily unavailable'}});return true;
        }
        if(body.action==='ops_seller_profile'){
          await route.fulfill({json:{ok:true,partial:true,
            seller:{...rows[0],approvalStatus:'pending',listingPlan:'free'},
            businessAccount:{isPublic:false,type:'Spaza shop'},membershipPaid:false,complimentaryAccess:false,
            verification:{status:'pending'},billing:{status:'not_started'}}});return true;
        }
        return false;
      }});
      await f.page.getByRole('button',{name:'Business accounts',exact:true}).click();
      await f.page.getByRole('button',{name:'Open account'}).first().click();
      await f.page.getByRole('heading',{name:'Business account summary · limited service'}).waitFor();
      await f.page.getByText('full account details returned a server error',{exact:false}).waitFor();
      assert.equal(await f.page.getByText('Payment references').count(),0);
      assert(f.calls.some(x=>x.action==='ops_seller_profile'&&x.data.sellerUid==='seller1'));
      assert.deepEqual(f.errors,[]);await f.context.close();
   });
   await check('Seller detail opens current encrypted evidence and clears it when the dialog closes',async()=>{
    const f=await pageFor();
    await f.page.getByRole('button',{name:'Business accounts',exact:true}).click();
    await f.page.getByRole('button',{name:'Open account'}).first().click();
    await f.page.getByRole('button',{name:'Verification',exact:true}).click();
     await f.page.getByRole('heading',{name:'Verification documents'}).waitFor();
    await f.page.getByRole('button',{name:'View private document'}).first().click();
    assert(f.calls.some(x=>x.action==='seller_identity_read'&&x.data.evidenceId==='doc1'));
    await f.page.locator('#photoDialog').getByRole('button',{name:/close/i}).click();
    await f.page.waitForFunction(()=>!document.getElementById('largePhoto').getAttribute('src'));
    await f.page.getByRole('button',{name:'View private document'}).last().click();
    assert(f.calls.some(x=>x.action==='verification_read'&&x.data.submissionId==='selfie1'));
    await f.context.close();
  });
  await check('HR navigation stays in admin with document review, area management and signups',async()=>{
   const f=await pageFor();await f.page.getByRole('button',{name:'Agents & field team',exact:true}).click();
   await f.page.getByRole('heading',{name:'People, applications and neighbourhood coverage'}).waitFor();
   await f.page.screenshot({path:path.join(output,'admin-field-team-desktop.png'),fullPage:true});
   await f.page.setViewportSize({width:393,height:852});
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await f.page.screenshot({path:path.join(output,'admin-field-team-phone.png'),fullPage:true});
   await f.page.setViewportSize({width:1440,height:1100});
   assert(!f.page.url().includes('work.html'));
   await f.page.getByRole('button',{name:'Open ID/passport and CV'}).first().click();
   for(const type of ['ID / passport','CV']){await f.page.getByRole('button',{name:'View '+type}).click();await f.page.locator('#fieldEvidenceDialog').getByRole('button',{name:'Close'}).click();}
   await f.page.getByRole('button',{name:'Approve applicant'}).first().click();
   await f.page.getByText('Agent approved for Teyza Work.',{exact:false}).waitFor();
   assert(f.calls.some(c=>c.action==='agent_admin_profile_decide'&&c.data.agentUid==='applicant1'));
   await f.page.getByRole('button',{name:'Area management',exact:true}).click();
   await f.page.locator('.ops-form input').fill('Pinetown');
   await f.page.getByRole('button',{name:'Save area assignment'}).click();
   await f.page.getByText('Area assignment updated.').waitFor();
   assert(f.calls.some(c=>c.action==='agent_admin_area_assign'&&c.data.area==='Pinetown'));
   await f.page.getByRole('button',{name:'Shop signups',exact:true}).click();
   await f.page.getByText('Demo Spaza',{exact:false}).first().waitFor();
   await f.page.getByRole('button',{name:'Work reviews',exact:true}).click();
   await f.page.getByRole('button',{name:'Review visit'}).click();
   for(const kind of ['shop','selfie']){await f.page.getByRole('button',{name:'Open '+kind+' photo'}).click();await f.page.locator('#fieldEvidenceDialog').getByRole('button',{name:'Close'}).click();}
   await f.page.getByRole('button',{name:'Approve work'}).click();
   await f.page.getByText('Field visit review saved.').waitFor();
   assert(f.calls.some(c=>c.action==='agent_admin_visit_decide'&&c.data.reviewConfirmed));
   await f.page.getByRole('button',{name:'Operations overview',exact:true}).click();await f.page.getByText('Your operations, at a glance.').waitFor();
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Agent communications displays real fixture states and only safely rechecks blocked emails',async()=>{
   const f=await pageFor();await f.page.getByRole('button',{name:'Agents & field team',exact:true}).click();
   await f.page.getByRole('button',{name:'Communications',exact:true}).click();
   await f.page.getByText('Synthetic Applicant',{exact:true}).waitFor();
   await f.page.getByText('Sent to Zoho',{exact:true}).last().waitFor();
   assert((await f.page.getByRole('textbox',{name:'Business benefits reply text'}).inputValue()).includes('Registration and verification are free')||(await f.page.getByRole('textbox',{name:'Business benefits reply text'}).inputValue()).includes('registration and verification are free'));
   await f.page.getByLabel('Filter welcome email status').selectOption('blocked_email');
   assert.equal(await f.page.getByText('Synthetic Applicant',{exact:true}).count(),0);
   const recheck=f.page.getByRole('button',{name:'Recheck verified email'});assert(await recheck.isDisabled());
   await f.page.getByText('Applicant has been asked to verify their email.',{exact:true}).click();
   await recheck.click();await f.page.getByText('Email recheck scheduled. Nothing sent yet.',{exact:false}).waitFor();
   assert(f.calls.some(c=>c.action==='agent_admin_communications_recheck'&&c.data.agentUid==='agent2'&&c.data.confirmed===true));
   await f.page.setViewportSize({width:393,height:852});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Recruitment coverage separates campaign attribution, approved agents and actual visit areas',async()=>{
   const f=await pageFor();await f.page.getByRole('button',{name:'Agents & field team',exact:true}).click();
   await f.page.getByRole('button',{name:'Recruitment coverage',exact:true}).click();
   await f.page.getByRole('heading',{name:'Applications by recruitment source'}).waitFor();
   const source=f.page.locator('.field-area-row').filter({hasText:'Meta — Durban'});
   await source.getByText('1 applications · 1 approved · 1 approved with a recorded visit · 0 R90 approvals awaiting payment').waitFor();
   await f.page.getByText('KwaZulu-Natal · Umlazi',{exact:true}).waitFor();
   await f.page.getByText('KwaZulu-Natal · Durban',{exact:true}).waitFor();
   await f.page.setViewportSize({width:393,height:852});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Business acquisition saves a consent-aware prospect and displays actual seller status',async()=>{
   let prospect=null;
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='admin_area_suggest'){
     assert.match(body.adminSession,/^[a-f0-9]{64}$/);assert.match(body.data.sessionToken,/^[0-9a-f-]{36}$/i);
     await route.fulfill({json:{ok:true,suggestions:body.data.query==='Synthetic Remote Township'?[{label:'Synthetic Remote Township, KwaZulu-Natal, South Africa',predictionToken:'synthetic-area-receipt'}]:body.data.query==='Synthetic Eastern Community, Buffalo City, Eastern Cape'?[{label:'Synthetic Eastern Community, Buffalo City, Eastern Cape, South Africa',predictionToken:'synthetic-eastern-receipt'}]:[]}});return true;
    }
    if(body.action==='admin_area_select'){
     assert.match(body.adminSession,/^[a-f0-9]{64}$/);
     if(body.data.predictionToken==='synthetic-eastern-receipt'){await route.fulfill({json:{ok:true,area:{area:'Synthetic Eastern Community',province:'Eastern Cape',label:'Synthetic Eastern Community, Buffalo City, Eastern Cape, South Africa',lat:-32.99,lng:27.9,radius:5000,source:'Google Maps'}}});return true;}
     assert.equal(body.data.predictionToken,'synthetic-area-receipt');
     await route.fulfill({json:{ok:true,area:{area:'Synthetic Remote Township',province:'KwaZulu-Natal',label:'Synthetic Remote Township, KwaZulu-Natal, South Africa',lat:-29.8579,lng:31.0292,radius:10000,source:'Google Maps'}}});return true;
    }
    if(!body.action.startsWith('ops_acquisition_'))return false;
    if(body.action==='ops_acquisition_command_page')await route.fulfill({json:await syntheticCommandPage(body)});
    else if(body.action==='ops_acquisition_locality_browse'){
     const {province,query,offset}=body.data;
     const rows=province==='Eastern Cape'?[{province,municipality:'Buffalo City',township:'Synthetic Eastern Community',localityId:'BUF:123456789'}]:offset===0?[{province,municipality:'eThekwini',township:'Synthetic First Community',localityId:'ETH:123456789'}]:[{province,municipality:'eThekwini',township:'Synthetic Second Community',localityId:'ETH:223456789'}];
     await route.fulfill({json:{ok:true,schema:1,province,query,offset,nextOffset:province==='KwaZulu-Natal'&&offset===0&&!query?50:null,localities:query==='Unmatched'?[]:rows}});
    }
    else if(body.action==='ops_acquisition_localities'){assert.equal(body.data.province,'KwaZulu-Natal');assert.equal(body.data.query,'Umlazi');await route.fulfill({json:{ok:true,vintage:'Synthetic government reference',localities:[{province:'KwaZulu-Natal',municipality:'eThekwini',township:'Umlazi',localityId:'ETH:123456789'}]}});}
    else if(body.action==='ops_acquisition_create'){assert.equal(body.data.localityId,'ETH:123456789');assert.equal(body.data.geographyConfirmed,true);assert.equal(body.data.independentSourceConfirmed,true);assert.equal(body.data.authorisedSource,true);assert.equal(body.data.googlePlaceId,'SyntheticPlace1234');assert.equal(body.data.website,'https://example.test/');assert.equal(body.data.email,'');prospect={...body.data,id:'prospect1',revision:0,stage:'identified',permissions:{},assignedTo:'admin1',lastActivityBy:'admin1',updatedAt:Date.now(),lastActivityAt:Date.now(),optedOut:false};await route.fulfill({json:{ok:true,prospect}});}
    else if(body.action==='ops_acquisition_place_matches'){
     assert(Array.isArray(body.data.placeIds));assert(body.data.placeIds.length<=30);
     await route.fulfill({json:{ok:true,matches:prospect?.googlePlaceId&&body.data.placeIds.includes(prospect.googlePlaceId)?[{placeId:prospect.googlePlaceId,id:prospect.id}]:[]}});
    }
    else if(body.action==='ops_acquisition_event'){
     assert.equal(body.data.revision,prospect.revision);
     if(body.data.type==='contact_update'){
      assert.equal(body.data.authorisedSource,true);assert.equal(body.data.confirmed,true);assert.equal(body.data.email,'synthetic@example.test');
      assert(!prospect.email);prospect={...prospect,email:body.data.email,revision:prospect.revision+1};
     }else{assert.equal(body.data.type,'permission');assert.equal(body.data.channel,'email');assert.equal(body.data.ownerOptIn,true);prospect={...prospect,permissions:{email:{granted:true}},revision:prospect.revision+1};}
     await route.fulfill({json:{ok:true,prospect}});
    }
    else if(body.action==='ops_acquisition_send'){assert.equal(body.data.channel,'email');assert.equal(body.data.kind,'invitation');assert.equal(body.data.confirmed,true);prospect={...prospect,outbound:{email_invitation:{status:'queued',updatedAt:Date.now()}},revision:prospect.revision+1};await route.fulfill({json:{ok:true,message:{status:'queued'}}});}
    else if(body.action==='ops_acquisition_detail')await route.fulfill({json:{ok:true,prospect,events:[]}});
    else await route.fulfill({json:{ok:true,schema:1,prospects:[{id:'manual-prospect',name:'Synthetic Saved Manual Shop',city:'Durban',area:'Umlazi',address:'Synthetic Manual Road',category:'spaza',stage:'identified',phone:'',email:'',permissions:{},optedOut:false,revision:0}],next:null,communications:{email:{invitation:true},whatsapp:{invitation:false}}}});
    return true;
   }});
   await f.page.getByRole('button',{name:'Business acquisition',exact:true}).click();
   await f.page.getByRole('heading',{name:'Business Acquisition Command Centre'}).waitFor();
   assert.equal(await f.page.getByRole('button',{name:'Open national coverage map',exact:true}).count(),0);
   assert.equal(await f.page.getByRole('button',{name:'Find businesses by area',exact:true}).count(),0);
   await f.page.getByRole('button',{name:"+ Find & Add Businesses",exact:true}).click();
   await f.page.getByText('Choose the province, then a town or township.',{exact:true}).waitFor();
   const wizard=f.page.getByRole('dialog');assert(await wizard.getByRole('button',{name:'Continue to business type'}).isDisabled());
   await wizard.getByLabel('Province',{exact:true}).selectOption('Eastern Cape');
   const eastern=wizard.getByRole('button',{name:/Synthetic Eastern Community.*Buffalo City/});await eastern.waitFor();
   assert(!f.calls.some(c=>c.action==='admin_area_suggest'||c.action==='admin_area_select'));
   await eastern.click();
   await wizard.getByRole('button',{name:'Synthetic Eastern Community, Buffalo City, Eastern Cape, South Africa',exact:true}).click();
   await wizard.getByText('Selected: Synthetic Eastern Community, Buffalo City, Eastern Cape, South Africa',{exact:true}).waitFor();
   await wizard.getByRole('button',{name:'Continue to business type'}).click();
   await wizard.getByText('Selected community: Synthetic Eastern Community, Buffalo City, Eastern Cape, South Africa',{exact:true}).waitFor();
   const easternPattern='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover?*';
   let easternSearches=0;await f.page.route(easternPattern,route=>{
    const q=new URL(route.request().url()).searchParams;easternSearches++;
    assert.equal(q.get('scope'),'admin-local-v1');assert.equal(q.get('lat'),'-32.99');assert.equal(q.get('lon'),'27.9');assert.equal(q.get('radius'),easternSearches===1?'5000':'20000');
    return route.fulfill({json:{ok:true,searchScope:'admin-local-v1',searchRadiusKm:Number(q.get('radius'))/1000,entries:easternSearches===1?[]:[{placeId:'SyntheticEasternSpaza123',name:'Synthetic Eastern Local Shop',latitude:-32.99,longitude:27.9,shopCategory:'spaza'}],diagnostics:{queriesAttempted:6,queriesFailed:0,providerRows:easternSearches===1?0:1,outsideRadius:0,categoryExcluded:0,missingLocationOrClosed:0}}});
   });
   await wizard.getByRole('button',{name:'Search this area',exact:true}).click();
   await wizard.getByText(/No matching mapped businesses were returned/).waitFor();assert.equal(easternSearches,1);
   await wizard.getByLabel('Business search radius').selectOption('20000');assert.equal(easternSearches,1);
   await wizard.getByRole('button',{name:'Search this area',exact:true}).click();
   await wizard.getByText('Synthetic Eastern Local Shop',{exact:true}).waitFor();assert.equal(easternSearches,2);
   await f.page.unroute(easternPattern);
   await wizard.getByRole('button',{name:'Change location',exact:true}).click();
   await wizard.getByLabel('Province',{exact:true}).selectOption('KwaZulu-Natal');
   assert.equal(await wizard.getByLabel('Town or municipality').inputValue(),'');
   await wizard.getByRole('button',{name:/Synthetic First Community.*eThekwini/}).waitFor();
   assert.equal(await wizard.getByRole('button',{name:/Synthetic Eastern Community/}).count(),0);
   await wizard.getByRole('button',{name:'More communities',exact:true}).click();
   await wizard.getByRole('button',{name:/Synthetic Second Community.*eThekwini/}).waitFor();
   await wizard.getByRole('button',{name:'Previous communities',exact:true}).click();
   await wizard.getByRole('button',{name:/Synthetic First Community/}).waitFor();
   await wizard.getByLabel('Filter township directory').fill('Unmatched');
   await wizard.getByRole('button',{name:'Filter list',exact:true}).click();
   await wizard.getByText(/No matching reference on this page/).waitFor();
   await wizard.getByRole('button',{name:'Durban',exact:true}).click();
   await wizard.getByText('Selected: Durban, KwaZulu-Natal',{exact:true}).waitFor();
   await wizard.getByRole('button',{name:'Continue to business type'}).click();
   await wizard.getByText('Selected community: Durban, KwaZulu-Natal',{exact:true}).waitFor();
   assert(await wizard.getByLabel('Google business type').isVisible());
   let guidedSearches=0,guidedContacts=0;
   const guidedSearchPattern='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover?*';
   const guidedContactPattern='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-place-contact.php?*';
   await f.page.route(guidedSearchPattern,route=>{
    guidedSearches++;
    const q=new URL(route.request().url()).searchParams,kind=q.get('category');assert.equal(q.get('scope'),'admin-local-v1');
    return route.fulfill({json:{ok:true,searchScope:'admin-local-v1',searchRadiusKm:Number(q.get('radius'))/1000,entries:kind==='spaza'?[
     {placeId:'SyntheticFuel12345',name:"TotalEnergies Synthetic Service Station",latitude:-29.86,longitude:31.02,shopCategory:'spaza',primaryType:'gas_station',types:['gas_station','convenience_store']},
     {placeId:'SyntheticIndependent123',name:'Shalom Spaza',latitude:-29.86,longitude:31.02,shopCategory:'spaza'},
     {placeId:'SyntheticNoPhone123',name:'Independent Tuck Shop',latitude:-29.86,longitude:31.02,shopCategory:'spaza'}
    ]:[]}});
   });
   await f.page.route(guidedContactPattern,route=>{guidedContacts++;return route.fulfill({json:{ok:true,phone:'',websiteUrl:''}});});
   await wizard.getByRole('button',{name:'Search this area',exact:true}).click();
   await wizard.getByText('Shalom Spaza',{exact:true}).waitFor();
   assert.equal(guidedSearches,1);assert.equal(guidedContacts,0);
   assert.equal(await wizard.getByText('TotalEnergies Synthetic Service Station',{exact:true}).count(),0);
   await wizard.getByText('Include large chains',{exact:false}).click();
   const fuel=wizard.locator('.acq-business-card').filter({hasText:'TotalEnergies Synthetic Service Station'});
   await fuel.getByText('Fuel station',{exact:true}).waitFor();
   await wizard.getByText('Include large chains',{exact:false}).click();
   await wizard.getByLabel('Contact review allowance').selectOption('10');
   await wizard.getByRole('button',{name:'Review next unchecked business',exact:true}).click();
   assert.equal(guidedContacts,0);
   await wizard.getByLabel('Phone availability').selectOption('all');
   const reviewed=wizard.locator('.acq-business-card').filter({hasText:'Shalom Spaza'});
   await reviewed.getByRole('button',{name:'View contact details',exact:true}).click();
   await reviewed.getByText('No phone listed',{exact:true}).waitFor();
   await wizard.getByText('1 / 10 contact requests attempted in this window',{exact:true}).waitFor();
   assert.equal(guidedContacts,1);
   assert(await wizard.getByText('Independent Tuck Shop',{exact:true}).isVisible());
   await f.page.unroute(guidedSearchPattern);
   await f.page.unroute(guidedContactPattern);
   await wizard.getByRole('button',{name:'Close',exact:true}).click();
   await f.page.getByRole('button',{name:'Saved contacts',exact:true}).click();
   await f.page.getByRole('heading',{name:'Find businesses in an area'}).waitFor();
   assert.equal(await f.page.getByLabel('Contact channel filter').inputValue(),'contactable');
   const findDialog=f.page.getByRole('dialog');assert.equal(await findDialog.getByText('Synthetic Saved Manual Shop',{exact:true}).count(),0);
   await findDialog.getByLabel('Contact channel filter').selectOption('manual');
   await findDialog.getByText('Synthetic Saved Manual Shop',{exact:true}).waitFor();
   assert(await findDialog.getByText('Field visit / manual enquiry',{exact:true}).isVisible());
   await findDialog.getByLabel('Contact channel filter').selectOption('email');assert.equal(await findDialog.getByText('Synthetic Saved Manual Shop',{exact:true}).count(),0);
   await findDialog.getByLabel('Contact channel filter').selectOption('contactable');
   await f.page.getByLabel('Town, township or business name').fill('Durban');
   // Real popup behavior, mocked Google API: no live billable calls or prospect writes.
   await f.page.evaluate(()=>{
    class MapMock{constructor(_node,opts){if(window.__acqFailMap)throw Error('Synthetic map error');this.center=opts.center;this.zoom=opts.zoom;}
     setCenter(p){this.center={lat:typeof p.lat==='function'?p.lat():p.lat,lng:typeof p.lng==='function'?p.lng():p.lng};}getCenter(){return {lat:()=>this.center.lat,lng:()=>this.center.lng};}
     setZoom(z){this.zoom=z;}getZoom(){return this.zoom;}panTo(p){this.setCenter(p);}}
    class MarkerMock{setMap(){}addListener(){}}
    class InfoWindowMock{open(){}}
    class GeocoderMock{geocode(args,cb){window.__acqGeocoded=args.address;cb([],'REQUEST_DENIED');}}
    window.google={maps:{Map:MapMock,Marker:MarkerMock,InfoWindow:InfoWindowMock,Geocoder:GeocoderMock,SymbolPath:{CIRCLE:0}}};
   });
   let mapConfigRequests=0;
   await f.page.route('**/assets/teyza-maps-config.json',route=>{mapConfigRequests++;return route.fulfill({json:{browserKey:'AIza'+'A'.repeat(35)}});});
   let placesRequests=0,contactRequests=0,expectedRadius='20000',failNextContact=true;
   await f.page.route('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover?*',route=>{
    placesRequests++;const u=new URL(route.request().url());assert.equal(u.searchParams.get('lat'),'-29.8579');assert.equal(u.searchParams.get('lon'),'31.0292');assert.equal(u.searchParams.get('radius'),expectedRadius);
    const category=u.searchParams.get('category');assert(['spaza','variety','wholesale'].includes(category));assert.equal(u.searchParams.get('scope'),'admin-local-v1');
    const entries=category==='spaza'?[{placeId:'SyntheticPlace1234',name:'Synthetic Spaza',address:'Synthetic Local Road',latitude:-29.86,longitude:31.02,shopCategory:'spaza'},{placeId:'SyntheticPlace5678',name:'Synthetic No Contact',address:'Synthetic No Contact Road',latitude:-29.87,longitude:31.02,shopCategory:'spaza'},{placeId:'SyntheticWrongArea123',name:'Synthetic Soweto Outside Radius',latitude:-26.268,longitude:27.858,shopCategory:'spaza'}]:[];
    return route.fulfill({json:{ok:true,searchScope:'admin-local-v1',searchRadiusKm:Number(expectedRadius)/1000,entries}});
   });
   await f.page.route('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-place-contact.php?*',route=>{
    contactRequests++;const id=new URL(route.request().url()).searchParams.get('placeId');
    if(id==='SyntheticPlace1234'&&failNextContact){failNextContact=false;return route.fulfill({status:403,json:{ok:false,error:'Synthetic trial allowance'}});}
    return route.fulfill({json:id==='SyntheticPlace1234'?{ok:true,phone:'031 555 0100',websiteUrl:'https://example.test/'}:{ok:true,phone:'',websiteUrl:''}});
   });
   await f.page.getByRole('button',{name:'Search Google Places',exact:true}).click();
   const live=f.page.getByRole('dialog');
   await live.getByText('Synthetic Spaza',{exact:true}).waitFor();
   await live.getByText('Synthetic No Contact',{exact:true}).waitFor();
   assert.equal(await live.getByText('Synthetic Soweto Outside Radius',{exact:true}).count(),0);
   assert.equal(placesRequests,3);assert.equal(contactRequests,0);
   assert.equal(await live.getByLabel('Town or municipality').inputValue(),'Durban');
   assert.equal(await f.page.evaluate(()=>window.__acqGeocoded??null),null);assert.equal(mapConfigRequests,0);
   await live.getByText(/within 20 km of Durban, KwaZulu-Natal/).waitFor();
   assert.equal(await live.locator('.acq-optional-map').evaluate(e=>e.open),false);
   assert.equal(await live.locator('.tp-combined-map').isVisible(),false);
   const shop=live.locator('.acq-business-card').filter({hasText:'Synthetic Spaza'});
   const noContact=live.locator('.acq-business-card').filter({hasText:'Synthetic No Contact'});
   await shop.getByRole('button',{name:'View contact details'}).click();
   await shop.getByText('Contact check unavailable',{exact:true}).waitFor();
   await shop.getByText(/Request blocked \(HTTP 403\)/).waitFor();
   assert.equal(await shop.getByText('No phone listed',{exact:true}).count(),0);
   assert.equal(contactRequests,1);
   await shop.getByRole('button',{name:'Retry contact check'}).click();
   await shop.getByText('Phone available',{exact:true}).waitFor();
   await shop.getByText('Public phone: 031 555 0100',{exact:true}).waitFor();
   assert.equal(await shop.getByRole('link',{name:'Open business website'}).getAttribute('href'),'https://example.test/');
   assert.equal(await shop.getByRole('button',{name:'Check WhatsApp',exact:true}).count(),1);
   await shop.getByRole('button',{name:'Check WhatsApp',exact:true}).click();
   assert.match(await shop.getByLabel('Personalised WhatsApp invitation preview').inputValue(),/Synthetic Spaza.*Durban/s);
   const checkLink=shop.getByRole('link',{name:'Open WhatsApp — check number only',exact:true});
   assert.equal(await checkLink.getAttribute('href'),'https://wa.me/27315550100');
   assert.equal(await checkLink.getAttribute('target'),'_blank');
   assert(await shop.getByRole('button',{name:'Prepare WhatsApp message',exact:true}).isVisible());
   const publicPreview=shop.locator('[data-preview-category="spaza"]');await publicPreview.locator('summary').click();const previewImage=publicPreview.getByRole('img');await previewImage.waitFor();assert.equal(await previewImage.getAttribute('src'),'/assets/admin-benefits/teyza-benefits-spaza-v1.png');await previewImage.scrollIntoViewIfNeeded();await f.page.waitForFunction(()=>Array.from(document.querySelectorAll('.acq-business-card [data-preview-category="spaza"][open] img')).some(i=>i.complete&&i.naturalWidth===1080&&i.naturalHeight===1350));assert.equal(await shop.locator('[data-benefits-category]').count(),0);
   assert(!new URL(await checkLink.getAttribute('href')).searchParams.has('text'));
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_manual_whatsapp'||c.action==='ops_acquisition_send').length,0);
   // Switching to an external chat must not erase this exact search or
   // cause another Places/contact request. The UI is concealed until the
   // existing authenticated session is checked on return.
   const beforeScroll=await live.evaluate(e=>e.scrollTop),listBefore=f.calls.filter(c=>c.action==='ops_acquisition_list').length;
   await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   await f.page.waitForFunction(()=>document.documentElement.classList.contains('acq-session-paused'));
   assert.equal(await shop.getByText('Phone available',{exact:true}).isVisible(),false);
   await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
   await f.page.waitForFunction(()=>!document.documentElement.classList.contains('acq-session-paused'));
   await shop.getByText('Phone available',{exact:true}).waitFor();
   assert.equal(await live.evaluate(e=>e.scrollTop),beforeScroll);
   assert.equal(placesRequests,3);assert.equal(contactRequests,2);
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_list').length,listBefore);
   assert(f.calls.some(c=>c.action==='admin_session_status'));
   assert.equal(await f.page.evaluate(()=>!window.dispatchEvent(new Event('beforeinstallprompt',{cancelable:true}))),true);
   await f.page.evaluate(()=>delete document.hidden);
   await noContact.getByRole('button',{name:'View contact details'}).click();
   await noContact.getByText('Phone: not listed',{exact:true}).waitFor();
   assert(await noContact.getByText('No phone listed',{exact:true}).isVisible());
   assert(await noContact.getByText('Manual enquiry:',{exact:false}).isVisible());
   assert(await noContact.getByRole('link',{name:'View on Google Maps'}).isVisible());
   assert.equal(await noContact.getByRole('button',{name:'Check WhatsApp',exact:true}).count(),0);
   assert(await noContact.getByRole('button',{name:'Add Business',exact:true}).isVisible());
   assert.equal(contactRequests,3);assert.equal(await live.locator('.acq-business-card').count(),2);
   await f.page.evaluate(()=>window.__acqFailMap=true);
   await shop.getByRole('button',{name:'Show on map',exact:true}).click();
   await live.getByText('Map could not load. Business information remains available above.',{exact:true}).waitFor();
   assert.equal(await live.locator('.acq-business-card').count(),2);
   assert(await noContact.getByText('Phone: not listed',{exact:true}).isVisible());
   assert.equal(mapConfigRequests,1);
   await live.getByLabel('Town or municipality').fill('Unknown Test Town');
   await live.getByRole('button',{name:'Search this area',exact:true}).click();
   await live.getByText(/Search failed: .*Select the correct South African area/).waitFor();assert.equal(placesRequests,3);
   assert.equal(await live.locator('.acq-business-card').count(),0);
   assert.equal(await f.page.evaluate(()=>window.__acqGeocoded??null),null);
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_create'||c.action==='ops_acquisition_send').length,0);
   // Exercise remote suggestion -> selected receipt -> radius request, with no live Maps calls.
    await live.getByLabel('Town or municipality').fill('Synthetic Remote Township');
    await live.getByRole('button',{name:'Synthetic Remote Township, KwaZulu-Natal, South Africa',exact:true}).click();
    await live.getByText('Selected: Synthetic Remote Township, KwaZulu-Natal, South Africa',{exact:true}).waitFor();
    expectedRadius='10000';
    await live.getByRole('button',{name:'Search this area',exact:true}).click();
    await live.getByText('Synthetic Spaza',{exact:true}).waitFor();
    assert.equal(await live.getByText('Synthetic Soweto Outside Radius',{exact:true}).count(),0);
    assert.equal(placesRequests,6);
    assert(f.calls.some(c=>c.action==='admin_area_suggest'&&c.data.query==='Synthetic Remote Township'));
    assert(f.calls.some(c=>c.action==='admin_area_select'&&c.data.predictionToken==='synthetic-area-receipt'));
    expectedRadius='20000';
    await live.getByRole('button',{name:'Back to saved contacts'}).click();
   assert.equal(await f.page.getByText('Synthetic Spaza',{exact:true}).count(),0);
   await f.page.getByLabel('Town, township or business name').fill('Durban');
   await f.page.getByRole('button',{name:'Search Google Places',exact:true}).click();
   const chosen=f.page.locator('.acq-business-card').filter({hasText:'Synthetic Spaza'});
   await chosen.getByRole('button',{name:'View contact details'}).click();
   await chosen.getByText('Public phone: 031 555 0100',{exact:true}).waitFor();
   await chosen.getByRole('button',{name:'Add Business',exact:true}).waitFor({state:'visible'});
   await f.page.waitForFunction(()=>Array.from(document.querySelectorAll('.acq-business-card')).some(card=>card.textContent.includes('Synthetic Spaza')&&!card.querySelector('[data-acq-record-action]')?.disabled));
   await chosen.getByRole('button',{name:'Prepare WhatsApp message',exact:true}).click();
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_create'||c.action==='ops_acquisition_manual_whatsapp'||c.action==='ops_acquisition_send').length,0);
   const form=f.page.getByRole('dialog').locator('form').filter({has:f.page.getByRole('button',{name:'Add Business',exact:true})});
   await form.getByLabel('Business name',{exact:true}).waitFor();
   assert.equal(await form.getByLabel('Business name',{exact:true}).inputValue(),'');
   await f.page.getByRole('button',{name:'Use independently confirmed details'}).click();
   assert.equal(await form.getByLabel('Business name',{exact:true}).inputValue(),'');
   await form.getByLabel('Source reference / authority to retain details').fill('Synthetic owner request');
   await form.getByLabel('I confirm Teyza may retain this information for onboarding.').check();
   await form.getByLabel('I independently confirmed the business details using the named permitted source, not Google Maps alone.').check();
   await f.page.getByRole('button',{name:'Use independently confirmed details'}).click();
   assert.equal(await form.getByLabel('Business name',{exact:true}).inputValue(),'Synthetic Spaza');
   assert.equal(await form.getByLabel('Business website (optional)').inputValue(),'https://example.test/');
   await form.getByLabel('Township / area').fill('Umlazi');
   await form.getByLabel('Province',{exact:true}).selectOption('KwaZulu-Natal');
   await form.getByLabel('Town / city').fill('Durban');
   await form.getByRole('button',{name:'Find official locality reference'}).click();
   await form.getByRole('button',{name:'Umlazi — eThekwini (ETH:123456789)'}).click();
   assert.equal(await form.getByLabel('Municipality',{exact:true}).inputValue(),'eThekwini');
   await form.getByLabel('I confirm the province, municipality, town and township for this business.').check();
   await form.getByLabel('I independently confirmed the business details using the named permitted source, not Google Maps alone.').uncheck();
   await form.getByRole('button',{name:'Add Business',exact:true}).click();
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_create').length,0);
   await form.getByLabel('I independently confirmed the business details using the named permitted source, not Google Maps alone.').check();
   await form.getByRole('button',{name:'Add Business',exact:true}).click();
   await f.page.getByRole('heading',{name:'Business: Synthetic Spaza'}).waitFor();
   await f.page.getByRole('dialog').getByText('Added',{exact:true}).waitFor();
   assert.equal(prospect.googlePlaceId,'SyntheticPlace1234');assert.equal(prospect.website,'https://example.test/');
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_create').length,1);
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_send').length,0);
   const searchesBeforeReturn=placesRequests,contactsBeforeReturn=contactRequests;
   await f.page.getByRole('button',{name:'Back to current results',exact:true}).click();
   const saved=f.page.locator('.acq-business-card').filter({hasText:'Synthetic Spaza'});
   await saved.getByText('Added',{exact:true}).waitFor();
   assert.equal(await saved.getByRole('button',{name:'Add Business',exact:true}).count(),0);
   assert(await saved.getByRole('button',{name:'Contact details checked',exact:true}).isDisabled());
   assert.equal(placesRequests,searchesBeforeReturn);assert.equal(contactRequests,contactsBeforeReturn);
   await saved.getByRole('button',{name:'Prepare WhatsApp message',exact:true}).click();
   await f.page.getByRole('heading',{name:'Business: Synthetic Spaza'}).waitFor();
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_manual_whatsapp'||c.action==='ops_acquisition_send').length,0);
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_create').length,1);
   await f.page.getByText('Zoho email · introduction / registration welcome / membership',{exact:true}).click();
   await f.page.getByRole('heading',{name:'Send a message'}).waitFor();
   assert.equal(await f.page.getByLabel('email invitation send preview').count(),0);
   await f.page.getByText('Add missing contact details',{exact:true}).click();
   const missing=f.page.locator('form').filter({has:f.page.getByRole('button',{name:'Save contact details',exact:true})});
   await missing.getByLabel('Confirmed business email').fill('synthetic@example.test');
   await missing.getByLabel('Independent source / evidence').fill('Synthetic owner-provided address');
   await missing.getByLabel('I independently confirmed these details and Teyza may retain them. No contact permission is inferred.').check();
   await missing.getByRole('button',{name:'Save contact details',exact:true}).click();
   await f.page.getByText('Zoho email · introduction / registration welcome / membership',{exact:true}).click();
   await f.page.getByText('Recipient: synthetic@example.test',{exact:true}).waitFor();
   assert.equal(await f.page.getByLabel('email invitation send preview').count(),0);
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_send').length,0);
   await f.page.getByText('Business support and linked cases',{exact:true}).click();
   await f.page.getByRole('heading',{name:'Business help and support'}).waitFor();
   assert.equal(await f.page.getByRole('button',{name:'Record invitation sent'}).count(),0);
   await f.page.getByText('Record contact permission, follow-up or support activity',{exact:true}).click();
   const activity=f.page.locator('form').filter({has:f.page.getByRole('button',{name:'Save activity',exact:true})});
   await activity.getByLabel('Record activity').selectOption('permission');await activity.getByLabel('Channel',{exact:true}).selectOption('email');
   await activity.getByLabel('Owner explicitly opted in to this channel.').check();
   await activity.getByLabel('Activity note / consent evidence (no sensitive documents or credentials)').fill('Synthetic owner opt-in');
   await activity.getByLabel('I confirm this records an actual event. No message will be sent.').check();
   await activity.getByRole('button',{name:'Save activity'}).click();
   const draft=f.page.getByLabel('email invitation send preview');await draft.waitFor();const copy=await draft.inputValue();
   assert(copy.includes('Synthetic Spaza – Grow your business with Teyza'));assert(copy.includes('Umlazi, Durban'));assert(copy.includes('source stock for your spaza shop'));
   assert.equal(await f.page.getByRole('button',{name:'Record welcome sent'}).count(),0);
   await f.page.getByRole('button',{name:'Artwork & training resources'}).click();
   await f.page.getByRole('heading',{name:'Marketing & onboarding asset library'}).waitFor();
   const originalArtLinks=f.page.getByRole('link',{name:'View original artwork',exact:true});
   const approvedArt=require('../app-first-release/whatsapp-benefits-manifest.json').assets.map(a=>a.path);
   const previousArt=['/assets/app/home.webp','/assets/app/nearby-shops.webp','/assets/app/spaza-owner.webp','/assets/app/wordmark.svg','/assets/app/icon.svg'];
   assert.equal(await originalArtLinks.count(),13);
   assert.deepEqual((await originalArtLinks.evaluateAll(links=>links.map(link=>link.getAttribute('href')))).sort(),[...previousArt,...approvedArt].sort());
   assert.equal(await f.page.getByRole('link',{name:'Watch video',exact:true}).count(),0);
   await f.page.route('**/assets/app/teyza-business-explainer.mp4',route=>route.fulfill({status:200,headers:{'content-type':'video/mp4','content-length':'100'}}));
   await f.page.route('**/assets/app/teyza-business-intro.mp4',route=>route.fulfill({status:200,headers:{'content-type':'text/html','content-length':'100'}}));
   const checks=f.page.getByRole('button',{name:'Check published video',exact:true});
   await checks.first().click();await f.page.getByRole('link',{name:'Watch video',exact:true}).waitFor();
   await checks.last().click();await f.page.getByText('Not published / not verified',{exact:true}).waitFor();
   assert.equal(await f.page.getByRole('link',{name:'Watch video',exact:true}).count(),1);
   await f.page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await f.page.getByRole('button',{name:'Saved contacts',exact:true}).click();
   const contactDialog=f.page.getByRole('dialog');await contactDialog.getByLabel('Town, township or business name').fill('Durban');
   await contactDialog.getByText('Synthetic Spaza',{exact:true}).waitFor();
   assert(await contactDialog.getByRole('button',{name:'Send email',exact:true}).isEnabled());
   assert.equal(await contactDialog.getByRole('button',{name:'Send WhatsApp',exact:true}).count(),0);
   await contactDialog.getByRole('button',{name:'Send email',exact:true}).click();
   await f.page.getByLabel('email invitation send preview').waitFor();
   const emailPanel=f.page.locator('.acq-email');
   await emailPanel.getByLabel('I reviewed the recipient and message. Send this one message.').check();
   await emailPanel.getByRole('button',{name:'Send email',exact:true}).click();
   await emailPanel.getByText('Invite to Teyza · queued',{exact:true}).waitFor();
   assert(f.calls.some(c=>c.action==='ops_acquisition_send'));
   await f.page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await f.page.getByRole('button',{name:'Saved contacts',exact:true}).click();
   const lookup=f.page.getByRole('dialog');await lookup.getByLabel('Town, township or business name').fill('Durban');
   assert.equal(await lookup.getByText('Synthetic Spaza',{exact:true}).count(),0);
   await lookup.getByLabel('Contact channel filter').selectOption('all');
   await lookup.getByText('Synthetic Spaza',{exact:true}).waitFor();assert(await lookup.getByRole('button',{name:'Send email',exact:true}).isDisabled());
   await lookup.getByLabel('Town, township or business name').fill('Johannesburg');assert.equal(await lookup.getByText('Synthetic Spaza',{exact:true}).count(),0);
   await lookup.getByLabel('Town, township or business name').fill('Umlazi');await lookup.getByText('Synthetic Spaza',{exact:true}).waitFor();
   await lookup.locator('.acq-contact-row').filter({hasText:'Synthetic Spaza'}).getByRole('button',{name:'Open record',exact:true}).click();await f.page.getByRole('heading',{name:'Business: Synthetic Spaza'}).waitFor();
   await f.page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await f.page.getByRole('button',{name:'Registered businesses',exact:true}).click();
   assert.equal(await f.page.getByRole('dialog').count(),0);
   assert(f.calls.some(c=>c.action==='ops_acquisition_create'&&c.data.city==='Durban'&&c.data.authorisedSource===true));
   await f.page.setViewportSize({width:393,height:852});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('National Command Centre withholds partial totals, forwards filters and separates paid advertising from complimentary access',async()=>{
   const stamp=Date.now()-1000;let releaseSecond,failSecond=true;
   const gate=new Promise(resolve=>{releaseSecond=resolve;});
   const base={city:'Durban',province:'KwaZulu-Natal',municipality:'eThekwini',area:'Umlazi',category:'spaza',stage:'identified',permissions:{},optedOut:false,revision:0,geographyNeedsReview:true,assignedTo:'reviewerA'};
   const fresh={...base,id:'p001',name:'Synthetic WhatsApp only',phone:'+27712345678',phoneKind:'whatsapp_only',email:'',permissions:{whatsapp:{granted:true}},workQueues:['new_contact','ready_to_contact']};
   const missing={...base,id:'p031',name:'Synthetic field visit',phone:'',email:'',workQueues:['field_visit'],contactNote:'No phone number or email recorded'};
   const historic={...base,id:'p032',name:'Synthetic already contacted',phone:'+27712345679',contactedAt:stamp-1000,outreachState:'staff_confirmed',workQueues:['awaiting_response']};
   const paying={...base,id:'p033',name:'Synthetic paid advertiser',stage:'registered',seller:{status:'approved',approved:true,sellingAccess:true,paidMembership:true,activePaidAdvertising:true,activePaidCampaigns:2},workQueues:['paying']};
   const free={...base,id:'p034',name:'Synthetic complimentary seller',stage:'registered',seller:{status:'approved',approved:true,sellingAccess:true,paidMembership:false,activePaidAdvertising:false,unpaidCampaigns:1},workQueues:['approved','advertising_opportunity']};
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='ops_acquisition_list'){await route.fulfill({json:{ok:true,schema:1,prospects:[],next:null,communications:{}}});return true;}
    if(body.action!=='ops_acquisition_command_page')return false;
    const d=body.data,filter=d.filters;
    if(filter.province){
     assert.equal(filter.province,'KwaZulu-Natal');assert.equal(filter.municipality,'eThekwini');assert.equal(filter.township,'Umlazi');assert.equal(filter.category,'spaza');assert.equal(filter.assignedTo,'reviewerA');
     const rows=filter.queue==='field_visit'?[missing]:filter.queue==='paying'?[paying]:filter.queue==='approved'?[paying,free]:[];
     await route.fulfill({json:await syntheticCommandPage(body,{asOf:stamp,scanned:4,prospects:rows,funnel:{discovered:4,contacted:1,staffConfirmedContact:1,registered:2,approved:2,paidSellers:1,activeAdvertisers:1,activePaidCampaigns:2,payingBusinesses:1,sellingAccessNotPaid:1},queues:{field_visit:1,awaiting_response:1,paying:1,approved:2}})});return true;
    }
    if(!d.after){
     assert.equal(filter.queue,'new_contact');assert.equal(d.includeRows,true);
     await route.fulfill({json:await syntheticCommandPage(body,{asOf:stamp,scanned:30,prospects:[fresh],funnel:{discovered:30,contactable:1,readyToContact:1},queues:{new_contact:1,ready_to_contact:1},next:'p030'})});return true;
    }
    assert.equal(d.asOf,stamp);assert.equal(d.after,'p030');
    if(!d.includeRows){
     await gate;
     if(failSecond){failSecond=false;await route.fulfill({status:503,json:{error:'Synthetic report page unavailable'}});return true;}
    }
    await route.fulfill({json:await syntheticCommandPage(body,{asOf:stamp,scanned:4,prospects:[],funnel:{discovered:4,contacted:1,staffConfirmedContact:1,registered:2,approved:2,paidSellers:1,activeAdvertisers:1,activePaidCampaigns:2,payingBusinesses:1,sellingAccessNotPaid:1},queues:{field_visit:1,awaiting_response:1,paying:1,approved:2}})});return true;
   }});
   const page=f.page;
   await page.getByRole('button',{name:'Business acquisition',exact:true}).click();
   const metric=k=>page.locator('[data-metric="'+k+'"] strong'),status=page.locator('[data-national-report-status]');
   await page.getByText('Synthetic WhatsApp only',{exact:true}).waitFor();
   assert.equal(await metric('discovered').innerText(),'—');
   assert.equal(await page.locator('[data-commercial="both"] strong').innerText(),'—');
   assert.match(await status.innerText(),/Calculating complete totals/);
   releaseSecond();await page.getByText(/Report incomplete — no totals are available/).waitFor();
   assert.equal(await metric('discovered').innerText(),'—');
   await page.getByRole('button',{name:'Continue incomplete report'}).click();
   await page.getByText(/Complete snapshot.*34 records inspected/).waitFor();
   assert.equal(await metric('discovered').innerText(),'34');await page.getByText('More conversion and revenue insights',{exact:true}).click();assert.equal(await metric('paidSellers').innerText(),'1');assert.equal(await metric('activePaidCampaigns').innerText(),'2');assert.equal(await metric('payingBusinesses').innerText(),'1');
   assert.equal(await page.locator('[data-commercial="both"] strong').innerText(),'1');
   assert.equal(await page.locator('[data-commercial="payingShare"] strong').innerText(),'50.0%');
   assert.equal(await page.locator('[data-commercial="approvedNotPaying"] strong').innerText(),'1');
   await page.getByLabel('Filter province').selectOption('KwaZulu-Natal');
   await page.getByLabel('Assigned reviewer UID (exact)').fill('reviewerA');
   await page.getByLabel('Municipality name (exact)').fill('eThekwini');
   await page.getByLabel('Township / area name (exact)').fill('Umlazi');
   await page.getByLabel('Filter business type').selectOption('spaza');
   await page.getByLabel('Filter work queue').selectOption('field_visit');
   await page.getByRole('button',{name:"Today's work",exact:true}).click();
   await page.getByRole('dialog').getByRole('button',{name:/No phone or email — field visits/}).click();
   await page.getByText('Synthetic field visit',{exact:true}).waitFor();assert.equal(await page.locator('[data-prospect-id="p001"]').count(),0);
   await page.locator('[data-metric="approved"]').click();
   await page.getByText('Synthetic complimentary seller',{exact:true}).waitFor();
   assert(await page.locator('[data-prospect-id="p034"]').getByText('Selling access — not verified paid').isVisible());
   assert(await page.locator('[data-prospect-id="p033"]').getByText('Verified paid advertising · 2 active campaign(s)',{exact:true}).isVisible());
   await page.locator('[data-metric="payingBusinesses"]').click();
   await page.getByText('Synthetic paid advertiser',{exact:true}).waitFor();assert.equal(await page.locator('[data-prospect-id="p034"]').count(),0);
   assert(!f.calls.some(x=>['ops_acquisition_send','ops_acquisition_create','ops_acquisition_event','ops_acquisition_link'].includes(x.action)));
   await page.setViewportSize({width:393,height:852});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Guided manual WhatsApp separates chat opening from sending and waits for email acceptance',async()=>{
   const stamp=Date.now()-1000,base={id:'manual-guided',name:'Synthetic Guided Business',city:'Durban',province:'KwaZulu-Natal',area:'Umlazi',category:'spaza',stage:'identified',phone:'+27712345678',email:'synthetic@example.test',permissions:{whatsapp:{granted:true},email:{granted:true}},revision:0,optedOut:false};
   let prospect={...base},prepares=0,events=0;const draftText='Synthetic permitted introduction 🌱\n\nExample & Sons + 100%';
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='ops_acquisition_list'){await route.fulfill({json:{ok:true,schema:1,prospects:[prospect],next:null,communications:{email:{invitation:true}}}});return true;}
    if(body.action==='ops_acquisition_command_page'){await route.fulfill({json:await syntheticCommandPage(body,{asOf:stamp,scanned:1,prospects:[prospect],funnel:{discovered:1},queues:{new_contact:1}})});return true;}
    if(body.action==='ops_acquisition_detail'){await route.fulfill({json:{ok:true,prospect,events:[]}});return true;}
    if(body.action==='ops_acquisition_manual_whatsapp'){prepares++;assert.equal(body.data.sender,'+27712345679');assert.equal(body.data.purpose,'introduction');await route.fulfill({json:{ok:true,draft:{purpose:'introduction',sender:body.data.sender,recipient:prospect.phone,text:draftText}}});return true;}
    if(body.action==='ops_acquisition_event'){
     events++;const d=body.data;assert.equal(d.purpose,'introduction');assert.equal(d.sender,'+27712345679');
     if(d.type==='manual_whatsapp_opened')prospect={...prospect,manualWhatsApp:{introduction:{purpose:'introduction',sender:d.sender,openedAt:stamp}},revision:prospect.revision+1};
     else{assert.equal(d.type,'manual_whatsapp_sent');assert.equal(d.sentConfirmed,true);prospect={...prospect,contactedAt:stamp,lastWhatsAppContactAt:stamp,manualWhatsApp:{introduction:{...prospect.manualWhatsApp.introduction,sentAt:stamp}},revision:prospect.revision+1};}
     await route.fulfill({json:{ok:true,prospect}});return true;
    }
    return false;
   }});
   const page=f.page;await page.getByRole('button',{name:'Business acquisition',exact:true}).click();
   await page.locator('[data-prospect-id="manual-guided"]').getByRole('button',{name:'Open record',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:'Introduce Teyza on WhatsApp',exact:true}).waitFor();
   async function prepare(){
    await dialog.getByLabel('Separate Teyza WhatsApp Business sender').fill('+27712345679');
    await dialog.getByLabel('I will use this account and the owner agreed to WhatsApp contact.').check();
    await dialog.getByRole('button',{name:'Prepare manual WhatsApp',exact:true}).click();
    await dialog.getByLabel('Verified manual WhatsApp preview').waitFor();
    assert.equal(await dialog.getByLabel('Verified manual WhatsApp preview').inputValue(),draftText);
    assert(await dialog.getByRole('button',{name:'Open WhatsApp app — prefilled message'}).isVisible());
   }
   assert.equal(await dialog.locator('[data-benefits-category]').count(),0);
   const preArt=dialog.locator('[data-preview-category="spaza"]'),preImage=preArt.getByRole('img');await preImage.waitFor();assert.equal(await preImage.getAttribute('src'),'/assets/admin-benefits/teyza-benefits-spaza-v1.png');await preImage.scrollIntoViewIfNeeded();await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-preview-category="spaza"][open] img')).some(i=>i.complete&&i.naturalWidth===1080&&i.naturalHeight===1350));
   await prepare();assert.equal(events,0);
   const listBefore=f.calls.filter(c=>c.action==='ops_acquisition_list').length;
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert(await page.evaluate(()=>document.documentElement.classList.contains('acq-session-paused')));
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
   await page.waitForFunction(()=>!document.documentElement.classList.contains('acq-session-paused'));
   assert.equal(await dialog.getByLabel('Verified manual WhatsApp preview').inputValue(),draftText);
   assert.equal(f.calls.filter(c=>c.action==='ops_acquisition_list').length,listBefore);assert.equal(prepares,1);
   await page.evaluate(()=>delete document.hidden);
   const art=dialog.locator('[data-benefits-category="spaza"]');
   await art.waitFor();
   const poster=art.getByRole('img',{name:'Spaza shop benefits picture — Teyza benefits'});
   await poster.waitFor();
   await page.waitForFunction(()=>{const i=document.querySelector('[data-benefits-category="spaza"] img');return i?.complete&&i.naturalWidth===1080&&i.naturalHeight===1350;});
   assert.equal(await poster.getAttribute('src'),'/assets/admin-benefits/teyza-benefits-spaza-v1.png');
   const download=art.getByRole('link',{name:'Download benefits picture',exact:true});assert.equal(await download.getAttribute('href'),'/assets/admin-benefits/teyza-benefits-spaza-v1.png');assert.notEqual(await download.getAttribute('download'),null);
   await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{const blob=await items[0].getType('image/png');window.__benefitsCopy={size:blob.size,type:blob.type};}}});});
   await art.getByRole('button',{name:'Copy benefits picture',exact:true}).click();
   await art.getByText(/Picture copied\. Paste it into WhatsApp/).waitFor();
   assert.deepEqual(await page.evaluate(()=>window.__benefitsCopy),{size:647472,type:'image/png'});assert.equal(prepares,2);assert.equal(events,0);
   await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{const blob=await items[0].getType('text/plain');window.__reviewedText=await blob.text();}}});});
   await dialog.getByRole('button',{name:'Copy reviewed message',exact:true}).click();
   await dialog.getByText(/Message copied\. Paste it in WhatsApp/).waitFor();
   assert.equal(await page.evaluate(()=>window.__reviewedText),draftText);assert.equal(prepares,3);
   const downloadEvent=page.waitForEvent('download');await dialog.getByRole('button',{name:'Copy message & download picture',exact:true}).click();const downloaded=await downloadEvent;assert.equal(downloaded.suggestedFilename(),'teyza-benefits-spaza-v1.png');assert.deepEqual(fs.readFileSync(await downloaded.path()),fs.readFileSync(path.join(root,'assets/admin-benefits/teyza-benefits-spaza-v1.png')));await dialog.getByText(/paste the reviewed text as its caption/).waitFor();assert.equal(prepares,4);assert.equal(events,0);
   await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
   await art.getByRole('button',{name:'Copy benefits picture',exact:true}).click();
   await art.getByText(/Image clipboard is unavailable/).waitFor();assert.equal(prepares,4);assert.equal(events,0);
   // Intercept the popup before navigation. No real WhatsApp traffic or send.
   await f.context.route('https://web.whatsapp.com/send?*',route=>route.fulfill({contentType:'text/html',body:'<html><title>Synthetic WhatsApp</title></html>'}));
   const opened=f.context.waitForEvent('page');
   await dialog.getByRole('button',{name:'Open WhatsApp Web — prefilled message'}).click();
   const popup=await opened;await popup.waitForURL('https://web.whatsapp.com/send?*');
   const url=new URL(popup.url());assert.equal(url.searchParams.get('phone'),'27712345678');assert.equal(url.searchParams.get('text'),draftText);assert(url.href.includes('%20'));
   await popup.close();assert.equal(prepares,5);assert.equal(events,0);
   await f.context.route('https://wa.me/**',route=>route.fulfill({contentType:'text/html',body:'<html><title>Synthetic app handoff</title></html>'}));
   const appOpened=f.context.waitForEvent('page');
   await dialog.getByRole('button',{name:'Open WhatsApp app — prefilled message'}).click();
   const appPopup=await appOpened;await appPopup.waitForURL('https://wa.me/**');
   const appUrl=new URL(appPopup.url());assert.equal(appUrl.pathname,'/27712345678');assert.equal(appUrl.searchParams.get('text'),draftText);assert(appUrl.href.includes('%20'));
   await appPopup.close();assert.equal(prepares,6);assert.equal(events,0);
   await dialog.getByRole('button',{name:'Record chat opened only'}).click();
   await dialog.getByText(/introduction · opened .* · sent Not recorded/).waitFor();assert.equal(events,1);assert(!prospect.contactedAt);
   await prepare();await dialog.getByLabel('I verified the actual message was sent from the separate business number.').check();await dialog.getByRole('button',{name:'Record actual WhatsApp send'}).click();
   await dialog.getByRole('heading',{name:'Record actual owner response',exact:true}).waitFor();
   assert.equal(prepares,7);assert.equal(events,2);assert(!f.calls.some(c=>c.action==='ops_acquisition_send'));
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('National materialized summary opens a fresh live record, never authorizes a contact from cached evidence',async()=>{
   const stamp=Date.now()-1000,gen='00000000-0000-0000-0000-000000000001';
   const cached={id:'cached1',name:'Synthetic cached prospect',city:'Durban',province:'KwaZulu-Natal',municipality:'eThekwini',area:'Umlazi',category:'spaza',stage:'identified',contactNote:'Contact details recorded',snapshotOnly:true,optedOut:false};
   const live={...cached,snapshotOnly:false,email:'synthetic@example.test',phone:'',permissions:{email:{granted:true}},optedOut:true,revision:1};
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='ops_acquisition_list'){await route.fulfill({json:{ok:true,schema:1,prospects:[],next:null,communications:{}}});return true;}
    if(body.action==='ops_acquisition_detail'){assert.equal(body.data.id,cached.id);await route.fulfill({json:{ok:true,prospect:live,events:[]}});return true;}
    if(body.action==='ops_acquisition_command_page'){
     const p=await syntheticCommandPage(body,{asOf:stamp,scanned:1,prospects:[cached],funnel:{discovered:1},queues:{new_contact:1}});
     if(body.data.preferSummary){delete p.schema;delete p.complete;Object.assign(p,{summarySchema:1,summaryGeneration:gen,completedAt:stamp+500});}
     await route.fulfill({json:p});return true;
    }
    return false;
   }});
   const page=f.page;await page.getByRole('button',{name:'Business acquisition',exact:true}).click();
   await page.getByText(/Reconciled reporting summary/).waitFor();
   const row=page.locator('[data-prospect-id="cached1"]');
   assert.equal(await row.getByRole('button',{name:'Send email',exact:true}).count(),0);
   assert.equal(await row.getByRole('button',{name:'Check WhatsApp',exact:true}).count(),0);
   await row.getByRole('button',{name:'Open live record',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   assert(await dialog.getByText('DO NOT CONTACT',{exact:true}).first().isVisible());
   assert.equal(await dialog.locator('[data-benefits-category]').count(),0);
   assert(f.calls.some(c=>c.action==='ops_acquisition_detail'&&c.data.id===cached.id));
   assert(!f.calls.some(c=>c.action==='ops_acquisition_send'));
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Admin R90 rewards require fresh eligibility and explicit approval, never a payment',async()=>{
   let credited=false;
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='agent_admin_reward_status'){
     assert.equal(body.data.visitId,'visit-test');
     await route.fulfill({json:{ok:true,state:credited?'approved_pending_payment':'eligible',amountCents:9000,currency:'ZAR',
       reason:credited?'Awaiting payment.':'New verified registration confirmed.'}});return true;
    }
    if(body.action==='agent_admin_reward_approve'){
     assert.equal(body.data.visitId,'visit-test');assert.equal(credited,false);
     credited=true;await route.fulfill({json:{ok:true,approved:true,amountCents:9000,status:'approved_pending_payment'}});return true;
    }
    return false;
   }});
   await f.page.getByRole('button',{name:'Agents & field team',exact:true}).click();
   await f.page.getByRole('button',{name:'R90 rewards',exact:true}).click();
   await f.page.getByRole('button',{name:'Review R90 reward',exact:true}).click();
   assert.equal(await f.page.getByRole('button',{name:'Approve R90 reward',exact:true}).count(),0);
   await f.page.getByRole('button',{name:'Check reward eligibility',exact:true}).click();
   const approve=f.page.getByRole('button',{name:'Approve R90 reward',exact:true});
   await approve.waitFor();assert(await approve.isDisabled());
   await f.page.screenshot({path:path.join(output,'admin-r90-rewards-desktop.png'),fullPage:true});
   await f.page.locator('.field-reward-result input[type=checkbox]').check();
   await approve.click();
   await f.page.getByText('R90.00 approved — awaiting payment',{exact:true}).waitFor();
   assert.equal(await approve.count(),0);
   await f.page.getByRole('button',{name:'Check reward eligibility',exact:true}).click();
   await f.page.getByText('R90.00 approved — awaiting payment',{exact:true}).waitFor();
   assert.equal(f.calls.filter(c=>c.action==='agent_admin_reward_approve').length,1);
   assert(!f.calls.some(c=>c.action==='agent_admin_commission_paid'));
   await f.page.setViewportSize({width:393,height:852});
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await f.page.screenshot({path:path.join(output,'admin-r90-rewards-phone.png'),fullPage:true});
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('HR can upload an ID/passport and CV for an existing account',async()=>{
   const f=await pageFor();await f.page.getByRole('button',{name:'Agents & field team',exact:true}).click();
   await f.page.getByRole('button',{name:'Upload ID / passport & CV'}).click();
   const form=f.page.locator('.field-upload-form');
   await form.locator('select').selectOption('passport');
   await form.locator('input[type=text]').fill('P98765432');
   await form.locator('input[accept*="png"]').setInputFiles({name:'identity.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(130,12)])});
   await form.locator('input[accept=".pdf,application/pdf"]').setInputFiles({name:'cv.pdf',mimeType:'application/pdf',buffer:Buffer.concat([Buffer.from('%PDF-1.4\\n'),Buffer.alloc(150,12)])});
   await form.locator('input[type=checkbox]').check();
   await form.getByRole('button',{name:'Save private documents'}).click();
   await f.page.getByText('Recruitment documents saved securely.',{exact:false}).waitFor();
   const upload=f.calls.find(x=>x.action==='agent_admin_application_upload');
   assert(upload,'Admin upload must invoke secured backend action');
   assert.equal(upload.data.agentUid,'legacy3');
   assert.equal(upload.data.identityType,'passport');
   assert.equal(upload.data.identityNumber,'P98765432');
   assert.equal(upload.data.applicantPermissionConfirmed,true);
   assert(upload.data.identityFile.base64.length>60);
   assert(upload.data.cvFile.base64.length>60);
   assert(!f.page.url().includes('work.html'));
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Failed HR document uploads show an actionable inline error without losing selected files',async()=>{
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='agent_admin_application_upload'){
     await route.fulfill({status:422,json:{error:'The uploaded PDF is not a valid recruitment document.'}});
     return true;
    }
    return false;
   }});
   await f.page.getByRole('button',{name:'Agents & field team',exact:true}).click();
   await f.page.getByRole('button',{name:'Upload ID / passport & CV'}).click();
   const form=f.page.locator('.field-upload-form');
   await form.locator('select').selectOption('passport');
   await form.locator('input[type=text]').fill('P98765432');
   await form.locator('input[accept*="png"]').setInputFiles({name:'identity.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(130,12)])});
   await form.locator('input[accept=".pdf,application/pdf"]').setInputFiles({name:'cv.pdf',mimeType:'application/pdf',buffer:Buffer.concat([Buffer.from('%PDF-1.4\\n'),Buffer.alloc(150,12)])});
   await form.locator('input[type=checkbox]').check();
   await form.getByRole('button',{name:'Save private documents'}).click();
   await form.locator('.field-upload-feedback.error').getByText('The uploaded PDF is not a valid recruitment document.',{exact:false}).waitFor();
   assert(await form.locator('input[accept*="png"]').evaluate(input=>input.files.length===1));
   assert(await form.locator('input[accept=".pdf,application/pdf"]').evaluate(input=>input.files.length===1));
   assert(await form.getByRole('button',{name:'Save private documents'}).isEnabled());
   assert.equal(await f.page.locator('.field-upload-form').count(),1);
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Operations overview, billing statement, support and finance workspaces render without browser errors',async()=>{
   const f=await pageFor();await f.page.getByRole('button',{name:'Operations overview',exact:true}).click();await f.page.getByText('Your operations, at a glance.').waitFor();
   await f.page.getByRole('button',{name:'Finance & payments',exact:true}).click();await f.page.getByRole('button',{name:'Open account'}).first().click();await f.page.getByText('Paystack seller membership',{exact:true}).waitFor();
   assert.equal(await f.page.getByText('Seller products',{exact:true}).count(),0,'Finance keeps catalogue controls separate');
    await f.page.getByRole('button',{name:'Shop & selling',exact:true}).click();
    await f.page.getByText('Seller products',{exact:true}).waitFor();
    await f.page.getByRole('button',{name:'Finance',exact:true}).click();
   assert.equal(await f.page.getByText('Create R99 invoice').count(),0,'Legacy invoice form is removed');
   assert.equal(await f.page.getByText('Record payment',{exact:true}).count(),0,'Manual receipts are removed');
   assert.equal(await f.page.getByRole('button',{name:'Approve submitted product catalogue'}).count(),0);
   assert(await f.page.getByRole('button',{name:'Print historical statement',exact:true}).isVisible());
   await f.page.screenshot({path:path.join(output,'admin-finance-desktop.png'),fullPage:true});
   const account=f.page.locator('[data-seller-account]');await account.waitFor();await f.page.waitForFunction(()=>{const r=document.querySelector('[data-seller-account]')?.getBoundingClientRect();return r&&r.top>=-1&&r.top<innerHeight;});assert.equal(await f.page.getByRole('button',{name:'Open account',exact:true}).count(),0);
   await f.page.getByRole('button',{name:'← Back to seller directory',exact:true}).click();await f.page.getByRole('button',{name:'Open account'}).first().waitFor();
   assert.equal(await f.page.getByRole('button',{name:'Product approvals',exact:true}).count(),0);
   await f.page.getByRole('button',{name:'Support inbox',exact:true}).click();
   await f.page.locator('.ops-chat-workspace').waitFor();
   await f.page.locator('.ops-support-cases > summary').click();
   await f.page.getByText('Log an email or telephone request',{exact:true}).waitFor();
   await f.page.getByRole('button',{name:'Stock finance',exact:true}).click();await f.page.getByText('Stock finance review',{exact:true}).waitFor();
   assert.equal(f.errors.length,0,f.errors.join('\n'));await f.context.close();
  });
  await check('Mandates remain visible when the seller directory is down and inbox errors are explicit',async()=>{
    let available=false;
    const row={sellerUid:'seller1',shopName:'Corner Spaza',mandateId:'mandate_inbox_qa',
      bankName:'FNB',accountLast4:'8901',status:'pending_provider_authentication'};
    const f=await pageFor({api:async(route,body)=>{
      if(body.action==='ops_sellers'){
        await route.fulfill({status:503,json:{ok:false,error:'Seller directory offline'}});return true;
      }
      if(body.action==='ops_mandate_queue'){
        if(available)await route.fulfill({json:{ok:true,mandates:[row],limited:false}});
        else await route.fulfill({status:503,json:{ok:false,error:'Mandate inbox offline'}});
        return true;
      }
      return false;
    }});
    await f.page.getByRole('button',{name:'Finance & payments',exact:true}).click();
    await f.page.locator('.ops-legacy-archive > summary').click();
    await f.page.getByText(/Unable to load mandates: Mandate inbox offline/).waitFor();
    available=true;
    await f.page.getByRole('button',{name:'Refresh mandates'}).click();
    await f.page.getByText('•••• 8901').waitFor();
    assert(await f.page.getByRole('button',{name:'Open mandate'}).isVisible());
    assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Historic Netcash mandates remain visible without approval or provider collection actions',async()=>{
    const mandate={sellerUid:'seller1',shopName:'Corner Spaza',mandateId:'mandate_grant_qa',
      bankName:'FNB',branchCode:'250655',accountLast4:'8901',
      firstDate:'2026-12-01',collectionDay:1,amountCents:9900,
      acceptedAt:Date.UTC(2026,10,8),status:'pending_provider_authentication'};
    const f=await pageFor({api:async(route,body)=>{
      if(body.action==='ops_mandate_queue'){
        await route.fulfill({json:{ok:true,mandates:[mandate]}});return true;
      }
      return false;
    }});
    await f.page.getByRole('button',{name:'Finance & payments',exact:true}).click();
    await f.page.locator('.ops-legacy-archive > summary').click();
    await f.page.getByRole('button',{name:'Open mandate'}).click();
    await f.page.getByText('This Netcash record is retained for audit only.',{exact:false}).waitFor();
    for(const name of ['Save mandate review','Record provider submission',
      'Confirm provider acceptance and 30-day access'])
      assert.equal(await f.page.getByRole('button',{name,exact:true}).count(),0);
    assert(!f.calls.some(x=>['ops_mandate_review','ops_mandate_record_netcash_submission',
      'ops_mandate_provider_confirm','billing_checkout'].includes(x.action)));
    assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Admin can confirm publishing eligible saved retail stock without recording a payment',async()=>{
    let published=false;
    const f=await pageFor({api:async(route,body)=>{
      if(body.action==='ops_seller_detail'){
        await route.fulfill({json:{ok:true,seller:{...rows[0],approvalStatus:'approved',listingPlan:'free'},
          sellingStatus:{sellerApproved:true,shopSetupComplete:true,
            sellingAccessActive:true,canSell:true,shopStatus:'active',
            savedDraftCount:3,publicProductCount:published?3:0,
            publicProductsAllowed:true},
          billing:{status:'not_started'},paystackMode:'test',membershipPaid:false,
          complimentaryAccess:true,complimentaryUntil:1793990000000,
          payments:[],entries:[],verification:{status:'approved',phoneVerified:true},
          catalogue:{status:'active',products:[]},documents:{}}});return true;
      }
      if(body.action==='ops_catalogue_publish'){
        published=true;
        await route.fulfill({json:{ok:true,published:true,
          publicProductCount:3,noPaymentRecorded:true}});return true;
      }
      return false;
    }});
    await f.page.getByRole('button',{name:'Business accounts',exact:true}).click();
    await f.page.getByRole('button',{name:'Open account'}).first().click();
    await f.page.getByRole('button',{name:'Shop & selling',exact:true}).click();
    await f.page.getByText('Saved seller products: 3 · Live-priced products: 0').waitFor();
    await f.page.getByText('This business has saved products and valid selling access, but no public products.',{exact:false}).waitFor();
    await f.page.getByLabel('Reason to repair the seller catalogue sync').fill(
      'Confirmed three approved seller drafts for a live local shop');
    await f.page.getByRole('checkbox',{name:/I checked the shop approval and selling entitlement/}).check();
    await f.page.getByRole('button',{name:'Repair saved-product sync'}).click();
    await f.page.getByText('Saved seller products: 3 · Live-priced products: 3').waitFor();
    assert(published);
    assert(f.calls.some(x=>x.action==='ops_catalogue_publish'&&x.data.confirmed===true&&
      x.data.sellerUid==='seller1'));
    assert(!f.calls.some(x=>x.action==='ops_payment'||x.action==='ops_mandate_activate'));
    assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Confidential R99 PDF exports require an audited administrator action',async()=>{
    const reference='mandate_synthetic_1',mandate={
      mandateId:reference,status:'pending_provider_authentication',
      bankName:'FNB',branchCode:'250655',accountLast4:'8901',
      shopAddress:'12 Market Street, Durban',firstDate:'2026-12-01',
      collectionDay:1,amountCents:9900,termsVersion:'teyza-debit-request-v2',
      acceptedAt:Date.UTC(2026,10,6),collectionActive:false,
      terms:'I request a R99 monthly debit order pending bank authentication.'
    };
    const full={ok:true,mandate,sellerUid:'seller1',shopName:'Corner Spaza',
      shopAddress:'12 Market Street, Durban',ownerEmail:'seller@example.test',
      sensitive:{firstName:'Test',surname:'Seller',phone:'+27711234567',
        documentKind:'id',documentNumber:'9001015009087',
        accountHolder:'Test Seller',bankName:'FNB',branchCode:'250655',
        accountNumber:'12345678901',accountType:'current'}};
    const f=await pageFor({api:async(route,body)=>{
      if(body.action==='ops_mandate_queue'){
        await route.fulfill({json:{ok:true,mandates:[{sellerUid:'seller1',...mandate}]}});return true;
      }
      if(['ops_mandate_detail','ops_mandate_export'].includes(body.action)){
        await route.fulfill({json:full});return true;
      }
      return false;
    }});
    await f.page.getByRole('button',{name:'Finance & payments',exact:true}).click();
    await f.page.getByRole('button',{name:'Open account'}).first().click();
    await f.page.getByRole('button',{name:'View private mandate (audited)'}).click();
    await f.page.getByRole('dialog').getByText('Account number: 12345678901').waitFor();
    const event=f.page.waitForEvent('download',{timeout:15000});
    await f.page.getByRole('dialog').getByRole('button',
      {name:'Download historical mandate PDF'}).click();
    const downloaded=await event;
    assert.equal(downloaded.suggestedFilename(),'Teyza_R99_Mandate_Request_'+reference+'.pdf');
    assert(f.calls.some(v=>v.action==='ops_mandate_export'&&v.data.mandateId===reference));
    assert(!f.calls.some(v=>v.action==='billing_checkout'));
    await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await f.page.locator('.ops-mandate-dialog').waitFor({state:'detached'});
    assert(!await f.page.content().then(content=>content.includes('12345678901')));
    await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await f.page.getByRole('heading',{name:'Historic Netcash mandate archive — read-only'}).waitFor();
    assert(!await f.page.content().then(content=>content.includes('12345678901')));
    assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Retired Netcash mandate cannot be submitted or granted fresh access in admin',async()=>{
    const mandate={sellerUid:'seller1',shopName:'Corner Spaza',mandateId:'mandate_manual_qa',
      bankName:'FNB',accountLast4:'8901',firstDate:'2026-12-01',
      acceptedAt:Date.UTC(2026,10,6),status:'reviewed_pending_provider'};
    const f=await pageFor({api:async(route,body)=>{
      if(body.action==='ops_mandate_queue'){
        await route.fulfill({json:{ok:true,mandates:[mandate]}});return true;
      }
      return false;
    }});
    await f.page.getByRole('button',{name:'Finance & payments',exact:true}).click();
    await f.page.locator('.ops-legacy-archive > summary').click();
    await f.page.getByRole('button',{name:'Open mandate'}).click();
    await f.page.getByText('This Netcash record is retained for audit only.',{exact:false}).waitFor();
    assert.equal(await f.page.getByRole('button',{name:'Record provider submission'}).count(),0);
    assert.equal(await f.page.getByRole('button',{name:/Confirm provider acceptance/}).count(),0);
    assert(!f.calls.some(x=>['ops_mandate_record_netcash_submission',
      'ops_mandate_provider_confirm','ops_paystack_confirm'].includes(x.action)));
    assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Signed-out desktop and phone layouts, email login and absolute /admin route',async()=>{
   const f=await pageFor({identity:null});await f.page.locator('#loginPanel').waitFor({state:'visible'});
   await f.page.locator('.admin-wordmark').waitFor();
   await f.page.waitForFunction(()=>document.querySelector('.admin-wordmark')?.naturalWidth>0);
   assert.equal(await f.page.locator('.admin-wordmark').getAttribute('src'),'/assets/teyza-sprout-wordmark.svg');
   await f.page.screenshot({path:path.join(output,'admin-login-desktop.png'),fullPage:true});
   await f.page.setViewportSize({width:393,height:852});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await f.page.screenshot({path:path.join(output,'admin-login-phone.png'),fullPage:true});
   await f.page.locator('#email').fill('reviewer@example.test');await f.page.locator('#password').fill('synthetic-password');await f.page.locator('#loginButton').click();
   await f.page.getByRole('button',{name:'Business accounts',exact:true}).click();
   await f.page.getByRole('button',{name:'Review pending business verifications'}).click();
   await f.page.locator('.seller-row').first().waitFor();assert.equal(await f.page.locator('#password').inputValue(),'');assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Subscriptions shows closure reviews and verifies a processed full refund',async()=>{
   const ref='TZM-0123456789abcdef0123456789';
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='ops_account_deletion_queue'){
     await route.fulfill({json:{ok:true,requests:[{uid:'seller1',reference:'TZ-DEL-TEST',seller:true,
      needsBillingReview:true,paystackCancellationStatus:'needs_attention'}],nextAfter:null}});return true;
    }
    if(body.action==='ops_seller_detail'){
     await route.fulfill({json:{ok:true,seller:{...rows[0],listingPlan:'free'},billing:{status:'closure_review'},
      paystackMode:'test',membershipPaid:false,payments:[{reference:ref,kind:'intro',amountCents:4900,status:'refund_review'}],
      catalogue:{status:'waiting_for_access',products:[]},verification:{status:'pending'},entries:[],documents:{}}});return true;
    }
    return false;
   }});
   await f.page.getByRole('button',{name:'Finance & payments',exact:true}).click();
   await f.page.getByRole('heading',{name:'Account closures and payment review'}).waitFor();
   await f.page.getByText('needs attention',{exact:true}).waitFor();
   await f.page.getByRole('button',{name:'Open seller payment review'}).click();
   f.page.removeAllListeners('dialog');f.page.on('dialog',d=>d.accept('345'));
   await f.page.getByRole('button',{name:'Verify processed refund'}).click();
   await f.page.locator('#notice').getByText('Paystack confirmed the full refund was processed.').waitFor();
   assert.deepEqual(f.calls.find(c=>c.action==='ops_paystack_refund_confirm').data,
    {sellerUid:'seller1',reference:ref,refundId:'345'});
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Current ID and selfie, explicit confirmation and exact backend approval payload',async()=>{
   const f=await pageFor();await f.page.locator('.seller-row').first().click();assert(await f.page.locator('#approveSeller').isDisabled());
   await f.page.locator('#viewIdentity').click();await f.page.locator('#identityState').getByText('Viewed in this review').waitFor();
   assert(await f.page.locator('#approveSeller').isDisabled());
   await f.page.locator('#viewSelfie').click();await f.page.locator('#selfieState').getByText('Viewed in this review').waitFor();
   await f.page.locator('#reviewConfirmed').check();assert(await f.page.locator('#approveSeller').isEnabled());
   await f.page.screenshot({path:path.join(output,'admin-review-desktop.png'),fullPage:true});
   await f.page.setViewportSize({width:393,height:852});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await f.page.screenshot({path:path.join(output,'admin-review-phone.png'),fullPage:true});
   await f.page.locator('#approveSeller').click();await f.page.locator('#notice').getByText('Seller verification approved. Products require an active verified membership or an administrator exception.').waitFor();
   assert.deepEqual(f.calls.find(c=>c.action==='admin_seller_review').data,{sellerUid:'seller1',submissionId:'selfie1',evidenceId:'doc1',status:'approved',reason:''});
   await f.page.locator('.seller-row').filter({hasText:'Corner Spaza'}).waitFor({state:'detached'});assert(await f.page.locator('#identityDetails').isHidden());assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('A Google claim needs explicit review and WhatsApp is reported as queued',async()=>{
   let approved=false;
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='admin_seller_queue'){
     await route.fulfill({json:{ok:true,sellers:approved?[]:[{...rows[0],googlePlaceId:'synthetic-place-id'}],next:null}});
     return true;
    }
    if(body.action==='admin_seller_review'){
     approved=true;
     await route.fulfill({json:{ok:true,status:'approved',whatsappStatus:'queued'}});
     return true;
    }
    return false;
   }});
   await f.page.locator('.seller-row').first().click();
   assert(await f.page.locator('#claimReview').isVisible());
   assert((await f.page.locator('#claimMapLink').getAttribute('href')).includes('synthetic-place-id'));
   await f.page.locator('#viewIdentity').click();await f.page.locator('#identityState').getByText('Viewed in this review').waitFor();
   await f.page.locator('#viewSelfie').click();await f.page.locator('#selfieState').getByText('Viewed in this review').waitFor();
   await f.page.locator('#reviewConfirmed').check();
   assert(await f.page.locator('#approveSeller').isDisabled());
   await f.page.locator('#claimConfirmed').check();
   assert(await f.page.locator('#approveSeller').isEnabled());
   await f.page.locator('#approveSeller').click();
   await f.page.locator('#notice').getByText('Seller verification approved. WhatsApp is queued, subject to provider setup and delivery.').waitFor();
   assert.equal(f.calls.find(c=>c.action==='admin_seller_review').data.claimConfirmed,true);
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('Pagination, retail company label, search and self-review denial',async()=>{
   const f=await pageFor({pagination:true});await f.page.locator('#loadMore').click();await f.page.locator('.seller-row').filter({hasText:'Last Page Shop'}).waitFor();
   assert(f.calls.some(c=>c.action==='admin_seller_queue'&&c.data.after==='retail1'));
   await f.page.locator('#search').fill('Town');assert.equal(await f.page.locator('.seller-row').count(),1);await f.page.locator('.seller-row').click();
   assert.equal(await f.page.locator('#identityLabel').innerText(),'Company registration');
   await f.page.locator('#search').fill('Reviewer');await f.page.locator('.seller-row').click();assert(await f.page.locator('#viewIdentity').isDisabled());assert(await f.page.locator('#rejectSeller').isDisabled());
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  for(const [button,status] of [['requestPhoto','needs_new_photo'],['rejectSeller','rejected']])await check(status+' requires a note and records the chosen outcome',async()=>{
   const f=await pageFor();await f.page.locator('.seller-row').first().click();await f.page.locator('#'+button).click();
   assert(!f.calls.some(c=>c.action==='admin_seller_review'));await f.page.locator('#reason').fill('Please retake the photo in good light.');await f.page.locator('#'+button).click();
   await f.page.locator('#notice').getByText('Review saved. The seller can view your note in the app.').waitFor();assert.equal(f.calls.find(c=>c.action==='admin_seller_review').data.status,status);await f.context.close();
  });
  await check('Normal seller accounts cannot open the admin workspace',async()=>{
   const f=await pageFor({identity:{uid:'seller1',claims:{teyzaAdmin:false}}});await f.page.locator('#notice').getByText(/needs administrator access/).waitFor();
   assert(await f.page.locator('#workspace').isHidden());assert.equal(f.calls.length,0);await f.context.close();
  });
  await check('Five-minute idle logout clears evidence; real activity extends the Admin session',async()=>{
   const f=await pageFor();await f.page.clock.install();await f.page.locator('.seller-row').first().click();await f.page.locator('#viewIdentity').click();await f.page.locator('#identityState').getByText('Viewed in this review').waitFor();
   assert.equal(await f.page.locator('#googleLogin,#sessionTime,#renewSession').count(),0);
   await f.page.clock.fastForward(240000);await f.page.locator('#search').fill('Corner');
    await f.page.waitForTimeout(100);
   await f.page.clock.fastForward(120000);assert(await f.page.locator('#workspace').isVisible());
   assert(f.calls.some(c=>c.action==='admin_session_touch'&&Number.isSafeInteger(c.data.activityId)&&/^[a-f0-9]{64}$/.test(c.adminSession)));
   await f.page.clock.fastForward(181000);await f.page.locator('#loginTitle').getByText('Welcome back').waitFor();
   assert(await f.page.locator('#signOut').isHidden());assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('teyza-admin-idle-v1')),null);
   assert.equal(await f.page.locator('#evidenceImage').getAttribute('src'),null);assert.equal(await f.page.locator('#identityDetails').innerText(),'');
   await f.page.waitForFunction(()=>window.__testIdentity===null);
    assert(f.calls.some(c=>c.action==='admin_session_end'&&/^[a-f0-9]{64}$/.test(c.adminSession)));
    await f.page.locator('#email').fill('reviewer@example.test');await f.page.locator('#password').fill('synthetic-password');await f.page.locator('#loginButton').click();await f.page.locator('[data-admin-view="overview"]').click();await f.page.getByRole('heading',{name:'Your operations, at a glance.'}).waitFor();await f.page.locator('.overview-stat').first().click();await f.page.locator('.seller-row').first().waitFor();assert(await f.page.locator('#workspace').isVisible());await f.context.close();
  });
  await check('Late private evidence never crosses an account change',async()=>{
   let release;const delayed=new Promise(resolve=>release=resolve);let started;
   const ready=new Promise(resolve=>started=resolve);
   const f=await pageFor({api:async(route,body)=>{if(body.action!=='seller_identity_read')return false;started();await delayed;await route.fulfill({json:{ok:true,imageBase64:jpeg,details:{documentNumber:'MUST-NOT-APPEAR'}}});}});
   await f.page.locator('.seller-row').first().click();await f.page.locator('#viewIdentity').click();await ready;
   await f.page.evaluate(()=>window.__setUser({uid:'different',claims:{teyzaAdmin:false}}));release();
   await f.page.locator('#notice').getByText(/needs administrator access/).waitFor();
   assert.equal(await f.page.locator('#evidenceImage').getAttribute('src'),null);assert(!await f.page.content().then(s=>s.includes('MUST-NOT-APPEAR')));await f.context.close();
  });
  await check('A stale server review clears evidence and refreshes the pending queue',async()=>{
   const f=await pageFor({api:async(route,body)=>{if(body.action!=='admin_seller_review')return false;await route.fulfill({status:409,json:{error:'This submission changed. Refresh the review queue.'}});}});
   await f.page.locator('.seller-row').first().click();await f.page.locator('#viewIdentity').click();await f.page.locator('#identityState').getByText('Viewed in this review').waitFor();
   await f.page.locator('#viewSelfie').click();await f.page.locator('#selfieState').getByText('Viewed in this review').waitFor();await f.page.locator('#reviewConfirmed').check();await f.page.locator('#approveSeller').click();
   await f.page.locator('#notice').getByText(/This submission changed/).waitFor();await f.page.locator('#sellerDetail').waitFor({state:'hidden'});
   assert.equal(await f.page.locator('#evidenceImage').getAttribute('src'),null);assert.equal(f.calls.filter(c=>c.action==='admin_seller_queue').length,2);await f.context.close();
  });
  await check('Missing phone OTP and ID show as checklist and allow recorded corrections, never approval',async()=>{
    const incomplete={...rows[0],evidenceId:null,missingCompliance:['identity'], // Simulate old backend omitting phone from the list
      phoneVerificationRequired:true,phoneVerified:false,reviewNote:'',complianceRequestedAt:null};
    const f=await pageFor({api:async(route,body)=>{
      if(body.action==='admin_seller_queue'){
        await route.fulfill({json:{ok:true,sellers:[incomplete],next:null}});
        return true;
      }
      if(body.action==='admin_seller_review'&&body.data.status==='needs_correction'){
        await route.fulfill({json:{ok:true,status:'needs_correction',pendingReview:true}});
        return true;
      }
      return false;
    }});
    await f.page.locator('.seller-row').first().click();
    assert(await f.page.locator('#approveSeller').isDisabled());
    assert.equal(await f.page.locator('#complianceList .compliance-missing').count(),2);
    assert(await f.page.locator('#complianceList').getByText(/SMS verification/).isVisible());
    assert(await f.page.locator('#complianceList').getByText(/Current ID/).isVisible());
    assert(await f.page.locator('#decisionHint').getByText(/Cannot approve/).isVisible());
    assert(await f.page.locator('#sellerComplianceSummary').getByText(/Approval not available:.*SMS verification/).isVisible());
    assert(await f.page.locator('#requestCompliance').isEnabled());
    await f.page.locator('#requestCompliance').click();
    await f.page.locator('#notice').getByText(/Missing requirements recorded/).waitFor();
    const review=f.calls.find(x=>x.action==='admin_seller_review');
    assert.equal(review.data.status,'needs_correction');
    assert(review.data.reason.includes('SMS'));
    assert(!f.calls.some(x=>x.action==='billing_checkout'));
    assert.deepEqual(f.errors,[]);
    await f.context.close();
  });
  await check('Suspended acquisition cannot resume if the existing admin session was revoked',async()=>{
   let revoked=false,revokedChecks=0;
   const f=await pageFor({api:async(route,body)=>{
    if(body.action==='ops_acquisition_list'){await route.fulfill({json:{ok:true,schema:1,prospects:[],next:null,communications:{}}});return true;}
    if(body.action==='ops_acquisition_command_page'){await route.fulfill({json:await syntheticCommandPage(body)});return true;}
    if(body.action==='admin_session_status'&&revoked){revokedChecks++;await route.fulfill({json:{ok:true,active:false}});return true;}
    return false;
   }});
   await f.page.getByRole('button',{name:'Business acquisition',exact:true}).click();
   await f.page.getByRole('button',{name:'+ Find & Add Businesses',exact:true}).click();
   await f.page.getByRole('dialog').waitFor();
   revoked=true;
   await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert(await f.page.evaluate(()=>document.documentElement.classList.contains('acq-session-paused')));
   await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
   await f.page.locator('#loginPanel').waitFor({state:'visible'});
   assert.equal(await f.page.locator('[data-acquisition]').count(),0);assert(await f.page.locator('#workspace').isHidden());
   await f.page.waitForFunction(()=>window.__testIdentity===null);
   assert.equal(revokedChecks,1);assert(f.calls.some(c=>c.action==='admin_session_end'));
   assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('teyza-admin-idle-v1')),null);
   await f.context.close();
  });
  await check('Hiding the tab clears documents, view receipts in the UI and approval confirmation',async()=>{
   const f=await pageFor();await f.page.locator('.seller-row').first().click();await f.page.locator('#viewIdentity').click();await f.page.locator('#identityState').getByText('Viewed in this review').waitFor();
   await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await f.page.locator('#evidenceImage').getAttribute('src'),null);assert(await f.page.locator('#approveSeller').isDisabled());await f.context.close();
  });
  console.log(count+' browser scenarios passed. Internal previews: '+output);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

