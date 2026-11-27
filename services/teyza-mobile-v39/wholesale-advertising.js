'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication'),
  {recentAdmin}=require('./seller-experience');
const actions=new Set(['wholesale_spaza_directory','wholesale_ad_preferences',
  'wholesale_ad_opt_in','wholesale_ad_submit','wholesale_ads','wholesale_ad_pause',
  'wholesale_spaza_invite','wholesale_spaza_accept_invite',
  'ops_wholesale_ads_queue','ops_wholesale_ad_review']);
function createWholesaleAdvertising({db,clock=Date.now,rate=async()=>{}}){
 const doc=p=>db.doc(p);
 const read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
 const check=async(uid,category,{paid=false}={})=>{
  const [a,o,v,p,b]=await Promise.all([
   read('teyzaSellerAccounts/'+uid),read('teyzaSellerOnboarding/'+uid),
   read('teyzaMobileVerification/'+uid),read('teyzaPublicShops/'+uid),
   read('teyzaBilling/'+uid)]);
  const state=P.state(uid,a,o||{},v,p,b,clock());
  if(a?.uid!==uid||a.category!==category||!state.live||p?.status!=='active')
    D.fail(403,'This feature requires a verified and active '+(category==='wholesale'?'wholesaler':'spaza')+' account.');
  if(paid&&!P.eligible(uid,a,b,clock()))
    D.fail(403,'An active R99 mandate processing period, provider-approved access or verified membership is required to advertise.');
  return {account:a,billing:b,shop:p,state};
 };
 async function directory(){
  const rows=await db.collection('teyzaPublicShops').where('status','==','active').limit(40).get();
  const shops=(await Promise.all(rows.docs.map(async r=>{
   const p=r.data(),target=r.id;
   if(p.sellerUid!==target||p.shopCategory!=='spaza')return null;
   const pref=await read('teyzaSupplierAdPreferences/'+target);
   if(pref?.ownerUid!==target||pref.optedIn!==true)return null;
   try{await check(target,'spaza');}catch(_){return null;}
   return {sellerUid:target,name:String(p.name||'Spaza shop').slice(0,90),
    area:String(p.area||'').slice(0,120),city:String(p.city||'').slice(0,80)};
  }))).filter(Boolean);
  return {shops,limited:rows.docs.length===40};
 }
 const display=c=>({supplierUid:c.supplierUid||'',id:c.id||'',title:c.title||'',message:c.message||'',
  status:c.status||'pending_review',createdAt:c.createdAt||0,
  reviewedAt:c.reviewedAt||null,expiresAt:c.expiresAt||null,
  targetCount:Array.isArray(c.targetUids)?c.targetUids.length:0,
  targetUids:Array.isArray(c.targetUids)?c.targetUids:[],
  supplierName:c.supplierName||''});
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid);
  if(action.startsWith('ops_')){
   recentAdmin(auth,clock);await rate(uid,'supplier-ad-review',30,60000);
   if(action==='ops_wholesale_ads_queue'){
    const rows=await db.collection('teyzaWholesaleCampaigns').where('status','==','pending_review').limit(40).get();
    return {campaigns:rows.docs.map(r=>display({id:r.id,...r.data()})),limited:rows.docs.length===40};
   }
   if(action==='ops_wholesale_ad_review'){
    const id=D.id(data.campaignId),decision=data.decision;
    if(!['approved','rejected'].includes(decision)||data.confirmed!==true)
     D.fail(422,'Confirm approval or rejection of this supplier message.');
    const reason=D.text(data.reason||'','review reason',300,false);
    if(decision==='rejected'&&reason.length<12)D.fail(422,'Explain the rejected advertisement.');
    const snap=await doc('teyzaWholesaleCampaigns/'+id).get();
    if(!snap.exists||snap.data().status!=='pending_review')D.fail(409,'Refresh the advertising review queue.');
    const campaign=snap.data();
    if(campaign.supplierUid===uid)D.fail(403,'A second administrator must review your campaign.');
    if(decision==='approved'){
     await check(campaign.supplierUid,'wholesale',{paid:true});
     const candidates=await directory();
     if(!campaign.targetUids.every(x=>candidates.shops.some(s=>s.sellerUid===x)))
       D.fail(409,'A target spaza has withdrawn ad permission or is not currently available.');
    }
    const at=clock();
    await db.runTransaction(async tx=>{
     const ref=doc('teyzaWholesaleCampaigns/'+id),now=await tx.get(ref);
     if(!now.exists||now.data().status!=='pending_review')D.fail(409,'The campaign changed. Refresh.');
     tx.update(ref,{status:decision,reviewedBy:uid,reviewedAt:at,reviewNote:reason,
       ...(decision==='approved'?{expiresAt:at+7*86400000}:{})});
     tx.set(doc('teyzaWholesaleAdAudit/'+crypto.randomUUID()),{
      actorUid:uid,action:'wholesale_ad_review',campaignId:id,supplierUid:campaign.supplierUid,
      status:decision,reason,createdAt:at});
    });
    return {reviewed:true,status:decision};
   }
  }
  if(action==='wholesale_ad_opt_in'){
   await check(uid,'spaza');await rate(uid,'supplier-ad-preferences',10,60000);
   if(typeof data.optedIn!=='boolean')D.fail(422,'Choose whether to receive supplier offers.');
   await doc('teyzaSupplierAdPreferences/'+uid).set({
    ownerUid:uid,optedIn:data.optedIn,updatedAt:clock()},{merge:true});
   return {optedIn:data.optedIn};
  }
  if(action==='wholesale_ad_preferences'){
   await check(uid,'spaza');
   const pref=await read('teyzaSupplierAdPreferences/'+uid);
   return {optedIn:pref?.ownerUid===uid&&pref.optedIn===true};
  }
  if(action==='wholesale_spaza_directory'){
   await check(uid,'wholesale');await rate(uid,'supplier-ad-directory',20,60000);
   return directory();
  }
  if(action==='wholesale_spaza_invite'){
   await check(uid,'wholesale',{paid:true});
   await rate(uid,'supplier-invite',10,86400000);
   const spazaUid=D.id(data.spazaUid);
   const candidates=await directory();
   if(!candidates.shops.some(x=>x.sellerUid===spazaUid))
     D.fail(409,'The spaza must be active and opt in to supplier offers before an invitation.');
   const ref=doc('teyzaWholesaleConnections/'+spazaUid+'_'+uid);
   return db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(old.exists&&['invited','pending','approved'].includes(old.data().status))
      return {status:old.data().status,alreadyRequested:true};
    tx.set(ref,{spazaUid,supplierUid:uid,status:'invited',discountPercent:0,
     deliveryFeeCents:null,invitedAt:clock(),createdAt:old.exists?old.data().createdAt:clock(),updatedAt:clock()});
    return {status:'invited',invited:true};
   });
  }
  if(action==='wholesale_spaza_accept_invite'){
   await check(uid,'spaza');await rate(uid,'supplier-invite-response',15,60000);
   const supplierUid=D.id(data.supplierUid);
   const ref=doc('teyzaWholesaleConnections/'+uid+'_'+supplierUid);
   const result=await db.runTransaction(async tx=>{
    const saved=await tx.get(ref);
    if(!saved.exists||saved.data().spazaUid!==uid||saved.data().supplierUid!==supplierUid||
       saved.data().status!=='invited')D.fail(409,'Refresh the current supplier invitation.');
    tx.update(ref,{status:data.accept===true?'pending':'declined',
      spazaRespondedAt:clock(),updatedAt:clock()});
    return {status:data.accept===true?'pending':'declined'};
   });
   return result;
  }
  if(action==='wholesale_ad_submit'){
   const supplier=await check(uid,'wholesale',{paid:true});
   await rate(uid,'supplier-ad-submit',3,86400000);
   const title=D.text(data.title,'advertisement headline',90),
     message=D.text(data.message,'advertisement text',400);
   if(title.length<8||message.length<20)D.fail(422,'Add a headline and a descriptive offer.');
   if(!Array.isArray(data.targetUids)||data.targetUids.length<1||data.targetUids.length>20)
    D.fail(422,'Choose between 1 and 20 participating spaza shops.');
   const targets=[...new Set(data.targetUids.map(D.id))];
   if(targets.length!==data.targetUids.length)D.fail(422,'Remove duplicate spaza targets.');
   const candidates=await directory();
   if(!targets.every(t=>candidates.shops.some(s=>s.sellerUid===t)))
    D.fail(409,'A selected spaza is unavailable or has not opted in to supplier offers.');
   const id=crypto.randomUUID(),at=clock();
   await doc('teyzaWholesaleCampaigns/'+id).set({
    supplierUid:uid,supplierName:supplier.shop.name||supplier.account.shopName||'Wholesaler',
    targetUids:targets,title,message,status:'pending_review',createdAt:at,reviewedAt:null,
    expiresAt:null,channel:'in_app_spaza_only'});
   return {submitted:true,campaignId:id,status:'pending_review',targetCount:targets.length};
  }
  if(action==='wholesale_ad_pause'){
   await check(uid,'wholesale');const id=D.id(data.campaignId);
   await db.runTransaction(async tx=>{
    const ref=doc('teyzaWholesaleCampaigns/'+id),snap=await tx.get(ref);
    if(!snap.exists||snap.data().supplierUid!==uid)D.fail(403,'You can only pause your own campaign.');
    if(!['approved','pending_review'].includes(snap.data().status))
     D.fail(409,'This campaign cannot be paused.');
    tx.update(ref,{status:'paused',pausedAt:clock()});
   });
   return {paused:true};
  }
  if(action==='wholesale_ads'){
   const a=await read('teyzaSellerAccounts/'+uid);
   if(a?.category==='wholesale'){
    await check(uid,'wholesale');
    const rows=await db.collection('teyzaWholesaleCampaigns').where('supplierUid','==',uid).limit(40).get();
    return {campaigns:rows.docs.map(r=>display({id:r.id,...r.data()}))};
   }
   await check(uid,'spaza');
   const pref=await read('teyzaSupplierAdPreferences/'+uid);
   if(pref?.ownerUid!==uid||pref.optedIn!==true)return {campaigns:[]};
   const rows=await db.collection('teyzaWholesaleCampaigns').where('targetUids','array-contains',uid).limit(30).get();
   const campaigns=(await Promise.all(rows.docs.map(async r=>{
    const c=r.data();
    if(c.status!=='approved'||!Number.isFinite(c.expiresAt)||c.expiresAt<=clock()||
       !c.targetUids.includes(uid))return null;
    try{await check(c.supplierUid,'wholesale',{paid:true});}catch(_){return null;}
    return display({id:r.id,...c});
   }))).filter(Boolean);
   return {campaigns};
  }
  D.fail(404,'Unknown wholesaler advertising action.');
 }
 return {execute};
}
module.exports={actions,createWholesaleAdvertising};
