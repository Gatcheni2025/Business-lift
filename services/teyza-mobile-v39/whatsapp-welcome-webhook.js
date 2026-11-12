'use strict';
const crypto=require('node:crypto');
const {checkedPhone}=require('./onboarding');
const {responseFor}=require('./whatsapp-welcome-menu');
const ONE_DAY=86400000;
function safeEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const aa=Buffer.from(a),bb=Buffer.from(b);
 return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
function createWelcomeWebhook({db,getAuthUser,getAppSecret=()=>'',getVerifyToken=()=>'',getAccessToken=()=>'',getConfig=()=>({}),send=fetch,clock=Date.now}){
 const doc=path=>db.doc(path);
 async function accountForPhone(phone){
  if(!/^\d{9,15}$/.test(phone))return null;
  const rows=await db.collection('teyzaSellerAccounts').where('phone','==','+'+phone).limit(3).get();
  if(rows.docs.length!==1)return null; // Ambiguous shared seller numbers need manual review.
  const row=rows.docs[0],account=row.data();
  if(!account||account.uid!==row.id||account.phone!=='+'+phone||
    account.approvalStatus!=='approved'||account.deletionPending===true)return null;
  return {uid:row.id,account};
 }
 function verifyGet(req,res){
  const supplied=req.query?.['hub.verify_token'],mode=req.query?.['hub.mode'],
    challenge=req.query?.['hub.challenge'],expected=getVerifyToken();
  if(mode!=='subscribe'||!safeEqual(supplied,expected)||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(String(challenge||''))){res.status(403).end();return;}
  res.status(200).send(challenge);
 }
 async function receive(req,res){
  const raw=req.rawBody;
  if(!Buffer.isBuffer(raw)||raw.length<2||raw.length>65536){res.status(400).end();return;}
  const secret=getAppSecret(),header=req.get?.('X-Hub-Signature-256')||'';
  if(typeof secret!=='string'||secret.length<16){res.status(503).end();return;}
  const expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
  if(!safeEqual(header,expected)){res.status(403).end();return;}
  let body;try{body=JSON.parse(raw.toString('utf8'));}catch(_){res.status(400).end();return;}
  if(body?.object!=='whatsapp_business_account'){res.status(200).json({ok:true});return;}
  const config=getConfig(),phoneNumberId=config.phoneNumberId||'';
  if(!/^\d+$/.test(phoneNumberId)){res.status(503).end();return;}
  for(const entry of (Array.isArray(body.entry)?body.entry.slice(0,10):[])){
   for(const update of (Array.isArray(entry.changes)?entry.changes.slice(0,10):[])){
    if(update.field!=='messages'||update.value?.metadata?.phone_number_id!==phoneNumberId)continue;
    for(const msg of (Array.isArray(update.value.messages)?update.value.messages.slice(0,10):[])){
     if(typeof msg?.id!=='string'||!/^wamid\.[A-Za-z0-9_+=.:-]{4,512}$/.test(msg.id)||
       !/^\d{9,15}$/.test(msg.from||''))continue;
     const sentAt=Number(msg.timestamp)*1000,now=clock();
     if(!Number.isFinite(sentAt)||sentAt>now+60000||sentAt<=now-ONE_DAY)continue;
     const recipient=await accountForPhone(msg.from);
     if(!recipient)continue;
     const {uid,account}=recipient;
     let user;try{user=await getAuthUser(uid);checkedPhone(user,account.phone);}catch(_){continue;}
     const incomingChoice=msg.type==='button'?msg.button?.payload:
       msg.type==='interactive'?(msg.interactive?.button_reply?.id||msg.interactive?.list_reply?.id):null;
     const optOut=msg.type==='text'&&/^(stop|unsubscribe|cancel|opt[ -]?out)$/i.test(String(msg.text?.body||'').trim());
     if(!optOut&&!responseFor(incomingChoice))continue;
     const replyId=crypto.createHash('sha256').update(msg.id).digest('hex');
     const outbox=doc('teyzaWhatsAppWelcomeReplies/'+replyId);
     const prefRef=doc('teyzaWhatsAppPreferences/'+uid);
     const welcomeRef=doc('teyzaWhatsAppWelcomeOnce/'+uid);
     await db.runTransaction(async tx=>{
      const [existing,pref,welcome,verification]=await Promise.all([
       tx.get(outbox),tx.get(prefRef),tx.get(welcomeRef),tx.get(doc('teyzaMobileVerification/'+uid))]);
      if(existing.exists||!welcome.exists||!verification.exists||
         verification.data().status!=='approved')return;
      if(pref.exists&&pref.data().optedIn!==true)return;
      if(optOut){
       tx.set(prefRef,{ownerUid:uid,phone:account.phone,optedIn:false,
         optedOutAt:clock(),updatedAt:clock()},{merge:true});
       tx.create(outbox,{sellerUid:uid,status:'opted_out',receivedAt:clock(),
         messageHash:replyId});
       return;
      }
      tx.create(outbox,{sellerUid:uid,choice:incomingChoice,status:'queued',
       receivedAt:clock(),userMessageAt:sentAt,phoneHash:crypto.createHash('sha256').update(account.phone).digest('hex')});
     });
    }
   }
  }
  res.status(200).json({ok:true});
 }
 async function deliver(replyId){
  if(!/^[a-f0-9]{64}$/.test(replyId))return;
  const ref=doc('teyzaWhatsAppWelcomeReplies/'+replyId),snap=await ref.get();
  if(!snap.exists||snap.data().status!=='queued')return;
  const reply=snap.data(),config=getConfig(),token=getAccessToken(),
   configured=typeof token==='string'&&token.length>10&&
     /^v\d+\.\d+$/.test(config.apiVersion||'')&&/^\d+$/.test(config.phoneNumberId||'');
  let user;try{user=await getAuthUser(reply.sellerUid);}catch(_){return;}
  const claimed=await db.runTransaction(async tx=>{
   const [row,account,pref,welcome,verification]=await Promise.all([
    tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+reply.sellerUid)),
    tx.get(doc('teyzaWhatsAppPreferences/'+reply.sellerUid)),
    tx.get(doc('teyzaWhatsAppWelcomeOnce/'+reply.sellerUid)),
    tx.get(doc('teyzaMobileVerification/'+reply.sellerUid))]);
   if(!row.exists||row.data().status!=='queued')return null;
   const a=account.exists?account.data():null,p=pref.exists?pref.data():null,
    content=responseFor(row.data().choice),now=clock();
   if(!content||!a||a.uid!==reply.sellerUid||a.approvalStatus!=='approved'||
      a.deletionPending===true||!p||p.optedIn!==true||p.phone!==a.phone||
      !welcome.exists||!verification.exists||verification.data().status!=='approved'||
      !Number.isFinite(row.data().userMessageAt)||now-row.data().userMessageAt>ONE_DAY||
      now<row.data().userMessageAt||
      crypto.createHash('sha256').update(a.phone).digest('hex')!==row.data().phoneHash){
    tx.update(ref,{status:'skipped',reason:'no_permission_or_expired',updatedAt:now});return null;
   }
   let phone;try{phone=checkedPhone(user,a.phone);}catch(_){
    tx.update(ref,{status:'skipped',reason:'phone_not_verified',updatedAt:now});return null;
   }
   if(!configured){tx.update(ref,{status:'configuration_required',updatedAt:now});return null;}
   tx.update(ref,{status:'sending',attemptedAt:now});
   return {phone:phone.slice(1),content};
  });
  if(!claimed)return;
  try{
   const resp=await send('https://graph.facebook.com/'+config.apiVersion+'/'+config.phoneNumberId+'/messages',{
    method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({...claimed.content,to:claimed.phone,recipient_type:'individual'}),
    signal:AbortSignal.timeout(15000)});
   const body=await resp.json().catch(()=>null),id=body?.messages?.[0]?.id;
   if(!resp.ok||typeof id!=='string'||!id){
    await ref.update({status:'needs_review',reason:'provider_response',httpStatus:resp.status||0,updatedAt:clock()});return;
   }
   await ref.update({status:'accepted',providerMessageId:id,acceptedAt:clock()});
  }catch(_){await ref.update({status:'needs_review',reason:'delivery_uncertain',updatedAt:clock()});}
 }
 return {verifyGet,receive,deliver};
}
module.exports={createWelcomeWebhook};
