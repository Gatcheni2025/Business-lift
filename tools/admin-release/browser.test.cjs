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
 async function pageFor({identity={uid:'admin1'},api,viewport={width:1440,height:1100},pagination=false}={}){
  const context=await browser.newContext({viewport}),page=await context.newPage(),calls=[],errors=[];let pending=structuredClone(rows),legacyUploaded=false;
  await page.addInitScript(value=>window.__testIdentity=value,identity);
  await page.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().endsWith('firebase-app.js')?
   'export const getApps=()=>[];export const initializeApp=c=>c;':firebaseAuth}));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',async route=>{
   const body=route.request().postDataJSON();calls.push(body);
   if(api&&await api(route,body)!==false)return;
   let result={ok:true};
   if(body.action==='ops_sellers')result={ok:true,sellers:rows.map(r=>({...r,approvalStatus:'approved',subscription:'not_started'})),next:null};
   if(body.action==='ops_seller_detail')result={ok:true,seller:rows[0],billing:{status:'not_started'},verification:{status:'pending_review'},entries:[]};
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
  if(identity&&identity.claims?.teyzaAdmin!==false&&identity.claims?.email_verified!==false){const nav=page.getByRole('button',{name:'Approvals & images',exact:true});await nav.waitFor({state:'visible'});await nav.click();}
  return {context,page,calls,errors};
 }
 async function check(name,fn){await fn();count++;console.log('PASS '+name);}
 try{
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
   await f.page.getByRole('button',{name:'R99 billing',exact:true}).click();await f.page.getByRole('button',{name:'Open account'}).first().click();await f.page.getByText('R99 monthly subscription',{exact:true}).waitFor();
   assert(await f.page.getByRole('button',{name:'Print / save PDF',exact:true}).isVisible());
   const account=f.page.locator('[data-seller-account]');await account.waitFor();await f.page.waitForFunction(()=>{const r=document.querySelector('[data-seller-account]')?.getBoundingClientRect();return r&&r.top>=-1&&r.top<innerHeight;});assert.equal(await f.page.getByRole('button',{name:'Open account',exact:true}).count(),0);
   await f.page.getByRole('button',{name:'← Back to seller directory',exact:true}).click();await f.page.getByRole('button',{name:'Open account'}).first().waitFor();
   await f.page.getByRole('button',{name:'Support',exact:true}).click();await f.page.getByText('Log a received support request',{exact:true}).waitFor();
   await f.page.getByRole('button',{name:'Stock finance',exact:true}).click();await f.page.getByText('Stock finance review',{exact:true}).waitFor();
   assert.equal(f.errors.length,0,f.errors.join('\n'));await f.context.close();
  });
  await check('Signed-out desktop and phone layouts, email login and absolute /admin route',async()=>{
   const f=await pageFor({identity:null});await f.page.locator('#loginPanel').waitFor({state:'visible'});
   await f.page.screenshot({path:path.join(output,'admin-login-desktop.png'),fullPage:true});
   await f.page.setViewportSize({width:393,height:852});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await f.page.screenshot({path:path.join(output,'admin-login-phone.png'),fullPage:true});
   await f.page.locator('#email').fill('reviewer@example.test');await f.page.locator('#password').fill('synthetic-password');await f.page.locator('#loginButton').click();
   await f.page.getByRole('button',{name:'Approvals & images',exact:true}).click();
   await f.page.locator('.seller-row').first().waitFor();assert.equal(await f.page.locator('#password').inputValue(),'');assert.deepEqual(f.errors,[]);await f.context.close();
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
   await f.page.locator('#approveSeller').click();await f.page.locator('#notice').getByText('Seller approved. The owner will receive a notification.').waitFor();
   assert.deepEqual(f.calls.find(c=>c.action==='admin_seller_review').data,{sellerUid:'seller1',submissionId:'selfie1',evidenceId:'doc1',status:'approved',reason:''});
   await f.page.locator('.seller-row').filter({hasText:'Corner Spaza'}).waitFor({state:'detached'});assert(await f.page.locator('#identityDetails').isHidden());assert.deepEqual(f.errors,[]);await f.context.close();
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
   await f.page.locator('#notice').getByText('Review saved. The owner will receive your note.').waitFor();assert.equal(f.calls.find(c=>c.action==='admin_seller_review').data.status,status);await f.context.close();
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
  await check('Hiding the tab clears documents, view receipts in the UI and approval confirmation',async()=>{
   const f=await pageFor();await f.page.locator('.seller-row').first().click();await f.page.locator('#viewIdentity').click();await f.page.locator('#identityState').getByText('Viewed in this review').waitFor();
   await f.page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await f.page.locator('#evidenceImage').getAttribute('src'),null);assert(await f.page.locator('#approveSeller').isDisabled());await f.context.close();
  });
  console.log(count+' browser scenarios passed. Internal previews: '+output);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
