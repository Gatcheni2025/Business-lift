'use strict';
const D=require('./domain');
const {eligible,control,CONTROL,JOBS}=require('./agent-welcome-mail');
const statusLabels=new Set(['queued','preparing','retry','blocked_email','sending','sent','cancelled','review_required']);
function settingView(raw){
 const c=control(raw);
 const valid=Number.isSafeInteger(raw?.startAt)&&raw.startAt>0&&typeof raw.enabled==='boolean';
 return {state:!valid?'configuration_required':c?'enabled':'paused',startAt:valid?raw.startAt:null,
  maxPerRun:c?.maxPerRun??null};
}
function readStatus(profile,uid,record,settings){
 if(record){
  const state=statusLabels.has(record.status)?record.status:'review_required';
  const reason=typeof record.reason==='string'&&/^(TEYZA_MAIL_[A-Z0-9_]{1,90}|provider_accepted|verified_email_required|verified_email_changed|application_not_eligible|account_removed|account_unavailable|outside_rollout_window|paused)$/.test(record.reason)?record.reason:'';
  return {state,reason,attempts:Number.isSafeInteger(record.attempts)?record.attempts:0,
   updatedAt:Number.isSafeInteger(record.updatedAt)?record.updatedAt:null,sentAt:state==='sent'&&Number.isSafeInteger(record.sentAt)?record.sentAt:null};
 }
 let state='not_queued';
 if(!['pending','approved'].includes(profile.status))state='not_eligible';
 else if(typeof profile.evidenceId!=='string'||!profile.evidenceId||profile.uid!==uid||!Number.isSafeInteger(profile.createdAt))state='not_eligible';
 else if(settings.state==='configuration_required')state='configuration_required';
 else if(profile.createdAt<settings.startAt)state='before_cutoff';
 else if(settings.state==='paused')state='automation_paused';
 return {state,reason:'',attempts:0,updatedAt:null,sentAt:null};
}
function createAgentCommunications({db,clock=Date.now,audit}){
 const doc=p=>db.doc(p);
 async function list(data){
  let q=db.collection('teyzaFieldAgents').orderBy('__name__').limit(31);
  if(data.after)q=q.startAfter(D.id(data.after));
  const [result,ctl]=await Promise.all([q.get(),doc(CONTROL).get()]);
  const settings=settingView(ctl.exists?ctl.data():null);
  const rows=await Promise.all(result.docs.slice(0,30).map(async s=>{
   const p=s.data(),snap=await doc(JOBS+'/'+s.id).get(),record=snap.exists?snap.data():null;
   const mail=readStatus(p,s.id,record,settings);
   return {uid:s.id,name:String(p.name||'').slice(0,120),area:String(p.area||'').slice(0,120),
    province:String(p.province||'').slice(0,60),applicationStatus:String(p.status||'').slice(0,40),
    ...mail,canRecheck:mail.state==='blocked_email'&&settings.state==='enabled'&&eligible(p,s.id,settings.startAt)};
  }));
  const counts=Object.create(null);
  for(const r of rows)counts[r.state]=(counts[r.state]||0)+1;
  return {schema:1,settings,rows,counts,next:result.docs.length>30?result.docs[29].id:null};
 }
 async function recheck(actor,data){
  const uid=D.id(data.agentUid);
  if(uid===actor)D.fail(403,'Another administrator must manage your own application.');
  if(data.confirmed!==true)D.fail(422,'Confirm that the applicant has been asked to verify their own email.');
  const expected=data.updatedAt;
  if(!Number.isSafeInteger(expected))D.fail(409,'Refresh communications first.');
  return db.runTransaction(async tx=>{
   const ref=doc(JOBS+'/'+uid);
   const [j,p,c]=await Promise.all([tx.get(ref),tx.get(doc('teyzaFieldAgents/'+uid)),tx.get(doc(CONTROL))]);
   const cfg=control(c.exists?c.data():null);
   if(!cfg||!p.exists||!eligible(p.data(),uid,cfg.startAt))D.fail(409,'Applicant or automation is not eligible for a recheck.');
   if(!j.exists||j.data().uid!==uid||j.data().status!=='blocked_email'||j.data().updatedAt!==expected)D.fail(409,'Email status changed or cannot be safely rechecked. Refresh first.');
   tx.update(ref,{nextAttemptAt:clock(),updatedAt:clock()});
   audit(tx,actor,'agent_admin_communications_recheck',uid,{reason:'verified_email_recheck'});
   return {scheduled:true};
  });
 }
 return {list,recheck};
}
module.exports={createAgentCommunications,settingView,readStatus};
