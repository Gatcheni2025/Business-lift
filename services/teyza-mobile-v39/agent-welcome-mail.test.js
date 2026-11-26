'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SENDER,CONTROL,JOBS,eligible,control,emailAddress,welcomeHtml,createZohoSender,configureZoho,createWorker}=require('./agent-welcome-mail');
const PDF=Buffer.from('%PDF-1.7\n'+ 'x'.repeat(150));
const NOW=1795701600000;
const p={uid:'agent1',name:'A <script>',area:'Durban & surroundings',status:'pending',evidenceId:'evidence',createdAt:NOW};
const config={region:'us',clientId:'client',clientSecret:'private',refreshToken:'refresh',accountId:'123456789'};
function fakeDB(seed={}){
 const rows=new Map(Object.entries(seed));let chain=Promise.resolve();
 const doc=path=>({path,get:async()=>snap(path),set:async v=>rows.set(path,{...v}),update:async v=>rows.set(path,{...rows.get(path),...v})});
 const snap=path=>({exists:rows.has(path),id:path.split('/').at(-1),data:()=>rows.has(path)?{...rows.get(path)}:undefined});
 return {rows,doc,runTransaction(fn){const result=chain.then(async()=>fn({get:async ref=>snap(ref.path),set:(ref,v)=>rows.set(ref.path,{...v}),update:(ref,v)=>rows.set(ref.path,{...rows.get(ref.path),...v})}));chain=result.catch(()=>{});return result;}};
}
function harness({auth,prepare,enabled=true}={}){
 let now=NOW,sendCalls=0,prepareCalls=0;
 const db=fakeDB({[CONTROL]:{enabled,startAt:NOW-1000},'teyzaFieldAgents/agent1':p});
 const getAuthUser=auth||(()=>({uid:'agent1',emailVerified:true,email:'agent@example.com'}));
 const worker=createWorker({db,getAuthUser,clock:()=>now,logger:{warn(){}},getSender:()=>({
  prepare:async (...args)=>{prepareCalls++;return prepare?prepare(...args):{send:async()=>{sendCalls++;return {messageId:'1234'};}};}
 })});
 return {db,worker,advance:n=>now+=n,job:()=>db.rows.get(JOBS+'/agent1'),sent:()=>sendCalls,prepared:()=>prepareCalls};
}
function response(body,ok=true){return {ok,json:async()=>body};}
test('only eligible applications and valid explicit rollout controls',()=>{
 assert(eligible(p,'agent1',NOW));assert(!eligible({...p,status:'rejected'},'agent1',NOW));
 assert(!eligible(p,'another',NOW));assert(!eligible(p,'agent1',NOW+1));
 assert(!eligible({...p,evidenceId:''},'agent1',NOW));
 assert.equal(control({enabled:true}),null);assert.equal(control({enabled:false,startAt:NOW}),null);
 assert.equal(control({enabled:true,startAt:NOW,maxPerRun:100}).maxPerRun,5);
});
test('welcome content is escaped, links and R90 examples are present; no approval or payment promise',()=>{
 const h=welcomeHtml(p);
 assert(h.includes('A &lt;script&gt;'));assert(!h.includes('<script>'));assert(h.includes('Durban &amp; surroundings'));
 for(const s of ['R900','R1,800','R4,500','R9,000','https://teyza.co.za/work.html','com.asiyedriver.asiye','id6827037733','Wait for approval','Earnings are not guaranteed','await payment'])assert(h.includes(s),s);
 for(const s of ['a@example.com,b@example.com','a@example.com\nBCC:x@example.com','a@','a@example.com;other@example.com'])assert(!emailAddress(s));
 assert(emailAddress('a+agent@example.co.za'));
});
test('duplicate queue requests and overlapping workers send one welcome only',async()=>{
 const h=harness();
 assert.deepEqual(await Promise.all([h.worker.enqueue('agent1',NOW),h.worker.enqueue('agent1',NOW)]),[true,false]);
 await Promise.all([h.worker.processOne('agent1'),h.worker.processOne('agent1')]);
 await h.worker.processOne('agent1');
 assert.equal(h.sent(),1);assert.equal(h.job().status,'sent');assert.equal(h.job().providerMessageId,'1234');
 assert(!JSON.stringify(h.job()).includes('agent@example.com'));
});
test('disabled automation cannot send',async()=>{
 const h=harness({enabled:false});await h.worker.enqueue('agent1',NOW);await h.worker.processOne('agent1');assert.equal(h.sent(),0);assert.equal(h.prepared(),0);
});
test('missing or unverified email is held; no send or provider preparation',async()=>{
 const h=harness({auth:()=>({uid:'agent1',email:'agent@example.com',emailVerified:false})});
 await h.worker.enqueue('agent1',NOW);await h.worker.processOne('agent1');assert.equal(h.job().status,'blocked_email');assert.equal(h.prepared(),0);
});
test('verified email is rechecked and changed address does not receive mail',async()=>{
 let calls=0;
 const h=harness({auth:()=>({uid:'agent1',email:++calls===1?'a@example.com':'b@example.com',emailVerified:true})});
 await h.worker.enqueue('agent1',NOW);await h.worker.processOne('agent1');assert.equal(h.job().status,'blocked_email');assert.equal(h.sent(),0);
});
test('pre-send failures are retryable but ambiguous send failure needs review and never repeats',async()=>{
 let attempt=0,actualSends=0;
 const h=harness({prepare:async()=>{if(++attempt===1)throw Error('pre-send network');return {send:async()=>{actualSends++;throw Error('unknown after send');}};}});
 await h.worker.enqueue('agent1',NOW);await h.worker.processOne('agent1');assert.equal(h.job().status,'retry');
 h.advance(180000);await h.worker.processOne('agent1');assert.equal(h.job().status,'review_required');
 h.advance(86400000);await h.worker.processOne('agent1');assert.equal(actualSends,1);
});
test('expired sending lease is held for reconciliation rather than sending again',async()=>{
 const h=harness();await h.worker.enqueue('agent1',NOW);
 await h.db.doc(JOBS+'/agent1').update({status:'sending',attempt:'old',nextAttemptAt:NOW-1});
 await h.worker.processOne('agent1');assert.equal(h.job().status,'review_required');assert.equal(h.prepared(),0);
});
test('rejected or deleted application cancels queued email',async()=>{
 const h=harness();await h.worker.enqueue('agent1',NOW);await h.db.doc('teyzaFieldAgents/agent1').update({status:'rejected'});
 await h.worker.processOne('agent1');assert.equal(h.job().status,'cancelled');assert.equal(h.prepared(),0);
});
test('Zoho prepares real PDF before send, uses only single recipient and documented attachment fields',async()=>{
 const calls=[],mock=async(url,o)=>{calls.push({url,o});if(url.includes('/oauth/'))return response({access_token:'token',expires_in:3600});
  if(url.includes('/attachments'))return response({status:{code:200},data:{storeName:'s',attachmentName:'manual.pdf',attachmentPath:'/Mail/manual.pdf'}});
  return response({status:{code:200},data:{messageId:'1726208416259127700'}});
 };
 const sender=createZohoSender(config,{pdf:PDF,fetchImpl:mock});
 const prepared=await sender.prepare('agent@example.com',p);
 assert.equal(calls.length,2);assert.equal(calls[1].o.body,PDF);
 const result=await prepared.send();assert.equal(result.messageId,'1726208416259127700');
 assert.equal(calls.length,3);assert.equal(calls[2].url,'https://mail.zoho.com/api/accounts/123456789/messages');
 const payload=JSON.parse(calls[2].o.body);assert.equal(payload.fromAddress,SENDER);assert.equal(payload.toAddress,'agent@example.com');
 assert.deepEqual(payload.attachments,[{storeName:'s',attachmentName:'manual.pdf',attachmentPath:'/Mail/manual.pdf'}]);
 assert.equal(payload.mailFormat,'html');assert(!payload.ccAddress&&!payload.bccAddress);
 assert.equal(calls[2].o.headers.Authorization,'Zoho-oauthtoken token');
 assert.throws(()=>createZohoSender({...config,region:'https://evil.example'},{pdf:PDF}));
 assert.throws(()=>createZohoSender(config,{pdf:Buffer.from('not pdf')}));
});
test('operator configuration verifies official sender and sends a self-addressed test only',async()=>{
 const calls=[],mock=async(url,o)=>{calls.push({url,o});
  if(url.includes('/oauth/'))return response({access_token:'token',refresh_token:'refresh',expires_in:3600});
  if(url.endsWith('/api/accounts'))return response({status:{code:200},data:[{accountId:'123456789',primaryEmailAddress:SENDER,enabled:true}]});
  if(url.includes('/attachments'))return response({status:{code:200},data:{storeName:'s',attachmentName:'manual.pdf',attachmentPath:'/Mail/manual.pdf'}});
  return response({status:{code:200},data:{messageId:'1000001'}});
 };
 const c=await configureZoho({region:'us',clientId:'client',clientSecret:'private',code:'grant',pdf:PDF,fetchImpl:mock});
 assert.equal(c.accountId,'123456789');const payload=JSON.parse(calls.at(-1).o.body);
 assert.equal(payload.toAddress,SENDER);assert(payload.subject.startsWith('[TEST]'));
});
