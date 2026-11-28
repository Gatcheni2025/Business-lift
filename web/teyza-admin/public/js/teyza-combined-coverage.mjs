// Google Maps is the only basemap on which Google Places results may appear.
// Results remain ephemeral, scoped to one searched area, and are never exported.
const ENDPOINT='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover';
const CONFIG='/assets/teyza-maps-config.json';
const CONTACT='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-place-contact.php';
const pageLength=30;
// Independently sourced approximate locality centres (not Google Places data).
// City/Soweto: GeoNames https://www.geonames.org/za/largest-cities-in-south-africa.html
// Durban townships and Gauteng main places: Statistics SA main-place pages, IDs below.
// Lamontville: SAPS public station location (a local reference point).
const pilotAreas=[
 ['Durban','KwaZulu-Natal',-29.8579,31.0292,20000,'GeoNames 1007311',['ethekwini','durban central']],
 ['Johannesburg','Gauteng',-26.202,28.044,20000,'GeoNames largest cities',['joburg','jo burg','johannesburg cbd']],
 ['Umlazi','KwaZulu-Natal',-29.9662,30.8875,5000,'Stats SA 10459',[]],
 ['KwaMashu','KwaZulu-Natal',-29.7416,30.9902,5000,'Stats SA 10351',['kwa mashu']],
 ['Inanda','KwaZulu-Natal',-29.6962,30.9437,5000,'Stats SA 10333 (Inanda A)',['inanda a']],
 ['Ntuzuma','KwaZulu-Natal',-29.7382,30.943,5000,'Stats SA 10352',[]],
 ['Clermont','KwaZulu-Natal',-29.793,30.9055,5000,'Stats SA 10410',[]],
 ['Lamontville','KwaZulu-Natal',-29.94046,30.93923,5000,'SAPS station 642',[]],
 ['KwaDabeka','KwaZulu-Natal',-29.7697,30.9104,5000,'Stats SA 10409',['kwa dabeka']],
 ['Soweto','Gauteng',-26.268,27.858,8000,'GeoNames largest cities',[]],
 ['Alexandra','Gauteng',-26.1016,28.1052,5000,'Stats SA 11305',['alex']],
 ['Diepsloot','Gauteng',-25.9379,28.0185,5000,'Stats SA 11294',[]],
 ['Orange Farm','Gauteng',-26.469,27.8648,5000,'Stats SA 11325',['orangefarm']],
 ['Tembisa','Gauteng',-26.0106,28.2219,5000,'Stats SA 11262 (Ekurhuleni)',['thembisa']]
];
const areaKey=value=>String(value||'').normalize('NFKC').toLowerCase().trim().replace(/[-\s]+/g,' ');
export function resolvePilotArea(town,province='All provinces'){
 const key=areaKey(town),prov=areaKey(province);
 const row=pilotAreas.find(([name,p,,, , ,aliases])=>[name,...aliases].some(n=>areaKey(n)===key)&&(prov==='all provinces'||areaKey(p)===prov));
 return row?{area:row[0],province:row[1],label:row[0]+', '+row[1],lat:row[2],lng:row[3],radius:row[4],source:row[5]}:null;
}
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
export function categoryCounts(places){
 const counts={spaza:0,variety:0,wholesale:0};
 for(const place of places)if(Object.hasOwn(counts,place.shopCategory))counts[place.shopCategory]++;
 return counts;
}
export function whatsappCheckUrl(value){
 const raw=String(value||'').replace(/[\s().-]/g,'');
 const digits=/^0\d{9}$/.test(raw)?'27'+raw.slice(1):/^\+27\d{9}$/.test(raw)?raw.slice(1):/^27\d{9}$/.test(raw)?raw:null;
 return digits?'https://wa.me/'+digits:null;
}
// Explicit suggestions, never an automatic first-result geocode for acquisition.
export function pilotAreaSuggestions(query,province='All provinces'){
 const q=areaKey(query),prov=areaKey(province);
 if(!q)return [];
 return pilotAreas.filter(([name,p,,,,,aliases])=>(prov==='all provinces'||areaKey(p)===prov)&&[name,...aliases].some(n=>areaKey(n).startsWith(q))).slice(0,6).map(r=>resolvePilotArea(r[0],r[1]));
}
export function withinSearchRadius(place,area){
 if(!good(place)||!Number.isFinite(area?.lat)||!Number.isFinite(area?.lng)||!Number.isFinite(area?.radius))return false;
 const rad=Math.PI/180,dLat=(place.latitude-area.lat)*rad,dLng=(place.longitude-area.lng)*rad;
 const a=Math.sin(dLat/2)**2+Math.cos(area.lat*rad)*Math.cos(place.latitude*rad)*Math.sin(dLng/2)**2;
 return 6371000*2*Math.asin(Math.min(1,Math.sqrt(a)))<=area.radius;
}
export function attachAreaAutocomplete(input,{api,onSelect=()=>{},onEdit=()=>{},province=()=> 'All provinces',initialArea=null}={}){
 const wrap=elt('div');wrap.className='acq-area-autocomplete';
 const anchor=input.parentElement?.tagName==='LABEL'?input.parentElement:input;
 anchor.replaceWith(wrap);wrap.append(anchor);
 const menu=elt('div');menu.className='acq-area-suggestions';menu.hidden=true;wrap.append(menu);
 const status=elt('p','');status.className='acq-area-status';status.setAttribute('role','status');wrap.append(status);
 input.autocomplete='off';
 let serial=0,timer=null,sessionToken=null,selection=initialArea,buttons=[],index=-1;
 const validProvince=a=>province()==='All provinces'||areaKey(a.province)===areaKey(province());
 function close(){clearTimeout(timer);serial++;menu.hidden=true;menu.replaceChildren();buttons=[];index=-1;}
 function selected(){return selection&&input.value===selection.label&&validProvince(selection)?selection:null;}
 async function choose(item){
  const stamp=++serial;clearTimeout(timer);menu.hidden=true;status.textContent='Confirming selected area…';
  try{
   const area=item.area|| (await api('admin_area_select',{predictionToken:item.predictionToken})).area;
   if(stamp!==serial||!input.isConnected)return;
   if(!area||!validProvince(area)||typeof area.label!=='string'||!Number.isFinite(area.lat)||!Number.isFinite(area.lng)||area.lat< -35||area.lat> -22||area.lng<16||area.lng>34||![5000,8000,10000,20000].includes(area.radius))throw Error('Choose a specific locality in the selected province.');
   selection=area;input.value=area.label;sessionToken=null;status.textContent='Selected: '+area.label;close();onSelect(area);
  }catch(error){if(stamp===serial&&input.isConnected){status.textContent=error.message||'Area could not be confirmed. Try again.';}}
 }
 function render(items,credit=false){
  menu.replaceChildren();buttons=[];index=-1;menu.hidden=!items.length;
  for(const item of items){const b=elt('button',item.label);b.type='button';b.className='acq-area-option';b.onclick=()=>void choose(item);menu.append(b);buttons.push(b);}
  if(credit&&items.length)menu.append(elt('small','Area suggestions: Google Maps'));
 }
 function suggest(){
  close();selection=null;onEdit();status.textContent='';
  const q=input.value.trim(),stamp=serial;if(q.length<2)return;
  const local=pilotAreaSuggestions(q,province()).map(area=>({label:area.label,area}));
  render(local);
  if(!api||q.length<3||resolvePilotArea(q,province()))return;
  timer=setTimeout(async()=>{
   if(stamp!==serial||!input.isConnected)return;
   status.textContent='Finding South African areas…';
   try{
    sessionToken||=crypto.randomUUID();
    const r=await api('admin_area_suggest',{query:q,sessionToken});
    if(stamp!==serial||!input.isConnected)return;
    const remote=(Array.isArray(r.suggestions)?r.suggestions:[]).filter(x=>typeof x.label==='string'&&typeof x.predictionToken==='string');
    const labels=new Set(local.map(x=>areaKey(x.label)));
    const items=[...local,...remote.filter(x=>!labels.has(areaKey(x.label)))].slice(0,8);
    render(items,remote.length>0);status.textContent=items.length?'Select the correct town and province.':'No matching areas. Try a more specific name.';
   }catch(error){if(stamp===serial&&input.isConnected)status.textContent='Area suggestions unavailable. Choose a known pilot area or try again.';}
  },400);
 }
 input.addEventListener('input',suggest);
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();close();return;}
  if(menu.hidden||!buttons.length)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();index=index<0?(e.key==='ArrowDown'?0:buttons.length-1):(index+(e.key==='ArrowDown'?1:buttons.length-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>b.classList.toggle('highlighted',i===index));return;}
  if(e.key==='Enter'&&index>=0){e.preventDefault();e.stopImmediatePropagation();buttons[index].click();}
 },{capture:true});
 return {selected,suggest,selectLocal:area=>choose({area}),clear:()=>{close();selection=null;sessionToken=null;status.textContent='';}};
}
// A failed or pending details request is not proof of an absent phone number.
// Keep a previously listed phone available if the optional refresh fails.
export function contactPhoneState(place,entry){
 const phone=entry?.state==='ready'?entry.phone:place?.phone;
 if(typeof phone==='string'&&phone.trim())return 'number';
 if(entry?.state==='loading')return 'loading';
 if(entry?.state==='error')return 'failed';
 if(entry?.state==='ready')return 'missing';
 return 'unchecked';
}
const phoneLabels={number:'Phone available',loading:'Checking contact',failed:'Contact check unavailable',missing:'No phone listed',unchecked:'Not yet checked'};
const rank={number:0,loading:1,unchecked:2,failed:3,missing:4};
export function contactLookupIssue(status){
 if(status===403)return 'Request blocked (HTTP 403). Check access or the trial allowance.';
 if(status===429)return 'Request limit reached (HTTP 429). Try again later.';
 if(Number.isInteger(status)&&status>=400&&status<=599)return 'Contact service returned HTTP '+status+'.';
 return 'Contact service did not return a valid response.';
}
export function createCombinedCoverage({report,onReady,onDiscovery,autoSearch=true,compact=false,guided=false,initialTown='Durban',initialArea=null,areaApi,invitationDraft,onAddBusiness,onContactBusiness,resolveSavedPlaces}={}){
 let google=null,map=null,markers=[],registered=[],places=[],shown=false,active=false,searchCompleted=false,searchPending=false,epoch=0;
 let resultEpoch=0,pageSize=pageLength,searchError='',center=null,googleLoading=null,searchedArea=null;
 const contactCache=new Map();
 let guideStep=1,guideArea=null;
 const directory=elt('section');directory.className='acq-locality-directory';directory.hidden=true;
 const directoryTitle=elt('h4','Townships & communities'),directoryNote=elt('p','Browse the government locality reference by province. Select a community, then confirm its search location. This is not a complete or current township census.');
 directoryNote.className='footnote';
 const quick=elt('div');quick.className='acq-locality-quick';
 const filterRow=elt('div');filterRow.className='acq-locality-filter';
 const localityFilter=elt('input');localityFilter.type='search';localityFilter.maxLength=80;localityFilter.placeholder='Filter communities by name';localityFilter.setAttribute('aria-label','Filter township directory');
 const filterButton=elt('button','Filter list');filterButton.type='button';filterButton.className='button quiet';filterRow.append(localityFilter,filterButton);
 const directoryStatus=elt('p','');directoryStatus.setAttribute('role','status');directoryStatus.className='footnote';
 const localityRows=elt('div');localityRows.className='acq-locality-rows';localityRows.setAttribute('aria-label','Townships and communities');
 const pages=elt('div');pages.className='acq-locality-pages';
 const previousPage=elt('button','Previous communities'),nextPage=elt('button','More communities'),retryDirectory=elt('button','Retry directory');
 for(const btn of [previousPage,nextPage,retryDirectory]){btn.type='button';btn.className='button quiet';btn.hidden=true;}
 pages.append(previousPage,nextPage,retryDirectory);directory.append(directoryTitle,directoryNote,quick,filterRow,directoryStatus,localityRows,pages);
 let browseSerial=0,browseQuery='',browseOffset=0,browseNext=null,browseHistory=[],browseBusy=false;
 const browseCache=new Map();
 function paintDirectoryQuick(){
  quick.replaceChildren();
  const list=pilotAreas.filter(r=>r[1]===province.value);
  if(!list.length)return;
  quick.append(elt('small','Quick picks · independently sourced centres'));
  for(const [name,p] of list){const btn=elt('button',name);btn.type='button';btn.className='button quiet';btn.onclick=()=>{if(province.value!==p)return;nextHint.textContent='';void autocomplete.selectLocal(resolvePilotArea(name,p));};quick.append(btn);}
 }
 function browseValid(stamp,p){return stamp===browseSerial&&directory.isConnected&&guideStep===1&&province.value===p;}
 function resetDirectory(){
  browseSerial++;browseBusy=false;browseQuery='';browseOffset=0;browseNext=null;browseHistory=[];localityFilter.value='';localityRows.replaceChildren();directoryStatus.textContent='';
  previousPage.hidden=nextPage.hidden=retryDirectory.hidden=true;filterButton.disabled=false;
 }
 async function loadDirectory(offset=0){
  if(!guided||guideStep!==1||province.value==='All provinces'||!directory.isConnected)return;
  const p=province.value,term=browseQuery,stamp=++browseSerial,key=JSON.stringify([p,term,offset]);
  browseOffset=offset;browseNext=null;browseBusy=true;filterButton.disabled=true;previousPage.hidden=nextPage.hidden=retryDirectory.hidden=true;localityRows.replaceChildren();directoryStatus.textContent='Loading communities in '+p+'…';
  try{
   if(!areaApi)throw Error('Locality directory unavailable.');
   let reply=browseCache.get(key);
   if(!reply)reply=await areaApi('ops_acquisition_locality_browse',{province:p,query:term,offset});
   if(!browseValid(stamp,p))return;
   if(reply?.schema!==1||reply.province!==p||reply.query!==term||reply.offset!==offset||!Array.isArray(reply.localities)||reply.localities.length>50||(reply.nextOffset!==null&&(!Number.isSafeInteger(reply.nextOffset)||reply.nextOffset<=offset||reply.nextOffset>100000)))throw Error('Unexpected locality directory response.');
   if(browseCache.size>=24)browseCache.clear();browseCache.set(key,reply);
   browseNext=reply.nextOffset;
   const seen=new Set();
   for(const item of reply.localities){
    if(item?.province!==p||typeof item.township!=='string'||!item.township.trim()||typeof item.municipality!=='string'||!item.municipality.trim()||typeof item.localityId!=='string'||seen.has(item.localityId))continue;
    seen.add(item.localityId);
    const btn=elt('button');btn.type='button';btn.className='acq-locality-choice';btn.append(elt('strong',item.township),elt('small',item.municipality+' · '+p));
    btn.onclick=()=>{
     if(province.value!==p||guideStep!==1)return;
     // A reference name is not a geocode. Resolve explicitly via the
     // existing area selector, including its strict province validation.
     const full=[item.township,item.municipality,p].join(', ');
     town.value=full.length<=100?full:item.township.slice(0,100);
     autocomplete.suggest();town.focus();
     nextHint.textContent='Confirm the matching location from the area suggestions below.';
    };localityRows.append(btn);
   }
   directoryStatus.textContent=seen.size?seen.size+' communities on this page · '+p:reply.nextOffset!==null?'No usable references on this page. More source rows are available.':'No matching reference on this page. Try another name or use the area search below.';
   previousPage.hidden=browseHistory.length===0;nextPage.hidden=browseNext===null;
  }catch(e){if(browseValid(stamp,p)){directoryStatus.textContent='The locality directory could not be loaded. Retry or use the area search below.';retryDirectory.hidden=false;previousPage.hidden=browseHistory.length===0;}}
  finally{if(browseValid(stamp,p)){browseBusy=false;filterButton.disabled=false;}}
 }
 function applyDirectoryFilter(){
  if(browseBusy)return;browseQuery=localityFilter.value.trim();browseOffset=0;browseNext=null;browseHistory=[];void loadDirectory();
 }
 filterButton.onclick=applyDirectoryFilter;localityFilter.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyDirectoryFilter();}});
 nextPage.onclick=()=>{if(browseBusy||browseNext===null)return;browseHistory.push(browseOffset);void loadDirectory(browseNext);};
 previousPage.onclick=()=>{if(browseBusy||!browseHistory.length)return;void loadDirectory(browseHistory.pop());};
 retryDirectory.onclick=()=>{if(!browseBusy)void loadDirectory(browseOffset);};
 const phoneFilter=elt('select');phoneFilter.setAttribute('aria-label','Phone availability');
 for(const [id,label] of [['all','All results — numbers first'],['number','Known phone numbers'],['unchecked','Not yet checked'],['failed','Contact check unavailable'],['missing','No listed phone — field enquiry']]){const o=elt('option',label);o.value=id;phoneFilter.append(o);}
 const chains=elt('input');chains.type='checkbox';chains.checked=false;
 const chainLabel=elt('label');chainLabel.append(chains,elt('span',' Include large chains'));
 const chainName=p=>/\b(?:shoprite|checkers|pick\s*n\s*pay|pnp|spar|superspar|woolworths|makro|boxer|pep\s*stores|kfc|mcdonald'?s|chicken\s*licken|steers|debonairs)\b/i.test(String(p.name||''));
 const phoneState=p=>contactPhoneState(p,contactCache.get(p.placeId));
 const guide=elt('div');guide.className='acq-discovery-guide';const stepLine=elt('div');stepLine.className='acq-guide-steps';const selectedText=elt('p','');selectedText.className='acq-guide-selection';
 const continueButton=elt('button','Continue to business type');continueButton.type='button';continueButton.className='button primary';
 const editButton=elt('button','Change location');editButton.type='button';editButton.className='button quiet';
 const nextHint=elt('p','');nextHint.setAttribute('role','status');
 guide.append(stepLine,selectedText,nextHint);
 function paintGuide(){
  if(!guided)return;
  stepLine.replaceChildren();
  for(const [i,label] of ['Location','Business type','Results'].entries()){const s=elt('span',(i+1)+'. '+label);s.dataset.current=String(guideStep===i+1);s.dataset.done=String(guideStep>i+1);stepLine.append(s);}
  selectedText.textContent=guideArea?'Selected community: '+guideArea.label:'Choose the province, then a town or township.';
  province.hidden=guideStep!==1;town.parentElement.hidden=guideStep!==1;directory.hidden=guideStep!==1||province.value==='All provinces';
  town.disabled=guideStep!==1||province.value==='All provinces';
  continueButton.hidden=guideStep!==1;continueButton.disabled=province.value==='All provinces';
  category.hidden=guideStep===1;search.hidden=guideStep===1;editButton.hidden=guideStep===1;
  phoneFilter.hidden=guideStep!==3;chainLabel.hidden=guideStep!==3;businessFilter.hidden=guideStep!==3;layerFilters.hidden=guideStep!==3;
  mapPanel.hidden=guideStep!==3;
 }
 continueButton.onclick=async()=>{
  nextHint.textContent='';
  try{if(province.value==='All provinces')throw Error('Choose a province first.');const selected=await locate();if(!selected||selected.province!==province.value)throw Error('Select the correct community in the selected province.');guideArea=selected;guideStep=2;browseSerial++;browseBusy=false;filterButton.disabled=false;paintGuide();}
  catch(e){nextHint.textContent=e.message||'Choose a confirmed location.';}
 };
 editButton.onclick=()=>{if(searchPending)return;guideStep=1;guideArea=null;resetAreaResults();paintGuide();if(!localityRows.children.length&&province.value!=='All provinces')void loadDirectory(browseOffset);};
 phoneFilter.onchange=chains.onchange=()=>{pageSize=pageLength;render();};
 const businessFilter=elt('input');businessFilter.type='search';businessFilter.placeholder='Filter results by business name';businessFilter.setAttribute('aria-label','Filter live business names');
 const panel=elt('section');panel.className='tp-combined'+(compact?' acq-google-compact':'');
 const title=elt('h3',compact?'Google Places · live listings':'Google Places · shop registration opportunities');
 const note=elt('p',compact?'Search for local businesses by town and category. All current listings remain visible, even when contact information is missing. Select a business to look up its publicly listed phone and website.':'Choose a town or move the map, then search Google Places for potential Teyza registrations. Google-only means no matching published Teyza Place ID, not confirmed unregistered. Searches are local, not a national census.');
 const controls=elt('div');controls.className='tp-combined-controls';

 const town=elt('input');town.type='search';town.placeholder='Town or municipality (e.g. eThekwini)';town.setAttribute('aria-label','Town or municipality');
 const province=elt('select');province.setAttribute('aria-label','Province');
 for(const p of ['All provinces','Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape']){const o=elt('option',p);o.value=p;province.append(o);}
 const category=elt('select');category.setAttribute('aria-label','Google business type');
 for(const [id,t] of [['spaza','Spaza and local shops'],['variety','Other businesses (salons, services, retail)'],['wholesale','Wholesalers'],['all','All three categories (3 searches)']]){const o=elt('option',t);o.value=id;category.append(o);}
 const start=elt('button',compact?'Retry business search':'Retry Google map');start.type='button';start.className='button primary';
 const search=elt('button',compact?'Search this area':'Find shops needing Teyza registration');search.type='button';search.className='button quiet';search.disabled=true;
 const showT=elt('input');showT.type='checkbox';showT.checked=!compact;
 const showG=elt('input');showG.type='checkbox';showG.checked=true;
 const layerFilters=elt('div');layerFilters.className='tp-category-layers';
 const layers={};
 for(const [id,label] of [['spaza','Spaza & local shops'],['variety','Other businesses'],['wholesale','Wholesalers']]){
  const input=elt('input');input.type='checkbox';input.checked=true;layers[id]=input;
  const item=elt('label');item.append(input,elt('span',' '+label));layerFilters.append(item);
 }
 const count=elt('div');count.className='tp-discovery-counts';count.setAttribute('aria-live','polite');
 const attribution=elt('p',compact?'Business information: Google Maps. Live results are not saved or exported.':'Business information © Google Maps; search results are shown only on this Google map and are not saved as a business directory.');attribution.className='tp-google-credit';
 const toggle=(input,label)=>{const item=elt('label');item.append(input,elt('span',' '+label));return item;};
 const status=elt('p',compact?'Ready to search local businesses.':'Loading the national shop map and checking Google Maps configuration…');status.setAttribute('role','status');
 const canvas=elt('div');canvas.className='tp-combined-map';canvas.style.cssText=compact?'display:none;height:260px;min-height:230px;border-radius:12px;overflow:hidden;margin-top:12px':'display:none;height:480px;min-height:340px;border-radius:15px;overflow:hidden;margin-top:12px';
 const list=elt('div');list.className='tp-combined-results';
 const mapPanel=elt('details');mapPanel.className='acq-optional-map';mapPanel.append(elt('summary','Show map (optional)'));
 const mapNotice=elt('p','');mapNotice.setAttribute('role','status');
 if(compact){town.value=initialArea?.label||String(initialTown||(guided?'':'Durban')).slice(0,100);province.value=initialArea?.province||'All provinces';category.value=guided?'spaza':'all';mapPanel.append(mapNotice,canvas);}
 if(guided){controls.append(province,directory,town,continueButton,editButton,category,search);}else controls.append(town,province,category,search);if(!compact)controls.append(toggle(showT,'Teyza registered'),toggle(showG,'Google only'));
 if(compact){panel.append(title,note);if(guided)panel.append(guide);panel.append(controls,status,count,businessFilter);if(guided)panel.append(phoneFilter,chainLabel);panel.append(layerFilters,attribution,list,mapPanel);businessFilter.oninput=()=>{pageSize=pageLength;render();};}else panel.append(title,note,controls,status,count,layerFilters,canvas,attribution,list);
 let autocomplete=null;
 function resetAreaResults(){if(searchPending)return;resultEpoch++;contactCache.clear();places=[];searchCompleted=false;searchError='';searchedArea=null;render();}
 if(compact){autocomplete=attachAreaAutocomplete(town,{api:areaApi,province:()=>province.value,initialArea,onEdit:resetAreaResults,onSelect:resetAreaResults});province.onchange=()=>{autocomplete.clear();resetAreaResults();if(guided){guideStep=1;guideArea=null;town.value='';nextHint.textContent='';resetDirectory();paintGuide();paintDirectoryQuick();void loadDirectory();}};if(guided){province.options[0].textContent='Choose a province';town.placeholder='Or search for a town or township';paintGuide();}}

 const human=v=>v===true?'Yes':v===false?'No':'Not provided';
 const info=p=>{
  const body=elt('div');body.append(elt('strong',p.name||'Shop'));
  if(p._googleOnly)body.append(elt('p',p.shopCategory==='wholesale'?'Wholesale supplier':p.shopCategory==='variety'?'Other local business':'Spaza / local shop'));
  const rows=[
   ['Source',p._googleOnly?'Google listing only':p.googlePlaceId?'Google + Teyza':'Teyza registered'],
   ['Address',[p.address,p.area,p.city,p.province].filter(Boolean).join(', ')||'Map location'],
   ['Registered on Teyza',p._googleOnly?(compact?'Not checked; verify separately':'No matching published Teyza record'): 'Yes'],
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

 function publicWebsite(value){
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname.includes('.')?url.href:null;}catch{return null;}
 }
 function mapsLink(p){const a=elt('a','View on Google Maps');a.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.name||'Business')+'&query_place_id='+encodeURIComponent(p.placeId);a.target='_blank';a.rel='noopener noreferrer';return a;}
 function paintContact(host,p,entry){
  host.replaceChildren();
  host.append(elt('p','Email: not supplied by Google Maps'),elt('p','WhatsApp: not verified'));
  if(entry?.state==='loading'){host.append(elt('p','Checking public phone and website…'));return;}
  if(entry?.state==='error'){
   host.append(elt('p','Contact lookup unavailable. '+(entry.issue||'The request did not complete.')+' This does not establish whether a phone is listed.'));
   if(!(typeof p.phone==='string'&&p.phone.trim())){host.append(elt('p','Open the original listing, arrange a field enquiry or retry deliberately.'));return;}
   host.append(elt('p','Previously listed contact details (not refreshed):'));
   entry={phone:p.phone,websiteUrl:p.websiteUrl};
  }
  const phone=typeof entry?.phone==='string'?entry.phone.trim().slice(0,32):'';
  const website=publicWebsite(entry?.websiteUrl);
  host.append(elt('p',phone?'Public phone: '+phone:'Phone: not listed'),elt('p',website?'Business website: available':'Website: not listed'));
  if(website){const a=elt('a','Open business website');a.href=website;a.target='_blank';a.rel='noopener noreferrer';host.append(a);}
  const wa=whatsappCheckUrl(phone);if(wa){
   const check=elt('button','Check WhatsApp');check.type='button';check.className='button quiet acq-check-whatsapp';
   const draft=elt('div');draft.className='acq-wa-draft';draft.hidden=true;
   const a=elt('a','Open WhatsApp — check number only');a.href=wa;a.target='_blank';a.rel='noopener noreferrer';
   if(invitationDraft){const preview=elt('textarea');preview.readOnly=true;preview.rows=8;preview.value=invitationDraft({name:p.name,area:searchedArea?.area||p.area||town.value,city:''});preview.setAttribute('aria-label','Personalised WhatsApp invitation preview');draft.append(elt('strong','Personalised invitation preview'),preview,elt('p','Add the independently confirmed business and record actual owner permission before opening a prefilled marketing chat.'));}
   draft.append(a,elt('p','Number check only: WhatsApp registration and owner consent are not verified. Nothing is sent.'));
   check.onclick=()=>{draft.hidden=!draft.hidden;check.setAttribute('aria-expanded',String(!draft.hidden));};check.setAttribute('aria-expanded','false');host.append(check,draft);
  }else if(phone)host.append(elt('p','WhatsApp check unavailable for this phone format. Verify a South African number.'));
  host.append(elt('p',phone||website?'Verify the owner and obtain permission through an appropriate channel before marketing.':'Manual enquiry: visit the business address or inspect the original Google Maps listing.'));
 }
 async function lookupContact(p,host,button,updateStatus){
  const stamp=resultEpoch,activation=epoch;
  const cached=contactCache.get(p.placeId);
  if(cached&&cached.state!=='error'){paintContact(host,p,cached);updateStatus();return;}
  if(!/^[A-Za-z0-9_-]{10,200}$/.test(p.placeId)){const entry={state:'error',issue:'Invalid place reference.'};contactCache.set(p.placeId,entry);if(guided)render();else{paintContact(host,p,entry);updateStatus();}return;}
  contactCache.set(p.placeId,{state:'loading'});
  paintContact(host,p,{state:'loading'});button.disabled=true;updateStatus();
  try{
   // Only a deliberate click requests additional (potentially billable) fields.
   const url=new URL(CONTACT);url.searchParams.set('placeId',p.placeId);
   const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!r.ok){const e=Error('Contact lookup unavailable');e.contactIssue=contactLookupIssue(r.status);throw e;}
   const d=await r.json();if(d.ok!==true||typeof d.phone!=='string'||typeof d.websiteUrl!=='string'){const e=Error('Contact lookup unavailable');e.contactIssue=contactLookupIssue();throw e;}
   if(stamp!==resultEpoch||activation!==epoch||!active)return;
   const entry={state:'ready',phone:d.phone.trim().slice(0,32),websiteUrl:publicWebsite(d.websiteUrl)||''};
   contactCache.set(p.placeId,entry);if(guided)render();else if(host.isConnected){paintContact(host,p,entry);updateStatus();}else renderCompactList(matchGoogle(places,registered).potential.filter(p=>layers[p.shopCategory]?.checked!==false));
  }catch(e){
   if(stamp!==resultEpoch||activation!==epoch||!active)return;
   const entry={state:'error',issue:e.contactIssue||'Network or response error.'};contactCache.set(p.placeId,entry);if(guided)render();else if(host.isConnected){paintContact(host,p,entry);updateStatus();}else renderCompactList(matchGoogle(places,registered).potential.filter(p=>layers[p.shopCategory]?.checked!==false));
  }finally{if(stamp===resultEpoch&&activation===epoch&&button.isConnected)updateStatus();}
 }
 function renderCompactList(visible){
  list.replaceChildren();
  if(searchPending){list.append(elt('p','Searching for businesses. Results will appear here.'));return;}
  if(searchError){list.append(elt('p','Search failed: '+searchError+' Check the town and try again.'));return;}
  if(!searchCompleted){list.append(elt('p','Enter a town or township and search to view businesses.'));return;}
  if(!visible.length){list.append(elt('p','No businesses match this search or the selected categories. Try another area or category.'));return;}
  const q=businessFilter.value.trim().toLowerCase();visible=visible.filter(p=>!q||String(p.name||'').toLowerCase().includes(q));
  if(guided){const eligible=visible.filter(p=>chains.checked||!chainName(p)),stats={number:0,unchecked:0,missing:0,failed:0,loading:0};for(const p of eligible)stats[phoneState(p)]++;list.append(elt('p',stats.number+' with phone · '+stats.unchecked+' not checked · '+stats.loading+' checking · '+stats.failed+' check unavailable · '+stats.missing+' no listed phone · '+(visible.length-eligible.length)+' chain listings hidden'));visible=eligible.filter(p=>phoneFilter.value==='all'||phoneState(p)===phoneFilter.value).sort((a,b)=>rank[phoneState(a)]-rank[phoneState(b)]);}
  if(!visible.length){list.append(elt('p','No results match this view. Change the phone filter or check additional listings.'));return;}
  const savedRows=[];
  list.append(elt('p','Showing '+Math.min(pageSize,visible.length)+' of '+visible.length+' businesses. Contact information is optional; no business is excluded for missing contact details.'));
  for(const p of visible.slice(0,pageSize)){
   const item=elt('article');item.className='acq-live-result acq-business-card';
   const identity=elt('div');identity.className='acq-live-identity';
   identity.append(elt('strong',p.name||'Google-listed business'),elt('span',p.address||p.area||'Location on Google Maps'),elt('small',p.shopCategory==='spaza'?'Spaza / local shop':p.shopCategory==='wholesale'?'Wholesaler':'Other local business'));
   const state=elt('span',phoneLabels[phoneState(p)]);state.className='acq-manual-chip';state.dataset.phoneState=phoneState(p);state.setAttribute('role','status');
   const savedStatus=elt('span','');savedStatus.className='acq-status';savedStatus.hidden=true;
   const actions=elt('div');actions.className='acq-contact-actions';
   const details=elt('div');details.className='acq-live-details';details.setAttribute('aria-live','polite');
   const contact=elt('button','View contact details');contact.type='button';contact.className='button quiet';
   const cached=contactCache.get(p.placeId);
   if(cached)paintContact(details,p,cached);
   else if(p.phone||p.websiteUrl)paintContact(details,p,{phone:p.phone,websiteUrl:p.websiteUrl});
   else details.append(elt('p','Phone / website: not yet checked. Email not supplied by Google; WhatsApp not verified.'));
   function updateStatus(){const entry=contactCache.get(p.placeId),value=phoneState(p);state.textContent=phoneLabels[value];state.dataset.phoneState=value;contact.textContent=entry?.state==='error'?'Retry contact check':entry?.state==='loading'?'Checking contact…':entry?.state==='ready'?'Contact details checked':'View contact details';contact.disabled=entry?.state==='loading'||entry?.state==='ready';}
   updateStatus();contact.onclick=()=>lookupContact(p,details,contact,updateStatus);
   actions.append(contact,mapsLink(p));
   const mapButton=elt('button','Show on map');mapButton.type='button';mapButton.className='button quiet';
   mapButton.onclick=async()=>{mapPanel.open=true;const stamp=epoch;await ensureCompactMap();if(stamp!==epoch||!active)return;try{if(map){map.panTo(boundsFor(p));map.setZoom(Math.max(map.getZoom(),14));const marker=placesById.get(p.placeId);marker?.popup.open({map,anchor:marker.marker});}}catch{mapNotice.textContent='Map could not update. Business information remains available above.';}mapPanel.scrollIntoView({block:'nearest'});};
   actions.append(mapButton);
   if(onAddBusiness){
    let savedId=null;
    const add=elt('button','Add Business');add.type='button';add.className='button primary';
    add.onclick=()=>savedId?onContactBusiness?.(savedId):onAddBusiness(p,contactCache.get(p.placeId)?.state==='ready'?contactCache.get(p.placeId):{phone:p.phone||'',websiteUrl:p.websiteUrl||''},searchedArea?.area||town.value,searchedArea);
    actions.prepend(add);
    savedRows.push({id:p.placeId,setSaved(id){savedId=id;savedStatus.hidden=false;savedStatus.textContent='Added';savedStatus.dataset.state='interested';add.textContent='Contact';add.disabled=false;},button:add,state:savedStatus});
   }
   item.append(identity,state,savedStatus,details,actions);list.append(item);
  }
  if(resolveSavedPlaces&&savedRows.length){
   const stamp=resultEpoch,activation=epoch;
   for(const row of savedRows)row.button.disabled=true;
   Promise.resolve().then(()=>resolveSavedPlaces(savedRows.map(r=>r.id))).then(matches=>{
    if(stamp!==resultEpoch||activation!==epoch||!active)return;
    for(const row of savedRows){if(!row.button.isConnected)continue;const id=matches?.get(row.id);if(id)row.setSaved(id);else row.button.disabled=false;}
   }).catch(()=>{if(stamp!==resultEpoch||activation!==epoch||!active)return;for(const row of savedRows){if(row.button.isConnected){row.button.disabled=false;row.state.hidden=false;row.state.textContent='Saved status unavailable; duplicate check on save';}}});
  }
  if(pageSize<visible.length){
   const more=elt('button','Show more businesses');more.type='button';more.className='button quiet';
   more.onclick=()=>{pageSize+=pageLength;renderCompactList(visible);};list.append(more);
  }
 }
 async function ensureCompactMap(){
  if(!compact||!active||!mapPanel.open)return;
  const stamp=epoch;
  try{
   mapNotice.textContent='Loading optional Google map…';
   await ensureGoogle();if(stamp!==epoch||!active||!mapPanel.open)return;
   mapNotice.textContent='';
   if(!map){
    canvas.style.display='block';
    map=new google.maps.Map(canvas,{center:center||{lat:-29.8587,lng:31.0218},zoom:11,mapTypeControl:false});
    render(true);
   }
  }catch(e){if(stamp!==epoch||!active)return;map=null;canvas.style.display='none';mapNotice.textContent='Map could not load. Business information remains available above.';}
 }
 if(compact)mapPanel.addEventListener('toggle',()=>{if(mapPanel.open)ensureCompactMap();});

 function render(markersOnly=false){
  const groups=matchGoogle(places,registered),listed=groups.potential;
  const breakdown=categoryCounts(listed),visible=listed.filter(p=>layers[p.shopCategory]?.checked!==false);
  const warnings=searchCompleted?' · Spaza/local '+breakdown.spaza+' · Other businesses '+breakdown.variety+' · Wholesalers '+breakdown.wholesale:'';
  if(!searchPending)onDiscovery?.({state:searchCompleted?'ready':'not-searched',total:places.length,potential:listed.length,matched:groups.linked.length,byCategory:breakdown});
  count.replaceChildren();
  count.append(elt('strong',compact?(searchCompleted?places.length+' Google listings in current local search':'Google Places search not completed'):registered.length+' Teyza mapped · '+(searchCompleted?groups.linked.length+' Google listings matched · '+listed.length+' potential leads'+warnings:'Google Places search not completed')));
  if(compact){if(!markersOnly)renderCompactList(visible);}else{
  list.replaceChildren();
  const hint=elt('p',compact?(places.length?'Current Google listings. Email addresses are not available from Google; this list is not a saved contact directory. Registration status is not checked.':'Enter your town or township and search the area.'):(places.length?'Potential leads are Google-listed businesses without a matching published Teyza Place ID. Verify the shop and owner before contacting or assigning an agent.':'Search a town or the current Google map area to see Google-listed shops and businesses.'));
  list.append(hint);}
  if(!map||!google)return;
  try{
  clearMarkers();placesById.clear();
  const records=[
   ...(showT.checked?registered.filter(good).map(p=>({...p,_googleOnly:false})):[]),
   ...(showG.checked?visible.map(p=>({...p,_googleOnly:true})):[])
  ];
  for(const p of records){
   const marker=new google.maps.Marker({map,position:boundsFor(p),title:(p.name||'Shop')+(p._googleOnly?' · Potential Teyza registration':' · Registered on Teyza'),
    icon:{path:google.maps.SymbolPath.CIRCLE,scale:7,fillColor:p._googleOnly?(p.shopCategory==='wholesale'?'#a563d7':p.shopCategory==='variety'?'#ed8b27':'#2b65ca'):p.verified===true?'#09945a':'#e1a42e',fillOpacity:.95,strokeColor:'#ffffff',strokeWeight:1.8}});
   const popup=new google.maps.InfoWindow({content:info(p)});
   marker.addListener('click',()=>popup.open({map,anchor:marker}));markers.push(marker);
   if(p._googleOnly)placesById.set(p.placeId,{marker,popup});
  }
  }catch(e){if(!compact)throw e;mapNotice.textContent='Map markers could not load. Business information remains available above.';return;}
  if(compact)return;
  for(const p of visible.slice(0,100)){
   const row=elt('button');row.type='button';row.className='tp-discovery-result';
   row.append(elt('strong',p.name||'Google-listed business'));
   row.append(elt('span',p.address||p.area||'Location on map'));
   row.append(elt('small','Google Places · '+(p.shopCategory==='spaza'?'Spaza / local shop':p.shopCategory==='wholesale'?'Wholesaler':'Other business')+(compact?' · Email not supplied by Google':' · No matching published Teyza listing')));
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
 async function ensureGoogle(){
  if(google)return google;
  if(googleLoading)return googleLoading;
  const stamp=epoch;
  const task=(async()=>{
   const response=await fetch(CONFIG,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Google Maps is not configured for this site yet. The national Teyza map remains available.');
   const configuration=await response.json();
   const value=configuration?.browserKey;
   if(typeof value!=='string'||!/^AIza[A-Za-z0-9_-]{30,80}$/.test(value))
    throw Error('Google Maps browser configuration is invalid. The national Teyza map remains available.');
   const loadedGoogle=await loadMap(value);if(stamp!==epoch||!active)throw Error('Search closed.');google=loadedGoogle;return google;
  })();googleLoading=task;try{return await task;}finally{if(googleLoading===task)googleLoading=null;}
 }
 async function startMap(){
  if(active)return;
  active=true;const stamp=++epoch;start.disabled=true;
  if(compact){shown=true;search.disabled=false;onReady?.();render();status.textContent=guided?'Choose a province and confirm a town or township.':'Enter a town or township, choose a category, and select Search this area.';if(guided){paintGuide();paintDirectoryQuick();if(province.value!=='All provinces')void loadDirectory();}else if(autoSearch)void searchArea();else if(town.value.trim())autocomplete?.suggest();return;}
  status.textContent='Loading configured Google map…';
  try{
   await ensureGoogle();if(stamp!==epoch||!active)return;
   canvas.style.display='block';map=new google.maps.Map(canvas,{center:SA,zoom:5,mapTypeControl:false});
   shown=true;search.disabled=false;
   status.textContent='Google map ready. Select a province or town and search locally for additional Google-listed businesses.';
   onReady?.();render();
   // One bounded, non-recurring discovery sample gives operators live evidence
   // rather than an empty map. No national background crawling is performed.
   town.value='Durban';province.value='KwaZulu-Natal';category.value='all';
   map.setCenter({lat:-29.8587,lng:31.0218});map.setZoom(11);
   if(autoSearch)void searchArea(true);
  }catch(e){
   if(stamp!==epoch)return;active=false;start.disabled=false;
   if(!start.isConnected)controls.prepend(start);
   status.textContent=e.message||'Google Maps unavailable; the national Teyza map remains available.';
   if(!String(e.message||'').includes('not configured for this site'))report?.(e);
  }
 }
 start.onclick=startMap;
 async function locate(){
  const q=town.value.trim(),p=province.value;
  if(!q&&p==='All provinces'){if(compact)throw Error('Enter a town or township.');return;}
  if(compact){
   const selected=autocomplete?.selected();if(selected)return selected;
   const preset=resolvePilotArea(q,p);if(preset)return preset;
   if(p!=='All provinces'&&resolvePilotArea(q,'All provinces'))throw Error('The named pilot area is in another province. Choose its correct province or All provinces.');
   throw Error('Select the correct South African area from the suggestions before searching.');
  }
  const address=[q,p==='All provinces'?'':p,'South Africa'].filter(Boolean).join(', ');
  const geocoder=new google.maps.Geocoder();
  const matches=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Location lookup timed out. Try a supported pilot town or check the location.')),15000);
   try{geocoder.geocode({address,componentRestrictions:{country:'ZA'}},(results,code)=>{
    clearTimeout(timer);
    if(code==='OK'&&results?.length){resolve(results);return;}
    const status=/^[A-Z_]{2,40}$/.test(String(code))?code:'UNAVAILABLE';
    reject(Error('Could not locate that South African town/municipality ('+status+'). Check the town and province.'));
   });}catch(e){clearTimeout(timer);reject(Error('Location lookup unavailable.'));}
  });
  if(!active)return;const point=matches[0].geometry.location;
  if(compact){
   if(matches[0].partial_match)throw Error('Location only partially matched. Enter a more specific town and province.');
   return {lat:point.lat(),lng:point.lng(),radius:10000,label:matches[0].formatted_address||address};
  }
  if(!map)return;map.setCenter(point);map.setZoom(q?11:7);
 }
 async function searchArea(skipGeocode=false){
  if((compact?!active:!map)||searchPending)return;
  if(guided&&(!guideArea||guideStep===1)){nextHint.textContent='Confirm a community first.';return;}
  const stamp=epoch;searchPending=true;if(compact){resultEpoch++;contactCache.clear();businessFilter.value='';pageSize=pageLength;places=[];searchCompleted=false;searchError='';render();}
  search.disabled=true;if(compact){town.disabled=province.disabled=category.disabled=true;}
  status.textContent=compact?'Searching for businesses in the selected area…':'Searching Google Places around the selected map area…';
  onDiscovery?.({state:'loading',total:0,potential:0,matched:0});
  try{
   const located=guided?guideArea:skipGeocode?null:await locate();if(stamp!==epoch||!active||(!compact&&!map))return;
   const c=compact?located:map.getCenter(),lat=compact?c?.lat:c.lat(),lon=compact?c?.lng:c.lng();
   if(!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('Could not locate the selected town.');
   const radius=compact?(located.radius||10000):20000;
   if(compact){searchedArea=located;center={lat,lng:lon};if(map){try{map.setCenter(center);}catch{mapNotice.textContent='Map could not update. Business information remains available below.';map=null;canvas.style.display='none';}}}
   if(lat < -35||lat > -22||lon < 16||lon > 34)throw Error('Map centre is outside the supported South African bounds.');
   if(!town.value.trim()&&province.value==='All provinces'&&Math.abs(lat-SA.lat)<0.02&&Math.abs(lon-SA.lng)<0.02)
    throw Error('Enter a town (such as Durban) or move the map to a populated area before searching.');
   // Each click is an explicit, bounded regional search. The existing Firebase
   // Places service holds the server key; this browser never accesses it.
   const kinds=category.value==='all'?['spaza','variety','wholesale']:[category.value];
   const searches=await Promise.allSettled(kinds.map(async kind=>{
    const url=new URL(ENDPOINT);
    url.searchParams.set('lat',String(lat));url.searchParams.set('lon',String(lon));
    if(compact)url.searchParams.set('radius',String(radius));else url.searchParams.set('radius','20000');
    url.searchParams.set('category',kind);
    const res=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(55000)});
    if(!res.ok){let detail='';try{const body=await res.json();detail=String(body.error||'').slice(0,120);}catch(_){}
     throw Error(kind+' discovery HTTP '+res.status+(detail?' ('+detail+')':''));}
    const data=await res.json();
    if(!Array.isArray(data.entries))throw Error(kind+' discovery returned no entries array');
    return {entries:data.entries.filter(good),warning:data.warning};
   }));
   if(stamp!==epoch||!active)return;const successful=searches.filter(r=>r.status==='fulfilled');
   if(!successful.length)throw Error(searches.map(r=>r.reason?.message||'Discovery unavailable').join('; '));
   const unique=new Map();let excluded=0;
   for(const item of successful)for(const p of item.value.entries){if(compact&&!withinSearchRadius(p,located)){excluded++;continue;}if(p.placeId&&!unique.has(p.placeId))unique.set(p.placeId,p);}
   places=[...unique.values()];if(guided){guideStep=3;paintGuide();}searchCompleted=true;searchPending=false;render();
   const counts=matchGoogle(places,registered);
   const incomplete=successful.length<kinds.length||successful.some(r=>r.value.warning);
   status.textContent='Google Places returned '+places.length+' nearby listings'+(compact?' within '+(radius/1000)+' km of '+located.label+'. Registration status and email availability are not established.':': '+counts.potential.length+' potential leads, '+counts.linked.length+' matched to Teyza.')+
    (incomplete?' Some searches were incomplete.':'')+(excluded?' '+excluded+' out-of-radius result(s) excluded.':'')+' Results are local and may not be exhaustive.';
  }catch(e){if(stamp!==epoch)return;searchPending=false;status.textContent='Google discovery failed: '+e.message;if(compact){searchError=e.message;render();}
   onDiscovery?.({state:'error',message:e.message,total:0,potential:0,matched:0});report?.(e);}
  finally{if(stamp===epoch){search.disabled=false;if(compact)town.disabled=province.disabled=category.disabled=false;if(guided)paintGuide();}}
 }
 search.onclick=()=>searchArea();
 showT.onchange=render;showG.onchange=render;
 for(const input of Object.values(layers))input.onchange=render;
 return {panel,activate:()=>startMap(),setShops(items){registered=Array.isArray(items)?items.filter(good):[];if(shown)render();},clear(){autocomplete?.clear();resetDirectory();browseCache.clear();searchedArea=null;epoch++;resultEpoch++;contactCache.clear();searchError='';center=null;searchPending=false;clearMarkers();registered=[];places=[];searchCompleted=false;onDiscovery?.({state:'not-searched',total:0,potential:0,matched:0});if(map){for(const m of markers)m.setMap(null);}map=null;google=null;googleLoading=null;shown=false;active=false;canvas.style.display='none';start.disabled=false;search.disabled=true;town.disabled=province.disabled=category.disabled=false;list.replaceChildren();canvas.replaceChildren();mapPanel.open=false;if(start.isConnected)start.remove();}};
}
