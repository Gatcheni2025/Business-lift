'use strict';
const crypto=require('node:crypto'),D=require('./domain'),{recentAdmin}=require('./seller-experience'),{saveUpload}=require('./upload-storage'),discovery=require('./field-discovery');
const provinces=['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'];
const actions=new Set(['agent_admin_application_evidence','agent_profile','agent_apply','agent_visits','agent_visit_start','agent_visit_get','agent_location','agent_capture_begin','agent_photo_submit','agent_owner_link','agent_owner_inspect','agent_owner_confirm','agent_visit_submit','agent_admin_profiles','agent_admin_profile_decide','agent_admin_visits','agent_admin_photo','agent_admin_visit_decide','agent_admin_commission_paid','agent_profile_update','agent_admin_nearby',...discovery.actions]);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),DAY=86400000;
function distance(a,b){if(!a||!b||![a.latitude,a.longitude,b.latitude,b.longitude].every(Number.isFinite))return null;const r=Math.PI/180,x=(b.latitude-a.latitude)*r,y=(b.longitude-a.longitude)*r,t=Math.sin(x/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(y/2)**2;return Math.round(6371000*2*Math.atan2(Math.sqrt(t),Math.sqrt(1-t)));}
function profileView(p){return p?{uid:p.uid,name:p.name,phone:p.phone,email:p.email||'',address:p.address||'',province:p.province,area:p.area,status:p.status,revision:p.revision,reviewNote:p.reviewNote||'',hasDocuments:!!p.evidenceId,identityType:p.identityType||'',documentsExpireAt:p.documentsExpireAt||null,createdAt:p.createdAt||null}:null;}
function visitView(id,v){return {id,shopName:v.shopName,address:v.address,area:v.area,province:v.province,status:v.status,revision:v.revision,createdAt:v.createdAt,
 location:v.location||null,ownerConfirmed:!!v.sellerUid,reviewNote:v.reviewNote||'',photos:Object.fromEntries(Object.entries(v.photos||{}).map(([k,p])=>[k,{id:p.id,capturedAt:p.capturedAt,expiresAt:p.expiresAt}]))};}
// Documents and ID number are encrypted together in private object storage.
function applicantFile(value,kind){
 if(!value||typeof value!=='object')D.fail(422,'Attach your '+kind+' document.');
 const name=String(value.name||'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100),mime=String(value.mime||'');
 if(!name||typeof value.base64!=='string'||value.base64.length>2900000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64))D.fail(422,'The '+kind+' file is invalid or too large.');
 const bytes=Buffer.from(value.base64,'base64');
 if(bytes.length<50||bytes.length>(kind==='CV'?1800000:1200000))D.fail(422,'The '+kind+' file must be smaller than '+(kind==='CV'?'1.8 MB':'1.2 MB')+'.');
 const pdf=mime==='application/pdf'&&bytes.subarray(0,5).toString()==='%PDF-';
 const jpg=mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(!(pdf||(kind==='identity'&&(jpg||png))))D.fail(422,'Upload a PDF'+(kind==='identity'?', JPEG or PNG':'')+' for '+kind+'.');
 return {name,mime,base64:value.base64};
}
function identityDetails(data){
 if(!['sa_id','passport'].includes(data.identityType))D.fail(422,'Choose an ID or passport document.');
 const identityNumber=D.text(data.identityNumber,'ID/passport number',35);
 if(!/^[A-Za-z0-9 -]{5,35}$/.test(identityNumber))D.fail(422,'Enter a valid ID or passport number.');
 return {identityType:data.identityType,identityNumber,identityFile:applicantFile(data.identityFile,'identity'),cvFile:applicantFile(data.cvFile,'CV')};
}
function verified(auth){if(!auth?.uid)D.fail(401,'Sign in first.');if(auth.teyzaPhoneBootstrap||(!auth.email_verified&&!auth.phone_number))D.fail(403,'Verify your email or phone before using the work portal.');}
function editable(v){if(!['draft','needs_changes'].includes(v.status))D.fail(409,'This visit is already submitted. Ask the reviewer to request changes.');}
function gps(data,now){const {latitude,longitude,accuracy,capturedAt}=data;if(![latitude,longitude,accuracy,capturedAt].every(Number.isFinite)||latitude< -35.5||latitude> -22||longitude<16||longitude>33.5||accuracy<=0||accuracy>100||Math.abs(now-capturedAt)>60000)D.fail(422,'Capture a fresh shop location with accuracy of 100 metres or better.');return {latitude,longitude,accuracy,capturedAt,receivedAt:now,source:'device_reported'};}
function createFieldAgents({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getPlacesKey=()=>'',fetchImpl=fetch,clock=Date.now,rate}){
 const nearby=discovery.createFieldDiscovery({db,getPlacesKey,fetchImpl,clock,rate});
 const doc=p=>db.doc(p),read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
 async function agent(uid){const p=await read('teyzaFieldAgents/'+uid);if(!p||p.uid!==uid||p.status!=='approved')D.fail(403,'An approved Teyza agent account is required.');return p;}
 function own(v,uid){if(!v||v.agentUid!==uid)D.fail(404,'Visit not found.');return v;}
 function audit(tx,uid,action,target,details={}){tx.set(doc('teyzaAgentAudit/'+crypto.randomUUID()),{actorUid:uid,action,target,details,createdAt:clock()});}
 async function status(id,v){
  if(!v.sellerUid)return {sellerApproval:'awaiting_owner',mandate:'not_linked',payment:'not_received',commission:'not_eligible',commissionCents:9900,collectionActive:false};
  const uid=v.sellerUid;
  const [a,m,c,location,inv,agentProfile]=await Promise.all([read('teyzaSellerAccounts/'+uid),read('teyzaSellerMandates/'+uid),read('teyzaAgentCommissions/'+uid),read('teyzaShopLocations/'+uid),db.collection('teyzaBilling/'+uid+'/entries').where('kind','==','subscription_invoice').limit(501).get(),read('teyzaFieldAgents/'+v.agentUid)]);
  if(inv.docs.length>500)D.fail(409,'This subscription history needs an administrator reconciliation.');
  const bill=inv.docs.map(s=>s.data()).sort((a,b)=>a.createdAt-b.createdAt)[0],paid=!!bill&&bill.debitCents===9900&&bill.paidCents>=9900,newShop=!!bill&&bill.createdAt>=v.createdAt;
  const consent=m?.status==='signed_pending_activation';
  const eligible=v.status==='approved'&&agentProfile?.status==='approved'&&a?.approvalStatus==='approved'&&consent&&paid&&newShop;
  return {sellerApproval:a?.approvalStatus||'pending',mandate:consent?'signed_pending_activation':m?.status||'not_signed',payment:paid?'first_invoice_paid':bill?'awaiting_payment':'not_invoiced',
   commission:c?.paidAt?(eligible?'paid':'paid_needs_review'):eligible?'eligible':paid&&!newShop?'existing_subscription':'not_eligible',commissionCents:9900,collectionActive:false,
   registeredShop:{name:a?.shopName||'',address:a?.address||''},distanceFromShopMeters:distance(v.location,location),payoutAt:c?.paidAt||null};
 }
 async function execute(auth,action,data={}){
  verified(auth);const uid=D.id(auth.uid),admin=action.startsWith('agent_admin_');if(admin)recentAdmin(auth,clock);
  await rate(uid,'field-agent',80,60000);
  if(action==='agent_profile')return {profile:profileView(await read('teyzaFieldAgents/'+uid)),provinces,commissionCents:9900};
  if(action==='agent_apply'){
   if(data.consent!==true)D.fail(422,'Agree to the work evidence privacy notice.');
   const values={name:D.text(data.name,'full name',120),phone:require('./onboarding').phone(data.phone),email:String(auth.email||'').slice(0,254),address:D.text(data.address||'','home address',350,false),province:data.province,area:D.text(data.area,'working town or area',120)};
   if(!provinces.includes(values.province))D.fail(422,'Choose a South African province.');
   const previous=await read('teyzaFieldAgents/'+uid);
   if(previous?.evidenceId)return {profile:profileView(previous),alreadyApplied:true};
   const privateDocs=identityDetails(data),evidenceId=crypto.randomUUID();
   const objectPath='teyza-private/agent-applications/'+uid+'/'+evidenceId+'.enc',expiresAt=clock()+180*DAY;
   await doc('teyzaAgentEvidence/'+evidenceId).set({agentUid:uid,objectPath,expiresAt,kind:'application'});
   await saveUpload(bucket,objectPath,await encryptSelfie(Buffer.from(JSON.stringify(privateDocs))),{contentType:'application/octet-stream',resumable:false,metadata:{cacheControl:'private,no-store'}});
   let saved;
   try{
    saved=await db.runTransaction(async tx=>{
     const ref=doc('teyzaFieldAgents/'+uid),old=await tx.get(ref);
     if(old.exists&&old.data().evidenceId)return {profile:profileView(old.data()),alreadyApplied:true};
     const prior=old.exists?old.data():null;
     if(prior?.status==='approved')D.fail(409,'Approved profiles cannot replace identity evidence through signup.');
     const p={...prior,uid,...values,status:'pending',revision:(prior?.revision??-1)+1,identityType:privateDocs.identityType,evidenceId,objectPath,documentsExpireAt:expiresAt,privacyVersion:'agent-recruitment-v2',consentedAt:clock(),createdAt:prior?.createdAt||clock()};
     tx.set(ref,p);audit(tx,uid,action,uid);return {profile:profileView(p)};
    });
   }catch(error){await bucket.file(objectPath).delete({ignoreNotFound:true}).catch(()=>{});await doc('teyzaAgentEvidence/'+evidenceId).delete().catch(()=>{});throw error;}
   if(saved.alreadyApplied){await bucket.file(objectPath).delete({ignoreNotFound:true}).catch(()=>{});await doc('teyzaAgentEvidence/'+evidenceId).delete().catch(()=>{});}
   return saved;
   }
  
  if(action==='agent_profile_update'){
   await agent(uid);const values={name:D.text(data.name,'full name',120),phone:require('./onboarding').phone(data.phone),address:D.text(data.address,'home address',350),area:D.text(data.area,'working town or area',120),province:data.province};if(!provinces.includes(values.province))D.fail(422,'Choose a South African province.');
   return db.runTransaction(async tx=>{const ref=doc('teyzaFieldAgents/'+uid),s=await tx.get(ref),old=s.data();if(!s.exists||old.status!=='approved')D.fail(403,'An approved agent account is required.');if(old.revision!==data.revision)D.fail(409,'Your details changed. Refresh first.');tx.update(ref,{...values,revision:old.revision+1,updatedAt:clock()});return {saved:true};});
  }
  if(action==='agent_admin_nearby')return nearby.execute(uid,'agent_nearby',data);
  if(discovery.actions.has(action)){await agent(uid);return nearby.execute(uid,action,data);}
  if(action==='agent_admin_application_evidence'){
   const target=D.id(data.agentUid),p=await read('teyzaFieldAgents/'+target);
   if(target===uid)D.fail(403,'Another administrator must review your application.');
   if(!p||!p.evidenceId||!p.objectPath?.startsWith('teyza-private/agent-applications/'+target+'/')||p.documentsExpireAt<=clock())D.fail(410,'The application documents are missing or expired. Ask the applicant to resubmit.');
   const [ciphertext]=await bucket.file(p.objectPath).download();
   const evidence=JSON.parse((await decryptSelfie(ciphertext)).toString('utf8'));
   await doc('teyzaAgentApplicationViews/'+uid+'_'+target).set({reviewerUid:uid,agentUid:target,evidenceId:p.evidenceId,revision:p.revision,viewedAt:clock()});
   return {identityType:evidence.identityType,identityNumber:evidence.identityNumber,identityFile:evidence.identityFile,cvFile:evidence.cvFile};
  }
  if(action==='agent_admin_profiles'){
   let q=db.collection('teyzaFieldAgents').orderBy('__name__').limit(31);if(data.after)q=q.startAfter(D.id(data.after));const r=await q.get();return {profiles:r.docs.slice(0,30).map(s=>profileView(s.data())),next:r.docs.length>30?r.docs[29].id:null};
  }
  if(action==='agent_admin_profile_decide'){
   const target=D.id(data.agentUid),note=D.text(data.note||'','review note',500,false);if(target===uid)D.fail(403,'Another administrator must review your application.');if(!['approved','suspended','rejected'].includes(data.status))D.fail(422,'Choose an agent review outcome.');
   return db.runTransaction(async tx=>{const ref=doc('teyzaFieldAgents/'+target),s=await tx.get(ref);if(!s.exists)D.fail(404,'Agent not found.');if(s.data().revision!==data.revision)D.fail(409,'The agent application changed. Refresh first.');
    if(data.status==='approved'){
      const p=s.data(),v=await tx.get(doc('teyzaAgentApplicationViews/'+uid+'_'+target));
      if(!p.evidenceId||p.documentsExpireAt<=clock()||!v.exists||v.data().evidenceId!==p.evidenceId||v.data().revision!==p.revision||v.data().viewedAt<clock()-5*60000)D.fail(409,'Open the current ID/passport and CV before approving the applicant.');
     }
     tx.update(ref,{status:data.status,reviewNote:note,revision:data.revision+1,reviewedAt:clock(),reviewedBy:uid});audit(tx,uid,action,target,{status:data.status});return {saved:true};});
  }
  if(action==='agent_owner_inspect'||action==='agent_owner_confirm'){
   if(typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))D.fail(404,'Invalid owner confirmation link.');
   const claimRef=doc('teyzaAgentClaims/'+hash(data.token)),claim=await claimRef.get();if(!claim.exists||claim.data().expiresAt<clock())D.fail(410,'This owner link expired. Ask the agent for a new link.');
   const link=claim.data(),v=await read('teyzaAgentVisits/'+link.visitId),p=await read('teyzaFieldAgents/'+link.agentUid);
   if(!v||v.claimHash!==claimRef.id||p?.status!=='approved'||v.agentUid===uid)D.fail(403,'This owner link is unavailable for this account.');
   if(action==='agent_owner_inspect'){const a=await read('teyzaSellerAccounts/'+uid);return {visit:{shopName:v.shopName,address:v.address,agentName:p.name},registered:!!a&&a.uid===uid,shopName:a?.shopName||'',confirmed:v.sellerUid===uid};}
   if(data.consent!==true)D.fail(422,'Confirm that this agent assisted your shop and you agree to link the visit.');
   return db.runTransaction(async tx=>{
    const [s,a,at,c,agentNow]=await Promise.all([tx.get(doc('teyzaAgentVisits/'+link.visitId)),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaSellerAgentAttribution/'+uid)),tx.get(claimRef),tx.get(doc('teyzaFieldAgents/'+link.agentUid))]);
    const current=s.data();D.seller(a.exists?a.data():null,uid);if(agentNow.data()?.status!=='approved')D.fail(403,'This agent is not currently approved.');if(!c.exists||c.data().expiresAt<clock()||current.claimHash!==claimRef.id)D.fail(410,'This link changed. Ask for a new link.');
    if(current.sellerUid&&current.sellerUid!==uid)D.fail(409,'This visit is linked to another owner.');if(at.exists&&at.data().visitId!==link.visitId)D.fail(409,'This shop is already linked to an agent visit.');
    if(current.sellerUid===uid)return {confirmed:true};
    editable(current);tx.set(doc('teyzaSellerAgentAttribution/'+uid),{sellerUid:uid,agentUid:link.agentUid,visitId:link.visitId,confirmedAt:clock(),consentVersion:'agent-attribution-v1'});
    tx.update(s.ref,{sellerUid:uid,ownerConfirmedAt:clock(),revision:current.revision+1});audit(tx,uid,action,link.visitId);return {confirmed:true};
   });
  }
  if(!admin)await agent(uid);
  if(action==='agent_visits'||action==='agent_admin_visits'){
   let q=db.collection('teyzaAgentVisits');if(!admin)q=q.where('agentUid','==',uid);else if(data.agentUid)q=q.where('agentUid','==',D.id(data.agentUid));q=q.orderBy('__name__').limit(31);if(data.after)q=q.startAfter(D.id(data.after));
   const r=await q.get(),rows=await Promise.all(r.docs.slice(0,30).map(async s=>({...visitView(s.id,s.data()),...(admin?{agentUid:s.data().agentUid}:{}),progress:await status(s.id,s.data())})));return {visits:rows,next:r.docs.length>30?r.docs[29].id:null};
  }
  if(action==='agent_visit_start'){
   if(data.ownerPermission!==true)D.fail(422,'Get the shop owner’s permission before recording this visit.');
   const id=D.id(data.requestId),values={shopName:D.text(data.shopName,'shop name',160),address:D.text(data.address,'full shop address',350),area:D.text(data.area,'town or suburb',120),province:data.province};
   if(values.address.length<12||!provinces.includes(values.province))D.fail(422,'Enter the full shop address and province.');
   return db.runTransaction(async tx=>{const ref=doc('teyzaAgentVisits/'+id),old=await tx.get(ref);if(old.exists){own(old.data(),uid);return {visit:visitView(id,old.data())};}
    const v={...values,agentUid:uid,status:'draft',revision:0,createdAt:clock(),ownerPermissionAt:clock(),photos:{}};tx.set(ref,v);return {visit:visitView(id,v)};});
  }
  const id=D.id(data.visitId),ref=doc('teyzaAgentVisits/'+id),v=await read(ref.path);if(!v)D.fail(404,'Visit not found.');if(!admin)own(v,uid);
  if(action==='agent_visit_get')return {visit:{...visitView(id,v),progress:await status(id,v)}};
  if(action==='agent_location'){
   const location=gps(data,clock());return db.runTransaction(async tx=>{const s=await tx.get(ref),current=own(s.data(),uid);editable(current);if(current.revision!==data.revision)D.fail(409,'Visit changed. Refresh first.');
    tx.update(ref,{location,photos:{},revision:current.revision+1});return {saved:true};});
  }
  if(action==='agent_capture_begin'){
   editable(v);if(!['shop','selfie'].includes(data.kind))D.fail(422,'Choose a shop photo or in-shop selfie.');if(!v.location||clock()-v.location.receivedAt>15*60000)D.fail(409,'Capture your current location again before taking photos.');
   const captureId=crypto.randomUUID(),nonce=crypto.randomBytes(3).toString('hex').toUpperCase();await doc('teyzaAgentCaptures/'+captureId).set({agentUid:uid,visitId:id,kind:data.kind,nonce,revision:v.revision,expiresAt:clock()+3*60000,used:false});return {captureId,nonce,expiresAt:clock()+3*60000};
  }
  if(action==='agent_photo_submit'){
   await rate(uid,'agent-photo',30,3600000);if(data.consent!==true)D.fail(422,'Confirm consent for this private work photo.');
   const capRef=doc('teyzaAgentCaptures/'+D.id(data.captureId)),cap=await capRef.get(),c=cap.exists?cap.data():null;
   if(!c||c.agentUid!==uid||c.visitId!==id||c.expiresAt<clock()||c.revision!==v.revision)D.fail(409,'The capture session changed or expired. Take a fresh photo.');
   editable(v);let bytes;try{bytes=await sanitizeImage(D.imageBytes(data.imageBase64));}catch(e){if(e.status)throw e;D.fail(422,'The camera image could not be read. Take another photo.');}
   const digest=hash(bytes),imageRef=doc('teyzaAgentImageHashes/'+digest),evidenceId=crypto.randomUUID(),objectPath='teyza-private/agent-evidence/'+uid+'/'+evidenceId+'.enc',expiresAt=clock()+90*DAY;
   // Register retention before storage, so interrupted requests cannot orphan private bytes.
   await doc('teyzaAgentEvidence/'+evidenceId).set({agentUid:uid,visitId:id,objectPath,expiresAt,kind:c.kind});
   await saveUpload(bucket,objectPath,await encryptSelfie(bytes),{contentType:'application/octet-stream',resumable:false,metadata:{cacheControl:'private,no-store'}});
   return db.runTransaction(async tx=>{const [s,cs,h]=await Promise.all([tx.get(ref),tx.get(capRef),tx.get(imageRef)]),current=own(s.data(),uid),capture=cs.data();editable(current);
    if(capture.used||capture.expiresAt<clock()||capture.revision!==current.revision)D.fail(409,'Take a fresh photo for the current visit.');
    if(h.exists)D.fail(409,'This photo was already used. Take a new camera photo at this shop.');
    const photo={id:evidenceId,objectPath,digest,capturedAt:clock(),expiresAt,nonce:c.nonce};
    tx.update(ref,{photos:{...current.photos,[c.kind]:photo},revision:current.revision+1});tx.update(capRef,{used:true});tx.set(imageRef,{visitId:id,agentUid:uid,kind:c.kind,evidenceId,createdAt:clock()});return {saved:true};
   });
  }
  if(action==='agent_owner_link'){
   editable(v);const token=crypto.randomBytes(32).toString('hex'),claimHash=hash(token);return db.runTransaction(async tx=>{const s=await tx.get(ref);own(s.data(),uid);editable(s.data());if(s.data().sellerUid)D.fail(409,'The owner has already confirmed this visit.');
    tx.set(doc('teyzaAgentClaims/'+claimHash),{visitId:id,agentUid:uid,expiresAt:clock()+7*DAY});tx.update(ref,{claimHash});return {url:'https://teyza.co.za/owner-confirm.html#'+token,expiresAt:clock()+7*DAY};});
  }
  if(action==='agent_visit_submit'){
   const progress=await status(id,v);if(!v.sellerUid||progress.mandate!=='signed_pending_activation')D.fail(409,'Ask the owner to confirm the visit and sign their membership mandate first.');
   return db.runTransaction(async tx=>{const s=await tx.get(ref),current=own(s.data(),uid),m=await tx.get(doc('teyzaSellerMandates/'+v.sellerUid));editable(current);
    if(current.revision!==data.revision)D.fail(409,'Visit changed. Refresh before submitting.');if(!current.location||!['shop','selfie'].every(k=>current.photos[k]?.expiresAt>clock())||m.data()?.status!=='signed_pending_activation')D.fail(409,'Complete the current location, both photos and owner mandate first.');
    tx.update(ref,{status:'submitted',submittedAt:clock(),revision:current.revision+1});audit(tx,uid,action,id);return {submitted:true};});
  }
  if(action==='agent_admin_photo'){
   if(v.agentUid===uid||v.sellerUid===uid)D.fail(403,'Another reviewer must view your work.');const p=v.photos?.[data.kind];if(!p||p.expiresAt<=clock()||!p.objectPath.startsWith('teyza-private/agent-evidence/'+v.agentUid+'/'))D.fail(410,'This work photo expired or is unavailable.');
   const [bytes]=await bucket.file(p.objectPath).download();await doc('teyzaAgentReviewViews/'+uid+'_'+id+'_'+data.kind).set({reviewerUid:uid,visitId:id,revision:v.revision,evidenceId:p.id,viewedAt:clock()});return {imageBase64:(await decryptSelfie(bytes)).toString('base64')};
  }
  if(action==='agent_admin_visit_decide'){
   if(v.agentUid===uid||v.sellerUid===uid)D.fail(403,'Another administrator must review your work.');if(!['approved','needs_changes','rejected'].includes(data.status))D.fail(422,'Choose a review outcome.');const note=D.text(data.note||'','review note',500,data.status!=='approved');
   return db.runTransaction(async tx=>{
    const [s,p,shopView,selfView]=await Promise.all([tx.get(ref),tx.get(doc('teyzaFieldAgents/'+v.agentUid)),tx.get(doc('teyzaAgentReviewViews/'+uid+'_'+id+'_shop')),tx.get(doc('teyzaAgentReviewViews/'+uid+'_'+id+'_selfie'))]);const current=s.data();
    if(current.revision!==data.revision||current.status!=='submitted')D.fail(409,'This work changed or was already reviewed. Refresh first.');
    if(data.status==='approved'&&(p.data()?.status!=='approved'||data.reviewConfirmed!==true||!current.sellerUid||!current.location||![['shop',shopView],['selfie',selfView]].every(([k,view])=>view.exists&&view.data().revision===current.revision&&view.data().evidenceId===current.photos?.[k]?.id&&view.data().viewedAt>clock()-5*60000&&current.photos[k].expiresAt>clock())))D.fail(409,'Open both current photos and confirm the location and owner evidence before approving.');
    tx.update(ref,{status:data.status,reviewNote:note,reviewedBy:uid,reviewedAt:clock(),revision:current.revision+1});audit(tx,uid,action,id,{status:data.status});return {saved:true};
   });
  }
  if(action==='agent_admin_commission_paid'){
   if(v.agentUid===uid||v.sellerUid===uid)D.fail(403,'Another administrator must record this payout.');if(data.transferVerified!==true)D.fail(422,'Verify the completed R99 bank transfer first.');const reference=D.text(data.reference,'verified payout reference',180),receipt=doc('teyzaAgentPayoutReferences/'+hash(reference.trim().toUpperCase()));
   return db.runTransaction(async tx=>{
    const [s,a,m,c,r,bills,p]=await Promise.all([tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+D.id(v.sellerUid))),tx.get(doc('teyzaSellerMandates/'+v.sellerUid)),tx.get(doc('teyzaAgentCommissions/'+v.sellerUid)),tx.get(receipt),tx.get(db.collection('teyzaBilling/'+v.sellerUid+'/entries').where('kind','==','subscription_invoice').limit(501)),tx.get(doc('teyzaFieldAgents/'+v.agentUid))]);
    if(c.exists&&c.data().paidAt){if(c.data().visitId===id&&c.data().reference===reference)return {recorded:true,alreadyRecorded:true};D.fail(409,'This shop’s once-off commission was already recorded.');}
    if(bills.docs.length>500)D.fail(409,'Reconcile this subscription history first.');const current=s.data(),invoice=bills.docs.map(s=>s.data()).sort((a,b)=>a.createdAt-b.createdAt)[0];if(current.revision!==data.revision||current.status!=='approved'||a.data()?.approvalStatus!=='approved'||p.data()?.status!=='approved'||m.data()?.status!=='signed_pending_activation'||!invoice||invoice.debitCents!==9900||invoice.paidCents<9900||invoice.createdAt<current.createdAt)D.fail(409,'Approved work, an approved seller, current consent and the first fully paid R99 invoice are required.');
    if(r.exists)D.fail(409,'That payout reference was already used.');const payout={visitId:id,sellerUid:v.sellerUid,agentUid:v.agentUid,amountCents:9900,currency:'ZAR',reference,paidAt:clock(),recordedBy:uid};
    tx.set(doc('teyzaAgentCommissions/'+v.sellerUid),payout);tx.set(receipt,{visitId:id,sellerUid:v.sellerUid});audit(tx,uid,action,id,{amountCents:9900});return {recorded:true};
   });
  }
  D.fail(404,'Unknown agent action.');
 }
 return {execute};
}
async function purgeAgentEvidence({db,bucket,clock=Date.now}){
 const rows=await db.collection('teyzaAgentEvidence').where('expiresAt','<=',clock()).limit(200).get();
 for(let n=0;n<rows.docs.length;n+=10)await Promise.all(rows.docs.slice(n,n+10).map(async r=>{
  const p=r.data();if(p.objectPath?.startsWith('teyza-private/agent-evidence/'+p.agentUid+'/')||p.objectPath?.startsWith('teyza-private/agent-applications/'+p.agentUid+'/'))await bucket.file(p.objectPath).delete({ignoreNotFound:true});await r.ref.delete();
 }));
 for(const [collection,limit] of [['teyzaAgentCaptures',500],['teyzaAgentClaims',200]]){
  const expired=await db.collection(collection).where('expiresAt','<=',clock()).limit(limit).get();
  for(let n=0;n<expired.docs.length;n+=10)await Promise.all(expired.docs.slice(n,n+10).map(r=>r.ref.delete()));
 }
 return rows.docs.length;
}
module.exports={createFieldAgents,actions,provinces,gps,distance,visitView,purgeAgentEvidence};
