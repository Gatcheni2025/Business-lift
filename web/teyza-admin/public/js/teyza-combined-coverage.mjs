// Google Maps is the only basemap on which Google Places results may appear.
// Results remain ephemeral, scoped to one searched area, and are never exported.
const ENDPOINT='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover';
const KEY_STORAGE='teyza_admin_maps_browser_key_v1';
const SA={lat:-28.8,lng:24.6};
const good=p=>Number.isFinite(p?.latitude)&&Number.isFinite(p?.longitude)&&p.latitude>=-35&&p.latitude<=-22&&p.longitude>=16&&p.longitude<=34;
const elt=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e;};
export function unmatchedGoogle(places,registered){
 const ids=new Set(registered.map(p=>p.googlePlaceId).filter(Boolean)),seen=new Set();
 return places.filter(p=>{if(!good(p)||!p.placeId||ids.has(p.placeId)||seen.has(p.placeId))return false;seen.add(p.placeId);return true;});
}
export function createCombinedCoverage({report}={}){
 let google=null,map=null,markers=[],registered=[],places=[],shown=false,active=false;
 const panel=elt('section');panel.className='tp-combined';
 const title=elt('h3','Combined Google + Teyza map');
 const note=elt('p','Google businesses are discovered within one area at a time. This is not a national Google directory; WhatsApp consent and Teyza verification must come from Teyza records.');
 const controls=elt('div');controls.className='tp-combined-controls';
 const key=elt('input');key.type='password';key.autocomplete='off';key.placeholder='Restricted Google Maps browser key';key.setAttribute('aria-label','Google Maps browser key');key.style.minWidth='220px';
 const town=elt('input');town.type='search';town.placeholder='Town or municipality (e.g. eThekwini)';town.setAttribute('aria-label','Town or municipality');
 const province=elt('select');province.setAttribute('aria-label','Province');
 for(const p of ['All provinces','Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape']){const o=elt('option',p);o.value=p;province.append(o);}
 const category=elt('select');category.setAttribute('aria-label','Google business type');
 for(const [id,t] of [['spaza','Spaza and local shops'],['variety','Other small businesses'],['wholesale','Wholesalers']]){const o=elt('option',t);o.value=id;category.append(o);}
 const start=elt('button','Open combined Google map');start.type='button';start.className='button primary';
 const search=elt('button','Search this area on Google');search.type='button';search.className='button quiet';search.disabled=true;
 const showT=elt('input');showT.type='checkbox';showT.checked=true;
 const showG=elt('input');showG.type='checkbox';showG.checked=true;
 const toggle=(input,label)=>{const item=elt('label');item.append(input,elt('span',' '+label));return item;};
 const status=elt('p','Choose the Google map to begin. Registered Teyza shops remain visible on the national outline until then.');status.setAttribute('role','status');
 const canvas=elt('div');canvas.className='tp-combined-map';canvas.style.cssText='height:480px;min-height:340px;border-radius:15px;overflow:hidden;margin-top:12px';
 const list=elt('div');list.className='tp-combined-results';
 controls.append(key,town,province,category,start,search,toggle(showT,'Teyza registered'),toggle(showG,'Google only'));
 panel.append(title,note,controls,status,canvas,list);
 try{const remembered=localStorage.getItem(KEY_STORAGE);if(/^AIza[A-Za-z0-9_-]{30,80}$/.test(remembered||''))key.value=remembered;}catch(_){}
 const human=v=>v===true?'Yes':v===false?'No':'Not provided';
 const info=p=>{
  const body=elt('div');body.append(elt('strong',p.name||'Shop'));
  const rows=[
   ['Source',p._googleOnly?'Google listing only':p.googlePlaceId?'Google + Teyza':'Teyza registered'],
   ['Address',[p.address,p.area,p.city,p.province].filter(Boolean).join(', ')||'Map location'],
   ['Registered on Teyza',p._googleOnly?'No matching Teyza record': 'Yes'],
   ['Teyza verified',p._googleOnly?'Not verified by Teyza':human(p.verified)],
   ['WhatsApp opted in',p._googleOnly?'Unknown':human(p.whatsappOptIn)],
   ['Registering agent',p._googleOnly?'Not applicable':p.agentName||'Not attributed']
  ];
  for(const [label,value] of rows){const line=elt('p');line.append(elt('strong',label+': '),document.createTextNode(String(value)));body.append(line);}
  if(p.placeId||p.googlePlaceId){const a=elt('a','Open on Google Maps');a.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.name||'Shop')+'&query_place_id='+encodeURIComponent(p.placeId||p.googlePlaceId);a.target='_blank';a.rel='noopener noreferrer';body.append(a);}
  return body;
 };
 const clearMarkers=()=>{for(const m of markers)m.setMap(null);markers=[];};
 function render(){
  if(!map||!google)return;
  clearMarkers();const listed=unmatchedGoogle(places,registered);
  const items=[...(showT.checked?registered.filter(good):[]),...(showG.checked?listed.map(p=>({...p,_googleOnly:true})):[])];
  for(const p of items){
   const marker=new google.maps.Marker({map,position:{lat:p.latitude,lng:p.longitude},title:p.name||'Shop',
    icon:{path:google.maps.SymbolPath.CIRCLE,scale:7,fillColor:p._googleOnly?'#2b65ca':p.verified===true?'#09945a':'#e1a42e',fillOpacity:.95,strokeColor:'#ffffff',strokeWeight:1.8}});
   const popup=new google.maps.InfoWindow({content:info(p)});
   marker.addListener('click',()=>popup.open({map,anchor:marker}));markers.push(marker);
  }
  list.replaceChildren();list.append(elt('p',registered.length+' Teyza locations loaded · '+listed.length+' Google-only businesses in the latest local search. Google results are not nationwide.'));
  for(const p of listed.slice(0,15)){const b=elt('button',p.name||'Google-listed shop');b.type='button';b.className='tp-text-button';b.onclick=()=>{map.panTo({lat:p.latitude,lng:p.longitude});map.setZoom(15);};list.append(b);}
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
 start.onclick=async()=>{
  if(active)return;
  const value=key.value.trim();if(!/^AIza[A-Za-z0-9_-]{30,80}$/.test(value)){status.textContent='Enter a browser-restricted Maps JavaScript key. The server-side Places key must not be used.';return;}
  active=true;start.disabled=true;status.textContent='Loading Google map…';
  try{google=await loadMap(value);map=new google.maps.Map(canvas,{center:SA,zoom:5,mapTypeControl:false});
   shown=true;search.disabled=false;key.value='';status.textContent='Combined map ready. Select a town or move the map, then search Google locally.';render();
  }catch(e){active=false;start.disabled=false;status.textContent=e.message;report?.(e);}
 };
 async function locate(){
  const q=town.value.trim(),p=province.value;
  if(!q&&p==='All provinces')return;
  const address=[q,p==='All provinces'?'':p,'South Africa'].filter(Boolean).join(', ');
  const geocoder=new google.maps.Geocoder();
  const matches=await new Promise((resolve,reject)=>geocoder.geocode({address,componentRestrictions:{country:'ZA'}},(results,code)=>code==='OK'&&results?.length?resolve(results):reject(Error('Could not locate that South African town/municipality.'))));
  const point=matches[0].geometry.location;map.setCenter(point);map.setZoom(q?11:7);
 }
 search.onclick=async()=>{
  if(!map)return;search.disabled=true;status.textContent='Looking up Google-listed businesses in this map area…';
  try{
   await locate();const c=map.getCenter(),lat=c.lat(),lon=c.lng();
   if(lat < -35||lat > -22||lon < 16||lon > 34)throw Error('Map centre is outside the supported South African bounds.');
   const url=new URL(ENDPOINT);url.searchParams.set('lat',String(lat));url.searchParams.set('lon',String(lon));url.searchParams.set('radius','20000');url.searchParams.set('category',category.value);
   const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw Error('Google business discovery is unavailable (HTTP '+res.status+').');
   const data=await res.json();places=Array.isArray(data.entries)?data.entries.filter(good):[];
   render();status.textContent='Found '+places.length+' Google listings in this local search; duplicates linked by Google Place ID are excluded.';
  }catch(e){status.textContent=e.message;report?.(e);}finally{search.disabled=false;}
 };
 showT.onchange=render;showG.onchange=render;
 return {panel,setShops(items){registered=Array.isArray(items)?items.filter(good):[];if(shown)render();},clear(){clearMarkers();registered=[];places=[];if(map){for(const m of markers)m.setMap(null);}map=null;google=null;shown=false;active=false;start.disabled=false;search.disabled=true;list.replaceChildren();canvas.replaceChildren();}};
}
