'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication');
const {saveUpload}=require('./upload-storage');
const actions=new Set(['business_services_list','business_service_save','business_service_photo',
  'business_cover_read','business_cover_upload']);
const TYPES=new Set(['Beauty & hair','Plumbing','Electrical','Furniture & upholstery','Repairs','Cleaning','Printing','Tutoring','Transport','Other service']);
function serviceRow(uid,id,data){
 if(data.ownerUid!==uid||data.status!=='active')return null;
 return {id,type:data.type,name:data.name,description:data.description||'',imageUrl:data.imageUrl||''};
}
function createBusinessServices({db,bucket,sanitizeImage,clock=Date.now,rate,synchronize}){
 const doc=p=>db.doc(p);
 async function owner(uid){
  const snap=await doc('teyzaSellerAccounts/'+uid).get(),account=D.seller(snap.exists?snap.data():null,uid);
  if(account.category!=='retail')D.fail(403,'Only registered local businesses can manage services.');
  return account;
 }
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid),account=await owner(uid);
  if(action==='business_cover_read'){
   const snap=await doc('teyzaBusinessCovers/'+uid).get();
   const item=snap.exists?snap.data():null;
   return {imageUrl:item?.ownerUid===uid?item.imageUrl||'':'',photoType:item?.ownerUid===uid?item.photoType||'':null};
  }
  if(action==='business_cover_upload'){
   if(data.consent!==true||!['portrait','premises'].includes(data.photoType))
     D.fail(422,'Choose an authorised public portrait or premises photograph and confirm public-display consent.');
   await rate(uid,'business-cover-photo',5,86400000);
   const bytes=D.imageBytes(data.imageBase64);
   let jpeg;try{jpeg=await sanitizeImage(bytes);}catch(_){D.fail(422,'Could not read the business cover image.');}
   const token=crypto.randomUUID(),path='teyza/business-cover/'+uid+'/'+token+'.jpg';
   await saveUpload(bucket,path,jpeg,{contentType:'image/jpeg',resumable:false,
     metadata:{metadata:{firebaseStorageDownloadTokens:token}}});
   const url='https://firebasestorage.googleapis.com/v0/b/'+bucket.name+'/o/'+encodeURIComponent(path)+'?alt=media&token='+token;
   await doc('teyzaBusinessCovers/'+uid).set({ownerUid:uid,imageUrl:url,objectPath:path,
     photoType:data.photoType,publicDisplayConsentAt:clock(),updatedAt:clock()});
   await synchronize(uid);
   return {imageUrl:url,photoType:data.photoType};
  }
  if(action==='business_services_list'){
   await rate(uid,'service-list',45,60000);
   const snap=await db.collection('teyzaBusinessServices/'+uid+'/items').limit(101).get();
   return {services:snap.docs.map(d=>serviceRow(uid,d.id,d.data())).filter(Boolean)};
  }
  if(account.approvalStatus!=='approved')D.fail(403,'Complete business verification before publishing services.');
  const billingSnap=await doc('teyzaBilling/'+uid).get();
  if(!P.eligible(uid,account,billingSnap.exists?billingSnap.data():null,clock()))
   D.fail(403,'Active Premium or a valid temporary grant is required to publish services.');
  if(action==='business_service_save'){
   await rate(uid,'service-save',20,3600000);
   const type=D.text(data.type,'service type',80),name=D.text(data.name,'service name',100);
   if(!TYPES.has(type)||name.length<3)D.fail(422,'Select a service type and enter its name.');
   const description=D.text(data.description||'','service description',500,false);
   const id=data.serviceId?D.id(data.serviceId):crypto.randomUUID();
   const ref=doc('teyzaBusinessServices/'+uid+'/items/'+id);
   const old=await ref.get();
   if(old.exists&&old.data().ownerUid!==uid)D.fail(403,'This service belongs to another account.');
   const stamp=clock();
   await ref.set({ownerUid:uid,type,name,description,status:'active',
     createdAt:old.exists?old.data().createdAt:stamp,updatedAt:stamp},{merge:true});
   await synchronize(uid,{publishIntent:true});
   return {saved:true,serviceId:id};
  }
  if(action==='business_service_photo'){
   const id=D.id(data.serviceId);
   const ref=doc('teyzaBusinessServices/'+uid+'/items/'+id),snap=await ref.get();
   if(!snap.exists||snap.data().ownerUid!==uid||snap.data().status!=='active')
     D.fail(403,'Save the service before uploading its image.');
   if(data.consent!==true)D.fail(422,'Confirm the photo belongs to your business.');
   await rate(uid,'service-photo',12,3600000);
   const bytes=D.imageBytes(data.imageBase64);
   let jpeg;try{jpeg=await sanitizeImage(bytes);}catch(_){D.fail(422,'The service image could not be read.');}
   const token=crypto.randomUUID(),path='teyza/business-service-photos/'+uid+'/'+id+'/'+token+'.jpg';
   await saveUpload(bucket,path,jpeg,{contentType:'image/jpeg',resumable:false,
     metadata:{metadata:{firebaseStorageDownloadTokens:token}}});
   const url='https://firebasestorage.googleapis.com/v0/b/'+bucket.name+'/o/'+encodeURIComponent(path)+'?alt=media&token='+token;
   await ref.set({imageUrl:url,imageObjectPath:path,updatedAt:clock()},{merge:true});
   await synchronize(uid,{publishIntent:true});
   return {imageUrl:url};
  }
  D.fail(404,'Unknown service action.');
 }
 return {execute};
}
module.exports={actions,createBusinessServices,serviceRow,TYPES};
