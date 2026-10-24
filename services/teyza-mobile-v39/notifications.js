'use strict';
const crypto=require('node:crypto');
const defaults=require('./seller-experience').defaults;
function notificationFor(kind,before,after,reference){
 if(kind==='order'&&after&&(!before||before.status!==after.status))return {ownerUid:after.ownerUid,category:'orders',target:'orders',reference,
  title:before?'Order updated':'New order request',body:before?'An order status changed. Open your orders to see the latest details.':'A shopper has sent an order request. Open your orders to respond.'};
 if(kind==='message'&&after&&after.sender==='shopper')return {category:'messages',target:'chat',reference,
  title:'New customer message',body:'A shopper sent you a message. Open Live chat to reply.'};
 if(kind==='stock'&&after?.status==='draft'&&Number.isInteger(after.stockQty)&&after.stockQty<=5&&
   (!before||before.stockQty>5||(after.stockQty===0&&before.stockQty>0)))return {ownerUid:after.ownerUid,category:'stock',target:'products',reference,
  title:after.stockQty===0?'Product sold out':'Stock running low',body:'Check your product stock and update your available quantities.'};
 if(kind==='verification'&&after&&(!before||before.status!==after.status||before.submissionId!==after.submissionId))return {
  ownerUid:after.ownerUid,category:'reviews',target:'verification',reference,title:({pending_review:'Selfie received',approved:'Owner verification approved',needs_new_photo:'New selfie needed',rejected:'Seller review update'})[after.status]||'Verification update',
  body:after.status==='pending_review'?'Your private selfie is awaiting an administrator’s review.':after.reviewNote||'Open owner verification for your review outcome.'};
 if(kind==='account'&&after&&(!before||before.approvalStatus!==after.approvalStatus||before.listingStatus!==after.listingStatus))return {
  ownerUid:after.uid,category:'reviews',target:'verification',reference,title:'Shop registration update',
  body:after.approvalStatus==='approved'?'Your owner account is approved. Your shop’s listing status is shown in your workspace.':'Open your workspace to check your shop registration status.'};
 return null;
}
function createNotifications({db,messaging,clock=Date.now}){
 async function queue(eventId,value){
  if(!value||!value.ownerUid||!Object.hasOwn(defaults,value.category))return;
  const uid=value.ownerUid;
  const ref=db.doc('teyzaSellerNotifications/'+uid+'/items/'+crypto.createHash('sha256').update(eventId).digest('hex'));
  await db.runTransaction(async tx=>{
   const [old,account,prefs]=await Promise.all([tx.get(ref),tx.get(db.doc('teyzaSellerAccounts/'+uid)),tx.get(db.doc('teyzaSellerNotificationPreferences/'+uid))]);
   if(old.exists||!account.exists||account.data().uid!==uid)return;
   if(prefs.exists&&prefs.data().preferences?.[value.category]===false)return;
   tx.set(ref,{...value,read:false,createdAt:clock(),pushStatus:'pending'});
  });
 }
 async function deliver(ref){
  const snapshot=await ref.get();if(!snapshot.exists)return;
  const n=snapshot.data();if(n.pushStatus==='sent')return;
  const prefs=await db.doc('teyzaSellerNotificationPreferences/'+n.ownerUid).get();
  if(prefs.exists&&prefs.data().preferences?.[n.category]===false){await ref.update({pushStatus:'disabled'});return;}
  const result=await db.collection('teyzaMobileDevices').where('ownerUid','==',n.ownerUid).limit(20).get();
  const devices=result.docs.filter(d=>d.data().token&&d.data().expiresAt>clock());
  if(!devices.length){await ref.update({pushStatus:'no_device'});return;}
  // Lock-screen text deliberately excludes shop names, messages, selfie results and customer details.
  const response=await messaging.sendEachForMulticast({tokens:devices.map(d=>d.data().token),notification:{title:'Teyza seller update',body:'You have a new shop update. Open Teyza to view it.'},
   data:{target:n.target,ownerUid:n.ownerUid,notificationId:ref.id},android:{priority:'high',notification:{tag:ref.id}},
   apns:{headers:{'apns-collapse-id':ref.id},payload:{aps:{sound:'default'}}}});
  let retry=false;
  for(let i=0;i<response.responses.length;i++){
   const r=response.responses[i];if(r.success)continue;
   if(['messaging/invalid-registration-token','messaging/registration-token-not-registered'].includes(r.error?.code)){
    // Don't invalidate a token that was reassigned/refreshed while the send was in flight.
    await db.runTransaction(async tx=>{const current=await tx.get(devices[i].ref);
     if(current.exists&&current.data().ownerUid===n.ownerUid&&current.data().token===devices[i].data().token)
      tx.update(devices[i].ref,{token:'',expiresAt:0});});
   }else retry=true;
  }
  if(retry)throw new Error('TEYZA_NOTIFICATION_RETRY');
  await ref.update({pushStatus:'sent',pushAt:clock()});
 }
 return {queue,deliver};
}
module.exports={notificationFor,createNotifications};
