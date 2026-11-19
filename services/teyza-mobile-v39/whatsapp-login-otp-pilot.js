'use strict';
/**
 * Disabled-by-default Teyza WhatsApp authentication OTP pilot.
 *
 * This module is NOT wired to exports.teyzaMobile or deployed as a Cloud
 * Function. WhatsApp MENU and approval notifications do not authenticate.
 * Enablement requires approved Meta *authentication* template, separate
 * verified login-OTP consent, audited server integration and pilot sign-off.
 *
 * DB challenge records store only HMAC digests, UID, counters, timestamps and
 * state. Never store OTP/plain phone/chat text or print them to logs.
 */
const crypto=require('node:crypto');
const TRIES=5,TTL=5*60*1000,WINDOW=15*60*1000;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===64&&b.length===64&&
  crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const codeValid=c=>typeof c==='string'&&/^\d{6}$/.test(c);
const phoneValid=p=>typeof p==='string'&&/^\+[1-9][0-9]{7,14}$/.test(p);
const challengeValid=id=>typeof id==='string'&&/^[a-f0-9]{48}$/.test(id);
const fail=()=>{throw Error('WhatsApp login is not available or the verification could not be completed.');};

function createWhatsAppLoginPilot({
 db,auth,sendAuthenticationTemplate,serverSecret,
 enabled=()=>false,pilotSellerUid=()=>'',now=Date.now,randomCode=()=>String(crypto.randomInt(0,1000000)).padStart(6,'0'),
 randomId=()=>crypto.randomBytes(24).toString('hex')
}={}){
 if(!db||typeof db.doc!=='function'||typeof db.collection!=='function'||typeof db.runTransaction!=='function'||
    !auth||typeof auth.getUser!=='function'||typeof auth.createCustomToken!=='function'||
    typeof sendAuthenticationTemplate!=='function'||typeof enabled!=='function'||typeof pilotSellerUid!=='function'||
    typeof serverSecret!=='string'||serverSecret.length<32)throw Error('Missing WhatsApp login security dependencies');
 const digest=(scope,...parts)=>crypto.createHmac('sha256',serverSecret)
  .update(JSON.stringify([scope,...parts])).digest('hex');
 const accountReady=(seller,uid,phone,pref)=>{
  const data=seller?.data?.();
  return seller?.exists===true&&data?.uid===uid&&data?.phone===phone&&
    data?.approvalStatus==='approved'&&data?.identityVerified===true&&
    data?.phoneVerified===true&&data?.setupComplete===true&&
    pref?.exists===true&&pref.data()?.ownerUid===uid&&pref.data()?.phone===phone&&
    pref.data()?.loginOtpOptIn===true&&pref.data()?.loginOtpConsentVersion==='whatsapp-login-otp-v1';
 };
 function active(){return enabled()===true&&/^[A-Za-z0-9_-]{6,128}$/.test(pilotSellerUid());}
 async function consumeLimit(phoneDigest,ipDigest){
  const nowMs=now(),pr=db.doc('teyzaWhatsAppLoginLimits/p_'+phoneDigest),
    ir=db.doc('teyzaWhatsAppLoginLimits/i_'+ipDigest);
  return db.runTransaction(async tx=>{
   const [p,i]=await Promise.all([tx.get(pr),tx.get(ir)]);
   const recent=(snap,max)=>{
    const d=snap.exists?snap.data():{};
    const started=Number(d.windowStart);
    const fresh=Number.isFinite(started)&&nowMs>=started&&nowMs-started<WINDOW;
    const count=fresh?Number(d.count)||0:0;
    return {windowStart:fresh?started:nowMs,count,max};
   };
   const a=recent(p,3),b=recent(i,10);
   if(a.count>=a.max||b.count>=b.max)return false;
   tx.set(pr,{windowStart:a.windowStart,count:a.count+1,updatedAt:nowMs});
   tx.set(ir,{windowStart:b.windowStart,count:b.count+1,updatedAt:nowMs});
   return true;
  });
 }
 async function begin({phone,ip}={}){
  if(!active()||!phoneValid(phone)||typeof ip!=='string'||ip.length<3||ip.length>128)return fail();
  const phoneDigest=digest('phone',phone),ipDigest=digest('ip',ip);
  if(!await consumeLimit(phoneDigest,ipDigest))return fail();
  // The phone is only a lookup hint until the signed-in Meta template is
  // delivered and the one-time code is proven. Never create an account here.
  const found=await db.collection('teyzaSellerAccounts').where('phone','==',phone).limit(3).get();
  if(found.docs.length!==1)return fail();
  const seller=found.docs[0],uid=seller.id;
  if(uid!==pilotSellerUid())return fail();
  const pref=await db.doc('teyzaWhatsAppPreferences/'+uid).get();
  if(!accountReady(seller,uid,phone,pref))return fail();
  const firebaseUser=await auth.getUser(uid);
  if(firebaseUser.disabled===true)return fail();
  const challengeId=randomId(),otp=randomCode();
  if(!challengeValid(challengeId)||!codeValid(otp))throw Error('Invalid secure random generator');
  const created=now(),ref=db.doc('teyzaWhatsAppLoginChallenges/'+challengeId);
  await db.runTransaction(async tx=>{
   const existing=await tx.get(ref);
   if(existing.exists)throw Error('Challenge id collision');
   tx.create(ref,{sellerUid:uid,phoneDigest,codeDigest:digest('otp',challengeId,otp),
    expiresAt:created+TTL,attempts:0,state:'pending',createdAt:created,
    template:'teyza_auth_otp',consentVersion:'whatsapp-login-otp-v1'});
  });
  try{
   // The transport must use Meta's approved AUTHENTICATION OTP template.
   // Its return value attests API acceptance, not delivery to the device.
   const sent=await sendAuthenticationTemplate({
    phone,otp,challengeId,template:'teyza_auth_otp'});
   if(sent?.accepted!==true)throw Error('Template rejected');
   await ref.update({state:'sent',acceptedAt:now()});
  }catch{
   await ref.update({state:'failed',updatedAt:now()});
   return fail(); // Do not retry automatically when Meta's outcome is uncertain.
  }
  return {challengeId,expiresInSeconds:Math.floor(TTL/1000)};
 }
 async function verify({challengeId,code}={}){
  if(!active()||!challengeValid(challengeId)||!codeValid(code))return fail();
  const ref=db.doc('teyzaWhatsAppLoginChallenges/'+challengeId);
  const answer=await db.runTransaction(async tx=>{
   const record=await tx.get(ref);
   if(!record.exists)return null;
   const d=record.data(),at=now();
   if(d.state!=='sent'||!Number.isFinite(d.expiresAt)||at>=d.expiresAt||
      !Number.isFinite(d.createdAt)||at<d.createdAt||at-d.createdAt>TTL||
      !Number.isInteger(d.attempts)||d.attempts>=TRIES)return null;
   const uid=d.sellerUid;
   if(uid!==pilotSellerUid())return null;
   // Recheck current owner approval, identity and explicit OTP consent.
   const sellerRef=db.doc('teyzaSellerAccounts/'+uid),
     prefRef=db.doc('teyzaWhatsAppPreferences/'+uid);
   const [seller,pref]=await Promise.all([tx.get(sellerRef),tx.get(prefRef)]);
   const linkedPhone=seller.data()?.phone;
   const authorized=phoneValid(linkedPhone)&&same(d.phoneDigest,digest('phone',linkedPhone))&&
     accountReady(seller,uid,linkedPhone,pref);
   const matched=same(d.codeDigest,digest('otp',challengeId,code));
   const attempts=d.attempts+1;
   if(!authorized||!matched){
    tx.update(ref,{attempts,state:attempts>=TRIES?'blocked':'sent',lastAttemptAt:at});
    return null;
   }
   tx.update(ref,{state:'used',attempts,usedAt:at,codeDigest:''});
   return {uid};
  });
  if(!answer)return fail();
  // Tokens are created only after one-use transaction commits. A disabled or
  // deleted Firebase user cannot receive a new custom token.
  const firebaseUser=await auth.getUser(answer.uid);
  if(firebaseUser.disabled===true)return fail();
  const token=await auth.createCustomToken(answer.uid,{teyzaWhatsAppOtp:true});
  return {customToken:token,uid:answer.uid};
 }
 return {begin,verify};
}
module.exports={createWhatsAppLoginPilot};
