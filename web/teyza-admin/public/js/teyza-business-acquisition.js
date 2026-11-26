// Teyza Admin: permission-led direct business onboarding; no outbound send action.
const el=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const labels={spaza:'Spaza shop',retail:'Retailer',food:'Food / takeaway',salon:'Salon / barber',service:'Service business',wholesale:'Wholesaler',manufacturer:'Manufacturer',other:'Other business',identified:'Identified',interested:'Interested',registration_started:'Registration started',not_interested:'Not interested',closed:'Closed',owner_inquiry:'Owner inquiry',partner_introduction:'Partner introduction',owner_provided:'Owner-provided contact',permitted_business_directory:'Permitted business directory',in_person:'In-person introduction',other_permitted:'Other permitted source'};
const title=v=>labels[v]||String(v||'').replaceAll('_',' ');
const time=v=>Number.isSafeInteger(v)?new Date(v).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}):'Not recorded';
const cities=['Durban','Johannesburg'],areas={Durban:'Umlazi · KwaMashu · Inanda · Ntuzuma · Clermont · Lamontville · KwaDabeka',Johannesburg:'Soweto · Alexandra · Diepsloot · Orange Farm · Tembisa'};
const stages=['identified','interested','registration_started','not_interested','closed'],channels=['phone','email','whatsapp'];
function button(text,click){const b=el('button',text,'button quiet');b.type='button';b.onclick=click;return b;}
function card(t,d){const c=el('section',undefined,'panel ops-card');c.append(el('h3',t));if(d)c.append(el('p',d,'footnote'));return c;}
function input(f,label,name,type='text',required=true,max=240){const l=el('label',label),i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;else i.rows=3;i.name=name;i.required=required;i.maxLength=max;l.append(i);f.append(l);return i;}
function choice(f,label,name,values){const l=el('label',label),s=el('select');s.name=name;for(const v of values){const o=el('option',title(v));o.value=v;s.append(o);}l.append(s);f.append(l);return s;}
function check(f,label,name){const l=el('label',undefined,'confirm-check'),i=el('input');i.type='checkbox';i.name=name;i.required=true;l.append(i,el('span',label));f.append(l);return i;}
function submit(f,label,action){const b=el('button',label,'button primary');b.type='submit';f.append(b);f.onsubmit=e=>{e.preventDefault();if(f.reportValidity())void action(Object.fromEntries(new FormData(f)),b);};}
export function createAcquisitionAdmin({api,onError,message}){
 let active=false,serial=0,records=[],next=null,selected=null,detail=null,city='all',query='',busy=false;
 function clear(){serial++;active=false;records=[];next=null;selected=null;detail=null;query='';city='all';busy=false;}
 async function refresh(){active=true;const stamp=++serial;const r=await api('ops_acquisition_list');if(!active||stamp!==serial)return;if(r.schema!==1||!Array.isArray(r.prospects))throw Error('Deploy the matching Business Acquisition backend first.');records=r.prospects;next=r.next||null;selected=null;detail=null;}
 async function perform(root,b,fn){if(!active||busy||!root.isConnected)return;const stamp=serial;busy=true;if(b)b.disabled=true;
  try{await fn(stamp);if(active&&serial===stamp&&root.isConnected)render(root);}
  catch(e){if(active&&serial===stamp&&!e.stale)onError(e);}
  finally{if(serial===stamp){busy=false;if(b?.isConnected)b.disabled=false;}}
 }
 async function readDetail(id,stamp){const r=await api('ops_acquisition_detail',{id});if(active&&serial===stamp){selected=id;detail=r;records=records.map(x=>x.id===id?r.prospect:x);}}
 function render(root){
  if(!active)return;
  root.querySelector('[data-acquisition]')?.remove();const workspace=el('div');workspace.dataset.acquisition='true';
  const intro=card('Direct business onboarding','Pilot cities: Durban and Johannesburg. Discover and invite owners through permitted channels; free registration and verification. Paid selling features are optional. Existing agent and reward records are separate.');
  for(const c of cities)intro.append(el('p',c+' — '+areas[c],'footnote'));
  const discovery=button('Open national coverage map',()=>document.querySelector('[data-admin-view="map"]')?.click());intro.append(discovery);
  const source=el('a','Business owner information','button quiet');source.href='/for-shop-owners.html';source.target='_blank';source.rel='noopener noreferrer';intro.append(source);
  workspace.append(intro);
  const summary=el('div',undefined,'field-admin-metrics');
  for(const [name,value] of [['Prospects loaded',records.length],['Permission recorded',records.filter(p=>!p.optedOut&&Object.values(p.permissions||{}).some(x=>x.granted)).length],['Registration started',records.filter(p=>p.stage==='registration_started').length],['Linked approved businesses',records.filter(p=>p.seller?.status==='approved').length],['Follow-up due',records.filter(p=>!p.optedOut&&p.nextFollowUpAt&&p.nextFollowUpAt<=Date.now()).length],['Do not contact',records.filter(p=>p.optedOut).length]]){
   const tile=el('div',undefined,'field-stat');tile.append(el('small',name),el('strong',value));summary.append(tile);
  }
  workspace.append(summary,el('p','Counts cover loaded records only; linked approvals reflect existing seller accounts, not necessarily newly acquired businesses.','footnote'));
  const create=card('Add business prospect','Record only information you may lawfully retain, from an owner, permitted source or introduction. Public contact details are not marketing permission. Do not enter passwords, ID numbers, bank details or documents.');
  const f=el('form',undefined,'ops-form');
  input(f,'Business name','name','text',true,120);choice(f,'Pilot city','city',cities);input(f,'Township / area','area','text',true,100);input(f,'Business address or landmark','address','text',true,220);
  choice(f,'Business category','category',['spaza','retail','food','salon','service','wholesale','manufacturer','other']);
  input(f,'Business phone (optional)','phone','tel',false,40);input(f,'Business email (optional)','email','email',false,254);
  choice(f,'Source','source',['owner_inquiry','partner_introduction','owner_provided','permitted_business_directory','in_person','other_permitted']);
  input(f,'Source reference / authority to retain details','sourceReference','textarea',true,240);
  check(f,'I confirm Teyza may retain this information for onboarding.','authorisedSource');
  submit(f,'Save business prospect',(d,b)=>perform(root,b,async stamp=>{const r=await api('ops_acquisition_create',{...d,authorisedSource:d.authorisedSource==='on'});if(serial!==stamp)return;records=[r.prospect,...records.filter(x=>x.id!==r.prospect.id)];await readDetail(r.prospect.id,stamp);message('Business prospect saved. No message sent.','success');}));
  create.append(f);workspace.append(create);
  const list=card('Business prospect register','Search loaded records or filter by pilot city. Follow-up dates and latest activity are saved on the server.');
  const filter=el('div',undefined,'field-query'),search=el('input'),select=el('select');
  search.type='search';search.placeholder='Search business, township or category';search.setAttribute('aria-label','Search business prospects');search.value=query;
  select.setAttribute('aria-label','Filter pilot city');
  for(const [v,t] of [['all','Both pilot cities'],...cities.map(c=>[c,c])]){const o=el('option',t);o.value=v;select.append(o);}select.value=city;
  const rows=el('div');
  function showRows(){rows.replaceChildren();const q=query.toLowerCase();const matches=records.filter(p=>(city==='all'||p.city===city)&&[p.name,p.area,p.address,title(p.category)].join(' ').toLowerCase().includes(q));
   for(const p of matches){const row=el('div',undefined,'field-visit');row.append(el('strong',p.name),el('span',[p.city,p.area,title(p.category)].join(' · ')),el('span',p.optedOut?'DO NOT CONTACT':title(p.stage)),el('span','Last activity: '+time(p.lastActivityAt)+' · Follow-up: '+time(p.nextFollowUpAt)),el('span',p.seller?'Seller: '+title(p.seller.status):'No seller linked'),button('Open business',()=>perform(root,null,stamp=>readDetail(p.id,stamp))));rows.append(row);}
   if(!matches.length)rows.append(el('p','No matching business prospects.','footnote'));
  }
  search.oninput=()=>{query=search.value;showRows();};select.onchange=()=>{city=select.value;showRows();};filter.append(search,select);list.append(filter,rows);showRows();
  if(next)list.append(button('Load more businesses',()=>perform(root,null,async stamp=>{const r=await api('ops_acquisition_list',{after:next});if(stamp!==serial)return;records=[...new Map([...records,...r.prospects].map(p=>[p.id,p])).values()];next=r.next||null;})));
  workspace.append(list);
  if(detail&&selected===detail.prospect.id){
   const p=detail.prospect,c=card('Business: '+p.name,'Private onboarding record · '+p.city+' · '+p.area);
   c.append(el('p','Contact: '+[p.phone,p.email].filter(Boolean).join(' · ')),el('p','Source: '+title(p.source)+' — '+p.sourceReference,'footnote'),el('p','Assigned reviewer: '+p.assignedTo+' · Last saved by '+p.lastActivityBy+' · '+time(p.updatedAt),'footnote'));
   c.append(el('strong',p.optedOut?'DO NOT CONTACT':channels.map(x=>title(x)+': '+(p.permissions?.[x]?.granted?'permission recorded':'not recorded')).join(' · ')));
   if(p.seller)c.append(el('p','Linked seller '+p.seller.uid+' · '+title(p.seller.status)+' · '+(p.seller.listed?'Listed':'Listing not confirmed')+'. This workspace does not approve sellers.'));
   const update=el('form',undefined,'ops-form');
   const types=p.optedOut?['progress']:['progress','permission','contact','opt_out'];
   const kind=choice(update,'Record activity','type',types);
   const channel=choice(update,'Channel','channel',channels);
   const consent=check(update,'Owner explicitly opted in to this channel.','ownerOptIn');
   const stage=choice(update,'Onboarding stage','stage',stages);stage.value=p.stage;
   const follow=input(update,'Next follow-up date (SAST)','followup','date',false);
   if(p.nextFollowUpAt)follow.value=new Date(p.nextFollowUpAt+7200000).toISOString().slice(0,10);
   input(update,'Activity note / consent evidence (no sensitive documents or credentials)','note','textarea',true,500);
   check(update,'I confirm this records an actual event. No message will be sent.','confirmed');
   function configure(){
    const isContact=['permission','contact'].includes(kind.value),isProgress=kind.value==='progress';
    for(const [i,show] of [[channel,isContact],[consent,kind.value==='permission'],[stage,isProgress],[follow,isProgress&&!p.optedOut]]){i.parentElement.hidden=!show;i.disabled=!show;}
   }kind.onchange=configure;configure();
   submit(update,'Save activity',(d,b)=>perform(root,b,async stamp=>{
    const request={id:p.id,revision:p.revision,type:d.type,note:d.note,confirmed:d.confirmed==='on'};
    if(['permission','contact'].includes(d.type)){request.channel=d.channel;request.ownerOptIn=d.ownerOptIn==='on';}
    if(d.type==='progress'){request.stage=d.stage;request.nextFollowUpAt=d.followup?Date.parse(d.followup+'T09:00:00+02:00'):null;}
    await api('ops_acquisition_event',request);await readDetail(p.id,stamp);if(serial===stamp)message('Activity saved. No message sent.','success');
   }));
   c.append(update);
   if(!p.seller){
    const link=el('form',undefined,'ops-form');link.append(el('h4','Link an existing seller account'),el('p','Find the exact seller UID in Business accounts. Confirm the business owner identifies this account; registration and verification stay with the owner.','footnote'));
    input(link,'Existing seller UID','sellerUid','text',true,128);
    check(link,'Owner confirmed this exact business account.','ownerConfirmed');
    submit(link,'Link seller account',(d,b)=>perform(root,b,async stamp=>{await api('ops_acquisition_link',{id:p.id,revision:p.revision,sellerUid:d.sellerUid,ownerConfirmed:d.ownerConfirmed==='on'});await readDetail(p.id,stamp);if(serial===stamp)message('Seller account linked. No approval changed.','success');}));c.append(link);
   }
   c.append(el('h4','Recent activity history'));
   for(const e of detail.events||[]){const row=el('div',undefined,'field-area-row');row.append(el('strong',title(e.type)),el('span',time(e.createdAt)+' · '+e.actorUid),el('p',[e.channel?title(e.channel):'',e.note||''].filter(Boolean).join(' · ')));c.append(row);}
   if(detail.moreEvents)c.append(el('p','Showing the latest 25 events; older records remain stored.','footnote'));
   workspace.append(c);
  }
  root.append(workspace);
 }
 return {clear,refresh,render};
}
