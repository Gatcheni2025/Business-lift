'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const admin=require('firebase-admin');
const sharp=require('sharp');
const {defineSecret}=require('firebase-functions/params');
const selfieCrypto=require('./selfie-crypto');
const verificationKey=defineSecret('TEYZA_VERIFICATION_ENCRYPTION_KEY');
const {createService}=require('./service');
if(!admin.apps.length)admin.initializeApp();
const db=admin.firestore();
const bucket=admin.storage().bucket('business-lift-3c19c.firebasestorage.app');
const service=createService({db,bucket,
  encryptSelfie:bytes=>selfieCrypto.encrypt(bytes,verificationKey.value()),
  decryptSelfie:bytes=>selfieCrypto.decrypt(bytes,verificationKey.value()),
  sanitizeImage:bytes=>sharp(bytes,{limitInputPixels:16000000})
  .rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer()});
exports.teyzaMobile=onRequest({region:'us-central1',invoker:'public',secrets:[verificationKey],cors:true,maxInstances:10,memory:'512MiB',timeoutSeconds:60},async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.method==='GET'){res.json({ok:true,version:'3.9.0',service:'teyza-mobile'});return;}
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
exports.teyzaMobilePurgeSelfies=onSchedule({schedule:'every day 03:00',timeZone:'Africa/Johannesburg',region:'us-central1',maxInstances:1},async()=>{
  const expired=await db.collection('teyzaMobileVerification').where('expiresAt','<=',Date.now()).limit(200).get();
  for(const record of expired.docs){
    const data=record.data();
    if(!data.objectPath?.startsWith('teyza-private/mobile-verification/'+record.id+'/'))continue;
    await bucket.file(data.objectPath).delete({ignoreNotFound:true});
    await record.ref.update({objectPath:admin.firestore.FieldValue.delete(),expiresAt:admin.firestore.FieldValue.delete(),photoRemovedAt:Date.now()});
  }
});
