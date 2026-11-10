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
 getIdToken:async()=>'synthetic-token',getIdTokenResult:async()=>({claims:{teyzaAdmin:true,email_verified:true,auth_time:Math.floor(Date.now()/1000),...value.claims}})};}
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

async function main(){
 const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://local').pathname;
  const file=['/admin','/admin/','/admin.html','/admin-sellers.html'].includes(p)?path.join(root,'admin.html'):
   p==='/assets/teyza-sprout-wordmark.svg'?path.join(repo,p):path.join(root,p);
  if(!file.startsWith(root+path.sep)&&file!==path.join(repo,'/assets/teyza-sprout-wordmark.svg')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 let browser;try{browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.TEYZA_ADMIN_CHROMIUM?{executablePath:process.env.TEYZA_ADMIN_CHROMIUM}:{})});}
 catch(error){server.close();throw error;}let count=0;
 async function pageFor({identity={uid:'admin1'},api,viewport={width:1440,height:1100},pagination=false,startView='approvals'}={}){
  const context=await browser.newContext({viewport}),page=await context.newPage(),calls=[],errors=[];let pending=structuredClone(rows),legacyUploaded=false;
  let syntheticUsers=[{uid:'admin1',email:'reviewer@example.test',displayName:'Reviewer',verified:true,disabled:false,admin:true,providers:['google.com']},
    {uid:'shopper2',email:'shopper@example.test',displayName:'Existing Shopper',verified:false,disabled:false,admin:false,providers:['password']}];
  await page.addInitScript(value=>window.__testIdentity=value,identity);
  await page.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().endsWith('firebase-app.js')?
   'export const getApps=()=>[];export const initializeApp=c=>c;':firebaseAuth}));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',async route=>{
   const body=route.request().postDataJSON();calls.push(body);
   if(api&&await api(route,body)!==false)return;
   let result={ok:true};
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
   if(body.action==='agent_admin_profiles')result={ok:true,profiles:[{uid:'applicant1',name:'Synthetic Applicant',email:'example@test.invalid',phone:'0710000000',province:'KwaZulu-Natal',area:'Durban',status:'pending',revision:0,hasDocuments:true},{uid:'agent2',name:'Synthetic Agent',province:'KwaZulu-Natal',area:'Umlazi',status:'approved',revision:1,hasDocuments:true},{uid:'legacy3',name:'Legacy Missing',province:'KwaZulu-Natal',area:'Pinetown',status:'pending',revision:legacyUploaded?3:2,hasDocuments:legacyUploaded}],next:null};
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
   if(startView==='approvals'){
     await nav.click();
     await page.getByRole('button',{name:'Review pending business verifications'}).click();
   }
  }
  return {context,page,calls,errors};
 }
 async function check(name,fn){await fn();count++;console.log('PASS '+name);}
 try{
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
    assert(order.indexOf('Historic Netcash mandate archive — read-only')<order.indexOf('Choose a business for finance'));
    await f.page.getByRole('button',{name:'Overview',exact:true}).click();
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
    await f.page.getByRole('button',{name:'Send password setup email'}).click();
    assert(f.calls.some(x=>x.action==='ops_user_invite'&&x.data.userUid==='new-user1'));
    await f.page.getByRole('button',{name:'Suspend user'}).click();
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
   const f=await pageFor();await f.page.getByRole('button',{name:'HR & field team',exact:true}).click();
   await f.page.getByRole('heading',{name:'People, applications and neighbourhood coverage'}).waitFor();
   assert(!f.page.url().includes('work.html'));
   await f.page.getByRole('button',{name:'Open ID/passport and CV'}).first().click();
   for(const type of ['ID / passport','CV']){await f.page.getByRole('button',{name:'View '+type}).click();await f.page.locator('#fieldEvidenceDialog').getByRole('button',{name:'Close'}).click();}
   await f.page.getByRole('button',{name:'Approve applicant'}).first().click();
   await f.page.getByText('HR application decision saved.').waitFor();
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
   await f.page.getByRole('button',{name:'Overview',exact:true}).click();await f.page.getByText('Your operations, at a glance.').waitFor();
   assert.deepEqual(f.errors,[]);await f.context.close();
  });
  await check('HR can upload an ID/passport and CV for an existing account',async()=>{
   const f=await pageFor();await f.page.getByRole('button',{name:'HR & field team',exact:true}).click();
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
   await f.page.getByRole('button',{name:'HR & field team',exact:true}).click();
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
   const f=await pageFor();await f.page.getByRole('button',{name:'Overview',exact:true}).click();await f.page.getByText('Your operations, at a glance.').waitFor();
   await f.page.getByRole('button',{name:'Finance & payments',exact:true}).click();await f.page.getByRole('button',{name:'Open account'}).first().click();await f.page.getByText('Paystack seller membership',{exact:true}).waitFor();
   assert.equal(await f.page.getByText('Seller products',{exact:true}).count(),0,'Finance keeps catalogue controls separate');
    await f.page.getByRole('button',{name:'Shop & selling',exact:true}).click();
    await f.page.getByText('Seller products',{exact:true}).waitFor();
    await f.page.getByRole('button',{name:'Finance',exact:true}).click();
   assert.equal(await f.page.getByText('Create R99 invoice').count(),0,'Legacy invoice form is removed');
   assert.equal(await f.page.getByText('Record payment',{exact:true}).count(),0,'Manual receipts are removed');
   assert.equal(await f.page.getByRole('button',{name:'Approve submitted product catalogue'}).count(),0);
   assert(await f.page.getByRole('button',{name:'Print historical statement',exact:true}).isVisible());
   const account=f.page.locator('[data-seller-account]');await account.waitFor();await f.page.waitForFunction(()=>{const r=document.querySelector('[data-seller-account]')?.getBoundingClientRect();return r&&r.top>=-1&&r.top<innerHeight;});assert.equal(await f.page.getByRole('button',{name:'Open account',exact:true}).count(),0);
   await f.page.getByRole('button',{name:'← Back to seller directory',exact:true}).click();await f.page.getByRole('button',{name:'Open account'}).first().waitFor();
   assert.equal(await f.page.getByRole('button',{name:'Product approvals',exact:true}).count(),0);
   await f.page.getByRole('button',{name:'Support',exact:true}).click();await f.page.getByText('Log a received support request',{exact:true}).waitFor();
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
  await check('Expired review session clears private evidence and email reauthentication restores the queue',async()=>{
   const f=await pageFor();await f.page.clock.install();await f.page.locator('.seller-row').first().click();await f.page.locator('#viewIdentity').click();await f.page.locator('#identityState').getByText('Viewed in this review').waitFor();
   await f.page.clock.fastForward(301000);await f.page.locator('#loginTitle').getByText('Renew your review session').waitFor();
   assert.equal(await f.page.locator('#evidenceImage').getAttribute('src'),null);assert.equal(await f.page.locator('#identityDetails').innerText(),'');
   await f.page.locator('#password').fill('synthetic-password');await f.page.locator('#loginButton').click();await f.page.locator('.seller-row').first().waitFor();assert(await f.page.locator('#workspace').isVisible());await f.context.close();
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
  await check('Hiding the tab clears documents, view receipts in the UI and approval confirmation',async()=>{
   const f=await pageFor();await f.page.locator('.seller-row').first().click();await f.page.locator('#viewIdentity').click();await f.page.locator('#identityState').getByText('Viewed in this review').waitFor();
   await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await f.page.locator('#evidenceImage').getAttribute('src'),null);assert(await f.page.locator('#approveSeller').isDisabled());await f.context.close();
  });
  console.log(count+' browser scenarios passed. Internal previews: '+output);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

