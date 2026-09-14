const {chromium}=require('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
const path=require('path');
const pages=JSON.parse(fs.readFileSync('ui/pages.json','utf8'));
const artifacts=path.resolve('tests/artifacts');fs.mkdirSync(artifacts,{recursive:true});
const user={uid:'test-owner',displayName:'Lucky Ndlovu',email:'test@example.com'};
const fixture={user,business:{businessId:'BL_TEST',ownerId:user.uid,ownerUid:user.uid,businessName:'Gatcheni Stores',businessType:'Retail',industry:'Clothing',country:'South Africa',phone:'0123456789',address:'Durban',about:'Everyday goods',profileComplete:true},userData:{uid:user.uid,activeBusinessId:'BL_TEST',firstName:'Lucky'},saved:[],denyRead:false,denyWrite:false};
const firestore=`
const state=()=>window.__fixture;
export const getFirestore=()=>({});export const serverTimestamp=()=>({seconds:1});
export function doc(...args){if(args.length===1)return {path:args[0].path+'/new-business',id:'new-business'};const path=args.slice(1).join('/');return {path,id:path.split('/').pop()};}
export const collection=(db,name)=>({path:name});export const where=(...args)=>args;export const limit=n=>n;export const query=(ref,...conditions)=>({...ref,conditions});
export async function getDoc(ref){if(state().denyRead)throw {code:'permission-denied'};const data=ref.path.startsWith('users/')?state().userData:state().business;return {exists:()=>!!data,data:()=>data,id:ref.id};}
export async function getDocs(ref){
 if(state().denyRead || (state().denyOrders && ref.path==='orders'))throw {code:'permission-denied'};
 const docs=ref.path==='businesses' && state().business?[{id:'BL_TEST',data:()=>state().business}]:[];
 return {docs,empty:docs.length===0,forEach:fn=>docs.forEach(fn)};
}
export function onSnapshot(ref,callback,error){getDocs(ref).then(callback).catch(error);return ()=>{}}
export async function updateDoc(ref,data){if(state().denyWrite)throw {code:'permission-denied'};state().saved.push({path:ref.path,data});if(ref.path.startsWith('businesses/'))state().business={...state().business,...data};}
export const setDoc=updateDoc;export const addDoc=async(ref,data)=>{await updateDoc(ref,data);return {id:'new'}};
export function writeBatch(){const writes=[];return {set:(ref,data)=>writes.push({ref,data}),commit:async()=>{for(const {ref,data} of writes)await updateDoc(ref,data)}};}
`;
const auth=`export const getAuth=()=>({});export const onAuthStateChanged=(a,callback)=>{queueMicrotask(()=>callback(window.__fixture.user));return ()=>{}};export const signOut=async()=>{window.__fixture.user=null};export const signInWithEmailAndPassword=async()=>({user:window.__fixture.user});export const createUserWithEmailAndPassword=signInWithEmailAndPassword;export const sendPasswordResetEmail=async()=>{};export const updateProfile=async()=>{};`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(data=>{
  window.__fixture=structuredClone(data);
  const scenario=new URLSearchParams(location.search).get('scenario');
  if(scenario==='legacy')window.__fixture.userData={uid:data.user.uid};
  if(scenario==='empty'){window.__fixture.userData={uid:data.user.uid};window.__fixture.business=null;}
  if(scenario==='denied')window.__fixture.denyRead=true;
  if(scenario==='partial')window.__fixture.denyOrders=true;
 },fixture);
 await context.route('https://www.gstatic.com/firebasejs/**',route=>{
  const url=route.request().url();let body='';
  if(url.includes('firebase-app'))body='export const initializeApp=()=>({});';
  else if(url.includes('firebase-auth'))body=auth;
  else if(url.includes('firebase-firestore'))body=firestore;
  else if(url.includes('firebase-functions'))body='export const getFunctions=()=>({});export const httpsCallable=(f,name)=>async()=>({data:{}});';
  return route.fulfill({contentType:'text/javascript',body});
 });
 // The tests are isolated from live account data and third-party services.
 await context.route('https://unpkg.com/**',route=>route.fulfill({contentType:'text/javascript',body:''}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error' && !message.text().includes('Failed to load resource'))errors.push(message.text())});
 const reports=[];
 for(const name of Object.keys(pages)){
  errors.length=0;
  await page.goto('http://127.0.0.1:4173/'+name+'.html');
  await page.locator('[data-auth-name]').filter({hasText:'Lucky'}).waitFor();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.workspace-sidebar').count(),1,name+' sidebar');
  assert.equal(await page.locator('nav [aria-current=page]').count(),1,name+' active navigation');
  assert.equal(await page.locator('h1').count(),1,name+' main heading');
  assert.equal(await page.locator('.workspace-sidebar .nav-link').count(),15,name+' nav count');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert(!overflow,name+' desktop horizontal overflow');
  assert.deepEqual(errors,[],name+' runtime errors');
  if(['dashboard','business-profile','orders','sales-channels','seller-onboarding'].includes(name))await page.screenshot({path:path.join(artifacts,name+'-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(30);
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),name+' mobile horizontal overflow');
  await page.locator('#navToggle').click();assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'),'false');
  await page.waitForTimeout(230);
  if(['dashboard','business-profile'].includes(name))await page.screenshot({path:path.join(artifacts,name+'-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});reports.push(name+': desktop/mobile layout, navigation and runtime PASS');
 }
 await page.goto('http://127.0.0.1:4173/business-profile.html');
 await page.getByRole('button',{name:'Save changes'}).waitFor();
 await page.locator('[name=business-name]').fill('Updated Shop');
 await page.getByRole('button',{name:'Save changes'}).click();
 await page.locator('[data-profile-status]').filter({hasText:'has been saved'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__fixture.saved[0].data.businessName),'Updated Shop');
 assert(page.url().endsWith('business-profile.html'),'Profile should stay open after save');
 await page.evaluate(()=>window.__fixture.denyWrite=true);
 await page.locator('[name=business-name]').fill('Preserved draft');
 await page.getByRole('button',{name:'Save changes'}).click();
 await page.locator('[data-profile-status]').filter({hasText:'permission'}).waitFor();
 assert.equal(await page.locator('[name=business-name]').inputValue(),'Preserved draft');
 assert.equal(await page.getByRole('button',{name:'Save changes'}).isEnabled(),true);
 reports.push('profile: save payload, confirmation, denied save, preserved input and retry PASS');
 await page.evaluate(()=>{window.__fixture.denyRead=true});
 await page.locator('[data-profile-retry]').evaluate(el=>el.hidden=false);
 await page.locator('[data-profile-retry]').click();
 await page.locator('[data-profile-status]').filter({hasText:'permission'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Save changes'}).isDisabled(),true);
 await page.evaluate(()=>window.__fixture.denyRead=false);
 await page.getByRole('button',{name:'Retry loading'}).click();
 await page.waitForFunction(()=>!document.querySelector('[data-business-profile] [type=submit]').disabled);
 reports.push('profile: failed load disables save; retry restores form PASS');
 await page.goto('http://127.0.0.1:4173/business-profile.html?scenario=legacy');
 await page.waitForFunction(()=>!document.querySelector('[data-business-profile] [type=submit]').disabled);
 assert.equal(await page.locator('[name=business-name]').inputValue(),'Gatcheni Stores');
 await page.goto('http://127.0.0.1:4173/business-profile.html?scenario=empty');
 await page.waitForFunction(()=>!document.querySelector('[data-business-profile] [type=submit]').disabled);
 await page.locator('[name=business-name]').fill('Recovered Shop');
 await page.locator('[name=industry]').fill('Retail');
 await page.getByRole('button',{name:'Save changes'}).click();
 await page.locator('[data-profile-status]').filter({hasText:'has been saved'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__fixture.saved.length),2,'Recovery creates business and user link');
 await page.goto('http://127.0.0.1:4173/business-profile.html?scenario=denied');
 await page.locator('[data-profile-status]').filter({hasText:'permission'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Save changes'}).isDisabled(),true);
 assert.equal(await page.locator('[data-profile-retry]').isVisible(),true);
 await page.goto('http://127.0.0.1:4173/dashboard.html?scenario=partial');
 await page.locator('[data-dashboard-status]').filter({hasText:'permission'}).waitFor();
 assert.equal(await page.locator('[data-stat-products]').textContent(),'0');
 assert.equal(await page.locator('[data-stat-orders]').textContent(),'—');
 assert.equal(await page.locator('[data-stat-revenue]').textContent(),'—');
 reports.push('legacy account lookup, missing workspace recovery, denied initial load and independent dashboard data PASS');
 for(const name of ['login','register','forgot-password']){
  await context.addInitScript(()=>window.__fixture.user=null);
  await page.goto('http://127.0.0.1:4173/'+name+'.html');
  await page.setViewportSize({width:390,height:844});
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),name+' mobile overflow');
 }
 reports.push('authentication pages: mobile layout PASS');
 fs.writeFileSync(path.join(artifacts,'results.txt'),reports.join('\n'));
 console.log(reports.join('\n'));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
