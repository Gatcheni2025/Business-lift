'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication'),{phone,current}=require('./onboarding'),{recentAdmin}=require('./seller-experience'),{saveUpload}=require('./upload-storage');
const actions=new Set(['seller_mandate_status','seller_mandate_submit','seller_mandate_withdraw','ops_mandate_image','ops_mandate_queue','ops_mandate_detail','ops_mandate_export','ops_mandate_review']);
const VERSION='teyza-debit-request-v2',PRICE=9900;
// Universal codes: https://support.peachpayments.com/support/solutions/articles/47001207209
const banks=[['Absa','632005'],['Capitec','470010'],['Capitec Business','450105'],['FNB','250655'],['Nedbank','198765'],['Standard Bank','051001'],['African Bank','430000'],['Investec','580105'],['Discovery Bank','679000'],['TymeBank','678910'],['Other','']].map(([name,branchCode])=>({name,branchCode}));
const benefits=['Visibility on Teyza','Priority placement in your area, subject to eligibility and availability','Discounts on stock from participating wholesalers','Discounted delivery on selected products','Access to shop finance, subject to separate application and approval','Free bookkeeping support'];
function terms(firstDate,day){return `I request that Teyza prepare a formal bank-authenticated R99.00 monthly debit-order mandate with a proposed first collection date of ${firstDate} and thereafter day ${day} each month. I authorise Teyza to process my bank details securely and submit them to an authorised collection provider for verification and mandate authentication. I understand that completing this request is not itself a bank-approved debit-order mandate and no debit or paid entitlement results from submission or administrator review. A debit may be presented only after any bank-required authentication and collection-provider activation. No increase in the R99.00 monthly amount or change of collection date is allowed without a fresh authorisation. I confirm I own the bank account or am an authorised signatory, and may withdraw this request before provider activation or contact support@teyza.co.za; existing provider mandates must separately be cancelled through Teyza or the provider. Partner offers depend on eligibility and availability.`;}
function publicMandate(m){return m?{mandateId:m.mandateId,status:m.status,amountCents:m.amountCents,firstDate:m.firstDate,collectionDay:m.collectionDay,bankName:m.bankName,accountLast4:m.accountLast4,branchCode:m.branchCode,acceptedAt:m.acceptedAt,withdrawnAt:m.withdrawnAt||null,termsVersion:m.termsVersion,terms:m.terms,identityExpiresAt:m.identityExpiresAt,shopName:m.shopName||'',shopAddress:m.shopAddress||'',providerStatus:m.providerStatus||'not_configured',collectionActive:false}:null;}
function schedule(date,day,clock){const today=new Date(clock()+2*3600000).toISOString().slice(0,10);if(typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<today||date>new Date(clock()+366*86400000).toISOString().slice(0,10)||!Number.isInteger(day)||day<1||day>28||Number(date.slice(-2))!==day)D.fail(422,'Choose a first collection date within the next year, on day 1–28.');}
function requireApprovedSeller(uid,account,setup,verification,shop,now){
 const state=P.state(uid,account,setup||{},verification,shop,null,now);
 if(!state.approved||!state.ready||state.status!=='active')
  D.fail(403,'Your seller registration and identity verification must be approved before you submit a mandate.');
}
function createMandate({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getAuthUser=async()=>null,clock,rate}){
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
    return {mandate:publicMandate(record),sellerUid:target,shopName:seller?.shopName||'',
      shopAddress:record.shopAddress||seller?.address||'',ownerEmail:seller?.ownerEmail||'',
      sensitive:{firstName:values.firstName,surname:values.surname,phone:values.phone,
        documentKind:values.documentKind,documentNumber:values.documentNumber,
        accountHolder:values.accountHolder,bankName:record.bankName,
        branchCode:record.branchCode,accountNumber:values.accountNumber,accountType:values.accountType}};
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
      const snap=await tx.get(doc('teyzaSellerMandates/'+target));
      if(!snap.exists||snap.data().ownerUid!==target||snap.data().mandateId!==mandateId||
         !['signed_pending_activation','pending_provider_authentication','reviewed_pending_provider','needs_correction'].includes(snap.data().status))
        D.fail(409,'Mandate was withdrawn, replaced or already changed.');
      const now=clock();
      tx.update(doc('teyzaSellerMandates/'+target),{status:decision,
        adminReviewBy:uid,adminReviewedAt:now,adminReviewNote:reason,collectionActive:false});
      tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,ownerUid:target,
        action:'admin_review',decision,reason,mandateId,createdAt:now});
      return {reviewed:true,status:decision,collectionActive:false};
    });
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
   const [m,id,user]=await Promise.all([read(head.path),read('teyzaSellerIdentity/'+uid),getAuthUser(uid).catch(()=>null)]);
   const authName=typeof user?.displayName==='string'?user.displayName.trim():'';
   const split=authName.split(/\s+/).filter(Boolean);
   return {required:!m||['withdrawn','needs_correction'].includes(m.status),mandate:publicMandate(m),amountCents:PRICE,termsVersion:VERSION,termsTemplate:terms('{firstDate}','{collectionDay}'),banks,benefits,
    seller:{shopName:seller.shopName||'',shopAddress:seller.address||'',phone:seller.phone||'',email:seller.ownerEmail||auth.email||'',firstName:split[0]||'',surname:split.slice(1).join(' '),accountHolder:authName},
    identity:current(id,uid,clock)&&['id','passport'].includes(id.kind)?{evidenceId:id.evidenceId,kind:id.kind}:null};
  }
  if(action==='seller_mandate_withdraw')return db.runTransaction(async tx=>{
   const s=await tx.get(head),m=s.exists?s.data():null;if(!m||m.mandateId!==data.mandateId)D.fail(409,'Refresh the current mandate first.');
   if(m.status==='withdrawn')return {withdrawn:true};
   tx.update(head,{status:'withdrawn',withdrawnAt:clock()});tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,mandateId:m.mandateId,action:'withdraw',createdAt:clock()});return {withdrawn:true};
  });
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
  return db.runTransaction(async tx=>{
   const [h,v,a,idNow,setupNow,verificationNow,shopNow]=await Promise.all([
    tx.get(head),tx.get(versionRef),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaSellerIdentity/'+uid)),
    tx.get(doc('teyzaSellerOnboarding/'+uid)),tx.get(doc('teyzaMobileVerification/'+uid)),tx.get(doc('teyzaPublicShops/'+uid))]);
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
   tx.set(head,record);tx.set(versionRef,record);tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,action:'sign',mandateId:requestId,createdAt:clock(),termsVersion:VERSION,fingerprint});return {mandate:publicMandate(record)};
  });
 }
 return {execute};
}
module.exports={createMandate,actions,publicMandate,terms,schedule,banks,VERSION};
