'use strict';
// Audit-only, deliberately bounded, no credentials, no retries, no redirects,
// no listing/phone export. Native fetch is injected by the caller.
const ROOT='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces';
const discovery=ROOT+'/shopper-discover',contact=ROOT+'/shopper-place-contact.php';
const area={lat:-29.7416,lon:30.9902,radius:5000,category:'spaza'};
const idPattern=/^[A-Za-z0-9_-]{10,200}$/;
function createLivePlacesGate({fetchImpl,log=()=>{}}){
 if(typeof fetchImpl!=='function')throw Error('Live request adapter required.');
 const ids=new Set(),checked=new Set();
 let searches=0,details=0,returned=0,discoveryOk=false,partial=false,detailOk=0,withPhone=0,withoutPhone=0;
 const snapshot=()=>({searchAttempts:searches,searchSucceeded:discoveryOk,returnedListings:returned,partialResults:partial,contactAttempts:details,contactSucceeded:detailOk,listedPhone:withPhone,noListedPhone:withoutPhone});
 const deny=message=>({status:403,json:{ok:false,error:message}});
 async function get(url,method){
  if(method!=='GET')return deny('Read-only Places acceptance: GET only.');
  let u;try{u=new URL(url);}catch{return deny('Invalid request.');}
  const base=u.origin+u.pathname;
  if(u.username||u.password||u.hash)return deny('Unexpected request.');
  let endpoint,kind;
  if(base===discovery){
   if(u.searchParams.size!==4||Object.entries(area).some(([k,v])=>u.searchParams.getAll(k).length!==1||u.searchParams.get(k)!==String(v)))return deny('This trial allows only KwaMashu, KwaZulu-Natal, Spaza and local shops (5 km).');
   if(searches>=1)return deny('The one-search trial allowance has been used. No automatic retry.');
   searches++;kind='discovery';endpoint=new URL(discovery);for(const [k,v] of Object.entries(area))endpoint.searchParams.set(k,String(v));
  }else if(base===contact){
   const id=u.searchParams.get('placeId');
   if(u.searchParams.size!==1||!idPattern.test(id||'')||!ids.has(id))return deny('Choose a listing from the successful trial search.');
   if(details>=2||checked.has(id))return deny('Two deliberate contact checks maximum; each listing only once.');
   details++;checked.add(id);kind='contact';endpoint=new URL(contact);endpoint.searchParams.set('placeId',id);
  }else return deny('External endpoint blocked.');
  try{
   const response=await fetchImpl(endpoint.href,{method:'GET',headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(kind==='discovery'?48000:13000)});
   if(!response.ok){log(kind+' HTTP '+response.status+'; allowance consumed.');return {status:502,json:{ok:false,error:'Places endpoint returned HTTP '+response.status+'. No automatic retry.'}};}
   const data=await response.json();
   if(kind==='discovery'){
    if(data?.ok!==true||data.provider!=='google_places'||data.version!=='3.6'||data.category!=='spaza'||!Array.isArray(data.entries)||data.entries.length>100||data.returned!==data.entries.length||data.entries.some(p=>!idPattern.test(p?.placeId||'')))throw Error('Unexpected discovery response');
    for(const p of data.entries)ids.add(p.placeId);
    discoveryOk=true;returned=data.entries.length;partial=!!data.warning;
   }else{
    if(data?.ok!==true||typeof data.phone!=='string'||typeof data.websiteUrl!=='string')throw Error('Unexpected contact response');
    detailOk++;if(data.phone.trim())withPhone++;else withoutPhone++;
   }
   log(JSON.stringify(snapshot()));
   return {status:200,json:data};
  }catch{
   log(kind+' failed; allowance consumed; no retry.');
   return {status:502,json:{ok:false,error:'Live Places check unavailable or response format changed. No automatic retry.'}};
  }
 }
 return {get,snapshot};
}
module.exports={createLivePlacesGate,discovery,contact,area};
