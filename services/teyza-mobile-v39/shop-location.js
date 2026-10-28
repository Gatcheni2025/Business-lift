'use strict';
const D=require('./domain'),P=require('./publication');
const actions=new Set(['seller_location_read','seller_location_save']);
function createShopLocation({db,clock,rate,synchronize}){
 async function execute(auth,action,data){
  const uid=D.id(auth.uid),accountRef=db.doc('teyzaSellerAccounts/'+uid),locationRef=db.doc('teyzaShopLocations/'+uid);
  const a=await accountRef.get(),account=D.seller(a.exists?a.data():null,uid);
  if(action==='seller_location_read'){
   const [l,s]=await Promise.all([locationRef.get(),db.doc('teyzaPublicShops/'+uid).get()]);
   return {address:account.address||'',location:P.locationFor(uid,account,l.exists?l.data():null,s.exists?s.data():null)};
  }
  if(data.consent!==true)D.fail(422,'Confirm that this is your shop location and that shoppers may see it.');
  if(!P.coordinates(data.latitude,data.longitude))D.fail(422,'Choose a valid shop map location.');
  const address=D.text(data.address,'shop address',250),area=D.text(data.area,'suburb or area',100),city=D.text(data.city,'town or city',100);
  await rate(uid,'shop-location',20,3600000);
  await db.runTransaction(async tx=>{
   const current=await tx.get(accountRef);D.seller(current.exists?current.data():null,uid);
   tx.set(locationRef,{ownerUid:uid,address,area,city,latitude:data.latitude,longitude:data.longitude,consentAt:clock(),updatedAt:clock()});
   // These are existing business-profile fields; approval and category are never accepted from the client.
   tx.update(accountRef,{address,updatedAt:new Date(clock())});
  });
  await synchronize(uid);
  return {saved:true};
 }
 return {execute};
}
module.exports={actions,createShopLocation};
