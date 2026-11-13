// Admin-only Teyza national coverage explorer. Maps use Google Maps so
// Google Places data is never placed on a non-Google basemap or bulk cached.
// Requires a browser-restricted Google Maps JavaScript API key supplied by an admin.
const PLACES='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover';
const CENTER={lat:-28.8,lng:24.6};
const KEY_STORAGE='teyza_admin_maps_browser_key_v1';
export function mapCentreCoordinates(map){
 const c=map?.getCenter?.();
 const lat=typeof c?.lat==='function'?c.lat():typeof c?.lat==='number'?c.lat:NaN;
 const lon=typeof c?.lng==='function'?c.lng():typeof c?.lng==='number'?c.lng:NaN;
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 if(lat < -35 || lat > -22 || lon < 16 || lon > 34)return null;
 return {lat,lon};
}
export function groupGooglePlaces(googleEntries,teyzaEntries){
 const linked=new Set(teyzaEntries.map(p=>p.googlePlaceId).filter(Boolean));
 const seen=new Set();
 return googleEntries.filter(p=>{
  if(!p?.placeId||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||
     seen.has(p.placeId)||linked.has(p.placeId))return false;
  seen.add(p.placeId);return true;
 });
}
export function createAdminMap({api,report}){
 let map=null,google=null,markers=[],registered=[],googleEntries=[],next=null,partial=false,started=false;
 const node=(tag,copy)=>{const n=document.createElement(tag);if(copy!==undefined)n.textContent=copy;return n;};
 const panel=node('section');panel.className='panel';
 const introduction=node('p','Map South African Teyza-registered shops and compare nearby Google-listed businesses. Google searches are local and do not constitute a national census.');
 const helpLink=node('a','Set up a Google Maps browser key in Google Cloud');
 helpLink.href='https://console.cloud.google.com/google/maps-apis/credentials?project=business-lift-3c19c';
 helpLink.target='_blank';helpLink.rel='noopener noreferrer';
 const guidance=node('p','A browser key needs Maps JavaScript API enabled, billing enabled and HTTP referrers allowing https://teyza.co.za/* and https://www.teyza.co.za/*. Never use your server-side Google Places key here.');
 const keyLabel=node('label','Google Maps browser key (restricted to teyza.co.za)');
 const key=node('input');key.type='password';key.autocomplete='off';key.placeholder='Browser-restricted Maps JavaScript key';keyLabel.append(key);
 const rememberLabel=node('label');
 const remember=node('input');remember.type='checkbox';remember.checked=false;
 rememberLabel.append(remember,node('span',' Remember restricted browser key on this device'));
 const forget=node('button','Forget saved browser key');forget.type='button';forget.className='button quiet';
 forget.onclick=()=>{try{localStorage.removeItem(KEY_STORAGE);}catch(_){}key.value='';remember.checked=false;status.textContent='Saved browser key cleared from this device.';};
 try{const saved=localStorage.getItem(KEY_STORAGE);if(saved && /^AIza[A-Za-z0-9_-]{30,80}$/.test(saved)){key.value=saved;remember.checked=true;}}catch(_){} 
 const start=node('button','Open coverage map');start.className='button primary';start.type='button';
 const status=node('p','Sign in and load the registered Teyza locations.');status.setAttribute('role','status');
 const mapBox=node('div');mapBox.style.cssText='height:min(68vh,620px);min-height:360px;border-radius:16px;border:1px solid #c8d7d2;overflow:hidden;background:#e6f0ed';mapBox.setAttribute('aria-label','Google Map showing Teyza and Google-listed shops');
 const controls=node('div');controls.style.cssText='display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:14px 0';
 const categoryLabel=node('label','Google search category');const category=node('select');
 for(const [value,title] of [['spaza','Spaza & local shops'],['variety','Other small businesses'],['wholesale','Wholesalers']]){
  const o=node('option',title);o.value=value;category.append(o);
 }categoryLabel.append(category);
 const search=node('button','Search Google near map centre');search.className='button quiet';search.type='button';search.disabled=true;
 const refresh=node('button','Refresh Teyza shops');refresh.className='button quiet';refresh.type='button';refresh.disabled=true;
 controls.append(categoryLabel,search,refresh);
 const summary=node('p','Teyza-only: 0 · Google + Teyza: 0 · Google-only nearby: 0');
 const results=node('div');results.setAttribute('aria-live','polite');
 panel.append(introduction,helpLink,guidance,keyLabel,rememberLabel,forget,start,status,controls,mapBox,summary,results);
 const clearMarkers=()=>{for(const m of markers)m.setMap(null);markers=[];};
 const valid=p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=-35&&p.latitude<=-22&&p.longitude>=16&&p.longitude<=34;
 function display(){if(!google||!map)return;
  clearMarkers();const nearby=groupGooglePlaces(googleEntries,registered);
  const all=[...registered.map(p=>({...p,label:p.source==='google_and_teyza'?'Google + Teyza':'Teyza only'})),
    ...nearby.map(p=>({...p,label:'Google only',name:p.name||'Google-listed shop'}))].filter(valid);
  const colors={'Teyza only':'#00796c','Google + Teyza':'#248b42','Google only':'#345fb4'};
  for(const p of all){const marker=new google.maps.Marker({map,position:{lat:p.latitude,lng:p.longitude},title:p.name+' · '+p.label,
    icon:{path:google.maps.SymbolPath.CIRCLE,scale:7,fillColor:colors[p.label],fillOpacity:0.93,strokeColor:'#ffffff',strokeWeight:1.7}});
    const info=new google.maps.InfoWindow();
    marker.addListener('click',()=>{
      const body=node('div');body.append(node('strong',p.name),node('p',p.label));
      if(p.city||p.area)body.append(node('p',[p.area,p.city].filter(Boolean).join(', ')));
      if(p.googlePlaceId||p.placeId){const a=node('a','View on Google Maps');a.target='_blank';a.rel='noopener noreferrer';a.href='https://www.google.com/maps/search/?api=1&query_place_id='+encodeURIComponent(p.googlePlaceId||p.placeId)+'&query='+encodeURIComponent(p.name);body.append(a);}
      info.setContent(body);info.open({map,anchor:marker});
    });markers.push(marker);
  }
  summary.textContent='Teyza-only: '+registered.filter(p=>p.source==='teyza_only').length+
    ' · Google + Teyza: '+registered.filter(p=>p.source==='google_and_teyza').length+
    ' · Google-only in latest local search: '+nearby.length+
    (partial?' · Registered records limited to first 1,500 pages/items loaded':'');
  results.replaceChildren();
  const help=node('p','Google-listed shops are from the current nearby search only; they may not be registered or verified by Teyza. No Google Places data is retained or exported. Google Maps attribution appears on the map.');
  results.append(help);
 }
 async function loadRegistered(){registered=[];next=null;partial=false;
  let attempts=0;do{
    const page=await api('ops_map_shops',next?{after:next}:{});
    if(!Array.isArray(page.shops))throw Error('Invalid Teyza shop map response.');
    registered.push(...page.shops.filter(valid));next=page.next;attempts++;
    status.textContent='Loaded '+registered.length+' verified mapped Teyza shops…';
  }while(next&&attempts<20);
  partial=Boolean(next);display();
  status.textContent='Showing '+registered.length+' verified mapped Teyza locations'+(partial?' (additional records exist; this is a partial view)':'')+'.';
 }
 function loadGoogle(keyValue){return new Promise((resolve,reject)=>{
  if(window.google?.maps?.Map){resolve(window.google);return;}
  const callback='teyzaMapLoaded_'+Math.random().toString(36).slice(2);
  const previousFailure=window.gm_authFailure;
  let settled=false;
  const script=node('script');
  const timer=setTimeout(()=>finish(Error('Google Maps did not initialize. Check Maps JavaScript API activation, browser-key referrers and billing in Google Cloud.')),16000);
  function finish(error){
    if(settled)return;settled=true;clearTimeout(timer);
    delete window[callback];
    if(error){window.gm_authFailure=previousFailure;script.remove();reject(error);}else resolve(window.google);
  }
  window.gm_authFailure=()=>{
    const error=Error('Google Maps rejected this browser key. Enable billing and Maps JavaScript API, and allow https://teyza.co.za/* as an HTTP referrer.');
    if(!settled){finish(error);return;}
    status.textContent=error.message;started=false;start.disabled=false;search.disabled=true;refresh.disabled=true;report?.(error);
  };
  window[callback]=()=>{
    if(!window.google?.maps?.Map)return finish(Error('Google Maps loaded without a usable Maps JavaScript API.'));
    finish(null);
  };
  script.async=true;script.onerror=()=>finish(Error('Could not load maps.googleapis.com. Check browser extensions, network access and Google Cloud key restrictions.'));
  script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(keyValue)+'&callback='+encodeURIComponent(callback)+'&v=weekly';
  document.head.append(script);
 });}
 start.onclick=async()=>{
  if(started)return;const value=key.value.trim();
  if(!/^AIza[A-Za-z0-9_-]{30,80}$/.test(value)){status.textContent='Enter the actual Google Maps browser API key (normally starts with AIza), not the API key name, project ID or Google Places server key.';return;}
  started=true;start.disabled=true;key.value='';
  try{google=await loadGoogle(value);map=new google.maps.Map(mapBox,{center:CENTER,zoom:5,mapTypeControl:false});
    if(remember.checked){try{localStorage.setItem(KEY_STORAGE,value);}catch(_){status.textContent='Map loaded, but this browser blocked saving the key.';}}
    else {try{localStorage.removeItem(KEY_STORAGE);}catch(_){}}
    search.disabled=false;refresh.disabled=false;await loadRegistered();
  }catch(e){started=false;start.disabled=false;status.textContent=e.message||'Unable to load map.';report?.(e);}
 };
 refresh.onclick=async()=>{refresh.disabled=true;try{await loadRegistered();}catch(e){status.textContent=e.message;report?.(e);}finally{refresh.disabled=false;}};
 search.onclick=async()=>{if(!map)return;search.disabled=true;status.textContent='Searching Google Places around map centre…';
  try{
    const centre=mapCentreCoordinates(map);
    if(!centre)throw Error('Google Maps has not supplied a valid South African map centre yet. Move the map slightly, then retry your local search.');
    const u=new URL(PLACES);
    u.searchParams.set('lat',String(centre.lat));u.searchParams.set('lon',String(centre.lon));
    u.searchParams.set('radius','20000');u.searchParams.set('category',category.value);
    const response=await fetch(u,{cache:'no-store'});if(!response.ok)throw Error('Google Places search unavailable');
    const data=await response.json();googleEntries=Array.isArray(data.entries)?data.entries:[];display();
    status.textContent='Google results for this area: '+googleEntries.length+' (limited provider sample; not exhaustive).';
  }catch(e){status.textContent=e.message||'Google search failed.';report?.(e);}finally{search.disabled=false;}};
 return {panel,clear(){clearMarkers();registered=[];googleEntries=[];next=null;partial=false;map=null;google=null;started=false;start.disabled=false;search.disabled=true;refresh.disabled=true;status.textContent='Start a new administrator map session.';}};
}
