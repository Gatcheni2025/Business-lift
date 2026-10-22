'use strict';
// Teyza Places R3.4 — Firebase Cloud Functions v2.
// Only public Google-listed business information is returned, never merchant stock.
const express=require('express');
const {onRequest}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const API_KEY=defineSecret('TEYZA_GOOGLE_PLACES_KEY');
const app=express();
const ROOT='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces';
const ORIGINS=new Set(['https://teyza.co.za','https://www.teyza.co.za',
  'https://business-lift-3c19c.web.app','https://discover.teyza.co.za']);
app.disable('x-powered-by');
app.use((req,res,next)=>{
  const origin=req.get('origin');
  if(ORIGINS.has(origin)){res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');}
  res.set('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS'){
    res.set('Access-Control-Allow-Methods','GET, OPTIONS');
    res.set('Access-Control-Allow-Headers','Content-Type');return res.status(204).end();
  }
  next();
});
const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)&&n>=lo&&n<=hi?n:null};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const dist=(a,b,c,d)=>{
  const rad=Math.PI/180,delta=(c-a)*rad,lon=(d-b)*rad;
  const f=Math.sin(delta/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(lon/2)**2;
  return 12742*Math.asin(Math.sqrt(clamp(f,0,1)));
};
const category=v=>['variety','retail','other','other retail','other-retail'].includes(String(v).toLowerCase())?'variety':'spaza';
const photoResource=name=>{
  const s=String(name||'').replace(/\/media$/,'');
  return /^places\/[A-Za-z0-9_-]{4,256}\/photos\/[A-Za-z0-9_-]{4,2200}$/.test(s)?s:null;
};
const kindMatch=(p,kind)=>{
  const name=String(p.displayName?.text||'').toLowerCase();
  const types=new Set([p.primaryType,...(p.types||[])]);
  if(kind==='spaza')return /spaza|tuck.?shop|mini.?market|convenience|grocer|general dealer|corner shop|supermarket/.test(name)||
    ['convenience_store','grocery_store','supermarket'].some(t=>types.has(t));
  if(/spaza|tuck.?shop|tyres?|restaurant|takeaway|auto spares|motor spares|printing|salon/.test(name))return false;
  return /china.?mall|mall|shopping|wholesale|cash.?(&|and).?carry|retail|supermarket|variety|bazaar|clothing|fashion|furniture|homeware|department/.test(name)||
    ['shopping_mall','department_store','supermarket','clothing_store','home_goods_store'].some(t=>types.has(t));
};
async function queryGoogle(key,query,lat,lon,radius){
  const response=await fetch('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.primaryType,places.types,places.photos'
    },
    body:JSON.stringify({
      textQuery:query,
      pageSize:20,
      locationBias:{circle:{center:{latitude:lat,longitude:lon},radius}}
    }),
    signal:AbortSignal.timeout(9500)
  });
  if(!response.ok){
    const body=await response.text();
    throw new Error('Places search '+response.status+': '+body.slice(0,150));
  }
  const data=await response.json();
  return Array.isArray(data.places)?data.places:[];
}
function mapResult(p,kind,lat,lon){
  if(!p.id||!p.location)return null;
  const photo=(p.photos||[]).find(x=>photoResource(x.name));
  const ref=photo?photoResource(photo.name):null;
  const la=p.location.latitude,lo=p.location.longitude;
  return {
    id:'google-'+p.id,
    name:p.displayName?.text||'Local shop',
    area:'Nearby',
    address:p.formattedAddress||'',
    latitude:la,longitude:lo,
    distanceKm:+dist(lat,lon,la,lo).toFixed(2),
    origin:'google_places',
    shopCategory:kind,
    sourceUrl:p.googleMapsUri||
      'https://www.google.com/maps/search/?api=1&query_place_id='+encodeURIComponent(p.id),
    claimUrl:'https://teyza.co.za/?auth=register',
    photoRef:ref,
    photoUrl:ref?ROOT+'/shopper-place-photo.php?name='+encodeURIComponent(ref)+'&w=720':null,
    photoAttributions:(photo?.authorAttributions||[]).map(a=>({
      name:a.displayName||'Google Maps contributor',url:a.uri||''
    })),
    attributions:[{name:'Google Maps',url:'https://maps.google.com/'}],
    isTeyzaMerchant:false
  };
}
app.get('/health',(_,res)=>res.json({
  ok:true,service:'teyza-places',version:'3.4',provider:'firebase-functions'
}));
app.get(['/shopper-discover.php','/shopper-discover'],async(req,res)=>{
  res.set('Cache-Control','no-store');
  const lat=num(req.query.lat,-90,90),lon=num(req.query.lon,-180,180);
  if(lat===null||lon===null)return res.status(400).json({ok:false,error:'lat and lon required'});
  const kind=category(req.query.category);
  const radius=num(req.query.radius,500,50000)??(kind==='spaza'?14000:30000);
  const q=String(req.query.q||'').trim().slice(0,70);
  const queries=q?[q]:(kind==='spaza'
    ?['spaza shop','tuck shop','convenience store']
    :['China Mall','shopping mall','wholesale cash and carry','retail stores']);
  try{
    const key=API_KEY.value();
    if(!key)return res.status(503).json({ok:false,error:'Places not configured'});
    const responses=await Promise.allSettled(queries.map(text=>queryGoogle(key,text,lat,lon,radius)));
    const successful=responses.filter(x=>x.status==='fulfilled');
    if(!successful.length){
      console.error('Teyza search failures',responses.map(x=>String(x.reason||'')).slice(0,4));
      return res.status(502).json({ok:false,error:'Places temporarily unavailable'});
    }
    const unique=new Map();
    for(const r of successful)for(const p of r.value){
      if(!p?.id||!kindMatch(p,kind)&&!q)continue;
      const out=mapResult(p,kind,lat,lon);
      if(!out||out.distanceKm>radius/1000)continue;
      if(!unique.has(p.id)||!unique.get(p.id).photoRef&&out.photoRef)unique.set(p.id,out);
    }
    const entries=[...unique.values()].sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,40);
    res.json({ok:true,provider:'google_places',category:kind,entries,
      attributions:[{name:'Google Maps',url:'https://maps.google.com/'}],
      warning:successful.length===responses.length?null:'Partial Google Places results',
      message:entries.length?null:'No matching places found. Select another area or expand the search.'});
  }catch(e){
    console.error('Teyza discovery error',e);
    res.status(502).json({ok:false,error:'Nearby shops temporarily unavailable'});
  }
});
app.get(['/shopper-place-photo.php','/shopper-place-photo'],async(req,res)=>{
  const ref=photoResource(req.query.name||req.query.ref);
  if(!ref)return res.status(400).send('Invalid place photo');
  const w=num(req.query.w,64,1600)??720;
  try{
    const key=API_KEY.value();
    if(!key)return res.status(503).send('Photo service not configured');
    const url='https://places.googleapis.com/v1/'+ref+'/media?maxWidthPx='+w+
      '&skipHttpRedirect=true';
    const r=await fetch(url,{headers:{'X-Goog-Api-Key':key},
      signal:AbortSignal.timeout(10000)});
    if(!r.ok)return res.status(r.status===404?404:502).send('Google image unavailable');
    const data=await r.json(), photoUri=String(data.photoUri||'');
    if(!photoUri.startsWith('https://'))return res.status(502).send('Photo URL unavailable');
    res.set('Cache-Control','private, max-age=60');
    res.redirect(302,photoUri);
  }catch(e){
    console.error('Teyza photo failure',e);
    res.status(502).send('Photo temporarily unavailable');
  }
});
exports.teyzaPlaces=onRequest({
  region:'us-central1',memory:'256MiB',timeoutSeconds:45,
  secrets:[API_KEY]
},app);
