'use strict';
const D=require('./domain'),catalogue=require('./catalogue');
const normalizedPhone=value=>String(value||'').replace(/[\s()-]/g,'').replace(/^0(?=\d{9}$)/,'+27');
const held=shop=>Boolean(shop&&!['active','pending_review','pending_setup'].includes(shop.status)&&
 !(shop.status==='suspended'&&['onboarding','owner_review','approval'].includes(shop.moderationSource)));
function state(uid,account,setup={},verification,shop){
 const registered=account?.uid===uid&&['spaza','retail'].includes(account.category);
 const modern=setup.requiredVersion===2;
 const ready=registered&&(modern?Boolean(setup.completedAt)&&!setup.moderationBlocked&&
   ['active','pending_approval'].includes(setup.sellingStatus)&&
   Boolean(setup.verifiedPhone)&&setup.verifiedPhone===normalizedPhone(account.phone)&&
   setup.selfieSubmissionId===verification?.submissionId:shop?.sellerUid===uid);
 const reviewed=(!modern&&!verification)||(verification?.ownerUid===uid&&verification.status==='approved');
 const approved=registered&&account.approvalStatus==='approved'&&reviewed;
 const blocked=held(shop)||setup.moderationBlocked===true||account?.approvalStatus==='rejected';
 const live=Boolean(ready&&approved&&!blocked);
 return {registered,ready,approved,live,status:blocked?'suspended':!ready?'pending_setup':!approved?'pending_review':'active'};
}
function assertLive(uid,account,setup,verification,shop){
 D.published(shop,uid);
 if(!state(uid,account,setup,verification,shop).live)D.fail(409,'This shop is awaiting approval or has not finished setup.');
 return shop;
}
const coordinates=(lat,lng)=>typeof lat==='number'&&Number.isFinite(lat)&&lat>=-90&&lat<=90&&
 typeof lng==='number'&&Number.isFinite(lng)&&lng>=-180&&lng<=180&&!(lat===0&&lng===0);
const sameAddress=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();
const locationMatches=(uid,account,location)=>location?.ownerUid===uid&&Boolean(location.consentAt)&&sameAddress(location.address,account?.address);
const freshCoordinates=(value,now)=>value?.source!=='google_places'&&value?.coordinateSource!=='google_places'||Number.isFinite(value.coordinatesExpireAt)&&value.coordinatesExpireAt>now;
function locationFor(uid,account,location,shop,now=Date.now()){
 if(locationMatches(uid,account,location)&&freshCoordinates(location,now)&&coordinates(location.latitude,location.longitude))
  return {latitude:location.latitude,longitude:location.longitude,area:location.area,city:location.city||'',address:account.address,
   ...(location.source==='google_places'?{coordinateSource:'google_places',coordinatesExpireAt:location.coordinatesExpireAt}:{})};
 if(!location&&freshCoordinates(shop,now)&&(!shop?.address||sameAddress(shop.address,account.address))&&coordinates(shop?.latitude,shop?.longitude))
  return {latitude:shop.latitude,longitude:shop.longitude,area:shop.area||account.address,city:shop.city||'',address:account.address};
 return null;
}
function project(uid,{account,setup={},verification,shop,settings={},front,location,drafts=[],removedProductId=null,now=Date.now()}){
 if(shop&&shop.sellerUid!==uid)D.fail(409,'This shop listing needs Teyza support to restore it.');
 const result=state(uid,account,setup,verification,shop);
 if(!result.registered||(!shop&&!setup.completedAt))return null;
 const next={...(shop||{}),sellerUid:uid,name:account.shopName,address:account.address||'',
  area:shop?.address&&sameAddress(shop.address,account.address)?shop.area||account.address:account.address||'',
  shopCategory:account.category,status:result.status,approvalStatus:result.approved?'approved':'pending',
  sellingEnabled:result.live&&(setup.requiredVersion===2||shop?.sellingEnabled===true),
  identityVerified:result.approved,verificationStatus:result.approved?'approved':'pending_review',
  catalogueEnabled:shop?.catalogueEnabled===true,
  pickupEnabled:settings.pickupEnabled??shop?.pickupEnabled??true,
  deliveryEnabled:settings.deliveryEnabled??shop?.deliveryEnabled??false,
  deliveryFeeCents:settings.deliveryFeeCents??shop?.deliveryFeeCents??0,
  deliveryRadiusKm:settings.deliveryRadiusKm??shop?.deliveryRadiusKm??0,
  deliveryNotes:settings.deliveryNotes??shop?.deliveryNotes??'',
  services:{cashback:settings.cashback??shop?.services?.cashback??false,
   cardPayments:settings.cardPayments??shop?.services?.cardPayments??false,
   payAndCollect:settings.pickupEnabled??shop?.pickupEnabled??true,
   liveChat:settings.liveChatEnabled??shop?.services?.liveChat??true},
  ...(settings.hours?{hours:settings.hours}:{})};
 const reviewed={...(shop?.reviewedProductPhotos||{})};
 for(const p of [...(shop?.products||[]),...(shop?.productHighlights||[])])
  if(p.customPhotoApproved===true&&typeof p.imageUrl==='string')reviewed[p.id]=p.imageUrl;
 if(Object.keys(reviewed).length)next.reviewedProductPhotos=reviewed;
 if(!shop||['onboarding','owner_review','approval'].includes(shop.moderationSource))next.moderationSource='approval';
 const pin=locationFor(uid,account,location,shop,now);
 delete next.latitude;delete next.longitude;delete next.city;delete next.coordinateSource;delete next.coordinatesExpireAt;
 if(locationMatches(uid,account,location)){next.area=location.area||next.area;next.city=location.city||'';}
 if(pin)Object.assign(next,pin);
 else if(!location&&(!shop?.address||sameAddress(shop.address,account.address))&&typeof shop?.city==='string')next.city=shop.city;
 if(front?.ownerUid===uid&&front.photoId)next.photoUrl=require('./shop-front').publicUrl(uid,front.photoId);
 Object.assign(next,catalogue.range(uid,next,drafts,{enabled:result.live,removedProductId}));
 return next;
}
function publicRow(uid,shop){
 return {id:uid,sellerUid:uid,name:shop.name,area:shop.area||'',city:shop.city||'',address:shop.address||'',
  status:'active',approvalStatus:'approved',identityVerified:true,shopCategory:shop.shopCategory,
  photoUrl:shop.photoUrl||'',latitude:coordinates(shop.latitude,shop.longitude)?shop.latitude:null,
  longitude:coordinates(shop.latitude,shop.longitude)?shop.longitude:null,
  pickupEnabled:shop.pickupEnabled===true,deliveryEnabled:shop.deliveryEnabled===true,
  services:shop.services||{},products:shop.products||[],productHighlights:shop.productHighlights||[],hours:shop.hours||[],
  deliveryFeeCents:shop.deliveryFeeCents||0,
  rating:shop.ratingSource==='teyza_completed_orders'?shop.rating:null,
  ratingCount:shop.ratingSource==='teyza_completed_orders'?shop.ratingCount:0,ratingSource:shop.ratingSource||''};
}
module.exports={state,assertLive,coordinates,locationFor,locationMatches,project,publicRow,held};
