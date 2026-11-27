'use strict';
const crypto=require('node:crypto'),D=require('./domain');
const IDLE_MS=5*60*1000,verifiedSession=Symbol('verified-admin-idle-session');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const tokenValid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const SUPPORT_AGENT_ACTIONS=new Set(['ops_whatsapp_support_inbox','ops_support_thread','ops_support_reply']);
const LEGACY_ADMIN_ACTIONS=new Set(['seller_identity_read','verification_read','catalogue_review','chat_report_queue','chat_report_resolve']);
// admin_access is a self-only claim probe, not authority to perform a protected operation.
function protectedAdminAction(action){return typeof action==='string'&&(action.startsWith('ops_')||action.startsWith('agent_admin_')||(action.startsWith('admin_')&&action!=='admin_access')||LEGACY_ADMIN_ACTIONS.has(action));}
function restrictedSupportAction(auth,action){return SUPPORT_AGENT_ACTIONS.has(action)&&auth?.teyzaSupportAgent===true&&auth?.teyzaAdmin!==true;}
function adminPasswordIdentity(auth){
 if(auth?.teyzaAdmin!==true||auth.email_verified!==true)D.fail(403,'Teyza administrator access and a verified email are required.');
 if(auth.teyzaPhoneBootstrap===true||auth.firebase?.sign_in_provider!=='password'||!Number.isSafeInteger(auth.auth_time)||auth.auth_time<=0)
  D.fail(401,'Sign in to Admin with your email and password.');
}
function hasIdleSession(auth,clock){
 return Number.isFinite(auth?.[verifiedSession])&&clock()<auth[verifiedSession];
}
function createAdminSessions({db,clock=Date.now,rate,getAuthUser}){
 const refFor=auth=>db.doc('teyzaAdminIdleSessions/'+D.id(auth.uid));
 async function currentAdmin(auth){
  adminPasswordIdentity(auth);
  const current=await getAuthUser(auth.uid);
  if(!current||current.uid!==auth.uid||current.disabled===true||current.emailVerified!==true||current.customClaims?.teyzaAdmin!==true)
   D.fail(403,'Teyza administrator access and a verified email are required.');
 }
 function matches(auth,row,token){
  return tokenValid(token)&&row?.uid===auth.uid&&row.authTime===auth.auth_time&&row.tokenHash===digest(token);
 }
 function active(auth,row,token){
  if(!matches(auth,row,token)||!Number.isFinite(row.expiresAt)||row.expiresAt<=clock())
   D.fail(401,'Your Admin session expired after inactivity. Sign in again.');
  return row;
 }
 async function start(auth){
  await currentAdmin(auth);
  const age=clock()/1000-auth.auth_time;
  if(!Number.isFinite(age)||age< -60||age>300)D.fail(401,'Sign in again with your email and password.');
  await rate(auth.uid,'admin-session-start',8,60000);
  const token=crypto.randomBytes(32).toString('hex'),now=clock();
  // One active Admin workspace per account; never store the bearer token itself.
  await db.runTransaction(async tx=>{
   const ref=refFor(auth),snap=await tx.get(ref),previous=snap.exists?snap.data():null;
   // Keep the consumed auth event even after logout/expiry. Concurrent starts and old
   // Firebase ID/refresh tokens cannot replace a session or recreate it after termination.
   if(previous&&(!Number.isSafeInteger(previous.authTime)||auth.auth_time<=previous.authTime))
    D.fail(401,'This sign-in event has already opened an Admin session. Sign in again with your password.');
   tx.set(ref,{uid:auth.uid,authTime:auth.auth_time,tokenHash:digest(token),createdAt:now,lastActiveAt:now,lastActivityId:0,expiresAt:now+IDLE_MS});
  });
  return {sessionToken:token,idleMs:IDLE_MS};
 }
 async function validate(auth,token){
  await currentAdmin(auth);
  const snap=await refFor(auth).get(),row=active(auth,snap.exists?snap.data():null,token);
  // Only server-verified requests carry this non-JSON marker.
  return {...auth,[verifiedSession]:row.expiresAt};
 }
 async function touch(auth,token,data={}){
  const lag=data.activityLagMs??0,id=data.activityId;
  if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(lag)||lag<0||lag>60000)D.fail(400,'Invalid activity update.');
  await currentAdmin(auth);
  await rate(auth.uid,'admin-session-touch',12,60000);
  return db.runTransaction(async tx=>{
   const ref=refFor(auth),snap=await tx.get(ref);
   const row=active(auth,snap.exists?snap.data():null,token),now=clock();
   // A delayed activity report preserves the original activity time, not the heartbeat time.
   const activityAt=now-lag;
   if(id>(row.lastActivityId||0)&&activityAt>row.lastActiveAt)tx.update(ref,{lastActiveAt:activityAt,lastActivityId:id,expiresAt:activityAt+IDLE_MS});
   return {idleMs:IDLE_MS};
  });
 }
 async function end(auth,token){
  if(!tokenValid(token))return {signedOut:true};
  return db.runTransaction(async tx=>{
   const ref=refFor(auth),snap=await tx.get(ref),row=snap.exists?snap.data():null;
   if(matches(auth,row,token))tx.update(ref,{expiresAt:0});
   return {signedOut:true};
  });
 }
 return {start,validate,touch,end};
}
module.exports={createAdminSessions,hasIdleSession,adminPasswordIdentity,protectedAdminAction,restrictedSupportAction,IDLE_MS};
