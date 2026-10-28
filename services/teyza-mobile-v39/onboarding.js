'use strict';
const crypto=require('node:crypto'),D=require('./domain'),catalogue=require('./catalogue');
const {saveUpload}=require('./upload-storage');
const P=require('./publication');
const actions=new Set(['seller_onboarding','seller_identity_submit','seller_onboarding_complete','seller_identity_read','seller_phone_session']);
function phone(value){
 let n=String(value||'').replace(/[\s()-]/g,'');
 if(/^0\d{9}$/.test(n))n='+27'+n.slice(1);
 if(!/^\+[1-9]\d{8,14}$/.test(n))D.fail(422,'Enter a mobile number with its country code, such as +27 71 234 5678.');
 return n;
}
function checkedPhone(user,expected){
 const number=phone(expected);
 if(!user||user.disabled||user.phoneNumber!==number||!user.providerData?.some(p=>p.providerId==='phone'&&p.phoneNumber===number))
  D.fail(409,'Verify this shop’s mobile number with the SMS code first.');
 return number;
}
function identity(data){
 const legalType=data.legalType;
 if(!['individual','company'].includes(legalType))D.fail(422,'Choose Individual or Registered company.');
 if(legalType==='company')return {legalType,kind:'company',companyName:D.text(data.companyName,'registered company name',160),
  registrationNumber:D.text(data.registrationNumber,'company registration number',50)};
 if(!['id','passport'].includes(data.kind))D.fail(422,'Choose ID or Passport.');
 const documentNumber=D.text(data.documentNumber,'ID or passport number',50);
 if(documentNumber.length<4)D.fail(422,'Enter your ID or passport number.');
 return {legalType,kind:data.kind,documentNumber};
}
function current(record,uid,clock){return record?.ownerUid===uid&&record.expiresAt>clock()&&
 typeof record.objectPath==='string'&&record.objectPath.startsWith('teyza-private/mobile-verification/'+uid+'/');}
function createOnboarding({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getAuthUser,createPhoneToken,clock,rate}){
 const doc=p=>db.doc(p),read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid);
  if(action==='seller_identity_read'){
   require('./seller-experience').recentAdmin(auth,clock);
   const target=D.id(data.sellerUid),record=await read('teyzaSellerIdentity/'+target);
   if(target===uid)D.fail(403,'Another administrator must review your own shop.');
   if(!current(record,target,clock))D.fail(404,'No current identity document is available.');
   if(data.evidenceId!==record.evidenceId)D.fail(409,'This document changed. Refresh the review queue.');
   const [bytes]=await bucket.file(record.objectPath).download();
   const details=JSON.parse((await decryptSelfie(Buffer.from(record.detailsEncrypted,'base64'))).toString('utf8'));
   await doc('teyzaIdentityViews/'+uid+'/evidence/'+record.evidenceId).set({sellerUid:target,viewedAt:clock()});
   return {imageBase64:(await decryptSelfie(bytes)).toString('base64'),details};
  }
  const account=D.seller(await read('teyzaSellerAccounts/'+uid),uid);
  if(action==='seller_phone_session'){
   await rate(uid,'phone-session',5,3600000);
   const user=await getAuthUser(uid);
   if(!user||user.disabled)D.fail(401,'Sign in again to verify your mobile.');
   if(!createPhoneToken)D.fail(503,'Phone verification needs Teyza support to finish device setup.');
   // Used only to link Android instant-verification credentials to this SAME UID.
   // This token grants no OTP proof and cannot renew administrator review access.
   return {uid,token:await createPhoneToken(uid)};
  }
  if(action==='seller_onboarding'){
   const [saved,id,selfie,shop,user,front,location]=await Promise.all([read('teyzaSellerOnboarding/'+uid),read('teyzaSellerIdentity/'+uid),
    read('teyzaMobileVerification/'+uid),read('teyzaPublicShops/'+uid),getAuthUser(uid),read('teyzaShopFrontPhotos/'+uid),read('teyzaShopLocations/'+uid)]);
   let verified=false;try{checkedPhone(user,account.phone);verified=true;}catch(_){}
   return {legalType:saved?.legalType||(account.companyName&&account.registrationNumber?'company':'individual'),
    shopFront:front?.ownerUid===uid?{photoId:front.photoId}:null,phone:account.phone||'',phoneVerified:verified,identity:current(id,uid,clock)?{kind:id.kind,evidenceId:id.evidenceId}:null,
    selfie:current(selfie,uid,clock)?{status:selfie.status,submissionId:selfie.submissionId}:null,
    sellingStatus:saved?.sellingStatus||'not_started',moderationBlocked:saved?.moderationBlocked===true,
    locationSaved:Boolean(P.locationFor(uid,account,location,shop,clock())),
    publicationStatus:P.state(uid,account,saved||{},selfie,shop).status};
  }
  if(action==='seller_identity_submit'){
   if(data.consent!==true)D.fail(422,'Confirm that you want to submit this private document.');
   const values=identity(data),bytes=D.imageBytes(data.imageBase64);
   await rate(uid,'identity',8,3600000);
   let jpeg;try{jpeg=await sanitizeImage(bytes);}catch(_){D.fail(422,'This document photo could not be read. Take another photo.');}
   const stamp=clock(),evidenceId=crypto.randomUUID(),objectPath='teyza-private/mobile-verification/'+uid+'/'+evidenceId+'.enc';
   const [encrypted,detailsEncrypted]=await Promise.all([encryptSelfie(jpeg),encryptSelfie(Buffer.from(JSON.stringify(values)))]);
   // Track every attempt before upload, including interrupted or replaced evidence.
   await doc('teyzaVerificationPhotos/'+evidenceId).set({ownerUid:uid,objectPath,expiresAt:stamp+90*86400000});
   await saveUpload(bucket,objectPath,encrypted,{contentType:'application/octet-stream',resumable:false,metadata:{cacheControl:'private,no-store'}});
   await db.runTransaction(async tx=>{
    const idRef=doc('teyzaSellerIdentity/'+uid),setupRef=doc('teyzaSellerOnboarding/'+uid),shopRef=doc('teyzaPublicShops/'+uid),selfieRef=doc('teyzaMobileVerification/'+uid);
    const accountRef=doc('teyzaSellerAccounts/'+uid);
    const [old,setup,shop,selfie,a]=await Promise.all([tx.get(idRef),tx.get(setupRef),tx.get(shopRef),tx.get(selfieRef),tx.get(accountRef)]);
    D.seller(a.exists?a.data():null,uid);
    const type=setup.exists?setup.data().legalType:(account.companyName&&account.registrationNumber?'company':null);
    if(type&&type!==values.legalType)D.fail(409,'Submit the document type selected for your registration. Contact Teyza support to change the legal account type.');
    tx.set(idRef,{ownerUid:uid,legalType:values.legalType,kind:values.kind,evidenceId,objectPath,
     detailsEncrypted:detailsEncrypted.toString('base64'),submittedAt:stamp,expiresAt:stamp+90*86400000,consentAt:stamp,consentVersion:'seller-identity-v1'});
    tx.set(setupRef,{requiredVersion:2,legalType:values.legalType,identityEvidenceId:evidenceId,
     sellingStatus:'not_started',updatedAt:stamp},{merge:true});
    tx.update(accountRef,{approvalStatus:'pending',listingStatus:'not_listed',updatedAt:new Date(stamp)});
    if(shop.exists&&shop.data().sellerUid===uid)tx.update(shopRef,{sellingEnabled:false,approvalStatus:'pending',identityVerified:false,verificationStatus:'pending_review',...(!P.held(shop.data())&&setup.data()?.moderationBlocked!==true?{status:'pending_setup',moderationSource:'onboarding'}:{})});
    if(selfie.exists)tx.update(selfieRef,{status:'pending_review',identityEvidenceId:evidenceId});
   });
   return {saved:true,evidenceId,kind:values.kind};
  }
  if(action==='seller_onboarding_complete'){
   await rate(uid,'complete',12,3600000);
   const user=await getAuthUser(uid);checkedPhone(user,account.phone);
   return db.runTransaction(async tx=>{
    const refs=['teyzaSellerAccounts/','teyzaSellerIdentity/','teyzaMobileVerification/','teyzaSellerOnboarding/','teyzaPublicShops/','teyzaShopSettings/','teyzaShopFrontPhotos/'].map(p=>doc(p+uid));
    const [a,i,v,o,s,c,f,drafts]=await Promise.all([...refs.map(r=>tx.get(r)),tx.get(db.collection('teyzaDraftProducts/'+uid+'/items').limit(201))]);
    const owner=D.seller(a.exists?a.data():null,uid),id=i.exists?i.data():null,selfie=v.exists?v.data():null,setup=o.exists?o.data():{},shop=s.exists?s.data():null,settings=c.exists?c.data():{};
    const verifiedPhone=checkedPhone(user,owner.phone);
    if(setup.moderationBlocked||owner.approvalStatus==='rejected'||['rejected','needs_new_photo'].includes(selfie?.status))D.fail(409,'Your registration needs an administrator’s review before selling can resume.');
    if(!current(id,uid,clock)||!['id','passport','company'].includes(id.kind)||id.legalType!==setup.legalType)D.fail(409,'Submit your current ID, passport or company registration document first.');
    if(!current(selfie,uid,clock))D.fail(409,'Take and submit your owner selfie first.');
    if(drafts.docs.length>200)D.fail(409,'Remove unused drafts so your shop has no more than 200 products.');
    if(shop&&(shop.sellerUid!==uid||(shop.status==='suspended'&&!['onboarding','owner_review','approval'].includes(shop.moderationSource))))D.fail(409,'Contact Teyza support to restore this shop listing.');
    const nextSetup={...setup,requiredVersion:2,legalType:id.legalType,sellingStatus:'pending_approval',
      identityEvidenceId:id.evidenceId,selfieSubmissionId:selfie.submissionId,verifiedPhone,
      phoneVerifiedAt:clock(),completedAt:clock(),updatedAt:clock()};
    const pin=await tx.get(doc('teyzaShopLocations/'+uid));
    const next=P.project(uid,{account:owner,setup:nextSetup,verification:selfie,shop,settings,
      front:f.exists?f.data():null,location:pin.exists?pin.data():null,
      drafts:drafts.docs.map(r=>({id:r.id,data:r.data()})),now:clock()});
    nextSetup.sellingStatus=next.status==='active'?'active':'pending_approval';
    tx.set(refs[4],{...next,updatedAt:clock()});
    tx.update(refs[0],{listingStatus:next.status==='active'?'active':'not_listed',updatedAt:new Date(clock())});
    tx.set(refs[3],nextSetup);
    return {sellingStatus:nextSetup.sellingStatus,publicationStatus:next.status,verificationStatus:next.verificationStatus};
   });
  }
  D.fail(404,'This registration service is not available.');
 }
 return {execute};
}
module.exports={createOnboarding,actions,phone,identity,current,checkedPhone};
