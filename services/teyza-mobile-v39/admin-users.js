'use strict';
const crypto=require('node:crypto');
const D=require('./domain');
const P=require('./publication');
const {recentAdmin}=require('./seller-experience');

// Only privileged server-side Firebase Admin SDK functions are used. Never
// accept role claims, passwords, or email verification status from the client.
const actions=new Set([
 'ops_users','ops_user_detail','ops_user_create',
 'ops_user_invite','ops_user_set_disabled','ops_agent_user_provision',
]);
function clean(user,registration=null,agent=null){
 return {
  uid:user.uid,email:user.email||'',displayName:user.displayName||'',
  phone:user.phoneNumber||'',disabled:user.disabled===true,
  verified:user.emailVerified===true,
  admin:user.customClaims?.teyzaAdmin===true,
  providers:(user.providerData||[]).map(p=>p.providerId).filter(Boolean),
  createdAt:user.metadata?.creationTime||'',
  registeredRole:registration?.requestedRole||null,
  agentStatus:agent?.uid===user.uid?agent.status||null:null,
  invitationStatus:registration?.invitationStatus||null,
 };
}
function email(value){
 const result=D.text(value,'user email address',254).toLowerCase();
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(result))
   D.fail(422,'Enter a valid user email address.');
 return result;
}
function createAdminUsers({db,clock=Date.now,rate,
  listAuthUsers,getAuthUser,getAuthUserByEmail,createAuthUser,
  updateAuthUser,revokeAuthTokens,sendPasswordResetEmail}){
 const doc=path=>db.doc(path);
 const requireSupport=fn=>{if(typeof fn!=='function')D.fail(503,'Firebase user administration is not configured.');return fn;};
 async function log(actor,action,target,details={}){
  await doc('teyzaAdminUserAudit/'+crypto.randomUUID()).set({
    actorUid:actor.uid,action,target,details,createdAt:clock()
  });
 }
 async function execute(actor,action,data={}){
  recentAdmin(actor,clock);
  const uid=D.id(actor.uid);
  await rate(uid,'admin-users',45,60000);
  if(action==='ops_users'){
   const pageToken=data.after?D.text(data.after,'user page token',2048):undefined;
   const page=await requireSupport(listAuthUsers)(30,pageToken);
   const rows=await Promise.all((page.users||[]).map(async user=>{
     const [record,agent]=await Promise.all([doc('teyzaAdminProvisionedUsers/'+user.uid).get(),doc('teyzaFieldAgents/'+user.uid).get()]);
     return clean(user,record.exists?record.data():null,agent.exists?agent.data():null);
   }));
   return {users:rows,next:page.pageToken||null};
  }
  if(action==='ops_user_detail'){
   const target=D.id(data.userUid),user=await requireSupport(getAuthUser)(target);
   const [provision,seller,verification,onboarding,shop,billing,agent]=await Promise.all([
     doc('teyzaAdminProvisionedUsers/'+target).get(),
     doc('teyzaSellerAccounts/'+target).get(),
     doc('teyzaMobileVerification/'+target).get(),
     doc('teyzaSellerOnboarding/'+target).get(),
     doc('teyzaPublicShops/'+target).get(),
     doc('teyzaBilling/'+target).get(),
     doc('teyzaFieldAgents/'+target).get()
   ]);
   const account=seller.exists?seller.data():null;
   const selfie=verification.exists?verification.data():null;
   const bill=billing.exists?billing.data():null;
   const publication=account?P.state(target,account,onboarding.exists?onboarding.data():{},
     selfie,shop.exists?shop.data():null,bill,clock()):null;
   return {user:clean(user,provision.exists?provision.data():null,agent.exists?agent.data():null),
     seller:account?{
       shopName:account.shopName||'',
       category:account.category||'',
       approvalStatus:account.approvalStatus||'pending',
       verificationStatus:selfie?.status||'not_submitted',
       verifiedOwner:publication.approved,
       registrationReady:publication.ready,
       sellingUnlocked:publication.canSell,
       membershipPaid:P.entitled(target,account,bill,clock()),
       complimentaryAccess:P.complimentary(target,account,bill,clock()),
     }:null};
  }
  if(action==='ops_agent_user_provision'){
   // Create a login and a pending application; never grant an administrative
   // claim, set email verification, attach a seller, approve work, or set a
   // caller-supplied password. Existing accounts are explicitly linked by UID.
   if(data.confirmed!==true)D.fail(422,'Confirm the agent requested this account and provided their details.');
   const address=email(data.email),name=D.text(data.displayName,'full name',120);
   const phone=require('./onboarding').phone(data.phone),area=D.text(data.area,'working town or area',120);
   const province=data.province,mode=data.mode;
   if(!['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'].includes(province))
    D.fail(422,'Choose a South African province.');
   if(!['new','existing'].includes(mode))D.fail(422,'Choose new login or link an existing Teyza account.');
   await rate(uid,'admin-agent-provision',5,86400000);
   let user=null;
   try{user=await requireSupport(getAuthUserByEmail)(address);}
   catch(e){if(e.code!=='auth/user-not-found')throw e;}
   if(mode==='new'&&user)D.fail(409,'This email already has a Teyza account. Choose Link existing account only after confirming ownership.');
   if(mode==='existing'&&!user)D.fail(404,'No existing account was found. Choose Create new login.');
   if(!user){
    try{user=await requireSupport(createAuthUser)({email:address,displayName:name,emailVerified:false,password:crypto.randomBytes(42).toString('base64url'),disabled:false});}
    catch(e){if(e.code==='auth/email-already-exists')D.fail(409,'This email now has a Teyza account. Refresh before continuing.');throw e;}
   }
   const target=D.id(user.uid);
   if(target===uid||user.disabled===true||user.customClaims?.teyzaAdmin===true||user.customClaims?.teyzaSupportAgent===true||user.customClaims?.teyzaPhoneBootstrap===true)
    D.fail(403,'Administrator, support-only, disabled and temporary accounts cannot be provisioned here.');
   if(String(user.email||'').toLowerCase()!==address)D.fail(409,'The account email changed. Refresh and confirm the correct identity.');
   const profileRef=doc('teyzaFieldAgents/'+target),registration=doc('teyzaAdminProvisionedUsers/'+target);
   const profile={uid:target,name,phone,email:address,address:'',province,area,status:'pending',revision:0,reviewNote:'',
    registrationSource:'admin_invited',provisionedBy:uid,provisionedAt:clock(),createdAt:clock()};
   try{
    await db.runTransaction(async tx=>{
     const [old,registered,closure]=await Promise.all([tx.get(profileRef),tx.get(registration),tx.get(doc('teyzaAccountDeletionRequests/'+target))]);
     if(old.exists)D.fail(409,'An agent profile already exists for this login. Review the existing application instead.');
     if(closure.exists&&closure.data()?.status!=='completed')D.fail(409,'This account has a pending deletion request.');
     if(registered.exists&&registered.data()?.ownerUid!==target)D.fail(409,'Account ownership changed.');
     tx.set(profileRef,profile);
     if(!registered.exists)tx.set(registration,{ownerUid:target,email:address,displayName:name,requestedRole:'agent',invitedBy:uid,createdAt:clock(),invitationStatus:mode==='new'?'pending':'existing_account'});
     tx.set(doc('teyzaAdminUserAudit/'+crypto.randomUUID()),{actorUid:uid,action,target,details:{mode,requestedRole:'agent'},createdAt:clock()});
    });
   }catch(e){
    if(e.status)throw e;
    D.fail(503,'Agent profile not confirmed. No setup email was sent. Check the existing email/account and agent directory before retrying.');
   }
   // Existing identities retain their original login provider and credentials.
   // No unsolicited reset email is sent when linking an existing account.
   let invitationStatus=mode==='new'?'pending':'existing_account';
   if(mode==='new'){
    try{await requireSupport(sendPasswordResetEmail)(address);invitationStatus='sent';}
    catch(_){invitationStatus='failed';}
    try{await registration.update({invitationStatus,updatedAt:clock(),...(invitationStatus==='sent'?{invitationSentAt:clock()}: {})});
     await log(actor,'ops_user_invite',target,{sent:invitationStatus==='sent'});}
    catch(_){invitationStatus='review_required';}
   }
   return {created:true,mode,inviteSent:invitationStatus==='sent',invitationStatus,profile:{uid:target,name,phone,email:address,address:'',province,area,status:'pending',revision:0,reviewNote:'',hasDocuments:false,registrationSource:'admin_invited',createdAt:profile.createdAt}};
  }
  if(action==='ops_user_create'){
   const address=email(data.email);
   const displayName=D.text(data.displayName,'user display name',120);
   const requestedRole=data.requestedRole;
   if(!['shopper','seller'].includes(requestedRole))
     D.fail(422,'Choose Shopper or Seller.');
   if(data.confirmed!==true)
     D.fail(422,'Confirm that this person requested an account.');
   await rate(uid,'admin-user-create',5,86400000);
   // Do not overwrite existing accounts, take over users or create admins.
   try{
     const found=await requireSupport(getAuthUserByEmail)(address);
     if(found)D.fail(409,'This email already has a Teyza account. Open it in Users instead.');
   }catch(e){
     if(e.status)throw e;
     if(e.code!=='auth/user-not-found')throw e;
   }
   // A random, never disclosed password keeps the account inaccessible until
   // the user receives a Firebase password reset email and chooses their own.
   const user=await requireSupport(createAuthUser)({
     email:address,displayName,emailVerified:false,
     password:crypto.randomBytes(42).toString('base64url'),
     disabled:false,
   });
   const ref=doc('teyzaAdminProvisionedUsers/'+user.uid);
   await ref.set({ownerUid:user.uid,email:address,displayName,
     requestedRole,invitedBy:uid,createdAt:clock(),
     invitationStatus:'pending'});
   await log(actor,action,user.uid,{requestedRole});
   let inviteSent=false;
   try{
     await requireSupport(sendPasswordResetEmail)(address);
     inviteSent=true;
     await ref.update({invitationStatus:'sent',invitationSentAt:clock()});
     await log(actor,'ops_user_invite',user.uid,{sent:true});
   }catch(_){
     await ref.update({invitationStatus:'failed',updatedAt:clock()});
   }
   return {created:true,user:clean(user,{requestedRole,invitationStatus:inviteSent?'sent':'failed'}),
     inviteSent};
  }
  if(action==='ops_user_invite'){
   const target=D.id(data.userUid);
   if(target===uid)D.fail(403,'Do not send a password setup link to yourself from the admin desk.');
   const user=await requireSupport(getAuthUser)(target);
   if(user.customClaims?.teyzaAdmin===true)D.fail(403,'Administrator accounts are managed by the project owner.');
   if(!user.email)D.fail(409,'This account has no email address.');
   await rate(uid,'admin-user-invite',10,86400000);
   await requireSupport(sendPasswordResetEmail)(user.email);
   const ref=doc('teyzaAdminProvisionedUsers/'+target);
   const registration=await ref.get();
   if(registration.exists&&registration.data().ownerUid===target)
     await ref.update({invitationStatus:'sent',invitationSentAt:clock()});
   await log(actor,action,target,{sent:true});
   return {sent:true};
  }
  if(action==='ops_user_set_disabled'){
   const target=D.id(data.userUid),disabled=data.disabled;
   if(typeof disabled!=='boolean'||data.confirmed!==true)
     D.fail(422,'Confirm whether to suspend or reactivate this account.');
   if(target===uid)D.fail(403,'You cannot suspend your own administrator session.');
   const user=await requireSupport(getAuthUser)(target);
   if(user.customClaims?.teyzaAdmin===true)
     D.fail(403,'Administrator access must be managed by the Teyza project owner.');
   if(user.disabled===disabled)return {updated:false,disabled};
   await requireSupport(updateAuthUser)(target,{disabled});
   if(disabled)await requireSupport(revokeAuthTokens)(target);
   await log(actor,action,target,{disabled});
   return {updated:true,disabled};
  }
  D.fail(404,'Unknown administrator operation.');
 }
 return {execute};
}
module.exports={actions,createAdminUsers};
