'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createWhatsAppLoginPilot}=require('./whatsapp-login-otp-pilot');
const UID='B3bfibm62LeGZY530WRb8ciS3o83',PHONE='+27713515133';
class FakeDb{
 constructor(){
  this.rows=new Map([
   ['teyzaSellerAccounts/'+UID,{uid:UID,phone:PHONE,approvalStatus:'approved',identityVerified:true,
     phoneVerified:true,setupComplete:true}],
   ['teyzaWhatsAppPreferences/'+UID,{ownerUid:UID,phone:PHONE,loginOtpOptIn:true,
     loginOtpConsentVersion:'whatsapp-login-otp-v1'}]
  ]);this.queue=Promise.resolve();
 }
 snap(path){
  const v=this.rows.get(path);return {exists:v!==undefined,id:path.split('/').at(-1),
   data:()=>v===undefined?undefined:structuredClone(v),ref:this.doc(path)};
 }
 doc(path){const self=this;return {id:path.split('/').at(-1),path,
  get:async()=>self.snap(path),update:async data=>self.rows.set(path,{...self.rows.get(path),...data})};}
 collection(coll){const db=this;return {where(key,op,value){
  assert.equal(op,'==');return {limit(max){return {async get(){
   const docs=[...db.rows.keys()].filter(p=>p.startsWith(coll+'/')&&
     p.slice(coll.length+1).indexOf('/')<0&&db.rows.get(p)?.[key]===value)
     .slice(0,max).map(p=>db.snap(p));
   return {docs};}};}};}};}
 async runTransaction(callback){
  const work=async()=>{
   const changes=[],tx={
    get:async ref=>this.snap(ref.path),
    set:(ref,value)=>changes.push(()=>this.rows.set(ref.path,structuredClone(value))),
    create:(ref,value)=>changes.push(()=>{
     if(this.rows.has(ref.path))throw Error('doc already exists');
     this.rows.set(ref.path,structuredClone(value));
    }),
    update:(ref,value)=>changes.push(()=>this.rows.set(ref.path,
     {...this.rows.get(ref.path),...structuredClone(value)}))
   };
   const result=await callback(tx);for(const change of changes)change();return result;
  };
  const run=this.queue.then(work);
  this.queue=run.then(()=>{},()=>{});
  return run;
 }
}
function fixture(options={}){
 let ms=options.now??1000000,deliver=[],issued=[],disabled=false,nextId=0;
 const db=new FakeDb(),auth={
  getUser:async uid=>{if(uid!==UID)throw Error('User missing');return {uid,disabled};},
  createCustomToken:async uid=>{issued.push(uid);return 'firebase-token-'+uid;}
 };
 const make=()=>createWhatsAppLoginPilot({
  db,auth,enabled:()=>options.enabled!==false,pilotSellerUid:()=>options.pilot??UID,
  serverSecret:'test-only-secret-not-used-in-production-000000000000',
  now:()=>ms,randomCode:()=>'123456',randomId:()=>options.uniqueIds?String(++nextId).padStart(48,'a'):'a'.repeat(48),
  sendAuthenticationTemplate:async request=>{
   deliver.push({...request});if(options.deliveryFails)throw Error('Provider outcome unknown');
   return {accepted:true};
  }
 });
 return {db,auth,make,deliver,issued,advance:x=>ms+=x,setDisabled:x=>disabled=x};
}
const start=(f,phone=PHONE,ip='192.0.2.11')=>f.make().begin({phone,ip});
const verify=(f,challengeId,code='123456')=>f.make().verify({challengeId,code});
const reject=async promise=>assert.rejects(promise,/WhatsApp login is not available or the verification could not be completed/);

test('pilot defaults OFF even when dependencies are provided',async()=>{
 const f=fixture({enabled:false});await reject(start(f));assert.equal(f.deliver.length,0);
});
test('an opted-in approved seller receives a 5-minute challenge and the SAME UID token',async()=>{
 const f=fixture(),challenge=await start(f);
 assert.equal(challenge.challengeId,'a'.repeat(48));assert.equal(challenge.expiresInSeconds,300);
 assert.equal(f.deliver.length,1);assert.equal(f.deliver[0].template,'teyza_auth_otp');
 assert.equal(f.deliver[0].otp,'123456');
 const stored=f.db.rows.get('teyzaWhatsAppLoginChallenges/'+challenge.challengeId);
 assert(!JSON.stringify(stored).includes(PHONE),'Challenge must never store raw phone');
 assert(!JSON.stringify(stored).includes('123456'),'Challenge must never store OTP');
 const verified=await verify(f,challenge.challengeId);
 assert.equal(verified.uid,UID);assert.equal(verified.customToken,'firebase-token-'+UID);
 assert.deepEqual(f.issued,[UID]);assert.equal(stored.state,'sent','Copy must be immutable after OTP verification');
 assert.equal(f.db.rows.get('teyzaWhatsAppLoginChallenges/'+challenge.challengeId).state,'used');
});
test('a used OTP cannot be replayed or mint a second token',async()=>{
 const f=fixture(),{challengeId}=await start(f);await verify(f,challengeId);
 await reject(verify(f,challengeId));assert.deepEqual(f.issued,[UID]);
});
test('five wrong OTP attempts block the challenge, including subsequent valid OTP',async()=>{
 const f=fixture(),{challengeId}=await start(f);
 for(let i=0;i<5;i++)await reject(verify(f,challengeId,'000000'));
 await reject(verify(f,challengeId));
 assert.equal(f.db.rows.get('teyzaWhatsAppLoginChallenges/'+challengeId).state,'blocked');
 assert.equal(f.issued.length,0);
});
test('a challenge cannot outlive five minutes',async()=>{
 const f=fixture(),{challengeId}=await start(f);
 f.advance(300000);await reject(verify(f,challengeId));assert.equal(f.issued.length,0);
});
test('pilot UID mismatch and unapproved or non-consenting accounts fail closed',async()=>{
 for(const change of [
  db=>db.rows.get('teyzaSellerAccounts/'+UID).approvalStatus='pending',
  db=>db.rows.get('teyzaSellerAccounts/'+UID).identityVerified=false,
  db=>db.rows.get('teyzaSellerAccounts/'+UID).phoneVerified=false,
  db=>db.rows.get('teyzaWhatsAppPreferences/'+UID).loginOtpOptIn=false,
  db=>db.rows.get('teyzaWhatsAppPreferences/'+UID).loginOtpConsentVersion='seller-approval-v2'
 ]){
  const f=fixture();change(f.db);await reject(start(f));assert.equal(f.deliver.length,0);
 }
 const outside=fixture({pilot:'anotherSellerUid'});await reject(start(outside));
});
test('invalid phones, no trusted IP and unknown seller do not create challenges',async()=>{
 const f=fixture();
 for(const phone of ['0713515133','abc','+0000000000'])await reject(start(f,phone));
 await reject(f.make().begin({phone:PHONE,ip:''}));
 await reject(start(f,'+27712340000'));
 assert.equal(f.deliver.length,0);
});
test('delivery failure does not retry automatically and cannot be verified',async()=>{
 const f=fixture({deliveryFails:true});await reject(start(f));
 assert.equal(f.deliver.length,1);
 const record=f.db.rows.get('teyzaWhatsAppLoginChallenges/'+'a'.repeat(48));
 assert.equal(record.state,'failed');await reject(verify(f,'a'.repeat(48)));
});
test('a disabled Firebase Auth user cannot obtain a token',async()=>{
 const f=fixture();f.setDisabled(true);await reject(start(f));assert.equal(f.issued.length,0);
});
test('revoke account approval or change registered phone after sending OTP',async()=>{
 const f=fixture(),{challengeId}=await start(f);
 f.db.rows.get('teyzaSellerAccounts/'+UID).phone='+27719999999';
 await reject(verify(f,challengeId));assert.equal(f.issued.length,0);
});
test('seller phone or IP rate limits prevent continued challenge guessing',async()=>{
 const f=fixture({uniqueIds:true});const engine=f.make();
 // Distinct transaction ids are supplied per attempt.
 await engine.begin({phone:PHONE,ip:'198.51.100.42'});
 for(let i=0;i<3;i++){
  try{await engine.begin({phone:PHONE,ip:'198.51.100.42'});}catch(e){
   assert.match(e.message,/verification could not be completed/);
  }
 }
 const limits=[...f.db.rows].filter(([path])=>path.startsWith('teyzaWhatsAppLoginLimits/'));
 assert.equal(limits.length,2);
 assert.equal(limits[0][1].count,3);
});
test('parallel verification can consume a challenge only once',async()=>{
 const f=fixture(),{challengeId}=await start(f);
 const responses=await Promise.allSettled([verify(f,challengeId),verify(f,challengeId)]);
 assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(f.issued.length,1);
});
