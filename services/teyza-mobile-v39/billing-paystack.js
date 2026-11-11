'use strict';
// Teyza Paystack checkout: no client-controlled prices or trusted redirect parameters.
const crypto=require('node:crypto');
const D=require('./domain');
const P=require('./publication');
const webhookSignature=require('./webhook-signature');
const MONTHLY_CENTS=9900,PROMO_CENTS=2900,PROMO_MS=7*86400000;
const SUBSCRIPTION_TERMS_VERSION='seller-r99-monthly-2026-11';
const {recentAdmin}=require('./seller-experience');
const actions=new Set(['billing_checkout','billing_confirm','promote_checkout','billing_manage','ops_paystack_confirm','ops_paystack_refund_confirm']);
// First day of the following calendar month at 00:00 UTC (02:00 in South Africa).
// Keep the Paystack monthly renewal anchor on the 1st in the gateway's UTC
// calendar as well as the seller's South African calendar.
function nextMonth(ms) {
  const local=new Date(ms+2*3600000);
  return Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,1,0,0,0);
}
function validCheckoutUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.paystack.com';}
  catch (_) {return false;}
}
const verifySignature=webhookSignature.verifyLegacy;
function createBilling({db,clock=Date.now,getSecret=()=>'',getSigningSecret=()=>'',getPlanCode=()=>'',getProjectId=()=>process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT||'',send=fetch,refresh=async()=>{}}) {
  const doc=p=>db.doc(p);
  const environment=()=>getSecret().startsWith('sk_live_')?'live':'test';
  async function read(path) {const x=await doc(path).get();return x.exists?x.data():null;}
  function requireSafeMode(key){
    if(key.startsWith('sk_test_')&&(!getProjectId()||getProjectId()==='business-lift-3c19c'))
      D.fail(503,'Paystack test payments require an isolated test project.');
  }
  async function paystack(path,method='GET',body) {
    const key=getSecret();
    if(!key||!/^sk_(test|live)_/.test(key))D.fail(503,'Paystack seller payments are not activated yet.');
    // A test charge mutates subscription state. Never
    // write sandbox payments into the production seller database.
    requireSafeMode(key);
    const response=await send('https://api.paystack.co'+path,{
      method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    const parsed=await response.json().catch(()=>({}));
    if(!response.ok||parsed.status!==true||!parsed.data)D.fail(503,'Paystack could not complete the secure request. Try again.');
    return parsed.data;
  }
  async function checkout(auth,kind,data={}) {
    const uid=D.id(auth.uid);
    if(auth.email_verified!==true||!auth.email)D.fail(403,'Verify your account email before paying.');
    const account=await read('teyzaSellerAccounts/'+uid);
    D.seller(account,uid);
    if(account.deletionPending===true)D.fail(409,'Your shop account is being closed.');
    if(account.approvalStatus!=='approved')D.fail(403,'Your seller registration must be approved before you can pay for product access.');
    const billing=await read('teyzaBilling/'+uid),now=clock();
    const setup=await read('teyzaSellerOnboarding/'+uid);
    if(setup?.requiredVersion===2){
      const [verification,shop]=await Promise.all([read('teyzaMobileVerification/'+uid),read('teyzaPublicShops/'+uid)]);
      const state=P.state(uid,account,setup,verification,shop,billing,now);
      if(!state.ready||!state.approved||state.status==='suspended')
       D.fail(409,'Complete seller verification and resolve any shop hold before paying for product access.');
    }
    const isPromo=kind==='promotion';
    // Website checkout uses a fixed, canonical Paystack return route.
    // Never accept a customer-supplied arbitrary callback URL.
    if(data.checkoutChannel!=null&&!['web','direct'].includes(data.checkoutChannel))
      D.fail(422,'Choose a supported checkout channel.');
    const webCheckout=data.checkoutChannel==='web';
    // Prevent someone from paying with a stale browser session, a guessed UID
    // or a reused email address. Firebase Auth UID is the only account key.
    // Web customers must have signed in again within the past 15 minutes.
    if(webCheckout){
      if(data.confirmedSellerUid!==uid)D.fail(403,'Confirm the exact signed-in shop account before paying.');
      const signedIn=Number(auth.auth_time),age=clock()/1000-signedIn;
      if(!Number.isFinite(signedIn)||age<0||age>900)
        D.fail(401,'For your protection, sign out and sign in again before paying.');
    }
    // The website channel is for current, fully verified owners only:
    // legacy account-level approval is not sufficient proof of SMS/ID/selfie.
    if(webCheckout&&setup?.requiredVersion!==2)
      D.fail(409,'Complete this shop’s current phone OTP and identity onboarding before website checkout.');
    if(!isPromo&&(data.recurringConsent!==true||data.termsVersion!==SUBSCRIPTION_TERMS_VERSION))
      D.fail(422,'Confirm the monthly renewal terms before starting payment.');
    if(isPromo&&!P.entitled(uid,account,billing,now))D.fail(403,'Upgrade your seller membership before promoting your business.');
    if(!isPromo&&P.entitled(uid,account,billing,now))D.fail(409,'Your seller membership is already paid.');
    const plan=getPlanCode();
    if(!isPromo&&!/^PLN_[A-Za-z0-9]+$/.test(plan||''))D.fail(503,'The monthly renewal plan must be configured before checkout.');
    const mode=environment();
    // Check that the merchant's actual Paystack plan is R99/month in ZAR.
    if(!isPromo){
      const setup=await paystack('/plan/'+encodeURIComponent(plan));
      if(setup.plan_code!==plan||setup.amount!==MONTHLY_CENTS||setup.domain!==mode||
        (setup.invoice_limit!=null&&setup.invoice_limit!==0)||
        setup.interval!=='monthly'||setup.currency!=='ZAR')
        D.fail(503,'The configured Paystack renewal plan does not match R99 monthly in ZAR.');
      if(billing?.paystackSubscriptionCode){
        const previous=await paystack('/subscription/'+encodeURIComponent(billing.paystackSubscriptionCode));
        if(previous.subscription_code!==billing.paystackSubscriptionCode||previous.domain!==mode||
          previous.customer?.customer_code!==billing.paystackCustomerCode||
          !['cancelled','completed','complete'].includes(previous.status))
          D.fail(409,'A subscription may still renew. Manage or cancel it before starting another.');
      }
    }
    const amount=isPromo?PROMO_CENTS:MONTHLY_CENTS;
    if(!isPromo&&nextMonth(now)-now<86400000)
      D.fail(409,'Monthly renewal starts on the first day of the next month. New signups are paused during the final 24 hours to avoid charging twice in quick succession. Return on the first.');
    const reference=(isPromo?'TZP-':'TZM-')+crypto.randomBytes(13).toString('hex');
    const lockRef=doc('teyzaPaystackCheckoutLocks/'+uid+'_'+(isPromo?'promotion':'membership'));
    const newPayment=doc('teyzaPaystackPayments/'+reference);
    const started=await db.runTransaction(async tx=>{
      const [lockSnap,accountSnap,billSnap]=await Promise.all([tx.get(lockRef),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaBilling/'+uid))]);
      const lock=lockSnap.exists?lockSnap.data():null,current=accountSnap.exists?accountSnap.data():null,
        currentBill=billSnap.exists?billSnap.data():null;
      D.seller(current,uid);
      if(current.approvalStatus!=='approved'||current.deletionPending===true)D.fail(409,'Seller approval changed. Please refresh.');
      if(!isPromo&&P.entitled(uid,current,currentBill,clock()))D.fail(409,'Your seller membership is already paid.');
      if(isPromo&&!P.entitled(uid,current,currentBill,clock()))D.fail(403,'Promotion requires a current paid seller membership.');
      if(!isPromo&&(currentBill?.paystackSubscriptionCode||'')!==(billing?.paystackSubscriptionCode||''))
        D.fail(409,'Your membership changed. Refresh before paying.');
      if(lock&&['preparing','pending'].includes(lock.status)){
        const oldSnap=await tx.get(doc('teyzaPaystackPayments/'+lock.reference));
        const old=oldSnap.exists?oldSnap.data():null;
        if(!isPromo&&old?.ownerUid===uid&&old.kind==='intro')
          D.fail(409,'An earlier introductory checkout is still unresolved. Contact support to reconcile that Paystack reference before starting the R99 membership.');
        if(old?.ownerUid===uid&&old.status==='pending'&&old.environment===mode&&validCheckoutUrl(old.checkoutUrl)&&
          (isPromo?old.kind==='promotion':old.kind==='monthly'&&old.amountCents===MONTHLY_CENTS))
          return {existing:old};
        D.fail(409,'A payment is already being prepared. Please contact support before trying another checkout.');
      }
      tx.create(newPayment,{reference,ownerUid:uid,kind:isPromo?'promotion':'monthly',
        customerEmail:auth.email.toLowerCase(),environment:mode,checkoutChannel:webCheckout?'web':'direct',
        previousSubscriptionCode:billing?.paystackSubscriptionCode||'',
        renewalStrategy:isPromo?'none':'delayed_plan',
        ...(isPromo?{}:{recurringConsent:true,termsVersion:SUBSCRIPTION_TERMS_VERSION,consentedAt:now}),
        amountCents:amount,currency:'ZAR',status:'pending',createdAt:now});
      tx.set(lockRef,{ownerUid:uid,reference,status:'preparing',environment:mode,createdAt:now});
      return {existing:null};
    });
    if(started.existing){const old=started.existing;return {reference:old.reference,checkoutUrl:old.checkoutUrl,
      amountCents:old.amountCents,introductory:false,monthlyCents:MONTHLY_CENTS,
      promotionDays:isPromo?7:null,requiresReturnVerification:true,alreadyStarted:true};}
    const payload={email:auth.email,amount,currency:'ZAR',channels:['card'],reference,
      callback_url:webCheckout?'https://teyza.co.za/pay?payment=return':
        'https://www.teyza.co.za/?payment=return',
      metadata:{teyzaUid:uid,teyzaKind:isPromo?'promotion':'membership'}};
    // Charge the server-priced R99 membership once;
    // first-of-month renewal is independently scheduled only after
    // server-side Paystack verification and recurring consent.
    let result;
    try{
      result=await paystack('/transaction/initialize','POST',payload);
      if(!validCheckoutUrl(result.authorization_url))D.fail(503,'Paystack checkout returned an invalid payment address.');
      await db.runTransaction(async tx=>{
        const [lockSnap,paySnap]=await Promise.all([tx.get(lockRef),tx.get(newPayment)]);
        if(!lockSnap.exists||lockSnap.data().reference!==reference||!paySnap.exists||paySnap.data().status!=='pending')
          D.fail(409,'Payment state changed. Contact support before paying.');
        tx.update(newPayment,{checkoutUrl:result.authorization_url});
        tx.update(lockRef,{status:'pending',updatedAt:clock()});
      });
    }catch(error){
      // Paystack may have created a payable checkout even when a response was
      // lost. Do not unlock and create another until the first is reconciled.
      await newPayment.set({initializationUncertain:true,updatedAt:clock()},{merge:true});
      throw error;
    }
    return {reference,checkoutUrl:result.authorization_url,
      amountCents:amount,introductory:false,monthlyCents:MONTHLY_CENTS,
      promotionDays:isPromo?7:null,requiresReturnVerification:true};
  }
  async function verify(reference,expectedEnvironment) {
    if(!/^(TZM|TZP)[_-][a-f0-9]{26}$/.test(String(reference||'')))D.fail(422,'Invalid Teyza payment reference.');
    const data=await paystack('/transaction/verify/'+encodeURIComponent(reference));
    if(data.reference!==reference||data.status!=='success'||data.currency!=='ZAR'||data.domain!==expectedEnvironment)
      D.fail(409,'Paystack has not verified a successful payment in the expected environment.');
    return data;
  }
  async function grant(reference,expectedUid) {
    const path='teyzaPaystackPayments/'+reference,entry=await read(path);
    if(!entry)D.fail(404,'Payment reference was not issued by Teyza.');
    if(expectedUid&&entry.ownerUid!==expectedUid)D.fail(403,'This payment belongs to another account.');
    if(['refund_review','refunded'].includes(entry.status))return {paid:false,kind:entry.kind,reference,
      refundReviewRequired:entry.status==='refund_review',alreadyConfirmed:true};
    if(entry.status==='paid'){
      if(entry.renewalStrategy==='delayed_plan'&&entry.environment===environment()){
        const bill=await read('teyzaBilling/'+entry.ownerUid);
        if(bill?.lastReference===reference&&bill.renewalSetup==='pending'){
          const verified=await verify(reference,entry.environment);
          if(verified.amount!==entry.amountCents||verified.customer?.email?.toLowerCase()!==entry.customerEmail)
            D.fail(409,'The recorded payment needs support reconciliation.');
          await provisionRenewal(entry.ownerUid,verified,bill.paidUntil,entry);
        }
      }
      // Replaying an already verified charge must repair publication if the
      // first request failed after the billing transaction was committed.
      await refresh(entry.ownerUid);
      const saved=await read('teyzaBilling/'+entry.ownerUid);
      return {paid:true,kind:entry.kind,reference,alreadyConfirmed:true,
        paymentEnvironment:entry.paymentEnvironment||saved?.paymentEnvironment||'unknown'};
    }
    if(entry.status!=='pending')D.fail(409,'This payment cannot be activated.');
    if(!['test','live'].includes(entry.environment)||entry.environment!==environment()||!entry.customerEmail)
      D.fail(409,'This payment needs support reconciliation before activation.');
    const verified=await verify(reference,entry.environment);
    if(verified.amount!==entry.amountCents||verified.customer?.email?.toLowerCase()!==entry.customerEmail) {
      D.fail(409,'Paystack payment does not match this seller or amount.');
    }
    if((typeof verified.id==='number'&&!Number.isSafeInteger(verified.id))||!/^[0-9]+$/.test(String(verified.id||'')))
      D.fail(409,'Paystack transaction ID needs support reconciliation.');
    const paidAt=Date.parse(verified.paid_at||verified.paidAt||'');
    if(!Number.isFinite(paidAt)||paidAt>clock()+300000)D.fail(409,'Paystack payment time needs support reconciliation.');
    const uid=entry.ownerUid,now=clock();
    const result=await db.runTransaction(async tx=>{
      const payRef=doc(path),billRef=doc('teyzaBilling/'+uid),promoRef=doc('teyzaPromotions/'+uid),accountRef=doc('teyzaSellerAccounts/'+uid),
        lockRef=doc('teyzaPaystackCheckoutLocks/'+uid+'_'+(entry.kind==='promotion'?'promotion':'membership'));
      const [paySnap,billSnap,promoSnap,accountSnap,lockSnap,setupSnap,verificationSnap,shopSnap]=await Promise.all([
        tx.get(payRef),tx.get(billRef),tx.get(promoRef),tx.get(accountRef),tx.get(lockRef),
        tx.get(doc('teyzaSellerOnboarding/'+uid)),tx.get(doc('teyzaMobileVerification/'+uid)),tx.get(doc('teyzaPublicShops/'+uid))
      ]);
      const pay=paySnap.exists?paySnap.data():null,bill=billSnap.exists?billSnap.data():null,account=accountSnap.exists?accountSnap.data():null;
      if(!pay||pay.ownerUid!==uid)D.fail(409,'The payment owner changed.');
      if(pay.status==='paid')return {paid:true,kind:pay.kind,reference,alreadyConfirmed:true};
      if(pay.status!=='pending')D.fail(409,'This payment cannot be activated.');
      D.seller(account,uid);
      // Approval and identity evidence can change after checkout starts.
      // A subsequent charge must be recorded for refund review, not unlock products.
      const setup=setupSnap.exists?setupSnap.data():{};
      const selfie=verificationSnap.exists?verificationSnap.data():null;
      // Legacy approved accounts may predate the modern onboarding record.
      // Keep their supported path, but never accept an outstanding selfie review.
      const modern=setup.requiredVersion===2;
      const current=modern?P.state(uid,account,setup,selfie,
        shopSnap.exists?shopSnap.data():null,bill,now):null;
      const accessChanged=account.approvalStatus!=='approved'||
        (selfie!=null&&selfie.status!=='approved')||
        (modern&&(!current.ready||!current.approved||current.status==='suspended'));
      if(account.deletionPending===true||accessChanged){
        tx.update(payRef,{status:'refund_review',verifiedAt:now,transactionId:String(verified.id||''),
          paymentEnvironment:entry.environment,reviewReason:account.deletionPending===true?
            'account_closed_after_checkout':'seller_verification_changed_after_checkout'});
        if(lockSnap.exists&&lockSnap.data().reference===reference)tx.update(lockRef,{status:'refund_review',updatedAt:now});
        return {paid:false,kind:pay.kind,reference,refundReviewRequired:true};
      }
      if(pay.kind==='promotion') {
        if(!P.entitled(uid,account,bill,now))D.fail(403,'Promotion requires a current paid seller membership.');
        const start=Math.max(now,promoSnap.exists?promoSnap.data()?.endsAt||0:0);
        tx.set(promoRef,{ownerUid:uid,status:'active',startsAt:now,
          endsAt:start+PROMO_MS,lastReference:reference,updatedAt:now},{merge:true});
      } else {
        const base=Math.max(paidAt,Number(bill?.paidUntil)||0),paidUntil=nextMonth(base);
        tx.set(billRef,{ownerUid:uid,status:'paid',introUsed:bill?.introUsed===true||pay.kind==='intro',
          monthlyCents:pay.amountCents,standardMonthlyCents:MONTHLY_CENTS,
          paidUntil,lastReference:reference,latestPeriod:P.period(now),
          paymentProvider:'paystack',paymentEnvironment:entry.environment,paystackCustomerCode:verified.customer?.customer_code||bill?.paystackCustomerCode||'',
          renewalSetup:entry.renewalStrategy==='delayed_plan'?'pending':bill?.renewalSetup||'action_required',
          updatedAt:now},{merge:true});
        tx.update(accountRef,{listingPlan:'basic',updatedAt:new Date(now)});
      }
      const paymentEnvironment=entry.environment;
      tx.update(payRef,{status:'paid',verifiedAt:now,transactionId:String(verified.id||''),paymentEnvironment});
      if(lockSnap.exists&&lockSnap.data().reference===reference)tx.update(lockRef,{status:'paid',updatedAt:now});
      return {paid:true,kind:pay.kind,reference,paymentEnvironment,paidUntil:pay.kind==='promotion'?null:nextMonth(Math.max(paidAt,Number(bill?.paidUntil)||0))};
    });
    if(result.paid&&entry.renewalStrategy==='delayed_plan'){
      const bill=await read('teyzaBilling/'+uid);
      if(bill?.lastReference===reference&&bill.renewalSetup==='pending')
        await provisionRenewal(uid,verified,bill.paidUntil,entry);
    }
    await refresh(uid);
    return result;
  }
  async function provisionRenewal(uid,verified,startsAt,entry) {
    const code=getPlanCode();
    if(!/^PLN_[A-Za-z0-9]+$/.test(code||'')||!verified.authorization?.reusable||
       !verified.authorization?.authorization_code||!verified.customer?.customer_code||!Number.isFinite(startsAt)||
       startsAt<=clock()+300000) {
      await doc('teyzaBilling/'+uid).set({renewalSetup:'action_required'},{merge:true});
      return;
    }
    let previous='';
    if(entry.previousSubscriptionCode){
      try{
        const sub=await paystack('/subscription/'+encodeURIComponent(entry.previousSubscriptionCode));
        if(sub.subscription_code!==entry.previousSubscriptionCode||sub.domain!==entry.environment||
          sub.customer?.customer_code!==verified.customer.customer_code||!['cancelled','completed','complete'].includes(sub.status))
          throw Error('Previous subscription is not closed');
        previous=sub.subscription_code;
      }catch(_){await doc('teyzaBilling/'+uid).set({renewalSetup:'action_required'},{merge:true});return;}
    }
    const lease=doc('teyzaPaystackRenewal/'+uid);
    const claimed=await db.runTransaction(async tx=>{
      const [snap,accountSnap,billSnap]=await Promise.all([
        tx.get(lease),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaBilling/'+uid))]);
      const state=snap.exists?snap.data():{},account=accountSnap.exists?accountSnap.data():null,
        bill=billSnap.exists?billSnap.data():null;
      if(account?.uid!==uid||account.deletionPending===true||account.approvalStatus!=='approved'||
        bill?.ownerUid!==uid||bill.status!=='paid'||bill.lastReference!==verified.reference)return false;
      if(state.status==='processing'||state.status==='needs_attention')return false;
      if(state.status==='created'&&(state.firstPaymentReference===verified.reference||!previous||state.subscriptionCode!==previous))return false;
      tx.set(lease,{status:'processing',attemptedAt:clock(),firstPaymentReference:verified.reference});
      return true;
    });
    if(!claimed)return;
    try {
      const plan=await paystack('/plan/'+encodeURIComponent(code));
      if(plan.plan_code!==code||plan.domain!==entry.environment||plan.currency!=='ZAR'||
        (plan.invoice_limit!=null&&plan.invoice_limit!==0)||
        plan.interval!=='monthly'||plan.amount!==MONTHLY_CENTS)throw Error('Renewal plan changed');
      const account=await read('teyzaSellerAccounts/'+uid);
      if(account?.uid!==uid||account.deletionPending===true||account.approvalStatus!=='approved'){
        await lease.set({status:'cancelled_before_creation',updatedAt:clock()},{merge:true});
        return;
      }
      const data=await paystack('/subscription','POST',{customer:verified.customer.customer_code,
        plan:code,authorization:verified.authorization.authorization_code,
        start_date:new Date(startsAt).toISOString()});
      if(!/^SUB_[A-Za-z0-9]+$/.test(data.subscription_code||'')||data.domain!==entry.environment||data.amount!==MONTHLY_CENTS)
        throw Error('Subscription was not confirmed');
      // Independent Paystack check: a successful POST does not prove the
      // actual next debit matches the first day of the SA calendar month.
      const actual=await paystack('/subscription/'+encodeURIComponent(data.subscription_code));
      const chargedAt=Date.parse(actual.next_payment_date||'');
      const startOfDaySA=startsAt-2*3600000,followingDaySA=startOfDaySA+86400000;
      if(actual.subscription_code!==data.subscription_code||
         actual.domain!==entry.environment||
         actual.customer?.customer_code!==verified.customer.customer_code||
         actual.plan?.plan_code!==code||
         !Number.isFinite(chargedAt)||chargedAt<startOfDaySA||chargedAt>=followingDaySA)
        throw Error('Paystack next renewal date is not independently verified for the first of the month');
      await doc('teyzaBilling/'+uid).set({paystackSubscriptionCode:data.subscription_code,
        renewalSetup:'scheduled',nextBillingAt:chargedAt},{merge:true});
      await lease.set({status:'created',subscriptionCode:data.subscription_code,
        nextBillingAt:chargedAt,createdAt:clock()},{merge:true});
    }catch(_){
      // Do not blindly retry: a network failure may occur after Paystack created the subscription.
      await lease.set({status:'needs_attention',updatedAt:clock()},{merge:true});
      await doc('teyzaBilling/'+uid).set({renewalSetup:'action_required'},{merge:true});
    }
  }
  async function execute(auth,action,data={}) {
    if(action==='billing_checkout')return checkout(auth,'membership',data);
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
    if(action==='ops_paystack_confirm') {
      recentAdmin(auth,clock);
      const sellerUid=D.id(data.sellerUid);
      if(sellerUid===auth.uid)D.fail(403,'Another administrator must review your own payment.');
      const reference=D.text(data.reference,'Paystack membership reference',70);
      if(!/^TZM[_-][a-f0-9]{26}$/.test(reference))
        D.fail(422,'Choose a Teyza-issued Paystack membership reference for this shop.');
      // Server checks original reference ownership and Paystack's verified
      // status, currency, amount and customer before granting membership.
      const result=await grant(reference,sellerUid);
      return {verified:result.paid===true,reference,alreadyConfirmed:!!result.alreadyConfirmed};
    }
    if(action==='ops_paystack_refund_confirm'){
      recentAdmin(auth,clock);
      const uid=D.id(data.sellerUid),reference=D.text(data.reference,'payment reference',70),
        refundId=String(data.refundId||'');
      if(uid===auth.uid)D.fail(403,'Another administrator must review your own refund.');
      if(!/^(TZM|TZP)[_-][a-f0-9]{26}$/.test(reference)||!/^[0-9]{1,20}$/.test(refundId))
        D.fail(422,'Provide the Teyza payment reference and Paystack refund ID.');
      const payRef=doc('teyzaPaystackPayments/'+reference),pay=await read(payRef.path);
      if(!pay||pay.ownerUid!==uid)D.fail(403,'This payment belongs to another account.');
      if(pay.status==='refunded')return {refunded:true,alreadyConfirmed:true};
      if(pay.status!=='refund_review'||pay.environment!==environment()||!/^[0-9]+$/.test(pay.transactionId||''))
        D.fail(409,'This payment is not awaiting refund review in the current environment.');
      const refund=await paystack('/refund/'+encodeURIComponent(refundId));
      const transactionId=typeof refund.transaction==='object'?refund.transaction?.id:refund.transaction;
      if((typeof transactionId==='number'&&!Number.isSafeInteger(transactionId))||
        (typeof refund.id==='number'&&!Number.isSafeInteger(refund.id))||String(transactionId)!==pay.transactionId||
        String(refund.id)!==refundId||refund.domain!==pay.environment||refund.status!=='processed'||
        refund.currency!=='ZAR'||refund.amount!==pay.amountCents)
        D.fail(409,'Paystack has not confirmed a full processed refund for this payment.');
      const lockRef=doc('teyzaPaystackCheckoutLocks/'+uid+'_'+(pay.kind==='promotion'?'promotion':'membership'));
      await db.runTransaction(async tx=>{
        const [p,l]=await Promise.all([tx.get(payRef),tx.get(lockRef)]);
        if(!p.exists||p.data().ownerUid!==uid||p.data().status!=='refund_review')D.fail(409,'Payment review changed.');
        tx.update(payRef,{status:'refunded',refundId,refundConfirmedAt:clock()});
        if(l.exists&&l.data().reference===reference)tx.update(lockRef,{status:'refunded',updatedAt:clock()});
        tx.create(doc('teyzaOperationsAudit/'+crypto.randomUUID()),{actorUid:auth.uid,target:uid,
          action:'ops_paystack_refund_confirm',reference,refundId,createdAt:clock()});
      });
      return {refunded:true,reference};
    }
    D.fail(404,'Unknown billing action.');
  }
  async function webhook(raw,signature,payload,modernSignature) {
    if(!webhookSignature.verifyWebhook({raw,legacy:signature,modern:modernSignature,
       secretKey:getSecret(),signingSecret:getSigningSecret(),now:clock()}))
       D.fail(401,'Invalid Paystack webhook signature.');
    requireSafeMode(getSecret());
    const event=payload?.event,details=payload?.data||{};
    if(event==='subscription.disable'||event==='subscription.not_renew'||event==='invoice.payment_failed'){
      if(details.domain!==environment())return {accepted:true};
      const code=details.subscription?.subscription_code||details.subscription_code;
      if(!/^SUB_[A-Za-z0-9]+$/.test(code||''))return {accepted:true};
      const matched=await db.collection('teyzaBilling').where('paystackSubscriptionCode','==',code).limit(2).get();
      if(matched.docs.length!==1)return {accepted:true};
      const bill=matched.docs[0];
      await bill.ref.set({renewalSetup:event==='invoice.payment_failed'?'payment_failed':'cancelled',
        updatedAt:clock()},{merge:true});
      return {accepted:true};
    }
    if(event==='charge.success'){
      const ref=details.reference;
      if(typeof ref==='string'&&/^(TZM|TZP)[_-][a-f0-9]{26}$/.test(ref))await grant(ref);
      return {accepted:true};
    }
    // A signed invoice update links the charge to its exact subscription;
    // charge.success alone does not reliably identify which subscription paid.
    if(event!=='invoice.update'||details.domain!==environment()||
      !(details.paid===true||details.paid===1)||details.status!=='success')return {accepted:true};
    const ref=details.transaction?.reference,code=details.subscription?.subscription_code;
    if(typeof ref!=='string'||!/^[A-Za-z0-9=._-]{4,100}$/.test(ref)||!/^SUB_[A-Za-z0-9]+$/.test(code||'')||
      details.amount!==MONTHLY_CENTS||details.transaction?.amount!==MONTHLY_CENTS||
      details.transaction?.currency!=='ZAR'||details.transaction?.status!=='success')return {accepted:true};
    const rows=await db.collection('teyzaBilling').where('paystackSubscriptionCode','==',code).limit(2).get();
    if(rows.docs.length!==1)return {accepted:true};
    const row=rows.docs[0],uid=row.id,billing=row.data();
    const [verified,subscription]=await Promise.all([
      paystack('/transaction/verify/'+encodeURIComponent(ref)),
      paystack('/subscription/'+encodeURIComponent(code))]);
    if(verified.reference!==ref||verified.status!=='success'||verified.domain!==environment()||
      verified.amount!==MONTHLY_CENTS||verified.currency!=='ZAR'||
      !verified.customer?.customer_code||verified.customer.customer_code!==billing.paystackCustomerCode||
      details.customer?.customer_code!==verified.customer.customer_code||
      subscription.subscription_code!==code||subscription.domain!==environment()||
      subscription.customer?.customer_code!==verified.customer.customer_code||
      subscription.plan?.plan_code!==getPlanCode()||subscription.amount!==MONTHLY_CENTS)return {accepted:true};
    const paidAt=Date.parse(verified.paid_at||verified.paidAt||'');
    if(!Number.isFinite(paidAt)||paidAt>clock()+300000)return {accepted:true};
    await db.runTransaction(async tx=>{
      const payment=doc('teyzaPaystackPayments/'+ref),billRef=doc('teyzaBilling/'+uid),
        ownerRef=doc('teyzaSellerAccounts/'+uid);
      const [existing,old,shop]=await Promise.all([tx.get(payment),tx.get(billRef),tx.get(ownerRef)]);
      if(existing.exists)return;
      const account=shop.exists?shop.data():null,bill=old.exists?old.data():null;
      if(account?.uid!==uid||account.deletionPending===true||
        account.listingPlan!=='basic'||bill?.ownerUid!==uid||
        bill.paystackCustomerCode!==verified.customer.customer_code||bill.paymentEnvironment!==environment()||
        bill.paystackSubscriptionCode!==code)
        D.fail(409,'Subscription owner or membership changed.');
      const now=clock(),base=Math.max(paidAt,Number(bill.paidUntil)||0);
      tx.create(payment,{reference:ref,ownerUid:uid,kind:'renewal',amountCents:MONTHLY_CENTS,
        currency:'ZAR',status:'paid',verifiedAt:now,transactionId:String(verified.id||'')});
      tx.set(billRef,{status:'paid',monthlyCents:MONTHLY_CENTS,standardMonthlyCents:MONTHLY_CENTS,
        paidUntil:nextMonth(base),nextBillingAt:nextMonth(base),lastReference:ref,latestPeriod:P.period(now),
        paymentProvider:'paystack',paymentEnvironment:environment(),
        renewalSetup:bill.renewalSetup==='cancelled'?'cancelled':'active',updatedAt:now},{merge:true});
    });
    await refresh(uid);return {accepted:true};
  }
  return {execute,webhook,actions,grant};
}
module.exports={createBilling,actions,nextMonth,verifySignature,validCheckoutUrl,
  MONTHLY_CENTS,PROMO_CENTS,PROMO_MS,SUBSCRIPTION_TERMS_VERSION};
