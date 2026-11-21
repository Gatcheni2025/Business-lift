// Teyza-owned national shop coverage. No Google Places data appears here:
// the basemap is OpenStreetMap, and only independently registered Teyza shops
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
  css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(css);
  const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  js.async=true;js.onload=()=>window.L?.map?resolve(window.L):reject(Error('The map library was not available.'));
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
 const googleCount=metric('Google listings only','Requires a local Google search','tp-amber');
 const agentCount=metric('Agent registrations','Attribution not provided by map inventory','tp-blue');
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
 const termLabel=node('label');termLabel.append(node('span','Find a shop or town'));const term=node('input');term.type='search';term.placeholder='Search loaded shops';term.autocomplete='off';termLabel.append(term);filters.append(termLabel);
 const reset=node('button','Reset filters','tp-reset');reset.type='button';filters.append(reset);
 const mapShell=node('div',undefined,'tp-map-shell');
 const mapCanvas=node('div',undefined,'tp-map-canvas');mapCanvas.setAttribute('aria-label','Map of registered Teyza shops in South Africa');
 const legend=node('div',undefined,'tp-legend');
 legend.append(node('strong','Shop status · map'),node('p','🟢  Verified on Teyza'),node('p','🟡  Agent attribution pending'),node('p','🔵  Google-only: separate local search'),node('small','Only Teyza-owned locations appear on this map.'));
 mapShell.append(mapCanvas,legend);
 const status=node('p','Preparing national coverage…','tp-status');status.setAttribute('role','status');
 coverage.append(heading,filters,mapShell,status);
 const aside=node('aside',undefined,'tp-side');
 const agents=node('section',undefined,'tp-side-card');agents.append(node('h3','♙  Leading agents'),node('p','Rankings require independently verified registration attribution. This map inventory does not provide it.','tp-muted'));
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
 const googleButton=node('button','Open Google explorer →','tp-text-button');googleButton.type='button';googleButton.onclick=openGoogle;googlePanel.append(googleButton);
 aside.append(agents,recent,insights,googlePanel);
 main.append(coverage,aside);panel.append(cards,main);
 const showStatus=t=>status.textContent=t;
 const getProvince=p=>typeof p.province==='string'?p.province:'';
 let filtered=[];
 function filter(){
  const text=term.value.trim().toLocaleLowerCase();
  filtered=shops.filter(p=>valid(p)&&
   (province.value==='All provinces'||getProvince(p)===province.value)&&
   (category.value==='All shop categories'||p.category===({'Spaza shops':'spaza','Retail businesses':'retail','Wholesalers':'wholesale'}[category.value]))&&
   (!text||[p.name,p.city,p.area].some(t=>String(t||'').toLocaleLowerCase().includes(text))));
  render();
 }
 function render(){
  teyzaCount.textContent=shops.length.toLocaleString('en-ZA')+(partial?'+':'');
  googleCount.textContent='—';agentCount.textContent='—';
  recentList.replaceChildren();
  for(const p of filtered.slice(0,6)){
   const r=node('div',undefined,'tp-shop-row');
   const badge=node('span','▣','tp-shop-logo'),txt=node('div');
   txt.append(node('strong',p.name||'Unnamed business'),node('small',[p.area,p.city].filter(Boolean).join(', ')||'Location verified'));
   r.append(badge,txt);recentList.append(r);
  }
  if(!filtered.length)recentList.append(node('p',shops.length?'No shops match these filters.':'No published shops were returned.','tp-muted'));
  if(!map||!leaflet)return;
  for(const m of markers)m.remove();markers=[];
  for(const p of filtered){
   const point=leaflet.circleMarker([p.latitude,p.longitude],{radius:7,color:'#ffffff',weight:1.5,fillColor:'#059551',fillOpacity:.94});
   const popup=node('div');popup.append(node('strong',p.name||'Teyza shop'),node('p',[p.area,p.city].filter(Boolean).join(', ')),node('small','Verified Teyza location'));
   point.bindPopup(popup);point.addTo(map);markers.push(point);
  }
  showStatus('Showing '+filtered.length.toLocaleString('en-ZA')+' of '+shops.length.toLocaleString('en-ZA')+
   ' verified locations'+(partial?' · more records are available; this is a partial inventory':'')+'.');
 }
 async function activate(){
  if(ready)return;ready=true;const stamp=++generation;showStatus('Loading Teyza registered shops…');
  try{
   // Load verified first-party shop inventory independently of map SDK.
   shops=[];let after=null,attempts=0;
   do{
    const page=await api('ops_map_shops',after?{after}:{});
    if(stamp!==generation)return;
    if(!Array.isArray(page.shops))throw Error('Invalid registered-shop response.');
    shops.push(...page.shops.filter(p=>p.verified===true&&valid(p)));
    after=page.next||null;attempts++;
    showStatus('Loaded '+shops.length.toLocaleString('en-ZA')+' verified shop locations…');
   }while(after&&attempts<20);
   partial=Boolean(after);next=after;filter();
  }catch(e){if(stamp===generation){showStatus('Registered shops could not load: '+(e.message||'Please retry.'));report?.(e);}}
  if(stamp!==generation)return;
  try{
   leaflet=await loadLeaflet();if(stamp!==generation)return;
   map=leaflet.map(mapCanvas,{zoomControl:false,scrollWheelZoom:false}).setView(SA.center,SA.zoom);
   leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom:18
   }).addTo(map);
   leaflet.control.zoom({position:'bottomright'}).addTo(map);
   filter();queueMicrotask(()=>map?.invalidateSize());
  }catch(e){if(stamp===generation)showStatus('Interactive map unavailable. The verified shop list remains accessible. '+(e.message||''));}
 }
 function clear(){generation++;ready=false;if(map){map.remove();map=null;}markers=[];leaflet=null;shops=[];next=null;partial=false;teyzaCount.textContent='—';recentList.replaceChildren();showStatus('Preparing national coverage…');}
 province.addEventListener('change',filter);category.addEventListener('change',filter);term.addEventListener('input',filter);
 reset.onclick=()=>{province.selectedIndex=0;category.selectedIndex=0;term.value='';filter();};
 return {panel,activate,clear};
}
