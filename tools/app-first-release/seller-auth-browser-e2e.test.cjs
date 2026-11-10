'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../web/app-first/public');
const mockAuth=[
"const auth={currentUser:null}; let listener=null;",
"const makeUser=uid=>({uid,email:uid+'@example.test',emailVerified:true,async reload(){},async getIdToken(){return 'fixture-'+uid;}});",
"export const browserSessionPersistence={};",
"export function getAuth(){return auth;}",
"export async function setPersistence(){}",
"export function onAuthStateChanged(_auth,callback){",
" listener=callback; queueMicrotask(()=>callback(auth.currentUser));",
" window.__authTest={switchTo(uid){auth.currentUser=uid?makeUser(uid):null;listener(auth.currentUser);},get uid(){return auth.currentUser?.uid||null;}};",
"}",
"export async function signInWithEmailAndPassword(_auth,email){",
" const uid=email.startsWith('seller2')?'seller2':'seller1';auth.currentUser=makeUser(uid);listener(auth.currentUser);",
"}",
"export async function signOut(){auth.currentUser=null;listener(null);}",
"export class GoogleAuthProvider{}",
"export class FacebookAuthProvider{}",
"export class OAuthProvider{}",
"export async function signInWithPopup(){throw Error('Synthetic OAuth popup unavailable');}",
"export async function sendEmailVerification(){}"
].join('\n');
const appSource='export const getApps=()=>[];export const initializeApp=()=>({});';
async function fixture({returnUrl=false,pendingReceipt=false,delayFirst=false}={}){
 const server=http.createServer((req,res)=>{
  const route=req.url.split('?')[0];
  const file=route==='/pay'?'pay.html':route==='/js/seller-web-billing.mjs'?'js/seller-web-billing.mjs':null;
  if(!file){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.mjs')?'text/javascript':'text/html'});
  res.end(fs.readFileSync(path.join(root,file)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const requests=[];
 let paid=false;
 await page.route('https://www.gstatic.com/firebasejs/12.17.1/**',route=>{
  const auth=route.request().url().endsWith('/firebase-auth.js');
  return route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:auth?mockAuth:appSource});
 });
 await page.route('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',async route=>{
  const req=route.request();
  if(req.method()==='GET')return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},
   body:JSON.stringify({ok:true,version:'3.25.0',approvalRequired:true,sellerApprovalBeforeCheckout:true,
    paystackCheckoutAvailable:false,billingMode:'paystack_checkout',introductoryFirstMonthCents:1000,subscriptionMonthlyCents:9900})});
  const uid=(req.headers().authorization||'').replace(/^Bearer fixture-/,'');
  const action=req.postDataJSON()?.action;requests.push({uid,action});
  if(delayFirst&&uid==='seller1'&&action==='seller_summary')await new Promise(resolve=>setTimeout(resolve,700));
  const seller={approvalStatus:'approved',identityVerified:true,setupComplete:true,
   listingPaid:paid,complimentaryAccess:false,introEligible:true};
  const bill={sellerUid:uid,shopName:'Shop '+uid,businessType:'spaza',status:paid?'paid':'not_subscribed',
   paymentVerified:paid,renewalStatus:paid?'scheduled':'not_started',transactions:[],
   paidThrough:paid?Date.UTC(2026,11,1):null,nextBillingAt:null,amountDueCents:null};
  let data;
  if(action==='seller_summary')data=seller;
  else if(action==='seller_billing_overview')data=bill;
  else if(action==='billing_confirm'){paid=true;data={paid:true};}
  else data={error:'Unsupported synthetic action'};
  return route.fulfill({status:data.error?400:200,contentType:'application/json',
   headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:!data.error,...data})});
 });
 if(pendingReceipt)await page.addInitScript(()=>{
  sessionStorage.setItem('teyza_website_checkout_v1_seller1',
   JSON.stringify({reference:'TZM-'+'a'.repeat(26),createdAt:Date.now()}));
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/pay'+(returnUrl?'?payment=return':''));
 return {page,requests,close:async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));}};
}
async function login(page,email){
 await page.locator('#webEmail').fill(email);
 await page.locator('#webPassword').fill('synthetic-password');
 await page.locator('#webEmailForm button[type=submit]').click();
}
test('Firebase UID login displays exactly one authenticated seller and blocks checkout',async()=>{
 const f=await fixture();
 try{
  await login(f.page,'seller1@example.test');
  await f.page.locator('#webShopUid').getByText('seller1').waitFor();
  assert.equal(await f.page.locator('#webCheckout').isDisabled(),true);
  assert(f.requests.some(row=>row.uid==='seller1'&&row.action==='seller_billing_overview'));
  assert(!f.requests.some(row=>row.action==='billing_checkout'));
 }finally{await f.close();}
});
test('Account switch rejects earlier seller response after a delayed server read',async()=>{
 const f=await fixture({delayFirst:true});
 try{
  await login(f.page,'seller1@example.test');
  await f.page.waitForFunction(()=>window.__authTest?.uid==='seller1');
  await f.page.evaluate(()=>window.__authTest.switchTo('seller2'));
  await f.page.locator('#webShopUid').getByText('seller2').waitFor();
  await f.page.waitForTimeout(850);
  assert.equal(await f.page.locator('#webShopUid').textContent(),'seller2');
  assert.equal(await f.page.locator('#webShopName').textContent(),'Shop seller2');
 }finally{await f.close();}
});
test('Paystack return uses authenticated backend confirmation not the return URL itself',async()=>{
 const f=await fixture({returnUrl:true,pendingReceipt:true});
 try{
  await login(f.page,'seller1@example.test');
  await f.page.getByText('Verified payment activated.',{exact:false}).waitFor();
  assert(f.requests.some(row=>row.action==='billing_confirm'&&row.uid==='seller1'));
  assert.equal(await f.page.locator('#webBillingStatus').textContent(),'Paid · active');
  assert(!f.page.url().includes('payment=return'));
  assert.equal(await f.page.evaluate(()=>sessionStorage.getItem('teyza_website_checkout_v1_seller1')),null);
 }finally{await f.close();}
});
