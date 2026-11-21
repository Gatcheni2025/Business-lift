// Google Maps is the only basemap on which Google Places results may appear.
// Results remain ephemeral, scoped to one searched area, and are never exported.
const ENDPOINT='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover';
const CONFIG='/assets/teyza-maps-config.json';
const SA={lat:-28.8,lng:24.6};
const good=p=>Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude)&&p.latitude>=-35&&p.latitude<=-22&&p.longitude>=16&&p.longitude<=34;
const elt=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e;};
export function matchGoogle(places,registered){
 const ids=new Set(registered.map(p=>p.googlePlaceId).filter(Boolean));
 const seen=new Set();return places.filter(p=>{if(!good(p)||!p.placeId||seen.has(p.placeId))return false;seen.add(p.placeId);return true;})
 .reduce((group,p)=>{(ids.has(p.placeId)?group.linked:group.potential).push(p);return group;},{linked:[],potential:[]});
}
export function unmatchedGoogle(places,registered){
 const ids=new Set(registered.map(p=>p.googlePlaceId).filter(Boolean)),seen=new Set();
 return places.filter(p=>{if(!good(p)||!p.placeId||ids.has(p.placeId)||seen.has(p.placeId))return false;seen.add(p.placeId);return true;});
}
export function createCombinedCoverage({report,onReady,onDiscovery}={}){
 let google=null,map=null,markers=[],registered=[],places=[],shown=false,active=false,searchCompleted=false;
 const panel=elt('section');panel.className='tp-combined';
 const title=elt('h3','Google Places · shop registration opportunities');
 const note=elt('p','Choose a town or move the map, then search Google Places for potential Teyza registrations. Google-only means no matching published Teyza Place ID, not confirmed unregistered. Searches are local, not a national census.');
 const controls=elt('div');controls.className='tp-combined-controls';

 const town=elt('input');town.type='search';town.placeholder='Town or municipality (e.g. eThekwini)';town.setAttribute('aria-label','Town or municipality');
 const province=elt('select');province.setAttribute('aria-label','Province');
 for(const p of ['All provinces','Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape']){const o=elt('option',p);o.value=p;province.append(o);}
 const category=elt('select');category.setAttribute('aria-label','Google business type');
 for(const [id,t] of [['spaza','Spaza and local shops'],['variety','Other businesses (salons, services, retail)'],['wholesale','Wholesalers'],['all','All three categories (3 searches)']]){const o=elt('option',t);o.value=id;category.append(o);}
 const start=elt('button','Retry Google map');start.type='button';start.className='button primary';
 const search=elt('button','Find shops needing Teyza registration');search.type='button';search.className='button quiet';search.disabled=true;
 const showT=elt('input');showT.type='checkbox';showT.checked=true;
 const showG=elt('input');showG.type='checkbox';showG.checked=true;
 const count=elt('div');count.className='tp-discovery-counts';count.setAttribute('aria-live','polite');
 const attribution=elt('p','Business information © Google Maps; search results are shown only on this Google map and are not saved as a business directory.');attribution.className='tp-google-credit';
 const toggle=(input,label)=>{const item=elt('label');item.append(input,elt('span',' '+label));return item;};
 const status=elt('p','Loading the national shop map and checking Google Maps configuration…');status.setAttribute('role','status');
 const canvas=elt('div');canvas.className='tp-combined-map';canvas.style.cssText='display:none;height:480px;min-height:340px;border-radius:15px;overflow:hidden;margin-top:12px';
 const list=elt('div');list.className='tp-combined-results';
 controls.append(town,province,category,search,toggle(showT,'Teyza registered'),toggle(showG,'Google only'));
 panel.append(title,note,controls,status,count,canvas,attribution,list);

 const human=v=>v===true?'Yes':v===false?'No':'Not provided';
 const info=p=>{
  const body=elt('div');body.append(elt('strong',p.name||'Shop'));
  const rows=[
   ['Source',p._googleOnly?'Google listing only':p.googlePlaceId?'Google + Teyza':'Teyza registered'],
   ['Address',[p.address,p.area,p.city,p.province].filter(Boolean).join(', ')||'Map location'],
   ['Registered on Teyza',p._googleOnly?'No matching published Teyza record': 'Yes'],
   ['Teyza verified',p._googleOnly?'Not established':human(p.verified)],
   ['WhatsApp opted in',p._googleOnly?'Unknown':human(p.whatsappOptIn)],
   ['Registering agent',p._googleOnly?'Not applicable':p.agentName||'Not attributed']
  ];
  for(const [label,value] of rows){const line=elt('p');line.append(elt('strong',label+': '),document.createTextNode(String(value)));body.append(line);}
  if(p.placeId||p.googlePlaceId){const a=elt('a','Open on Google Maps');a.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.name||'Shop')+'&query_place_id='+encodeURIComponent(p.placeId||p.googlePlaceId);a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
  return body;
 };
 const clearMarkers=()=>{for(const m of markers)m.setMap(null);markers=[];};
 const placesById=new Map();
 const boundsFor=(p)=>({lat:p.latitude,lng:p.longitude});
 function render(){
  const groups=matchGoogle(places,registered),listed=groups.potential;
  onDiscovery?.({state:searchCompleted?'ready':'not-searched',total:places.length,potential:listed.length,matched:groups.linked.length});
  count.replaceChildren();
  count.append(elt('strong',registered.length+' Teyza mapped · '+(searchCompleted?groups.linked.length+' Google listings matched · '+listed.length+' potential onboarding leads':'Google Places search not completed')));
  list.replaceChildren();
  const hint=elt('p',places.length?'Potential leads are Google-listed businesses without a matching published Teyza Place ID. Verify the shop and owner before contacting or assigning an agent.':'Search a town or the current Google map area to see Google-listed shops and businesses.');
  list.append(hint);
  if(!map||!google)return;
  clearMarkers();placesById.clear();
  const records=[
   ...(showT.checked?registered.filter(good).map(p=>({...p,_googleOnly:false})):[]),
   ...(showG.checked?listed.map(p=>({...p,_googleOnly:true})):[])
  ];
  for(const p of records){
   const marker=new google.maps.Marker({map,position:boundsFor(p),title:(p.name||'Shop')+(p._googleOnly?' · Potential Teyza registration':' · Registered on Teyza'),
    icon:{path:google.maps.SymbolPath.CIRCLE,scale:7,fillColor:p._googleOnly?'#2b65ca':p.verified===true?'#09945a':'#e1a42e',fillOpacity:.95,strokeColor:'#ffffff',strokeWeight:1.8}});
   const popup=new google.maps.InfoWindow({content:info(p)});
   marker.addListener('click',()=>popup.open({map,anchor:marker}));markers.push(marker);
   if(p._googleOnly)placesById.set(p.placeId,{marker,popup});
  }
  for(const p of listed.slice(0,100)){
   const row=elt('button');row.type='button';row.className='tp-discovery-result';
   row.append(elt('strong',p.name||'Google-listed business'));
   row.append(elt('span',p.address||p.area||'Location on map'));
   row.append(elt('small','Google Places · '+(p.shopCategory==='spaza'?'Spaza / local shop':p.shopCategory==='wholesale'?'Wholesaler':'Other business')+' · No matching published Teyza listing'));
   row.onclick=()=>{map.panTo(boundsFor(p));map.setZoom(Math.max(map.getZoom(),14));const m=placesById.get(p.placeId);m?.popup.open({map,anchor:m.marker});};
   list.append(row);
  }
 }
 function loadMap(apiKey){return new Promise((resolve,reject)=>{
  if(window.google?.maps?.Map){resolve(window.google);return;}
  const cb='teyzaCombined_'+Math.random().toString(36).slice(2);let finished=false;
  const script=elt('script');const previous=window.gm_authFailure;
  const timeout=setTimeout(()=>finish(Error('Google Maps initialization timed out. Check billing, Maps JavaScript API and approved HTTP referrers.')),18000);
  function finish(err){if(finished)return;finished=true;clearTimeout(timeout);delete window[cb];if(err){window.gm_authFailure=previous;script.remove();reject(err);}else resolve(window.google);}
  window.gm_authFailure=()=>finish(Error('Browser key rejected. Allow https://teyza.co.za/* and https://www.teyza.co.za/*; enable Maps JavaScript API and billing.'));
  window[cb]=()=>window.google?.maps?.Map?finish():finish(Error('Google Maps did not provide the map API.'));
  script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(apiKey)+'&callback='+encodeURIComponent(cb)+'&v=weekly';
  script.async=true;script.onerror=()=>finish(Error('Cannot load Google Maps script.'));document.head.append(script);
 });}
 async function startMap(){
  if(active)return;
  active=true;start.disabled=true;status.textContent='Loading configured Google map…';
  try{
   const response=await fetch(CONFIG,{cache:'no-store'});
   if(!response.ok)throw Error('Google Maps is not configured for this site yet. The national Teyza map remains available.');
   const configuration=await response.json();
   const value=configuration?.browserKey;
   if(typeof value!=='string'||!/^AIza[A-Za-z0-9_-]{30,80}$/.test(value))
    throw Error('Google Maps browser configuration is invalid. The national Teyza map remains available.');
   google=await loadMap(value);
   canvas.style.display='block';
   map=new google.maps.Map(canvas,{center:SA,zoom:5,mapTypeControl:false});
   shown=true;search.disabled=false;
   status.textContent='Google map ready. Select a province or town and search locally for additional Google-listed businesses.';
   onReady?.();render();
   // One bounded, non-recurring discovery sample gives operators live evidence
   // rather than an empty map. No national background crawling is performed.
   town.value='Durban';province.value='KwaZulu-Natal';category.value='spaza';
   map.setCenter({lat:-29.8587,lng:31.0218});map.setZoom(11);
   void searchArea(true);
  }catch(e){
   active=false;start.disabled=false;
   if(!start.isConnected)controls.prepend(start);
   status.textContent=e.message||'Google Maps unavailable; the national Teyza map remains available.';
   if(!String(e.message||'').includes('not configured for this site'))report?.(e);
  }
 }
 start.onclick=startMap;
 async function locate(){
  const q=town.value.trim(),p=province.value;
  if(!q&&p==='All provinces')return;
  const address=[q,p==='All provinces'?'':p,'South Africa'].filter(Boolean).join(', ');
  const geocoder=new google.maps.Geocoder();
  const matches=await new Promise((resolve,reject)=>geocoder.geocode({address,componentRestrictions:{country:'ZA'}},(results,code)=>code==='OK'&&results?.length?resolve(results):reject(Error('Could not locate that South African town/municipality.'))));
  const point=matches[0].geometry.location;map.setCenter(point);map.setZoom(q?11:7);
 }
 async function searchArea(skipGeocode=false){
  if(!map)return;
  search.disabled=true;status.textContent='Searching Google Places around the selected map area…';
  onDiscovery?.({state:'loading',total:0,potential:0,matched:0});
  try{
   if(!skipGeocode)await locate();const c=map.getCenter(),lat=c.lat(),lon=c.lng();
   if(lat < -35||lat > -22||lon < 16||lon > 34)throw Error('Map centre is outside the supported South African bounds.');
   if(!town.value.trim()&&province.value==='All provinces'&&Math.abs(lat-SA.lat)<0.02&&Math.abs(lon-SA.lng)<0.02)
    throw Error('Enter a town (such as Durban) or move the map to a populated area before searching.');
   // Each click is an explicit, bounded regional search. The existing Firebase
   // Places service holds the server key; this browser never accesses it.
   const kinds=category.value==='all'?['spaza','variety','wholesale']:[category.value];
   const searches=await Promise.allSettled(kinds.map(async kind=>{
    const url=new URL(ENDPOINT);
    url.searchParams.set('lat',String(lat));url.searchParams.set('lon',String(lon));
    url.searchParams.set('radius','20000');url.searchParams.set('category',kind);
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok){let detail='';try{const body=await res.json();detail=String(body.error||'').slice(0,120);}catch(_){}
     throw Error(kind+' discovery HTTP '+res.status+(detail?' ('+detail+')':''));}
    const data=await res.json();
    if(!Array.isArray(data.entries))throw Error(kind+' discovery returned no entries array');
    return {entries:data.entries.filter(good),warning:data.warning};
   }));
   const successful=searches.filter(r=>r.status==='fulfilled');
   if(!successful.length)throw Error(searches.map(r=>r.reason?.message||'Discovery unavailable').join('; '));
   const unique=new Map();
   for(const item of successful)for(const p of item.value.entries)if(p.placeId&&!unique.has(p.placeId))unique.set(p.placeId,p);
   places=[...unique.values()];searchCompleted=true;render();
   const counts=matchGoogle(places,registered);
   const incomplete=successful.length<kinds.length||successful.some(r=>r.value.warning);
   status.textContent='Google Places returned '+places.length+' nearby listings: '+counts.potential.length+' potential leads, '+counts.linked.length+' matched to Teyza.'+
    (incomplete?' Some searches were incomplete.':'')+' Results are local and may not be exhaustive.';
  }catch(e){status.textContent='Google discovery failed: '+e.message;
   onDiscovery?.({state:'error',message:e.message,total:0,potential:0,matched:0});report?.(e);}
  finally{search.disabled=false;}
 }
 search.onclick=()=>searchArea();
 showT.onchange=render;showG.onchange=render;
 return {panel,activate:()=>startMap(),setShops(items){registered=Array.isArray(items)?items.filter(good):[];if(shown)render();},clear(){clearMarkers();registered=[];places=[];searchCompleted=false;onDiscovery?.({state:'not-searched',total:0,potential:0,matched:0});if(map){for(const m of markers)m.setMap(null);}map=null;google=null;shown=false;active=false;canvas.style.display='none';start.disabled=false;search.disabled=true;list.replaceChildren();canvas.replaceChildren();if(start.isConnected)start.remove();}};
}
