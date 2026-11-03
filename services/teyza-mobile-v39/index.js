'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onDocumentWritten,onDocumentCreated}=require('firebase-functions/v2/firestore');
const {createNotifications,notificationFor}=require('./notifications');
const catalogue=require('./catalogue');
const {expiredIdentity}=require('./verification-cleanup');
const {productPhoto}=require('./catalogue-photos');
const admin=require('firebase-admin');
const sharp=require('sharp');
const {defineSecret}=require('firebase-functions/params');
const selfieCrypto=require('./selfie-crypto');
const verificationKey=defineSecret('TEYZA_VERIFICATION_ENCRYPTION_KEY');
const placesKey=defineSecret('TEYZA_GOOGLE_PLACES_KEY');
const {createService}=require('./service');
const {uploadReadiness}=require('./upload-storage');
if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore();
const notifications=createNotifications({db,messaging:admin.messaging()});
const bucket=admin.storage().bucket('business-lift-3c19c.firebasestorage.app');
let readinessCache=null,readinessUntil=0;
async function readiness(){
 if(!readinessCache||Date.now()>readinessUntil){readinessUntil=Date.now()+30000;readinessCache=uploadReadiness(bucket,verificationKey.value());}
 return readinessCache;
}
// Apple IdP revocation requires privileged OAuth scopes. Never put the
// service account or an OAuth access token into a mobile application.
async function revokeAppleCode(uid,authorizationCode,idToken){
  if(!uid||!idToken||typeof authorizationCode!=='string'||authorizationCode.length<10)
    throw new Error('Apple authorization code is invalid.');
  const credential=admin.credential.applicationDefault();
  const grant=await credential.getAccessToken();
  if(!grant?.access_token)throw new Error('Apple revocation service credentials are unavailable.');
  const response=await fetch(
    'https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U',
    {method:'POST',headers:{'Content-Type':'application/json',
      Authorization:'Bearer '+grant.access_token},
    body:JSON.stringify({providerId:'apple.com',tokenType:'CODE',
      token:authorizationCode,idToken,
      redirectUri:'https://teyza.co.za'})});
  if(!response.ok)throw new Error('Apple token revocation was not accepted. Account deletion may proceed with manual revocation review.');
}
const service=createService({db,bucket,getAuthUser:uid=>admin.auth().getUser(uid),
   deleteAuthUser:uid=>admin.auth().deleteUser(uid),
   disableAuthUser:uid=>admin.auth().updateUser(uid,{disabled:true}),
   revokeAuthTokens:uid=>admin.auth().revokeRefreshTokens(uid),
   revokeAppleToken:revokeAppleCode,
  getPlacesKey:()=>placesKey.value(),getAddressSigningKey:()=>verificationKey.value(),
  createPhoneToken:uid=>admin.auth().createCustomToken(uid,{teyzaPhoneBootstrap:true}),
  encryptSelfie:bytes=>selfieCrypto.encrypt(bytes,verificationKey.value()),
  decryptSelfie:bytes=>selfieCrypto.decrypt(bytes,verificationKey.value()),
  sanitizeImage:bytes=>sharp(bytes,{limitInputPixels:16000000})
  .rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer()});
exports.teyzaMobile=onRequest({region:'us-central1',invoker:'public',secrets:[verificationKey,placesKey],cors:true,maxInstances:10,memory:'512MiB',timeoutSeconds:60},async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.method==='GET'){
    if(req.query.publicShops!==undefined){
      try{res.json({ok:true,...await service.publicDirectory(req.query.after||'')});}
      catch(error){res.status(error.status||503).json({error:'The approved shop directory is temporarily unavailable.'});}return;
    }
    if(req.query.nativeConfig!==undefined){
      const config=require('./native-config.json');
      res.json({projectId:'business-lift-3c19c',androidAppId:config.androidAppId||'',iosAppId:config.iosAppId||'',iosUrlScheme:config.iosUrlScheme||''});return;
    }
    if(req.query.shopPhoto!==undefined){
      try{const bytes=await service.publicShopPhoto(req.query.shopPhoto,req.query.v);res.set('Cache-Control','public,max-age=300').type('image/jpeg').send(bytes);}
      catch(error){res.status(error.status||503).json({error:'Shop photo is not available.'});}return;
    }
    const key=req.query.cataloguePhoto;
    if(key!==undefined){
      try{
        const bytes=await productPhoto(key);
        if(!bytes){res.status(404).json({error:'Product photo not found.'});return;}
        res.set('Cache-Control','public,max-age=86400').type('image/jpeg').send(bytes);
      }catch(_){res.status(503).json({error:'Product photo is temporarily unavailable.'});}
      return;
    }
    const uploads=await readiness();
    res.json({ok:true,...uploads,shopFrontPhotos:true,version:'3.16.0',sellerOnboarding:true,catalogueProducts:catalogue.data.products.length,
      catalogueRevision:catalogue.data.version,cataloguePhotos:Object.keys(catalogue.data.photos).length,shopServices:true,orderQuotes:true,orderInboxAlways:true,
      service:'teyza-mobile',accountDeletion:true,accountDeletionAuthLock:true,deletedUserReregister:true,shopperSavedAddresses:true,approvedFreeDiscovery:true,freeSellerPlans:true,paidAreaVisibility:true,wholesaleSourcing:true,protectedWholesalePrices:true,chatModeration:true,sevenDayTrial:true,shopperDeletionProfileClear:true,appleRevocationServer:true,fieldAgentWorkspace:true,fieldAgentDiscovery:true,fieldAgentDocuments:true,fieldAgentAdminAreas:true,fieldAgentAdminDocumentBackfill:true,agentEvidenceRetentionDays:90,agentRecruitmentEvidenceRetentionDays:180,agentCommissionCents:9900,sellerNotifications:true,adminReview:true,sellerMandates:true,adminOperations:true,billingMode:'manual_receipt',subscriptionMonthlyCents:9900,stockFinanceReview:true,approvalRequired:true,shopLocations:true,addressAutocomplete:Boolean(placesKey.value())});return;
  }
  if(req.method!=='POST'){res.status(405).json({error:'Use POST.'});return;}
  try{
    const bearer=/^Bearer (\S+)$/.exec(req.get('Authorization')||'');
    if(!bearer){res.status(401).json({error:'Sign in to continue.'});return;}
    let actor;
    try{actor=await admin.auth().verifyIdToken(bearer[1],true);}catch(_){res.status(401).json({error:'Session expired. Sign in again.'});return;}
    // The verified Firebase ID token is passed only inside this trusted request.
    // An Admin SDK custom token is NOT a valid Identity Platform ID token.
    const result=await service.execute({...actor,verifiedFirebaseIdToken:bearer[1]},req.body?.action,req.body?.data||{});
    res.json({ok:true,...result});
  }catch(error){
    if(!error.status)console.error('TEYZA_MOBILE_SERVICE_ERROR',error.code||error.name);
    res.status(error.status||503).json({error:error.status?error.message:'Shop services are temporarily unavailable. Please try again.'});
  }
});
const catalogueTrigger={region:'us-central1',maxInstances:5,retry:true};
exports.teyzaCatalogueDraftChanged=onDocumentWritten({...catalogueTrigger,
  document:'teyzaDraftProducts/{sellerUid}/items/{productId}'},async event=>{
  // Batch catalogue creation already synchronizes in the same transaction.
  if(!event.data?.before.exists)return;
  await service.synchronizeCatalogue(event.params.sellerUid,{
    removedProductId:event.data.after.exists?null:event.params.productId});
});
exports.teyzaCatalogueShopChanged=onDocumentWritten({...catalogueTrigger,
  document:'teyzaPublicShops/{sellerUid}'},async event=>{
  if(!event.data?.after.exists)return;
  const before=event.data.before.data()||{},after=event.data.after.data();
  await notifications.queue(event.id,notificationFor('listing',before,after,event.params.sellerUid));
  if(event.data.before.exists&&before.status===after.status&&before.sellerUid===after.sellerUid&&before.catalogueEnabled===after.catalogueEnabled&&before.sellingEnabled===after.sellingEnabled)return;
  await service.synchronizeCatalogue(event.params.sellerUid);
});
exports.teyzaCatalogueApprovalChanged=onDocumentWritten({...catalogueTrigger,
  document:'teyzaSellerAccounts/{sellerUid}'},async event=>{
  const before=event.data?.before.data()||{},after=event.data?.after.data()||{};
  if(before.uid===after.uid&&before.category===after.category&&before.approvalStatus===after.approvalStatus&&before.listingStatus===after.listingStatus&&before.phone===after.phone&&before.address===after.address&&before.shopName===after.shopName&&before.listingPlan===after.listingPlan)return;
  await service.synchronizeCatalogue(event.params.sellerUid);
});
// Recalculate publication after trusted billing changes. Selecting a plan
// cannot activate a listing; only an admin-recorded paid status can.
exports.teyzaSellerBillingChanged=onDocumentWritten({...catalogueTrigger,
  document:'teyzaBilling/{sellerUid}'},async event=>{
  if(!event.data?.after.exists)return;
  const before=event.data.before.data()||{},after=event.data.after.data()||{};
  if(event.data.before.exists&&before.status===after.status&&
    before.latestPeriod===after.latestPeriod&&before.monthlyCents===after.monthlyCents)return;
  await service.synchronizeCatalogue(event.params.sellerUid);
});
// One bounded pass repairs historical premature live flags. Once complete this
// schedule performs a single checkpoint read; normal writes use existing triggers.
exports.teyzaPublicationRepair=onSchedule({schedule:'every 10 minutes',timeZone:'Africa/Johannesburg',region:'us-central1',maxInstances:1,memory:'512MiB',timeoutSeconds:180},
  async()=>{const result=await service.reconcilePublicationBatch();if(result.checked)console.log('TEYZA_PUBLICATION_REPAIR',result.checked,result.complete);});
exports.teyzaShopLocationRefresh=onSchedule({schedule:'every 6 hours',timeZone:'Africa/Johannesburg',region:'us-central1',maxInstances:1,
  memory:'512MiB',timeoutSeconds:540,secrets:[placesKey]},async()=>{
  const result=await service.refreshShopLocations();if(result.checked)console.log('TEYZA_SHOP_LOCATION_REFRESH',result.checked,result.refreshed,result.cleared);
});
for(const [name,kind,document] of [
 ['teyzaSellerOrderNotification','order','teyzaMobileOrders/{reference}'],
 ['teyzaSellerStockNotification','stock','teyzaDraftProducts/{sellerUid}/items/{reference}'],
 ['teyzaSellerVerificationNotification','verification','teyzaMobileVerification/{reference}'],
 ['teyzaSellerAccountNotification','account','teyzaSellerAccounts/{reference}']]){
 exports[name]=onDocumentWritten({...catalogueTrigger,document},event=>notifications.queue(event.id,
  notificationFor(kind,event.data?.before.data(),event.data?.after.data(),event.params.reference)));
}
exports.teyzaSellerMessageNotification=onDocumentCreated({...catalogueTrigger,
 document:'teyzaMobileChats/{threadId}/messages/{messageId}'},async event=>{
 const value=notificationFor('message',null,event.data?.data(),event.params.threadId);if(!value)return;
 const thread=await db.doc('teyzaMobileChats/'+event.params.threadId).get();
 if(!thread.exists)return;
 const sender=event.data.data().senderUid;
 const t=thread.data();
 if(sender!==t.shopperUid&&sender!==t.ownerUid)return;
 // Owner replies notify the shopper; shopper messages notify the seller.
 await notifications.queue(event.id,{...value,
   ownerUid:sender===t.ownerUid?t.shopperUid:t.ownerUid});
});
exports.teyzaSellerPushNotification=onDocumentCreated({...catalogueTrigger,
 document:'teyzaSellerNotifications/{sellerUid}/items/{notificationId}'},event=>notifications.deliver(event.data.ref));
exports.teyzaFieldAgentCleanup=onSchedule({schedule:'every 60 minutes',timeZone:'Africa/Johannesburg',region:'us-central1',maxInstances:1,memory:'256MiB',timeoutSeconds:180},
  ()=>require('./field-agents').purgeAgentEvidence({db,bucket}));
// Recover account-deletion requests created by older app versions that only
// suspended the seller without closing Firebase Authentication. Never delete
// an Auth user here: the data-retention and provider-closure review remains
// a separate, auditable process.
exports.teyzaDeletionSignInRepair=onSchedule({
  schedule:'every 30 minutes',timeZone:'Africa/Johannesburg',region:'us-central1',
  maxInstances:1,memory:'256MiB',timeoutSeconds:240
},async()=>{
  let cursor=null,checked=0,blocked=0,failed=0;
  for(let page=0;page<10;page++){
    let q=db.collection('teyzaAccountDeletionRequests').orderBy('__name__').limit(100);
    if(cursor)q=q.startAfter(cursor);
    const result=await q.get();
    for(const item of result.docs){
      checked++;
      const request=item.data();
      if(request.status==='completed'||request.authDeletedAt>0)continue;
      try{
        try {
          await admin.auth().updateUser(item.id,{disabled:true});
          await admin.auth().revokeRefreshTokens(item.id);
          await admin.auth().deleteUser(item.id);
        }catch(error){
          if(error?.code!=='auth/user-not-found')throw error;
        }
        await item.ref.update({authDisabledAt:Date.now(),authDeletedAt:Date.now(),updatedAt:Date.now()});
        blocked++;
      }catch(error){
        failed++;
        console.error('TEYZA_DELETION_SIGNIN_LOCK_FAILED',error.code||error.name);
      }
    }
    if(result.docs.length<100)break;
    cursor=result.docs.at(-1);
  }
  console.log('TEYZA_DELETION_SIGNIN_REPAIR',JSON.stringify({checked,blocked,failed}));
});
exports.teyzaMobilePurgeSelfies=onSchedule({schedule:'every day 03:00',timeZone:'Africa/Johannesburg',region:'us-central1',maxInstances:1},async()=>{
  // Tracks every capture, including superseded selfies, so replacements cannot orphan private photos.
  const photos=await db.collection('teyzaVerificationPhotos').where('expiresAt','<=',Date.now()).limit(500).get();
  for(const record of photos.docs){const data=record.data();
    if(data.objectPath?.startsWith('teyza-private/mobile-verification/'+data.ownerUid+'/'))
      await bucket.file(data.objectPath).delete({ignoreNotFound:true});
    await record.ref.delete();
  }
  const expired=await db.collection('teyzaMobileVerification').where('expiresAt','<=',Date.now()).limit(200).get();
  for(const record of expired.docs){
    const data=record.data();
    if(!data.objectPath?.startsWith('teyza-private/mobile-verification/'+record.id+'/'))continue;
    await bucket.file(data.objectPath).delete({ignoreNotFound:true});
    await db.runTransaction(async tx=>{const current=await tx.get(record.ref);
      if(current.exists&&current.data().objectPath===data.objectPath&&current.data().expiresAt<=Date.now())
        tx.update(record.ref,{objectPath:admin.firestore.FieldValue.delete(),expiresAt:admin.firestore.FieldValue.delete(),photoRemovedAt:Date.now()});
    });
  }
  const identities=await db.collection('teyzaSellerIdentity').where('expiresAt','<=',Date.now()).limit(200).get();
  for(const record of identities.docs){const data=record.data();
    if(!data.objectPath?.startsWith('teyza-private/mobile-verification/'+record.id+'/'))continue;
    await bucket.file(data.objectPath).delete({ignoreNotFound:true});
    await db.runTransaction(async tx=>{const current=await tx.get(record.ref);
      const update=expiredIdentity(current.exists?current.data():null,data,Date.now(),admin.firestore.FieldValue.delete());
      if(update)tx.update(record.ref,update);
    });
  }
  const devices=await db.collection('teyzaMobileDevices').where('expiresAt','<=',Date.now()).limit(500).get();
  for(const d of devices.docs)await db.runTransaction(async tx=>{const current=await tx.get(d.ref);
    if(current.exists&&current.data().expiresAt<=Date.now())tx.delete(d.ref);});
});
