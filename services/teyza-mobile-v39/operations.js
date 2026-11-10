'use strict';
const crypto=require('node:crypto'),D=require('./domain'),{recentAdmin}=require('./seller-experience'),P=require('./publication'),BillingOverview=require('./billing-overview');
const actions=new Set(['ops_sellers','ops_seller_detail','ops_catalogue_queue','ops_catalogue_publish','ops_complimentary_access','ops_complimentary_revoke','ops_invoice','ops_payment','ops_payment_reverse','ops_finance_queue','ops_finance_decide','ops_support_list','ops_support_create','ops_support_update','ops_support_detail','seller_billing_statement','seller_billing_overview','seller_support_create','seller_support_list','seller_support_open','seller_support_thread','seller_support_message','ops_support_reply','ops_support_thread']);
const PRICE=9900;
const row=s=>({id:s.id,...s.data()});
function period(value){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value||''))D.fail(422,'Choose a billing month in YYYY-MM format.');return value;}
function amount(value){if(!Number.isSafeInteger(value)||value<=0||value>50000000)D.fail(422,'Enter a valid amount in cents.');return value;}
function statement(entries){let balance=0;return entries.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).map(e=>({...e,balanceCents:balance+=(e.debitCents||0)-(e.creditCents||0)}));}
function financePath(value){if(!/^teyzaCreditEnquiries\/[A-Za-z0-9_-]{1,128}\/requests\/[A-Za-z0-9_-]{1,128}$/.test(value||''))D.fail(422,'Choose a valid stock finance request.');return value;}
function createOperations({db,clock=Date.now,rate,getPaystackMode=()=> 'test',getAuthUser=async()=>null,synchronize=async()=>{}}){
 const doc=p=>db.doc(p),read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
 const owner=async uid=>D.seller(await read('teyzaSellerAccounts/'+uid),uid);
 function audit(tx,auth,action,target,details){tx.set(doc('teyzaOperationsAudit/'+crypto.randomUUID()),{actorUid:auth.uid,action,target,details,createdAt:clock()});}
 async function ledger(uid){const rows=await db.collection('teyzaBilling/'+uid+'/entries').orderBy('createdAt','desc').limit(501).get();if(rows.docs.length>500)D.fail(422,'This account needs an archived statement export before it can be displayed in full.');return {entries:statement(rows.docs.map(row)),truncated:false};}
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid),self=action.startsWith('seller_');
  if(self){if(!auth.email_verified&&!auth.phone_number)D.fail(403,'Verify your email or phone first.');await owner(uid);}
  else recentAdmin(auth,clock);
  await rate(uid,'operations',60,60000);
  // Historical entries remain available in statements. Manual receipts may
  // never activate membership now that Paystack verifies all new charges.
  if(['ops_invoice','ops_payment','ops_payment_reverse'].includes(action))
    D.fail(410,'Manual mandate invoices and receipt activation are retired. Use Paystack checkout and verified transactions.');
  if(action==='seller_billing_overview'){
    // Bound solely to the authenticated Firebase UID; never accept sellerUid/email.
    const account=await owner(uid);
    const [bill,history]=await Promise.all([
      read('teyzaBilling/'+uid),
      db.collection('teyzaPaystackPayments').where('ownerUid','==',uid).limit(101).get()
    ]);
    const entries=history.docs.filter(row=>row.data().ownerUid===uid)
      .map(row=>({reference:row.id,...row.data()}));
    return {...BillingOverview.summarize(uid,account,bill,entries,clock()),
      historyTruncated:history.docs.length>100};
  }
  if(action==='ops_complimentary_revoke'){
    const target=D.id(data.sellerUid);
    if(target===uid)D.fail(403,'Another administrator must review your shop access.');
    const reason=D.text(data.reason,'reason for revoking complimentary access',250);
    if(reason.length<15||data.confirmed!==true)
      D.fail(422,'Confirm the revocation and enter a reason of at least 15 characters.');
    const stamp=clock();
    await db.runTransaction(async tx=>{
      const billRef=doc('teyzaBilling/'+target),old=await tx.get(billRef);
      const saved=old.exists?old.data():null;
      if(!saved||saved.ownerUid!==target||saved.adminComplimentaryStatus!=='active')
        D.fail(409,'There is no active complimentary access grant for this shop.');
      tx.update(billRef,{adminComplimentaryStatus:'revoked',
        adminComplimentaryRevokedAt:stamp,adminComplimentaryRevokedBy:uid,
        adminComplimentaryRevocationReason:reason,updatedAt:stamp});
      audit(tx,auth,'ops_complimentary_revoke',target,{grantId:saved.adminComplimentaryGrantId,
        reason,previousUntil:saved.adminComplimentaryUntil,noPaymentReversal:true});
    });
    await synchronize(target);
    return {revoked:true,noPaymentReversal:true};
  }
  if(action==='ops_complimentary_access'){
    const target=D.id(data.sellerUid),duration=Number(data.days);
    if(target===uid)D.fail(403,'Another administrator must grant access to your shop.');
    if(![7,14,30].includes(duration))D.fail(422,'Choose 7, 14 or 30 days of complimentary access.');
    if(data.confirmed!==true)D.fail(422,'Confirm this is complimentary access, not a Paystack payment.');
    const reason=D.text(data.reason,'complimentary access reason',250);
    if(reason.length<15)D.fail(422,'Provide a meaningful reason of at least 15 characters.');
    const account=await owner(target);
    if(account.approvalStatus!=='approved'||account.deletionPending===true)
      D.fail(409,'Verify and approve this shop before granting a temporary payment exception.');
    const previous=await read('teyzaBilling/'+target);
    const now=clock(),grantId=crypto.randomUUID(),until=now+duration*86400000;
    await db.runTransaction(async tx=>{
      const ref=doc('teyzaBilling/'+target),saved=await tx.get(ref);
      const current=saved.exists?saved.data():null;
      const accountSnap=await tx.get(doc('teyzaSellerAccounts/'+target));
      if(!accountSnap.exists||accountSnap.data().approvalStatus!=='approved')
        D.fail(409,'Shop approval changed. Refresh the seller record.');
      if(current?.ownerUid&&current.ownerUid!==target)D.fail(403,'Billing account does not match this seller.');
      if(P.complimentary(target,accountSnap.data(),current,now))
        D.fail(409,'A complimentary membership is already active; revoke it before issuing another.');
      tx.set(ref,{ownerUid:target,adminComplimentaryStatus:'active',
        adminComplimentaryUntil:until,adminComplimentaryBy:uid,
        adminComplimentaryReason:reason,adminComplimentaryGrantedAt:now,
        adminComplimentaryGrantId:grantId,updatedAt:now},{merge:true});
      audit(tx,auth,'ops_complimentary_access',target,{grantId,days:duration,until,reason,
        paystackCharge:false,doesNotProvePayment:true});
    });
    await synchronize(target);
    return {granted:true,grantId,until,paid:false,provider:'complimentary_admin'};
  }
  if(action==='ops_catalogue_publish'){
   const target=D.id(data.sellerUid),reason=D.text(data.reason,'publication review reason',250);
   if(target===uid)D.fail(403,'Another administrator must publish your shop products.');
   if(data.confirmed!==true||reason.length<15)
     D.fail(422,'Confirm publication and enter a reason of at least 15 characters.');
   const [account,setup,verification,shop,billing]=await Promise.all([
     read('teyzaSellerAccounts/'+target),read('teyzaSellerOnboarding/'+target),
     read('teyzaMobileVerification/'+target),read('teyzaPublicShops/'+target),read('teyzaBilling/'+target)]);
   if(account?.uid!==target)D.fail(404,'The seller account was not found.');
   if(account.category==='wholesale')D.fail(409,'Wholesalers are public shop listings only. No products may be published to shoppers.');
   if(!['spaza','retail'].includes(account.category))D.fail(409,'Choose a spaza shop or other business.');
   const state=P.state(target,account,setup||{},verification,shop,billing,clock());
   if(!state.canSell||shop?.status!=='active')
     D.fail(409,'Shop setup, seller verification and active paid or temporary selling access are required.');
   const result=await synchronize(target,{publishIntent:true});
   if(result.publication!=='live')D.fail(409,'Seller access changed. Refresh the shop before publishing.');
   await db.runTransaction(async tx=>{
     audit(tx,auth,action,target,{reason,publicProductCount:result.publicCount,noPaymentRecorded:true});
   });
   return {published:true,publicProductCount:result.publicCount,noPaymentRecorded:true};
  }
  if(action==='ops_catalogue_queue'){
    const result=await db.collection('teyzaCatalogueSubmissions')
      .where('status','==','pending_review').limit(50).get();
    const rows=await Promise.all(result.docs.map(async row=>{
      const target=row.id,submission=row.data();
      if(submission.ownerUid!==target)return null;
      const [account,billing]=await Promise.all([
        read('teyzaSellerAccounts/'+target),read('teyzaBilling/'+target)]);
      if(account?.uid!==target)return null;
      return {sellerUid:target,shopName:account.shopName||'Shop',
        ownerEmail:account.ownerEmail||'',approvalStatus:account.approvalStatus||'pending',
        productCount:Array.isArray(submission.products)?submission.products.length:0,
        submittedAt:submission.submittedAt||0,
        paidMembership:P.entitled(target,account,billing,clock()),
        complimentaryAccess:P.complimentary(target,account,billing,clock()),
        paymentStatus:billing?.status||'not_started'};
    }));
    return {submissions:rows.filter(Boolean),limited:result.docs.length===50};
  }
  if(action==='ops_sellers'){
   let q=db.collection('teyzaSellerAccounts').orderBy('__name__').limit(31);if(data.after)q=q.startAfter(D.id(data.after));
   const result=await q.get(),rows=result.docs.slice(0,30);const billing=await Promise.all(rows.map(s=>read('teyzaBilling/'+s.id)));
   return {sellers:rows.map((s,i)=>{const a=s.data();return {sellerUid:s.id,shopName:a.shopName||'',ownerEmail:a.ownerEmail||'',phone:a.phone||'',address:a.address||'',category:a.category||'',approvalStatus:a.approvalStatus||'pending',subscription:P.entitled(s.id,a,billing[i],clock())?'premium':P.complimentary(s.id,a,billing[i],clock())?'temporary_access':'free'};}),next:result.docs.length>30?rows.at(-1).id:null};
  }
  if(action==='ops_seller_detail'||action==='seller_billing_statement'){
   const target=self?uid:D.id(data.sellerUid),account=await owner(target);
   const [billing,books,setup,verification,identity,submission,shop,payments,payout,draftPage,location,front,authUser]=await Promise.all([
     read('teyzaBilling/'+target),ledger(target),read('teyzaSellerOnboarding/'+target),
     read('teyzaMobileVerification/'+target),read('teyzaSellerIdentity/'+target),
     read('teyzaCatalogueSubmissions/'+target),read('teyzaPublicShops/'+target),
     self?Promise.resolve(null):db.collection('teyzaPaystackPayments')
       .where('ownerUid','==',target).limit(50).get(),read('teyzaSellerPayouts/'+target),
     self?Promise.resolve(null):db.collection('teyzaDraftProducts/'+target+'/items').limit(201).get(),read('teyzaShopLocations/'+target),
     read('teyzaShopFrontPhotos/'+target),getAuthUser(target).catch(()=>null)]);
   const membershipPaid=P.entitled(target,account,billing,clock());
   const publication=P.state(target,account,setup||{},verification,shop,billing,clock());
   // A stored product count is distinct from a shopper-visible public listing.
   // Location projection follows exactly the same consent and expiry rules as
   // the unauthenticated public directory endpoint.
   const pin=P.locationFor(target,account,location,shop,clock());
   const directoryEligible=publication.live&&shop?.sellerUid===target&&shop?.status==='active';
   const publicItems=directoryEligible&&P.eligible(target,account,billing,clock())&&
      account.category!=='wholesale'?(Array.isArray(shop?.products)?shop.products:[]):[];
   const locationHasChanged=location?.ownerUid===target&&!P.locationMatches(target,account,location);
   const locationPinExpired=location?.ownerUid===target&&
      P.locationMatches(target,account,location)&&!P.freshCoordinates(location,clock());
   const verifiedEmail=authUser?.emailVerified===true;
   let verifiedPhone=false;
   try{require('./onboarding').checkedPhone(authUser,account.phone);verifiedPhone=true;}catch(_){}
   const validIdentity=require('./onboarding').current(identity,target,clock());
   const validSelfie=verification?.ownerUid===target &&
     typeof verification.objectPath==='string'&&verification.expiresAt>clock();
   const validFront=require('./shop-front').valid(front,target);
   const validPin=Boolean(P.locationFor(target,account,location,null,clock()));
   const approvalChecks=[
     {id:'email',label:'Email verified',complete:verifiedEmail},
     {id:'phone',label:'Phone OTP verified',complete:verifiedPhone},
     {id:'identity',label:'Current ID/passport submitted',complete:validIdentity},
     {id:'selfie',label:'Current selfie submitted',complete:validSelfie},
     {id:'shop_front',label:'Shop-front photo submitted',complete:validFront},
     {id:'location',label:'Shop pin saved',complete:validPin},
     {id:'onboarding',label:'Registration completed',complete:Boolean(setup?.completedAt)}
   ];
   const paymentRows=(payments?.docs||[]).map(row=>({reference:row.id,
     kind:row.data().kind||'',status:row.data().status||'pending',
     amountCents:row.data().amountCents||0,createdAt:row.data().createdAt||0,
     verifiedAt:row.data().verifiedAt||null}))
     .sort((a,b)=>b.createdAt-a.createdAt).slice(0,20);
   const billingView={status:billing?.status||'not_started',
     paymentProvider:billing?.paymentProvider||'',renewalSetup:billing?.renewalSetup||'',
     paidUntil:billing?.paidUntil||null,lastReference:billing?.lastReference||null,
     introUsed:billing?.introUsed===true,standardMonthlyCents:9900};
   return {seller:{sellerUid:target,shopName:account.shopName,ownerEmail:account.ownerEmail||'',
     phone:account.phone||'',address:account.address||'',
     approvalStatus:account.approvalStatus,listingPlan:account.listingPlan||'free'},
     billing:billingView,paystackMode:getPaystackMode()==='live'?'live':'test',
     payout:payout?.ownerUid===target?{
       connected:!!payout.enabled,mode:payout.mode||'test',subaccountCode:payout.code||'',
       businessName:payout.businessName||'',percentageCharge:payout.percentageCharge||0
     }:null,
     businessAccount:{
       approvalStatus:account.approvalStatus||'pending',
       reviewStatus:verification?.status||'not_submitted',
       verificationChecks:approvalChecks,
       missingRequirements:approvalChecks.filter(item=>!item.complete).map(item=>item.id),
       isPublic:directoryEligible&&Boolean(pin),
       type:account.category==='wholesale'?'Wholesaler':account.category==='spaza'?'Spaza shop':'Business owner',
       membershipStatus:membershipPaid?'premium':
         P.complimentary(target,account,billing,clock())?'temporary_access':'free',
       upgradeRequired:publication.approved&&publication.ready&&!membershipPaid,
       manualIdentityReviewRequired:account.approvalStatus!=='approved',
       accountLifecycle:account.approvalStatus==='approved'?
         directoryEligible?'shop_live':'approved_check_location':'verification_pending'
     },
     membershipPaid,complimentaryAccess:P.complimentary(target,account,billing,clock()),
     mandateAccessActive:P.mandateAccess(target,account,billing,clock()),
     mandateAccessKind:billing?.mandateAccessKind||null,
     mandateAccessUntil:P.mandateAccess(target,account,billing,clock())?billing.mandateAccessUntil:null,
     shopperVisibility:{
       directoryEligible,
       hasValidPin:Boolean(pin&&P.coordinates(pin.latitude,pin.longitude)),
       latitude:pin&&P.coordinates(pin.latitude,pin.longitude)?pin.latitude:null,
       longitude:pin&&P.coordinates(pin.latitude,pin.longitude)?pin.longitude:null,
       status:!directoryEligible?'seller_not_public':
         !pin?locationHasChanged?'address_changed':locationPinExpired?'pin_expired':'pin_missing':
         'location_ready',
       publicProductCount:publicItems.length,
       shopCategory:account.category||'',
       radiusMustUseShopperDeliveryAddress:true
     },
     sellingStatus:{sellerApproved:publication.approved,shopSetupComplete:publication.ready,
       sellingAccessActive:publication.hasListing,canSell:publication.canSell,
       shopStatus:shop?.status||'not_listed',
       publicProductCount:account.category!=='wholesale'&&publication.canSell&&shop?.status==='active'?
         (Array.isArray(shop.products)?shop.products.length:0):0,
       savedDraftCount:draftPage?draftPage.docs.filter(x=>x.data().ownerUid===target&&x.data().status==='draft').length:null,
       draftLimitReached:!!draftPage&&draftPage.docs.length>200,
       publicProductsAllowed:account.category!=='wholesale',
       approvalAccountStatus:account.approvalStatus||'pending',
       approvalVerificationStatus:verification?.status||'not_submitted'},
     complimentaryUntil:billing?.adminComplimentaryUntil||null,
     complimentaryReason:billing?.adminComplimentaryReason||null,
     canApproveCatalogue:P.state(target,account,setup||{},
       verification,shop,billing,clock()).canSell&&shop?.status==='active',
     catalogue:{
       status:P.state(target,account,setup||{},verification,shop,billing,clock()).canSell?'active':'waiting_for_access',
       products:Array.isArray(shop?.products)?shop.products.slice(0,200).map(p=>({
         id:p.id,name:p.name,category:p.category||'',stock:p.stock,
         priceCents:p.priceCents,imageUrl:p.imageUrl||''
       })):[]},
     payments:paymentRows,...books,
     verification:{status:verification?.status||'not_submitted',
       phoneVerified:!!setup?.verifiedPhone,completed:!!setup?.completedAt},
    documents:self?undefined:{
      identity:identity?.ownerUid===target?{
        available:typeof identity.objectPath==='string'&&identity.objectPath.startsWith('teyza-private/mobile-verification/'+target+'/')&&identity.expiresAt>clock(),
        evidenceId:identity.evidenceId||null,
        kind:identity.kind||'identity',submittedAt:identity.submittedAt||null,
        expired:!(identity.expiresAt>clock()),
      }:null,
      selfie:verification?.ownerUid===target?{
        available:typeof verification.objectPath==='string'&&verification.objectPath.startsWith('teyza-private/mobile-verification/')&&verification.expiresAt>clock(),
        submissionId:verification.submissionId||'legacy_'+verification.submittedAt,
        status:verification.status||'pending',submittedAt:verification.submittedAt||null,
        expired:!(verification.expiresAt>clock()),
      }:null,
    }};
  }
  if(action==='ops_invoice'){
   const target=D.id(data.sellerUid),month=period(data.period),consent=D.text(data.consentReference,'seller subscription consent reference',180);
   if(data.consentConfirmed!==true)D.fail(422,'Confirm the seller agreed to the R99 monthly subscription.');
   if(target===uid)D.fail(403,'Another administrator must manage your subscription.');
   return db.runTransaction(async tx=>{
    const account=await tx.get(doc('teyzaSellerAccounts/'+target)),ref=doc('teyzaBilling/'+target+'/entries/invoice_'+month),old=await tx.get(ref);
    const seller=D.seller(account.exists?account.data():null,target);if(seller.approvalStatus!=='approved')D.fail(409,'Approve the seller before invoicing a subscription.');
    if(old.exists)return {invoiceId:ref.id,alreadyCreated:true};
    tx.set(ref,{ownerUid:target,kind:'subscription_invoice',period:month,description:'Teyza monthly subscription — '+month,debitCents:PRICE,creditCents:0,paidCents:0,createdAt:clock(),createdBy:uid,consentReference:consent});
    tx.set(doc('teyzaBilling/'+target),{ownerUid:target,status:'invoiced',monthlyCents:PRICE,currency:'ZAR',latestPeriod:month,consentReference:consent,collectionMethod:'manual_receipt',updatedAt:clock()},{merge:true});
    audit(tx,auth,action,target,{period:month,amountCents:PRICE});return {invoiceId:ref.id,amountCents:PRICE};
   });
  }
  if(action==='ops_payment'){
   const target=D.id(data.sellerUid),month=period(data.period),cents=amount(data.amountCents),reference=D.text(data.reference,'verified bank or payment-provider receipt reference',180);
   if(data.receiptVerified!==true)D.fail(422,'Verify the payment receipt before recording it.');if(target===uid)D.fail(403,'Another administrator must record your payment.');
   const key=crypto.createHash('sha256').update(reference.trim().toUpperCase()).digest('hex');
   return db.runTransaction(async tx=>{
    const invoiceRef=doc('teyzaBilling/'+target+'/entries/invoice_'+month),receiptRef=doc('teyzaPaymentReceipts/'+key);
    const billingRef=doc('teyzaBilling/'+target);
    const [invoice,receipt,billing]=await Promise.all([tx.get(invoiceRef),tx.get(receiptRef),tx.get(billingRef)]);
    if(receipt.exists){const old=receipt.data();if(old.ownerUid===target&&old.period===month&&old.amountCents===cents&&!old.reversed)return {recorded:true,alreadyRecorded:true};D.fail(409,'That receipt reference has already been used.');}
    if(!invoice.exists||invoice.data().ownerUid!==target||invoice.data().kind!=='subscription_invoice')D.fail(409,'Create this month’s subscription invoice first.');
    const bill=invoice.data();if(cents>bill.debitCents-(bill.paidCents||0))D.fail(409,'Payment exceeds the invoice balance.');
    tx.set(doc('teyzaBilling/'+target+'/entries/payment_'+key),{ownerUid:target,kind:'payment',period:month,description:'Verified subscription payment',debitCents:0,creditCents:cents,reference,createdAt:clock(),createdBy:uid});
    tx.set(receiptRef,{ownerUid:target,period:month,amountCents:cents,reference,reversed:false,createdAt:clock()});
    tx.update(invoiceRef,{paidCents:(bill.paidCents||0)+cents});
    tx.set(billingRef,{lastPaymentAt:clock(),updatedAt:clock(),...(billing.exists&&billing.data().latestPeriod===month?{status:(bill.paidCents||0)+cents===bill.debitCents?'paid':'part_paid'}:{})},{merge:true});
    audit(tx,auth,action,target,{period:month,amountCents:cents,receiptId:key});return {recorded:true};
   });
  }
  if(action==='ops_payment_reverse'){
   const target=D.id(data.sellerUid),paymentId=D.id(data.paymentId),reason=D.text(data.reason,'correction reason',400);
   if(target===uid)D.fail(403,'Another administrator must correct your payment.');if(!/^payment_[a-f0-9]{64}$/.test(paymentId))D.fail(422,'Choose a payment entry.');
   return db.runTransaction(async tx=>{
    const ref=doc('teyzaBilling/'+target+'/entries/'+paymentId),payment=await tx.get(ref);if(!payment.exists||payment.data().ownerUid!==target)D.fail(404,'Payment not found.');
    const p=payment.data(),receiptRef=doc('teyzaPaymentReceipts/'+paymentId.slice(8)),receipt=await tx.get(receiptRef),invoiceRef=doc('teyzaBilling/'+target+'/entries/invoice_'+period(p.period)),invoice=await tx.get(invoiceRef);
    if(!receipt.exists||receipt.data().reversed)D.fail(409,'Payment is already corrected or its receipt is missing.');
    if(!invoice.exists||(invoice.data().paidCents||0)<p.creditCents)D.fail(409,'Invoice needs reconciliation before correction.');
    tx.set(doc('teyzaBilling/'+target+'/entries/reversal_'+paymentId),{ownerUid:target,kind:'payment_correction',period:p.period,description:reason,debitCents:p.creditCents,creditCents:0,createdAt:clock(),createdBy:uid});
    tx.set(doc('teyzaBilling/'+target),{status:'needs_reconciliation',updatedAt:clock()},{merge:true});tx.update(ref,{reversed:true});tx.update(receiptRef,{reversed:true});tx.update(invoiceRef,{paidCents:invoice.data().paidCents-p.creditCents});audit(tx,auth,action,target,{paymentId,reason});return {corrected:true};
   });
  }
  if(action==='ops_finance_queue'){
   let q=db.collectionGroup('requests').orderBy('__name__').limit(51);if(data.after){if(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/requests\/[A-Za-z0-9_-]+$/.test(data.after))D.fail(422,'Invalid finance queue cursor.');q=q.startAfter(data.after);}
   const found=await q.get(),page=found.docs.slice(0,50);
   return {requests:page.filter(s=>/^teyzaCreditEnquiries\/[^/]+\/requests\/[^/]+$/.test(s.ref.path)&&s.data().ownerUid===s.ref.path.split('/')[1]).map(s=>({id:s.id,path:s.ref.path,...s.data()})),next:found.docs.length>50?page.at(-1).ref.path:null};
  }
  if(action==='ops_finance_decide'){
   const path=financePath(data.path),target=path.split('/')[1],note=D.text(data.note,'finance review note',500),status=data.status;
   if(target===uid)D.fail(403,'Another administrator must review your application.');
   if(!['under_review','more_information','approved_in_principle','declined'].includes(status))D.fail(422,'Choose a finance review outcome.');
   if(data.expectedStatus===undefined)D.fail(422,'Refresh the application before reviewing.');
   const approved=status==='approved_in_principle'?amount(data.approvedAmountCents):0;
   if(status==='approved_in_principle'&&data.reviewConfirmed!==true)D.fail(422,'Confirm the manual stock finance review.');
   return db.runTransaction(async tx=>{
    const ref=doc(path),snap=await tx.get(ref),account=await tx.get(doc('teyzaSellerAccounts/'+target));
    if(!snap.exists||snap.data().ownerUid!==target)D.fail(404,'Finance request not found.');const old=snap.data();
    if(old.status!==data.expectedStatus)D.fail(409,'Another reviewer changed this request. Refresh before continuing.');
    if(['approved_in_principle','declined'].includes(old.status))D.fail(409,'This application already has a final review outcome.');
    if(approved&&(!account.exists||account.data().approvalStatus!=='approved'||old.consent!==true||approved>old.amountCents))D.fail(409,'Approval requires an approved seller, consent and an amount within the request.');
    tx.update(ref,{status,reviewNote:note,approvedAmountCents:approved,reviewedBy:uid,reviewedAt:clock(),disbursementStatus:'not_disbursed'});
    audit(tx,auth,action,target,{applicationId:snap.id,status,approvedAmountCents:approved,note});return {status,disbursementStatus:'not_disbursed'};
   });
  }
  // Direct, account-bound seller/admin support inbox. Never store card details,
  // accept payment proofs here, or use messages to grant an entitlement.
  // Support replies in store apps must not steer people to external checkout.
  if(action==='seller_support_open'){
   const ticketId='seller_'+uid,ref=doc('teyzaSupportTickets/'+ticketId);
   const account=await owner(uid);
   await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)tx.set(ref,{ownerUid:uid,subject:'Seller and business support',
     message:'',status:'open',priority:'normal',revision:0,
     createdBy:uid,createdAt:clock(),updatedAt:clock(),
     source:'seller_admin_chat',shopName:account.shopName||'Business',
     lastMessage:'',lastMessageAt:clock(),messageCount:0,sellerUnread:0,adminUnread:0});
    else if(snap.data().ownerUid!==uid)D.fail(403,'Support conversation belongs to another seller.');
   });
   return {ticketId};
  }
  if(['seller_support_thread','ops_support_thread'].includes(action)){
   const ticketId=self?'seller_'+uid:D.id(data.ticketId);
   const ticket=await read('teyzaSupportTickets/'+ticketId);
   if(!ticket||ticket.source!=='seller_admin_chat'||(self&&ticket.ownerUid!==uid))
     D.fail(404,'Support conversation not found.');
   const rows=await db.collection('teyzaSupportTickets/'+ticketId+'/messages')
     .orderBy('sequence','desc').limit(60).get();
   // Reading never changes seller approval, subscription or billing.
   return {ticket:{id:ticketId,ownerUid:ticket.ownerUid,shopName:ticket.shopName||'',
     subject:ticket.subject,status:ticket.status,updatedAt:ticket.updatedAt},
     messages:rows.docs.map(row).reverse()};
  }
  if(['seller_support_message','ops_support_reply'].includes(action)){
   const ticketId=self?'seller_'+uid:D.id(data.ticketId);
   const raw=D.text(data.message,'support message',1000).trim();
   if(raw.length<2)D.fail(422,'Write a support message before sending.');
   // An in-app admin conversation cannot become a disguised web-payment CTA.
   if(!self&&(/https?:\/\//i.test(raw)||/www\./i.test(raw)||/paystack\.com/i.test(raw)||/teyza\.co\.za\/pay/i.test(raw)))
     D.fail(422,'Do not send external links through in-app seller support.');
   const messageId=D.id(data.messageId);
   await rate(uid,'seller-support-message',12,60000);
   await db.runTransaction(async tx=>{
    const ref=doc('teyzaSupportTickets/'+ticketId),snap=await tx.get(ref);
    if(!snap.exists||snap.data().source!=='seller_admin_chat'||
       (self&&snap.data().ownerUid!==uid))D.fail(404,'Support conversation not found.');
    const entry=ref.collection('messages').doc(messageId),existing=await tx.get(entry);
    if(existing.exists){
     if(existing.data().senderUid!==uid||existing.data().text!==raw)
       D.fail(409,'This message reference is already in use.');
     return;
    }
    const at=clock();
    tx.set(entry,{senderUid:uid,sender:self?'seller':'admin',
      text:raw,createdAt:at,sequence:(snap.data().messageCount||0)+1});
    tx.update(ref,{lastMessage:raw.slice(0,180),lastMessageAt:at,updatedAt:at,
      messageCount:(snap.data().messageCount||0)+1,
      status:self?'open':'waiting_for_seller',revision:(snap.data().revision||0)+1,
      [self?'adminUnread':'sellerUnread']:(snap.data()[self?'adminUnread':'sellerUnread']||0)+1});
   });
   return {sent:true,messageId};
  }
  if(action==='ops_support_list'||action==='seller_support_list'){
   let q=db.collection('teyzaSupportTickets');if(self)q=q.where('ownerUid','==',uid);else q=q.orderBy('__name__');
   q=q.limit(51);if(!self&&data.after)q=q.startAfter(D.id(data.after));const result=await q.get(),page=result.docs.slice(0,50);return {tickets:page.map(row),next:!self&&result.docs.length>50?page.at(-1).id:null};
  }
  if(action==='ops_support_create'||action==='seller_support_create'){
   const target=self?uid:D.id(data.sellerUid);await owner(target);await rate(uid,'support-create',10,3600000);
   const subject=D.text(data.subject,'support subject',140),message=D.text(data.message,'support description',2000),ref=db.collection('teyzaSupportTickets').doc();
   await ref.set({ownerUid:target,subject,message,status:'open',priority:'normal',revision:0,createdBy:uid,createdAt:clock(),updatedAt:clock(),source:self?'seller_app':'admin_received_request'});return {ticketId:ref.id};
  }
  if(action==='ops_support_detail'){
   const id=D.id(data.ticketId),ticket=await read('teyzaSupportTickets/'+id);if(!ticket)D.fail(404,'Ticket not found.');
   const notes=await db.collection('teyzaSupportTickets/'+id+'/internalNotes').orderBy('createdAt','desc').limit(50).get();return {ticket:{id,...ticket},notes:notes.docs.map(row)};
  }
  if(action==='ops_support_update'){
   const id=D.id(data.ticketId),note=D.text(data.note,'internal support note',2000);if(!['open','in_progress','waiting_for_seller','resolved'].includes(data.status))D.fail(422,'Choose a support status.');
   if(!['normal','high','urgent'].includes(data.priority))D.fail(422,'Choose a priority.');
   return db.runTransaction(async tx=>{
    const ref=doc('teyzaSupportTickets/'+id),snap=await tx.get(ref);if(!snap.exists)D.fail(404,'Ticket not found.');if(snap.data().revision!==data.revision)D.fail(409,'This ticket changed. Refresh before saving.');
    tx.update(ref,{status:data.status,priority:data.priority,revision:data.revision+1,updatedAt:clock(),assignedTo:uid});
    tx.set(ref.collection('internalNotes').doc(),{note,authorUid:uid,createdAt:clock()});audit(tx,auth,action,snap.data().ownerUid,{ticketId:id,status:data.status});return {saved:true};
   });
  }
  D.fail(400,'Unknown operations action.');
 }
 return {execute};
}
module.exports={createOperations,actions,PRICE,period,amount,statement,financePath};
