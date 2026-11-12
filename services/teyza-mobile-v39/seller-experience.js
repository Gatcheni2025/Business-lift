'use strict';
const crypto=require('node:crypto'),D=require('./domain'),P=require('./publication');
const actions=new Set(['seller_register','seller_plan_select','admin_access','admin_seller_queue','admin_seller_review',
  'notification_list','notification_read','notification_preferences','notification_device_save','notification_device_delete','seller_whatsapp_preferences']);
const defaults={orders:true,messages:true,stock:true,reviews:true};
function recentAdmin(auth,clock){
  if(auth.teyzaAdmin!==true||auth.email_verified!==true)D.fail(403,'Teyza administrator access is required.');
  if(auth.teyzaPhoneBootstrap===true)D.fail(401,'Sign in again before reviewing sellers.');
  const age=clock()/1000-auth.auth_time;
  if(!Number.isFinite(age)||age< -60||age>300)D.fail(401,'Sign in again before reviewing sellers. Your review session lasts five minutes.');
}
function createSellerExperience({db,clock=Date.now,rate,getAuthUser=async()=>null,shopAddress}){
 const doc=p=>db.doc(p);
 const owner=async uid=>{const s=await doc('teyzaSellerAccounts/'+uid).get();return D.seller(s.exists?s.data():null,uid);};
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid);
  if(action==='seller_register'){
   await rate(uid,'register',5,3600000);
   if(!['spaza','retail','wholesale'].includes(data.category))D.fail(422,'Choose Spaza Shop, Wholesaler or Other Retail.');
   if(data.consent!==true)D.fail(422,'Confirm that these shop details are yours.');
   const legalType=data.legalType||'individual';
   if(!['individual','company'].includes(legalType))D.fail(422,'Choose Individual or Registered company.');
   if(legalType==='company'&&(!data.companyName?.trim()||!data.registrationNumber?.trim()))D.fail(422,'Enter the registered company name and registration number.');
   const values={uid,category:data.category,shopName:D.text(data.shopName,'shop name',120),
    ownerEmail:auth.email||'',phone:require('./onboarding').phone(data.phone),
    companyName:D.text(data.companyName||'','company name',160,false),registrationNumber:D.text(data.registrationNumber||'','registration number',50,false),
    approvalStatus:'pending',listingStatus:'not_listed',listingPlan:'free',
    catalogueApprovalRequired:false,createdAt:new Date(clock()),updatedAt:new Date(clock())};
   if(values.shopName.length<2||values.phone.length<9)D.fail(422,'Enter your shop name and a valid contact number.');
   const existingRegistration=await doc('teyzaSellerAccounts/'+uid).get();
   if(existingRegistration.exists){D.seller(existingRegistration.data(),uid);return {registered:true,alreadyRegistered:true};}
   const claimedPlaceId=data.googleClaimSelection?shopAddress.claim(uid,data.googleClaimSelection):null;
   // A location shared with a Google business does not automatically grant
   // ownership. Require an authenticated Google listing claim first.
   const matchingPlaceId=await shopAddress.matchingBusiness(uid,data.addressSelection,values.shopName);
   if(matchingPlaceId&&matchingPlaceId!==claimedPlaceId)
     D.fail(409,'A Google Maps business matches this name and address. Select Claim existing business, answer its verification questions, and submit evidence for review.');
   if(claimedPlaceId){
     const q=data.googleClaimAnswers||{};
     if(q.authorized!==true||q.canProvideEvidence!==true||q.canVerifyContact!==true)
       D.fail(422,'Confirm your authority, available ownership evidence and ability to verify the business contact before requesting a Google business claim.');
   }
   return db.runTransaction(async tx=>{
    const ref=doc('teyzaSellerAccounts/'+uid),snap=await tx.get(ref);
    if(snap.exists){D.seller(snap.data(),uid);return {registered:true,alreadyRegistered:true};}
    if(data.locationConsent!==true)D.fail(422,'Confirm that shoppers may see this business address and shop location.');
    const location=shopAddress.location(uid,data);
    if(claimedPlaceId){
     const existing=await tx.get(doc('teyzaClaimedPlaces/'+crypto.createHash('sha256').update(claimedPlaceId).digest('hex')));
     if(existing.exists&&existing.data().sellerUid!==uid)D.fail(409,'This business is already linked to another Teyza shop. Contact Teyza support.');
     tx.set(doc('teyzaShopClaims/'+uid),{ownerUid:uid,placeId:claimedPlaceId,status:'pending',
       verificationAnswers:{authorized:true,canProvideEvidence:true,canVerifyContact:true},
       verificationMethod:'manual_evidence_review',createdAt:clock()});
    }
    if(data.whatsappConsent===true)tx.set(doc('teyzaWhatsAppPreferences/'+uid),{
      ownerUid:uid,phone:values.phone,optedIn:true,consentVersion:'seller-approved-welcome-services-v1',consentAt:clock()});
    tx.set(ref,{...values,address:location.address});tx.set(doc('teyzaShopLocations/'+uid),location);
    tx.set(doc('teyzaSellerOnboarding/'+uid),{requiredVersion:2,legalType,sellingStatus:'not_started',createdAt:clock()});return {registered:true,approvalStatus:'pending'};
   });
  }
  if(action==='seller_plan_select')D.fail(410,
   'The seven-day trial has ended. Registration is free; upgrade when adding products.');
  if(action==='seller_whatsapp_preferences'){
   const account=await owner(uid),ref=doc('teyzaWhatsAppPreferences/'+uid);
   if(typeof data.enabled!=='boolean')D.fail(422,'Choose whether you want a WhatsApp welcome and service information.');
   await rate(uid,'whatsapp-preference',20,3600000);
   await ref.set({ownerUid:uid,optedIn:data.enabled,phone:data.enabled?require('./onboarding').phone(account.phone):'',
    consentVersion:'seller-approved-welcome-services-v1',consentAt:clock()});
   return {saved:true,enabled:data.enabled};
  }
  if(action==='admin_access')return {admin:auth.teyzaAdmin===true};
  if(action==='admin_seller_queue'){
   recentAdmin(auth,clock);await rate(uid,'reviewqueue',30,60000);
   let query=db.collection('teyzaMobileVerification').where('status','==','pending_review').orderBy('__name__').limit(31);
   if(data.after)query=query.startAfter(D.id(data.after));
   const result=await query.get(),rows=result.docs.slice(0,30);
   const shops=await Promise.all(rows.map(r=>doc('teyzaSellerAccounts/'+r.id).get()));
   const identities=await Promise.all(rows.map(r=>doc('teyzaSellerIdentity/'+r.id).get()));
   const onboardings=await Promise.all(rows.map(r=>doc('teyzaSellerOnboarding/'+r.id).get()));
   const claims=await Promise.all(rows.map(r=>doc('teyzaShopClaims/'+r.id).get()));
   const locations=await Promise.all(rows.map(r=>doc('teyzaShopLocations/'+r.id).get()));
   const fronts=await Promise.all(rows.map(r=>doc('teyzaShopFrontPhotos/'+r.id).get()));
   const ownerUsers=await Promise.all(rows.map(r=>getAuthUser(r.id).catch(()=>null)));
   return {sellers:rows.map((r,i)=>{const v=r.data(),a=shops[i].exists?shops[i].data():{};
    const identity=identities[i].exists?identities[i].data():null;
    const identityReady=require('./onboarding').current(identity,r.id,clock);
    const missingCompliance=[];
    if(!identityReady)missingCompliance.push('identity');
    if(ownerUsers[i]?.emailVerified!==true)missingCompliance.push('email');
    const expired=!v.objectPath||v.expiresAt<=clock();
    if(expired)missingCompliance.push('selfie');
    let phoneVerified=false;
    try{require('./onboarding').checkedPhone(ownerUsers[i],a.phone);phoneVerified=true;}catch(_){}
    if(onboardings[i].exists&&onboardings[i].data().requiredVersion===2&&!phoneVerified)
      missingCompliance.push('phone');
    if(onboardings[i].exists&&onboardings[i].data().requiredVersion===2){
      if(!require('./shop-front').valid(fronts[i].exists?fronts[i].data():null,r.id))
        missingCompliance.push('shop_front');
      if(!P.locationFor(r.id,a,locations[i].exists?locations[i].data():null,null,clock()))
        missingCompliance.push('shop_location');
      if(!onboardings[i].data().completedAt)missingCompliance.push('onboarding');
    }
    if(claims[i].exists&&claims[i].data().ownerUid===r.id&&
       (!locations[i].exists||locations[i].data().ownerUid!==r.id))
      missingCompliance.push('shop_location');
    return {
    sellerUid:r.id,evidenceId:identityReady?identity.evidenceId:null,evidenceKind:identityReady?identity.kind:null,missingCompliance,reviewNote:v.reviewNote||'',complianceRequestedAt:v.complianceRequestedAt||null,shopName:a.shopName||'Shop registration',category:a.category||'',address:a.address||'',
    phone:a.phone||'',ownerEmail:a.ownerEmail||'',companyName:a.companyName||'',registrationNumber:a.registrationNumber||'',
    googlePlaceId:claims[i].exists&&claims[i].data().ownerUid===r.id?claims[i].data().placeId:null,
    approvalStatus:a.approvalStatus||'pending',listingStatus:a.listingStatus||'not_listed',
    phoneVerified,phoneVerificationRequired:onboardings[i].exists&&onboardings[i].data().requiredVersion===2,
    submissionId:v.submissionId||'legacy_'+v.submittedAt,submittedAt:v.submittedAt,expired};}),
    next:result.docs.length>30?rows.at(-1).id:null};
  }
  if(action==='admin_seller_review'){
   recentAdmin(auth,clock);await rate(uid,'reviewdecision',30,60000);
   const sellerUid=D.id(data.sellerUid),submissionId=D.id(data.submissionId);
   if(uid===sellerUid)D.fail(403,'Another administrator must review your own shop.');
   if(!['approved','needs_new_photo','needs_correction','rejected'].includes(data.status))D.fail(422,'Choose a review decision.');
   const reason=D.text(data.reason||'','review note',400,data.status!=='approved');
   if(data.status!=='approved'&&reason.length<10)D.fail(422,'Add a recommendation of at least 10 characters explaining what the seller should correct.');
   const authUser=await getAuthUser(sellerUid).catch(()=>null);
   return db.runTransaction(async tx=>{
    const ref=doc('teyzaMobileVerification/'+sellerUid),accountRef=doc('teyzaSellerAccounts/'+sellerUid),shopRef=doc('teyzaPublicShops/'+sellerUid);
    const receiptRef=doc('teyzaVerificationViews/'+uid+'/submissions/'+submissionId);
    const setupRef=doc('teyzaSellerOnboarding/'+sellerUid),idRef=doc('teyzaSellerIdentity/'+sellerUid);
    const claimRef=doc('teyzaShopClaims/'+sellerUid),prefRef=doc('teyzaWhatsAppPreferences/'+sellerUid);
    const [v,a,s,view,o,i,c,f,l,b,drafts,photos,claimSnap,prefSnap]=await Promise.all([tx.get(ref),tx.get(accountRef),tx.get(shopRef),tx.get(receiptRef),tx.get(setupRef),tx.get(idRef),
      tx.get(doc('teyzaShopSettings/'+sellerUid)),tx.get(doc('teyzaShopFrontPhotos/'+sellerUid)),tx.get(doc('teyzaShopLocations/'+sellerUid)),tx.get(doc('teyzaBilling/'+sellerUid)),
      tx.get(db.collection('teyzaDraftProducts/'+sellerUid+'/items').limit(201)),tx.get(db.collection('teyzaProductPhotos/'+sellerUid+'/items').limit(201)),tx.get(claimRef),tx.get(prefRef)]);
    const setup=o.exists?o.data():{},identity=i.exists?i.data():null;
    const identityView=identity?await tx.get(doc('teyzaIdentityViews/'+uid+'/evidence/'+D.id(identity.evidenceId))):null;
    const claim=claimSnap.exists&&claimSnap.data().ownerUid===sellerUid?claimSnap.data():null;
    const claimIndexRef=claim?doc('teyzaClaimedPlaces/'+crypto.createHash('sha256').update(claim.placeId).digest('hex')):null;
    const claimed=claimIndexRef?await tx.get(claimIndexRef):null;
    if(setup.requiredVersion===2){
      if((identity&&data.evidenceId!==identity.evidenceId)||(!identity&&data.status==='approved'))D.fail(409,'View the current identity document and refresh this review.');
      if(data.status==='approved'){
        if(authUser?.emailVerified!==true)D.fail(409,'The seller must verify their email before final business approval.');
        if(!setup.completedAt)D.fail(409,'Finish registration and verified phone setup before business approval.');
        if(!require('./shop-front').valid(f.exists?f.data():null,sellerUid))
          D.fail(409,'Upload a current shop-front photo before final business approval.');
        if(!P.locationFor(sellerUid,a.exists?a.data():null,l.exists?l.data():null,null,clock()))
          D.fail(409,'Save a valid shop pin matching the registered address before approval.');
        require('./onboarding').checkedPhone(authUser,a.exists?a.data().phone:'');
        if(!require('./onboarding').current(identity,sellerUid,clock)||!identityView?.exists||identityView.data().sellerUid!==sellerUid||clock()-identityView.data().viewedAt>300000)
          D.fail(409,'View the current private identity document before approving this seller.');
      }
    }
    const record=v.exists?v.data():null;D.seller(a.exists?a.data():null,sellerUid);
    if(!record||record.ownerUid!==sellerUid||record.status!=='pending_review'||(record.submissionId||'legacy_'+record.submittedAt)!==submissionId)
     D.fail(409,'This submission changed or was reviewed already. Refresh the review queue.');
    if(data.status==='approved'&&(!record.objectPath||record.expiresAt<=clock()))D.fail(409,'This selfie expired. Request a new photo.');
    if(data.status==='approved'&&(!view.exists||view.data().sellerUid!==sellerUid||clock()-view.data().viewedAt>300000))
     D.fail(409,'View the current private selfie before approving this seller.');
    if(data.status==='needs_correction'){
      // Do not reject a valid selfie or require a new document merely because
      // the owner's verified phone or another compliance item is outstanding.
      // Keep this submission in the admin inbox until the owner fixes it.
      const stamp=clock();
      tx.update(ref,{reviewNote:reason,complianceRequestedAt:stamp,complianceRequestedBy:uid});
      tx.set(doc('teyzaSellerReviewAudit/'+submissionId+'_correction_'+String(stamp)),{
        sellerUid,submissionId,status:'needs_correction',reason,reviewedBy:uid,reviewedAt:stamp});
      return {status:'needs_correction',pendingReview:true,whatsappStatus:'not_requested'};
    }
    const approved=data.status==='approved';
    if(approved&&claim){
     if(data.claimConfirmed!==true)D.fail(409,'Review the Google Maps listing and confirm the applicant is authorised to claim this business.');
     if(claimed.exists&&claimed.data().sellerUid!==sellerUid)D.fail(409,'This Google business is already linked to another Teyza shop.');
     if(!l.exists||l.data().ownerUid!==sellerUid)D.fail(409,'The seller must save their shop location before this claim can be approved.');
    }
    const existing=a.data();
    const updatedAccount={...existing,approvalStatus:data.status==='needs_new_photo'?'pending':data.status,
       listingPlan:existing.listingPlan==='trial'?'free':existing.listingPlan||'free'};
     const updatedVerification={...record,status:data.status};
    const nextSetup={...setup,moderationBlocked:data.status!=='approved',
      sellingStatus:data.status==='approved'&&setup.completedAt?'pending_approval':data.status==='approved'?'not_started':'paused'};
    const location=l.exists?{...l.data(),...(approved&&claim?{googleClaimPlaceId:claim.placeId,googleClaimApproved:true}:{})}:null;
    const next=P.project(sellerUid,{account:updatedAccount,setup:nextSetup,verification:updatedVerification,
      shop:s.exists?s.data():null,settings:c.exists?c.data():{},front:f.exists?f.data():null,
      location,billing:b.exists?b.data():null,drafts:drafts.docs.map(r=>({id:r.id,data:r.data()})),photos:photos.docs.map(r=>({id:r.id,data:r.data()})),now:clock()});
    if(claim){
     tx.set(claimRef,{status:approved?'approved':data.status,reviewedAt:clock(),reviewedBy:uid},{merge:true});
     if(approved){tx.set(claimIndexRef,{sellerUid,placeId:claim.placeId,approvedAt:clock()});tx.set(doc('teyzaShopLocations/'+sellerUid),location);}
    }
    const pref=prefSnap.exists?prefSnap.data():null;
    const whatsappQueued=approved&&pref?.ownerUid===sellerUid&&pref.optedIn===true&&pref.phone===existing.phone;
    if(whatsappQueued)tx.set(doc('teyzaWhatsAppApprovalOutbox/'+submissionId),{
     sellerUid,submissionId,status:'queued',createdAt:clock()});
    tx.update(ref,{status:data.status,reviewedBy:uid,reviewedAt:clock(),reviewNote:reason});
    tx.update(accountRef,{approvalStatus:updatedAccount.approvalStatus,
      listingPlan:updatedAccount.listingPlan,
       listingStatus:next?.status==='active'?'active':'not_listed',updatedAt:new Date(clock())});
    if(next)tx.set(shopRef,{...next,updatedAt:clock()});
    if(setup.requiredVersion===2)tx.set(setupRef,{...nextSetup,
      sellingStatus:next?.status==='active'?'active':data.status!=='approved'?'paused':setup.completedAt?'pending_approval':'not_started',updatedAt:clock()});
    tx.set(doc('teyzaSellerReviewAudit/'+submissionId),{sellerUid,submissionId,status:data.status,reason,reviewedBy:uid,reviewedAt:clock()});
    return {status:data.status,publicationStatus:next?.status||'not_listed',whatsappStatus:whatsappQueued?'queued':'not_requested'};
   });
  }
  if(['notification_list','notification_read','notification_preferences',
      'notification_device_save','notification_device_delete'].includes(action)){
    const snap=await doc('teyzaSellerAccounts/'+uid).get();
    if(!snap.exists||snap.data().uid!==uid){
      const buyer=await doc('teyzaShopperProfiles/'+uid).get();
      if(!buyer.exists||buyer.data().ownerUid!==uid)D.fail(403,'Complete your shopping profile before using notifications.');
    }
  }else await owner(uid);
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
    await db.runTransaction(async tx=>{
     const rows=await tx.get(db.collection('teyzaMobileDevices').where('ownerUid','==',uid).limit(21));
     const current=rows.docs.filter(d=>d.ref.path!==ref.path).sort((a,b)=>(b.data().updatedAt||0)-(a.data().updatedAt||0));
     let kept=0;
     for(const device of current){const old=device.data();
      if(old.token&&old.expiresAt>clock()&&kept<19){kept++;continue;}
      tx.update(device.ref,{ownerUid:'',token:'',expiresAt:0});
     }
     tx.set(ref,{ownerUid:uid,token,platform:data.platform,expiresAt:clock()+7*86400000,updatedAt:clock()});
    });
   }else await db.runTransaction(async tx=>{const r=await tx.get(ref);if(r.exists&&r.data().ownerUid===uid)tx.update(ref,{ownerUid:'',token:'',expiresAt:0});});
   return {saved:true};
  }
  D.fail(404,'This seller service is not available.');
 }
 return {execute};
}
module.exports={actions,createSellerExperience,recentAdmin,defaults};
