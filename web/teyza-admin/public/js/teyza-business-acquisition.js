// Teyza Admin: permission-led direct business onboarding and explicit single-message sending.
const el=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const labels={spaza:'Spaza shop',retail:'Retailer',food:'Food / takeaway',salon:'Salon / barber',service:'Service business',wholesale:'Wholesaler',manufacturer:'Manufacturer',other:'Other business',identified:'Identified',interested:'Interested',registration_started:'Registration started',not_interested:'Not interested',closed:'Closed',owner_inquiry:'Owner inquiry',partner_introduction:'Partner introduction',owner_provided:'Owner-provided contact',permitted_business_directory:'Permitted business directory',in_person:'In-person introduction',other_permitted:'Other permitted source'};
const title=v=>labels[v]||String(v||'').replaceAll('_',' ');
const time=v=>Number.isSafeInteger(v)?new Date(v).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}):'Not recorded';
const cities=['Durban','Johannesburg'],areas={Durban:'Umlazi · KwaMashu · Inanda · Ntuzuma · Clermont · Lamontville · KwaDabeka',Johannesburg:'Soweto · Alexandra · Diepsloot · Orange Farm · Tembisa'};
// Approved master invitation: category-specific benefits remain conditional.
// Keep personalisation in plain text; no external tracking or HTML injection.
const categoryBenefits={
 spaza:['Showcase eligible products, manage prices and stock, and receive supported customer orders.','Discover participating wholesalers, explore trade prices and source stock for your spaza shop.','Explore discounted delivery opportunities where available through participating partners.'],
 retail:['Showcase eligible products, manage prices and stock, and receive supported customer orders.','Explore participating wholesale suppliers and eligible trade offers where available to your business.','Explore discounted delivery opportunities where available through participating partners.'],
 wholesale:['Showcase eligible bulk products, quantities and trade prices to approved participating spaza buyers.','Connect with eligible spaza shops and retailers looking for stock, subject to participating buyer access.','Explore partner delivery options and available savings, subject to terms.'],
 food:['Showcase your food business and available products; receive supported orders where eligible selling tools are enabled.','Explore eligible supplier connections and sourcing opportunities where available.','Explore discounted delivery opportunities where available through participating partners.'],
 salon:['Showcase your salon, its location and available services so nearby customers can discover you.','Receive customer enquiries through supported communication features where available.','Explore eligible business and partner offers as they become available.'],
 service:['Showcase your business location and available services; help local customers discover your business.','Receive enquiries through supported communication features where available.','Explore eligible business and partner offers as they become available.'],
 manufacturer:['Showcase eligible products and business information to potential customers and trade partners.','Explore connections with participating retailers and eligible trade buyers where supported.','Explore partner delivery options and available savings, subject to terms.'],
 other:['Showcase your products or services with eligible business tools.','Explore relevant participating suppliers and business connections where available.','Explore available partner offers and delivery opportunities, subject to eligibility and terms.']
};
const oneLine=v=>String(v??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
export function emailText(kind,p){
 const name=oneLine(p.name)||'Business',area=oneLine(p.area),city=oneLine(p.city);
 if(kind==='welcome')return {
  subject:'Welcome to Teyza – '+name,
  body:['Dear '+name+' Team,','Welcome to Teyza! Thank you for registering '+name+' with us.','Please complete any outstanding profile and verification steps in your own account. Once approved and eligible, your business can become discoverable to customers in your area.','Open the Teyza app and sign in to your own business account. For official download links, a guided app preview and help getting started, visit https://teyza.co.za/for-shop-owners.html.','Our Business Onboarding & Support Team can guide you through your profile, verification and using the platform. Never share your password or verification codes.','Reply to this email or contact support@teyza.co.za / 031 566 1165 whenever you need assistance.','Kind regards,\nTeyza Business Onboarding & Support Team\nTEYZA SA (PTY) LTD\nsupport@teyza.co.za | 031 566 1165\nhttps://teyza.co.za'].join('\n\n')
 };
 if(kind==='membership')return {subject:name+' – Grow with Teyza seller membership',body:['Dear '+name+' Team,','Thank you for registering your business on Teyza. Your approved, eligible business can be discovered through free listing.','Optional seller membership provides eligible product catalogues, stock and price management and supported customer orders. Explore participating suppliers and available delivery opportunities where eligible. The standard full-month membership is R99, subject to the current terms. Sales and savings are not guaranteed.','See current membership terms at https://teyza.co.za/seller-subscriptions.html. Our team can assist you with getting started; reply to this email.','Kind regards,\nTeyza Business Onboarding Team\nsupport@teyza.co.za\nhttps://teyza.co.za','Reply STOP if you prefer not to receive further marketing emails.'].join('\n\n')};
 if(kind!=='invitation')throw Error('Unknown email template.');
 const category=Object.hasOwn(categoryBenefits,p.category)?p.category:'other';
 const [selling,sourcing,savings]=categoryBenefits[category];
 const location=[area,city].filter((s,i,a)=>s&&a.indexOf(s)===i).join(', ');
 return {
  subject:name+' – Grow your business with Teyza',
  body:[
   'Dear '+name+' Team,',
   'We would like to personally invite '+name+' to showcase your business on Teyza — a South African digital marketplace connecting local businesses with customers, wholesalers and service providers.',
   'Our aim is to help businesses'+(location?' in '+location:' like yours')+' grow, reach more customers, access new business opportunities and operate more efficiently through one convenient mobile application.',
   'What are the benefits for '+name+'?',
   [
    '• Greater business exposure: Make your approved, eligible business easier to discover by potential customers in your area.',
    '• '+(['salon','service'].includes(category)?'Showcase your services':category==='wholesale'?'Sell to eligible trade buyers':'Sell directly through the app where eligible')+': '+selling,
    '• '+(['salon','service'].includes(category)?'Customer enquiries':'Connect with suppliers and trade partners')+': '+sourcing,
    '• '+(['salon','service'].includes(category)?'Explore partner opportunities':'Explore available savings')+': '+savings,
    '• Promote your business: Showcase relevant products, services and special offers with eligible features.',
    '• Dedicated business support: Receive assistance from the Teyza team whenever you need help getting started or using the platform.'
   ].join('\n'),
   'Getting started is free!\nThere is no charge to register and verify your business. Additional selling and promotional features are optional and subject to eligibility and applicable terms. Sales, discounts and delivery savings are not guaranteed.',
   'See how your business could look on the Teyza app:\nhttps://teyza.co.za/for-shop-owners.html',
   'Our team would be delighted to personally assist '+name+' with getting started and making the most of the opportunities available through Teyza. Simply reply to this email or contact our Business Onboarding Team.',
   'We look forward to growing together.',
   'Kind regards,\nTeyza Business Onboarding Team\nTEYZA SA (PTY) LTD\nTel: 031 566 1165\nEmail: support@teyza.co.za\nWebsite: https://teyza.co.za',
   'Supporting local businesses. Connecting communities.',
   'Reply STOP if you prefer not to receive further marketing emails.'
  ].join('\n\n')
 };
}

const whatsappBodies=Object.freeze({
 invitation:'Good day {{1}} Team. We invite you to showcase your business on Teyza. Register and verify for free, reach nearby customers, access eligible selling tools and explore participating suppliers and available delivery savings. Learn more: https://teyza.co.za/for-shop-owners.html. Reply for help or STOP to opt out of marketing.',
 welcome:'Welcome to Teyza, {{1}} Team. Thank you for registering. Complete any outstanding verification in your own app account. Our team can help you get started: https://teyza.co.za/for-shop-owners.html. Reply for support.',
 membership:'Good day {{1}} Team. Thank you for registering on Teyza. Optional seller membership unlocks eligible selling features. Standard full-month membership is R99, subject to current terms: https://teyza.co.za/seller-subscriptions.html. Reply for help or STOP to opt out of marketing.'
});
function whatsappText(kind,p){return whatsappBodies[kind]?.replace('{{1}}',()=>oneLine(p.name)||'Business')||'';}
export function emailDraftAllowed(kind,p){
 if(!p.email||p.emailHistory?.[kind]||p.outbound?.['email_'+kind])return false;
 if(kind==='invitation')return !p.optedOut&&p.permissions?.email?.granted===true;
 return kind==='welcome'&&p.seller?.welcomeEmailEligible===true;
}
const stages=['identified','interested','registration_started','not_interested','closed'],channels=['phone','email','whatsapp'];
function statusPill(p){const n=el('span',p.optedOut?'DO NOT CONTACT':title(p.stage),'acq-status');n.dataset.state=p.optedOut?'blocked':p.stage;return n;}
function button(text,click){const b=el('button',text,'button quiet');b.type='button';b.onclick=click;return b;}
function card(t,d){const c=el('section',undefined,'panel ops-card');c.append(el('h3',t));if(d)c.append(el('p',d,'footnote'));return c;}
function input(f,label,name,type='text',required=true,max=240){const l=el('label',label),i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;else i.rows=3;i.name=name;i.required=required;i.maxLength=max;l.append(i);f.append(l);return i;}
function choice(f,label,name,values){const l=el('label',label),s=el('select');s.name=name;s.setAttribute('aria-label',label);for(const v of values){const o=el('option',title(v));o.value=v;s.append(o);}l.append(s);f.append(l);return s;}
function check(f,label,name){const l=el('label',undefined,'confirm-check'),i=el('input');i.type='checkbox';i.name=name;i.required=true;l.append(i,el('span',label));f.append(l);return i;}
function submit(f,label,action){const b=el('button',label,'button primary');b.type='submit';f.append(b);f.onsubmit=e=>{e.preventDefault();if(f.reportValidity())void action(Object.fromEntries(new FormData(f)),b);};}
// Only approved same-origin public media and official destinations. No remote uploads or tracking.
export const acquisitionAssets=Object.freeze([
 {name:'App-first business introduction',description:'Share this link with an opted-in owner to show actual app screens, benefits and official downloads.',href:'/for-shop-owners.html',kind:'page'},
 {name:'Customer discovery preview',description:'Interactive example; the first two app screens are actual Android screenshots.',href:'/for-shop-owners.html#app',kind:'page'},
 {name:'Android download',description:'Official Google Play listing. Availability depends on device and region.',href:'https://play.google.com/store/apps/details?id=com.asiyedriver.asiye',kind:'store'},
 {name:'iPhone download',description:'Official Apple App Store listing. Availability depends on device and region.',href:'https://apps.apple.com/za/app/id6827037733',kind:'store'},
 {name:'Actual Teyza home screen',description:'Existing actual Android app capture.',href:'/assets/app/home.webp',kind:'image'},
 {name:'Actual nearby businesses screen',description:'Existing actual Android app capture; do not represent example shops as newly registered.',href:'/assets/app/nearby-shops.webp',kind:'image'},
 {name:'Spaza owner website artwork',description:'Existing promotional artwork, not proof of a registered business.',href:'/assets/app/spaza-owner.webp',kind:'image'},
 {name:'Teyza brand wordmark',description:'Official website artwork.',href:'/assets/app/wordmark.svg',kind:'image'},
 {name:'Teyza app icon',description:'Official website app icon.',href:'/assets/app/icon.svg',kind:'image'},
 {name:'Seller membership and terms',description:'Optional selling features and applicable conditions.',href:'/seller-subscriptions.html',kind:'page'},
 {name:'Business help and support',description:'Official assistance channel.',href:'/support.html',kind:'page'}
]);
export const acquisitionVideoSlots=Object.freeze([
 {name:'Full narrated business explainer',description:'Original 5:34 narration. Publish only after transcript, synchronization and content review.',href:'/assets/app/teyza-business-explainer.mp4'},
 {name:'Short business introduction',description:'45–60 second outreach version; separate approved edit.',href:'/assets/app/teyza-business-intro.mp4'}
]);
export function isPublishedVideo(response){
 return response.ok&&!response.redirected&&/^video\/mp4(?:\s*;|$)/i.test(response.headers.get('content-type')||'')&&Number(response.headers.get('content-length'))>0;
}
function assetLink(label,href,download=false){
 const a=el('a',label,'button quiet');a.href=href;a.target='_blank';a.rel='noopener noreferrer';if(download)a.download='';return a;
}
function copyAsset(value,notice){return async()=>{try{await navigator.clipboard.writeText(value);notice('Copied approved material. No message sent.','success');}catch{notice('Clipboard unavailable. Open the asset or select and copy the draft manually.','info');}};}
function renderAssets(message){
 const section=card('Marketing & onboarding asset library','Use approved assets consistently. Share only with owners who have agreed to the relevant contact. Original media and unpublished video files are not sent automatically.');
 section.id='acquisition-assets';
 const details=el('details');details.append(el('summary','Open approved marketing & onboarding assets'));
 const assets=el('div');
 for(const a of acquisitionAssets){
  const item=el('div',undefined,'field-area-row');item.append(el('strong',a.name),el('p',a.description,'footnote'));
  item.append(assetLink(a.kind==='image'?'View original artwork':'Open asset',a.href,a.kind==='image'));
  if(a.kind!=='image')item.append(button('Copy link',copyAsset(new URL(a.href,location.origin).href,message)));
  assets.append(item);
 }
 details.append(assets);
 const communications=card('Approved communication templates','Examples only. Personalised invitation and welcome drafts in a business record remain subject to the consent and matching owner-email checks.');
 for(const kind of ['invitation','welcome']){
  const draft=emailText(kind,{name:'[Business Name]',area:'[Township]',city:'[City]',category:'spaza'}),preview=el('details');
  preview.append(el('summary',kind==='invitation'?'Master business invitation – spaza example':'Registration welcome template'));
  const text=el('textarea');text.readOnly=true;text.rows=12;text.value='Subject: '+draft.subject+'\n\n'+draft.body;text.setAttribute('aria-label',kind+' master template');preview.append(text);
  communications.append(preview);
 }
 details.append(communications);
 const help=card('Business-owner quick answers','Registration and verification are free. Approved eligible profiles may appear in local discovery. Product-selling tools require eligibility and an active paid membership. Wholesale offers, delivery savings, orders and discounts depend on available partners and terms; never promise them. Owners retain control of their own account and verification.');
 const pitch=el('textarea');pitch.readOnly=true;pitch.rows=5;pitch.value='Teyza helps local businesses become easier to discover. Registration and verification are free. Eligible selling tools can help you showcase products and receive supported orders. Participating suppliers and partner offers may help with sourcing or delivery. Our team can help you get started in your own app account. Visit https://teyza.co.za/for-shop-owners.html.';pitch.setAttribute('aria-label','Approved business introduction');help.append(pitch,button('Copy business introduction',copyAsset(pitch.value,message)));details.append(help);
 const media=card('Explainer video assets','A video is available here only when the reviewed MP4 has actually been published at its designated official Teyza URL. The original WAV, transcript and editing source remain production files, not public marketing assets.');
 for(const slot of acquisitionVideoSlots){
  const row=el('div',undefined,'field-area-row'),state=el('p','Not published / not verified','footnote'),actions=el('div');
  row.append(el('strong',slot.name),el('p',slot.description,'footnote'),state,actions);
  const verify=button('Check published video',async()=>{
   verify.disabled=true;actions.replaceChildren();state.textContent='Checking official media…';
   try{
    const r=await fetch(slot.href,{method:'HEAD',cache:'no-store',credentials:'same-origin',redirect:'error'});
    if(!isPublishedVideo(r)){state.textContent='Not published / not verified';return;}
    state.textContent='MP4 available on Teyza';
    actions.append(assetLink('Watch video',slot.href),assetLink('Download video',slot.href,true),button('Copy video link',copyAsset(new URL(slot.href,location.origin).href,message)));
   }catch{state.textContent='Not published / not verified';}
   finally{verify.disabled=false;}
  });row.append(verify);media.append(row);
 }
 details.append(media);section.append(details);return section;
}

export function createAcquisitionAdmin({api,onError,message,openSupport}){
 let active=false,serial=0,records=[],next=null,selected=null,detail=null,city='all',query='',statusFilter='all',busy=false,registered=[],registeredNext=null,registeredLoaded=false,modal=null,communications={};
 function clear(){serial++;active=false;records=[];next=null;selected=null;detail=null;query='';city='all';statusFilter='all';busy=false;registered=[];registeredNext=null;registeredLoaded=false;modal=null;communications={};}
 async function refresh(){active=true;const stamp=++serial;const r=await api('ops_acquisition_list');if(!active||stamp!==serial)return;if(r.schema!==1||!Array.isArray(r.prospects))throw Error('Deploy the matching Business Acquisition backend first.');records=r.prospects;next=r.next||null;communications=r.communications||{};selected=null;detail=null;modal=null;}
 async function perform(root,b,fn){if(!active||busy||!root.isConnected)return;const stamp=serial;busy=true;if(b)b.disabled=true;
  try{await fn(stamp);if(active&&serial===stamp&&root.isConnected)render(root);}
  catch(e){if(active&&serial===stamp&&!e.stale){const error=root.querySelector('.acq-dialog[open] .acq-error');if(error){error.hidden=false;error.textContent=e.message||'Could not complete this action.';}onError(e);}}
  finally{if(serial===stamp){busy=false;if(b?.isConnected)b.disabled=false;}}
 }
 async function readDetail(id,stamp){const r=await api('ops_acquisition_detail',{id});if(active&&serial===stamp){selected=id;detail=r;modal='business';records=records.map(x=>x.id===id?r.prospect:x);}}
 function render(root){
  if(!active)return;
  root.querySelector('[data-acquisition]')?.remove();const workspace=el('div');workspace.dataset.acquisition='true';
  const dialog=el('dialog',undefined,'acq-dialog');dialog.setAttribute('aria-label','Business acquisition workspace');
  const modalContent=el('div',undefined,'acq-dialog-content'),bar=el('div',undefined,'acq-dialog-bar'),modalTitle=el('strong','Business acquisition');
  const close=button('Close',()=>{modal=null;dialog.close();});bar.append(modalTitle,close);const err=el('p','', 'acq-error');err.setAttribute('role','alert');err.hidden=true;dialog.append(bar,err,modalContent);
  dialog.addEventListener('cancel',()=>{modal=null;});
  const panels={};function open(name){modal=name;mount();}
  function mount(){if(!modal||!panels[modal])return;modalContent.replaceChildren(panels[modal]);modalTitle.textContent=({add:'New business prospect',assets:'Marketing & onboarding',directory:'Registered businesses',business:'Business record'})[modal]||'Business acquisition';err.hidden=true;if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}

  const intro=card('Direct business onboarding','Pilot cities: Durban and Johannesburg. Discover and invite owners through permitted channels; free registration and verification. Paid selling features are optional. Existing agent and reward records are separate.');
  intro.classList.add('acq-hero');for(const c of cities)intro.append(el('p',c+' — '+areas[c],'footnote'));const actionBar=el('div',undefined,'acq-action-bar');
  const discovery=button('Open national coverage map',()=>document.querySelector('[data-admin-view="map"]')?.click());discovery.classList.add('acq-map');actionBar.append(discovery);
  const source=el('a','Business owner information','button quiet');source.href='/for-shop-owners.html';source.target='_blank';source.rel='noopener noreferrer';actionBar.append(source);
  const add=button('+ Add business prospect',()=>open('add'));add.classList.add('acq-add');actionBar.prepend(add);
  const assetsButton=button('Open marketing & onboarding assets',()=>{panels.assets.querySelector('details').open=true;open('assets');});assetsButton.classList.add('acq-assets');
  actionBar.append(button('Registered businesses',()=>open('directory')),assetsButton);intro.append(actionBar);
  workspace.append(intro);
  const summary=el('div',undefined,'field-admin-metrics');
  for(const [name,value] of [['Prospects loaded',records.length],['Permission recorded',records.filter(p=>!p.optedOut&&Object.values(p.permissions||{}).some(x=>x.granted)).length],['Registration started',records.filter(p=>p.stage==='registration_started').length],['Linked approved businesses',records.filter(p=>p.seller?.status==='approved').length],['Follow-up due',records.filter(p=>!p.optedOut&&p.nextFollowUpAt&&p.nextFollowUpAt<=Date.now()).length],['Do not contact',records.filter(p=>p.optedOut).length],['Invitation logged',records.filter(p=>p.emailHistory?.invitation||p.outbound?.email_invitation?.status==='accepted'||p.outbound?.whatsapp_invitation?.status==='accepted').length],['Welcome logged',records.filter(p=>p.emailHistory?.welcome||p.outbound?.email_welcome?.status==='accepted'||p.outbound?.whatsapp_welcome?.status==='accepted').length],['Help requests open',records.filter(p=>p.help&&p.help.state!=='resolved').length]]){
   const tile=el('div',undefined,'field-stat');tile.dataset.metric=name.toLowerCase().replaceAll(' ','-');tile.append(el('small',name),el('strong',value));summary.append(tile);
  }
  workspace.append(summary,el('p','Counts cover loaded records only; linked approvals reflect existing seller accounts, not necessarily newly acquired businesses.','footnote'));
  panels.assets=renderAssets(message);
  const areaDirectory=card('Businesses already on Teyza','View approved, verified mapped Teyza businesses in the selected neighbourhood. Google-only businesses remain in the coverage map’s current local search; no bulk extraction or contact list is retained.');
  const areaSearch=el('input');areaSearch.type='search';areaSearch.placeholder='City, township or business name';areaSearch.setAttribute('aria-label','Search mapped Teyza businesses');
  const areaRows=el('div'),loaded=el('p',registeredLoaded?'Loaded mapped businesses: '+registered.length+(registeredNext?' (more pages available)':''):'Load the existing Teyza map records to check coverage.','footnote');
  function showMapped(){const q=areaSearch.value.trim().toLowerCase();areaRows.replaceChildren();const found=registered.filter(s=>[s.name,s.area,s.city,s.category].join(' ').toLowerCase().includes(q));
   for(const s of found){const line=el('div',undefined,'field-area-row');line.append(el('strong',s.name),el('span',[s.city,s.area,title(s.category),'Verified mapped business'].filter(Boolean).join(' · ')));areaRows.append(line);}
   if(registeredLoaded&&!found.length)areaRows.append(el('p','No matching mapped businesses in loaded pages.','footnote'));
  }
  const loadMap=button(registeredLoaded?'Refresh mapped businesses':'Load mapped Teyza businesses',()=>perform(root,null,async stamp=>{const r=await api('ops_map_shops',{});if(serial!==stamp)return;registered=r.shops||[];registeredNext=r.next||null;registeredLoaded=true;}));
  areaSearch.oninput=showMapped;areaDirectory.append(loaded,areaSearch,loadMap,areaRows);showMapped();
  if(registeredNext)areaDirectory.append(button('Load more mapped businesses',()=>perform(root,null,async stamp=>{const r=await api('ops_map_shops',{after:registeredNext});if(serial!==stamp)return;registered=[...new Map([...registered,...(r.shops||[])].map(s=>[s.sellerUid,s])).values()];registeredNext=r.next||null;})));
  panels.directory=areaDirectory;
  const create=card('Add business prospect','Record only information you may lawfully retain, from an owner, permitted source or introduction. Public contact details are not marketing permission. Do not enter passwords, ID numbers, bank details or documents.');
  const f=el('form',undefined,'ops-form');
  input(f,'Business name','name','text',true,120);choice(f,'Pilot city','city',cities);input(f,'Township / area','area','text',true,100);input(f,'Business address or landmark','address','text',true,220);
  choice(f,'Business category','category',['spaza','retail','food','salon','service','wholesale','manufacturer','other']);
  input(f,'Business phone (optional)','phone','tel',false,40);input(f,'Business email (optional)','email','email',false,254);
  choice(f,'Source','source',['owner_inquiry','partner_introduction','owner_provided','permitted_business_directory','in_person','other_permitted']);
  input(f,'Source reference / authority to retain details','sourceReference','textarea',true,240);
  check(f,'I confirm Teyza may retain this information for onboarding.','authorisedSource');
  const consentBox=el('fieldset',undefined,'acq-consent');consentBox.append(el('legend','Owner contact permissions (optional)'),el('p','Select only channels the owner has explicitly agreed to. Leave unchecked if permission has not been obtained.','footnote'));
  const emailOpt=check(consentBox,'Owner opted in to email marketing','initialEmail'),waOpt=check(consentBox,'Owner opted in to WhatsApp marketing','initialWhatsApp');emailOpt.required=false;waOpt.required=false;
  const consentNote=input(consentBox,'Evidence of owner permission','initialConsentNote','textarea',false,500);
  const confirmConsent=check(consentBox,'I confirm the owner explicitly opted in to each selected channel.','initialConsentConfirmed');
  function syncConsent(){const on=emailOpt.checked||waOpt.checked;for(const field of [consentNote,confirmConsent]){field.parentElement.hidden=!on;field.disabled=!on;field.required=on;}}
  emailOpt.onchange=waOpt.onchange=syncConsent;syncConsent();f.append(consentBox);
  submit(f,'Save business prospect',(d,b)=>perform(root,b,async stamp=>{const {initialEmail,initialWhatsApp,initialConsentNote,initialConsentConfirmed,...rest}=d;const r=await api('ops_acquisition_create',{...rest,authorisedSource:d.authorisedSource==='on',initialConsentChannels:[initialEmail==='on'?'email':null,initialWhatsApp==='on'?'whatsapp':null].filter(Boolean),initialConsentNote:initialConsentNote||'',initialConsentConfirmed:initialConsentConfirmed==='on'});if(serial!==stamp)return;records=[r.prospect,...records.filter(x=>x.id!==r.prospect.id)];await readDetail(r.prospect.id,stamp);message('Business prospect saved. No message sent.','success');}));
  create.append(f);panels.add=create;
  const list=card('Business prospect register','Search loaded records or filter by pilot city. Follow-up dates and latest activity are saved on the server.');
  const filter=el('div',undefined,'field-query'),search=el('input'),select=el('select');
  search.type='search';search.placeholder='Search business, township or category';search.setAttribute('aria-label','Search business prospects');search.value=query;
  select.setAttribute('aria-label','Filter pilot city');
  for(const [v,t] of [['all','Both pilot cities'],...cities.map(c=>[c,c])]){const o=el('option',t);o.value=v;select.append(o);}select.value=city;
  const status=el('select');status.setAttribute('aria-label','Filter acquisition status');
  const options=[['all','All prospects'],['to_contact','Permission received — contact due'],['registered','Linked registered accounts'],['invited','Invitation recorded'],['welcomed','Welcome recorded'],['help','Needs support'],['blocked','Do not contact']];
  for(const [v,t] of options){const o=el('option',t);o.value=v;status.append(o);}status.value=statusFilter;
  const matchesStatus=p=>statusFilter==='all'||(statusFilter==='to_contact'&&!p.optedOut&&!p.emailHistory?.invitation&&Object.values(p.permissions||{}).some(x=>x.granted))||(statusFilter==='registered'&&p.seller&&p.seller.status!=='review_required')||(statusFilter==='invited'&&p.emailHistory?.invitation)||(statusFilter==='welcomed'&&p.emailHistory?.welcome)||(statusFilter==='help'&&p.help&&p.help.state!=='resolved')||(statusFilter==='blocked'&&p.optedOut);
  const rows=el('div');
  function showRows(){rows.replaceChildren();const q=query.toLowerCase();const matches=records.filter(p=>matchesStatus(p)&&(city==='all'||p.city===city)&&[p.name,p.area,p.address,title(p.category)].join(' ').toLowerCase().includes(q));
   for(const p of matches){const row=el('div',undefined,'field-visit');row.append(el('strong',p.name),el('span',[p.city,p.area,title(p.category)].join(' · ')),statusPill(p),el('span','Last activity: '+time(p.lastActivityAt)+' · Follow-up: '+time(p.nextFollowUpAt)),el('span',p.seller?'Seller: '+title(p.seller.status):'No seller linked'),el('span','Invitation: '+time(p.emailHistory?.invitation?.sentAt)+' · Welcome: '+time(p.emailHistory?.welcome?.sentAt)),el('span',p.help?'Help: '+title(p.help.state):'No help request logged'),button('Open business',()=>perform(root,null,stamp=>readDetail(p.id,stamp))));rows.append(row);}
   if(!matches.length){const empty=el('div',undefined,'acq-empty');empty.append(el('strong','No matching business prospects'),el('p','Start with a business owner enquiry or permitted business introduction.','footnote'),button('+ Add business prospect',()=>open('add')));rows.append(empty);}
  }
  search.oninput=()=>{query=search.value;showRows();};select.onchange=()=>{city=select.value;showRows();};status.onchange=()=>{statusFilter=status.value;showRows();};filter.append(search,select,status);list.append(filter,rows);showRows();
  if(next)list.append(button('Load more businesses',()=>perform(root,null,async stamp=>{const r=await api('ops_acquisition_list',{after:next});if(stamp!==serial)return;records=[...new Map([...records,...r.prospects].map(p=>[p.id,p])).values()];next=r.next||null;})));
  workspace.append(list);
  if(detail&&selected===detail.prospect.id){
   const p=detail.prospect,c=card('Business: '+p.name,'Private onboarding record · '+p.city+' · '+p.area);
   c.append(el('p','Contact: '+[p.phone,p.email].filter(Boolean).join(' · ')),el('p','Source: '+title(p.source)+' — '+p.sourceReference,'footnote'),el('p','Assigned reviewer: '+p.assignedTo+' · Last saved by '+p.lastActivityBy+' · '+time(p.updatedAt),'footnote'));
   c.append(el('strong',p.optedOut?'DO NOT CONTACT':channels.map(x=>title(x)+': '+(p.permissions?.[x]?.granted?'permission recorded':'not recorded')).join(' · ')));
   if(p.seller)c.append(el('p','Linked seller '+p.seller.uid+' · '+title(p.seller.status)+' · '+(p.seller.listed?'Listed':'Listing not confirmed')+'. This workspace does not approve sellers.'));
   const update=el('form',undefined,'ops-form');
   const types=p.optedOut?['progress','help_requested','help_replied','help_resolved']:['progress','permission','contact','opt_out','help_requested','help_replied','help_resolved'];
   const kind=choice(update,'Record activity','type',types);
   const channel=choice(update,'Channel','channel',channels);
   const consent=check(update,'Owner explicitly opted in to this channel.','ownerOptIn');
   const stage=choice(update,'Onboarding stage','stage',stages);stage.value=p.stage;
   const follow=input(update,'Next follow-up date (SAST)','followup','date',false);
   if(p.nextFollowUpAt)follow.value=new Date(p.nextFollowUpAt+7200000).toISOString().slice(0,10);
   input(update,'Activity note / consent evidence (no sensitive documents or credentials)','note','textarea',true,500);
   check(update,'I confirm this records an actual event. No message will be sent.','confirmed');
   function configure(){
    const isContact=['permission','contact','help_requested'].includes(kind.value),isProgress=kind.value==='progress';
    for(const [i,show] of [[channel,isContact],[consent,kind.value==='permission'],[stage,isProgress],[follow,isProgress&&!p.optedOut]]){i.parentElement.hidden=!show;i.disabled=!show;}
   }kind.onchange=configure;configure();
   submit(update,'Save activity',(d,b)=>perform(root,b,async stamp=>{
    const request={id:p.id,revision:p.revision,type:d.type,note:d.note,confirmed:d.confirmed==='on'};
    if(['permission','contact','help_requested'].includes(d.type)){request.channel=d.channel;request.ownerOptIn=d.ownerOptIn==='on';}
    if(d.type==='progress'){request.stage=d.stage;request.nextFollowUpAt=d.followup?Date.parse(d.followup+'T09:00:00+02:00'):null;}
    await api('ops_acquisition_event',request);await readDetail(p.id,stamp);if(serial===stamp)message('Activity saved. No message sent.','success');
   }));
   const activityPanel=el('details',undefined,'acq-secondary');activityPanel.append(el('summary','Record contact permission, follow-up or support activity'),update);
   const linkPanel=el('details',undefined,'acq-secondary');linkPanel.append(el('summary','Link existing registered business'));
   if(!p.seller){
    const link=el('form',undefined,'ops-form');link.append(el('h4','Link an existing seller account'),el('p','Find the exact seller UID in Business accounts. Confirm the business owner identifies this account; registration and verification stay with the owner.','footnote'));
    input(link,'Existing seller UID','sellerUid','text',true,128);
    check(link,'Owner confirmed this exact business account.','ownerConfirmed');
    submit(link,'Link seller account',(d,b)=>perform(root,b,async stamp=>{await api('ops_acquisition_link',{id:p.id,revision:p.revision,sellerUid:d.sellerUid,ownerConfirmed:d.ownerConfirmed==='on'});await readDetail(p.id,stamp);if(serial===stamp)message('Seller account linked. No approval changed.','success');}));linkPanel.append(link);
   }
   const direct=card('Send a message','Select the channel and message. Review the exact recipient and approved personalised content. A single click queues a message only when the provider is enabled. Provider acceptance is not delivery.');direct.classList.add('acq-communications');
   const refreshStatus=button('Refresh send history',()=>perform(root,null,stamp=>readDetail(p.id,stamp)));direct.append(refreshStatus);
   for(const channel of ['email','whatsapp']){
    const block=el('section',undefined,'acq-channel '+(channel==='email'?'acq-email':'acq-whatsapp'));block.append(el('h4',channel==='email'?'Email · Zoho Mail':'WhatsApp · Business Platform'));
    const destination=channel==='email'?p.email:p.phone;block.append(el('p','Recipient: '+(destination||'Not recorded'),'footnote'));
    for(const kind of ['invitation','welcome','membership']){
     const job=p.outbound?.[channel+'_'+kind],legacy=channel==='email'&&p.emailHistory?.[kind];
     const label=kind==='invitation'?'Invite to Teyza':kind==='welcome'?'Welcome to Teyza':'Membership invitation';
     const wrap=el('details',undefined,'acq-message');wrap.append(el('summary',label+(job?' · '+title(job.status):legacy?' · recorded sent':'')));
     if(job||legacy){const state=job?.status||legacy.status;wrap.append(el('p','Status: '+title(state)+' · '+time(job?.acceptedAt||job?.updatedAt||legacy?.sentAt),'acq-status'));if(job&&['sending','review_required','cancelled'].includes(state))wrap.append(el('p','Do not resend blindly. Review the provider and recorded status.','footnote'));block.append(wrap);continue;}
     const permitted=!!destination&&(channel==='email'&&kind==='welcome'||!p.optedOut&&p.permissions?.[channel]?.granted===true)&&
      (kind==='invitation'?!p.seller:kind==='welcome'?(channel==='email'?p.seller?.welcomeEmailEligible:p.seller?.welcomeWhatsAppEligible):p.seller?.membershipEligible&&(channel==='email'?p.seller?.welcomeEmailEligible:p.seller?.welcomeWhatsAppEligible));
     if(!permitted){wrap.append(el('p','Check recorded consent, recipient and business account eligibility first.','footnote'));block.append(wrap);continue;}
     const enabled=communications[channel]?.[kind]===true;
     const draft=channel==='email'?emailText(kind,p):{body:whatsappText(kind,p)};
     const preview=el('textarea');preview.readOnly=true;preview.rows=channel==='email'?12:5;preview.value=(draft.subject?'Subject: '+draft.subject+'\n\n':'')+draft.body;preview.setAttribute('aria-label',channel+' '+kind+' send preview');wrap.append(preview);
     if(!enabled)wrap.append(el('p','Direct '+channel+' not configured for this message. Connect the approved provider first.','footnote'));
     const form=el('form',undefined,'ops-form');const confirmed=check(form,'I reviewed the recipient and message. Send this one message.','confirmed');
     submit(form,channel==='email'?'Send email':'Send WhatsApp',(d,b)=>perform(root,b,async stamp=>{await api('ops_acquisition_send',{id:p.id,revision:p.revision,channel,kind,confirmed:d.confirmed==='on'});await readDetail(p.id,stamp);if(serial===stamp)message('Message queued. Refresh send history for provider status.','success');}));
     if(!enabled){confirmed.disabled=true;form.querySelector('button').disabled=true;}
     wrap.append(form);block.append(wrap);if(kind==='invitation'&&!p.seller&&permitted)wrap.open=true;
    }
    direct.append(block);
   }
   c.append(direct,activityPanel);if(!p.seller)c.append(linkPanel);
   const mailPanel=card('Business email desk','Manual fallback only. Use Zoho Sent to record emails sent outside Admin. Do not send another message if a direct send is already recorded.');
   const zoho=el('a','Open Zoho Workplace','button quiet');zoho.href='https://workplace.zoho.com/';zoho.target='_blank';zoho.rel='noopener noreferrer';mailPanel.append(zoho);
   for(const kind of ['invitation','welcome']){
    const entry=p.emailHistory?.[kind]||p.outbound?.['email_'+kind],box=el('section',undefined,'panel ops-card');box.append(el('h4',kind==='invitation'?'Business invitation':'Registration welcome'));
    if(entry){box.append(el('p','Recorded status: '+title(entry.status)+' · '+time(entry.sentAt||entry.updatedAt),'footnote'));mailPanel.append(box);continue;}
    const allowed=emailDraftAllowed(kind,p);
    if(!allowed){box.append(el('p',kind==='invitation'?'Record email consent first; no invitation for opted-out contacts.':'Link the genuine registered seller first. Its owner email must match this record.','footnote'));mailPanel.append(box);continue;}
    const draft=emailText(kind,p),compose=el('textarea');compose.rows=14;compose.readOnly=true;compose.value='Subject: '+draft.subject+'\n\n'+draft.body;compose.setAttribute('aria-label',kind+' email draft');box.append(el('p','Recipient: '+p.email),compose,button('Copy '+kind+' email',async()=>{compose.focus();compose.select();try{await navigator.clipboard.writeText(compose.value);message('Draft copied; nothing sent.','success');}catch{message('Draft selected. Use Ctrl+C.','info');}}));
    const log=el('form',undefined,'ops-form');
    input(log,'Actual sent date and time (SAST)','sentAt','datetime-local');
    input(log,'Zoho Sent reference (message ID or subject/reference)','reference','text',true,180);
    input(log,'Sent record note','note','textarea',true,500);
    check(log,'I checked the matching recipient and message in Zoho Sent.','sentConfirmed');
    submit(log,'Record '+kind+' sent',(d,b)=>perform(root,b,async stamp=>{await api('ops_acquisition_event',{id:p.id,revision:p.revision,type:'email_sent',kind,sentAt:Date.parse(d.sentAt+'+02:00'),reference:d.reference,note:d.note,sentConfirmed:d.sentConfirmed==='on',confirmed:true});await readDetail(p.id,stamp);if(serial===stamp)message('Email history saved. Delivery not verified.','success');}));
    box.append(log);mailPanel.append(box);
   }
   const manual=el('details',undefined,'acq-secondary');manual.append(el('summary','Manual Zoho mail and Sent records'),mailPanel);c.append(manual);
   const help=card('Business help and support','Record owner-initiated requests, actual responses and resolutions using the activity form. Marketing opt-out does not prevent responding to a genuine support request.');
   help.append(el('p',p.help?'Current request: '+title(p.help.state)+' · '+title(p.help.channel)+' · Updated '+time(p.help.updatedAt):'No onboarding help request logged.'));
   for(const ticket of detail.support||[]){const line=el('div',undefined,'field-area-row');line.append(el('strong',ticket.subject),el('span',title(ticket.status)+' · '+time(ticket.updatedAt)));help.append(line);}
   if(detail.moreSupport)help.append(el('p','Additional linked support cases exist. Open the support inbox.','footnote'));
   help.append(button('Open seller support inbox',()=>openSupport?.(p.name)));
   c.append(help);
   const history=el('details',undefined,'acq-secondary');history.append(el('summary','Recent activity history'));
   for(const e of detail.events||[]){const row=el('div',undefined,'field-area-row');row.append(el('strong',title(e.type)),el('span',time(e.createdAt)+' · '+e.actorUid),el('p',[e.channel?title(e.channel):'',e.note||''].filter(Boolean).join(' · ')));history.append(row);}
   if(detail.moreEvents)history.append(el('p','Showing the latest 25 events; older records remain stored.','footnote'));
   c.append(history);panels.business=c;
  }
  workspace.append(dialog);root.append(workspace);mount();
 }
 return {clear,refresh,render};
}
