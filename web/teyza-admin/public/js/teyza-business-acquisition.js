// Teyza Admin: permission-led direct business onboarding and explicit single-message sending.
const el=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const labels={spaza:'Spaza shop',retail:'Retailer',food:'Food / takeaway',salon:'Salon / barber',service:'Service business',wholesale:'Wholesaler',manufacturer:'Manufacturer',other:'Other business',identified:'Identified',interested:'Interested',registration_started:'Registration started',not_interested:'Not interested',closed:'Closed',owner_inquiry:'Owner inquiry',partner_introduction:'Partner introduction',owner_provided:'Owner-provided contact',permitted_business_directory:'Permitted business directory',in_person:'In-person introduction',other_permitted:'Other permitted source'};
const title=v=>labels[v]||String(v||'').replaceAll('_',' ');
const time=v=>Number.isSafeInteger(v)?new Date(v).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}):'Not recorded';
const provinces=['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'],cities=['Durban','Johannesburg'],areas={Durban:'Umlazi · KwaMashu · Inanda · Ntuzuma · Clermont · Lamontville · KwaDabeka',Johannesburg:'Soweto · Alexandra · Diepsloot · Orange Farm · Tembisa'};
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
export function safeBusinessWebsite(value){
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname.includes('.')?url.href:null;}catch{return null;}
}
export function savedWhatsAppCheck(value){
 const raw=String(value||'').replace(/[\s().-]/g,'');
 const digits=/^0\d{9}$/.test(raw)?'27'+raw.slice(1):/^\+27\d{9}$/.test(raw)?raw.slice(1):/^27\d{9}$/.test(raw)?raw:null;
 return digits?'https://wa.me/'+digits:null;
}
const oneLine=v=>String(v??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
export function whatsappInvitationDraft(p){
 const name=oneLine(p.name).slice(0,120)||'Business',area=oneLine(p.area||p.city).slice(0,120)||'your area';
 return ['Hi '+name+' team! 👋','We came across your business while exploring '+area+', and we’d love to help more local customers discover you.','With Teyza, you can showcase your business, products or services and make it easier for customers to find you.','Getting started is FREE — there is no charge to register and verify your business. Optional selling and promotional features are available.','📲 Download Teyza for free:\nAndroid (Google Play): https://play.google.com/store/apps/details?id=com.asiyedriver.asiye\niPhone (App Store): https://apps.apple.com/za/app/id6827037733','Need help getting started? Simply reply to this message and our team will guide you.','Let’s grow local businesses together!','Teyza Business Onboarding Team','Reply STOP if you prefer not to receive further marketing messages.'].join('\n\n');
}
export function manualWhatsappDraftUrl(p){
 const wa=savedWhatsAppCheck(p?.phone);
 if(!wa||p.optedOut||priorInvitation(p)||p.lastWhatsAppContactAt||p.permissions?.whatsapp?.granted!==true)return null;
 const u=new URL(wa);u.searchParams.set('text',whatsappInvitationDraft(p));return u.href;
}
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
 if(kind==='invitation')return !p.optedOut&&!priorInvitation(p)&&p.permissions?.email?.granted===true;
 return kind==='welcome'&&p.seller?.welcomeEmailEligible===true;
}
const stages=['identified','interested','registration_started','not_interested','closed'],channels=['phone','email','whatsapp'];
const wasAccepted=(p,k)=>!!p.emailHistory?.[k]||['email','whatsapp'].some(c=>p.outbound?.[c+'_'+k]?.status==='accepted');
const hasRequested=(p,k)=>['email','whatsapp'].some(c=>!!p.outbound?.[c+'_'+k])||!!p.emailHistory?.[k];
const communicationLabel=(p,k)=>wasAccepted(p,k)?'Accepted / recorded':hasRequested(p,k)?'Check send status':'Not recorded';
// Search first-party, independently sourced prospect records only. Google data is
// displayed in a separate, ephemeral map/list; it is not imported into these records.
export function acquisitionContactNote(p){
 return p.contactNote||(!p.phone&&!p.email?'No phone number or email recorded — field visit / manual enquiry':
 p.phoneKind==='whatsapp_only'?'No voice phone number — WhatsApp only':!p.phone?'No phone number — email available':'');
}
const hasContact=p=>Boolean(p.phone||p.email);
const locationText=p=>[p.province,p.municipality,p.city,p.township||p.area,title(p.category)].filter((v,i,a)=>v&&a.indexOf(v)===i).join(' · ');
const confirmedContact=p=>Boolean(p.contactedAt||p.emailHistory?.invitation?.sentAt);
const outreachRecorded=p=>confirmedContact(p)||Boolean(p.providerAcceptedAt)||wasAccepted(p,'invitation');
const priorInvitation=p=>Boolean(outreachRecorded(p)||p.invitationRequested||p.historyNeedsReview||hasRequested(p,'invitation')||p.response||p.downloadConfirmedAt||p.seller||p.stage&&p.stage!=='identified');
const newContact=p=>Array.isArray(p.workQueues)?p.workQueues.includes('new_contact'):!p.optedOut&&hasContact(p)&&!priorInvitation(p);
export function matchesAcquisitionContact(p,search='',channel='all',readyOnly=false){
 const hasEmail=typeof p.email==='string'&&!!p.email.trim(),hasPhone=typeof p.phone==='string'&&!!p.phone.trim();
 if(channel==='contactable'&&!newContact(p)||channel==='email'&&!hasEmail||channel==='whatsapp'&&!hasPhone||channel==='whatsapp_only'&&(!hasPhone||p.phoneKind!=='whatsapp_only')||channel==='manual'&&(hasEmail||hasPhone||p.optedOut))return false;
 const terms=oneLine(search).toLowerCase().split(/\s+/).filter(Boolean);
 const hay=[p.name,p.province,p.municipality,p.city,p.area,p.township,p.localityId,p.address,p.website,p.phone,p.email,title(p.category)].map(oneLine).join(' ').toLowerCase();
 if(!terms.every(t=>hay.includes(t)))return false;
 const readyEmail=hasEmail&&p.permissions?.email?.granted===true,readyPhone=hasPhone&&p.permissions?.whatsapp?.granted===true;
 return !readyOnly||(!p.optedOut&&(channel==='email'?readyEmail:['whatsapp','whatsapp_only'].includes(channel)?readyPhone:channel==='manual'?false:readyEmail||readyPhone));
}
export function communicationPermitted(p,channel,kind){
 const destination=channel==='email'?p.email:p.phone;
 if(!destination||p.outbound?.[channel+'_'+kind]||(channel==='email'&&p.emailHistory?.[kind]))return false;
 if(!(channel==='email'&&kind==='welcome')&&(p.optedOut||p.permissions?.[channel]?.granted!==true))return false;
 const recipientMatches=channel==='email'?p.seller?.welcomeEmailEligible:p.seller?.welcomeWhatsAppEligible;
 return kind==='invitation'?!priorInvitation(p):kind==='welcome'?recipientMatches===true:kind==='membership'?recipientMatches===true&&p.seller?.membershipEligible===true:false;
}
export function nextCommunication(p,channel,capabilities){
 const kinds=p.seller?['welcome','membership']:['invitation'];
 for(const kind of kinds)if(capabilities?.[channel]?.[kind]===true&&communicationPermitted(p,channel,kind))return kind;
 return null;
}
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


// Exact server snapshot protocol. Totals are unavailable until every cursor
// page succeeds; never sum only the currently loaded prospect rows.
export const NATIONAL_FUNNEL=Object.freeze([
 ['discovered','Saved discoveries',''],['contactable','Contact details available','contactable'],['readyToContact','Ready to contact today','ready_to_contact'],['contacted','Contact recorded / provider accepted','contacted'],['responded','Owner responded','responded'],['downloads','Owner-confirmed downloads','downloaded'],['registered','Linked registrations','registered'],['awaitingApproval','Submitted for approval review','pending_approval'],['approved','Approved businesses','approved'],['paidSellers','Verified paid sellers','paid_seller'],['activeAdvertisers','Verified active paid advertisers','active_advertiser'],['payingBusinesses','Unique paying businesses','paying'],
 ['staffConfirmedContact','Staff-confirmed contacts','contacted'],['providerAccepted','Provider accepted (not delivery)','contacted'],['activePaidCampaigns','Active paid campaigns','active_advertiser'],['sellingAccessNotPaid','Selling access, not paid',''],['advertisingInterest','Advertising interest',''],['sellingInterest','Selling interest','']
]);
export const NATIONAL_QUEUES=Object.freeze([
 ['new_contact','New contacts'],['ready_to_contact','Contact today — permission recorded'],['permission_needed','Contact permission needed'],['field_visit','No phone or email — field visits'],['awaiting_response','Awaiting owner response'],['registration_help','Download / registration assistance'],['pending_approval','Submitted for approval review'],['advertising_opportunity','Advertising opportunities'],['seller_opportunity','Seller subscription opportunities'],['follow_up_due','Follow-ups due today'],['geography_review','Geography needs review'],['history_review','Historical outreach needs review'],['message_review','Message / advertising reconciliation'],['blocked','Do not contact'],
 ['contactable','Contact details available'],['contacted','Contact recorded / provider accepted'],['responded','Owner responded'],['downloaded','Owner-confirmed downloads'],['registered','Linked registrations'],['approved','Approved businesses'],['paid_seller','Verified paid sellers'],['active_advertiser','Verified active paid advertisers'],['paying','Unique paying businesses']
]);
const FILTER_KEYS=['province','category','queue','municipality','township','municipalityCode','localityId','search'];
const normalizedFilters=value=>Object.fromEntries(FILTER_KEYS.map(k=>[k,String(value?.[k]||'').trim()]));
export function emptyCommandReport(){return {asOf:null,scanned:0,counts:{funnel:Object.fromEntries(NATIONAL_FUNNEL.map(([k])=>[k,0])),queues:Object.fromEntries(NATIONAL_QUEUES.map(([k])=>[k,0]))},next:null,complete:false};}
export function mergeCommandPage(previous,page,filters,{after=null,includeRows=true}={}){
 const fail=()=>{throw Error('Incomplete or inconsistent national snapshot. Refresh before using totals.');};
 if(page?.schema!==2||!Number.isSafeInteger(page.asOf)||page.asOf<=0||previous.asOf!==null&&previous.asOf!==page.asOf||!Number.isInteger(page.scanned)||page.scanned<0||page.scanned>(includeRows?30:60)||!page.filters||
  FILTER_KEYS.some(k=>page.filters[k]!==normalizedFilters(filters)[k])||typeof page.complete!=='boolean'||page.complete!==(page.next===null)||
  page.next!==null&&(!/^[A-Za-z0-9_-]{1,128}$/.test(page.next)||page.next===after||page.scanned===0)||
  !Array.isArray(page.prospects)||page.prospects.length>page.scanned||!includeRows&&page.prospects.length!==0||
  new Set(page.prospects.map(p=>p.id)).size!==page.prospects.length)fail();
 const next=emptyCommandReport();next.asOf=page.asOf;next.scanned=previous.scanned+page.scanned;next.next=page.next;next.complete=page.complete;
 for(const group of ['funnel','queues']){
  const keys=Object.keys(previous.counts[group]);
  if(!page.counts?.[group]||Object.keys(page.counts[group]).length!==keys.length)fail();
  for(const key of keys){
   const value=page.counts[group][key];
   if(!Number.isSafeInteger(value)||value<0||key!=='activePaidCampaigns'&&value>page.scanned)fail();
   const total=previous.counts[group][key]+value;if(!Number.isSafeInteger(total))fail();next.counts[group][key]=total;
  }
 }
 const f=page.counts.funnel;if(f.discovered>page.scanned||f.payingBusinesses>f.approved||f.paidSellers>f.payingBusinesses||f.activeAdvertisers>f.payingBusinesses||f.activePaidCampaigns<f.activeAdvertisers||f.awaitingApproval>f.registered||f.approved>f.registered)fail();
 return next;
}

export function createAcquisitionAdmin({api:request,onError,message,openSupport}){
 let active=false,serial=0,records=[],next=null,selected=null,detail=null,city='all',businessTypeFilter='all',query='',statusFilter='all',busy=false,registered=[],registeredNext=null,registeredLoaded=false,modal=null,communications={},lookupQuery='',lookupChannel='contactable',lookupReady=false,lookupSelection=null,focusMessage=null,liveDiscovery=null,discoveryEpoch=0,newArea='';
 let commandEpoch=0,commandPaint=null,commandFilters=normalizedFilters({queue:'new_contact'}),command=null;
 const blankCommand=(status='idle')=>({status,report:emptyCommandReport(),rows:[],listNext:null,seen:new Set(),error:'',listBusy:false});
 command=blankCommand();
 function resetCommand(status='idle',resetFilters=false){commandEpoch++;if(resetFilters)commandFilters=normalizedFilters({queue:'new_contact'});command=blankCommand(status);}
 const api=async(action,data)=>{const stamp=serial;const result=await request(action,data);if(active&&serial===stamp&&['ops_acquisition_create','ops_acquisition_event','ops_acquisition_link','ops_acquisition_send'].includes(action)){resetCommand('stale');commandPaint?.();}return result;};
 function stopDiscovery(){discoveryEpoch++;if(liveDiscovery){liveDiscovery.clear();liveDiscovery=null;}}
 function clear(){stopDiscovery();serial++;active=false;resetCommand('idle',true);commandPaint=null;records=[];next=null;selected=null;detail=null;query='';city='all';businessTypeFilter='all';statusFilter='all';busy=false;registered=[];registeredNext=null;registeredLoaded=false;modal=null;communications={};lookupQuery='';lookupChannel='contactable';lookupReady=false;lookupSelection=null;focusMessage=null;newArea='';}
 async function refresh(){stopDiscovery();resetCommand('idle',true);commandPaint=null;focusMessage=null;active=true;const stamp=++serial;const r=await api('ops_acquisition_list');if(!active||stamp!==serial)return;if(r.schema!==1||!Array.isArray(r.prospects))throw Error('Deploy the matching Business Acquisition backend first.');records=r.prospects;next=r.next||null;communications=r.communications||{};selected=null;detail=null;modal=null;}
 async function perform(root,b,fn){if(!active||busy||!root.isConnected)return;const stamp=serial;busy=true;if(b)b.disabled=true;
  try{await fn(stamp);if(active&&serial===stamp&&root.isConnected)render(root);}
  catch(e){if(active&&serial===stamp&&!e.stale){const error=root.querySelector('.acq-dialog[open] .acq-error');if(error){error.hidden=false;error.textContent=e.message||'Could not complete this action.';}onError(e);}}
  finally{if(serial===stamp){busy=false;if(b?.isConnected)b.disabled=false;}}
 }
 async function readDetail(id,stamp){const r=await api('ops_acquisition_detail',{id});if(active&&serial===stamp){selected=id;detail=r;modal='business';records=records.some(x=>x.id===id)?records.map(x=>x.id===id?r.prospect:x):[r.prospect,...records];}}

 async function scanCommand(filters=commandFilters,resume=false){
  if(!active)return;
  if(!resume){resetCommand();commandFilters=normalizedFilters(filters);}
  const stamp=++commandEpoch,session=serial,state=command,valid=()=>active&&serial===session&&commandEpoch===stamp&&command===state;
  state.status='loading';state.error='';commandPaint?.();
  try{
   do{
    const after=state.report.next,first=state.report.asOf===null;
    const page=await api('ops_acquisition_command_page',{filters:commandFilters,includeRows:first,...(first?{}:{after,asOf:state.report.asOf})});
    if(!valid())return;
    if(page.next&&state.seen.has(page.next))throw Error('Repeated report cursor.');
    const merged=mergeCommandPage(state.report,page,commandFilters,{after,includeRows:first});
    if(first){state.rows=page.prospects;state.listNext=page.next;}
    if(page.next)state.seen.add(page.next);
    state.report=merged;
    if(merged.complete){state.status='complete';commandPaint?.();return;}
    commandPaint?.();
    // This stays below the dedicated 60 requests/minute report rate limit.
    await new Promise(resolve=>setTimeout(resolve,1250));if(!valid())return;
   }while(state.report.next);
  }catch(error){if(!valid())return;state.status='incomplete';state.error=error?.stale?'Session changed.':error.message||'Unable to finish report.';commandPaint?.();}
 }
 async function moreCommandRows(){
  const state=command,stamp=commandEpoch,session=serial,valid=()=>active&&serial===session&&command===state&&commandEpoch===stamp;
  if(!state.listNext||state.listBusy||state.status!=='complete')return;
  state.listBusy=true;state.error='';commandPaint?.();
  try{
   const after=state.listNext,page=await api('ops_acquisition_command_page',{filters:commandFilters,includeRows:true,after,asOf:state.report.asOf});
   if(!valid())return;
   // Validate the same snapshot, but never add these already-counted pages.
   mergeCommandPage({...emptyCommandReport(),asOf:state.report.asOf},page,commandFilters,{after,includeRows:true});
   if(page.prospects.some(p=>state.rows.some(old=>old.id===p.id)))throw Error('Duplicate prospect in snapshot page.');
   state.rows.push(...page.prospects);state.listNext=page.next;
  }catch(error){if(valid())state.error=error.message||'Could not load matching records.';}
  finally{if(valid()){state.listBusy=false;commandPaint?.();}}
 }
 function nationalPanel(contactActions){
  const panel=card('National Command Centre','All saved prospects, not just loaded rows. Filters are evaluated on the server; totals appear only after all snapshot pages have been verified.');
  panel.classList.add('acq-national-report');
  const form=el('form',undefined,'ops-form acq-national-filters');
  function options(label,key,values){const s=choice(form,label,key,values.map(([v])=>v));values.forEach(([,t],i)=>s.options[i].textContent=t);s.value=commandFilters[key];return s;}
  options('Filter province','province',[['','All provinces'],...provinces.map(p=>[p,p])]);
  const municipality=input(form,'Municipality name (exact)','municipality','text',false,100),township=input(form,'Township / area name (exact)','township','text',false,120);
  municipality.value=commandFilters.municipality;township.value=commandFilters.township;
  options('Filter business type','category',[['','All business types'],...['spaza','retail','food','salon','service','wholesale','manufacturer','other'].map(c=>[c,title(c)])]);
  const mc=input(form,'Official municipality code (optional)','municipalityCode','text',false,12),lc=input(form,'Official locality reference (optional)','localityId','text',false,30),search=input(form,'Search saved businesses','search','search',false,120);
  mc.value=commandFilters.municipalityCode;lc.value=commandFilters.localityId;search.value=commandFilters.search;
  const queue=options('Filter work queue','queue',[['','All matched prospects'],...NATIONAL_QUEUES]);
  submit(form,'Apply national filters',d=>scanCommand(d));panel.append(form);
  const progress=el('p','','footnote');progress.setAttribute('role','status');progress.dataset.nationalReportStatus='true';
  const controls=el('div',undefined,'acq-action-bar'),refreshButton=button('Refresh complete report',()=>scanCommand(commandFilters)),resumeButton=button('Continue incomplete report',()=>scanCommand(commandFilters,true));controls.append(refreshButton,resumeButton);
  const metrics=el('div',undefined,'field-admin-metrics acq-national-metrics'),queues=el('div',undefined,'acq-national-queues'),rows=el('div',undefined,'acq-national-rows'),more=button('Load more matching records',()=>moreCommandRows());
  panel.append(progress,controls,el('h3','Conversion and revenue'),metrics,el('p','Contacted includes separately labelled provider acceptance, not delivery. Downloads are owner-confirmed. Paid sellers and advertisers may overlap; paying businesses counts each prospect once. Approval is never inferred from downloads.','footnote'),el('h3','Daily work queues'),queues,el('h3','Matching business records'),rows,more);
  function chooseQueue(key){queue.value=key;void scanCommand(Object.fromEntries(new FormData(form)));}
  function paint(){
   const state=command,complete=state.status==='complete',report=state.report;
   progress.textContent=complete?'Complete snapshot · '+time(report.asOf)+' · '+report.scanned+' records inspected across all pages.':state.status==='loading'?'Calculating complete totals — '+report.scanned+' records inspected. Totals are not available yet.':state.status==='stale'?'Records changed. Refresh the complete report before using totals.':state.status==='incomplete'?'Report incomplete — no totals are available. '+state.error:'Complete national totals have not been loaded.';
   if(complete&&state.error)progress.textContent+=' · '+state.error;
   refreshButton.disabled=state.status==='loading'||state.listBusy;resumeButton.hidden=state.status!=='incomplete'||!report.next;resumeButton.disabled=state.status==='loading';
   metrics.replaceChildren();queues.replaceChildren();rows.replaceChildren();
   for(const [key,label,workQueue] of NATIONAL_FUNNEL){
    const tile=workQueue?button('',()=>chooseQueue(workQueue)):el('div');tile.className='field-stat';tile.dataset.metric=key;tile.append(el('small',label),el('strong',complete?report.counts.funnel[key]:'—'));if(workQueue)tile.disabled=!complete;metrics.append(tile);
   }
   for(const [key,label] of NATIONAL_QUEUES.slice(0,14)){
    const item=button(label+' · '+(complete?report.counts.queues[key]:'—'),()=>chooseQueue(key));item.dataset.queue=key;item.disabled=!complete;queues.append(item);
   }
   for(const p of state.rows){
    const row=el('article',undefined,'field-visit');row.dataset.prospectId=p.id;
    const evidence=p.seller?.activePaidAdvertising?'Verified paid advertising · '+p.seller.activePaidCampaigns+' active campaign(s)':p.seller?.unpaidCampaigns?'Unpaid / review campaign(s)':p.commercialInterest?'Interest: '+title(p.commercialInterest.kind):'No commercial interest recorded';
    row.append(el('strong',p.name),el('span',locationText(p)),statusPill(p),el('span',acquisitionContactNote(p)||'Contact details recorded'),el('span','Outreach: '+title(p.outreachState||'not_recorded')+' · Response: '+title(p.response||'not_recorded')+' · Download: '+(p.downloadConfirmedAt?'Owner confirmed':'Not confirmed')),
     el('span',p.geographyNeedsReview?'Provisional geography — review required':'Official reference '+(p.localityId||'')+' · '+(p.geographySourceVintage||'Check current boundaries')),
     el('span',p.seller?.approvalSubmitted?'Submitted for approval review':p.seller?.approved?'Approved business':p.seller?'Linked account: '+title(p.seller.status):'No linked registration'),
     el('span',p.seller?.paidMembership?'Verified paid seller membership':p.seller?.sellingAccess?'Selling access — not verified paid':'No verified paid membership'),
     el('span',evidence),el('span','Assigned: '+(p.assignedTo||'Unassigned')+' · Follow-up: '+time(p.nextFollowUpAt)),contactActions(p));
    rows.append(row);
   }
   if(!state.rows.length)rows.append(el('p',state.listNext?'No matches in this scan page. Load more matching records.':complete?'No matching businesses in this snapshot.':'Matching records will appear as the snapshot loads.','footnote'));
   more.hidden=!state.listNext;more.disabled=state.listBusy||!complete;more.textContent=state.listBusy?'Loading records…':'Load more matching records';
  }
  commandPaint=paint;paint();
  if(command.status==='idle')queueMicrotask(()=>{if(active&&panel.isConnected&&command.status==='idle')void scanCommand(commandFilters);});
  return panel;
 }
 function attachOfficialReference(form,provinceField,municipalityField,townField){
  const hidden=el('input');hidden.type='hidden';hidden.name='localityId';form.append(hidden);
  const section=el('div',undefined,'acq-full acq-official-locality'),result=el('div');result.setAttribute('role','status');let epoch=0;
  function reset(){epoch++;hidden.value='';result.replaceChildren(el('p','No official reference selected. Confirmed text is saved as provisional and remains in the geography review queue.','footnote'));}
  for(const field of [provinceField,municipalityField,townField])field.addEventListener('input',reset);
  const find=button('Find official locality reference',async()=>{
   const stamp=++epoch;hidden.value='';result.replaceChildren(el('p','Checking government locality reference…','footnote'));find.disabled=true;
   try{
    const reply=await api('ops_acquisition_localities',{province:provinceField.value,query:townField.value});
    if(stamp!==epoch||!active||!form.isConnected)return;
    result.replaceChildren(el('p','Government GIS reference · '+String(reply.vintage||'Source vintage not supplied')+'. Verify current municipal boundaries and independent business details.','footnote'));
    if(!Array.isArray(reply.localities))throw Error('Official locality response unavailable.');
    for(const item of reply.localities){
     if(item.province!==provinceField.value||typeof item.localityId!=='string')continue;
     result.append(button(item.township+' — '+item.municipality+' ('+item.localityId+')',()=>{
      hidden.value=item.localityId;municipalityField.value=item.municipality;townField.value=item.township;
      result.replaceChildren(el('strong','Selected official reference: '+item.township+' · '+item.municipality+' · '+item.localityId),el('p',item.geographySourceVintage||reply.vintage||'Check current boundaries.','footnote'));
     }));
    }
    if(!reply.localities.length||reply.more)result.append(el('p',reply.more?'More references may match. Enter a more specific name.':'No matching official reference. Save provisionally for geographic review.','footnote'));
   }catch(error){if(stamp===epoch&&active&&form.isConnected)result.replaceChildren(el('p',error.message||'Official reference unavailable. Save provisionally for review.','footnote'));}
   finally{if(form.isConnected)find.disabled=false;}
  });
  section.append(find,result);form.append(section);reset();return reset;
 }

 function render(root){
  if(!active)return;
  stopDiscovery();root.querySelector('[data-acquisition]')?.remove();const workspace=el('div');workspace.dataset.acquisition='true';
  const dialog=el('dialog',undefined,'acq-dialog');dialog.setAttribute('aria-label','Business acquisition workspace');
  const modalContent=el('div',undefined,'acq-dialog-content'),bar=el('div',undefined,'acq-dialog-bar'),modalTitle=el('strong','Business acquisition');
  const close=button('Close',()=>{stopDiscovery();modal=null;focusMessage=null;dialog.close();});bar.append(modalTitle,close);const err=el('p','', 'acq-error');err.setAttribute('role','alert');err.hidden=true;dialog.append(bar,err,modalContent);
  dialog.addEventListener('cancel',()=>{stopDiscovery();modal=null;focusMessage=null;});
  const panels={};let selectedListing=null;function open(name){if(modal==='discover'&&name!=='discover')stopDiscovery();modal=name;mount();}
  function mount(){if(!modal||!panels[modal])return;modalContent.replaceChildren(panels[modal]);modalTitle.textContent=({lookup:'Find & Add Businesses',discover:'Find & Add Businesses · live search',add:'Add Business',assets:'Marketing & onboarding',directory:'Registered businesses',business:'Business record'})[modal]||'Business acquisition';err.hidden=true;if(!dialog.open)dialog.showModal();dialog.scrollTop=0;if(modal==='business'&&focusMessage){const target=dialog.querySelector('[data-send-channel="'+focusMessage.channel+'"][data-send-kind="'+focusMessage.kind+'"]');if(target){target.open=true;target.scrollIntoView({block:'nearest'});}}}

  const intro=card('National business acquisition','All nine South African provinces. Confirm province, municipality, township and category for each saved prospect. Contact only through permitted channels. Registration and verification are free; selling and advertising are optional.');
  intro.classList.add('acq-hero');intro.append(el('p','Nine provinces · confirmed locations · contact history · conversion evidence','footnote'));const actionBar=el('div',undefined,'acq-action-bar');
  const discovery=button('Open national coverage map',()=>document.querySelector('[data-admin-view="map"]')?.click());discovery.classList.add('acq-map');actionBar.append(discovery);
  const find=button('Find businesses by area',()=>open('lookup'));find.classList.add('acq-find');actionBar.append(find);
  const source=el('a','Business owner information','button quiet');source.href='/for-shop-owners.html';source.target='_blank';source.rel='noopener noreferrer';actionBar.append(source);
  const add=button('+ Find & Add Businesses',()=>open('lookup'));add.classList.add('acq-add');actionBar.prepend(add);
  const assetsButton=button('Open marketing & onboarding assets',()=>{panels.assets.querySelector('details').open=true;open('assets');});assetsButton.classList.add('acq-assets');
  actionBar.append(button('Registered businesses',()=>open('directory')),assetsButton);intro.append(actionBar);
  workspace.append(intro);
  workspace.append(nationalPanel(contactActions));
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
  // Both the register and lookup list use the same recipient/permission checks;
  // the send action opens a preview and never enqueues merely by selecting a row.
  function openRecord(p,channel=null,kind=null){
   focusMessage=channel&&kind?{channel,kind}:null;
   return perform(root,null,stamp=>readDetail(p.id,stamp));
  }
  function contactActions(p){
   const actions=el('div',undefined,'acq-contact-actions');
   actions.append(button(newContact(p)?'Contact':'Open record',()=>openRecord(p)));
   const site=safeBusinessWebsite(p.website);if(site)actions.append(assetLink('Business website',site));
   const wa=savedWhatsAppCheck(p.phone);if(wa&&!p.optedOut&&!priorInvitation(p))actions.append(button(p.phoneKind==='whatsapp_only'?'WhatsApp invitation':'Check WhatsApp',()=>openRecord(p,'manual-whatsapp','invitation')));
   for(const channel of ['email','whatsapp']){
    if(!(channel==='email'?p.email:p.phone))continue;
    const kind=nextCommunication(p,channel,communications);
    const send=button(channel==='email'?'Send email':'Send WhatsApp',()=>openRecord(p,channel,kind));
    send.classList.add(channel==='email'?'acq-send-email':'acq-send-wa');send.disabled=!kind;
    send.title=kind?'Review '+kind+' before sending':p.optedOut?'Do not contact':!p.permissions?.[channel]?.granted&&!p.seller?'Record owner permission first':'Check consent, provider availability, account eligibility or existing history';
    actions.append(send);
   }
   return actions;
  }
  const lookup=card('Find businesses in an area','Search an area for live business listings, then check phone, website or WhatsApp and add a confirmed business. The active contact list excludes businesses without phone or email. Use the field-visit filter to retain those records separately.');
  const lookupForm=el('div',undefined,'acq-lookup-filters');
  const areaInput=input(lookupForm,'Town, township or business name','lookupQuery','search',false,120);areaInput.value=lookupSelection?.label||lookupQuery;areaInput.placeholder='e.g. Durban, Umlazi, Soweto';
  const channelSelect=el('select');channelSelect.setAttribute('aria-label','Contact channel filter');
  for(const [v,label] of [['contactable','Active contact list — new prospects'],['email','Email address available'],['whatsapp','Number recorded (WhatsApp not necessarily verified)'],['whatsapp_only','Confirmed WhatsApp only'],['manual','No phone or email — field visits'],['all','All saved businesses (register)']]){const o=el('option',label);o.value=v;channelSelect.append(o);}
  channelSelect.value=lookupChannel;const channelLabel=el('label','Contact channel');channelLabel.append(channelSelect);lookupForm.append(channelLabel);
  const onlyReady=check(lookupForm,'Only show recorded channel permission','onlyReady');onlyReady.required=false;onlyReady.checked=lookupReady;
  const lookupResults=el('div',undefined,'acq-lookup-results'),lookupCount=el('p','', 'footnote');lookupCount.setAttribute('aria-live','polite');
  function showContacts(){
   const matches=records.filter(p=>matchesAcquisitionContact(p,lookupQuery,lookupChannel,lookupReady));
   lookupResults.replaceChildren();lookupCount.textContent=matches.length+' matching contact'+(matches.length===1?'':'s')+' from '+records.length+' loaded records'+(next?' · more records available':'')+'.';
   for(const p of matches){
    const row=el('article',undefined,'acq-contact-row'),identity=el('div',undefined,'acq-contact-identity');
    identity.append(el('strong',p.name),el('span',locationText(p)),el('span','Email: '+(p.email||'Not recorded')),el('span',(p.phoneKind==='whatsapp_only'?'WhatsApp: ':'Phone: ')+(p.phone||'Not recorded')));if(acquisitionContactNote(p))identity.append(el('span',acquisitionContactNote(p),'footnote'));
    const allowed=matchesAcquisitionContact(p,'',lookupChannel,true);
    const permission=el('span',p.optedOut?'Do not contact':allowed?'Permission recorded':!p.email&&!p.phone?'Field visit / manual enquiry':'Permission required','acq-status');permission.dataset.state=p.optedOut?'blocked':allowed?'interested':'identified';
    const added=el('span','Added','acq-status');added.dataset.state='interested';identity.append(permission,added);row.append(identity,contactActions(p));lookupResults.append(row);
   }
   if(!matches.length)lookupResults.append(el('p','No saved businesses match yet. Select Search Google Places above to discover businesses in your chosen area.','acq-empty'));
  }
  areaInput.oninput=()=>{lookupSelection=null;lookupQuery=areaInput.value;showContacts();};
  void import('/js/teyza-combined-coverage.mjs?v=20261127-idle-area').then(({attachAreaAutocomplete})=>{
   if(!active||root.querySelector('[data-acquisition]')!==workspace)return;
   attachAreaAutocomplete(areaInput,{api,initialArea:lookupSelection,onEdit:()=>{lookupSelection=null;lookupQuery=areaInput.value;showContacts();},onSelect:area=>{lookupSelection=area;lookupQuery=area.area;showContacts();}});
  }).catch(()=>{});
  channelSelect.onchange=()=>{lookupChannel=channelSelect.value;showContacts();};
  onlyReady.onchange=()=>{lookupReady=onlyReady.checked;showContacts();};
  const lookupActions=el('div',undefined,'acq-contact-actions');
  const googleButton=button('Search Google Places',()=>openDiscovery());
  googleButton.title='Search the entered town across all three business categories';
  areaInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.defaultPrevented){e.preventDefault();void openDiscovery();}});
  googleButton.classList.add('acq-send-email');
  const manualAdd=button('Add confirmed business',()=>{prepareManual(lookupQuery);open('add');});manualAdd.classList.add('acq-send-wa');
  lookupActions.append(googleButton,manualAdd);
  if(next)lookupActions.append(button('Load more saved contacts',()=>perform(root,null,async stamp=>{const r=await api('ops_acquisition_list',{after:next});if(stamp!==serial)return;records=[...new Map([...records,...r.prospects].map(p=>[p.id,p])).values()];next=r.next||null;communications=r.communications||communications;})));
  lookup.append(lookupForm,lookupActions,lookupCount,lookupResults);panels.lookup=lookup;showContacts();
  const discoverPanel=card('Discover businesses with Google Places','Live list first; the map is optional. Check public phone and website, open WhatsApp to check a number, or add a business. Google does not provide email or confirm WhatsApp registration. Save only independently confirmed details.');
  const discoveryHost=el('div'),back=button('Back to saved contacts',()=>open('lookup'));
  const confirmedAdd=button('Add confirmed business',()=>{const entered=discoveryHost.querySelector('[aria-label="Town or municipality"]')?.value;prepareManual(entered||lookupQuery);open('add');});
  const discoveryActions=el('div',undefined,'acq-contact-actions');discoveryActions.append(back,confirmedAdd);discoverPanel.append(discoveryActions,discoveryHost);panels.discover=discoverPanel;
  async function openDiscovery(){
   stopDiscovery();const stamp=++discoveryEpoch;open('discover');discoveryHost.replaceChildren(el('p','Loading the configured Google Maps explorer…','footnote'));
   try{
    const {createCombinedCoverage,resolvePilotArea}=await import('/js/teyza-combined-coverage.mjs?v=20261127-idle-area');
    if(!active||stamp!==discoveryEpoch||modal!=='discover'||!dialog.open)return;
    const typed=oneLine(lookupQuery).slice(0,100);
    liveDiscovery=createCombinedCoverage({autoSearch:Boolean(lookupSelection||resolvePilotArea(typed)),compact:true,initialTown:typed||'Durban',initialArea:lookupSelection,areaApi:api,invitationDraft:whatsappInvitationDraft,
     resolveSavedPlaces:async ids=>{
      const matches=new Map();
      for(let i=0;i<ids.length;i+=30){const r=await api('ops_acquisition_place_matches',{placeIds:ids.slice(i,i+30)});if(!Array.isArray(r.matches))throw Error('Saved status unavailable');for(const m of r.matches)matches.set(m.placeId,m.id);}
      return matches;
     },
     onAddBusiness:(p,contact,area)=>{if(stamp!==discoveryEpoch||modal!=='discover')return;lookupQuery=oneLine(area).slice(0,100);lookupSelection=null;prepareManual(lookupQuery,p,contact);open('add');},
     onContactBusiness:id=>{if(stamp===discoveryEpoch&&modal==='discover')void openRecord({id});},
     report:e=>{if(stamp===discoveryEpoch&&modal==='discover')message(e.message||'Google Places unavailable.','error');}});
    discoveryHost.replaceChildren(liveDiscovery.panel);
    await liveDiscovery.activate();
   }catch(e){if(stamp===discoveryEpoch&&modal==='discover')discoveryHost.replaceChildren(el('p','Google Places could not load. Use the national coverage map or search saved contacts.','footnote'));}
  }
  const create=card('Add Business','Confirm the business using an independent permitted source, such as its own website or the owner. Only source-confirmed details are saved; public information does not grant marketing permission. Do not enter sensitive documents or credentials.');
  const listingReference=el('div',undefined,'acq-listing-reference');listingReference.hidden=true;create.append(listingReference);
  const f=el('form',undefined,'ops-form acq-compact-form');
  const nameField=input(f,'Business name','name','text',true,120),provinceField=choice(f,'Province','province',['',...provinces]),municipalityField=input(f,'Municipality','municipality','text',true,100),cityField=input(f,'Town / city','city','text',true,100),townField=input(f,'Township / area','area','text',true,100);
  provinceField.required=true;provinceField.options[0].textContent='Select a province';
  const addressField=input(f,'Business address or landmark','address','text',true,220);addressField.parentElement.classList.add('acq-full');
  const resetLocality=attachOfficialReference(f,provinceField,municipalityField,townField);
  check(f,'I confirm the province, municipality, town and township for this business.','geographyConfirmed');
  function setManualArea(){const norm=v=>oneLine(v).toLowerCase().replace(/[ -]/g,'');const match=cities.find(c=>norm(c)===norm(newArea)||areas[c].split(' · ').some(a=>norm(a)===norm(newArea)));if(match){cityField.value=match;provinceField.value=match==='Durban'?'KwaZulu-Natal':'Gauteng';}if(newArea)townField.value=newArea;newArea='';}
  const categoryField=choice(f,'Business category','category',['spaza','retail','food','salon','service','wholesale','manufacturer','other']);
  const phoneField=input(f,'Business phone or confirmed WhatsApp number (optional)','phone','tel',false,40);
  const numberType=choice(f,'Contact number type','phoneKind',['unconfirmed','whatsapp_only']);numberType.options[0].textContent='Phone / WhatsApp not yet confirmed';numberType.options[1].textContent='WhatsApp only (confirmed; no voice phone)';
  const emailField=input(f,'Business email (optional)','email','email',false,254);
  const websiteField=input(f,'Business website (optional)','website','url',false,500);
  const sourceField=choice(f,'Source','source',['owner_inquiry','partner_introduction','owner_provided','permitted_business_directory','in_person','other_permitted']);
  const sourceRef=input(f,'Source reference / authority to retain details','sourceReference','textarea',true,240);sourceRef.parentElement.classList.add('acq-full');
  const authorised=check(f,'I confirm Teyza may retain this information for onboarding.','authorisedSource');authorised.parentElement.classList.add('acq-full');
  const independent=check(f,'I independently confirmed the business details using the named permitted source, not Google Maps alone.','independentSourceConfirmed');independent.parentElement.classList.add('acq-full');independent.parentElement.hidden=true;independent.disabled=true;independent.required=false;
  function prepareManual(area,p=null,contact={}){
   f.reset();resetLocality();syncConsent();selectedListing=p?{placeId:p.placeId}:null;
   newArea=oneLine(area).slice(0,100);setManualArea();
   independent.disabled=!p;independent.required=!!p;independent.parentElement.hidden=!p;
   listingReference.replaceChildren();listingReference.hidden=!p;
   if(!p)return;
   sourceField.value='other_permitted';
   listingReference.append(el('strong',p.name||'Selected listing'),el('p',p.address||'No address listed','footnote'),el('p','Live Google reference only. Verify each value using the owner or another permitted independent source before saving. Enter missing or corrected details in the form.','footnote'));
   const site=safeBusinessWebsite(contact?.websiteUrl);const phone=oneLine(contact?.phone);if(phone)listingReference.append(el('p','Public phone: '+phone,'footnote'));if(site)listingReference.append(assetLink('Open business website',site));
   const wa=savedWhatsAppCheck(phone);if(wa)listingReference.append(assetLink('Check WhatsApp',wa));
   const use=button('Use independently confirmed details',()=>{
    if(!independent.checked||!authorised.checked||!sourceRef.value.trim()){message('Record the independent source and check both confirmation boxes first.','info');sourceRef.focus();return;}
    nameField.value=oneLine(p.name).slice(0,120);addressField.value=oneLine(p.address).slice(0,220);phoneField.value=phone.slice(0,40);websiteField.value=site||'';categoryField.value=p.shopCategory==='spaza'?'spaza':p.shopCategory==='wholesale'?'wholesale':'other';
    message('Review the source-confirmed details and remove any unconfirmed contact field before saving.','info');
   });listingReference.append(use);
  }
  const consentBox=el('fieldset',undefined,'acq-consent acq-full');consentBox.append(el('legend','Owner contact permissions (optional)'),el('p','Select only channels the owner has explicitly agreed to. Leave unchecked if permission has not been obtained.','footnote'));
  const emailOpt=check(consentBox,'Owner opted in to email marketing','initialEmail'),waOpt=check(consentBox,'Owner opted in to WhatsApp marketing','initialWhatsApp');emailOpt.required=false;waOpt.required=false;
  const consentNote=input(consentBox,'Evidence of owner permission','initialConsentNote','textarea',false,500);
  const confirmConsent=check(consentBox,'I confirm the owner explicitly opted in to each selected channel.','initialConsentConfirmed');
  function syncConsent(){const on=emailOpt.checked||waOpt.checked;for(const field of [consentNote,confirmConsent]){field.parentElement.hidden=!on;field.disabled=!on;field.required=on;}}
  emailOpt.onchange=waOpt.onchange=syncConsent;syncConsent();f.append(consentBox);
  submit(f,'Add Business',(d,b)=>perform(root,b,async stamp=>{const {initialEmail,initialWhatsApp,initialConsentNote,initialConsentConfirmed,independentSourceConfirmed,...rest}=d;const r=await api('ops_acquisition_create',{...rest,geographyConfirmed:d.geographyConfirmed==='on',googlePlaceId:selectedListing?.placeId||'',independentSourceConfirmed:independentSourceConfirmed==='on',authorisedSource:d.authorisedSource==='on',initialConsentChannels:[initialEmail==='on'?'email':null,initialWhatsApp==='on'?'whatsapp':null].filter(Boolean),initialConsentNote:initialConsentNote||'',initialConsentConfirmed:initialConsentConfirmed==='on'});if(serial!==stamp)return;focusMessage=null;records=[r.prospect,...records.filter(x=>x.id!==r.prospect.id)];await readDetail(r.prospect.id,stamp);message('Business added. No message sent.','success');}));
  create.append(button('Back to search',()=>open('lookup')),f);panels.add=create;
  if(detail&&selected===detail.prospect.id){
   const p=detail.prospect,c=card('Business: '+p.name,'Private onboarding record · '+locationText(p));
   const added=el('span','Added','acq-status');added.dataset.state='interested';c.append(added,button('Back to business search',()=>open('lookup')));
   c.append(el('p','Contact: '+[p.phoneKind==='whatsapp_only'&&p.phone?'WhatsApp '+p.phone:p.phone,p.email].filter(Boolean).join(' · ')),el('p',acquisitionContactNote(p),'footnote'),el('p','Contact confirmed: '+time(p.contactedAt)+' · Response: '+title(p.response||'not recorded')+' · Download confirmed: '+time(p.downloadConfirmedAt),'footnote'),el('p','Source: '+title(p.source)+' — '+p.sourceReference,'footnote'),el('p','Assigned reviewer: '+p.assignedTo+' · Last saved by '+p.lastActivityBy+' · '+time(p.updatedAt),'footnote'));
   const site=safeBusinessWebsite(p.website);if(site)c.append(assetLink('Open business website',site));
   const wa=savedWhatsAppCheck(p.phone);if(wa&&!p.optedOut){
    const box=el('details',undefined,'acq-message acq-wa-draft');box.dataset.sendChannel='manual-whatsapp';box.dataset.sendKind='invitation';box.append(el('summary','Check WhatsApp & review invitation'));
    const preview=el('textarea');preview.readOnly=true;preview.rows=9;preview.value=whatsappInvitationDraft(p);preview.setAttribute('aria-label','Personalised WhatsApp invitation');box.append(preview,assetLink('Open WhatsApp — check number only',wa));
    const result=el('div');result.setAttribute('role','status');box.append(result);
    const prepare=button('Prepare WhatsApp message',async()=>{
     prepare.disabled=true;result.replaceChildren(el('p','Rechecking recorded owner permission and contact…','footnote'));
     try{
      const r=await api('ops_acquisition_detail',{id:p.id});if(!box.isConnected)return;
      const fresh=r.prospect,url=manualWhatsappDraftUrl(fresh),prior=Array.isArray(r.events)&&r.events.some(e=>e.type==='contact'&&e.channel==='whatsapp');
      if(!url||fresh.phone!==p.phone||fresh.revision!==p.revision||prior){result.textContent='Draft blocked: check current owner consent, opt-out, existing account and contact history. Refresh the record.';return;}
      result.replaceChildren(assetLink('Open prepared WhatsApp message',url),el('p','Review the message in WhatsApp and choose Send yourself. Record actual contact in the activity history. Nothing was sent by Admin.','footnote'));
     }catch(e){if(box.isConnected){result.textContent=e.message||'Could not verify permission.';onError(e);}}
     finally{if(box.isConnected)prepare.disabled=false;}
    });
    if(manualWhatsappDraftUrl(p))box.append(prepare);else box.append(el('p','Record actual owner permission before preparing an invitation. Prior outreach, opt-out or linked registration blocks a duplicate initial invitation.','footnote'));
    c.append(box);
   }
   if(!p.optedOut&&(!p.phone||!p.email||!p.website)){
    const missing=el('details',undefined,'acq-secondary');missing.append(el('summary','Add missing contact details'));
    const form=el('form',undefined,'ops-form');
    if(!p.phone){input(form,'Confirmed phone or WhatsApp number','phone','tel',false,40);const t=choice(form,'Number type','phoneKind',['unconfirmed','whatsapp_only']);t.options[0].textContent='Phone / WhatsApp not yet confirmed';t.options[1].textContent='Confirmed WhatsApp only';}
    if(!p.email)input(form,'Confirmed business email','email','email',false,254);
    if(!p.website)input(form,'Confirmed business website','website','url',false,500);
    input(form,'Independent source / evidence','note','textarea',true,500);
    check(form,'I independently confirmed these details and Teyza may retain them. No contact permission is inferred.','authorisedSource');
    submit(form,'Save contact details',(d,b)=>perform(root,b,async stamp=>{await api('ops_acquisition_event',{id:p.id,revision:p.revision,type:'contact_update',note:d.note,phone:d.phone||'',phoneKind:d.phoneKind||'unconfirmed',email:d.email||'',website:d.website||'',authorisedSource:d.authorisedSource==='on',confirmed:true});await readDetail(p.id,stamp);if(serial===stamp)message('Contact details saved. No message sent.','success');}));
    missing.append(form);c.append(missing);
   }
   if(p.geographyNeedsReview){
    const geo=el('details',undefined,'acq-secondary');geo.append(el('summary','Complete official township allocation'));
    const form=el('form',undefined,'ops-form'),pr=choice(form,'Province','province',['',...provinces]);pr.required=true;pr.options[0].textContent='Select province';pr.value=p.province||'';
    const municipality=input(form,'Municipality','municipality','text',true,100),township=input(form,'Township / area','township','text',true,120);municipality.value=p.municipality||'';township.value=p.township||p.area||'';
    attachOfficialReference(form,pr,municipality,township);
    input(form,'Source / confirmation note','note','textarea',true,500);check(form,'I confirmed this business location.','geographyConfirmed');
    submit(form,'Save geographic allocation',(d,b)=>perform(root,b,async stamp=>{await api('ops_acquisition_event',{id:p.id,revision:p.revision,type:'geography_update',province:d.province,municipality:d.municipality,township:d.township,localityId:d.localityId,note:d.note,geographyConfirmed:d.geographyConfirmed==='on',confirmed:true});await readDetail(p.id,stamp);}));
    geo.append(form);c.append(geo);
   }
   c.append(el('strong',p.optedOut?'DO NOT CONTACT':channels.map(x=>title(x)+': '+(p.permissions?.[x]?.granted?'permission recorded':'not recorded')).join(' · ')));
   if(p.seller)c.append(el('p','Linked seller '+p.seller.uid+' · '+title(p.seller.status)+' · '+(p.seller.listed?'Listed':'Listing not confirmed')+'. This workspace does not approve sellers.'),el('p',p.seller.paidMembership?'Verified paid seller membership':p.seller.sellingAccess?'Selling access — not paid':'No verified paid seller membership'),el('p','Active paid campaigns: '+(p.seller.activePaidCampaigns||0)+' · Unpaid/review campaigns: '+(p.seller.unpaidCampaigns||0)+' · Reconciliation required: '+(p.seller.advertisingReview||0),'footnote'));
   const update=el('form',undefined,'ops-form');
   const types=p.optedOut?['progress','response','app_download','help_requested','help_replied','help_resolved']:['progress','permission','contact','response','app_download','opt_out','help_requested','help_replied','help_resolved',...(p.seller?.status==='approved'?['commercial_interest']:[])];
   const kind=choice(update,'Record activity','type',types);
   const channel=choice(update,'Channel','channel',p.phoneKind==='whatsapp_only'?['email','whatsapp']:channels);
   const response=choice(update,'Actual owner response','response',['interested','needs_help','declined','other_response']);
   const download=check(update,'The owner confirmed an actual app download (not a link click).','ownerConfirmedDownload');
   const interest=choice(update,'Owner commercial interest','interest',['advertising','selling','both','not_now']);
   const consent=check(update,'Owner explicitly opted in to this channel.','ownerOptIn');
   const stage=choice(update,'Onboarding stage','stage',stages);stage.value=p.stage;
   const follow=input(update,'Next follow-up date (SAST)','followup','date',false);
   if(p.nextFollowUpAt)follow.value=new Date(p.nextFollowUpAt+7200000).toISOString().slice(0,10);
   input(update,'Activity note / consent evidence (no sensitive documents or credentials)','note','textarea',true,500);
   check(update,'I confirm this records an actual event. No message will be sent.','confirmed');
   function configure(){
    const isContact=['permission','contact','help_requested'].includes(kind.value),isProgress=kind.value==='progress';
    for(const [i,show] of [[channel,isContact],[consent,kind.value==='permission'],[stage,isProgress],[follow,isProgress&&!p.optedOut],[response,kind.value==='response'],[download,kind.value==='app_download'],[interest,kind.value==='commercial_interest']]){i.parentElement.hidden=!show;i.disabled=!show;}
   }kind.onchange=configure;configure();
   submit(update,'Save activity',(d,b)=>perform(root,b,async stamp=>{
    const request={id:p.id,revision:p.revision,type:d.type,note:d.note,confirmed:d.confirmed==='on'};
    if(['permission','contact','help_requested'].includes(d.type)){request.channel=d.channel;request.ownerOptIn=d.ownerOptIn==='on';}
    if(d.type==='progress'){request.stage=d.stage;request.nextFollowUpAt=d.followup?Date.parse(d.followup+'T09:00:00+02:00'):null;}
    if(d.type==='response')request.response=d.response;
    if(d.type==='app_download')request.ownerConfirmedDownload=d.ownerConfirmedDownload==='on';
    if(d.type==='commercial_interest')request.interest=d.interest;
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
   const direct=card('Send a message','Contact this added business via the existing linked Zoho Mail or the configured WhatsApp provider. Select the channel and message. Review the exact recipient and approved personalised content. A single click queues a message only when the provider is enabled. Provider acceptance is not delivery.');direct.classList.add('acq-communications');
   const refreshStatus=button('Refresh send history',()=>perform(root,null,stamp=>readDetail(p.id,stamp)));direct.append(refreshStatus);
   for(const channel of ['email','whatsapp']){
    const block=el('section',undefined,'acq-channel '+(channel==='email'?'acq-email':'acq-whatsapp'));block.append(el('h4',channel==='email'?'Email · Zoho Mail':'WhatsApp · Business Platform'));
    const destination=channel==='email'?p.email:p.phone;block.append(el('p','Recipient: '+(destination||'Not recorded'),'footnote'));
    for(const kind of ['invitation','welcome','membership']){
     const job=p.outbound?.[channel+'_'+kind],legacy=channel==='email'&&p.emailHistory?.[kind];
     const label=kind==='invitation'?'Invite to Teyza':kind==='welcome'?'Welcome to Teyza':'Membership invitation';
     const wrap=el('details',undefined,'acq-message');wrap.dataset.sendChannel=channel;wrap.dataset.sendKind=kind;wrap.append(el('summary',label+(job?' · '+title(job.status):legacy?' · recorded sent':'')));
     if(job||legacy){const state=job?.status||legacy.status;wrap.append(el('p','Status: '+title(state)+' · '+time(job?.acceptedAt||job?.updatedAt||legacy?.sentAt),'acq-status'));if(job&&(['sending','review_required','cancelled'].includes(state)||(state==='queued'&&Date.now()-job.updatedAt>600000)))wrap.append(el('p','Do not resend blindly. Review the provider and recorded status.','footnote'));block.append(wrap);continue;}
     const permitted=communicationPermitted(p,channel,kind);
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
    if(!allowed){box.append(el('p',kind==='invitation'?'Record email consent first. Prior outreach, opt-out or registration blocks another initial invitation.':'Link the genuine registered seller first. Its owner email must match this record.','footnote'));mailPanel.append(box);continue;}
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
