'use strict';
// Isolated acceptance tool. The candidate's real Admin UI and acquisition service
// run against the same in-memory DB adapter used by its backend regression tests.
// No Firebase app, credential, provider client, or live Google API is initialized.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const {randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'../../web/teyza-admin/public'),repo=path.resolve(__dirname,'../..');
const output=process.env.TEYZA_ADMIN_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'teyza-growth-preview-'));
const check=process.argv.includes('--check');
const mockSender='+27000000099';
global.fetch=async()=>{throw Error('Network fetch blocked by synthetic acceptance preview');};
const {createAcquisition,actions}=require('../../services/teyza-mobile-v39/business-acquisition');
const {createWorker}=require('../../services/teyza-mobile-v39/business-communications');
class FakeDB {
  constructor(seed={}){this.records=new Map(Object.entries(structuredClone(seed)));this.serial=0;}
  doc(path){const db=this;return {path,id:path.split('/').pop(),get:async()=>db.snapshot(path),
    set:async(value,options)=>db.records.set(path,options?.merge?{...db.records.get(path),...structuredClone(value)}:structuredClone(value)),
    update:async value=>{assert(db.records.has(path));db.records.set(path,{...db.records.get(path),...structuredClone(value)});},
    collection:name=>db.collection(path+'/'+name)};}
  snapshot(path){const data=this.records.get(path);return {exists:data!==undefined,id:path.split('/').pop(),data:()=>structuredClone(data),ref:this.doc(path)};}
  collection(path){const db=this,filters=[];let sort=null,max=Infinity,after=null;const query={
    doc:(value)=>db.doc(path+'/'+(value||'generated'+(++db.serial))),
    where:(...filter)=>{filters.push(filter);return query;},orderBy:(...args)=>{sort=args;return query;},
    startAfter:value=>{after=value;return query;},limit:value=>{max=value;return query;},get:async()=>{
      let rows=[...db.records].filter(([key,value])=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')===-1&&
        filters.every(([field,op,wanted])=>op==='=='?value[field]===wanted:op==='array-contains'?value[field]?.includes(wanted):op==='in'?wanted.includes(value[field]):value[field]<=wanted));
      if(after)rows=rows.filter(([key])=>key.split('/').pop()>after);
      if(sort)rows.sort((a,b)=>(sort[1]==='desc'?-1:1)*(sort[0]==='__name__'?a[0].localeCompare(b[0]):((a[1][sort[0]]||0)-(b[1][sort[0]]||0))));
      const docs=rows.slice(0,max).map(([key])=>db.snapshot(key));return {docs,size:docs.length};
    }};return query;}
  transaction(){const writes=[],db=this;let wrote=false;return {get:async ref=>{assert(!wrote,'Transaction must read before writing');return ref.get();},getAll:async(...refs)=>{assert(!wrote,'Transaction must read before writing');return Promise.all(refs.map(ref=>ref.get()));},
    create:(ref,value)=>{wrote=true;writes.push(async()=>{assert(!db.records.has(ref.path),'Already exists');await ref.set(value);});},set:(ref,value,options)=>{wrote=true;writes.push(()=>ref.set(value,options));},update:(ref,value)=>{wrote=true;writes.push(()=>ref.update(value));},
    commit:async()=>{for(const write of writes)await write();}};}
  async runTransaction(fn){const tx=this.transaction(),result=await fn(tx);await tx.commit();return result;}
  batch(){return this.transaction();}
}

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
const mobile='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
const places='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces';
const now=Date.now()-120000,actor={uid:'admin1',teyzaAdmin:true,email_verified:true,auth_time:Math.floor(Date.now()/1000)};
const db=new FakeDB({'teyzaBusinessCommunicationSettings/control':{emailEnabled:true,whatsappEnabled:false}});
const localities={search:async(province,query)=>({vintage:'SYNTHETIC preview only',localities:province==='KwaZulu-Natal'&&/umlazi/i.test(query)?[{province,municipality:'eThekwini',township:'Umlazi',localityId:'ETH:123456789',geographySource:'DPME-P_Dm_M_Lm_Sp_W_Bound',geographySourceVintage:'municipality-2018; sub-place vintage unspecified'}]:[]}),resolve:async id=>{if(id!=='ETH:123456789')throw Error('Preview locality not found');return (await localities.search('KwaZulu-Natal','Umlazi')).localities[0];}};
const service=createAcquisition({db,clock:Date.now,geographyLookup:localities});
let queued=0,accepted=0;
const worker=createWorker({db,channel:'email',send:async draft=>{
 assert(draft.recipient.endsWith('@example.invalid'),'Only synthetic mail may be accepted');
 accepted++;return String(900000000+accepted);
}});
async function acceptQueued(){
 for(const [key,job] of [...db.records])if(key.startsWith('teyzaBusinessOutboundEmail/')&&job.status==='queued')await worker.process(key.split('/').pop());
 return accepted;
}
const get=id=>db.records.get('teyzaBusinessProspects/'+id);
const patch=(id,values)=>db.records.set('teyzaBusinessProspects/'+id,{...get(id),...values});
const ids={};
async function seed(){
 const templates=[
  ['new','DEMO — Mzansi Corner Spaza','spaza','Umlazi',1,['email','whatsapp']],
  ['permission','DEMO — Community Hair Studio','salon','KwaMashu',2,[]],
  ['field','DEMO — Street-side Market','retail','Inanda',0,[]],
  ['interested','DEMO — Local Food Kitchen','food','Umlazi',3,['email','whatsapp']],
  ['queued','DEMO — Fresh Produce Shop','retail','Umlazi',4,['email','whatsapp']],
  ['welcome','DEMO — Township Grocer','spaza','Umlazi',5,['email','whatsapp']],
  ['pending','DEMO — Community Retail','retail','Umlazi',6,['email','whatsapp']],
  ['paid','DEMO — Local Wholesale','wholesale','Umlazi',7,['email','whatsapp']],
  ['blocked','DEMO — Do Not Contact','service','Umlazi',8,[]]
 ];
 for(const [key,name,category,area,n,channels] of templates){
  const email=n?key+'@example.invalid':'',phone=n?'+2700000000'+n:'';
  const p=(await service.execute(actor,'ops_acquisition_create',{name,category,city:'Durban',province:'KwaZulu-Natal',municipality:'eThekwini',area,address:'DEMO '+key+' Street, '+area,geographyConfirmed:true,phone,email,source:'owner_inquiry',sourceReference:'Synthetic preview only',authorisedSource:true,initialConsentChannels:channels,initialConsentConfirmed:true,initialConsentNote:'Synthetic opt-in — not a real owner'})).prospect;
  ids[key]=p.id;patch(p.id,{createdAt:now,updatedAt:now,lastActivityAt:now,permissions:Object.fromEntries(channels.map(ch=>[ch,{granted:true,recordedAt:now,recordedBy:actor.uid}]))});
 }
 for(const key of ['interested','welcome','pending','paid'])patch(ids[key],{contactedAt:now,response:'interested',responseRecordedAt:now,stage:'registration_started'});
 patch(ids.queued,{outbound:{email_invitation:{status:'queued',requestedAt:now,updatedAt:now}},invitationRequested:true});
 patch(ids.blocked,{optedOut:true,stage:'not_interested'});
 for(const key of ['welcome','pending','paid']){
  const id=ids[key],p=get(id),uid='demo-'+key;
  db.records.set('teyzaSellerAccounts/'+uid,{uid,shopName:p.name,category:p.category,approvalStatus:key==='pending'?'pending':'approved',createdAt:now,approvedAt:key==='pending'?null:now,ownerEmail:p.email,phone:p.phone,listingPlan:'basic'});
  db.records.set('teyzaBusinessProspectSellerLinks/'+uid,{prospectId:id,linkedAt:now,linkedBy:actor.uid});
  patch(id,{sellerUid:uid,downloadConfirmedAt:now});
  if(key==='paid'){
   db.records.set('teyzaBilling/'+uid,{ownerUid:uid,status:'paid',paymentProvider:'paystack',paymentEnvironment:'live',paidUntil:Date.now()+86400000});
  }
 }
 patch(ids.welcome,{outbound:{email_welcome:{status:'accepted',providerId:'900000001',acceptedAt:now,updatedAt:now}}});
 patch(ids.paid,{emailHistory:{welcome:{status:'staff_confirmed_in_zoho_sent',reference:'DEMO ONLY',sentAt:now}},manualWhatsApp:{email_notice_welcome:{purpose:'email_notice_welcome',sentAt:now,sender:mockSender}}});
}
function syntheticContact(data){
 for(const key of ['email','phone','website'])if(data[key]){
  const value=String(data[key]);
  if(key==='email'&&!/^[a-z0-9._+-]+@example\.invalid$/i.test(value))throw Error('Use only an @example.invalid address in the preview.');
  if(key==='phone'&&!/^(?:\+270|00)\d{8}$/.test(value))throw Error('Use only a synthetic +27000000001-style phone in the preview.');
  if(key==='website'&&!/^https:\/\/[a-z0-9.-]+\.invalid\/?$/i.test(value))throw Error('Use only a synthetic .invalid website.');
 }
 if(data.sender&&data.sender!==mockSender)throw Error('Preview sender is '+mockSender+'. Do not enter a real sender.');
}
async function main(){
 fs.mkdirSync(output,{recursive:true});await seed();
 const previewKey=randomBytes(32).toString('hex');
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.json':'application/json','.ico':'image/x-icon'};
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  // Never serve a production-configured asset to an ordinary browser tab.
  // Only the isolated context injects this per-launch header on loopback.
  if(req.headers['x-teyza-preview-session']!==previewKey){
   res.writeHead(403,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});
   res.end('<!doctype html><meta charset="utf-8"><title>Teyza preview — use the isolated window</title><style>body{font:18px system-ui;max-width:700px;margin:12vh auto;padding:24px;color:#064a50}h1{font-size:32px}</style><h1>Open the Teyza preview window</h1><p>This address is protected. Do not paste it into your usual Chrome or Edge browser. Close this tab and use the separate browser window launched by PowerShell.</p><p>All preview business searches are simulated. No live Google Places, Firebase, WhatsApp or Zoho connections are permitted.</p>');return;
  }
  const p=new URL(req.url,'http://local').pathname;
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const file=['/','/admin','/admin/','/admin.html'].includes(p)?path.join(root,'admin.html'):p==='/assets/teyza-sprout-wordmark.svg'?path.join(repo,'assets/teyza-sprout-wordmark.svg'):path.resolve(root,'.'+p);
  if((!file.startsWith(root+path.sep)&&file!==path.join(repo,'assets/teyza-sprout-wordmark.svg'))||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(req.method==='HEAD'?undefined:fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let browser;try{
  browser=await chromium.launch({headless:check,args:['--no-sandbox'],...(process.env.TEYZA_ADMIN_CHROMIUM?{executablePath:process.env.TEYZA_ADMIN_CHROMIUM}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'});
  let blocked=0;const errors=[];
  // Context routing also covers new tabs, redirects and popup handoffs.
  // The only allowed real network destination is the loopback static server.
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===origin)return route.continue({headers:{...route.request().headers(),'x-teyza-preview-session':previewKey}});
   blocked++;
   if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Preview blocked external navigation</title><h1>SIMULATION ONLY</h1><p>No real external website was opened and no message was sent. Close this tab to continue.</p>'});
   return route.abort();
  });
  if(context.routeWebSocket)await context.routeWebSocket('**/*',socket=>socket.close());
  // Verify an unprotected client cannot receive any executable Admin source.
  for(const resource of ['/admin','/js/teyza-business-acquisition.js','/assets/teyza-maps-config.json']){
   const denied=await new Promise((resolve,reject)=>{http.get(origin+resource,res=>{let body='';res.setEncoding('utf8');res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject);});
   assert.equal(denied.status,403);assert(denied.body.includes('Open the Teyza preview window'));
  }
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('__previewAcceptZoho',async()=>acceptQueued());
  await page.addInitScript(()=>{
   window.__testIdentity={uid:'admin1'};sessionStorage.setItem('teyza-admin-idle-v1',JSON.stringify({uid:'admin1',token:'a'.repeat(64),lastActivity:Date.now()}));
   document.addEventListener('DOMContentLoaded',()=>{
    const bar=document.createElement('div');bar.id='synthetic-preview-banner';bar.style.cssText='position:fixed;z-index:2147483647;bottom:0;left:0;right:0;background:#6e3c00;color:white;font:600 13px system-ui;padding:7px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
    bar.append('SYNTHETIC PREVIEW · NO LIVE ACCOUNTS OR SENDS · Sender: +27000000099');
    const btn=document.createElement('button');btn.textContent='Simulate Zoho acceptance';btn.style.cssText='border:1px solid white;background:white;color:#6e3c00;padding:5px 8px;border-radius:5px;cursor:pointer';
    const note=document.createElement('span');btn.onclick=async()=>{btn.disabled=true;try{note.textContent='Mock accepted total: '+await window.__previewAcceptZoho()+'. Refresh send history.';}catch(e){note.textContent=e.message;}finally{btn.disabled=false;}};
    bar.append(btn,note);document.body.append(bar);document.body.style.paddingBottom='42px';document.title='TEYZA SAFE PREVIEW · '+document.title;
    // A native dialog is in the browser top layer; the ordinary banner is
    // behind it. Mark each acquisition dialog so preview mode stays obvious.
    const mark=()=>{
     for(const d of document.querySelectorAll('.acq-dialog-bar')){
      if(d.querySelector('[data-preview-label]'))continue;
      const label=document.createElement('span');label.dataset.previewLabel='true';label.textContent='DEMO ONLY';label.style.cssText='font:700 11px system-ui;background:#f3d59b;color:#6e3c00;border-radius:5px;padding:5px 8px;white-space:nowrap';d.insertBefore(label,d.lastElementChild);
     }
    };mark();new MutationObserver(mark).observe(document.body,{childList:true,subtree:true});
   });
  });
  await page.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().endsWith('firebase-app.js')?'export const getApps=()=>[];export const initializeApp=c=>c;':firebaseAuth}));
  const previewAreas=new Map();let searchCalls=0,contactCalls=0;
  await page.route(mobile,async route=>{
   try{
    const body=route.request().postDataJSON(),action=body.action,d=body.data||{};let result;
    if(actions.has(action)){
     syntheticContact(d);
     if(action==='ops_acquisition_send'&&d.channel!=='email')throw Error('Preview supports simulated email queue only.');
     if(action==='ops_acquisition_link'&&!/^demo-(welcome|pending|paid)$/.test(d.sellerUid||''))throw Error('Use a synthetic linked seller UID only.');
     result=await service.execute(actor,action,d);
     if(action==='ops_acquisition_send')queued++;
    }else if(action==='admin_session_start')result={sessionToken:'b'.repeat(64),idleMs:300000};
    else if(action==='admin_session_status')result={active:true};
    else if(action==='admin_session_touch')result={idleMs:300000};
    else if(action==='admin_session_end')result={signedOut:true};
    else if(action==='ops_map_shops')result={shops:[],next:null};
    else if(action==='admin_seller_queue')result={sellers:[],next:null};
    else if(action==='ops_sellers')result={sellers:[...db.records].filter(([key])=>key.startsWith('teyzaSellerAccounts/')).map(([,v])=>({...v,sellerUid:v.uid})),next:null};
    else if(action==='ops_support_list')result={tickets:[],next:null};
    else if(action==='admin_area_suggest'){
     const query=String(d.query||'').toLowerCase().trim();
     const demoAreas=[
      {area:'KwaMashu K',province:'KwaZulu-Natal',label:'KwaMashu K, KwaMashu, KwaZulu-Natal (demo)',lat:-29.74,lng:30.99,radius:5000},
      {area:'Mthatha',province:'Eastern Cape',label:'Mthatha, Eastern Cape (demo)',lat:-31.59,lng:28.78,radius:5000},
      {area:'Botshabelo',province:'Free State',label:'Botshabelo, Free State (demo)',lat:-29.23,lng:26.72,radius:5000},
      {area:'Mamelodi',province:'Gauteng',label:'Mamelodi, Gauteng (demo)',lat:-25.71,lng:28.36,radius:5000},
      {area:'Seshego',province:'Limpopo',label:'Seshego, Limpopo (demo)',lat:-23.85,lng:29.39,radius:5000},
      {area:'KaNyamazane',province:'Mpumalanga',label:'KaNyamazane, Mpumalanga (demo)',lat:-25.44,lng:31.16,radius:5000},
      {area:'Galeshewe',province:'Northern Cape',label:'Galeshewe, Northern Cape (demo)',lat:-28.72,lng:24.72,radius:5000},
      {area:'Ikageng',province:'North West',label:'Ikageng, North West (demo)',lat:-26.74,lng:27.06,radius:5000},
      {area:'Khayelitsha',province:'Western Cape',label:'Khayelitsha, Western Cape (demo)',lat:-34.04,lng:18.66,radius:5000}
     ];
     result={suggestions:demoAreas.map((a,i)=>({...a,predictionToken:'demo-area-'+i})).filter(a=>a.area.toLowerCase().startsWith(query)).map(a=>{previewAreas.set(a.predictionToken,{...a,source:'Synthetic demonstration'});return {label:a.label,predictionToken:a.predictionToken};})};
    }else if(action==='admin_area_select'){
     const area=previewAreas.get(d.predictionToken);if(!area)throw Error('Choose a displayed demo area.');result={area};
    }
    else throw Object.assign(Error('Action not enabled in synthetic preview: '+action),{status:422});
    await route.fulfill({json:{ok:true,...result}});
   }catch(e){await route.fulfill({status:e.status||422,json:{ok:false,error:e.message}});}
  });
  await page.route(places+'/shopper-discover?*',route=>{
   searchCalls++;
   const u=new URL(route.request().url()),lat=Number(u.searchParams.get('lat')),lon=Number(u.searchParams.get('lon')),type=u.searchParams.get('category');
   const entries=['Corner Store','No Phone Listed','Community Shop','Shoprite DEMO Chain'].map((name,i)=>({placeId:'DemoPlace'+type+i+'123456789',name:'DEMO — '+name,address:'Synthetic listing '+(i+1),latitude:lat+.001*i,longitude:lon,shopCategory:type,...(i===0?{phone:'+27000000011'}:{})}));
   return route.fulfill({json:{ok:true,entries}});
  });
  await page.route(places+'/shopper-place-contact.php?*',route=>{
   contactCalls++;
   const id=new URL(route.request().url()).searchParams.get('placeId');
   return route.fulfill({json:{ok:true,phone:id.includes('1'+'123456789')?'':'+27000000012',websiteUrl:''}});
  });
  // Set no browser Maps key: the optional map is intentionally unavailable.
  await page.goto(origin+'/admin');await page.getByRole('button',{name:'Business acquisition',exact:true}).click();
  const pageStatus=page.locator('[data-national-report-status]');
  await pageStatus.getByText(/Complete snapshot/).waitFor();
  await page.getByLabel('Filter work queue').selectOption('');await page.getByRole('button',{name:'Apply national filters'}).click();
  await page.locator('[data-prospect-id="'+ids.welcome+'"]').waitFor();
  await page.screenshot({path:path.join(output,'01-business-growth-pipeline.png'),fullPage:true});
  console.log('SYNTHETIC BUSINESS GROWTH PREVIEW — use ONLY the browser window opened by this script.');
  console.log('Ordinary Chrome or Edge tabs cannot open this preview. Do not copy the URL.');
  console.log('No live Firebase, Zoho, Meta or Google calls. All state is in memory.');
  console.log('Preview sender '+mockSender+'; use only DEMO records and @example.invalid addresses.');
  if(check){
   const dialog=page.getByRole('dialog');
   await page.getByRole('button',{name:"Today's work",exact:true}).click();
   await dialog.getByRole('heading',{name:"Today's work",exact:true}).waitFor();
   await page.screenshot({path:path.join(output,'02-todays-work.png')});
   await dialog.getByRole('button',{name:'Close',exact:true}).click();
   await page.getByRole('button',{name:'+ Find & Add Businesses',exact:true}).click();
   await dialog.getByLabel('Province',{exact:true}).selectOption('KwaZulu-Natal');
   await dialog.getByLabel('Town or municipality').fill('KwaMashu');
   await dialog.getByRole('button',{name:'Continue to business type'}).click();
   await dialog.getByText('Selected community: KwaMashu, KwaZulu-Natal',{exact:true}).waitFor();
   await page.screenshot({path:path.join(output,'03-discovery-business-type.png')});
   await dialog.getByRole('button',{name:'Search this area'}).click();
   await dialog.getByText('DEMO — Corner Store',{exact:true}).waitFor();
   assert.equal(searchCalls,1);assert.equal(contactCalls,0);
   assert.equal(await dialog.getByText('DEMO — Shoprite DEMO Chain',{exact:true}).count(),0);
   const phoneFilter=dialog.getByLabel('Phone availability',{exact:true});
   await phoneFilter.selectOption('number');
   assert.equal(await dialog.getByText('DEMO — Corner Store',{exact:true}).count(),1);
   assert.equal(await dialog.getByText('DEMO — No Phone Listed',{exact:true}).count(),0);
   await phoneFilter.selectOption('all');
   const noPhone=dialog.locator('.acq-live-result').filter({hasText:'DEMO — No Phone Listed'});
   await noPhone.getByRole('button',{name:'View contact details'}).click();
   await noPhone.getByText('Phone: not listed',{exact:true}).waitFor();
   assert.equal(contactCalls,1);
   await phoneFilter.selectOption('missing');
   await noPhone.waitFor();
   assert.equal(await dialog.getByText('DEMO — Corner Store',{exact:true}).count(),0);
   await phoneFilter.selectOption('all');
   await page.screenshot({path:path.join(output,'04-discovery-results.png')});
   await dialog.getByRole('button',{name:'Close',exact:true}).click();
   // Test the alternative saved-contacts route shown in the user's screenshot.
   await page.getByRole('button',{name:'Saved contacts',exact:true}).click();
   await dialog.getByLabel('Town, township or business name').fill('KwaMashu K');
   await dialog.getByRole('button',{name:'KwaMashu K, KwaMashu, KwaZulu-Natal (demo)',exact:true}).click();
   await dialog.getByRole('button',{name:'Search Google Places',exact:true}).click();
   await dialog.getByText('DEMO — Corner Store',{exact:true}).first().waitFor();
   assert.equal(searchCalls,4); // the existing saved-contact route uses three categories
   await page.screenshot({path:path.join(output,'07-saved-contacts-kwamashu-results.png')});
   await dialog.getByRole('button',{name:'Close',exact:true}).click();
   // Test a non-pilot province using the preview's synthetic location suggestions.
   await page.getByRole('button',{name:'+ Find & Add Businesses',exact:true}).click();
   await dialog.getByLabel('Province',{exact:true}).selectOption('Eastern Cape');
   await dialog.getByLabel('Town or municipality').fill('Mthatha');
   await dialog.getByRole('button',{name:'Mthatha, Eastern Cape (demo)',exact:true}).click();
   await dialog.getByRole('button',{name:'Continue to business type'}).click();
   await dialog.getByText('Selected community: Mthatha, Eastern Cape (demo)',{exact:true}).waitFor();
   await dialog.getByRole('button',{name:'Search this area'}).click();
   await dialog.getByText('DEMO — Corner Store',{exact:true}).waitFor();
   assert.equal(searchCalls,5);
   await dialog.getByRole('button',{name:'Close',exact:true}).click();
   await page.locator('[data-prospect-id="'+ids.welcome+'"]').getByRole('button',{name:'Open record',exact:true}).click();
   await dialog.getByRole('heading',{name:'Notify owner: welcome email sent',exact:true}).waitFor();
   await dialog.getByLabel('Separate Teyza WhatsApp Business sender').fill(mockSender);
   await dialog.getByLabel('I will use this account and the owner agreed to WhatsApp contact.').check();
   await dialog.getByRole('button',{name:'Prepare manual WhatsApp',exact:true}).click();
   await dialog.getByLabel('Verified manual WhatsApp preview').waitFor();
   assert.equal(accepted,0);assert.equal(queued,0);assert.equal(get(ids.welcome).manualWhatsApp,undefined);
   await page.screenshot({path:path.join(output,'05-zoho-welcome-whatsapp-reminder.png')});
   // Real handoff is prevented by the context-level catchall route.
   const popupPromise=page.waitForEvent('popup');
   await dialog.getByRole('link',{name:'Open WhatsApp message'}).click();
   const popup=await popupPromise;await popup.getByRole('heading',{name:'SIMULATION ONLY'}).waitFor();await popup.close();
   assert.equal(get(ids.welcome).manualWhatsApp,undefined);
   await dialog.getByRole('button',{name:'Record chat opened only'}).click();
   await dialog.getByText(/email notice welcome · opened .* · sent Not recorded/).waitFor();
   assert(get(ids.welcome).manualWhatsApp.email_notice_welcome.openedAt);assert(!get(ids.welcome).manualWhatsApp.email_notice_welcome.sentAt);
   await page.setViewportSize({width:393,height:852});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(output,'06-mobile-business-record.png')});
   assert.deepEqual(errors,[]);assert(blocked>0);
   console.log('PASS: ordinary tabs denied; KwaMashu guided search, phone filters, KwaMashu K saved-contact search and Eastern Cape demo; Zoho reminder, blocked handoff and mobile layout.');
   console.log('Screenshots: '+output);
  }else{
   console.log('Review the browser. Close all preview windows to finish. No data persists.');
   await new Promise(resolve=>{browser.on('disconnected',resolve);const closeIfDone=()=>{if(context.pages().length===0)void browser.close();};context.on('page',p=>p.on('close',closeIfDone));page.on('close',closeIfDone);});
  }
 }finally{if(browser?.isConnected())await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
