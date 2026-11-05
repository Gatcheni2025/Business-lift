'use strict';
// Shopper purchases of physical goods/services. Completely separate from
// Teyza's digital seller membership subscription and promotion billing.
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication');
const {recentAdmin}=require('./seller-experience');
const {verifySignature,validCheckoutUrl}=require('./billing-paystack');
const actions=new Set(['ops_order_subaccount','order_paystack_checkout','order_paystack_verify']);
const allowedStatuses=new Set(['confirmed','preparing','ready','out_for_delivery']);
const refPattern=/^TZO-[a-f0-9]{26}$/;
const subPattern=/^ACCT_[A-Za-z0-9]{6,48}$/;
const mode=key=>key.startsWith('sk_live_')?'live':'test';
function createOrderPaystack({db,clock=Date.now,getSecret=()=>'',send=fetch,rate=async()=>{}}){
 const doc=p=>db.doc(p);
 const read=async p=>{const snap=await doc(p).get();return snap.exists?snap.data():null;};
 async function paystack(path,method='GET',body){
  const key=getSecret();
  if(!/^sk_(test|live)_/.test(key||''))D.fail(503,'Paystack is not configured for shopper payments.');
  let response;
  try{response=await send('https://api.paystack.co'+path,{method,headers:{
    Authorization:'Bearer '+key,'Content-Type':'application/json'
   },...(body?{body:JSON.stringify(body)}:{})});}
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
   const accountRef=doc('teyzaSellerAccounts/'+sellerUid),snap=await tx.get(accountRef);
   if(!snap.exists||snap.data().approvalStatus!=='approved')
    D.fail(409,'Seller approval changed. Refresh this shop.');
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
 async function startCheckout(auth,data){
  const orderId=D.id(data.orderId);
  if(!auth.email_verified||typeof auth.email!=='string'||!(/^[^@\s]+@[^@\s]+\.[^@\s]+$/).test(auth.email))
   D.fail(403,'Verify your account email address before making a Paystack payment.');
  await rate(auth.uid,'shopper-paystack-checkout',6,3600000);
  const order=await loadOrderForShopper(auth,orderId);
  if(!allowedStatuses.has(order.status))D.fail(409,'Wait for the shop to confirm the order before paying online.');
  if(order.paymentStatus==='paid'||order.paymentStatus==='test_paid')
   D.fail(409,'This order already has a confirmed Paystack payment.');
  if(order.paymentReference&&order.paymentStatus==='checkout_pending'){
   const existing=await read('teyzaOrderPayments/'+order.paymentReference);
   if(existing?.shopperUid===auth.uid&&existing.orderId===orderId&&
     existing.status==='pending'&&existing.checkoutUrl&&validCheckoutUrl(existing.checkoutUrl))
     return {reference:order.paymentReference,checkoutUrl:existing.checkoutUrl,
      paymentEnvironment:existing.environment,alreadyStarted:true};
   D.fail(409,'A Paystack payment is already being prepared for this order. Refresh your orders or contact support.');
  }
  if(!Number.isSafeInteger(order.totalCents)||order.totalCents<100||
    order.totalCents>5000000)D.fail(422,'The order amount cannot be collected online.');
  if((order.cashDiscountCents||0)!==0)
   D.fail(409,'This order has a cash-only discount. Request a new order without a cash discount to pay online.');
  const [seller,setup,verified,shop,billing,payout]=await Promise.all([
   read('teyzaSellerAccounts/'+order.ownerUid),
   read('teyzaSellerOnboarding/'+order.ownerUid),
   read('teyzaMobileVerification/'+order.ownerUid),
   read('teyzaPublicShops/'+order.ownerUid),
   read('teyzaBilling/'+order.ownerUid),
   read('teyzaSellerPayouts/'+order.ownerUid)
  ]);
  P.assertLive(order.ownerUid,seller,setup||{},verified,shop,billing,clock());
  if(!payout?.enabled||payout.ownerUid!==order.ownerUid||
      !subPattern.test(payout.code)||payout.mode!==mode(getSecret())||
      payout.verifiedWithPaystack!==true)
    D.fail(409,'This seller has not enabled verified Paystack payments yet.');
  const reference='TZO-'+crypto.randomBytes(13).toString('hex');
  await db.runTransaction(async tx=>{
   const orderRef=doc('teyzaMobileOrders/'+orderId),snapshot=await tx.get(orderRef);
   const current=snapshot.exists?snapshot.data():null;
   if(!current||current.shopperUid!==auth.uid||!allowedStatuses.has(current.status)||
     current.paymentReference||current.totalCents!==order.totalCents)
    D.fail(409,'Order payment state changed. Refresh your order before paying.');
   tx.create(doc('teyzaOrderPayments/'+reference),{
    reference,orderId,shopperUid:auth.uid,ownerUid:order.ownerUid,
    subaccountCode:payout.code,amountCents:order.totalCents,
    customerEmail:auth.email.toLowerCase(),environment:mode(getSecret()),
    status:'pending',createdAt:clock()
   });
   tx.update(orderRef,{paymentStatus:'checkout_pending',paymentReference:reference,updatedAt:clock()});
  });
  let checkout;
  try{
   checkout=await paystack('/transaction/initialize','POST',{
    email:auth.email.toLowerCase(),amount:order.totalCents,currency:'ZAR',
    reference,subaccount:payout.code,channels:['card','eft'],
    callback_url:'https://teyza.co.za/download.html?payment=order-return',
    metadata:JSON.stringify({source:'teyza_physical_goods',orderId,sellerUid:order.ownerUid})
   });
   if(!validCheckoutUrl(checkout.authorization_url))
    D.fail(503,'Paystack returned an unsafe checkout destination.');
   await doc('teyzaOrderPayments/'+reference).set({checkoutUrl:checkout.authorization_url,
    checkoutCreatedAt:clock()},{merge:true});
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
    paymentEnvironment:mode(getSecret()),amountCents:order.totalCents};
 }
 async function confirm(reference,expectedUid=null){
  if(!refPattern.test(reference))D.fail(422,'Invalid Teyza order-payment reference.');
  const stored=await read('teyzaOrderPayments/'+reference);
  if(!stored)D.fail(404,'Unknown Teyza order-payment reference.');
  if(expectedUid&&stored.shopperUid!==expectedUid)D.fail(403,'This payment belongs to another shopper.');
  if(['paid','test_paid','refund_review'].includes(stored.status))
   return {verified:stored.status==='paid',status:stored.status,alreadyConfirmed:true};
  if(stored.status!=='pending')D.fail(409,'This Paystack payment is not pending.');
  const verified=await paystack('/transaction/verify/'+encodeURIComponent(reference));
  if(verified.reference!==reference||verified.status!=='success'||verified.currency!=='ZAR'||
    verified.domain!==stored.environment||verified.amount!==stored.amountCents||
    verified.customer?.email?.toLowerCase()!==stored.customerEmail.toLowerCase())
   D.fail(409,'Paystack has not verified the expected order amount, currency and shopper.');
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
     !order||order.shopperUid!==row.shopperUid||order.ownerUid!==row.ownerUid||
     order.paymentReference!==reference||order.totalCents!==row.amountCents)
    D.fail(409,'Order or payment ownership changed. Teyza support must reconcile this charge.');
   if(row.status==='paid'||row.status==='test_paid')
    return {verified:row.status==='paid',status:row.status,alreadyConfirmed:true};
   if(row.status!=='pending')D.fail(409,'This payment was already processed.');
   const status=order.status==='cancelled'?'refund_review':row.environment==='test'?'test_paid':'paid';
   tx.update(payRef,{status,paystackTransactionId:verified.id||null,verifiedAt:stamp});
   tx.update(orderRef,{paymentStatus:status,paymentReference:reference,
     paymentMethod:status==='refund_review'?order.paymentMethod:'paystack',paymentVerifiedAt:stamp,
     updatedAt:stamp});
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
 async function webhook(raw,signature,event){
  if(!verifySignature(getSecret(),raw,signature))D.fail(401,'Invalid Paystack webhook signature.');
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
module.exports={actions,createOrderPaystack,refPattern,subPattern};
