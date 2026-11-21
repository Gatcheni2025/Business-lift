import {createCombinedCoverage} from './teyza-combined-coverage.mjs';
// Teyza-owned national shop coverage. No Google Places data appears here:
// the basemap is a self-hosted vector outline, and independently registered Teyza shops
// returned by the authenticated ops_map_shops endpoint are plotted.
const SA={center:[-28.9,24.5],zoom:5};
const valid=p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&
 p.latitude>=-35&&p.latitude<=-22&&p.longitude>=16&&p.longitude<=34;
const node=(tag,copy,cls)=>{const n=document.createElement(tag);if(copy!==undefined)n.textContent=copy;if(cls)n.className=cls;return n;};
let leafletPromise;
function loadLeaflet(){
 if(window.L?.map)return Promise.resolve(window.L);
 if(leafletPromise)return leafletPromise;
 leafletPromise=new Promise((resolve,reject)=>{
  const css=document.createElement('link');css.rel='stylesheet';
  css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  css.integrity='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  css.crossOrigin='anonymous';document.head.append(css);
  const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  js.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  js.crossOrigin='anonymous';js.async=true;js.onload=()=>window.L?.map?resolve(window.L):reject(Error('The map library was not available.'));
  js.onerror=()=>reject(Error('Map tiles could not initialize. Check access to unpkg.com and OpenStreetMap.'));
  document.head.append(js);
 }).catch(e=>{leafletPromise=null;throw e;});
 return leafletPromise;
}
const provinces=['All provinces','Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'];
export function createPremiumCoverage({api,report,openAgents,openShops,openGoogle}){
 let generation=0,map=null,leaflet=null,markers=[],shops=[],next=null,partial=false,ready=false;
 const panel=node('div',undefined,'teyza-premium');
 const cards=node('div',undefined,'tp-cards');
 function metric(title,subtitle,accent){
  const c=node('article',undefined,'tp-card '+accent),head=node('div',undefined,'tp-card-head');
  const icon=node('span',accent==='tp-green'?'▣':accent==='tp-amber'?'G':accent==='tp-blue'?'♙':'♜','tp-card-icon');
  head.append(icon,node('span',title));const value=node('strong','—','tp-card-value');
  c.append(head,value,node('small',subtitle));cards.append(c);return value;
 }
 const teyzaCount=metric('Registered on Teyza','Verified published locations loaded','tp-green');
 const googleCount=metric('Google listings only','Use Google explorer for live area searches','tp-amber');
 const agentCount=metric('Agent registrations','Only explicitly attributed registrations count','tp-blue');
 const leaders=node('button',undefined,'tp-card tp-leading');
 leaders.type='button';leaders.append(node('span','♜  Leading agents'),node('strong','View field team →'),node('small','Open verified agent records'));
 leaders.onclick=openAgents;cards.append(leaders);
 const main=node('div',undefined,'tp-main');
 const coverage=node('section',undefined,'tp-map-card');
 const heading=node('div',undefined,'tp-heading');
 const title=node('div');title.append(node('h2','National shop coverage'),node('p','South Africa · verified Teyza shops and local business discovery'));
 const expand=node('button','⛶','tp-expand');expand.type='button';expand.title='Expand map';expand.onclick=()=>coverage.classList.toggle('tp-expanded');
 heading.append(title,expand);
 const filters=node('div',undefined,'tp-filters');
 function select(label,values){const l=node('label');l.append(node('span',label));const s=node('select');for(const v of values){const o=node('option',v);o.value=v;s.append(o);}l.append(s);filters.append(l);return s;}
 const province=select('Province',provinces);
 const category=select('Category',['All shop categories','Spaza shops','Retail businesses','Wholesalers']);
 const termLabel=node('label');termLabel.append(node('span','Find a shop or town'));const term=node('input');term.type='search';term.placeholder='Search loaded shops';term.autocomplete='off';term.name='teyza_shop_location_lookup';term.setAttribute('data-lpignore','true');termLabel.append(term);filters.append(termLabel);
 const reset=node('button','Reset filters','tp-reset');reset.type='button';filters.append(reset);
 const combined=createCombinedCoverage({report});
 const mapShell=node('div',undefined,'tp-map-shell');
 const mapCanvas=node('div',undefined,'tp-map-canvas');mapCanvas.setAttribute('aria-label','Map of registered Teyza shops in South Africa');
 const legend=node('div',undefined,'tp-legend');
 legend.append(node('strong','Shop status · map'),node('p','🟢  Verified on Teyza'),node('p','🟡  Attribution pending'),node('p','🔵  Google-only: separate Google map'),node('small','The national layer contains Teyza data only; Google results need a Google map.'));
 mapShell.append(mapCanvas,legend);
 const status=node('p','Preparing national coverage…','tp-status');status.setAttribute('role','status');
 const fallback=node('details');const fallbackHeading=node('summary','Teyza-only national outline (works without Google Maps)');fallback.append(fallbackHeading,mapShell,status);
 coverage.append(heading,filters,combined.panel,fallback);
 const aside=node('aside',undefined,'tp-side');
 const agents=node('section',undefined,'tp-side-card');agents.append(node('h3','♙  Registered by agents'),node('p','Only named agents supplied by verified shop records are counted. Missing attribution is not guessed.','tp-muted'));
 const agentList=node('div',undefined,'tp-shop-list');agents.append(agentList);
 const agentsButton=node('button','View agent records →','tp-text-button');agentsButton.type='button';agentsButton.onclick=openAgents;agents.append(agentsButton);
 const recent=node('section',undefined,'tp-side-card');recent.append(node('h3','▣  Registered shops'));
 const recentHint=node('p','Published, approved locations from Teyza. No unverified registrations are counted.','tp-muted');
 const recentList=node('div',undefined,'tp-shop-list');const shopsButton=node('button','Open business accounts →','tp-text-button');shopsButton.type='button';shopsButton.onclick=openShops;
 recent.append(recentHint,recentList,shopsButton);
 const insights=node('section',undefined,'tp-side-card');insights.append(node('h3','↗  Quick insights'));
 const insightsBody=node('div',undefined,'tp-insight-grid');
 insightsBody.append(node('div','Verified shop inventory only'),node('div','Google search: local, on demand'),node('div','No invented national totals'));
 insights.append(insightsBody);
 const googlePanel=node('section',undefined,'tp-side-card tp-google-panel');googlePanel.append(node('h3','G  Google business discovery'),node('p','Explore Google-only listings near a chosen map centre in the separate Google Maps explorer. These results are not a national census.','tp-muted'));
 const googleButton=node('button','Search Google listings on Google Maps →','tp-text-button');googleButton.type='button';googleButton.onclick=openGoogle;googlePanel.append(googleButton);
 aside.append(agents,recent,insights,googlePanel);
 main.append(coverage,aside);panel.append(cards,main);
 const showStatus=t=>status.textContent=t;
 // Never infer consent, verification or registration from a Google listing.
 const readable=(v)=>v===true?'Yes':v===false?'No':'Not provided';
 const agentName=p=>typeof p.agentName==='string'&&p.agentName.trim()?p.agentName.trim():null;
 function shopDetail(p){
  const detail=node('div');detail.append(node('strong',p.name||'Teyza shop'));
  const facts=[['Address',[p.address,p.area,p.city,p.province].filter(Boolean).join(', ')||'Coordinates available'],
   ['Teyza registration','Registered'],['Verified',readable(p.verified)],
   ['WhatsApp opt-in',readable(p.whatsappOptIn)],
   ['Registered by agent',agentName(p)||'Not attributed']];
  for(const [label,value] of facts){const line=node('p');line.append(node('strong',label+': '),document.createTextNode(value));detail.append(line);}
  return detail;
 }
 const getProvince=p=>typeof p.province==='string'?p.province:'';
 let filtered=[];
 function filter(){
  const raw=term.value.trim();
  const text=raw.includes('@')?'':raw.toLocaleLowerCase();
  filtered=shops.filter(p=>valid(p)&&
   (province.value==='All provinces'||getProvince(p)===province.value)&&
   (category.value==='All shop categories'||p.category===({'Spaza shops':'spaza','Retail businesses':'retail','Wholesalers':'wholesale'}[category.value]))&&
   (!text||[p.name,p.city,p.area].some(t=>String(t||'').toLocaleLowerCase().includes(text))));
  render();
 }
 function render(){
  combined.setShops(filtered);
  teyzaCount.textContent=shops.length.toLocaleString('en-ZA')+(partial?'+':'');
  googleCount.textContent='Search';
  const attributed=shops.filter(p=>p.verified===true&&agentName(p));
  agentCount.textContent=String(attributed.length);
  agentList.replaceChildren();
  const counts=new Map();for(const p of attributed)counts.set(agentName(p),(counts.get(agentName(p))||0)+1);
  for(const [name,count] of [...counts].sort((a,b)=>b[1]-a[1]).slice(0,8)){
   const line=node('div',undefined,'tp-shop-row');line.append(node('strong',name),node('small',count+' attributed registrations'));agentList.append(line);
  }
  if(!counts.size)agentList.append(node('p','No agent attribution supplied by the mapped shop inventory.','tp-muted'));
  recentList.replaceChildren();
  for(const p of filtered.slice(0,6)){
   const r=node('div',undefined,'tp-shop-row');
   const badge=node('span','▣','tp-shop-logo'),txt=node('div');
   txt.append(node('strong',p.name||'Unnamed business'),node('small',[p.area,p.city].filter(Boolean).join(', ')||'Location verified'));
   r.append(badge,txt);r.tabIndex=0;r.setAttribute('role','button');r.setAttribute('aria-label','View '+(p.name||'shop')+' on map');
   const focus=()=>{if(!map||!leaflet)return;map.setView([p.latitude,p.longitude],Math.max(map.getZoom(),11));for(const m of markers){if(m.options?.teyzaShopKey===p.id){m.openPopup();break;}}};
   r.addEventListener('click',focus);r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();focus();}});recentList.append(r);
  }
  if(!filtered.length)recentList.append(node('p',shops.length?'No shops match these filters.':'No published shops were returned.','tp-muted'));
  if(!map||!leaflet)return;
  for(const m of markers)m.remove();markers=[];
  for(const p of filtered){
   const point=leaflet.circleMarker([p.latitude,p.longitude],{radius:7,color:'#ffffff',weight:1.5,fillColor:'#059551',fillOpacity:.94});
   point.options.teyzaShopKey=p.id;point.bindPopup(shopDetail(p));point.addTo(map);markers.push(point);
  }
  showStatus('Showing '+filtered.length.toLocaleString('en-ZA')+' of '+shops.length.toLocaleString('en-ZA')+
   ' verified locations'+(partial?' · more records are available; this is a partial inventory':'')+'.');
 }
 async function activate(){
  if(ready)return;
  ready=true;const stamp=++generation;
  showStatus('Opening national map and loading verified shops…');
  if(term.value.includes('@'))term.value=''; // Ignore browser credential autofill.
  // Start loading the basemap immediately; Teyza records load independently.
  const basemap=loadLeaflet().then(async L=>{
   if(stamp!==generation)return;
   leaflet=L;
   map=leaflet.map(mapCanvas,{zoomControl:false,scrollWheelZoom:false}).setView(SA.center,SA.zoom);
   // Self-hosted geographic boundaries: never depend on volunteer map tile servers.
   const response=await fetch('/assets/teyza-southern-africa-land.geojson',{cache:'force-cache'});
   if(!response.ok)throw Error('Teyza geography request failed (HTTP '+response.status+').');
   const boundaries=await response.json();
   if(stamp!==generation)return;
   if(boundaries?.type!=='FeatureCollection'||!Array.isArray(boundaries.features))throw Error('Invalid national map geography.');
   leaflet.geoJSON(boundaries,{
    style:feature=>feature.properties?.name==='South Africa'
     ?{color:'#0d7776',weight:2.4,fillColor:'#d4ebce',fillOpacity:1}
     :{color:'#9fc2b8',weight:1,fillColor:'#e8efdc',fillOpacity:.9},
    onEachFeature:(feature,layer)=>{
     const name=feature?.properties?.name==='Swaziland'?'Eswatini':feature?.properties?.name;
     if(name)layer.bindTooltip(name,{sticky:true,direction:'center'});
    }
   }).addTo(map);
   for(const [name,lat,lon] of [
    ['Cape Town',-33.925,18.424],['Durban',-29.858,31.022],
    ['Johannesburg',-26.204,28.047],['Pretoria',-25.747,28.229],
    ['Bloemfontein',-29.116,26.216],['Polokwane',-23.904,29.448],
    ['Gqeberha',-33.961,25.619],['Mbombela',-25.475,30.970]
   ]){
    const label=leaflet.divIcon({className:'tp-city-label',html:'<span>'+name+'</span>',iconSize:[110,21],iconAnchor:[55,10]});
    leaflet.marker([lat,lon],{icon:label,interactive:false}).addTo(map);
   }
   map.attributionControl.addAttribution('Geography: Natural Earth (public domain)');
   map.setMaxBounds([[-37,13],[-20,37]]);
   map.setMinZoom(4);
   leaflet.control.zoom({position:'bottomright'}).addTo(map);
   filter();queueMicrotask(()=>map?.invalidateSize());
  }).catch(e=>{
   if(stamp===generation){
    showStatus('Interactive basemap unavailable. Registered shops are still listed. '+(e.message||''));
   }
  });
  try{
   shops=[];let after=null,attempts=0;
   do{
    const page=await api('ops_map_shops',after?{after}:{});
    if(stamp!==generation)return;
    if(!Array.isArray(page.shops))throw Error('Invalid registered-shop response.');
    shops.push(...page.shops.filter(p=>p.verified===true&&valid(p)));
    after=page.next||null;attempts++;
    partial=Boolean(after);filter();
   }while(after&&attempts<20);
   next=after;
   const provincesAvailable=shops.some(p=>Boolean(getProvince(p)));
   province.disabled=!provincesAvailable;
   province.title=provincesAvailable?'Filter by recorded province':'Province filtering awaits verified province data from the backend';
   filter();
  }catch(e){
   if(stamp===generation){
    partial=true;filter();
    showStatus('Partial inventory: '+shops.length+' locations loaded. '+(e.message||'Further pages unavailable.'));
    report?.(e);
   }
  }
  await basemap;
 }
 function clear(){combined.clear();generation++;ready=false;if(map){map.remove();map=null;}markers=[];leaflet=null;shops=[];next=null;partial=false;teyzaCount.textContent='—';recentList.replaceChildren();showStatus('Preparing national coverage…');}
 province.addEventListener('change',filter);category.addEventListener('change',filter);term.addEventListener('input',filter);
 reset.onclick=()=>{province.selectedIndex=0;category.selectedIndex=0;term.value='';filter();};
 return {panel,activate,clear};
}
