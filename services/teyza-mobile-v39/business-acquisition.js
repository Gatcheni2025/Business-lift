'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication'),{createCommunication}=require('./business-communications');
const G=require('./acquisition-geography'),R=require('./acquisition-report'),S=require('./acquisition-summary');
const collection='teyzaBusinessProspects',suppression='teyzaBusinessContactSuppression',links='teyzaBusinessProspectSellerLinks',placeLinks='teyzaBusinessProspectPlaceLinks',identityLinks='teyzaBusinessProspectIdentityKeys';
const actions=new Set(['ops_acquisition_list','ops_acquisition_create','ops_acquisition_place_matches','ops_acquisition_detail','ops_acquisition_event','ops_acquisition_link','ops_acquisition_send','ops_acquisition_localities','ops_acquisition_locality_browse','ops_acquisition_command_page','ops_acquisition_manual_whatsapp']);
const provinces=G.provinces;
const legacyProvince=Object.freeze({Durban:'KwaZulu-Natal',Johannesburg:'Gauteng'});
const cities=Object.keys(legacyProvince);
const phoneKinds=['unconfirmed','whatsapp_only'];
const responses=['interested','needs_help','declined','other_response'];
const commercialInterests=['advertising','selling','both','not_now'];
const categories=['spaza','retail','food','salon','service','wholesale','manufacturer','other'];
const sources=['owner_inquiry','partner_introduction','owner_provided','permitted_business_directory','in_person','other_permitted'];
const emailKinds=['invitation','welcome','onboarding_guide'];
const manualPurposes=['introduction',...emailKinds.map(k=>'email_notice_'+k)];
const officialMetaSender='+27798261972';
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
const geography=G.projectedGeography;
const identityKey=(province,name,address)=>hash([province,name,address].map(norm).join('|'));
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
function createAcquisition({db,clock=Date.now,geographyLookup=G.createGeography()} ){
 const doc=p=>db.doc(p),read=async(p,tx=null)=>{const ref=doc(p),s=await(tx?tx.get(ref):ref.get());return s.exists?s.data():null;};
 const communications=createCommunication({db,clock});
 const eventsPath=id=>collection+'/'+id+'/events';
 // Exact normalized name/address in a province is deliberately conservative.
 // Keep every historic document ID and never merge businesses on a fuzzy name.
 async function checkLegacyIdentity(tx,province,name,address,exclude){
  const pilot=cities.find(c=>legacyProvince[c]===province);if(!pilot)return;
  let after=null,scanned=0;
  do{
   let q=db.collection(collection).where('city','==',pilot).orderBy('__name__').limit(201);
   if(after)q=q.startAfter(after);
   const page=await tx.get(q),rows=page.docs.slice(0,200);
   for(const row of rows){const v=row.data();if(row.id!==exclude&&geography(v).province===province&&norm(v.name)===norm(name)&&norm(v.address)===norm(address))D.fail(409,'A legacy business matches this name and address. Open its existing record; do not create another.');}
   scanned+=rows.length;after=page.docs.length>200?rows.at(-1).id:null;
   if(after&&scanned>=5000)D.fail(409,'Legacy identity reconciliation requires an audited index backfill before creating more businesses in this province.');
  }while(after);
 }
 async function allocation(data,province,municipality,area){
  if(!data.localityId)return {province,municipality,township:area,geographySource:'provisional'};
  const official=await geographyLookup.resolve(data.localityId);
  if(official.province!==province||official.geographySource!==G.SOURCE||official.geographySourceVintage!==G.VINTAGE)D.fail(422,'Official locality does not match the selected province.');
  // Canonical names and codes are derived server-side, never copied from hidden client fields.
  return {...official,geographyVerifiedAt:clock()};
 }
 function event(tx,id,uid,type,details){
  tx.set(doc(eventsPath(id)+'/'+crypto.randomUUID()),{actorUid:uid,type,...details,createdAt:clock()});
 }
 async function suppressed(p,tx=null){
  const refs=keys(p).map(k=>doc(suppression+'/'+k));
  const rows=await Promise.all(refs.map(r=>tx?tx.get(r):r.get()));
  return rows.some(s=>s.exists);
 }
 async function historical(id,p,tx,now){
  return R.history(p,async()=>{
   const events=await R.allRows(()=>db.collection(eventsPath(id)).where('type','in',['contact','email_sent','message_accepted']),q=>tx?tx.get(q):q.get());
   return events.map(s=>s.data());
  },now);
 }
 // Page-local loader. Every bulk read and every residual ledger query uses the
 // caller's exact read-only transaction. Never reuse cached facts across pages,
 // snapshots, or mutation endpoints.
 const sellerKey=p=>typeof p.sellerUid==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(p.sellerUid)?p.sellerUid:null;
 const validLink=(id,p,key,a,linked)=>Boolean(key&&a?.uid===key&&linked?.prospectId===id&&a.deletionPending!==true&&norm(a.shopName)===norm(p.name)&&['spaza','retail','wholesale'].includes(a.category));
 async function snapshotLoader(rows,tx,asOf){
  const cache=new Map(),histories=new Map(),campaigns=new Map();
  const entries=rows.map(s=>({id:s.id,p:s.data()}));
  async function load(paths){
   const pending=[...new Set(paths)].filter(path=>!cache.has(path));
   for(let i=0;i<pending.length;i+=200){
    const chunk=pending.slice(i,i+200),snapshots=await tx.getAll(...chunk.map(doc));
    if(snapshots.length!==chunk.length)throw Error('Incomplete snapshot batch read.');
    const byPath=new Map(snapshots.map(s=>[s.ref.path,s]));
    for(const path of chunk){const s=byPath.get(path);if(!s)throw Error('Missing snapshot batch result.');cache.set(path,s.exists?s.data():null);}
   }
  }
  const get=path=>{if(!cache.has(path))throw Error('Unplanned snapshot dependency: '+path.split('/')[0]);return cache.get(path);};
  await load(entries.flatMap(({p})=>[...(p.optedOut===true?[]:keys(p).map(k=>suppression+'/'+k)),...(sellerKey(p)?['teyzaSellerAccounts/'+sellerKey(p),links+'/'+sellerKey(p)]:[])]));
  const owners=new Map();
  for(const {id,p} of entries){const key=sellerKey(p);if(key){const a=get('teyzaSellerAccounts/'+key);if(validLink(id,p,key,a,get(links+'/'+key)))owners.set(key,a);}}
  const dependent=['teyzaPublicShops/','teyzaBilling/','teyzaSellerOnboarding/','teyzaMobileVerification/','teyzaSellerIdentity/','teyzaShopFrontPhotos/','teyzaShopLocations/'];
  // Legacy events lack a parent-id field that would allow one collection-group
  // query. Preserve complete history via bounded concurrent ledger queries.
  // Ads do have ownerUid, so share a paginated IN query across up to 30 owners.
  const legacy=entries.filter(({p})=>p.historyVersion!==1);
  const advertising=[...owners].filter(([,a])=>a.approvalStatus==='approved'&&['spaza','retail'].includes(a.category)).map(([id])=>id);
  const tasks=legacy.map(({id,p})=>async()=>{histories.set(id,await historical(id,p,tx,asOf));});
  for(let i=0;i<advertising.length;i+=30){
   const ids=advertising.slice(i,i+30);
   tasks.push(async()=>{
    const ads=await R.allRows(()=>db.collection('teyzaShopperAds').where('ownerUid','in',ids),q=>tx.get(q),{limit:10000*ids.length});
    for(const row of ads){
     const owner=row.data().ownerUid;if(!ids.includes(owner))throw Error('Unexpected campaign owner.');
     const owned=campaigns.get(owner)||[];owned.push(row);
     if(owned.length>10000)D.fail(503,'A seller campaign ledger exceeds the safe reporting bound.');
     campaigns.set(owner,owned);
    }
   });
  }
  await Promise.all([load([...owners.keys()].flatMap(id=>dependent.map(prefix=>prefix+id))), (async()=>{
   for(let i=0;i<tasks.length;i+=24)await Promise.all(tasks.slice(i,i+24).map(fn=>fn()));
  })()]);
  await load([...campaigns.values()].flatMap(rows=>rows.map(s=>s.data()).filter(a=>a.status==='active'&&Number.isFinite(a.startsAt)&&Number.isFinite(a.endsAt)&&a.startsAt<=asOf&&a.endsAt>asOf&&typeof a.paymentReference==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(a.paymentReference)).map(a=>'teyzaAdPayments/'+a.paymentReference)));
  return {read:async path=>get(path),blocked:p=>p.optedOut===true||keys(p).some(k=>get(suppression+'/'+k)!==null),
   history:(id,p)=>p.historyVersion===1?R.history(p,()=>{throw Error('Unexpected legacy lookup');},asOf):histories.get(id),
   ads:async id=>campaigns.get(id)||[]};
 }
 async function view(id,p,tx=null,asOf=clock(),loader=null){
  const readDoc=loader?loader.read:path=>read(path,tx);
  const [blocked,history]=await Promise.all(loader?[loader.blocked(p),loader.history(id,p)]:[p.optedOut===true?true:suppressed(p,tx),historical(id,p,tx,asOf)]);
  let seller=null;
  if(p.sellerUid){
   const key=sellerKey(p);
   const [a,linked]=key?await Promise.all([readDoc('teyzaSellerAccounts/'+key),readDoc(links+'/'+key)]):[];
   if(validLink(id,p,key,a,linked)){
    const [s,billing]=await Promise.all([readDoc('teyzaPublicShops/'+key),readDoc('teyzaBilling/'+key)]);
    const facts=await R.sellerSignals({id:key,account:a,shop:s,billing,read:readDoc,ads:loader?loader.ads:uid=>R.allRows(()=>db.collection('teyzaShopperAds').where('ownerUid','==',uid),q=>tx?tx.get(q):q.get()),now:asOf});
    seller={uid:key,status:['approved','pending','rejected','suspended','needs_changes'].includes(a.approvalStatus)?a.approvalStatus:'pending',
     ...facts,registeredAt:Number.isSafeInteger(a.createdAt)&&a.createdAt>0&&a.createdAt<=asOf?a.createdAt:null,approvedAt:facts.approved&&Number.isSafeInteger(a.approvedAt)&&a.approvedAt>0&&a.approvedAt<=asOf?a.approvedAt:null,welcomeEmailEligible:!!p.email&&norm(a.ownerEmail)===norm(p.email),
     welcomeWhatsAppEligible:!!p.phone&&String(a.phone||'').replace(/[\s().-]/g,'').replace(/^0(\d{9})$/,'+27$1')===p.phone,
     membershipEligible:facts.approved&&!facts.sellingAccess};
   }else seller={uid:key||null,status:'review_required',listed:false,welcomeEmailEligible:false};
  }
  const prospect={id,name:p.name,city:p.city,area:p.area,address:p.address,category:p.category,phone:p.phone,email:p.email,website:p.website||'',googlePlaceId:p.googlePlaceId||'',
   ...geography(p),phoneKind:p.phoneKind||'unconfirmed',contactNote:contactNote(p),
   contactQueue:blocked?'blocked':p.phone||p.email?'contact_details_available':'field_visit',
   ...acquisitionProgress(p),...history,
   source:p.source,sourceReference:p.sourceReference,stage:p.stage,permissions:p.permissions||{},optedOut:blocked,
   nextFollowUpAt:blocked?null:p.nextFollowUpAt??null,createdAt:p.createdAt,updatedAt:p.updatedAt,lastActivityAt:p.lastActivityAt,
   lastActivityBy:p.lastActivityBy,assignedTo:p.assignedTo,revision:p.revision,seller,
   emailHistory:p.emailHistory||{},outbound:p.outbound||{},manualWhatsApp:p.manualWhatsApp||{},help:p.help||null};
  const queues=R.classify(prospect,asOf).queues;return {...prospect,workQueues:Object.keys(queues).filter(k=>queues[k])};
 }
 // Snapshot pages are anchored at one Firestore readTime. Every seller, payment,
 // suppression and legacy-event join uses the SAME read-only transaction.
 // No count is returned as a national total until the client has consumed the
 // final cursor. These pages support sparse results without skipping records.
 async function commandPage(data,internalSize=30){
  const filters=R.parseFilters(data.filters),now=clock();
  const asOf=data.asOf??(Math.floor(now/1000)*1000-1000);
  if(!Number.isSafeInteger(asOf)||asOf>now||now-asOf>55*60000||data.after&&!data.asOf)D.fail(422,'The report snapshot expired. Refresh the national command centre.');
  const cursor=data.after?D.id(data.after):null,includeRows=data.includeRows!==false;
  const {Timestamp}=require('firebase-admin/firestore');
  return db.runTransaction(async tx=>{
   const size=includeRows?internalSize:60;
   // Use indexed equality for the most geographically selective available
   // field. Pilot provinces have two ordered streams, because older records
   // have only city. Merge by document ID before taking the page boundary;
   // the common cursor is safe for both streams and duplicate IDs count once.
   const select=[];
   if(filters.localityId)select.push(['localityId',filters.localityId]);
   else if(filters.municipalityCode)select.push(['municipalityCode',filters.municipalityCode]);
   else if(filters.province){select.push(['province',filters.province]);const pilot=cities.find(c=>legacyProvince[c]===filters.province);if(pilot)select.push(['city',pilot]);}
   else if(filters.category)select.push(['category',filters.category]);
   else select.push(null);
   const pages=await Promise.all(select.map(async field=>{
    let q=db.collection(collection);if(field)q=q.where(field[0],'==',field[1]);
    q=q.orderBy('__name__').limit(size+1);if(cursor)q=q.startAfter(cursor);return tx.get(q);
   }));
   const candidates=[...new Map(pages.flatMap(p=>p.docs).map(s=>[s.id,s])).values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
   const rows=candidates.slice(0,size),counts=R.emptyCounts(),prospects=[];
   const matched=rows.filter(s=>R.matches(s.data(),filters));
   const loader=await snapshotLoader(matched,tx,asOf);
   const views=await Promise.all(matched.map(s=>view(s.id,s.data(),tx,asOf,loader)));
   for(const p of views){const facts=R.classify(p,asOf);R.addCounts(counts,facts);if(includeRows&&(!filters.queue||facts.queues[filters.queue]))prospects.push(p);}
   const next=candidates.length>size?rows.at(-1).id:null;
   return {schema:2,asOf,filters,scanned:rows.length,counts,prospects,next,complete:next===null};
  },{readOnly:true,readTime:Timestamp.fromMillis(asOf)});
 }
 async function execute(auth,action,data){
  const uid=D.id(auth.uid);
  if(action==='ops_acquisition_localities')return geographyLookup.search(data.province,data.query);
  if(action==='ops_acquisition_locality_browse')return geographyLookup.browse(data.province,data.query??'',data.offset??0);
  if(action==='ops_acquisition_command_page'){
   if(data.preferSummary===true||data.summaryGeneration!==undefined){const summary=await S.readSummaryPage({db,data,clock});if(summary)return summary;}
   return commandPage(data);
  }
  if(action==='ops_acquisition_list'){
   let q=db.collection(collection).orderBy('__name__').limit(31);
   if(data.after)q=q.startAfter(D.id(data.after));
   const asOf=clock();
   const [page,caps]=await Promise.all([db.runTransaction(async tx=>{
    const result=await tx.get(q),rows=result.docs.slice(0,30),loader=await snapshotLoader(rows,tx,asOf);
    return {prospects:await Promise.all(rows.map(s=>view(s.id,s.data(),tx,asOf,loader))),next:result.docs.length>30?rows[29].id:null};
   },{readOnly:true}),communications.caps()]);
   return {schema:1,...page,communications:caps};
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
   const geo=await allocation(data,province,municipality,area);
   const key=identityKey(province,name,address),keyRef=doc(identityLinks+'/'+key);
   const legacyId=hash([city,area,address,name].map(norm).join('|'));
   const id=national?hash([province,city,area,address,name].map(norm).join('|')):legacyId,ref=doc(collection+'/'+id);
   const saved=await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    const historic=national?await tx.get(doc(collection+'/'+legacyId)):old;
    const identity=await tx.get(keyRef);
    if(identity.exists||historic.exists)D.fail(409,'This business already exists or needs identity review. Open the existing record.');
    await checkLegacyIdentity(tx,province,name,address,id);
    const placeRef=googlePlaceId?doc(placeLinks+'/'+hash(googlePlaceId)):null;
    const placeLink=placeRef?await tx.get(placeRef):null;
    if(placeLink?.exists)D.fail(409,'This listing already has an added business. Search again and open its existing record.');
    if(old.exists)D.fail(409,'This business already exists for the same name and location. Open its existing record.');
    if(initialChannels.length&&await suppressed(contact,tx))D.fail(409,'Contact is suppressed. Do not record new marketing consent here.');
    const permissions=Object.fromEntries(initialChannels.map(c=>[c,{granted:true,recordedAt:clock(),recordedBy:uid}]));
    const p={name,city,area,...geo,identityKey:key,historyVersion:1,address,category,source,sourceReference,...contact,googlePlaceId,stage:'identified',permissions,optedOut:false,nextFollowUpAt:null,
     sellerUid:null,assignedTo:uid,createdAt:clock(),updatedAt:clock(),lastActivityAt:clock(),lastActivityBy:uid,revision:0};
    tx.set(ref,p);tx.set(keyRef,{prospectId:id,province,createdAt:clock(),createdBy:uid});if(placeRef)tx.set(placeRef,{prospectId:id,linkedAt:clock(),linkedBy:uid});event(tx,id,uid,'created',{contactNote:contact.contactNote,province,municipality:geo.municipality,localityId:geo.localityId||null});for(const channel of initialChannels)event(tx,id,uid,'permission',{channel,note:initialNote});return p;
   });
   return {prospect:await view(id,saved)};
  }
  const id=D.id(data.id),ref=doc(collection+'/'+id);
  // Manual acquisition is deliberately not a provider send. Require a fresh
  // server-side permission/suppression/history check for both the draft and
  // subsequent staff attestation. A wa.me link cannot select the logged-in
  // WhatsApp account or prove that a message was sent.
  async function manualDraft(p,tx){
   const purpose=choose(data.purpose,manualPurposes,'manual WhatsApp purpose'),sender=phone(data.sender);
   if(!sender||sender===officialMetaSender||sender===p.phone)D.fail(422,'Choose the separate Teyza manual WhatsApp Business number, not the Meta sender or recipient.');
   if(!p.phone||p.optedOut===true||await suppressed(p,tx)||p.permissions?.whatsapp?.granted!==true)D.fail(409,'Record current owner WhatsApp permission and a permitted number first.');
   if(['not_interested','closed'].includes(p.stage)||p.response==='declined')D.fail(409,'This business is closed or declined. Do not send another introduction or reminder.');
   if(p.manualWhatsApp?.[purpose]?.sentAt)D.fail(409,'Manual message already recorded. Review history before sending again.');
   const name=String(p.name||'Business').replace(/[\u0000-\u001f\u007f]+/g,' ').trim();
   if(purpose==='introduction'){
    const history=await historical(id,p,tx,clock());
    if(R.priorOutreach({...p,...history}))D.fail(409,'Prior outreach or registration exists. Do not send another initial introduction.');
    return {purpose,sender,recipient:p.phone,text:['Good day '+name+' team! 👋','Welcome to Teyza! 🌱 We help South African local businesses become easier to discover. Joining and verification are free. Once approved, you can explore advertising and eligible selling opportunities.','Would you like help joining Teyza? Reply YES for assistance or STOP to opt out.','Teyza Business Growth Team · https://teyza.co.za/for-shop-owners.html'].join('\n\n')};
   }
   const kind=purpose.slice('email_notice_'.length),direct=p.outbound?.['email_'+kind],manual=p.emailHistory?.[kind];
   const accepted=direct?.status==='accepted'&&typeof direct.providerId==='string'&&direct.providerId&&Number.isSafeInteger(direct.acceptedAt)&&direct.acceptedAt<=clock();
   const verified=manual?.status==='staff_confirmed_in_zoho_sent'&&Number.isSafeInteger(manual.sentAt)&&manual.sentAt<=clock()&&typeof manual.reference==='string'&&manual.reference;
   if(!p.email||!accepted&&!verified)D.fail(409,'Wait for Zoho acceptance or verify the email in Zoho Sent before reminding the owner. Queued or uncertain sends are not evidence.');
   if(kind==='welcome'){
    const a=p.sellerUid?await read('teyzaSellerAccounts/'+p.sellerUid,tx):null;
    if(!a||a.uid!==p.sellerUid||a.deletionPending===true||norm(a.shopName)!==norm(p.name)||norm(a.ownerEmail)!==norm(p.email))D.fail(409,'The linked business account and owner email must still match.');
   }
   return {purpose,sender,recipient:p.phone,text:['Good day '+name+' team! 🌱',kind==='welcome'?'Your Teyza registration welcome email has been sent to your recorded email address.':'Your Teyza information and getting-started guide has been sent to your recorded email address.','Please check your inbox (and spam folder if necessary). Reply if you need help with the app or your business profile.','Teyza Business Growth Team · Reply STOP to opt out.'].join('\n\n')};
  }
  if(action==='ops_acquisition_manual_whatsapp'){
   return db.runTransaction(async tx=>{
    const p=await read(collection+'/'+id,tx);if(!p)D.fail(404,'Business prospect not found.');
    if(p.revision!==data.revision)D.fail(409,'Refresh this record before preparing a message.');
    return {draft:await manualDraft(p,tx)};
   },{readOnly:true});
  }
  if(action==='ops_acquisition_send'){
   if(data.kind==='invitation'){
    const p=await read(collection+'/'+id);if(!p)D.fail(404,'Business prospect not found.');
    // enqueue independently rechecks the exact revision and consent in a
    // transaction. No second initial invitation after historical outreach.
    if(R.priorOutreach({...p,...await historical(id,p,null,clock())}))D.fail(409,'Prior outreach or progress exists. Review contact history instead of sending another initial invitation.');
   }
   return communications.enqueue(uid,id,data);
  }
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
   const type=choose(data.type,['permission','contact','contact_update','geography_update','response','app_download','commercial_interest','progress','opt_out','email_sent','help_requested','help_replied','help_resolved','manual_whatsapp_opened','manual_whatsapp_sent'],'activity');
   const note=clean(data.note,'activity note or consent evidence',500);
   if(data.confirmed!==true)D.fail(422,'Confirm this is an accurate record of an actual event.');
   // Resolve an official reference before a Firestore transaction; transaction retries never call external GIS.
   const proposedGeo=type==='geography_update'?await allocation(data,choose(data.province,provinces,'province'),clean(data.municipality,'municipality',100),clean(data.township||'','township',100,false)):null;
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
     const previous=geography(p);
     if(!previous.geographyNeedsReview)D.fail(409,'Official geography is already allocated; escalate corrections for review.');
     if(previous.province&&previous.province!==proposedGeo.province)D.fail(409,'Province correction requires identity review; existing history is preserved.');
     const key=identityKey(proposedGeo.province,p.name,p.address),keyRef=doc(identityLinks+'/'+key),identity=await tx.get(keyRef);
     if(identity.exists&&identity.data().prospectId!==id)D.fail(409,'Another prospect has the same identity. Review both records; never merge automatically.');
     await checkLegacyIdentity(tx,proposedGeo.province,p.name,p.address,id);
     Object.assign(update,proposedGeo,{township:proposedGeo.township||p.area,identityKey:key});
     details={...details,province:update.province,municipality:update.municipality,localityId:update.localityId||null};
     if(!identity.exists)tx.set(keyRef,{prospectId:id,province:update.province,createdAt:stamp,createdBy:uid});
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
    if(type==='manual_whatsapp_opened'||type==='manual_whatsapp_sent'){
     const draft=await manualDraft(p,tx),old=p.manualWhatsApp?.[draft.purpose];
     if(type==='manual_whatsapp_sent'&&data.sentConfirmed!==true)D.fail(422,'Confirm the actual sent message in the selected manual WhatsApp account.');
     if(type==='manual_whatsapp_opened'&&old?.openedAt)D.fail(409,'Chat opening already recorded. Record the actual send only after it happens.');
     const entry={...old,purpose:draft.purpose,sender:draft.sender,
      ...(type==='manual_whatsapp_opened'?{openedAt:stamp,openedBy:uid,openedSender:draft.sender}:{sentAt:stamp,sentBy:uid,sentSender:draft.sender})};
     update.manualWhatsApp={...p.manualWhatsApp,[draft.purpose]:entry};
     if(type==='manual_whatsapp_sent'){update.contactedAt=p.contactedAt||stamp;update.lastWhatsAppContactAt=stamp;}
     details={...details,channel:'whatsapp',purpose:draft.purpose,sender:draft.sender};
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
     }else if(kind==='onboarding_guide'){
      if(blocked||p.permissions?.email?.granted!==true||!['interested','needs_help'].includes(p.response)||data.ownerRequestedGuide!==true)D.fail(409,'A requested onboarding/training guide needs actual owner interest, email consent and a recorded request.');
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
 return {execute,collectReportingGeneration:asOf=>S.collectGeneration({asOf,readPage:data=>commandPage(data,60),pageSize:60})};
}
module.exports={actions,createAcquisition};
