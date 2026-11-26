'use strict';
// Direct communication outbox. Only recent verified Admin can enqueue through
// the existing operations service. Separate workers alone have provider secrets.
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication'),T=require('./business-message-templates');
const CONTROL='teyzaBusinessCommunicationSettings/control',PROSPECT='teyzaBusinessProspects',SUPPRESSION='teyzaBusinessContactSuppression';
const collections={email:'teyzaBusinessOutboundEmail',whatsapp:'teyzaBusinessOutboundWhatsApp'};
const kinds=['invitation','welcome','membership'];
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const normalizedPhone=v=>String(v||'').replace(/[\s().-]/g,'').replace(/^0(\d{9})$/,'+27$1');
const recipient=(p,c)=>c==='email'?p.email:p.phone;
function configured(cfg,channel,kind){
 if(channel==='email')return cfg?.emailEnabled===true;
 const t=cfg?.whatsappTemplates?.[kind];
 return cfg?.whatsappEnabled===true&&/^\d{5,25}$/.test(cfg.whatsappPhoneNumberId||'')&&/^v\d+\.\d+$/.test(cfg.whatsappApiVersion||'')&&
  t?.approved===true&&/^[a-z0-9_]{1,512}$/.test(t.name||'')&&/^en(?:_[A-Z]{2})?$/.test(t.language||'')&&t.body===T.whatsappBodies[kind];
}
function capabilities(cfg){return Object.fromEntries(Object.keys(collections).map(c=>[c,Object.fromEntries(kinds.map(k=>[k,configured(cfg,c,k)]))]));}
function payload(p,c,k,cfg){
 if(c==='email')return {recipient:p.email,...T.emailText(k,p)};
 const t=cfg.whatsappTemplates[k];return {recipient:p.phone,phoneNumberId:cfg.whatsappPhoneNumberId,apiVersion:cfg.whatsappApiVersion,name:t.name,language:t.language,businessName:String(p.name).replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim(),body:T.whatsappText(k,p)};
}
async function eligibility(db,tx,p,c,k,now){
 const r=recipient(p,c);
 if(c==='email'?!/^[^\s@<>,;:"()\\]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(r||''):!/^\+27\d{9}$/.test(r||''))return false;
 if(c==='whatsapp'||k!=='welcome'){
  if(p.optedOut||p.permissions?.[c]?.granted!==true)return false;
  const keys=[p.phone&&'phone:'+hash(p.phone),p.email&&'email:'+hash(p.email)].filter(Boolean);
  for(const key of keys)if((await tx.get(db.doc(SUPPRESSION+'/'+key))).exists)return false;
 }
 if(k==='invitation')return !p.sellerUid;
 if(!p.sellerUid)return false;
 const s=await tx.get(db.doc('teyzaSellerAccounts/'+p.sellerUid)),a=s.exists?s.data():null;
 if(!a||a.uid!==p.sellerUid||a.deletionPending===true||norm(a.shopName)!==norm(p.name)|| (c==='email'?norm(a.ownerEmail)!==norm(r):normalizedPhone(a.phone)!==r))return false;
 if(k==='welcome')return true;
 if(a.approvalStatus!=='approved')return false;
 const b=await tx.get(db.doc('teyzaBilling/'+p.sellerUid)),billing=b.exists?b.data():null;
 return !P.eligible(p.sellerUid,a,billing,now);
}
function key(c,k){return c+'_'+k;}
function entry(p,c,k){return p.outbound?.[key(c,k)];}
function legacy(p,c,k){return c==='email'&&!!p.emailHistory?.[k];}
function write(db,tx,ref,p,c,k,job,state,clock,extra={}){
 const at=clock(),log={channel:c,kind:k,status:state,requestedAt:job.requestedAt,updatedAt:at,requestedBy:job.actorUid,...extra};
 tx.update(ref,{outbound:{...p.outbound,[key(c,k)]:log},updatedAt:at,lastActivityAt:at,lastActivityBy:job.actorUid,revision:p.revision+1});
 tx.set(db.doc(ref.path+'/events/'+crypto.randomUUID()),{type:'message_'+state,channel:c,kind:k,actorUid:job.actorUid,createdAt:at,note:'Direct '+c+' '+k+' — '+state.replaceAll('_',' '),...extra});
 return log;
}
function createCommunication({db,clock=Date.now}){
 async function caps(){const s=await db.doc(CONTROL).get();return capabilities(s.exists?s.data():null);}
 async function enqueue(uid,id,data){
  const c=data.channel,k=data.kind;
  if(!Object.hasOwn(collections,c)||!kinds.includes(k)||data.confirmed!==true)D.fail(422,'Choose a message and confirm the recipient and send.');
  const ref=db.doc(PROSPECT+'/'+id),jobRef=db.doc(collections[c]+'/'+hash(id+'|'+c+'|'+k));
  return db.runTransaction(async tx=>{
   const [s,old,config]=await Promise.all([tx.get(ref),tx.get(jobRef),tx.get(db.doc(CONTROL))]);
   if(!s.exists)D.fail(404,'Business prospect not found.');
   const p=s.data(),cfg=config.exists?config.data():null;
   if(p.revision!==data.revision)D.fail(409,'Refresh this prospect first.');
   if(old.exists||entry(p,c,k)||legacy(p,c,k))D.fail(409,'Message already recorded or requested. Check history before sending again.');
   if(!configured(cfg,c,k))D.fail(409,'Direct sending is not enabled for this message.');
   if(!await eligibility(db,tx,p,c,k,clock()))D.fail(409,'Recipient, consent, opt-out or account eligibility check failed.');
   const draft=payload(p,c,k,cfg),job={prospectId:id,channel:c,kind:k,actorUid:uid,recipient:recipient(p,c),draftHash:hash(JSON.stringify(draft)),requestedAt:clock(),status:'queued'};
   tx.set(jobRef,job);return {message:write(db,tx,ref,p,c,k,job,'queued',clock)};
  });
 }
 return {caps,enqueue};
}
function createWorker({db,channel,send,clock=Date.now}){
 if(!Object.hasOwn(collections,channel))throw Error('Unknown channel');
 async function process(id){
  if(!/^[a-f0-9]{64}$/.test(id))return;
  const jobRef=db.doc(collections[channel]+'/'+id);
  const claim=await db.runTransaction(async tx=>{
   const j=await tx.get(jobRef);
   if(!j.exists||j.data().status!=='queued')return null;
   const job=j.data(),k=job.kind;
   if(job.channel!==channel||!kinds.includes(k)||typeof job.prospectId!=='string'||! /^[a-f0-9]{64}$/.test(job.prospectId))return null;
   const ref=db.doc(PROSPECT+'/'+job.prospectId),[s,control]=await Promise.all([tx.get(ref),tx.get(db.doc(CONTROL))]);
   if(!s.exists){tx.update(jobRef,{status:'cancelled',updatedAt:clock()});return null;}
   const p=s.data(),cfg=control.exists?control.data():null;
   const ready=entry(p,channel,k)?.status==='queued'&&!legacy(p,channel,k)&&recipient(p,channel)===job.recipient&&
    Number.isSafeInteger(job.requestedAt)&&job.requestedAt<=clock()&&clock()-job.requestedAt<600000&&configured(cfg,channel,k)&&
    await eligibility(db,tx,p,channel,k,clock());
   const draft=ready?payload(p,channel,k,cfg):null;
   if(!ready||hash(JSON.stringify(draft))!==job.draftHash){
    tx.update(jobRef,{status:'cancelled',updatedAt:clock()});write(db,tx,ref,p,channel,k,job,'cancelled',clock);return null;
   }
   tx.update(jobRef,{status:'sending',updatedAt:clock()});write(db,tx,ref,p,channel,k,job,'sending',clock);
   return {job,draft};
  });
  if(!claim)return;
  let providerId=null;
  try{providerId=await send(claim.draft);if(typeof providerId!=='string'||providerId.length>300||!providerId)providerId=null;}catch{}
  // No automatic retries once claimed, including on timeouts or ledger failure.
  await db.runTransaction(async tx=>{
   const j=await tx.get(jobRef),job=claim.job,ref=db.doc(PROSPECT+'/'+job.prospectId),s=await tx.get(ref);
   if(!j.exists||j.data().status!=='sending')return;
   const status=providerId?'accepted':'review_required',extra=providerId?{providerId,acceptedAt:clock()}:{};
   tx.update(jobRef,{status,updatedAt:clock(),...extra});
   if(s.exists){const p=s.data();write(db,tx,ref,p,channel,job.kind,job,status,clock,extra);}
  });
 }
 return {process};
}
module.exports={CONTROL,collections,capabilities,configured,createCommunication,createWorker};
