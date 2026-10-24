'use strict';
const crypto=require('node:crypto'),D=require('./domain');
const actions=new Set(['seller_register','admin_access','admin_seller_queue','admin_seller_review',
  'notification_list','notification_read','notification_preferences','notification_device_save','notification_device_delete']);
const defaults={orders:true,messages:true,stock:true,reviews:true};
function recentAdmin(auth,clock){
  if(auth.teyzaAdmin!==true)D.fail(403,'Teyza administrator access is required.');
  const age=clock()/1000-auth.auth_time;
  if(!Number.isFinite(age)||age< -60||age>300)D.fail(401,'Sign in again before reviewing sellers. Your review session lasts five minutes.');
}
function createSellerExperience({db,clock=Date.now,rate}){
 const doc=p=>db.doc(p);
 const owner=async uid=>{const s=await doc('teyzaSellerAccounts/'+uid).get();return D.seller(s.exists?s.data():null,uid);};
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid);
  if(action==='seller_register'){
   await rate(uid,'register',5,3600000);
   if(!['spaza','retail'].includes(data.category))D.fail(422,'Choose Spaza Shop or Other Retail / Wholesale.');
   if(data.consent!==true)D.fail(422,'Confirm that these shop details are yours.');
   const values={uid,category:data.category,shopName:D.text(data.shopName,'shop name',120),
    ownerEmail:auth.email||'',phone:D.text(data.phone,'contact number',25),address:D.text(data.address,'shop address',250),
    companyName:D.text(data.companyName||'','company name',160,false),registrationNumber:D.text(data.registrationNumber||'','registration number',50,false),
    approvalStatus:'pending',listingStatus:'not_listed',createdAt:new Date(clock()),updatedAt:new Date(clock())};
   if(values.shopName.length<2||values.phone.length<9)D.fail(422,'Enter your shop name and a valid contact number.');
   return db.runTransaction(async tx=>{
    const ref=doc('teyzaSellerAccounts/'+uid),snap=await tx.get(ref);
    if(snap.exists){D.seller(snap.data(),uid);return {registered:true,alreadyRegistered:true};}
    tx.set(ref,values);return {registered:true,approvalStatus:'pending'};
   });
  }
  if(action==='admin_access')return {admin:auth.teyzaAdmin===true};
  if(action==='admin_seller_queue'){
   recentAdmin(auth,clock);await rate(uid,'reviewqueue',30,60000);
   let query=db.collection('teyzaMobileVerification').where('status','==','pending_review').orderBy('__name__').limit(31);
   if(data.after)query=query.startAfter(D.id(data.after));
   const result=await query.get(),rows=result.docs.slice(0,30);
   const shops=await Promise.all(rows.map(r=>doc('teyzaSellerAccounts/'+r.id).get()));
   return {sellers:rows.map((r,i)=>{const v=r.data(),a=shops[i].exists?shops[i].data():{};return {
    sellerUid:r.id,shopName:a.shopName||'Shop registration',category:a.category||'',address:a.address||'',
    phone:a.phone||'',ownerEmail:a.ownerEmail||'',companyName:a.companyName||'',registrationNumber:a.registrationNumber||'',
    approvalStatus:a.approvalStatus||'pending',listingStatus:a.listingStatus||'not_listed',
    submissionId:v.submissionId||'legacy_'+v.submittedAt,submittedAt:v.submittedAt,expired:!v.objectPath||v.expiresAt<=clock()};}),
    next:result.docs.length>30?rows.at(-1).id:null};
  }
  if(action==='admin_seller_review'){
   recentAdmin(auth,clock);await rate(uid,'reviewdecision',30,60000);
   const sellerUid=D.id(data.sellerUid),submissionId=D.id(data.submissionId);
   if(uid===sellerUid)D.fail(403,'Another administrator must review your own shop.');
   if(!['approved','needs_new_photo','rejected'].includes(data.status))D.fail(422,'Choose a review decision.');
   const reason=D.text(data.reason||'','review note',400,data.status!=='approved');
   return db.runTransaction(async tx=>{
    const ref=doc('teyzaMobileVerification/'+sellerUid),accountRef=doc('teyzaSellerAccounts/'+sellerUid),shopRef=doc('teyzaPublicShops/'+sellerUid);
    const receiptRef=doc('teyzaVerificationViews/'+uid+'/submissions/'+submissionId);
    const [v,a,s,view]=await Promise.all([tx.get(ref),tx.get(accountRef),tx.get(shopRef),tx.get(receiptRef)]);
    const record=v.exists?v.data():null;D.seller(a.exists?a.data():null,sellerUid);
    if(!record||record.ownerUid!==sellerUid||record.status!=='pending_review'||(record.submissionId||'legacy_'+record.submittedAt)!==submissionId)
     D.fail(409,'This submission changed or was reviewed already. Refresh the review queue.');
    if(data.status==='approved'&&(!record.objectPath||record.expiresAt<=clock()))D.fail(409,'This selfie expired. Request a new photo.');
    if(data.status==='approved'&&(!view.exists||view.data().sellerUid!==sellerUid||clock()-view.data().viewedAt>300000))
     D.fail(409,'View the current private selfie before approving this seller.');
    tx.update(ref,{status:data.status,reviewedBy:uid,reviewedAt:clock(),reviewNote:reason});
    tx.update(accountRef,{approvalStatus:data.status==='needs_new_photo'?'pending':data.status,updatedAt:new Date(clock())});
    // Identity approval never changes paid activation or price-plan entitlement.
    if(data.status!=='approved'&&s.exists)tx.update(shopRef,{status:'suspended'});
    tx.set(doc('teyzaSellerReviewAudit/'+submissionId),{sellerUid,submissionId,status:data.status,reason,reviewedBy:uid,reviewedAt:clock()});
    return {status:data.status};
   });
  }
  await owner(uid);
  if(action==='notification_list'){
   const [rows,prefs,unread]=await Promise.all([
    db.collection('teyzaSellerNotifications/'+uid+'/items').orderBy('createdAt','desc').limit(60).get(),
    doc('teyzaSellerNotificationPreferences/'+uid).get(),
    db.collection('teyzaSellerNotifications/'+uid+'/items').where('read','==',false).limit(100).get()]);
   return {notifications:rows.docs.map(r=>({id:r.id,...r.data()})),unread:unread.docs.length,
    preferences:{...defaults,...(prefs.exists?prefs.data().preferences:{})}};
  }
  if(action==='notification_preferences'){
   const preferences={};for(const key of Object.keys(defaults)){
    if(typeof data[key]!=='boolean')D.fail(422,'Choose your notification preferences.');preferences[key]=data[key];}
   await doc('teyzaSellerNotificationPreferences/'+uid).set({ownerUid:uid,preferences,updatedAt:clock()});return {saved:true};
  }
  if(action==='notification_read'){
   if(!Array.isArray(data.ids)||data.ids.length>60)D.fail(422,'Choose up to 60 notifications.');
   const refs=[...new Set(data.ids.map(D.id))].map(id=>doc('teyzaSellerNotifications/'+uid+'/items/'+id));
   await db.runTransaction(async tx=>{const rows=await Promise.all(refs.map(r=>tx.get(r)));
    rows.forEach((r,i)=>{if(r.exists)tx.update(refs[i],{read:true,readAt:clock()});});});return {saved:true};
  }
  if(action==='notification_device_save'||action==='notification_device_delete'){
   const token=D.text(data.token,'device registration',4096);
   if(token.length<20)D.fail(422,'Invalid device registration.');
   const ref=doc('teyzaMobileDevices/'+crypto.createHash('sha256').update(token).digest('hex'));
   await rate(uid,'device',30,60000);
   if(action==='notification_device_save'){
    if(!['android','ios'].includes(data.platform))D.fail(422,'Unsupported notification device.');
    await ref.set({ownerUid:uid,token,platform:data.platform,expiresAt:clock()+7*86400000,updatedAt:clock()});
   }else await db.runTransaction(async tx=>{const r=await tx.get(ref);if(r.exists&&r.data().ownerUid===uid)tx.update(ref,{token:'',expiresAt:0});});
   return {saved:true};
  }
  D.fail(404,'This seller service is not available.');
 }
 return {execute};
}
module.exports={actions,createSellerExperience,recentAdmin,defaults};
