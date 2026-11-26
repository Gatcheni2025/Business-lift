'use strict';
const crypto=require('node:crypto'),D=require('./domain');
const collection='teyzaBusinessProspects',suppression='teyzaBusinessContactSuppression',links='teyzaBusinessProspectSellerLinks';
const actions=new Set(['ops_acquisition_list','ops_acquisition_create','ops_acquisition_detail','ops_acquisition_event','ops_acquisition_link']);
const cities=['Durban','Johannesburg'];
const categories=['spaza','retail','food','salon','service','wholesale','manufacturer','other'];
const sources=['owner_inquiry','partner_introduction','owner_provided','permitted_business_directory','in_person','other_permitted'];
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
const contactValue=(p,c)=>c==='email'?p.email:p.phone;
function keys(p){return [...new Set([p.phone?'phone:'+hash(p.phone):null,p.email?'email:'+hash(p.email):null].filter(Boolean))];}
const nextDate=(v,now)=>{
 if(v===null||v===undefined||v==='')return null;
 if(!Number.isSafeInteger(v)||v<now-86400000||v>now+366*86400000)D.fail(422,'Choose a follow-up date within one year.');
 return v;
};
function createAcquisition({db,clock=Date.now}){
 const doc=p=>db.doc(p),read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
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
    const s=await read('teyzaPublicShops/'+p.sellerUid);
    seller={uid:p.sellerUid,status:['approved','pending','rejected','suspended','needs_changes'].includes(a.approvalStatus)?a.approvalStatus:'pending',
     listed:s?.sellerUid===p.sellerUid&&s.status==='active'};
   }else seller={uid:p.sellerUid,status:'review_required',listed:false};
  }
  return {id,name:p.name,city:p.city,area:p.area,address:p.address,category:p.category,phone:p.phone,email:p.email,
   source:p.source,sourceReference:p.sourceReference,stage:p.stage,permissions:p.permissions||{},optedOut:blocked,
   nextFollowUpAt:blocked?null:p.nextFollowUpAt??null,createdAt:p.createdAt,updatedAt:p.updatedAt,lastActivityAt:p.lastActivityAt,
   lastActivityBy:p.lastActivityBy,assignedTo:p.assignedTo,revision:p.revision,seller};
 }
 async function execute(auth,action,data){
  const uid=D.id(auth.uid);
  if(action==='ops_acquisition_list'){
   let q=db.collection(collection).orderBy('__name__').limit(31);
   if(data.after)q=q.startAfter(D.id(data.after));
   const result=await q.get(),rows=result.docs.slice(0,30);
   return {schema:1,prospects:await Promise.all(rows.map(s=>view(s.id,s.data()))),next:result.docs.length>30?rows[29].id:null};
  }
  if(action==='ops_acquisition_create'){
   if(data.authorisedSource!==true)D.fail(422,'Confirm that Teyza may retain these business contact details.');
   const name=clean(data.name,'business name',120),city=choose(data.city,cities,'pilot city'),area=clean(data.area,'township or area',100),address=clean(data.address,'business street address or landmark',220);
   const category=choose(data.category,categories,'business category'),source=choose(data.source,sources,'source');
   const sourceReference=clean(data.sourceReference,'source and permission to retain details',240);
   const contact={phone:phone(data.phone),email:email(data.email)};
   const id=hash([city,area,address,name].map(norm).join('|')),ref=doc(collection+'/'+id);
   const saved=await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(old.exists)D.fail(409,'This business already exists for the same name and location. Open its existing record.');
    const p={name,city,area,address,category,source,sourceReference,...contact,stage:'identified',permissions:{},optedOut:false,nextFollowUpAt:null,
     sellerUid:null,assignedTo:uid,createdAt:clock(),updatedAt:clock(),lastActivityAt:clock(),lastActivityBy:uid,revision:0};
    tx.set(ref,p);event(tx,id,uid,'created',{});return p;
   });
   return {prospect:await view(id,saved)};
  }
  const id=D.id(data.id),ref=doc(collection+'/'+id);
  if(action==='ops_acquisition_detail'){
   const p=await read(collection+'/'+id);if(!p)D.fail(404,'Business prospect not found.');
   const result=await db.collection(eventsPath(id)).orderBy('createdAt','desc').limit(26).get();
   return {prospect:await view(id,p),events:result.docs.slice(0,25).map(s=>({id:s.id,...s.data()})),moreEvents:result.docs.length>25};
  }
  if(action==='ops_acquisition_event'){
   const type=choose(data.type,['permission','contact','progress','opt_out'],'activity');
   const note=clean(data.note,'activity note or consent evidence',500);
   if(data.confirmed!==true)D.fail(422,'Confirm this is an accurate record of an actual event.');
   const saved=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);if(!snap.exists)D.fail(404,'Business prospect not found.');
    const p=snap.data();
    if(p.revision!==data.revision)D.fail(409,'This record changed. Refresh before saving.');
    const blocked=p.optedOut===true||await suppressed(p,tx);
    const stamp=clock(),update={updatedAt:stamp,lastActivityAt:stamp,lastActivityBy:uid,revision:p.revision+1};
    let details={note};
    if(type==='permission'||type==='contact'){
     if(blocked)D.fail(409,'Do not contact: an opt-out is recorded for this business or contact.');
     const channel=choose(data.channel,channels,'communication channel');
     if(!contactValue(p,channel))D.fail(422,'This prospect has no contact detail for that channel.');
     if(type==='permission'){
      if(data.ownerOptIn!==true)D.fail(422,'Record explicit permission from the owner for this channel.');
      update.permissions={...p.permissions,[channel]:{granted:true,recordedAt:stamp,recordedBy:uid}};
     }else if(p.permissions?.[channel]?.granted!==true)D.fail(409,'Record actual owner permission for this channel first.');
     details={...details,channel};
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
