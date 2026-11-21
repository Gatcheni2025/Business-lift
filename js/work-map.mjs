// Browser-only field map. The Maps JS key must be HTTP-referrer restricted and supplied by the website deployment.
export function createFieldMap({onError=()=>{}}={}){
 const root=document.createElement('section');root.className='field-map-shell';root.setAttribute('aria-label','Map of nearby registered and Google-listed shops');
 const heading=document.createElement('div');heading.className='field-map-heading';
 const title=document.createElement('h3');title.textContent='Nearby shop coverage map';
 const note=document.createElement('p');note.textContent='Green: Teyza registered · Blue: Google-listed · Purple: field lead. Google data covers the searched area only.';
 heading.append(title,note);
 const canvas=document.createElement('div');canvas.className='field-map-canvas';
 const status=document.createElement('p');status.className='field-map-status';status.setAttribute('role','status');status.textContent='Choose your location or search an address to view nearby shops.';
 root.append(heading,canvas,status);
 let map=null,markers=[],googlePromise=null;
 const key=()=>{let remembered='';try{remembered=localStorage.getItem('teyza_admin_maps_browser_key_v1')||'';}catch(_){}
  return String(window.TEYZA_BROWSER_MAPS_KEY||document.querySelector('meta[name="teyza-browser-map-key"]')?.content||remembered).trim();};
 function loadMaps(){
  if(window.google?.maps?.Map)return Promise.resolve(window.google.maps);
  if(googlePromise)return googlePromise;
  const token=key();
  if(!/^AIza[A-Za-z0-9_-]{30,80}$/.test(token))return Promise.reject(Error('Map preview needs the website-restricted Maps JavaScript API key configured by Teyza. Shop lists and registration tools remain available.'));
  googlePromise=new Promise((resolve,reject)=>{
   const cb='teyzaFieldMaps_'+Math.random().toString(36).slice(2),script=document.createElement('script');
   let settled=false;const timeout=setTimeout(()=>finish(Error('Google Maps did not load. Check website key permissions and referrers.')),16000);
   function finish(err){if(settled)return;settled=true;clearTimeout(timeout);delete window[cb];if(err){script.remove();googlePromise=null;reject(err);}else resolve(window.google.maps);}
   window[cb]=()=>window.google?.maps?.Map?finish(null):finish(Error('Maps JavaScript API unavailable.'));
   script.async=true;script.onerror=()=>finish(Error('Could not load Google Maps.'));script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(token)+'&callback='+encodeURIComponent(cb)+'&v=weekly';document.head.append(script);
  });return googlePromise;
 }
 function clear(){for(const marker of markers)marker.setMap(null);markers=[];}
 async function show(point,data){
  if(!point||!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude))return;
  try{
   const maps=await loadMaps();if(!root.isConnected)return;
   if(!map)map=new maps.Map(canvas,{center:{lat:point.latitude,lng:point.longitude},zoom:13,mapTypeControl:false,streetViewControl:false});
   else map.setCenter({lat:point.latitude,lng:point.longitude});
   clear();const registered=Array.isArray(data?.registered)?data.registered:[];
   const google=Array.isArray(data?.google)?data.google:[];
   const leads=Array.isArray(data?.leads)?data.leads:[];
   const linked=new Set(registered.map(x=>x.googlePlaceId).filter(Boolean));
   const seen=new Set();
   const all=[...registered.map(x=>({x,kind:'Registered on Teyza',color:'#07895f'})),
    ...google.filter(x=>{const id=x.placeId||x.googlePlaceId;if(id&& (linked.has(id)||seen.has(id)))return false;if(id)seen.add(id);return true;}).map(x=>({x,kind:'Google-listed · verify Teyza status',color:'#286ad6'})),
    ...leads.map(x=>({x,kind:'Field lead · unverified',color:'#8c43db'}))];
   const info=new maps.InfoWindow();for(const {x,kind,color} of all){
    if(!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude))continue;
    const marker=new maps.Marker({map,position:{lat:x.latitude,lng:x.longitude},title:(x.name||'Shop')+' · '+kind,icon:{path:maps.SymbolPath.CIRCLE,scale:8,fillColor:color,fillOpacity:.95,strokeColor:'#fff',strokeWeight:2}});
    marker.addListener('click',()=>{const wrap=document.createElement('div'),name=document.createElement('strong'),kindText=document.createElement('p'),directions=document.createElement('a');
     name.textContent=x.name||'Shop';kindText.textContent=kind+' · '+(x.address||'Address not verified');
     directions.textContent='Directions in Google Maps';directions.target='_blank';directions.rel='noopener noreferrer';directions.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(x.latitude+','+x.longitude);
     wrap.append(name,kindText,directions);info.setContent(wrap);info.open({map,anchor:marker});});markers.push(marker);
   }
   status.textContent='Showing '+markers.length+' nearby map markers. Teyza: '+registered.length+' · Google: '+google.length+' · Team leads: '+leads.length+'.';
  }catch(err){status.textContent=err.message||'Map unavailable';onError(err);}
 }
 return {root,show,clear(){clear();status.textContent='Search a location to view nearby shops.';}};
}
