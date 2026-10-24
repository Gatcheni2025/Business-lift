'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {onDocumentWritten,onDocumentCreated}=require('firebase-functions/v2/firestore');
const {createNotifications,notificationFor}=require('./notifications');
const catalogue=require('./catalogue');
const {productPhoto}=require('./catalogue-photos');
const admin=require('firebase-admin');
const sharp=require('sharp');
const {defineSecret}=require('firebase-functions/params');
const selfieCrypto=require('./selfie-crypto');
const verificationKey=defineSecret('TEYZA_VERIFICATION_ENCRYPTION_KEY');
const {createService}=require('./service');
if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore();
const notifications=createNotifications({db,messaging:admin.messaging()});
const bucket=admin.storage().bucket('business-lift-3c19c.firebasestorage.app');
const service=createService({db,bucket,
  encryptSelfie:bytes=>selfieCrypto.encrypt(bytes,verificationKey.value()),
  decryptSelfie:bytes=>selfieCrypto.decrypt(bytes,verificationKey.value()),
  sanitizeImage:bytes=>sharp(bytes,{limitInputPixels:16000000})
  .rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer()});
exports.teyzaMobile=onRequest({region:'us-central1',invoker:'public',secrets:[verificationKey],cors:true,maxInstances:10,memory:'512MiB',timeoutSeconds:60},async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.method==='GET'){
    const key=req.query.cataloguePhoto;
    if(key!==undefined){
      try{
        const bytes=await productPhoto(key);
        if(!bytes){res.status(404).json({error:'Product photo not found.'});return;}
        res.set('Cache-Control','public,max-age=86400').type('image/jpeg').send(bytes);
      }catch(_){res.status(503).json({error:'Product photo is temporarily unavailable.'});}
      return;
    }
    res.json({ok:true,version:'3.12.0',catalogueProducts:catalogue.data.products.length,service:'teyza-mobile',sellerNotifications:true,adminReview:true});return;
  }
  if(req.method!=='POST'){res.status(405).json({error:'Use POST.'});return;}
  try{
    const bearer=/^Bearer (\S+)$/.exec(req.get('Authorization')||'');
    if(!bearer){res.status(401).json({error:'Sign in to continue.'});return;}
    let actor;
    try{actor=await admin.auth().verifyIdToken(bearer[1],true);}catch(_){res.status(401).json({error:'Session expired. Sign in again.'});return;}
    const result=await service.execute(actor,req.body?.action,req.body?.data||{});
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
  if(event.data.before.exists&&before.status===after.status&&before.sellerUid===after.sellerUid&&before.catalogueEnabled===after.catalogueEnabled)return;
  await service.synchronizeCatalogue(event.params.sellerUid);
});
exports.teyzaCatalogueApprovalChanged=onDocumentWritten({...catalogueTrigger,
  document:'teyzaSellerAccounts/{sellerUid}'},async event=>{
  const before=event.data?.before.data()||{},after=event.data?.after.data()||{};
  if(before.uid===after.uid&&before.category===after.category&&before.approvalStatus===after.approvalStatus&&before.listingStatus===after.listingStatus)return;
  await service.synchronizeCatalogue(event.params.sellerUid);
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
 if(thread.exists&&event.data.data().senderUid===thread.data().shopperUid)
  await notifications.queue(event.id,{...value,ownerUid:thread.data().ownerUid});
});
exports.teyzaSellerPushNotification=onDocumentCreated({...catalogueTrigger,
 document:'teyzaSellerNotifications/{sellerUid}/items/{notificationId}'},event=>notifications.deliver(event.data.ref));
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
  const devices=await db.collection('teyzaMobileDevices').where('expiresAt','<=',Date.now()).limit(500).get();
  for(const d of devices.docs)await db.runTransaction(async tx=>{const current=await tx.get(d.ref);
    if(current.exists&&current.data().expiresAt<=Date.now())tx.delete(d.ref);});
});
