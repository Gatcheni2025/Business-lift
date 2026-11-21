'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication');
const actions=new Set(['agent_nearby','agent_lead_add']);
const SEARCH_TERMS={spaza:['spaza shop','tuck shop','convenience store'],variety:['hair salon','furniture shop','plumber services'],wholesale:['cash and carry wholesale','food wholesaler','grocery wholesaler']};
const categoryOf=(value)=>['spaza','variety','wholesale','all'].includes(value)?value:'spaza';
function relevantPlace(p,kind){
 const name=String(p.displayName?.text||'').toLowerCase(),types=new Set([p.primaryType,...(p.types||[])]);
 if(kind==='wholesale')return types.has('wholesaler')||/wholesal|cash\s*(?:&|and)\s*carry|bulk\s*(?:food|grocer)/.test(name);
 if(kind==='variety')return /salon|barber|beauty|furniture|upholster|plumb|hardware|electrician|tailor|repair|china\s*(?:shop|mall)|general business/.test(name)||
  ['beauty_salon','hair_care','furniture_store','hardware_store','plumber','electrician','barber_shop'].some(t=>types.has(t));
 if(/\b(?:shoprite|superspar|spar|boxer|checkers|woolworths|pick\s*n\s*pay|freshstop)\b/.test(name))return false;
 return /spaza|tuck\s*shop|mini\s*market|general dealer|corner shop|superette|grocery|convenience|\bshop\b/.test(name)||
  ['convenience_store','grocery_store','food_store'].some(t=>types.has(t));
}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function meters(a,b){const r=Math.PI/180,x=(b.latitude-a.latitude)*r,y=(b.longitude-a.longitude)*r,t=Math.sin(x/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(y/2)**2;return Math.round(12742000*Math.asin(Math.min(1,Math.sqrt(t))));}
function point(data){const latitude=Number(data.latitude),longitude=Number(data.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude< -35.5||latitude> -22||longitude<16||longitude>33.5)D.fail(422,'Choose a location in South Africa.');return {latitude,longitude};}
function match(place,rows){return rows.some(row=>meters(place,row)<=100&&norm(place.name).length>=4&&norm(place.name)===norm(row.name));}
function createFieldDiscovery({db,getPlacesKey=()=>'',fetchImpl=fetch,clock=Date.now,rate}){
 async function google(center,radius,kind='spaza'){const key=getPlacesKey();if(!key)return {places:[],warning:'Google search is unavailable. Teyza and team-recorded shops are still shown.'};
  const query=async text=>{const r=await fetchImpl('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus,places.primaryType,places.types'},body:JSON.stringify({textQuery:text,pageSize:20,languageCode:'en',regionCode:'ZA',locationBias:{circle:{center,radius}}}),signal:AbortSignal.timeout(8500)});if(!r.ok)throw Error('Places unavailable');return (await r.json()).places||[];};
  const queries=kind==='all'?Object.entries(SEARCH_TERMS).flatMap(([category,terms])=>terms.map(text=>({category,text}))):SEARCH_TERMS[kind].map(text=>({category:kind,text}));
  const settled=await Promise.allSettled(queries.map(q=>query(q.text))),seen=new Set(),places=[];
  for(let index=0;index<settled.length;index++){const result=settled[index];if(result.status!=='fulfilled')continue;for(const p of result.value){const coords=p.location||{},name=String(p.displayName?.text||'').slice(0,160),address=String(p.formattedAddress||'').slice(0,350);if(!p.id||seen.has(p.id)||!name||!relevantPlace(p,queries[index].category)||!P.coordinates(coords.latitude,coords.longitude)||p.businessStatus==='CLOSED_PERMANENTLY'||meters(center,coords)>radius)continue;seen.add(p.id);places.push({name,address,...coords,placeId:p.id,shopCategory:queries[index].category,distanceMeters:meters(center,coords),mapsUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name)+'&query_place_id='+encodeURIComponent(p.id)});}}
  return {places:places.sort((a,b)=>a.distanceMeters-b.distanceMeters),warning:settled.some(x=>x.status==='rejected')?'Google results may be incomplete. Search Google Maps and verify with the owner.':null};}
 async function registered(center,radius){const delta=radius/111000+0.01;const q=await db.collection('teyzaShopLocations').where('latitude','>=',center.latitude-delta).where('latitude','<=',center.latitude+delta).orderBy('latitude').limit(301).get();const rows=[];
  const candidates=q.docs.slice(0,300).filter(s=>{const p=s.data();return P.coordinates(p.latitude,p.longitude)&&meters(center,p)<=radius;});for(let i=0;i<candidates.length;i+=20){const batch=candidates.slice(i,i+20);const accounts=await Promise.all(batch.map(s=>db.doc('teyzaSellerAccounts/'+s.id).get()));for(let j=0;j<batch.length;j++){const s=batch[j],loc=s.data(),a=accounts[j],account=a.exists?a.data():null;if(!account||account.uid!==s.id||!['spaza','retail','business','service','wholesale','wholesaler'].includes(account.category)||!P.locationMatches(s.id,account,loc)||!P.freshCoordinates(loc,clock()))continue;rows.push({name:String(account.shopName||'Shop').slice(0,160),address:String(account.address||'').slice(0,350),latitude:loc.latitude,longitude:loc.longitude,distanceMeters:meters(center,loc),googlePlaceId:account.googlePlaceId||loc.googlePlaceId||null,shopCategory:account.category,status:'registered'});}}
  return {shops:rows.sort((a,b)=>a.distanceMeters-b.distanceMeters),partial:q.docs.length>300};}
 async function execute(uid,action,data){
  if(action==='agent_lead_add'){const pos=point(data);if(!Number.isFinite(data.accuracy)||data.accuracy<=0||data.accuracy>100||!Number.isFinite(data.capturedAt)||Math.abs(clock()-data.capturedAt)>60000)D.fail(422,'Capture your current location at the shop with 100 m accuracy or better.');
   const name=D.text(data.name,'shop name',160),address=D.text(data.address,'shop address',350);if(!['not_found','unknown'].includes(data.googleStatus))D.fail(422,'Choose the Google listing status.');if(data.ownerPermission!==true)D.fail(422,'Obtain the owner’s permission before recording this shop.');
   const id=crypto.createHash('sha256').update(norm(name)+'\n'+norm(address)).digest('hex'),ref=db.doc('teyzaAgentLeads/'+id);
   return db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists)return {saved:false,alreadyExists:true};tx.set(ref,{name,address,...pos,googleStatus:data.googleStatus,createdBy:uid,createdAt:clock()});return {saved:true};});}
  const center=point(data),radius=Math.max(1000,Math.min(10000,Number(data.radiusMeters)||5000));await rate(uid,'field-nearby',20,600000);
  const [registration,nearGoogle,leadSnaps]=await Promise.all([registered(center,radius),google(center,radius,categoryOf(data.category)),db.collection('teyzaAgentLeads').where('latitude','>=',center.latitude-radius/111000-0.01).where('latitude','<=',center.latitude+radius/111000+0.01).orderBy('latitude').limit(301).get()]);
  const leads=leadSnaps.docs.slice(0,300).map(s=>s.data()).filter(x=>P.coordinates(x.latitude,x.longitude)&&meters(center,x)<=radius).map(x=>({name:x.name,address:x.address,latitude:x.latitude,longitude:x.longitude,googleStatus:x.googleStatus,distanceMeters:meters(center,x),possibleTeyzaMatch:match(x,registration.shops)})).sort((a,b)=>a.distanceMeters-b.distanceMeters);
  return {registered:registration.shops,google:nearGoogle.places.map(x=>({...x,possibleTeyzaMatch:match(x,registration.shops)})),leads,warning:nearGoogle.warning,partial:registration.partial||leadSnaps.docs.length>300};
 }
 return {execute};
}
module.exports={actions,createFieldDiscovery,meters,point,match,categoryOf,SEARCH_TERMS,relevantPlace};
