'use strict';
const crypto=require('node:crypto'),D=require('./domain'),{phone,current}=require('./onboarding'),{recentAdmin}=require('./seller-experience'),{saveUpload}=require('./upload-storage');
const actions=new Set(['seller_mandate_status','seller_mandate_submit','seller_mandate_withdraw','ops_mandate_image']);
const VERSION='teyza-membership-v1',PRICE=9900;
// Universal codes: https://support.peachpayments.com/support/solutions/articles/47001207209
const banks=[['Absa','632005'],['Capitec','470010'],['Capitec Business','450105'],['FNB','250655'],['Nedbank','198765'],['Standard Bank','051001'],['African Bank','430000'],['Investec','580105'],['Discovery Bank','679000'],['TymeBank','678910'],['Other','']].map(([name,branchCode])=>({name,branchCode}));
const benefits=['Visibility on Teyza','Priority placement in your area, subject to eligibility and availability','Discounts on stock from participating wholesalers','Discounted delivery on selected products','Access to shop finance, subject to separate application and approval','Free bookkeeping support'];
function terms(firstDate,day){return `I authorise Teyza to collect R99.00 per month from the bank account I provide, starting on ${firstDate}, then on day ${day} of each month, for my shop membership. Collection may start only after seller approval and payment-provider activation, including any bank authentication required. No collection is made when this form is submitted. A change to the amount or collection date requires a new authorisation. I confirm I am the account holder or authorised signatory. I can withdraw this authorisation in the app or contact support@teyza.co.za; withdrawal does not cancel amounts already due. Partner discounts, priority placement and delivery offers depend on availability. Finance requires separate approval.`;}
function publicMandate(m){return m?{mandateId:m.mandateId,status:m.status,amountCents:m.amountCents,firstDate:m.firstDate,collectionDay:m.collectionDay,bankName:m.bankName,accountLast4:m.accountLast4,branchCode:m.branchCode,acceptedAt:m.acceptedAt,withdrawnAt:m.withdrawnAt||null,termsVersion:m.termsVersion,terms:m.terms,identityExpiresAt:m.identityExpiresAt,collectionActive:false}:null;}
function schedule(date,day,clock){const today=new Date(clock()+2*3600000).toISOString().slice(0,10);if(typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<today||date>new Date(clock()+366*86400000).toISOString().slice(0,10)||!Number.isInteger(day)||day<1||day>28||Number(date.slice(-2))!==day)D.fail(422,'Choose a first collection date within the next year, on day 1–28.');}
function createMandate({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,clock,rate}){
 const doc=p=>db.doc(p),read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid);
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
   const [m,id]=await Promise.all([read(head.path),read('teyzaSellerIdentity/'+uid)]);
   return {required:!m||m.status==='withdrawn',mandate:publicMandate(m),amountCents:PRICE,termsVersion:VERSION,termsTemplate:terms('{firstDate}','{collectionDay}'),banks,benefits,
    identity:current(id,uid,clock)&&['id','passport'].includes(id.kind)?{evidenceId:id.evidenceId,kind:id.kind}:null};
  }
  if(action==='seller_mandate_withdraw')return db.runTransaction(async tx=>{
   const s=await tx.get(head),m=s.exists?s.data():null;if(!m||m.mandateId!==data.mandateId)D.fail(409,'Refresh the current mandate first.');
   if(m.status==='withdrawn')return {withdrawn:true};
   tx.update(head,{status:'withdrawn',withdrawnAt:clock()});tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,mandateId:m.mandateId,action:'withdraw',createdAt:clock()});return {withdrawn:true};
  });
  if(action!=='seller_mandate_submit')D.fail(404,'Unknown mandate action.');
  if(!auth.email_verified&&!auth.phone_number)D.fail(403,'Verify your email or phone before signing.');
  if(data.consent!==true||data.identityConsent!==true||data.termsVersion!==VERSION||data.amountCents!==PRICE)D.fail(422,'Review and accept the current R99 mandate and private ID submission.');
  const requestId=D.id(data.requestId),bank=banks.find(b=>b.name===data.bankName);if(!bank)D.fail(422,'Select your bank.');
  schedule(data.firstDate,data.collectionDay,clock);
  const values={firstName:D.text(data.firstName,'name',80),surname:D.text(data.surname,'surname',80),phone:phone(data.phone),documentKind:data.documentKind,documentNumber:D.text(data.documentNumber,'ID or passport number',50),
   accountHolder:D.text(data.accountHolder,'account holder',160),accountNumber:D.text(data.accountNumber,'account number',20),accountType:data.accountType};
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
   const [h,v,a,idNow]=await Promise.all([tx.get(head),tx.get(versionRef),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaSellerIdentity/'+uid))]);if(data.identityEvidenceId&&(!idNow.exists||!current(idNow.data(),uid,clock)||idNow.data().evidenceId!==data.identityEvidenceId))D.fail(409,'Your ID attachment changed. Refresh and review the form.');D.seller(a.exists?a.data():null,uid);
   if(v.exists){if(v.data().fingerprint!==fingerprint)D.fail(409,'Reopen the mandate form.');return {mandate:publicMandate(v.data()),alreadySubmitted:true};}
   if((h.exists?h.data().mandateId:null)!==(data.expectedMandateId||null))D.fail(409,'The mandate changed. Refresh and review it before signing.');
   const record={ownerUid:uid,mandateId:requestId,status:'signed_pending_activation',amountCents:PRICE,currency:'ZAR',firstDate:data.firstDate,collectionDay:data.collectionDay,bankName:bank.name,branchCode,accountLast4:values.accountNumber.slice(-4),detailsEncrypted,identityPath,identityExpiresAt,identityEvidenceId:evidenceId,acceptedAt:clock(),termsVersion:VERSION,terms:text,fingerprint,collectionActive:false};
   tx.set(head,record);tx.set(versionRef,record);tx.set(doc('teyzaMandateAudit/'+crypto.randomUUID()),{actorUid:uid,action:'sign',mandateId:requestId,createdAt:clock(),termsVersion:VERSION,fingerprint});return {mandate:publicMandate(record)};
  });
 }
 return {execute};
}
module.exports={createMandate,actions,publicMandate,terms,schedule,banks,VERSION};
