'use strict';
// Same product IDs and ZAR prices are configured independently in App Store Connect
// and Google Play Console. Stores, never client-provided numbers, collect payment.
const MAX_RADIUS_KM=50,LOCAL_RADIUS_KM=10,DAYS=7;
const PRICE_CENTS=radiusKm=>2900+Math.max(0,radiusKm-LOCAL_RADIUS_KM)*200;
const productId=radiusKm=>{
 if(!Number.isInteger(radiusKm)||radiusKm<1||radiusKm>MAX_RADIUS_KM)
  throw Error('Advertising radius must be a whole number between 1 and 50 kilometres.');
 return 'teyza_ad7d_r'+String(Math.max(LOCAL_RADIUS_KM,radiusKm));
};
const radiusFromProductId=id=>{
 if(typeof id!=='string'||!/^teyza_ad7d_r(?:10|1[1-9]|[2-4][0-9]|50)$/.test(id))
  return null;
 return Number(id.slice('teyza_ad7d_r'.length));
};
const products=Array.from({length:41},(_,i)=>{
 const radiusKm=i+LOCAL_RADIUS_KM;return {
  productId:productId(radiusKm),maxRadiusKm:radiusKm,amountZarCents:PRICE_CENTS(radiusKm),
  days:DAYS,type:'consumable',autoRenew:false};
});
module.exports={MAX_RADIUS_KM,LOCAL_RADIUS_KM,DAYS,PRICE_CENTS,productId,radiusFromProductId,products};
