'use strict';
const D=require('./domain');
const actions=new Set(['shop_rate']);
function createRatings({db,clock,rate}){
 async function execute(auth,action,data){
  const uid=D.id(auth.uid),orderId=D.id(data.orderId),stars=data.stars;
  if(!auth.email_verified&&!auth.phone_number)D.fail(403,'Verify your account before rating a shop.');
  if(!Number.isInteger(stars)||stars<1||stars>5)D.fail(422,'Choose a rating from one to five stars.');
  await rate(uid,'rating',20,3600000);
  return db.runTransaction(async tx=>{
   const orderRef=db.doc('teyzaMobileOrders/'+orderId),orderSnap=await tx.get(orderRef);
   const order=orderSnap.exists?orderSnap.data():null;
   if(!order||order.shopperUid!==uid||order.ownerUid===uid)D.fail(403,'Only this order’s shopper can rate the shop.');
   if(order.status!=='completed')D.fail(409,'Rate the shop after your order is completed.');
   const shopRef=db.doc('teyzaPublicShops/'+D.id(order.ownerUid));
   const ratingRef=db.doc('teyzaShopRatings/'+order.ownerUid+'/shoppers/'+uid);
   const [shopSnap,oldSnap]=await Promise.all([tx.get(shopRef),tx.get(ratingRef)]);
   const shop=D.published(shopSnap.exists?shopSnap.data():null,order.ownerUid);
   const old=oldSnap.exists?oldSnap.data():null;
   // One current rating per shopper per shop. Repeat orders cannot inflate count.
   const count=(Number.isInteger(shop.ratingCount)?shop.ratingCount:0)+(old?0:1);
   const total=(Number.isInteger(shop.ratingTotal)?shop.ratingTotal:0)-(old?.stars||0)+stars;
   if(count<1||total<count||total>count*5)D.fail(409,'Shop rating summary needs support review.');
   tx.set(ratingRef,{shopperUid:uid,sellerUid:order.ownerUid,orderId,stars,updatedAt:clock()});
   tx.update(shopRef,{ratingCount:count,ratingTotal:total,rating:total/count,ratingSource:'teyza_completed_orders'});
   return {saved:true,rating:total/count,ratingCount:count};
  });
 }
 return {execute};
}
module.exports={actions,createRatings};
