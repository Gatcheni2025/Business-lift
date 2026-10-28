'use strict';
const crypto=require('node:crypto'),D=require('./domain'),{saveUpload}=require('./upload-storage');
const P=require('./publication');
const endpoint='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
function publicUrl(uid,photoId){return endpoint+'?shopPhoto='+encodeURIComponent(uid)+'&v='+encodeURIComponent(photoId);}
function valid(record,uid){return record?.ownerUid===uid&&typeof record.photoId==='string'&&record.objectPath==='teyza/shop-fronts/'+uid+'/'+record.photoId+'.jpg';}
function createShopFront({db,bucket,sanitizeImage,clock,rate}){
 async function execute(auth,action,data){
  const uid=D.id(auth.uid),ref=db.doc('teyzaShopFrontPhotos/'+uid);
  const account=await db.doc('teyzaSellerAccounts/'+uid).get();D.seller(account.exists?account.data():null,uid);
  if(action==='shop_front_read'){
   const saved=await ref.get();if(!saved.exists||!valid(saved.data(),uid))return {shopFront:null};
   const [bytes]=await bucket.file(saved.data().objectPath).download();
   return {shopFront:{photoId:saved.data().photoId,imageBase64:bytes.toString('base64')}};
  }
  if(data.consent!==true)D.fail(422,'Agree to show this shop-front photo to shoppers when your shop is published.');
  const bytes=D.imageBytes(data.imageBase64);await rate(uid,'shop-front',12,3600000);
  let jpeg;try{jpeg=await sanitizeImage(bytes);}catch(_){D.fail(422,'This shop photo could not be read. Take another photo.');}
  const photoId=crypto.randomUUID(),objectPath='teyza/shop-fronts/'+uid+'/'+photoId+'.jpg';
  await saveUpload(bucket,objectPath,jpeg,{contentType:'image/jpeg',resumable:false,metadata:{cacheControl:'private,no-store'}});
  let old;
  try{await db.runTransaction(async tx=>{
   const shopRef=db.doc('teyzaPublicShops/'+uid),setupRef=db.doc('teyzaSellerOnboarding/'+uid),ownerRef=db.doc('teyzaSellerAccounts/'+uid);
   const [previous,shop,setup,owner]=await Promise.all([tx.get(ref),tx.get(shopRef),tx.get(setupRef),tx.get(ownerRef)]);
   D.seller(owner.exists?owner.data():null,uid);old=previous.exists?previous.data():null;
   tx.set(ref,{ownerUid:uid,photoId,objectPath,consentAt:clock(),updatedAt:clock()});
   if(shop.exists&&shop.data().sellerUid===uid&&shop.data().status==='active'&&owner.data().approvalStatus==='approved'&&setup.data()?.moderationBlocked!==true)
    tx.update(shopRef,{photoUrl:publicUrl(uid,photoId),updatedAt:clock()});
  });}catch(error){try{await bucket.file(objectPath).delete({ignoreNotFound:true});}catch(_){}throw error;}
  if(valid(old,uid))try{await bucket.file(old.objectPath).delete({ignoreNotFound:true});}catch(_){}
  return {saved:true,photoId};
 }
 async function publicPhoto(uid,photoId){
  D.id(uid);D.id(photoId);
  const [shop,saved,owner,setup,v]=await Promise.all(['teyzaPublicShops/','teyzaShopFrontPhotos/','teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/'].map(p=>db.doc(p+uid).get()));
  if(!shop.exists||shop.data().status!=='active'||!P.state(uid,owner.exists?owner.data():null,setup.exists?setup.data():{},v.exists?v.data():null,shop.data()).live||!saved.exists||!valid(saved.data(),uid)||saved.data().photoId!==photoId)
   D.fail(404,'Shop photo is not published.');
  const [bytes]=await bucket.file(saved.data().objectPath).download();return bytes;
 }
 return {execute,publicPhoto};
}
module.exports={createShopFront,publicUrl,valid};
