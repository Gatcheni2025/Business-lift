'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication');
const DAY=86400000,COORDINATE_TTL=30*DAY,SELECTION_TTL=30*60000;
const actions=new Set(['seller_address_suggest','seller_address_select']);
const validPlaceId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{4,256}$/.test(value);
const session=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const DETAILS='id,formattedAddress,addressComponents,location,types';
function addressDetails(place){
 const parts=Array.isArray(place.addressComponents)?place.addressComponents:[];
 const component=(...types)=>{
  for(const type of types){const part=parts.find(p=>p.types?.includes(type));if(part?.longText)return part.longText;}
  return '';
 };
 const country=parts.find(p=>p.types?.includes('country'))?.shortText;
 const area=component('sublocality_level_1','sublocality','neighborhood','locality','administrative_area_level_3');
 const city=component('locality','postal_town','administrative_area_level_3','administrative_area_level_2');
 const types=place.types||[],number=component('street_number'),route=component('route');
 const building=component('premise','subpremise');
 // A street, suburb or city result alone is not an individual shop address.
 const precise=(number&&route)||(building&&route)||types.some(t=>['street_address','premise','subpremise'].includes(t));
 const latitude=place.location?.latitude,longitude=place.location?.longitude;
 if(country!=='ZA'||!precise||!area||!city||!P.coordinates(latitude,longitude)||!validPlaceId(place.id))
  D.fail(422,'Select a full South African street address with a street number or named building, suburb and town. A street or area alone is not enough.');
 return {placeId:place.id,address:D.text(place.formattedAddress,'selected street address',250),
  area:D.text(area,'suburb',100),city:D.text(city,'town',100),
  province:component('administrative_area_level_1'),postalCode:component('postal_code'),countryCode:'ZA',latitude,longitude};
}
function createShopAddress({getPlacesKey=()=>'',getSigningKey=()=>'',fetchImpl=fetch,clock=Date.now,rate}){
 function signingKey(){const key=getSigningKey();if(!key)D.fail(503,'Address selection is temporarily unavailable. Please retry.');return key;}
 const signature=body=>crypto.createHmac('sha256',signingKey()).update('teyza-shop-address-v1\n'+body).digest();
 function seal(value){const body=Buffer.from(JSON.stringify(value)).toString('base64url');return body+'.'+signature(body).toString('base64url');}
 function open(token,uid,purpose){
  const invalid=()=>D.fail(422,'Select your full shop address from the suggestions again.');
  if(typeof token!=='string'||token.length>6000||!token.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/))return invalid();
  const [body,mac]=token.split('.'),expected=signature(body),actual=Buffer.from(mac,'base64url');
  if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return invalid();
  let value;try{value=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch(_){return invalid();}
  if(value?.v!==1||value.uid!==uid||value.purpose!==purpose||!Number.isFinite(value.issuedAt)||!Number.isFinite(value.expiresAt)||
    value.issuedAt>clock()+60000||value.expiresAt<=clock()||value.expiresAt-value.issuedAt>SELECTION_TTL)return invalid();
  return value;
 }
 async function request(path,{body,fields}={}){
  const key=getPlacesKey();if(!key)D.fail(503,'Address search is temporarily unavailable. Please retry or contact Teyza support.');
  try{
   const response=await fetchImpl('https://places.googleapis.com/v1/'+path,{
    method:body?'POST':'GET',headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':fields,
      ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8500)});
   if(!response.ok)throw new Error('Address provider unavailable');
   return await response.json();
  }catch(_){D.fail(503,'Address search is temporarily unavailable. Please retry.');}
 }
 async function details(placeId,sessionToken){
  if(!validPlaceId(placeId))D.fail(422,'Select an address from the suggestions.');
  const query=new URLSearchParams({languageCode:'en',regionCode:'ZA',...(sessionToken?{sessionToken}:{})});
  const place=await request('places/'+placeId+'?'+query,{fields:DETAILS});
  if(place.id!==placeId)D.fail(422,'That address changed. Search and select it again.');
  return addressDetails(place);
 }
 async function execute(uid,action,data){
  if(action==='seller_address_suggest'){
   const input=D.text(data.query,'address search',180);
   if(input.length<4)return {suggestions:[]};
   if(!session(data.sessionToken))D.fail(422,'Start a new address search.');
   await rate(uid,'address-search',120,600000);
   const result=await request('places:autocomplete',{fields:'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
    body:{input,sessionToken:data.sessionToken,includedRegionCodes:['za'],languageCode:'en',regionCode:'ZA',
      includedPrimaryTypes:['street_address','premise','subpremise'],includeQueryPredictions:false}});
   const issuedAt=clock(),expiresAt=issuedAt+SELECTION_TTL;
   return {suggestions:(Array.isArray(result.suggestions)?result.suggestions:[]).slice(0,5).flatMap(row=>{
    const p=row.placePrediction;
    if(!validPlaceId(p?.placeId)||typeof p.text?.text!=='string'||!p.text.text.trim()||p.text.text.length>350)return [];
    return [{placeId:p.placeId,label:p.text.text,predictionToken:seal({v:1,purpose:'prediction',uid,issuedAt,expiresAt,
      placeId:p.placeId,sessionToken:data.sessionToken})}];
   })};
  }
  const prediction=open(data.predictionToken,uid,'prediction');
  await rate(uid,'address-select',30,3600000);
  const selected=await details(prediction.placeId,prediction.sessionToken),issuedAt=clock();
  return {selection:{...selected,addressSelection:seal({v:1,purpose:'selection',uid,issuedAt,expiresAt:issuedAt+SELECTION_TTL,...selected})}};
 }
 function location(uid,data){
  const selected=open(data.addressSelection,uid,'selection');
  const unit=D.text(data.unit||'','shop or unit number',80,false);
  const address=D.text((unit?unit+', ':'')+selected.address,'shop address',250);
  // Coordinates and area come only from the UID-bound server receipt, never client fields.
  return {ownerUid:uid,address,streetAddress:selected.address,unit,placeId:selected.placeId,area:selected.area,city:selected.city,
   province:selected.province,postalCode:selected.postalCode,countryCode:'ZA',source:'google_places',
   latitude:selected.latitude,longitude:selected.longitude,resolvedAt:selected.issuedAt,
   coordinatesExpireAt:selected.issuedAt+COORDINATE_TTL,coordinatesRefreshAt:selected.issuedAt+27*DAY,consentAt:clock(),updatedAt:clock()};
 }
 return {execute,location,refresh:placeId=>details(placeId)};
}
module.exports={actions,createShopAddress,addressDetails,COORDINATE_TTL,DAY};
