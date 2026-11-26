'use strict';
// Separate server-only transactional onboarding mail. No app/client writes.
const crypto=require('node:crypto');
const JOBS='teyzaAgentWelcomeMail', CONTROL='teyzaAgentMailSettings/control', SCAN='teyzaAgentMailSettings/scan';
const FOREVER=253402300799999, LEASE=10*60*1000, DAY=86400000;
const SENDER='support@teyza.co.za', MANUAL='Teyza_Field_Agent_Training_Manual.pdf';
const SUBJECT='Welcome to Teyza | Your Field Agent Training & Getting Started';
const regions=Object.freeze({
 us:['https://accounts.zoho.com','https://mail.zoho.com'],
 eu:['https://accounts.zoho.eu','https://mail.zoho.eu'],
 in:['https://accounts.zoho.in','https://mail.zoho.in'],
 au:['https://accounts.zoho.com.au','https://mail.zoho.com.au'],
 jp:['https://accounts.zoho.jp','https://mail.zoho.jp'],
 ca:['https://accounts.zohocloud.ca','https://mail.zohocloud.ca']
});
function problem(code){const e=new Error(code);e.code=code;return e;}
function safeCode(e){return typeof e?.code==='string'&&/^TEYZA_MAIL_[A-Z0-9_]{1,60}$/.test(e.code)?e.code:'TEYZA_MAIL_PREPARATION_FAILED';}
function emailAddress(s){return typeof s==='string'&&s.length<=254&&/^[^\s<>,;:"()\\]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(s);}
function uidValid(s){return typeof s==='string'&&s.length>0&&s.length<=128&&!s.includes('/');}
function eligible(p,uid,startAt){
 return !!p&&p.uid===uid&&['pending','approved'].includes(p.status)&&typeof p.evidenceId==='string'&&p.evidenceId.length>0&&
  Number.isSafeInteger(p.createdAt)&&p.createdAt>=startAt;
}
function control(value){
 if(value?.enabled!==true||!Number.isSafeInteger(value.startAt)||value.startAt<=0)return null;
 return {startAt:value.startAt,maxPerRun:Number.isInteger(value.maxPerRun)?Math.max(1,Math.min(5,value.maxPerRun)):5};
}
function escape(s){return String(s??'').slice(0,150).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function welcomeHtml(p,{test=false}={}){
 const name=escape(String(p.name||'').trim())||'Teyza Field Agent Applicant';
 const area=escape(p.area||'your local area');
 return '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#173f39;line-height:1.55">'+
 '<div style="max-width:640px;margin:auto"><div style="background:#003f4a;color:white;padding:24px;border-radius:12px"><b style="font-size:26px;letter-spacing:1px">TEYZA</b><h1 style="font-size:24px">Welcome to Teyza Work</h1><p>Field Agent Programme</p></div>'+
 (test?'<p><b>Internal mailbox and attachment test. Not an application or approval.</b></p>':'')+
 '<p>Dear '+name+',</p><p>Thank you for applying to join the Teyza Field Agent Programme. You can help local businesses in '+area+' connect with their communities.</p>'+
 '<h2>Explore your potential rewards</h2><p><strong>R90 per qualifying verified new business registration.</strong></p>'+
 '<table style="border-collapse:collapse;width:100%">'+[10,20,50,100].map(n=>'<tr><td style="padding:9px;border-bottom:1px solid #d4e6dd">'+n+' verified businesses</td><td style="padding:9px;border-bottom:1px solid #d4e6dd;text-align:right"><b>R'+String(n*90).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'</b></td></tr>').join('')+'</table>'+
 '<p>Illustrative gross rewards before expenses and taxes. Earnings are not guaranteed.</p><h2>Get ready in five steps</h2>'+
 '<ol><li>Read the attached Field Agent Training Manual.</li><li>Check your application at <a href="https://teyza.co.za/work.html">Teyza Work</a>.</li>'+
 '<li>Download Teyza from <a href="https://play.google.com/store/apps/details?id=com.asiyedriver.asiye">Google Play</a> or the <a href="https://apps.apple.com/za/app/id6827037733">App Store</a>.</li>'+
 '<li>Sign in using the same account and sign-in method used when applying.</li><li>Wait for approval and agreement of your working area, engagement, reward and expense terms. Then choose Field Agent in the app and follow the manual.</li></ol>'+
 '<p>Until approved, learn about Teyza and identify local businesses; do not start field work. Each reward requires an eligible new seller, owner confirmation, verified visit evidence, unique attribution and Admin approval. Approved rewards await payment; the app does not transfer money. Never request passwords, OTPs or banking details.</p>'+
 '<p>Questions? <a href="mailto:support@teyza.co.za">support@teyza.co.za</a> | 031 566 1165</p><p>Kind regards,<br><b>Teyza Field Agent Support Team</b><br>TEYZA SA (PTY) LTD</p>'+
 '<p style="font-size:12px;color:#52716a"><a href="https://teyza.co.za/work-privacy.html">Work privacy notice</a> | <a href="https://teyza.co.za/agents.html">Agent programme</a></p></div></body></html>';
}
function validatePdf(pdf){
 if(!Buffer.isBuffer(pdf)||pdf.length<100||pdf.length>10*1024*1024||pdf.subarray(0,5).toString()!=='%PDF-')throw problem('TEYZA_MAIL_INVALID_MANUAL');
 return pdf;
}
function settings(c){
 if(!c||!Object.hasOwn(regions,c.region)||typeof c.clientId!=='string'||!c.clientId||typeof c.clientSecret!=='string'||!c.clientSecret||
    typeof c.refreshToken!=='string'||!c.refreshToken||typeof c.accountId!=='string'||!/^\d{5,30}$/.test(c.accountId))throw problem('TEYZA_MAIL_BAD_CONFIG');
 return c;
}
async function jsonRequest(fetchImpl,url,options,code){
 let response,body;
 try{response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});body=await response.json();}
 catch{throw problem(code);}
 if(!response.ok||!body||typeof body!=='object')throw problem(code);
 return body;
}
async function tokenRequest(fetchImpl,origin,form){
 const r=await jsonRequest(fetchImpl,origin+'/oauth/v2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)},'TEYZA_MAIL_TOKEN_FAILED');
 if(typeof r.access_token!=='string'||!r.access_token||r.error)throw problem('TEYZA_MAIL_TOKEN_FAILED');
 return r;
}
function mailHeaders(token){return {Accept:'application/json',Authorization:'Zoho-oauthtoken '+token};}
function apiOK(r){return Number(r?.status?.code)===200;}
function messageId(r){const id=r?.data?.messageId;return (typeof id==='string'&&/^\d{1,40}$/.test(id))?id:Number.isSafeInteger(id)&&id>0?String(id):null;}
function createZohoSender(raw,{pdf,fetchImpl=fetch,clock=Date.now}={}){
 const c=settings(raw),[accounts,mail]=regions[c.region],manual=validatePdf(pdf),endpoint=mail+'/api/accounts/'+c.accountId+'/messages';
 let token=null,tokenUntil=0;
 async function access(){
  if(token&&tokenUntil>clock())return token;
  const r=await tokenRequest(fetchImpl,accounts,{grant_type:'refresh_token',client_id:c.clientId,client_secret:c.clientSecret,refresh_token:c.refreshToken});
  token=r.access_token;tokenUntil=clock()+Math.min(3300,Math.max(0,Number(r.expires_in||3600)-120))*1000;return token;
 }
 async function prepare(recipient,p,{test=false}={}){
  if(!emailAddress(recipient)||(test&&recipient!==SENDER))throw problem('TEYZA_MAIL_INVALID_RECIPIENT');
  const t=await access();
  const uploaded=await jsonRequest(fetchImpl,endpoint+'/attachments?fileName='+encodeURIComponent(MANUAL)+'&isInline=false',
    {method:'POST',headers:{...mailHeaders(t),'Content-Type':'application/octet-stream'},body:manual},'TEYZA_MAIL_ATTACHMENT_FAILED');
  const a=Array.isArray(uploaded.data)?uploaded.data[0]:uploaded.data;
  if(!apiOK(uploaded)||!a||!['storeName','attachmentName','attachmentPath'].every(k=>typeof a[k]==='string'&&a[k].length>0))throw problem('TEYZA_MAIL_ATTACHMENT_FAILED');
  const payload={fromAddress:SENDER,toAddress:recipient,subject:test?'[TEST] '+SUBJECT:SUBJECT,content:welcomeHtml(p,{test}),mailFormat:'html',encoding:'UTF-8',
    attachments:[{storeName:a.storeName,attachmentName:a.attachmentName,attachmentPath:a.attachmentPath}]};
  // No send request is made until the worker durably marks this attempt as sending.
  return {async send(){
    const response=await jsonRequest(fetchImpl,endpoint,{method:'POST',headers:{...mailHeaders(t),'Content-Type':'application/json'},body:JSON.stringify(payload)},'TEYZA_MAIL_SEND_UNCERTAIN');
    const id=messageId(response);
    if(!apiOK(response)||!id)throw problem('TEYZA_MAIL_SEND_UNCERTAIN');
    return {messageId:id};
  }};
 }
 return {prepare};
}
// One-time local operator setup: use the correct Zoho data centre and mailbox.
// Return only configuration; callers must capture it directly into Secret Manager.
async function configureZoho({region,clientId,clientSecret,code,pdf,fetchImpl=fetch}){
 if(!Object.hasOwn(regions,region)||![clientId,clientSecret,code].every(s=>typeof s==='string'&&s.length>0))throw problem('TEYZA_MAIL_BAD_CONFIG');
 const [accounts,mail]=regions[region];
 const r=await tokenRequest(fetchImpl,accounts,{grant_type:'authorization_code',client_id:clientId,client_secret:clientSecret,code});
 if(typeof r.refresh_token!=='string'||!r.refresh_token)throw problem('TEYZA_MAIL_REFRESH_TOKEN_MISSING');
 const list=await jsonRequest(fetchImpl,mail+'/api/accounts',{headers:mailHeaders(r.access_token)},'TEYZA_MAIL_ACCOUNTS_FAILED');
 const matches=Array.isArray(list.data)?list.data.filter(a=>typeof a.accountId==='string'&&/^\d{5,30}$/.test(a.accountId)&&
   a.enabled!==false&&a.outgoingBlocked!==true&&(a.primaryEmailAddress===SENDER||a.mailboxAddress===SENDER||
   (Array.isArray(a.emailAddress)&&a.emailAddress.some(e=>e.mailId===SENDER&&e.isConfirmed===true)))):[];
 if(!apiOK(list)||matches.length!==1)throw problem('TEYZA_MAIL_SENDER_NOT_FOUND');
 const c={region,clientId,clientSecret,refreshToken:r.refresh_token,accountId:matches[0].accountId};
 const sender=createZohoSender(c,{pdf,fetchImpl});
 const prepared=await sender.prepare(SENDER,{name:'Teyza Support',area:'internal training'},{test:true});
 await prepared.send();
 return c;
}
function createWorker({db,getAuthUser,getSender,clock=Date.now,logger=console}){
 const doc=path=>db.doc(path),read=async path=>{const s=await doc(path).get();return s.exists?s.data():null;};
 const terminal=(status,reason,extra={})=>({status,reason,nextAttemptAt:FOREVER,updatedAt:clock(),...extra});
 async function enqueue(uid,startAt){
  if(!uidValid(uid))return false;
  return db.runTransaction(async tx=>{
   const pRef=doc('teyzaFieldAgents/'+uid),jRef=doc(JOBS+'/'+uid);
   const [p,j]=await Promise.all([tx.get(pRef),tx.get(jRef)]);
   if(j.exists||!p.exists||!eligible(p.data(),uid,startAt))return false;
   tx.set(jRef,{uid,status:'queued',reason:'',attempts:0,nextAttemptAt:clock(),createdAt:clock(),updatedAt:clock(),applicationCreatedAt:p.data().createdAt});
   return true;
  });
 }
 async function claim(uid){
  const ref=doc(JOBS+'/'+uid);
  return db.runTransaction(async tx=>{
   const [s,ctl]=await Promise.all([tx.get(ref),tx.get(doc(CONTROL))]);
   const cfg=control(ctl.exists?ctl.data():null),j=s.exists?s.data():null,now=clock();
   if(!cfg||!j||j.uid!==uid||!Number.isSafeInteger(j.nextAttemptAt)||j.nextAttemptAt>now)return null;
   if(j.status==='sending'){tx.update(ref,terminal('review_required','TEYZA_MAIL_SEND_UNCERTAIN'));return null;}
   if(!['queued','retry','blocked_email','preparing'].includes(j.status))return null;
   if(!Number.isSafeInteger(j.applicationCreatedAt)||j.applicationCreatedAt<cfg.startAt){tx.update(ref,terminal('cancelled','outside_rollout_window'));return null;}
   const attempt=crypto.randomUUID(),attempts=(Number.isInteger(j.attempts)?j.attempts:0)+1;
   tx.update(ref,{status:'preparing',attempt,attempts,nextAttemptAt:now+LEASE,updatedAt:now,reason:''});
   return {attempt,attempts,startAt:cfg.startAt};
  });
 }
 async function finish(uid,attempt,changes){
  const ref=doc(JOBS+'/'+uid);
  return db.runTransaction(async tx=>{
   const s=await tx.get(ref);
   if(!s.exists||s.data().attempt!==attempt||!['preparing','sending'].includes(s.data().status))return false;
   tx.update(ref,{...changes,updatedAt:clock()});return true;
  });
 }
 async function markSending(uid,attempt){
  const ref=doc(JOBS+'/'+uid);
  return db.runTransaction(async tx=>{
   const [s,ctl,p]=await Promise.all([tx.get(ref),tx.get(doc(CONTROL)),tx.get(doc('teyzaFieldAgents/'+uid))]);
   if(!s.exists||s.data().attempt!==attempt||s.data().status!=='preparing')return false;
   const cfg=control(ctl.exists?ctl.data():null);
   if(!cfg){tx.update(ref,{status:'queued',reason:'paused',nextAttemptAt:clock()+60000,updatedAt:clock()});return false;}
   if(!p.exists||!eligible(p.data(),uid,cfg.startAt)){tx.update(ref,terminal('cancelled','application_not_eligible'));return false;}
   tx.update(ref,{status:'sending',nextAttemptAt:clock()+LEASE,updatedAt:clock()});return true;
  });
 }
 async function processOne(uid){
  if(!uidValid(uid))return;
  const job=await claim(uid);if(!job)return;
  const {attempt,attempts,startAt}=job;
  let sending=false;
  try{
   const p=await read('teyzaFieldAgents/'+uid);
   if(!eligible(p,uid,startAt)){await finish(uid,attempt,terminal('cancelled','application_not_eligible'));return;}
   let auth;
   try{auth=await getAuthUser(uid);}catch(e){if(e?.code==='auth/user-not-found'){await finish(uid,attempt,terminal('cancelled','account_removed'));return;}throw e;}
   if(!auth||auth.uid!==uid||auth.disabled){await finish(uid,attempt,terminal('cancelled','account_unavailable'));return;}
   if(auth.emailVerified!==true||!emailAddress(auth.email)){
    await finish(uid,attempt,{status:'blocked_email',reason:'verified_email_required',nextAttemptAt:clock()+12*60*60*1000,attempts:0});return;
   }
   const prepared=await getSender().prepare(auth.email,p);
   // Recheck the current verified address before the irreversible operation.
   const fresh=await getAuthUser(uid);
   if(!fresh||fresh.uid!==uid||fresh.disabled||fresh.emailVerified!==true||fresh.email!==auth.email){
    await finish(uid,attempt,{status:'blocked_email',reason:'verified_email_changed',nextAttemptAt:clock()+12*60*60*1000,attempts:0});return;
   }
   if(!await markSending(uid,attempt))return;
   sending=true;
   const result=await prepared.send();
   if(!result||typeof result.messageId!=='string'||!result.messageId)throw problem('TEYZA_MAIL_SEND_UNCERTAIN');
   await finish(uid,attempt,terminal('sent','provider_accepted',{sentAt:clock(),providerMessageId:result.messageId}));
  }catch(e){
   const code=sending?'TEYZA_MAIL_SEND_UNCERTAIN':safeCode(e);
   // Never retry automatically once the irreversible send may have reached Zoho.
   // Operator reconciles Sent Mail first; delivery to an inbox is not guaranteed.
   if(sending||attempts>=5)await finish(uid,attempt,terminal('review_required',code));
   else await finish(uid,attempt,{status:'retry',reason:code,nextAttemptAt:clock()+Math.min(3600000,60000*2**attempts)});
   logger.warn('Teyza welcome mail needs attention: '+code);
  }
 }
 async function scan(cfg){
  const now=clock(),previous=await read(SCAN);
  const valid=previous?.startAt===cfg.startAt&&Number.isSafeInteger(previous.resetAt)&&now-previous.resetAt<DAY;
  let q=db.collection('teyzaFieldAgents').where('createdAt','>=',cfg.startAt).orderBy('createdAt').orderBy('__name__');
  if(valid&&Number.isSafeInteger(previous.createdAt)&&uidValid(previous.uid))q=q.startAfter(previous.createdAt,previous.uid);
  const batch=await q.limit(40).get();
  for(const p of batch.docs)await enqueue(p.id,cfg.startAt);
  const last=batch.docs.at(-1);
  if(last)await doc(SCAN).set({startAt:cfg.startAt,resetAt:valid?previous.resetAt:now,createdAt:last.data().createdAt,uid:last.id});
  else if(!valid)await doc(SCAN).set({startAt:cfg.startAt,resetAt:now});
 }
 async function run(){
  const cfg=control(await read(CONTROL));if(!cfg)return {enabled:false};
  await scan(cfg);
  const due=await db.collection(JOBS).where('nextAttemptAt','<=',clock()).orderBy('nextAttemptAt').limit(cfg.maxPerRun).get();
  for(const j of due.docs)await processOne(j.id);
  return {enabled:true,processed:due.docs.length};
 }
 return {enqueue,processOne,run,markSending};
}
module.exports={SENDER,MANUAL,SUBJECT,CONTROL,JOBS,regions,eligible,control,emailAddress,welcomeHtml,validatePdf,createZohoSender,configureZoho,createWorker};
