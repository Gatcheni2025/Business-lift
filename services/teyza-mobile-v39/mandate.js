'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication'),{phone,current}=require('./onboarding'),{recentAdmin}=require('./seller-experience'),{saveUpload}=require('./upload-storage');
const actions=new Set(['seller_mandate_status','seller_mandate_submit','seller_mandate_withdraw','ops_mandate_image','ops_mandate_queue','ops_mandate_detail','ops_mandate_export','ops_mandate_review','ops_mandate_record_netcash_submission','ops_mandate_provider_confirm']);
const VERSION='teyza-debit-request-v3',PRICE=9900;
// Universal codes: https://support.peachpayments.com/support/solutions/articles/47001207209
const banks=[['Absa','632005'],['Capitec','470010'],['Capitec Business','450105'],['FNB','250655'],['Nedbank','198765'],['Standard Bank','051001'],['African Bank','430000'],['Investec','580105'],['Discovery Bank','679000'],['TymeBank','678910'],['Other','']].map(([name,branchCode])=>({name,branchCode}));
const PROCESSING_MS=7*86400000,PROVIDER_MS=30*86400000;
const benefits=['Visibility on Teyza','Priority placement in your area, subject to eligibility and availability','Discounts on stock from participating wholesalers','Discounted delivery on selected products','Access to shop finance, subject to separate application and approval','Free bookkeeping support'];
function terms(firstDate,day){return `I request that Teyza prepare a formal bank-authenticated R99.00 monthly debit-order mandate with a proposed first collection date of ${firstDate} and thereafter day ${day} each month. I authorise Teyza to process my bank details securely and submit them to an authorised collection provider for verification and mandate authentication. I understand that ticking the consent box and submitting this request is not a bank-accepted signed debit-order mandate. Netcash requires a valid written, recorded or provider-approved electronic mandate before collections. No debit or paid entitlement results from this request or administrator review. A debit may be presented only after any bank-required authentication and collection-provider activation. No increase in the R99.00 monthly amount or change of collection date is allowed without a fresh authorisation. I confirm I own the bank account or am an authorised signatory, and may withdraw this request before provider activation or contact support@teyza.co.za; existing provider mandates must separately be cancelled through Teyza or the provider. Partner offers depend on eligibility and availability.`;}
function publicMandate(m){return m?{mandateId:m.mandateId,status:m.status,amountCents:m.amountCents,firstDate:m.firstDate,collectionDay:m.collectionDay,bankName:m.bankName,accountLast4:m.accountLast4,branchCode:m.branchCode,acceptedAt:m.acceptedAt,withdrawnAt:m.withdrawnAt||null,termsVersion:m.termsVersion,terms:m.terms,identityExpiresAt:m.identityExpiresAt,shopName:m.shopName||'',shopAddress:m.shopAddress||'',providerStatus:m.providerStatus||'not_configured',providerSubmittedAt:m.providerSubmittedAt||null,providerConfirmedAt:m.providerConfirmedAt||null,collectionActive:false}:null;}
function schedule(date,day,clock){const today=new Date(clock()+2*3600000).toISOString().slice(0,10);if(typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<today||date>new Date(clock()+366*86400000).toISOString().slice(0,10)||!Number.isInteger(day)||day<1||day>28||Number(date.slice(-2))!==day)D.fail(422,'Choose a first collection date within the next year, on day 1–28.');}
function requireApprovedSeller(uid,account,setup,verification,shop,now){
 // Mandate enrolment follows the administrator's seller/identity approval.
 // Shop setup and an active paid listing are separate requirements for selling.
 const state=P.state(uid,account,setup||{},verification,shop,null,now);
 if(!state.registered||!state.approved||account?.deletionPending===true||
    setup?.moderationBlocked===true||P.held(shop))
  D.fail(403,'Your seller registration and identity verification must be approved before you submit a mandate.');
}
function createMandate({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getAuthUser=async()=>null,clock,rate,synchronize=async()=>{}}){
 const doc=p=>db.doc(p),read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid);

  if(action==='ops_mandate_queue'){
    recentAdmin(auth,clock);await rate(uid,'mandate-review',20,60000);
    const rows=await db.collection('teyzaSellerMandates').orderBy('acceptedAt','desc').limit(50).get();
    return {mandates:rows.docs.map(row=>({sellerUid:row.id,...publicMandate(row.data())})),
      limited:rows.docs.length===50};
  }
  if(action==='ops_mandate_detail'||action==='ops_mandate_export'){
    recentAdmin(auth,clock);await rate(uid,'mandate-review',15,60000);
    const target=D.id(data.sellerUid),mandateId=D.id(data.mandateId);
    if(target===uid)D.fail(403,'Another administrator must review your mandate.');
    const record=await read('teyzaSellerMandates/'+target);
    if(!record||record.ownerUid!==target||record.mandateId!==mandateId)
      D.fail(409,'The mandate changed. Refresh the review queue.');
    const values=JSON.parse((await decryptSelfie(Buffer.from(record.detailsEncrypted,'base64'))).toString('utf8'));
    // Never leak full banking details in lists, public Firestore documents or emails.
    await doc('teyzaOperationsAudit/'+crypto.randomUUID()).set({actorUid:uid,
      action:action==='ops_mandate_export'?'ops_mandate_export':'ops_mandate_detail',target,mandateId,createdAt:clock()});
    const seller=await read('teyzaSellerAccounts/'+target);
    return {mandate:publicMandate(record),sellerUid:target,netcashReference:record.providerReference||'',shopName:seller?.shopName||'',
      shopAddress:record.shopAddress||seller?.address||'',ownerEmail:seller?.ownerEmail||'',
      sensitive:{firstName:values.firstName,surname:values.surname,phone:values.phone,
        documentKind:values.documentKind,documentNumber:values.documentNumber,
        accountHolder:values.accountHolder,bankName:record.bankName,
        branchCode:record.branchCode,accountNumber:values.accountNumber,accountType:values.accountType}};
  }
  // A manually submitted provider mandate needs no Netcash API. Record only
  // the operator's evidence/reference; do NOT present this as provider acceptance,
  // bank authentication, a cleared collection, or paid digital entitlement.
  if(action==='ops_mandate_record_netcash_submission'){
    recentAdmin(auth,clock);await rate(uid,'mandate-review',10,60000);
    const target=D.id(data.sellerUid),mandateId=D.id(data.mandateId);
    if(target===uid)D.fail(403,'Another administrator must submit this mandate.');
    if(data.confirmed!==true)D.fail(422,'Confirm that the PDF was submitted through the authorised Netcash channel.');
    const reference=D.text(data.providerReference,'Netcash submission reference',120);
    if(!/^[A-Za-z0-9][A-Za-z0-9._\/-]{5,119}$/.test(reference))
      D.fail(422,'Enter the Netcash portal receipt or submission reference (6–120 characters).');
    const note=D.text(data.note,'submission note',400);
    if(note.length<10)D.fail(422,'Record the method and date of the manual submission.');
    return db.runTransaction(async tx=>{
      const ref=doc('teyzaSellerMandates/'+target),snap=await tx.get(ref);
      if(!snap.exists||snap.data().ownerUid!==target||snap.data().mandateId!==mandateId)
        D.fail(409,'The mandate changed. Refresh the admin queue.');
      const previous=snap.data();
      if(previous.status==='submitted_to_netcash'){
        if(previous.providerReference===reference)return {recorded:true,alreadyRecorded:true,
          status:'submitted_to_netcash',collectionActive:false};
        D.fail(409,'This mandate was already submitted with a different reference.');
      }
      if(previous.status!=='reviewed_pending_provider')
        D.fail(409,'Review the seller mandate before recording manual Netcash submission.');
      const now=clock();
      tx.update(ref,{status:'submitted_to_netcash',providerStatus:'submitted_unverified',
        provider:'netcash',providerSubmissionMethod:'manual_portal',providerReference:reference,
        providerSubmissionNote:note,providerSubmittedAt:now,providerSubmittedBy:uid,
        collectionActive:false});
      tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,ownerUid:target,
        action:'netcash_manual_submission',mandateId,provider:'netcash',
        reference,createdAt:now});
      return {recorded:true,status:'submitted_to_netcash',collectionActive:false};
    });
  }
  if(action==='ops_mandate_review'){
    recentAdmin(auth,clock);await rate(uid,'mandate-review',10,60000);
    const target=D.id(data.sellerUid),mandateId=D.id(data.mandateId),decision=data.decision;
    if(target===uid)D.fail(403,'Another administrator must review this mandate.');
    if(!['reviewed_pending_provider','needs_correction'].includes(decision))
      D.fail(422,'Choose provider preparation or request corrected details.');
    const reason=D.text(data.reason,'review note',400);
    if(reason.length<10)D.fail(422,'Explain the review decision (at least 10 characters).');
    return db.runTransaction(async tx=>{
      const billRef=doc('teyzaBilling/'+target);
      const [snap,bill]=await Promise.all([tx.get(doc('teyzaSellerMandates/'+target)),tx.get(billRef)]);
      if(!snap.exists||snap.data().ownerUid!==target||snap.data().mandateId!==mandateId||
         !['signed_pending_activation','pending_provider_authentication','reviewed_pending_provider','needs_correction'].includes(snap.data().status))
        D.fail(409,'Mandate was withdrawn, replaced or already changed.');
      const now=clock();
      tx.update(doc('teyzaSellerMandates/'+target),{status:decision,
        adminReviewBy:uid,adminReviewedAt:now,adminReviewNote:reason,collectionActive:false});
      if(decision==='needs_correction'&&bill.exists&&bill.data().ownerUid===target&&bill.data().mandateAccessMandateId===mandateId)
        tx.update(billRef,{mandateAccessStatus:'revoked',mandateAccessRevokedAt:now});
      tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,ownerUid:target,
        action:'admin_review',decision,reason,mandateId,createdAt:now});
      return {reviewed:true,status:decision,collectionActive:false};
    });
  }
  if(action==='ops_mandate_provider_confirm'){
    recentAdmin(auth,clock);await rate(uid,'mandate-review',10,60000);
    const target=D.id(data.sellerUid),mandateId=D.id(data.mandateId);
    if(target===uid)D.fail(403,'Another administrator must verify provider acceptance.');
    if(data.confirmed!==true)D.fail(422,'Independently confirm the provider-approved mandate.');
    const reference=D.text(data.providerReference,'provider acceptance reference',120),
      note=D.text(data.note,'provider acceptance evidence',400);
    if(!/^[A-Za-z0-9][A-Za-z0-9._\/-]{5,119}$/.test(reference)||note.length<20)
      D.fail(422,'Enter the verified provider acceptance reference and a 20-character evidence note.');
    const result=await db.runTransaction(async tx=>{
      const ref=doc('teyzaSellerMandates/'+target),billRef=doc('teyzaBilling/'+target);
      const [m,b,a]=await Promise.all([tx.get(ref),tx.get(billRef),tx.get(doc('teyzaSellerAccounts/'+target))]);
      if(!m.exists||m.data().ownerUid!==target||m.data().mandateId!==mandateId)
        D.fail(409,'The mandate has changed. Refresh before confirming.');
      if(!a.exists||a.data().approvalStatus!=='approved'||a.data().deletionPending===true)
        D.fail(409,'Seller approval is not current.');
      if(!['reviewed_pending_provider','submitted_to_netcash'].includes(m.data().status))
        D.fail(409,'Review the mandate and verify provider acceptance first.');
      if(b.exists&&b.data().ownerUid!==target)D.fail(409,'Billing ownership mismatch.');
      const at=clock(),until=at+PROVIDER_MS;
      tx.update(ref,{status:'provider_confirmed',providerStatus:'accepted_verified_manually',
        providerConfirmedAt:at,providerConfirmedBy:uid,providerAcceptanceReference:reference,
        providerConfirmationNote:note,collectionActive:false});
      tx.set(billRef,{ownerUid:target,mandateAccessStatus:'active',
        mandateAccessKind:'provider_confirmed_30d',mandateAccessMandateId:mandateId,
        mandateAccessUntil:until,mandateAccessProviderBy:uid,mandateAccessProviderReference:reference,updatedAt:at},{merge:true});
      tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,ownerUid:target,
        action:'provider_confirmation',mandateId,reference,reason:note,
        until,createdAt:at,paymentRecorded:false,collectionActive:false});
      return {confirmed:true,until,status:'provider_confirmed',paymentRecorded:false};
    });
    await synchronize(target,{publishIntent:true});
    return result;
  }
  if(action==='ops_mandate_image'){
   recentAdmin(auth,clock);await rate(uid,'mandate-review',20,60000);const target=D.id(data.sellerUid);if(target===uid)D.fail(403,'Another administrator must review your ID.');
   const m=await read('teyzaSellerMandates/'+target);if(!m||m.mandateId!==data.mandateId||m.identityExpiresAt<=clock())D.fail(409,'The mandate ID changed or expired. Refresh this account.');
   if(!m.identityPath.startsWith('teyza-private/mobile-verification/'+target+'/'))D.fail(409,'This ID attachment is unavailable.');
   const [bytes]=await bucket.file(m.identityPath).download();await doc('teyzaOperationsAudit/'+crypto.randomUUID()).set({actorUid:uid,action,target,mandateId:m.mandateId,createdAt:clock()});return {imageBase64:(await decryptSelfie(bytes)).toString('base64')};
  }
  if(auth.teyzaPhoneBootstrap)D.fail(403,'Sign in again to manage a mandate.');
  const seller=D.seller(await read('teyzaSellerAccounts/'+uid),uid);await rate(uid,'mandate',20,60000);
  const head=doc('teyzaSellerMandates/'+uid);
  if(action==='seller_mandate_status'){
   const [m,id,user,shopperProfile]=await Promise.all([read(head.path),read('teyzaSellerIdentity/'+uid),getAuthUser(uid).catch(()=>null),read('teyzaShopperProfiles/'+uid)]);
   // Prefer the authenticated account's saved name; phone-only Firebase users
   // often have an empty displayName but previously saved their Teyza profile.
   const authName=typeof user?.displayName==='string'?user.displayName.trim():'';
   const profileName=shopperProfile?.ownerUid===uid&&typeof shopperProfile.displayName==='string'?
     shopperProfile.displayName.trim():'';
   const savedName=authName||profileName;
   const split=savedName.split(/\s+/).filter(Boolean);
   return {required:!m||['withdrawn','needs_correction'].includes(m.status),mandate:publicMandate(m),amountCents:PRICE,termsVersion:VERSION,termsTemplate:terms('{firstDate}','{collectionDay}'),banks,benefits,
    seller:{shopName:seller.shopName||'',shopAddress:seller.address||'',phone:seller.phone||'',email:seller.ownerEmail||auth.email||'',firstName:split[0]||'',surname:split.slice(1).join(' '),accountHolder:savedName},
    identity:current(id,uid,clock)&&['id','passport'].includes(id.kind)?{evidenceId:id.evidenceId,kind:id.kind}:null};
  }
  if(action==='seller_mandate_withdraw'){
    const result=await db.runTransaction(async tx=>{
      const billRef=doc('teyzaBilling/'+uid);
      const [s,bill]=await Promise.all([tx.get(head),tx.get(billRef)]);
      const m=s.exists?s.data():null;
      if(!m||m.mandateId!==data.mandateId)D.fail(409,'Refresh the mandate first.');
      if(m.status==='withdrawn')return {withdrawn:true};
      tx.update(head,{status:'withdrawn',withdrawnAt:clock()});
      if(bill.exists&&bill.data().ownerUid===uid&&bill.data().mandateAccessMandateId===m.mandateId)
        tx.update(billRef,{mandateAccessStatus:'revoked',mandateAccessRevokedAt:clock()});
      tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,mandateId:m.mandateId,action:'withdraw',createdAt:clock()});
      return {withdrawn:true};
    });
    await synchronize(uid);return result;
  }
  if(action!=='seller_mandate_submit')D.fail(404,'Unknown mandate action.');
  const [setup,verification,shop]=await Promise.all([
   read('teyzaSellerOnboarding/'+uid),read('teyzaMobileVerification/'+uid),read('teyzaPublicShops/'+uid)]);
  requireApprovedSeller(uid,seller,setup,verification,shop,clock());
  if(!auth.email_verified&&!auth.phone_number)D.fail(403,'Verify your email or phone before signing.');
  const previousBilling=await read('teyzaBilling/'+uid);
  // Never allow two independently recurring instructions against one seller.
  if(previousBilling?.paystackSubscriptionCode)
    D.fail(409,'An existing Paystack recurring agreement is on file. Ask Teyza administration to confirm its cancellation before starting debit-order migration.');
  if(data.consent!==true||data.identityConsent!==true||data.termsVersion!==VERSION||data.amountCents!==PRICE)D.fail(422,'Review and accept the current R99 mandate and private ID submission.');
  const requestId=D.id(data.requestId),bank=banks.find(b=>b.name===data.bankName);if(!bank)D.fail(422,'Select your bank.');
  schedule(data.firstDate,data.collectionDay,clock);
  const identityRecord=data.identityEvidenceId?await read('teyzaSellerIdentity/'+uid):null;
  let linkedIdentity=null;
  if(data.identityEvidenceId){
    if(!current(identityRecord,uid,clock)||identityRecord.evidenceId!==data.identityEvidenceId||
       !['id','passport'].includes(identityRecord.kind))
      D.fail(409,'Choose your current verified owner ID or passport.');
    linkedIdentity=JSON.parse((await decryptSelfie(Buffer.from(identityRecord.detailsEncrypted,'base64'))).toString('utf8'));
  }
  if(linkedIdentity&&data.documentNumber&&data.documentNumber!==linkedIdentity.documentNumber)
    D.fail(422,'The entered ID/passport number does not match your linked verified document.');
  const values={firstName:D.text(data.firstName,'name',80),surname:D.text(data.surname,'surname',80),
   phone:phone(seller.phone),documentKind:linkedIdentity?.kind||data.documentKind,
   documentNumber:D.text(linkedIdentity?.documentNumber||data.documentNumber,'ID or passport number',50),
   accountHolder:D.text(data.accountHolder,'account holder',160),
   accountNumber:D.text(data.accountNumber,'account number',20),accountType:data.accountType};
  if(data.phone&&phone(data.phone)!==values.phone)D.fail(409,'Seller phone changed. Refresh the mandate.');
  if(!['id','passport'].includes(values.documentKind)||!['current','savings','transmission'].includes(values.accountType)||!/^\d{6,20}$/.test(values.accountNumber)||!(values.documentKind==='id'?/^\d{13}$/:/^[A-Za-z0-9 -]{4,30}$/).test(values.documentNumber))D.fail(422,'Check your ID/passport and bank account details.');
  const branchCode=bank.branchCode||D.text(data.branchCode,'branch code',6);if(!/^\d{6}$/.test(branchCode))D.fail(422,'Enter a six-digit branch code.');
  const text=terms(data.firstDate,data.collectionDay),fingerprint=crypto.createHash('sha256').update(JSON.stringify({values,bank:bank.name,branchCode,firstDate:data.firstDate,day:data.collectionDay,text})).digest('hex');
  const versionRef=doc('teyzaSellerMandates/'+uid+'/versions/'+requestId),previous=await versionRef.get();
  if(previous.exists){const active=await read(head.path);if(active?.mandateId!==requestId||active.status==='withdrawn')D.fail(409,'This mandate was replaced or withdrawn. Refresh before signing again.');if(previous.data().fingerprint!==fingerprint)D.fail(409,'This submission reference was already used. Reopen the form to change details.');return {mandate:publicMandate(previous.data()),alreadySubmitted:true};}
  let identityPath,identityExpiresAt,evidenceId;
  if(data.identityEvidenceId){
   const id=await read('teyzaSellerIdentity/'+uid);if(!current(id,uid,clock)||id.evidenceId!==data.identityEvidenceId||id.kind!==values.documentKind)D.fail(409,'Attach your current owner ID or passport.');
   const details=JSON.parse((await decryptSelfie(Buffer.from(id.detailsEncrypted,'base64'))).toString());if(details.documentNumber!==values.documentNumber)D.fail(422,'The document number must match the attached ID/passport.');
   identityPath=id.objectPath;identityExpiresAt=id.expiresAt;evidenceId=id.evidenceId;
  }else{
   const bytes=D.imageBytes(data.imageBase64);let jpeg;try{jpeg=await sanitizeImage(bytes);}catch(_){D.fail(422,'Attach a clear ID/passport photo.');}
   evidenceId=crypto.randomUUID();identityPath='teyza-private/mobile-verification/'+uid+'/'+evidenceId+'.enc';identityExpiresAt=clock()+90*86400000;
   await doc('teyzaVerificationPhotos/'+evidenceId).set({ownerUid:uid,objectPath:identityPath,expiresAt:identityExpiresAt});
   await saveUpload(bucket,identityPath,await encryptSelfie(jpeg),{contentType:'application/octet-stream',resumable:false,metadata:{cacheControl:'private,no-store'}});
  }
  const detailsEncrypted=(await encryptSelfie(Buffer.from(JSON.stringify(values)))).toString('base64');
  const result=await db.runTransaction(async tx=>{
   const [h,v,a,idNow,setupNow,verificationNow,shopNow,billingNow]=await Promise.all([
    tx.get(head),tx.get(versionRef),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaSellerIdentity/'+uid)),
    tx.get(doc('teyzaSellerOnboarding/'+uid)),tx.get(doc('teyzaMobileVerification/'+uid)),tx.get(doc('teyzaPublicShops/'+uid)),tx.get(doc('teyzaBilling/'+uid))]);
   if(data.identityEvidenceId&&(!idNow.exists||!current(idNow.data(),uid,clock)||idNow.data().evidenceId!==data.identityEvidenceId))D.fail(409,'Your ID attachment changed. Refresh and review the form.');
   const owner=D.seller(a.exists?a.data():null,uid);
   requireApprovedSeller(uid,owner,setupNow.exists?setupNow.data():null,
    verificationNow.exists?verificationNow.data():null,shopNow.exists?shopNow.data():null,clock());
   if(v.exists){if(v.data().fingerprint!==fingerprint)D.fail(409,'Reopen the mandate form.');return {mandate:publicMandate(v.data()),alreadySubmitted:true};}
   if((h.exists?h.data().mandateId:null)!==(data.expectedMandateId||null))D.fail(409,'The mandate changed. Refresh and review it before signing.');
   const record={ownerUid:uid,mandateId:requestId,status:'pending_provider_authentication',
    amountCents:PRICE,currency:'ZAR',firstDate:data.firstDate,collectionDay:data.collectionDay,
    bankName:bank.name,branchCode,accountLast4:values.accountNumber.slice(-4),
    shopName:a.data().shopName||'',shopAddress:a.data().address||'',
    detailsEncrypted,identityPath,identityExpiresAt,identityEvidenceId:evidenceId,
    acceptedAt:clock(),termsVersion:VERSION,terms:text,fingerprint,
    providerStatus:'not_configured',collectionActive:false};
   if(billingNow.exists&&billingNow.data().ownerUid!==uid)D.fail(409,'Billing ownership mismatch.');
   const earlier=h.exists?h.data():null;
   if(earlier&&!['withdrawn','needs_correction'].includes(earlier.status))
     D.fail(409,'An existing mandate is still being processed. Refresh or withdraw it.');
   const firstStart=billingNow.exists&&Number.isFinite(billingNow.data().mandateAccessFirstStartedAt)?
     billingNow.data().mandateAccessFirstStartedAt:clock();
   const until=firstStart+PROCESSING_MS;
   if(until>clock())tx.set(doc('teyzaBilling/'+uid),{ownerUid:uid,
     mandateAccessStatus:'active',mandateAccessKind:'processing_7d',
     mandateAccessFirstStartedAt:firstStart,mandateAccessMandateId:requestId,
     mandateAccessUntil:until,mandateAccessStartedAt:clock(),updatedAt:clock()},{merge:true});
   tx.set(head,record);tx.set(versionRef,record);tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,action:'sign',mandateId:requestId,createdAt:clock(),termsVersion:VERSION,fingerprint});return {mandate:publicMandate(record)};
  });
  try{await synchronize(uid,{publishIntent:true});}
  catch(_){/* Mandate saved; owner may retry product sync. */}
  return result;
 }
 return {execute};
}
module.exports={createMandate,actions,publicMandate,terms,schedule,banks,VERSION};
