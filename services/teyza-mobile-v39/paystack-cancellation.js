'use strict';

// An account can close immediately, but a third-party recurring debit only
// stops after Paystack confirms it. Never persist its email token.
const crypto=require('node:crypto');
const PROCESSING_LEASE_MS=120000;
const terminal=new Set(['non-renewing','cancelled','completed','complete']);

function createPaystackCancellation({db,getSecret=()=>'',send=fetch,clock=Date.now}){
 const doc=path=>db.doc(path);
 async function process(uid){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(String(uid||'')))return;
  const queue=doc('teyzaPaystackCancellations/'+uid),claim=crypto.randomBytes(12).toString('hex'),now=clock();
  const work=await db.runTransaction(async tx=>{
   const [q,request,account,bill,renewal]=await Promise.all([
    tx.get(queue),tx.get(doc('teyzaAccountDeletionRequests/'+uid)),tx.get(doc('teyzaSellerAccounts/'+uid)),
    tx.get(doc('teyzaBilling/'+uid)),tx.get(doc('teyzaPaystackRenewal/'+uid))]);
   const item=q.exists?q.data():null;
   if(!item||item.ownerUid!==uid||!['pending','processing'].includes(item.status))return null;
   if(item.status==='processing'&&now-Number(item.claimedAt||0)<PROCESSING_LEASE_MS)return null;
   const req=request.exists?request.data():null,a=account.exists?account.data():null,
    b=bill.exists?bill.data():null,lease=renewal.exists?renewal.data():null;
   if(!req||req.needsPaystackCancellation!==true||a?.uid!==uid||a.deletionPending!==true||
      b?.ownerUid!==uid||b.paymentProvider!=='paystack'){
    tx.update(queue,{status:'needs_attention',reason:'ownership_or_deletion_changed',updatedAt:now});return null;
   }
   tx.update(queue,{status:'processing',claim,claimedAt:now,updatedAt:now});
   return {item,bill:b,lease};
  });
  if(!work)return;
  async function finish(status,reason){
   await db.runTransaction(async tx=>{
    const q=await tx.get(queue);
    if(q.exists&&q.data().status==='processing'&&q.data().claim===claim)
     tx.update(queue,{status,reason,updatedAt:clock()});
   });
  }
  const key=getSecret(),mode=key?.startsWith('sk_live_')?'live':key?.startsWith('sk_test_')?'test':'';
  if(!mode||work.item.environment!==mode||work.bill.paymentEnvironment!==mode){
   await finish('needs_attention','payment_environment_unavailable');return;
  }
  if(work.lease?.status==='processing'){
   const stale=now-Number(work.lease.attemptedAt||0)>PROCESSING_LEASE_MS;
   await finish(stale?'needs_attention':'pending',stale?'renewal_creation_uncertain':'waiting_for_renewal_setup');return;
  }
  if(work.lease?.status==='needs_attention'){
   await finish('needs_attention','renewal_creation_uncertain');return;
  }
  const code=work.bill.paystackSubscriptionCode||work.lease?.subscriptionCode||'';
  if(!code){
   if((!work.lease&&['pending','action_required'].includes(work.bill.renewalSetup))||
      work.lease?.status==='cancelled_before_creation')
    await finish('completed','no_subscription_created');
   else await finish('needs_attention','subscription_code_unavailable');
   return;
  }
  if(!/^SUB_[A-Za-z0-9]+$/.test(code)||!work.item.customerCode||
     work.bill.paystackCustomerCode!==work.item.customerCode){
   await finish('needs_attention','subscription_identity_unavailable');return;
  }
  async function request(path,method='GET',body){
   const response=await send('https://api.paystack.co'+path,{
    method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
   const value=await response.json().catch(()=>null);
   if(!response.ok||value?.status!==true)throw Error('Paystack request was not confirmed');
   return value.data;
  }
  function matches(sub){
   return sub?.subscription_code===code&&sub.domain===mode&&
     sub.customer?.customer_code===work.item.customerCode;
  }
  try{
   let sub=await request('/subscription/'+encodeURIComponent(code));
   if(!matches(sub)){await finish('needs_attention','subscription_identity_mismatch');return;}
   if(terminal.has(sub.status)){await finish('completed','provider_confirmed');return;}
   if(!['active','attention'].includes(sub.status)||typeof sub.email_token!=='string'||!sub.email_token){
    await finish('needs_attention','subscription_status_unavailable');return;
   }
   // A renewal setup can finish after deletion started. Recheck its lease and
   // billing reference before disabling any external subscription.
   const [latestBill,latestLease]=await Promise.all([
    doc('teyzaBilling/'+uid).get(),doc('teyzaPaystackRenewal/'+uid).get()]);
   const current=latestBill.exists?latestBill.data():null,lease=latestLease.exists?latestLease.data():null;
   if(lease?.status==='processing'||lease?.status==='needs_attention'||
      (current?.paystackSubscriptionCode&&current.paystackSubscriptionCode!==code)){
    await finish('pending','renewal_setup_changed');return;
   }
   await request('/subscription/disable','POST',{code,token:sub.email_token});
   sub=await request('/subscription/'+encodeURIComponent(code));
   if(!matches(sub)){await finish('needs_attention','subscription_identity_mismatch');return;}
   await finish(terminal.has(sub.status)?'completed':'pending',
    terminal.has(sub.status)?'provider_confirmed':'awaiting_provider_confirmation');
  }catch(_){
   // A timeout could follow a successful disable. The next attempt fetches
   // the current provider status before deciding whether to send anything.
   await finish('pending','provider_unavailable');
  }
 }
 return {process};
}
module.exports={createPaystackCancellation,PROCESSING_LEASE_MS};
