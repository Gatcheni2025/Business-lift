'use strict';
// Teyza Paystack checkout: no client-controlled prices or trusted redirect parameters.
const crypto=require('node:crypto');
const D=require('./domain');
const P=require('./publication');
const INTRO_CENTS=4900,MONTHLY_CENTS=9900,PROMO_CENTS=2900,PROMO_MS=7*86400000;
const actions=new Set(['billing_checkout','billing_confirm','promote_checkout','billing_manage']);
function nextMonth(ms) {
  const d=new Date(ms),day=d.getUTCDate();
  const first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1,d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  first.setUTCDate(Math.min(day,last));return first.getTime();
}
function validCheckoutUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.paystack.com';}
  catch (_) {return false;}
}
function verifySignature(secret,body,signature) {
  if(!secret||!Buffer.isBuffer(body)||typeof signature!=='string'||!/^[a-f0-9]{128}$/i.test(signature))return false;
  const expected=crypto.createHmac('sha512',secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex'));
}
function createBilling({db,clock=Date.now,getSecret=()=>'',getPlanCode=()=>'',send=fetch,refresh=async()=>{}}) {
  const doc=p=>db.doc(p);
  async function read(path) {const x=await doc(path).get();return x.exists?x.data():null;}
  async function paystack(path,method='GET',body) {
    const key=getSecret();
    if(!key||!/^sk_(test|live)_/.test(key))D.fail(503,'Paystack seller payments are not activated yet.');
    const response=await send('https://api.paystack.co'+path,{
      method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    const parsed=await response.json().catch(()=>({}));
    if(!response.ok||parsed.status!==true||!parsed.data)D.fail(503,'Paystack could not complete the secure request. Try again.');
    return parsed.data;
  }
  async function checkout(auth,kind) {
    const uid=D.id(auth.uid);
    if(auth.email_verified!==true||!auth.email)D.fail(403,'Verify your account email before paying.');
    const account=await read('teyzaSellerAccounts/'+uid);
    D.seller(account,uid);
    if(account.deletionPending===true)D.fail(409,'Your shop account is being closed.');
    const billing=await read('teyzaBilling/'+uid),now=clock();
    const isPromo=kind==='promotion';
    if(isPromo&&!P.entitled(uid,account,billing,now))D.fail(403,'Upgrade your seller membership before promoting your business.');
    if(!isPromo&&P.entitled(uid,account,billing,now))D.fail(409,'Your seller membership is already paid.');
    const plan=getPlanCode();
    if(!isPromo&&!/^PLN_[A-Za-z0-9]+$/.test(plan||''))D.fail(503,'The monthly renewal plan must be configured before checkout.');
    // Check that the merchant's actual Paystack plan is R99/month in ZAR.
    if(!isPromo){
      const setup=await paystack('/plan/'+encodeURIComponent(plan));
      if(setup.plan_code!==plan||setup.amount!==MONTHLY_CENTS||
        setup.interval!=='monthly'||setup.currency!=='ZAR')
        D.fail(503,'The configured Paystack renewal plan does not match R99 monthly in ZAR.');
    }
    const first=!isPromo&&billing?.introUsed!==true,amount=isPromo?PROMO_CENTS:first?INTRO_CENTS:MONTHLY_CENTS;
    const reference=(isPromo?'TZP_':'TZM_')+crypto.randomBytes(13).toString('hex');
    await doc('teyzaPaystackPayments/'+reference).create({
      reference,ownerUid:uid,kind:isPromo?'promotion':first?'intro':'monthly',
      amountCents:amount,currency:'ZAR',status:'pending',createdAt:now});
    const payload={email:auth.email,amount,currency:'ZAR',channels:['card'],reference,
      callback_url:'https://www.teyza.co.za/?payment=return',
      metadata:{teyzaUid:uid,teyzaKind:isPromo?'promotion':'membership'}};
    // A Paystack plan overrides amount; only regular-price subscriptions use it.
    if(!isPromo&&!first)payload.plan=plan;
    const result=await paystack('/transaction/initialize','POST',payload);
    if(!validCheckoutUrl(result.authorization_url))D.fail(503,'Paystack checkout returned an invalid payment address.');
    return {reference,checkoutUrl:result.authorization_url,
      amountCents:amount,introductory:first,monthlyCents:MONTHLY_CENTS,
      promotionDays:isPromo?7:null,requiresReturnVerification:true};
  }
  async function verify(reference) {
    if(!/^(TZM|TZP)_[a-f0-9]{26}$/.test(String(reference||'')))D.fail(422,'Invalid Teyza payment reference.');
    const data=await paystack('/transaction/verify/'+encodeURIComponent(reference));
    if(data.reference!==reference||data.status!=='success'||data.currency!=='ZAR')D.fail(409,'Paystack has not verified a successful ZAR payment.');
    return data;
  }
  async function grant(reference,expectedUid) {
    const path='teyzaPaystackPayments/'+reference,entry=await read(path);
    if(!entry)D.fail(404,'Payment reference was not issued by Teyza.');
    if(expectedUid&&entry.ownerUid!==expectedUid)D.fail(403,'This payment belongs to another account.');
    if(entry.status==='paid')return {paid:true,kind:entry.kind,reference,alreadyConfirmed:true};
    if(entry.status!=='pending')D.fail(409,'This payment cannot be activated.');
    const verified=await verify(reference);
    if(verified.amount!==entry.amountCents||verified.customer?.email?.toLowerCase()!==
      String((await read('teyzaSellerAccounts/'+entry.ownerUid))?.ownerEmail||'').toLowerCase()) {
      D.fail(409,'Paystack payment does not match this seller or amount.');
    }
    const uid=entry.ownerUid,now=clock();
    const result=await db.runTransaction(async tx=>{
      const payRef=doc(path),billRef=doc('teyzaBilling/'+uid),promoRef=doc('teyzaPromotions/'+uid),accountRef=doc('teyzaSellerAccounts/'+uid);
      const [paySnap,billSnap,promoSnap,accountSnap]=await Promise.all([tx.get(payRef),tx.get(billRef),tx.get(promoRef),tx.get(accountRef)]);
      const pay=paySnap.exists?paySnap.data():null,bill=billSnap.exists?billSnap.data():null,account=accountSnap.exists?accountSnap.data():null;
      if(!pay||pay.ownerUid!==uid)D.fail(409,'The payment owner changed.');
      if(pay.status==='paid')return {paid:true,kind:pay.kind,reference,alreadyConfirmed:true};
      if(pay.status!=='pending')D.fail(409,'This payment cannot be activated.');
      D.seller(account,uid);
      if(account.deletionPending===true)D.fail(409,'Seller deletion is pending.');
      if(pay.kind==='promotion') {
        if(!P.entitled(uid,account,bill,now))D.fail(403,'Promotion requires a current paid seller membership.');
        const start=Math.max(now,promoSnap.exists?promoSnap.data()?.endsAt||0:0);
        tx.set(promoRef,{ownerUid:uid,status:'active',startsAt:now,
          endsAt:start+PROMO_MS,lastReference:reference,updatedAt:now},{merge:true});
      } else {
        const base=Math.max(now,Number(bill?.paidUntil)||0),paidUntil=nextMonth(base);
        tx.set(billRef,{ownerUid:uid,status:'paid',introUsed:bill?.introUsed===true||pay.kind==='intro',
          monthlyCents:pay.amountCents,standardMonthlyCents:MONTHLY_CENTS,
          paidUntil,lastReference:reference,latestPeriod:P.period(now),
          paystackCustomerCode:verified.customer?.customer_code||bill?.paystackCustomerCode||'',
          updatedAt:now},{merge:true});
        tx.update(accountRef,{listingPlan:'basic',updatedAt:new Date(now)});
      }
      tx.update(payRef,{status:'paid',verifiedAt:now,transactionId:String(verified.id||'')});
      return {paid:true,kind:pay.kind,reference,paidUntil:pay.kind==='promotion'?null:nextMonth(Math.max(now,Number(bill?.paidUntil)||0))};
    });
    if(entry.kind==='intro')await provisionRenewal(uid,verified,result.paidUntil);
    await refresh(uid);
    return result;
  }
  async function provisionRenewal(uid,verified,startsAt) {
    const code=getPlanCode();
    if(!/^PLN_[A-Za-z0-9]+$/.test(code||'')||!verified.authorization?.reusable||
       !verified.authorization?.authorization_code||!verified.customer?.customer_code) {
      await doc('teyzaBilling/'+uid).set({renewalSetup:'action_required'},{merge:true});
      return;
    }
    const lease=doc('teyzaPaystackRenewal/'+uid);
    const claimed=await db.runTransaction(async tx=>{
      const snap=await tx.get(lease),state=snap.exists?snap.data():{};
      if(state.status==='created'||state.status==='processing'||state.status==='needs_attention')return false;
      tx.set(lease,{status:'processing',attemptedAt:clock(),firstPaymentReference:verified.reference});
      return true;
    });
    if(!claimed)return;
    try {
      const data=await paystack('/subscription','POST',{customer:verified.customer.customer_code,
        plan:code,authorization:verified.authorization.authorization_code,
        start_date:new Date(startsAt).toISOString()});
      if(!data.subscription_code)throw Error('Subscription was not confirmed');
      await doc('teyzaBilling/'+uid).set({paystackSubscriptionCode:data.subscription_code,
        renewalSetup:'scheduled',nextBillingAt:startsAt},{merge:true});
      await lease.set({status:'created',subscriptionCode:data.subscription_code,createdAt:clock()},{merge:true});
    }catch(_){
      // Do not blindly retry: a network failure may occur after Paystack created the subscription.
      await lease.set({status:'needs_attention',updatedAt:clock()},{merge:true});
      await doc('teyzaBilling/'+uid).set({renewalSetup:'action_required'},{merge:true});
    }
  }
  async function execute(auth,action,data={}) {
    if(action==='billing_checkout')return checkout(auth,'membership');
    if(action==='promote_checkout')return checkout(auth,'promotion');
    if(action==='billing_manage'){
      const uid=D.id(auth.uid);
      const billing=await read('teyzaBilling/'+uid);
      if(!billing||billing.ownerUid!==uid||!/^SUB_[A-Za-z0-9]+$/.test(billing.paystackSubscriptionCode||''))
        D.fail(404,'No recurring subscription is linked to your shop yet.');
      const result=await paystack('/subscription/'+encodeURIComponent(billing.paystackSubscriptionCode)+'/manage/link');
      const uri=new URL(result.link||'https://invalid.invalid');
      if(uri.protocol!=='https:'||uri.hostname!=='paystack.com')
        D.fail(503,'Paystack returned an unexpected subscription management link.');
      return {manageUrl:result.link};
    }
    if(action==='billing_confirm') {
      const reference=D.text(data.reference,'payment reference',70);
      return grant(reference,D.id(auth.uid));
    }
    D.fail(404,'Unknown billing action.');
  }
  async function webhook(raw,signature,payload) {
    if(!verifySignature(getSecret(),raw,signature))D.fail(401,'Invalid Paystack webhook signature.');
    const event=payload?.event,details=payload?.data||{};
    if(event==='subscription.disable'||event==='invoice.payment_failed'){
      const code=details.subscription?.subscription_code||details.subscription_code;
      if(!/^SUB_[A-Za-z0-9]+$/.test(code||''))return {accepted:true};
      const matched=await db.collection('teyzaBilling').where('paystackSubscriptionCode','==',code).limit(2).get();
      if(matched.docs.length!==1)return {accepted:true};
      const bill=matched.docs[0];
      await bill.ref.set({renewalSetup:event==='subscription.disable'?'cancelled':'payment_failed',
        updatedAt:clock()},{merge:true});
      return {accepted:true};
    }
    if(event!=='charge.success')return {accepted:true};
    const ref=details.reference;
    if(typeof ref!=='string'||!/^[A-Za-z0-9=._-]{4,100}$/.test(ref))return {accepted:true};
    if(/^(TZM|TZP)_[a-f0-9]{26}$/.test(ref)){await grant(ref);return {accepted:true};}
    // For recurring charges Paystack uses its own reference; verify the
    // customer, R99 plan and charge on our integration, never trust webhook alone.
    const verified=await paystack('/transaction/verify/'+encodeURIComponent(ref));
    if(verified.reference!==ref||verified.status!=='success'||
      verified.amount!==MONTHLY_CENTS||verified.currency!=='ZAR'||
      verified.plan?.plan_code!==getPlanCode()||!verified.customer?.customer_code)
      return {accepted:true};
    const customers=await db.collection('teyzaBilling').where('paystackCustomerCode','==',
      verified.customer.customer_code).limit(2).get();
    if(customers.docs.length!==1)return {accepted:true};
    const row=customers.docs[0],uid=row.id;
    await db.runTransaction(async tx=>{
      const payment=doc('teyzaPaystackPayments/'+ref),billRef=doc('teyzaBilling/'+uid),
        ownerRef=doc('teyzaSellerAccounts/'+uid);
      const [existing,old,shop]=await Promise.all([tx.get(payment),tx.get(billRef),tx.get(ownerRef)]);
      if(existing.exists)return;
      const account=shop.exists?shop.data():null,bill=old.exists?old.data():null;
      if(account?.uid!==uid||account.deletionPending===true||
        account.listingPlan!=='basic'||bill?.ownerUid!==uid||
        bill.paystackCustomerCode!==verified.customer.customer_code||
        !/^SUB_[A-Za-z0-9]+$/.test(bill.paystackSubscriptionCode||''))
        D.fail(409,'Subscription owner or membership changed.');
      const now=clock(),base=Math.max(now,Number(bill.paidUntil)||0);
      tx.create(payment,{reference:ref,ownerUid:uid,kind:'renewal',amountCents:MONTHLY_CENTS,
        currency:'ZAR',status:'paid',verifiedAt:now,transactionId:String(verified.id||'')});
      tx.set(billRef,{status:'paid',monthlyCents:MONTHLY_CENTS,standardMonthlyCents:MONTHLY_CENTS,
        paidUntil:nextMonth(base),lastReference:ref,latestPeriod:P.period(now),
        renewalSetup:'active',updatedAt:now},{merge:true});
    });
    await refresh(uid);return {accepted:true};
  }
  return {execute,webhook,actions,grant};
}
module.exports={createBilling,actions,nextMonth,verifySignature,validCheckoutUrl,
  INTRO_CENTS,MONTHLY_CENTS,PROMO_CENTS,PROMO_MS};
