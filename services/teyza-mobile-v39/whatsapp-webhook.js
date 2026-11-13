'use strict';
// Meta WhatsApp Cloud API webhook. No chat bodies, phone numbers, profile
// names, message contents or media URLs are persisted in diagnostics.
const crypto=require('node:crypto');
const MAX_BODY=512*1024;
const statuses=new Set(['sent','delivered','read','failed','deleted','played']);
const eventTypes=new Set(['text','image','video','audio','document','sticker','location','contacts','interactive','button','reaction','order','unknown']);
function equalSecret(actual,expected){
 if(typeof actual!=='string'||typeof expected!=='string'||!expected)return false;
 const a=Buffer.from(actual,'utf8'),b=Buffer.from(expected,'utf8');
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function checkSignature(raw,header,secret){
 if(!Buffer.isBuffer(raw)||!raw.length||raw.length>MAX_BODY||
   typeof secret!=='string'||!secret||typeof header!=='string'||!/^sha256=[a-f0-9]{64}$/i.test(header))return false;
 const supplied=Buffer.from(header.slice(7),'hex');
 const expected=crypto.createHmac('sha256',secret).update(raw).digest();
 return crypto.timingSafeEqual(supplied,expected);
}
function identifier(value){
 return typeof value==='string'&&/^[A-Za-z0-9_.:=+/-]{1,512}$/.test(value)?value:null;
}
function safeEvents(payload){
 if(!payload||payload.object!=='whatsapp_business_account'||!Array.isArray(payload.entry)||payload.entry.length>50) return [];
 const out=[];
 for(const entry of payload.entry){
  if(!Array.isArray(entry?.changes)||entry.changes.length>50)continue;
  for(const change of entry.changes){
   if(change?.field!=='messages'||!change.value||typeof change.value!=='object')continue;
   const value=change.value;
   const numberId=identifier(value.metadata?.phone_number_id);
   if(!numberId)continue;
   for(const message of Array.isArray(value.messages)?value.messages.slice(0,100):[]){
    const id=identifier(message?.id);
    if(!id)continue;
    out.push({providerMessageId:id,kind:'inbound',eventType:eventTypes.has(message.type)?message.type:'unknown',senderPhoneNumberId:numberId});
   }
   for(const status of Array.isArray(value.statuses)?value.statuses.slice(0,100):[]){
    const id=identifier(status?.id),state=typeof status?.status==='string'?status.status:'';
    if(!id||!statuses.has(state))continue;
    // A single provider message may transition through sent/delivered/read.
    // Use status and provider timestamp to dedupe redelivered callbacks.
    const timestamp=typeof status.timestamp==='string'&&/^\d{1,15}$/.test(status.timestamp)?status.timestamp:'';
    out.push({providerMessageId:id,kind:'status',eventType:state,senderPhoneNumberId:numberId,providerTimestamp:timestamp});
   }
   if(out.length>500)return out.slice(0,500);
  }
 }
 return out;
}
function createWebhook({db,getVerifyToken,getAppSecret,clock=Date.now,logger={warn(){},error(){}}}){
 if(!db||typeof getVerifyToken!=='function'||typeof getAppSecret!=='function')throw Error('Webhook dependencies missing');
 const collection=db.collection('teyzaWhatsAppWebhookEvents');
 async function handle(req,res){
  res.set('Cache-Control','no-store');
  res.set('Content-Type','text/plain; charset=utf-8');
  if(req.method==='GET'){
   const mode=req.query?.['hub.mode'],token=req.query?.['hub.verify_token'],challenge=req.query?.['hub.challenge'];
   if(mode==='subscribe'&&equalSecret(token,getVerifyToken())&&typeof challenge==='string'&&/^\d{1,200}$/.test(challenge)){
    res.status(200).send(challenge);return;
   }
   res.status(403).send('Verification rejected');return;
  }
  if(req.method!=='POST'){res.set('Allow','GET, POST');res.status(405).send('Method not allowed');return;}
  const raw=req.rawBody;
  if(!Buffer.isBuffer(raw)||raw.length>MAX_BODY){res.status(413).send('Invalid request');return;}
  if(!checkSignature(raw,req.get('X-Hub-Signature-256'),getAppSecret())){res.status(403).send('Signature rejected');return;}
  let payload;
  try{payload=JSON.parse(raw.toString('utf8'));}catch{res.status(400).send('Invalid JSON');return;}
  if(payload?.object!=='whatsapp_business_account'){res.status(400).send('Unexpected object');return;}
  const events=safeEvents(payload);
  try{
   for(const event of events){
    const {providerMessageId,kind,eventType,senderPhoneNumberId,providerTimestamp=''}=event;
    const dedupeKey=crypto.createHash('sha256').update(JSON.stringify([senderPhoneNumberId,providerMessageId,kind,eventType,providerTimestamp])).digest('hex');
    const record={kind,eventType,receivedAt:clock(),source:'meta_whatsapp_signed_webhook',schemaVersion:1};
    // Firestore create is atomic. An already-exists error signals a
    // redelivery, not an application failure. Do not log the raw payload.
    try{await collection.doc(dedupeKey).create(record);}
    catch(error){if(error?.code!==6&&error?.code!=='already-exists'&&error?.code!=='ALREADY_EXISTS')throw error;}
   }
  }catch(error){
   logger.error('WhatsApp webhook persistence unavailable', {code:String(error?.code||'unknown')});
   res.status(503).send('Temporarily unavailable');return;
  }
  res.status(200).send('EVENT_RECEIVED');
 }
 return {handle};
}
module.exports={createWebhook,checkSignature,equalSecret,safeEvents,MAX_BODY};
