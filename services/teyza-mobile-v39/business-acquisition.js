'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication'),{createCommunication}=require('./business-communications');
const collection='teyzaBusinessProspects',suppression='teyzaBusinessContactSuppression',links='teyzaBusinessProspectSellerLinks',placeLinks='teyzaBusinessProspectPlaceLinks';
const actions=new Set(['ops_acquisition_list','ops_acquisition_create','ops_acquisition_place_matches','ops_acquisition_detail','ops_acquisition_event','ops_acquisition_link','ops_acquisition_send']);
const provinces=['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'];
const legacyProvince=Object.freeze({Durban:'KwaZulu-Natal',Johannesburg:'Gauteng'});
const cities=Object.keys(legacyProvince);
const phoneKinds=['unconfirmed','whatsapp_only'];
const responses=['interested','needs_help','declined','other_response'];
const commercialInterests=['advertising','selling','both','not_now'];
const categories=['spaza','retail','food','salon','service','wholesale','manufacturer','other'];
const sources=['owner_inquiry','partner_introduction','owner_provided','permitted_business_directory','in_person','other_permitted'];
const emailKinds=['invitation','welcome'];
const stages=['identified','interested','registration_started','not_interested','closed'];
const channels=['phone','email','whatsapp'];
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const clean=(v,label,max,required=true)=>D.text(v??'',label,max,required);
const choose=(v,values,label)=>{if(!values.includes(v))D.fail(422,'Choose a valid '+label+'.');return v;};
function phone(v){
 v=clean(v,'business phone',40,false).replace(/[\s().-]/g,'');
 if(!v)return '';
 if(/^0\d{9}$/.test(v))v='+27'+v.slice(1);
 if(!/^\+27\d{9}$/.test(v))D.fail(422,'Enter a South African business contact number.');
 return v;
}
function email(v){
 v=clean(v,'business email',254,false).toLowerCase();
 if(v&&!/^[^\s@<>,;"\\]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(v))D.fail(422,'Enter a valid business email.');
 return v;
}
function website(v){
 v=clean(v,'business website',500,false);
 if(!v)return '';
 let url;try{url=new URL(v);}catch{D.fail(422,'Enter a valid business website URL.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!url.hostname.includes('.'))D.fail(422,'Enter a public HTTP or HTTPS business website URL.');
 return url.href;
}
function placeId(v){
 v=clean(v,'Google Place ID',200,false);
 if(v&&!/^[A-Za-z0-9_-]{10,200}$/.test(v))D.fail(422,'Invalid Google Place ID.');
 return v;
}
const contactValue=(p,c)=>c==='email'?p.email:c==='phone'&&p.phoneKind==='whatsapp_only'?'':p.phone;
const phoneKind=(v,number)=>{
 const kind=choose(v??'unconfirmed',phoneKinds,'contact number type');
 if(kind==='whatsapp_only'&&!number)D.fail(422,'Enter the independently confirmed WhatsApp number.');
 return kind;
};
const contactNote=p=>!p.phone&&!p.email?'No phone number or email recorded — field visit / manual enquiry':
 p.phoneKind==='whatsapp_only'?'No voice phone number — WhatsApp only':
 !p.phone?'No phone number — email available':'';
const geography=p=>({province:p.province||legacyProvince[p.city]||'',municipality:p.municipality||'',
 geographyNeedsReview:!p.province||!p.municipality});
const acquisitionProgress=p=>({
 contactedAt:p.contactedAt||p.emailHistory?.invitation?.sentAt||null,
 lastWhatsAppContactAt:p.lastWhatsAppContactAt||null,
 response:p.response||null,responseRecordedAt:p.responseRecordedAt||null,
 downloadConfirmedAt:p.downloadConfirmedAt||null,
 commercialInterest:p.commercialInterest||null
});
function keys(p){return [...new Set([p.phone?'phone:'+hash(p.phone):null,p.email?'email:'+hash(p.email):null].filter(Boolean))];}
const nextDate=(v,now)=>{
 if(v===null||v===undefined||v==='')return null;
 if(!Number.isSafeInteger(v)||v<now-86400000||v>now+366*86400000)D.fail(422,'Choose a follow-up date within one year.');
 return v;
};
function createAcquisition({db,clock=Date.now}){
 const doc=p=>db.doc(p),read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
 const communications=createCommunication({db,clock});
 const eventsPath=id=>collection+'/'+id+'/events';
 function event(tx,id,uid,type,details){
  tx.set(doc(eventsPath(id)+'/'+crypto.randomUUID()),{actorUid:uid,type,...details,createdAt:clock()});
 }
 async function suppressed(p,tx=null){
  const refs=keys(p).map(k=>doc(suppression+'/'+k));
  const rows=await Promise.all(refs.map(r=>tx?tx.get(r):r.get()));
  return rows.some(s=>s.exists);
 }
 async function view(id,p){
  const blocked=p.optedOut===true||await suppressed(p);
  let seller=null;
  if(p.sellerUid){
   const a=await read('teyzaSellerAccounts/'+p.sellerUid);
   if(a?.uid===p.sellerUid&&a.deletionPending!==true&&norm(a.shopName)===norm(p.name)){
    const [s,billing]=await Promise.all([read('teyzaPublicShops/'+p.sellerUid),read('teyzaBilling/'+p.sellerUid)]);
    seller={uid:p.sellerUid,status:['approved','pending','rejected','suspended','needs_changes'].includes(a.approvalStatus)?a.approvalStatus:'pending',
     listed:s?.sellerUid===p.sellerUid&&s.status==='active'&&s.approvalStatus==='approved'&&s.identityVerified===true,
     welcomeEmailEligible:!!p.email&&norm(a.ownerEmail)===norm(p.email),
     welcomeWhatsAppEligible:!!p.phone&&String(a.phone||'').replace(/[\s().-]/g,'').replace(/^0(\d{9})$/,'+27$1')===p.phone,
     membershipEligible:a.approvalStatus==='approved'&&!P.eligible(p.sellerUid,a,billing,clock()),
     paidMembership:a.approvalStatus==='approved'&&P.entitled(p.sellerUid,a,billing,clock()),
     sellingAccess:a.approvalStatus==='approved'&&P.eligible(p.sellerUid,a,billing,clock())};
   }else seller={uid:p.sellerUid,status:'review_required',listed:false,welcomeEmailEligible:false};
  }
  return {id,name:p.name,city:p.city,area:p.area,address:p.address,category:p.category,phone:p.phone,email:p.email,website:p.website||'',googlePlaceId:p.googlePlaceId||'',
   ...geography(p),phoneKind:p.phoneKind||'unconfirmed',contactNote:contactNote(p),
   contactQueue:blocked?'blocked':p.phone||p.email?'contact_details_available':'field_visit',
   ...acquisitionProgress(p),
   source:p.source,sourceReference:p.sourceReference,stage:p.stage,permissions:p.permissions||{},optedOut:blocked,
   nextFollowUpAt:blocked?null:p.nextFollowUpAt??null,createdAt:p.createdAt,updatedAt:p.updatedAt,lastActivityAt:p.lastActivityAt,
   lastActivityBy:p.lastActivityBy,assignedTo:p.assignedTo,revision:p.revision,seller,
   emailHistory:p.emailHistory||{},outbound:p.outbound||{},help:p.help||null};
 }
 async function execute(auth,action,data){
  const uid=D.id(auth.uid);
  if(action==='ops_acquisition_list'){
   let q=db.collection(collection).orderBy('__name__').limit(31);
   if(data.after)q=q.startAfter(D.id(data.after));
   const result=await q.get(),rows=result.docs.slice(0,30);
   return {schema:1,prospects:await Promise.all(rows.map(s=>view(s.id,s.data()))),next:result.docs.length>30?rows[29].id:null,communications:await communications.caps()};
  }
  if(action==='ops_acquisition_place_matches'){
   if(!Array.isArray(data.placeIds)||data.placeIds.length>30)D.fail(422,'Check at most 30 displayed business references.');
   const ids=[...new Set(data.placeIds.map(placeId))].filter(Boolean);
   const matches=await Promise.all(ids.map(async key=>{
    const link=await read(placeLinks+'/'+hash(key));
    return link?.prospectId?{placeId:key,id:link.prospectId}:null;
   }));
   return {matches:matches.filter(Boolean)};
  }
  if(action==='ops_acquisition_create'){
   if(data.authorisedSource!==true)D.fail(422,'Confirm that Teyza may retain these business contact details.');
   const name=clean(data.name,'business name',120),area=clean(data.area,'township or area',100),address=clean(data.address,'business street address or landmark',220);
   // Legacy pilot clients remain compatible until their Admin UI is updated. Their
   // municipality is deliberately not guessed; new national entries require confirmation.
   const national=data.province!==undefined||data.municipality!==undefined;
   const city=national?clean(data.city,'town or city',100):choose(data.city,cities,'legacy pilot city');
   const province=national?choose(data.province,provinces,'province'):legacyProvince[city];
   const municipality=national?clean(data.municipality,'municipality',100):'';
   if(national&&data.geographyConfirmed!==true)D.fail(422,'Confirm the business province, municipality and township.');
   const category=choose(data.category,categories,'business category'),source=choose(data.source,sources,'source');
   const sourceReference=clean(data.sourceReference,'source and permission to retain details',240);
   const contact={phone:phone(data.phone),email:email(data.email),website:website(data.website)};
   contact.phoneKind=phoneKind(data.phoneKind,contact.phone);
   contact.contactNote=contactNote(contact);
   const googlePlaceId=placeId(data.googlePlaceId);
   if(googlePlaceId&&data.independentSourceConfirmed!==true)D.fail(422,'Confirm the saved details using an independent permitted source, not Google Maps alone.');
   const initialChannels=data.initialConsentChannels??[];
   if(!Array.isArray(initialChannels)||initialChannels.length>2||new Set(initialChannels).size!==initialChannels.length||initialChannels.some(c=>!['email','whatsapp'].includes(c)||!contactValue(contact,c)))D.fail(422,'Select only channels with recorded contact details.');
   const initialNote=initialChannels.length?clean(data.initialConsentNote,'actual owner opt-in evidence',500):'';
   if(initialChannels.length&&data.initialConsentConfirmed!==true)D.fail(422,'Confirm actual owner opt-in for each selected channel.');
   const id=hash([city,area,address,name].map(norm).join('|')),ref=doc(collection+'/'+id);
   const saved=await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const placeRef=googlePlaceId?doc(placeLinks+'/'+hash(googlePlaceId)):null;
    const placeLink=placeRef?await tx.get(placeRef):null;
    if(placeLink?.exists)D.fail(409,'This listing already has an added business. Search again and open its existing record.');
    if(old.exists)D.fail(409,'This business already exists for the same name and location. Open its existing record.');
    if(initialChannels.length&&await suppressed(contact,tx))D.fail(409,'Contact is suppressed. Do not record new marketing consent here.');
    const permissions=Object.fromEntries(initialChannels.map(c=>[c,{granted:true,recordedAt:clock(),recordedBy:uid}]));
    const p={name,city,area,province,municipality,address,category,source,sourceReference,...contact,googlePlaceId,stage:'identified',permissions,optedOut:false,nextFollowUpAt:null,
     sellerUid:null,assignedTo:uid,createdAt:clock(),updatedAt:clock(),lastActivityAt:clock(),lastActivityBy:uid,revision:0};
    tx.set(ref,p);if(placeRef)tx.set(placeRef,{prospectId:id,linkedAt:clock(),linkedBy:uid});event(tx,id,uid,'created',{contactNote:contact.contactNote,province,municipality});for(const channel of initialChannels)event(tx,id,uid,'permission',{channel,note:initialNote});return p;
   });
   return {prospect:await view(id,saved)};
  }
  const id=D.id(data.id),ref=doc(collection+'/'+id);
  if(action==='ops_acquisition_send')return communications.enqueue(uid,id,data);
  if(action==='ops_acquisition_detail'){
   const p=await read(collection+'/'+id);if(!p)D.fail(404,'Business prospect not found.');
   const result=await db.collection(eventsPath(id)).orderBy('createdAt','desc').limit(26).get();
   const prospect=await view(id,p);
   // Read only cases belonging to this genuinely linked seller. Do not copy message contents.
   let support=[],moreSupport=false;
   if(prospect.seller&&prospect.seller.status!=='review_required'){
    const cases=await db.collection('teyzaSupportTickets').where('ownerUid','==',p.sellerUid).limit(26).get();
    support=cases.docs.slice(0,25).filter(s=>s.data().ownerUid===p.sellerUid).map(s=>{
     const v=s.data();return {id:s.id,subject:String(v.subject||'Support request').slice(0,140),status:String(v.status||'open').slice(0,40),source:v.source==='seller_admin_chat'?'conversation':'case',updatedAt:v.updatedAt||null};
    });moreSupport=cases.docs.length>25;
   }
   return {prospect,events:result.docs.slice(0,25).map(s=>({id:s.id,...s.data()})),moreEvents:result.docs.length>25,support,moreSupport};
  }
  if(action==='ops_acquisition_event'){
   const type=choose(data.type,['permission','contact','contact_update','geography_update','response','app_download','commercial_interest','progress','opt_out','email_sent','help_requested','help_replied','help_resolved'],'activity');
   const note=clean(data.note,'activity note or consent evidence',500);
   if(data.confirmed!==true)D.fail(422,'Confirm this is an accurate record of an actual event.');
   const saved=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);if(!snap.exists)D.fail(404,'Business prospect not found.');
    const p=snap.data();
    if(p.revision!==data.revision)D.fail(409,'This record changed. Refresh before saving.');
    const blocked=p.optedOut===true||await suppressed(p,tx);
    const stamp=clock(),update={updatedAt:stamp,lastActivityAt:stamp,lastActivityBy:uid,revision:p.revision+1};
    let details={note};
    if(type==='contact_update'){
     if(blocked)D.fail(409,'Do not contact: an opt-out is recorded. Contact details cannot be changed here.');
     if(data.authorisedSource!==true)D.fail(422,'Confirm the independently sourced contact details may be retained.');
     const additions={phone:phone(data.phone),email:email(data.email),website:website(data.website)};
     const fields=Object.keys(additions).filter(k=>!!additions[k]);
     if(!fields.length)D.fail(422,'Enter at least one missing contact detail.');
     if(fields.some(k=>!!p[k]))D.fail(409,'Only missing contact details may be added. Existing destinations and permissions cannot be replaced here.');
     if(await suppressed({...p,...Object.fromEntries(fields.map(k=>[k,additions[k]]))},tx))D.fail(409,'Contact is suppressed. Do not add it to this business.');
     for(const key of fields)update[key]=additions[key];
     if(fields.includes('phone'))update.phoneKind=phoneKind(data.phoneKind,additions.phone);
     update.contactNote=contactNote({...p,...update});
     details={...details,fields,contactNote:update.contactNote};
    }
    if(type==='geography_update'){
     if(data.geographyConfirmed!==true)D.fail(422,'Confirm the business geography using a permitted source.');
     if(p.municipality&&p.province)D.fail(409,'Geography is already allocated; escalate corrections for review.');
     update.province=choose(data.province,provinces,'province');
     update.municipality=clean(data.municipality,'municipality',100);
     details={...details,province:update.province,municipality:update.municipality};
    }
    if(type==='response'){
     update.response=choose(data.response,responses,'owner response');
     update.responseRecordedAt=stamp;
     if(update.response==='declined'){update.stage='not_interested';update.nextFollowUpAt=null;}
     details={...details,response:update.response};
    }
    if(type==='app_download'){
     if(data.ownerConfirmedDownload!==true)D.fail(422,'Record actual owner confirmation of the download, not a link click.');
     if(p.downloadConfirmedAt)D.fail(409,'A download confirmation is already recorded.');
     update.downloadConfirmedAt=stamp;
     details={...details,source:'owner_confirmed'};
    }
    if(type==='commercial_interest'){
     if(blocked)D.fail(409,'Do not contact: an opt-out is recorded.');
     const a=p.sellerUid?await tx.get(doc('teyzaSellerAccounts/'+p.sellerUid)):null;
     const seller=a?.exists?a.data():null;
     if(!seller||seller.uid!==p.sellerUid||seller.deletionPending===true||seller.approvalStatus!=='approved'||norm(seller.shopName)!==norm(p.name))
      D.fail(409,'Commercial follow-up requires the genuinely linked approved business.');
     update.commercialInterest={kind:choose(data.interest,commercialInterests,'commercial interest'),recordedAt:stamp,recordedBy:uid};
     details={...details,interest:update.commercialInterest.kind};
    }
    if(type==='permission'||type==='contact'){
     if(blocked)D.fail(409,'Do not contact: an opt-out is recorded for this business or contact.');
     const channel=choose(data.channel,channels,'communication channel');
     if(!contactValue(p,channel))D.fail(422,'This prospect has no contact detail for that channel.');
     if(type==='permission'){
      if(data.ownerOptIn!==true)D.fail(422,'Record explicit permission from the owner for this channel.');
      update.permissions={...p.permissions,[channel]:{granted:true,recordedAt:stamp,recordedBy:uid}};
     }else{
      if(p.permissions?.[channel]?.granted!==true)D.fail(409,'Record actual owner permission for this channel first.');
      update.contactedAt=p.contactedAt||stamp;
      if(channel==='whatsapp')update.lastWhatsAppContactAt=stamp;
     }
     details={...details,channel};
    }
    if(type==='email_sent'){
     const kind=choose(data.kind,emailKinds,'email type');
     if(!p.email)D.fail(422,'This business has no email address.');
     if(data.sentConfirmed!==true)D.fail(422,'Confirm the matching email is visible in Zoho Sent.');
     const sentAt=data.sentAt;
     if(!Number.isSafeInteger(sentAt)||sentAt>stamp||sentAt<stamp-366*86400000)D.fail(422,'Enter the actual sent date and time, not a future date.');
     const reference=clean(data.reference,'Zoho Sent reference',180);
     if(p.outbound?.['email_'+kind]||p.emailHistory?.[kind])D.fail(409,'This email type is already recorded. Check the existing history instead of sending again.');
     if(kind==='invitation'){
      if(blocked||p.permissions?.email?.granted!==true)D.fail(409,'Invitation requires recorded email marketing consent and no opt-out.');
     }else{
      // Operational welcome only: the registered account must be genuine and the recipient must be its owner.
      const a=p.sellerUid?await tx.get(doc('teyzaSellerAccounts/'+p.sellerUid)):null;
      const seller=a?.exists?a.data():null;
      if(!seller||seller.uid!==p.sellerUid||seller.deletionPending===true||norm(seller.shopName)!==norm(p.name)||norm(seller.ownerEmail)!==norm(p.email))
       D.fail(409,'Welcome requires an existing linked seller with the same owner email.');
     }
     const entry={kind,sentAt,recordedAt:stamp,recordedBy:uid,reference,status:'staff_confirmed_in_zoho_sent'};
     update.emailHistory={...p.emailHistory,[kind]:entry};
     if(kind==='invitation')update.contactedAt=p.contactedAt||sentAt;
     details={...details,...entry,channel:'email'};
    }
    if(type==='help_requested'){
     const channel=choose(data.channel,channels,'support channel');
     if(!contactValue(p,channel))D.fail(422,'This business has no contact detail for that channel.');
     if(p.help&&p.help.state!=='resolved')D.fail(409,'An open help request already exists. Record a reply or resolution instead.');
     update.help={state:'open',channel,requestedAt:stamp,updatedAt:stamp};
     details={...details,channel};
    }
    if(type==='help_replied'||type==='help_resolved'){
     if(!p.help||p.help.state==='resolved')D.fail(409,'Record the owner help request first.');
     update.help={...p.help,state:type==='help_replied'?'waiting_for_owner':'resolved',updatedAt:stamp};
     details={...details,channel:p.help.channel};
    }
    if(type==='progress'){
     update.stage=choose(data.stage,stages,'onboarding stage');
     if(blocked&&data.nextFollowUpAt!=null)D.fail(409,'Follow-up cannot be scheduled for an opted-out contact.');
     update.nextFollowUpAt=['not_interested','closed'].includes(update.stage)?null:nextDate(data.nextFollowUpAt,stamp);
     details={...details,stage:update.stage,nextFollowUpAt:update.nextFollowUpAt};
    }
    if(type==='opt_out'){
     update.optedOut=true;update.permissions={};update.nextFollowUpAt=null;update.stage='not_interested';
     // Suppression is irreversible from this workspace, including duplicate businesses with the same contact.
     for(const key of keys(p))tx.set(doc(suppression+'/'+key),{recordedAt:stamp,recordedBy:uid});
    }
    tx.update(ref,update);event(tx,id,uid,type,details);return {...p,...update};
   });
   return {prospect:await view(id,saved)};
  }
  if(action==='ops_acquisition_link'){
   const target=D.id(data.sellerUid);
   if(target===uid)D.fail(403,'Another administrator must link your own business.');
   if(data.ownerConfirmed!==true)D.fail(422,'Confirm that the owner identified this exact existing seller account.');
   const saved=await db.runTransaction(async tx=>{
    const [p,a,l]=await Promise.all([tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+target)),tx.get(doc(links+'/'+target))]);
    if(!p.exists)D.fail(404,'Business prospect not found.');
    const old=p.data(),seller=a.exists?a.data():null;
    if(old.revision!==data.revision)D.fail(409,'Refresh this prospect first.');
    if(old.sellerUid&&old.sellerUid!==target)D.fail(409,'A seller is already linked. Escalate any incorrect link to Admin support.');
    if(l.exists&&l.data().prospectId!==id)D.fail(409,'This seller already belongs to another prospect.');
    if(!seller||seller.uid!==target||seller.deletionPending===true||!['spaza','retail','wholesale'].includes(seller.category)||norm(seller.shopName)!==norm(old.name))
     D.fail(409,'The exact existing seller name and UID must match the prospect.');
    if(old.sellerUid===target)return old;
    const update={sellerUid:target,updatedAt:clock(),lastActivityAt:clock(),lastActivityBy:uid,revision:old.revision+1};
    tx.set(doc(links+'/'+target),{prospectId:id,linkedAt:clock(),linkedBy:uid});
    tx.update(ref,update);event(tx,id,uid,'seller_linked',{sellerUid:target,note:'Owner confirmed existing seller account.'});
    return {...old,...update};
   });
   return {prospect:await view(id,saved)};
  }
  D.fail(404,'Unknown acquisition action.');
 }
 return {execute};
}
module.exports={actions,createAcquisition};
