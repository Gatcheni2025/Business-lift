'use strict';
// Shopper purchases of physical goods. Completely separate from
// Teyza's digital seller membership subscription and promotion billing.
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication');
const {recentAdmin}=require('./seller-experience');
const offers=require('./shop-services');
const {validCheckoutUrl:paystackCheckoutUrl}=require('./billing-paystack');
const {verifyWebhook}=require('./webhook-signature');
const actions=new Set(['ops_order_subaccount','order_paystack_checkout','order_paystack_verify']);
const allowedStatuses=new Set(['confirmed','preparing','ready','out_for_delivery']);
const refPattern=/^TZO-[a-f0-9]{26}$/;
const subPattern=/^ACCT_[A-Za-z0-9]{6,48}$/;
const mode=offers.paymentEnvironment;
const validShopperEmail=auth=>auth?.email_verified===true&&typeof auth.email==='string'&&
 /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(auth.email);
function validCheckoutUrl(value){
 if(!paystackCheckoutUrl(value))return false;
 const url=new URL(value);return !url.username&&!url.password&&(!url.port||url.port==='443');
}
function createOrderPaystack({db,clock=Date.now,getSecret=()=>'',getSigningSecret=()=>'',send=fetch,rate=async()=>{},
 getProjectId=()=>process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT||''}){
 const doc=p=>db.doc(p);
 const read=async p=>{const snap=await doc(p).get();return snap.exists?snap.data():null;};
 async function paystack(path,method='GET',body,expectedEnvironment=null){
  const key=getSecret();
  if(!/^sk_(test|live)_/.test(key||''))D.fail(503,'Paystack is not configured for shopper payments.');
  if(expectedEnvironment&&mode(key)!==expectedEnvironment)D.fail(409,'The payment environment changed. Teyza support must review this payment.');
  let response;
  try{response=await send('https://api.paystack.co'+path,{method,headers:{
    Authorization:'Bearer '+key,'Content-Type':'application/json'
   },signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});}
  catch(_){D.fail(503,'Paystack is temporarily unavailable. Try again.');}
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.status!==true||!payload.data)
   D.fail(503,'Paystack could not confirm the transaction. Try again.');
  return payload.data;
 }
 async function connectSubaccount(auth,data){
  recentAdmin(auth,clock);
  await rate(auth.uid,'paystack-subaccount-setup',10,3600000);
  const sellerUid=D.id(data.sellerUid);
  if(sellerUid===auth.uid)D.fail(403,'A separate administrator must configure your own shop payout details.');
  const code=D.text(data.subaccountCode,'Paystack subaccount code',80);
  if(!subPattern.test(code))D.fail(422,'Enter a valid Paystack ACCT_ subaccount code.');
  if(data.confirmed!==true)D.fail(422,'Confirm that you independently checked the Paystack subaccount and settlement beneficiary.');
  const account=await read('teyzaSellerAccounts/'+sellerUid);
  if(account?.uid!==sellerUid||account.approvalStatus!=='approved'||account.deletionPending===true)
   D.fail(409,'The seller must have an approved shop before activating Paystack settlement.');
  const live=mode(getSecret())==='live';
  const result=await paystack('/subaccount/'+encodeURIComponent(code));
  if(result.subaccount_code!==code||!result.active||result.currency!=='ZAR'||
     result.domain!==(live?'live':'test')||(live&&result.is_verified!==true))
   D.fail(409,'Subaccount is inactive, unverified for live settlement or belongs to a different Paystack environment/currency.');
  if(!Number.isFinite(Number(result.percentage_charge))||Number(result.percentage_charge)<0||
      Number(result.percentage_charge)>100)D.fail(409,'Paystack subaccount fee information is invalid.');
  const other=await db.collection('teyzaSellerPayouts').where('code','==',code).limit(2).get();
  if(other.docs.some(r=>r.id!==sellerUid))
   D.fail(409,'This Paystack settlement account is already assigned to another shop.');
  const stamp=clock();
  await db.runTransaction(async tx=>{
   const accountRef=doc('teyzaSellerAccounts/'+sellerUid);
   const assignmentRef=doc('teyzaPaystackSubaccounts/'+crypto.createHash('sha256').update((live?'live':'test')+':'+code).digest('hex'));
   const [snap,assignment]=await Promise.all([tx.get(accountRef),tx.get(assignmentRef)]);
   if(!snap.exists||snap.data().uid!==sellerUid||snap.data().deletionPending===true||snap.data().approvalStatus!=='approved')
    D.fail(409,'Seller approval changed. Refresh this shop.');
   if(assignment.exists&&assignment.data().ownerUid!==sellerUid)
    D.fail(409,'This settlement account is already assigned to another shop.');
   tx.set(assignmentRef,{ownerUid:sellerUid,code,environment:live?'live':'test',updatedAt:stamp});
   tx.set(doc('teyzaSellerPayouts/'+sellerUid),{
    ownerUid:sellerUid,code,mode:live?'live':'test',enabled:true,
    verifiedWithPaystack:true,verifiedAt:stamp,configuredBy:auth.uid,
    businessName:String(result.business_name||'').slice(0,140),
    accountName:String(result.account_name||'').slice(0,140),
    percentageCharge:Number(result.percentage_charge),updatedAt:stamp
   });
   tx.set(doc('teyzaOperationsAudit/'+crypto.randomUUID()),{
    actorUid:auth.uid,action:'ops_order_subaccount',target:sellerUid,createdAt:stamp,
    details:{subaccountCode:code,paystackMode:live?'live':'test',
      beneficiaryChecked:true,percentageCharge:Number(result.percentage_charge)}
   });
  });
  return {linked:true,subaccountCode:code,mode:live?'live':'test',
    percentageCharge:Number(result.percentage_charge)};
 }
 async function loadOrderForShopper(auth,orderId){
  const order=await read('teyzaMobileOrders/'+orderId);
  if(!order||order.shopperUid!==auth.uid)D.fail(403,'Order access denied.');
  return order;
 }
 async function checkoutSeller(order,tx=null){
  const keys=['teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/',
   'teyzaPublicShops/','teyzaBilling/','teyzaSellerPayouts/','teyzaShopSettings/'];
  const rows=await Promise.all(keys.map(async key=>{
   const snap=await (tx?tx.get(doc(key+order.ownerUid)):doc(key+order.ownerUid).get());
   return snap.exists?snap.data():null;
  }));
  const [seller,setup,verified,shop,billing,payout,services]=rows;
  P.assertLive(order.ownerUid,seller,setup||{},verified,shop,billing,clock());
  if(seller.deletionPending===true||seller.category!=='spaza'||
    (shop.shopCategory&&shop.shopCategory!==seller.category))
   D.fail(409,'This shop is not eligible for shopper online payments.');
  const settings=offers.effective(services,shop);
  // Honour an already placed legacy online order until the owner explicitly
  // chooses a new setting; never infer permission for fresh orders from POS.
  const explicit=typeof services?.onlinePaymentsEnabled==='boolean';
  const legacy=order.commerceVersion!==2&&!explicit&&settings.cardPayments;
  if(!settings.onlinePaymentsEnabled&&!legacy)
   D.fail(409,'This shop has disabled new online payments. Existing payments can still be checked.');
  if(!offers.validPayout(order.ownerUid,payout,mode(getSecret())))
   D.fail(409,'This seller needs verified Paystack settlement before accepting online payments.');
  return payout;
 }
 function assertOrder(order,auth){
  if(!order||order.shopperUid!==auth.uid)D.fail(403,'Order access denied.');
  if(order.orderType==='wholesale_stock'||order.paymentMethod!=='card_online')D.fail(409,'Online payment must be selected for a participating shop.');
  if(!allowedStatuses.has(order.status))D.fail(409,'Wait for the shop to confirm the order before paying online.');
  if(['paid','test_paid','refund_review'].includes(order.paymentStatus))D.fail(409,'This order already has a payment or needs payment review.');
  if(!Number.isSafeInteger(order.totalCents)||order.totalCents<100||order.totalCents>5000000||
    (order.currency!==undefined&&order.currency!=='ZAR'))D.fail(422,'The order amount or currency cannot be collected online.');
  if((order.cashDiscountCents||0)!==0)
   D.fail(409,'This order has a cash-only discount. Request a new order without a cash discount to pay online.');
 }
 async function startCheckout(auth,data){
  const orderId=D.id(data.orderId);
  if(!validShopperEmail(auth))
   D.fail(403,'Verify your account email address before making a Paystack payment.');
  await rate(auth.uid,'shopper-paystack-checkout',6,3600000);
  const order=await loadOrderForShopper(auth,orderId);
  assertOrder(order,auth);
  const environment=mode(getSecret());
  if(environment==='unconfigured')D.fail(503,'Online payments are not configured.');
  if(environment==='test'&&(auth.teyzaAdmin!==true||!getProjectId()||getProjectId()==='business-lift-3c19c'))
   D.fail(409,'Online payments are still in test mode. No shopper payment can be taken yet.');
  const payout=await checkoutSeller(order);
  if(order.paymentReference){
   return db.runTransaction(async tx=>{
    const [p,o]=await Promise.all([tx.get(doc('teyzaOrderPayments/'+order.paymentReference)),tx.get(doc('teyzaMobileOrders/'+orderId))]);
    const existing=p.exists?p.data():null,current=o.exists?o.data():null;
    assertOrder(current,auth);
    const currentPayout=await checkoutSeller(current,tx);
    if(current.paymentReference===order.paymentReference&&existing?.shopperUid===auth.uid&&existing.orderId===orderId&&
      existing.ownerUid===current.ownerUid&&existing.amountCents===current.totalCents&&
      existing.environment===environment&&existing.subaccountCode===currentPayout.code&&
      existing.status==='pending'&&!['reversed','unknown'].includes(existing.providerStatus)&&validCheckoutUrl(existing.checkoutUrl))
      return {reference:current.paymentReference,checkoutUrl:existing.checkoutUrl,
       paymentEnvironment:existing.environment,amountCents:existing.amountCents,alreadyStarted:true};
    D.fail(409,'A payment already exists for this order. Check its status or contact support; do not pay a second time.');
   });
  }
  const currentSubaccount=await paystack('/subaccount/'+encodeURIComponent(payout.code),'GET',undefined,environment);
  if(currentSubaccount.subaccount_code!==payout.code||currentSubaccount.active!==true||
    currentSubaccount.currency!=='ZAR'||currentSubaccount.domain!==environment||
    (environment==='live'&&currentSubaccount.is_verified!==true))
   D.fail(409,'The seller settlement account needs verification before this payment can start.');
  const reference='TZO-'+crypto.randomBytes(13).toString('hex');
  await db.runTransaction(async tx=>{
   const orderRef=doc('teyzaMobileOrders/'+orderId),snapshot=await tx.get(orderRef);
   const current=snapshot.exists?snapshot.data():null;
   assertOrder(current,auth);
   if(current.ownerUid!==order.ownerUid||current.paymentReference||current.totalCents!==order.totalCents)
    D.fail(409,'Order payment state changed. Refresh your order before paying.');
   const currentPayout=await checkoutSeller(current,tx);
   if(currentPayout.code!==payout.code||mode(getSecret())!==environment)
    D.fail(409,'Seller settlement changed. Refresh your order before paying.');
   tx.create(doc('teyzaOrderPayments/'+reference),{
    reference,orderId,shopperUid:auth.uid,ownerUid:order.ownerUid,
    subaccountCode:payout.code,amountCents:order.totalCents,
    customerEmail:auth.email.toLowerCase(),environment,
    status:'pending',createdAt:clock()
   });
   tx.update(orderRef,{paymentStatus:'checkout_pending',paymentReference:reference,
    paymentEnvironment:environment,paymentCheckoutReady:false,updatedAt:clock()});
  });
  let checkout;
  try{
   checkout=await paystack('/transaction/initialize','POST',{
    email:auth.email.toLowerCase(),amount:order.totalCents,currency:'ZAR',
    reference,subaccount:payout.code,channels:['card','eft'],
    callback_url:'https://teyza.co.za/order-payment-return.html',
    metadata:JSON.stringify({source:'teyza_physical_goods',orderId,sellerUid:order.ownerUid})
   },environment);
   if(checkout.reference!==reference||!validCheckoutUrl(checkout.authorization_url))
    D.fail(503,'Paystack returned an unsafe checkout destination.');
   await doc('teyzaOrderPayments/'+reference).set({checkoutUrl:checkout.authorization_url,
    checkoutCreatedAt:clock()},{merge:true});
   await db.runTransaction(async tx=>{
    const ref=doc('teyzaMobileOrders/'+orderId),snap=await tx.get(ref);
    if(snap.exists&&snap.data().paymentReference===reference)
     tx.update(ref,{paymentCheckoutReady:true});
   });
  }catch(error){
   // A timeout can occur AFTER Paystack creates a chargeable checkout.
   // Never release this reference automatically: that could start a second
   // payment for the same order. Reconcile before permitting another charge.
   await doc('teyzaOrderPayments/'+reference).set({
     initializationUncertain:true,lastInitializationErrorAt:clock()
   },{merge:true});
   throw error;
  }
  return {checkoutUrl:checkout.authorization_url,reference,
    paymentEnvironment:environment,amountCents:order.totalCents};
 }
 async function confirm(reference,expectedUid=null){
  if(!refPattern.test(reference))D.fail(422,'Invalid Teyza order-payment reference.');
  const stored=await read('teyzaOrderPayments/'+reference);
  if(!stored)D.fail(404,'Unknown Teyza order-payment reference.');
  if(expectedUid&&stored.shopperUid!==expectedUid)D.fail(403,'This payment belongs to another shopper.');
  if(['paid','test_paid','refund_review'].includes(stored.status))
   return {verified:stored.status==='paid',status:stored.status,alreadyConfirmed:true};
  if(stored.status!=='pending')D.fail(409,'This Paystack payment is not pending.');
  const verified=await paystack('/transaction/verify/'+encodeURIComponent(reference),'GET',undefined,stored.environment);
  if(verified.reference!==reference||verified.currency!=='ZAR'||
    verified.domain!==stored.environment||verified.amount!==stored.amountCents||
    typeof verified.customer?.email!=='string'||typeof stored.customerEmail!=='string'||
    verified.customer.email.toLowerCase()!==stored.customerEmail.toLowerCase())
   D.fail(409,'Paystack has not verified the expected order amount, currency and shopper.');
  if(verified.status!=='success'){
   const providerStatus=['failed','abandoned','pending','ongoing','processing','queued','reversed'].includes(verified.status)?verified.status:'unknown';
   const failed=['failed','abandoned'].includes(providerStatus);
   return db.runTransaction(async tx=>{
    const payRef=doc('teyzaOrderPayments/'+reference),orderRef=doc('teyzaMobileOrders/'+stored.orderId);
    const [p,o]=await Promise.all([tx.get(payRef),tx.get(orderRef)]);
    const row=p.exists?p.data():null,order=o.exists?o.data():null;
    if(!row||row.shopperUid!==stored.shopperUid||row.amountCents!==stored.amountCents||
      !order||order.shopperUid!==stored.shopperUid||order.ownerUid!==stored.ownerUid||order.paymentReference!==reference)
     D.fail(409,'Order payment ownership changed. Contact Teyza support.');
    if(['paid','test_paid','refund_review'].includes(row.status))
     return {verified:row.status==='paid',status:row.status,alreadyConfirmed:true};
    const status=providerStatus==='reversed'?'refund_review':failed?'payment_failed':'checkout_pending';
    const canResume=!['reversed','unknown'].includes(providerStatus)&&validCheckoutUrl(row.checkoutUrl||'');
    tx.update(payRef,{providerStatus,lastCheckedAt:clock(),...(providerStatus==='reversed'?{status:'refund_review'}:{})});
    tx.update(orderRef,{paymentStatus:status,paymentProviderStatus:providerStatus,paymentLastCheckedAt:clock(),paymentCheckoutReady:canResume});
    return {verified:false,status,providerStatus,canResume,
      environment:row.environment};
   });
  }
  const receivedSubaccount=typeof verified.subaccount==='string'?verified.subaccount:
    verified.subaccount?.subaccount_code||verified.subaccount?.code||'';
  if(receivedSubaccount!==stored.subaccountCode)
   D.fail(409,'Paystack settlement account does not match this shop. Contact Teyza support before treating this as paid.');
  const stamp=clock();
  return db.runTransaction(async tx=>{
   const payRef=doc('teyzaOrderPayments/'+reference),orderRef=doc('teyzaMobileOrders/'+stored.orderId);
   const [p,o]=await Promise.all([tx.get(payRef),tx.get(orderRef)]);
   const row=p.exists?p.data():null,order=o.exists?o.data():null;
   if(!row||row.ownerUid!==stored.ownerUid||row.shopperUid!==stored.shopperUid||
     row.amountCents!==stored.amountCents||row.environment!==stored.environment||row.subaccountCode!==stored.subaccountCode||
     row.customerEmail!==stored.customerEmail||row.orderId!==stored.orderId||
     !order||order.shopperUid!==row.shopperUid||order.ownerUid!==row.ownerUid||
     order.paymentReference!==reference||order.totalCents!==row.amountCents)
    D.fail(409,'Order or payment ownership changed. Teyza support must reconcile this charge.');
   if(['paid','test_paid','refund_review'].includes(row.status))
    return {verified:row.status==='paid',status:row.status,alreadyConfirmed:true};
   if(row.status!=='pending')D.fail(409,'This payment was already processed.');
   const status=order.status==='cancelled'?'refund_review':row.environment==='test'?'test_paid':'paid';
   tx.update(payRef,{status,providerStatus:'success',paystackTransactionId:verified.id||null,verifiedAt:stamp});
   tx.update(orderRef,{paymentStatus:status,paymentReference:reference,
     paymentMethod:status==='refund_review'?order.paymentMethod:'paystack',paymentVerifiedAt:stamp,
     paymentProviderStatus:'success',updatedAt:stamp});
   return {verified:status==='paid',status,environment:row.environment,
     refundReviewRequired:status==='refund_review'};
  });
 }
 async function execute(auth,action,data={}){
  if(action==='ops_order_subaccount')return connectSubaccount(auth,data);
  if(action==='order_paystack_checkout')return startCheckout(auth,data);
  if(action==='order_paystack_verify'){
   await rate(auth.uid,'shopper-paystack-verify',25,3600000);
   const reference=D.text(data.reference,'Paystack order reference',64);
   return confirm(reference,D.id(auth.uid));
  }
  D.fail(404,'Unknown order payment action.');
 }
 async function webhook(raw,signature,event,modernSignature){
  if(!verifyWebhook({raw,legacy:signature,modern:modernSignature,
     secretKey:getSecret(),signingSecret:getSigningSecret(),now:clock()}))D.fail(401,'Invalid Paystack webhook signature.');
  if(event?.event!=='charge.success'||!refPattern.test(event?.data?.reference||''))
   return {accepted:true};
  try{return await confirm(event.data.reference);}
  catch(error){
   if(error.status===409)return {accepted:true,pendingReview:true};
   throw error;
  }
 }
 return {execute,webhook};
}
module.exports={actions,createOrderPaystack,refPattern,subPattern,validShopperEmail};
