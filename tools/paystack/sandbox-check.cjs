'use strict';
// Interactive Paystack TEST-mode check. All Teyza records live only in memory;
// no Firebase database, live account, store build, or production function is written.
const crypto=require('node:crypto');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createInterface}=require('node:readline/promises');
const {createBilling,SUBSCRIPTION_TERMS_VERSION,validCheckoutUrl}=require('../../services/teyza-mobile-v39/billing-paystack');
const {createPaystackCancellation}=require('../../services/teyza-mobile-v39/paystack-cancellation');
const publication=require('../../services/teyza-mobile-v39/publication');

class MemoryDB {
 constructor(seed){this.records=new Map(Object.entries(seed));this.pending=Promise.resolve();}
 doc(name){
  const db=this;
  return {path:name,id:name.split('/').at(-1),
   get:async()=>({exists:db.records.has(name),data:()=>structuredClone(db.records.get(name))}),
   create:async value=>{if(db.records.has(name))throw Error('duplicate document');db.records.set(name,structuredClone(value));},
   set:async(value,opts)=>db.records.set(name,opts?.merge?{...db.records.get(name),...structuredClone(value)}:structuredClone(value)),
   update:async value=>{if(!db.records.has(name))throw Error('missing document');db.records.set(name,{...db.records.get(name),...structuredClone(value)});}};
 }
 collection(name){
  const db=this;let field,wanted,max=Infinity;
  const q={where:(key,op,value)=>{if(op!=='==')throw Error('unsupported query');field=key;wanted=value;return q;},
   limit:n=>{max=n;return q;},get:async()=>({docs:[...db.records].filter(([key,value])=>
    key.startsWith(name+'/')&&!key.slice(name.length+1).includes('/')&&value[field]===wanted)
    .slice(0,max).map(([key,value])=>({id:key.split('/').at(-1),data:()=>structuredClone(value),ref:db.doc(key)}))})};
  return q;
 }
 runTransaction(fn){
  const result=this.pending.then(async()=>{
   const writes=[],tx={get:ref=>ref.get(),set:(ref,v,o)=>writes.push(()=>ref.set(v,o)),
    update:(ref,v)=>writes.push(()=>ref.update(v)),create:(ref,v)=>writes.push(()=>ref.create(v))};
   const value=await fn(tx);for(const write of writes)await write();return value;
  });
  this.pending=result.catch(()=>{});return result;
 }
}

function testKeyFromFirebase(cliPath){
 const result=spawnSync(process.execPath,[cliPath,'functions:secrets:access',
  'TEYZA_PAYSTACK_SECRET_KEY@1','--project','business-lift-3c19c'],
  {encoding:'utf8',timeout:60000,maxBuffer:1024*1024,windowsHide:true});
 const key=String(result.stdout||'').trim();
 if(result.status!==0||!/^sk_test_[A-Za-z0-9_]+$/.test(key))
  throw Error('The previous Firebase secret version is not an accessible Paystack TEST key. No test was started.');
 return key;
}

async function runSandbox({key,send=fetch,confirm,log=()=>{},clock=Date.now}){
 // Check before constructing any request; a live key must never enter this harness.
 if(!/^sk_test_[A-Za-z0-9_]+$/.test(String(key||'')))throw Error('A Paystack TEST key is required. No test was started.');
 if(typeof confirm!=='function')throw Error('An interactive test confirmation is required.');
 const guarded=async(url,opts={})=>{
  const target=new URL(url);
  if(target.protocol!=='https:'||target.hostname!=='api.paystack.co'||target.port||target.username||target.password||
    opts.headers?.Authorization!=='Bearer '+key)throw Error('Blocked an unexpected request.');
  return send(url,{...opts,signal:AbortSignal.timeout(30000)});
 };
 async function request(apiPath,method='GET',body){
  const res=await guarded('https://api.paystack.co'+apiPath,{method,
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json().catch(()=>null);
  if(!res.ok||data?.status!==true||!data.data)throw Error('Paystack could not confirm the test request.');
  return data.data;
 }
 // A separate plan is created in test mode only, to avoid changing an existing plan.
 const plan=await request('/plan','POST',{name:'Teyza sandbox QA R99 '+crypto.randomBytes(4).toString('hex'),
  amount:9900,interval:'monthly',currency:'ZAR',send_invoices:false,send_sms:false});
 if(plan.domain!=='test'||plan.amount!==9900||plan.interval!=='monthly'||plan.currency!=='ZAR'||
    !/^PLN_[A-Za-z0-9]+$/.test(plan.plan_code||''))throw Error('The test plan was not confirmed as R99 monthly in ZAR.');
 const uid='teyza_sandbox_seller',email='teyza-sandbox-'+crypto.randomBytes(7).toString('hex')+'@example.test';
 const db=new MemoryDB({['teyzaSellerAccounts/'+uid]:{uid,ownerEmail:email,category:'spaza',listingPlan:'free',approvalStatus:'approved'}});
 const billing=createBilling({db,clock,getSecret:()=>key,getPlanCode:()=>plan.plan_code,
  getProjectId:()=> 'teyza-local-sandbox',send:guarded,refresh:async()=>{}});
 const auth={uid,email,email_verified:true};
 const checkout=await billing.execute(auth,'billing_checkout',{recurringConsent:true,termsVersion:SUBSCRIPTION_TERMS_VERSION});
 if(checkout.amountCents!==4900||checkout.monthlyCents!==9900||!checkout.introductory||!validCheckoutUrl(checkout.checkoutUrl))
  throw Error('The test checkout did not have the expected R49 and R99 terms.');
 log('The test checkout is R49 for the first month, followed by R99 monthly.');
 const proceed=await confirm(checkout.checkoutUrl);
 if(!proceed)return {status:'stopped',planCreated:true};
 let result,error;
 try {
  const payment=await billing.execute(auth,'billing_confirm',{reference:checkout.reference});
  const bill=db.records.get('teyzaBilling/'+uid),seller=db.records.get('teyzaSellerAccounts/'+uid);
  if(payment.paid!==true||payment.paymentEnvironment!=='test'||bill?.paymentProvider!=='paystack'||
    bill.paymentEnvironment!=='test'||bill.renewalSetup!=='scheduled'||!bill.paystackSubscriptionCode)
   throw Error('The test payment or R99 renewal could not be fully verified.');
  if(publication.entitled(uid,seller,bill,clock()))throw Error('A test payment incorrectly granted live seller access.');
  const sub=await request('/subscription/'+encodeURIComponent(bill.paystackSubscriptionCode));
  if(sub.domain!=='test'||sub.subscription_code!==bill.paystackSubscriptionCode||sub.amount!==9900||
    sub.customer?.customer_code!==bill.paystackCustomerCode||sub.plan?.plan_code!==plan.plan_code||
    !Number.isFinite(Date.parse(sub.next_payment_date||''))||
    new Date(sub.next_payment_date).toISOString().slice(0,10)!==new Date(bill.paidUntil).toISOString().slice(0,10))
   throw Error('The provider did not confirm the expected R99 subscription and renewal date.');
  result={status:'verified',initialCents:4900,renewalCents:9900,nextPaymentDate:new Date(sub.next_payment_date).toISOString().slice(0,10),testEntitlement:false};
 } catch(e){error=e;}
 // Only cancel the new TEST subscription created by this run. If the provider
 // result is uncertain, leave it for manual TEST-dashboard reconciliation.
 const bill=db.records.get('teyzaBilling/'+uid);
 if(bill?.paymentEnvironment==='test'&&bill.paystackSubscriptionCode){
  const owner=db.records.get('teyzaSellerAccounts/'+uid);
  db.records.set('teyzaSellerAccounts/'+uid,{...owner,deletionPending:true});
  db.records.set('teyzaAccountDeletionRequests/'+uid,{needsPaystackCancellation:true});
  db.records.set('teyzaPaystackCancellations/'+uid,{ownerUid:uid,status:'pending',environment:'test',customerCode:bill.paystackCustomerCode});
  await createPaystackCancellation({db,clock,getSecret:()=>key,send:guarded}).process(uid);
  const cancellation=db.records.get('teyzaPaystackCancellations/'+uid);
  if(cancellation?.status!=='completed')error=Error('The test subscription needs review in the Paystack TEST dashboard.');
  else if(result)result.cancelled=true;
 } else if(bill?.renewalSetup==='action_required') {
  error=Error('Renewal setup was uncertain. Check the Paystack TEST dashboard for a test subscription.');
 }
 if(error)throw error;
 return result;
}

async function main(){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 or newer is required.');
 const cli=path.join(process.env.USERPROFILE||'','Downloads','teyza-release-20261105-103713','kit',
  'tools','admin-release','node_modules','firebase-tools','lib','bin','firebase.js');
 const key=testKeyFromFirebase(cli);
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  const result=await runSandbox({key,log:console.log,confirm:async url=>{
   console.log('\nPAYSTACK TEST CHECKOUT (test mode only):\n'+url);
   console.log('Use Paystack\'s reusable test card, not a real bank card.');
   const answer=await rl.question('Type DONE after completing the test checkout, or CANCEL to stop: ');
   return answer.trim().toUpperCase()==='DONE';
  }});
  if(result.status==='stopped'){console.log('RESULT: STOPPED - no live charge or Firebase data change.');return;}
  console.log('RESULT: VERIFIED - test R49 payment, scheduled R99 monthly renewal and test subscription cancellation.');
  console.log('RESULT: TEST ONLY - no live charge, no Firebase data change; a real renewal webhook has not been tested.');
 }finally{rl.close();}
}
if(require.main===module)main().catch(error=>{console.error('RESULT: NOT VERIFIED - '+(error?.message||'test failed'));process.exitCode=1;});
module.exports={MemoryDB,runSandbox,testKeyFromFirebase};
