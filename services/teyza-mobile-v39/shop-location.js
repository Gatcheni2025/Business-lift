'use strict';
const D=require('./domain'),P=require('./publication');
const {DAY,COORDINATE_TTL}=require('./shop-address');
const actions=new Set(['seller_location_read','seller_location_save']);
function createShopLocation({db,clock,rate,synchronize,shopAddress}){
 async function execute(auth,action,data){
  const uid=D.id(auth.uid),accountRef=db.doc('teyzaSellerAccounts/'+uid),locationRef=db.doc('teyzaShopLocations/'+uid);
  const a=await accountRef.get(),account=D.seller(a.exists?a.data():null,uid);
  if(action==='seller_location_read'){
   const [l,s]=await Promise.all([locationRef.get(),db.doc('teyzaPublicShops/'+uid).get()]);
   const location=l.exists?l.data():null;
   const current=P.locationMatches(uid,account,location);
   return {address:account.address||'',streetAddress:current?location.streetAddress||account.address:account.address||'',unit:current?location.unit||'':'',
    location:P.locationFor(uid,account,location,s.exists?s.data():null,clock()),addressSelected:current&&location.source==='google_places'};
  }
  if(data.consent!==true)D.fail(422,'Confirm that this is your shop location and that shoppers may see it.');
  const location=shopAddress.location(uid,data);
  await rate(uid,'shop-location',20,3600000);
  await db.runTransaction(async tx=>{
   const current=await tx.get(accountRef);D.seller(current.exists?current.data():null,uid);
   tx.set(locationRef,location);
   // These are existing business-profile fields; approval and category are never accepted from the client.
   tx.update(accountRef,{address:location.address,updatedAt:new Date(clock())});
  });
  await synchronize(uid);
  return {saved:true};
 }
 async function refresh(){
  // Renew before the 30-day cache limit; defer failures so one row cannot starve later shops.
  const rows=await db.collection('teyzaShopLocations').where('coordinatesRefreshAt','<=',clock())
   .orderBy('coordinatesRefreshAt').limit(100).get();
  let refreshed=0,cleared=0;
  async function renew(row){
   const old=row.data(),uid=row.id;if(old.source!=='google_places'||old.ownerUid!==uid)return;
   let latest=null;try{latest=await shopAddress.refresh(old.placeId);}catch(_){/* Clear the cache and retry without persisting provider errors. */}
   const outcome=await db.runTransaction(async tx=>{
    const [saved,owner]=await Promise.all([tx.get(row.ref),tx.get(db.doc('teyzaSellerAccounts/'+uid))]);
    if(!saved.exists)return false;
    const current=saved.data();
    if(current.ownerUid!==uid||current.placeId!==old.placeId||current.updatedAt!==old.updatedAt)return false;
    if(!owner.exists||!P.locationMatches(uid,owner.data(),current)){
     tx.set(row.ref,{...current,latitude:null,longitude:null,coordinatesRefreshAt:clock()+27*DAY,updatedAt:clock()});return 'cleared';
    }
    if(latest){tx.set(row.ref,{...current,latitude:latest.latitude,longitude:latest.longitude,resolvedAt:clock(),
      coordinatesExpireAt:clock()+COORDINATE_TTL,coordinatesRefreshAt:clock()+27*DAY,updatedAt:clock()});return 'refreshed';}
    tx.set(row.ref,{...current,latitude:null,longitude:null,coordinatesRefreshAt:clock()+DAY/4,updatedAt:clock()});
    return 'cleared';
   });
   if(outcome){if(outcome==='refreshed')refreshed++;else cleared++;await synchronize(uid);}
  }
  for(let offset=0;offset<rows.docs.length;offset+=5)await Promise.all(rows.docs.slice(offset,offset+5).map(renew));
  return {checked:rows.docs.length,refreshed,cleared};
 }
 return {execute,refresh};
}
module.exports={actions,createShopLocation};
