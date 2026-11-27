'use strict';
// The caller must verify Meta's raw-body signature before recording a receipt.
// Cache keys bind the sender and message, but never retain either raw identifier,
// a recipient number, message text or provider error description.
const crypto=require('node:crypto');
const SOURCE='meta_whatsapp_signed_webhook';
const ranks={sent:1,failed:2,delivered:3,read:4};

function safeErrorCode(errors){
 for(const error of Array.isArray(errors)?errors.slice(0,5):[]){
  if(Number.isInteger(error?.code)&&error.code>0&&error.code<=2147483647)return error.code;
 }
 return null;
}
function receiptKey(numberId,messageId){
 if(!/^\d{5,25}$/.test(numberId||'')||typeof messageId!=='string'||
    !/^wamid[.][A-Za-z0-9_.:=+/-]{1,500}$/.test(messageId))return null;
 return 'receipt_'+crypto.createHash('sha256').update(JSON.stringify([numberId,messageId])).digest('hex');
}
function deliveryPatch(previous,receipt){
 if(receipt?.deliveryStatusSource!==SOURCE||!Object.hasOwn(ranks,receipt.deliveryStatus))return {};
 const next=receipt.deliveryStatus,old=previous?.deliveryStatus;
 if((ranks[old]||0)>ranks[next])return {};
 if(old===next){
  // A fresh signed duplicate can confirm a legacy row whose provenance was
  // not stored. Lower-status callbacks cannot vouch for a stronger old status.
  // Redeliveries must not change the apparent time of delivery.
  const patch=previous.deliveryStatusSource===SOURCE?{}:{deliveryStatusSource:SOURCE};
  if(next==='failed'&&previous.deliveryErrorCode==null&&receipt.deliveryErrorCode!=null)
   patch.deliveryErrorCode=receipt.deliveryErrorCode;
  return patch;
 }
 return {deliveryStatus:next,deliveryStatusAt:receipt.deliveryStatusAt,
  deliveryStatusSource:SOURCE,deliveryProviderTimestamp:receipt.deliveryProviderTimestamp??null,
  deliveryErrorCode:next==='failed'?(receipt.deliveryErrorCode??null):null};
}
function createDeliveryReceipts({db,clock=Date.now}){
 const reference=(numberId,messageId)=>{
  const key=receiptKey(numberId,messageId);
  return key?db.doc('teyzaWhatsAppDeliveryState/'+key):null;
 };
 async function record(numberId,status){
  const ref=reference(numberId,status?.id);
  if(!ref||!Object.hasOwn(ranks,status?.status))return false;
  const seconds=typeof status.timestamp==='string'&&/^\d{1,13}$/.test(status.timestamp)?Number(status.timestamp):0;
  const milliseconds=seconds*1000;
  const incoming={deliveryStatus:status.status,deliveryStatusAt:clock(),deliveryStatusSource:SOURCE,
   deliveryProviderTimestamp:Number.isSafeInteger(milliseconds)&&milliseconds>0?milliseconds:null,
   deliveryErrorCode:status.status==='failed'?safeErrorCode(status.errors):null};
  await db.runTransaction(async tx=>{
   const saved=await tx.get(ref),current=saved.exists?saved.data():{};
   const patch=deliveryPatch(current,incoming);
   if(Object.keys(patch).length)tx.set(ref,{...current,...patch,kind:'whatsapp_delivery_receipt',schemaVersion:1});
  });
  return true;
 }
 async function reconcile(outboxRef,numberId,messageId,allowsSeller){
  const ref=reference(numberId,messageId);if(!ref)return;
  await db.runTransaction(async tx=>{
   const [outbox,receipt]=await Promise.all([tx.get(outboxRef),tx.get(ref)]);
   if(!outbox.exists||!receipt.exists)return;
   const current=outbox.data();
   if(current.status!=='accepted'||current.providerMessageId!==messageId||!allowsSeller(current.sellerUid))return;
   const patch=deliveryPatch(current,receipt.data());
   if(Object.keys(patch).length)tx.update(outboxRef,patch);
  });
 }
 async function accept(outboxRef,numberId,messageId){
  const ref=reference(numberId,messageId);
  // Reading the receipt in this transaction closes both sides of the race:
  // an early webhook is applied here; a later webhook sees the accepted outbox.
  await db.runTransaction(async tx=>{
   const [outbox,receipt]=await Promise.all([tx.get(outboxRef),ref?tx.get(ref):Promise.resolve(null)]);
   if(!outbox.exists||outbox.data().status!=='sending')return;
   const patch=receipt?.exists?deliveryPatch(outbox.data(),receipt.data()):{};
   tx.update(outboxRef,{status:'accepted',providerMessageId:messageId,acceptedAt:clock(),...patch});
  });
 }
 return {record,reconcile,accept};
}
module.exports={createDeliveryReceipts,deliveryPatch,receiptKey,safeErrorCode};
