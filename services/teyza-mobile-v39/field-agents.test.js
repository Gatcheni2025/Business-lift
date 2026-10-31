'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createFieldAgents,gps,distance,purgeAgentEvidence}=require('./field-agents'),cipher=require('./selfie-crypto');
class FakeDB {
  constructor(seed={}){this.records=new Map(Object.entries(structuredClone(seed)));this.serial=0;}
  doc(path){const db=this;return {path,id:path.split('/').pop(),get:async()=>db.snapshot(path),
    set:async(value,options)=>db.records.set(path,options?.merge?{...db.records.get(path),...structuredClone(value)}:structuredClone(value)),
    update:async value=>{assert(db.records.has(path));db.records.set(path,{...db.records.get(path),...structuredClone(value)});},
    delete:async()=>db.records.delete(path),collection:name=>db.collection(path+'/'+name)};}
  snapshot(path){const data=this.records.get(path);return {exists:data!==undefined,id:path.split('/').pop(),data:()=>structuredClone(data),ref:this.doc(path)};}
  collection(path){const db=this,filters=[];let sort=null,max=Infinity,after=null;const query={
    doc:(value)=>db.doc(path+'/'+(value||'generated'+(++db.serial))),
    where:(...filter)=>{filters.push(filter);return query;},orderBy:(...args)=>{sort=args;return query;},
    startAfter:value=>{after=value;return query;},limit:value=>{max=value;return query;},get:async()=>{
      let rows=[...db.records].filter(([key,value])=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')===-1&&
        filters.every(([field,op,wanted])=>op==='=='?value[field]===wanted:op==='array-contains'?value[field]?.includes(wanted):op==='>='?value[field]>=wanted:value[field]<=wanted));
      if(after)rows=rows.filter(([key])=>key.split('/').pop()>after);
      if(sort)rows.sort((a,b)=>(sort[1]==='desc'?-1:1)*(sort[0]==='__name__'?a[0].localeCompare(b[0]):((a[1][sort[0]]||0)-(b[1][sort[0]]||0))));
      const docs=rows.slice(0,max).map(([key])=>db.snapshot(key));return {docs,size:docs.length};
    }};return query;}
  transaction(){const writes=[],db=this;let wrote=false;return {get:async ref=>{assert(!wrote,'Transaction must read before writing');return ref.get();},
    set:(ref,value,options)=>{wrote=true;writes.push(()=>ref.set(value,options));},update:(ref,value)=>{wrote=true;writes.push(()=>ref.update(value));},
    commit:async()=>{for(const write of writes)await write();}};}
  async runTransaction(fn){const tx=this.transaction(),result=await fn(tx);await tx.commit();return result;}
  batch(){return this.transaction();}
}

const start=Date.parse('2026-10-29T09:00:00Z'),secret=crypto.randomBytes(32).toString('base64');
const agent={uid:'agent1',email_verified:true},owner={uid:'seller1',email_verified:true},admin={uid:'admin',teyzaAdmin:true,email_verified:true,auth_time:start/1000};
const rejects=(p,status)=>assert.rejects(p,e=>e.status===status);
function setup(options={}){let now=start;const db=new FakeDB({'teyzaFieldAgents/agent1':{uid:'agent1',name:'Field Agent',status:'approved',revision:0},'teyzaSellerAccounts/seller1':{uid:'seller1',category:'spaza',shopName:'Corner Shop',approvalStatus:'pending'}}),files=new Map();const bucket={file:p=>({save:async b=>files.set(p,b),download:async()=>{assert(files.has(p));return [files.get(p)];},delete:async()=>files.delete(p)})};const svc=createFieldAgents({db,bucket,clock:()=>now,rate:async()=>{},sanitizeImage:async b=>b,encryptSelfie:async b=>cipher.encrypt(b,secret),decryptSelfie:async b=>cipher.decrypt(b,secret),...options});return {db,files,bucket,tick:ms=>now+=ms,call:(action,data={},actor=agent)=>svc.execute(actor,action,data)};}
async function visit(f,id='visit1'){
 await f.call('agent_visit_start',{requestId:id,shopName:'Corner Shop',address:'12 Main Road, Durban, South Africa',area:'Durban',province:'KwaZulu-Natal',ownerPermission:true});
 await f.call('agent_location',{visitId:id,revision:0,latitude:-29.85,longitude:31.02,accuracy:12,capturedAt:start});
 for(const kind of ['shop','selfie']){const c=await f.call('agent_capture_begin',{visitId:id,kind});await f.call('agent_photo_submit',{visitId:id,captureId:c.captureId,consent:true,imageBase64:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,kind==='shop'?1:2)]).toString('base64')});}
 const link=await f.call('agent_owner_link',{visitId:id});const token=link.url.split('#')[1];return {id,token};
}
async function submitted(f){const v=await visit(f);await f.call('agent_owner_confirm',{token:v.token,consent:true},owner);f.db.records.set('teyzaSellerMandates/seller1',{ownerUid:'seller1',status:'signed_pending_activation'});await f.call('agent_visit_submit',{visitId:v.id,revision:4});return v;}
async function approved(f){const v=await submitted(f);for(const kind of ['shop','selfie'])await f.call('agent_admin_photo',{visitId:v.id,kind},admin);await f.call('agent_admin_visit_decide',{visitId:v.id,revision:5,status:'approved',reviewConfirmed:true},admin);return v;}
function paidInvoice(f){f.db.records.set('teyzaBilling/seller1/entries/invoice_2026-11',{kind:'subscription_invoice',debitCents:9900,paidCents:9900,createdAt:start+1000});f.db.records.set('teyzaSellerAccounts/seller1',{uid:'seller1',category:'spaza',approvalStatus:'approved'});}
test('Agent applications bind the verified caller, ignore forged approval and need a separate fresh admin',async()=>{
 const f=setup(),pdf=Buffer.concat([Buffer.from('%PDF-1.4\\n'),Buffer.alloc(120,32)]).toString('base64'),photo=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(125,32)]).toString('base64');
  const input={name:'New Agent',phone:'0712345678',province:'Gauteng',area:'Soweto',consent:true,status:'approved',uid:'someone',identityType:'sa_id',identityNumber:'9001011234088',identityFile:{name:'id.jpg',mime:'image/jpeg',base64:photo},cvFile:{name:'cv.pdf',mime:'application/pdf',base64:pdf}};
 const r=await f.call('agent_apply',input,{uid:'new',email_verified:true});assert.equal(r.profile.status,'pending');assert.equal(r.profile.uid,'new');
 await rejects(f.call('agent_visit_start',{requestId:'x'},{uid:'new',email_verified:true}),403);
 await rejects(f.call('agent_admin_profile_decide',{agentUid:'new',revision:0,status:'approved'},{...admin,uid:'new'}),403);
 await rejects(f.call('agent_admin_profile_decide',{agentUid:'new',revision:0,status:'approved'},{...admin,auth_time:start/1000-301}),401);
 await rejects(f.call('agent_admin_profile_decide',{agentUid:'new',revision:0,status:'approved'},admin),409);
  assert(!JSON.stringify(f.db.records.get('teyzaFieldAgents/new')).includes('9001011234088'),'Plaintext ID must never enter Firestore');
  const evidence=await f.call('agent_admin_application_evidence',{agentUid:'new'},admin);assert.equal(evidence.identityNumber,'9001011234088');
  await f.call('agent_admin_profile_decide',{agentUid:'new',revision:0,status:'approved'},admin);assert.equal(f.db.records.get('teyzaFieldAgents/new').status,'approved');
  await f.call('agent_admin_area_assign',{agentUid:'new',revision:1,area:'Pretoria',province:'Gauteng'},admin);
  assert.equal(f.db.records.get('teyzaFieldAgents/new').area,'Pretoria');
 await rejects(f.call('agent_apply',input,{uid:'bootstrap',email_verified:true,teyzaPhoneBootstrap:true}),403);
});
test('HR can backfill legacy applicant documents without registering another account or bypassing review',async()=>{
 const f=setup(),pdf=Buffer.concat([Buffer.from('%PDF-1.4\\n'),Buffer.alloc(150,32)]).toString('base64'),
  photo=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(128,12)]).toString('base64'),
  input={agentUid:'legacy',revision:3,identityType:'passport',identityNumber:'A12345678',
   identityFile:{name:'identity.jpg',mime:'image/jpeg',base64:photo},cvFile:{name:'cv.pdf',mime:'application/pdf',base64:pdf},applicantPermissionConfirmed:true};
 f.db.records.set('teyzaFieldAgents/legacy',{uid:'legacy',name:'Existing Agent',status:'pending',revision:3,province:'Gauteng',area:'Soweto',createdAt:start-1000});
 const applicant={uid:'legacy',email_verified:true};
 await rejects(f.call('agent_admin_application_upload',input,applicant),403);
 await rejects(f.call('agent_admin_application_upload',input,{...admin,teyzaAdmin:false}),403);
 await rejects(f.call('agent_admin_application_upload',{...input,applicantPermissionConfirmed:false},admin),422);
 await rejects(f.call('agent_admin_application_upload',{...input,revision:2},admin),409);
 await rejects(f.call('agent_admin_profile_decide',{agentUid:'legacy',revision:3,status:'approved'},admin),409);
 const r=await f.call('agent_admin_application_upload',input,admin);
 assert.equal(r.saved,true);
 const saved=f.db.records.get('teyzaFieldAgents/legacy');
 assert.equal(saved.uid,'legacy');assert.equal(saved.name,'Existing Agent');assert.equal(saved.createdAt,start-1000);
 assert.equal(saved.status,'pending');assert.equal(saved.revision,4);assert.equal(saved.documentsSource,'hr_legacy_backfill');
 assert.equal(saved.documentsUploadedBy,admin.uid);assert(!JSON.stringify(saved).includes('A12345678'));
 assert.equal(f.files.size,1);
 const raw=[...f.files.values()][0].toString('utf8');assert(!raw.includes('A12345678'));assert(!raw.includes('%PDF'));
 await rejects(f.call('agent_admin_application_upload',{...input,revision:4},admin),409);
 await rejects(f.call('agent_admin_profile_decide',{agentUid:'legacy',revision:4,status:'approved'},admin),409);
 const viewed=await f.call('agent_admin_application_evidence',{agentUid:'legacy'},admin);
 assert.equal(viewed.identityNumber,'A12345678');assert.equal(viewed.cvFile.mime,'application/pdf');
 await f.call('agent_admin_profile_decide',{agentUid:'legacy',revision:4,status:'approved'},admin);
 assert.equal(f.db.records.get('teyzaFieldAgents/legacy').status,'approved');
});
test('HR backfill preserves already-approved legacy accounts and allows expired document renewal',async()=>{
 const f=setup(),pdf=Buffer.concat([Buffer.from('%PDF-1.4\\n'),Buffer.alloc(110,32)]).toString('base64'),
  jpg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(110,25)]).toString('base64');
 const input={agentUid:'agent1',revision:0,identityType:'sa_id',identityNumber:'9001010000000',
  identityFile:{name:'id.jpg',mime:'image/jpeg',base64:jpg},cvFile:{name:'cv.pdf',mime:'application/pdf',base64:pdf},applicantPermissionConfirmed:true};
 const r=await f.call('agent_admin_application_upload',input,admin);
 assert.equal(r.saved,true);assert.equal(f.db.records.get('teyzaFieldAgents/agent1').status,'approved');
 assert.equal(f.db.records.get('teyzaFieldAgents/agent1').revision,1);
 f.tick(181*86400000);
 const newer=await f.call('agent_admin_application_upload',{...input,revision:1}, {...admin,auth_time:(start+181*86400000)/1000});
 assert.equal(newer.saved,true);
 assert.equal(f.db.records.get('teyzaFieldAgents/agent1').status,'approved');
});
test('Visit details and photos are agent bound; location needs current precise South African coordinates',async()=>{
 const f=setup();await visit(f);f.db.records.set('teyzaFieldAgents/other',{uid:'other',status:'approved'});
 await rejects(f.call('agent_visit_get',{visitId:'visit1'},{uid:'other',email_verified:true}),404);
 const rows=await f.call('agent_visits',{}, {uid:'other',email_verified:true});assert.equal(rows.visits.length,0);
 for(const patch of [{latitude:0,longitude:0},{accuracy:500},{capturedAt:start-60001}])assert.throws(()=>gps({latitude:-29.85,longitude:31.02,accuracy:12,capturedAt:start,...patch},start));
 assert.equal(distance({latitude:-29.85,longitude:31.02},{latitude:-29.85,longitude:31.02}),0);
});
test('Photos are encrypted, consented, capture-bound and cannot be replayed or exposed through visit responses',async()=>{
 const f=setup();await visit(f);const result=await f.call('agent_visit_get',{visitId:'visit1'});assert(!JSON.stringify(result).includes('objectPath'));assert(!JSON.stringify(result).includes('imageBase64'));
 const b=[...f.files.values()][0];assert.notEqual(b[0],255);assert.equal(cipher.decrypt(b,secret)[0],255);
 const c=await f.call('agent_capture_begin',{visitId:'visit1',kind:'shop'});const bytes=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,1)]).toString('base64');
 await rejects(f.call('agent_photo_submit',{visitId:'visit1',captureId:c.captureId,consent:false,imageBase64:bytes}),422);
 await rejects(f.call('agent_photo_submit',{visitId:'visit1',captureId:c.captureId,consent:true,imageBase64:bytes}),409);
 f.tick(181000);await rejects(f.call('agent_photo_submit',{visitId:'visit1',captureId:c.captureId,consent:true,imageBase64:bytes}),409);
});
test('Owner confirmation requires their own registered account, rejects self-referral and links one visit only',async()=>{
 const f=setup(),v=await visit(f);await rejects(f.call('agent_owner_confirm',{token:v.token,consent:true}),403);
 await rejects(f.call('agent_owner_confirm',{token:v.token,consent:true},{uid:'stranger',email_verified:true}),403);
 await f.call('agent_owner_confirm',{token:v.token,consent:true},owner);assert.equal(f.db.records.get('teyzaAgentVisits/visit1').sellerUid,'seller1');assert.equal((await f.call('agent_visit_get',{visitId:'visit1'})).visit.progress.registeredShop.name,'Corner Shop');
 assert.equal(f.db.records.get('teyzaSellerAccounts/seller1').approvalStatus,'pending');
 assert((await f.call('agent_owner_confirm',{token:v.token,consent:true},owner)).confirmed);
 const second='v2';await f.call('agent_visit_start',{requestId:second,shopName:'Another',address:'13 Main Road Durban',area:'Durban',province:'KwaZulu-Natal',ownerPermission:true});const l=await f.call('agent_owner_link',{visitId:second});await rejects(f.call('agent_owner_confirm',{token:l.url.split('#')[1],consent:true},owner),409);
});
test('Rotated or expired owner links cannot claim another shop',async()=>{
 const f=setup(),v=await visit(f);const link=await f.call('agent_owner_link',{visitId:v.id});await rejects(f.call('agent_owner_confirm',{token:v.token,consent:true},owner),403);
 f.tick(8*86400000);await rejects(f.call('agent_owner_confirm',{token:link.url.split('#')[1],consent:true},owner),410);
});
test('Submission requires both photos, owner confirmation and mandate consent without charging or approving a seller',async()=>{
 const f=setup(),v=await visit(f);await rejects(f.call('agent_visit_submit',{visitId:v.id,revision:3}),409);await f.call('agent_owner_confirm',{token:v.token,consent:true},owner);
 await rejects(f.call('agent_visit_submit',{visitId:v.id,revision:4}),409);f.db.records.set('teyzaSellerMandates/seller1',{status:'signed_pending_activation'});
 await f.call('agent_visit_submit',{visitId:v.id,revision:4});const r=await f.call('agent_visit_get',{visitId:v.id});assert.equal(r.visit.status,'submitted');assert.equal(r.visit.progress.collectionActive,false);assert.equal(r.visit.progress.commission,'not_eligible');assert(![...f.db.records.keys()].some(k=>k.startsWith('teyzaBilling/')));
});
test('Work approval requires a separate fresh administrator to open both current private photos',async()=>{
 const f=setup(),v=await submitted(f),decision={visitId:v.id,revision:5,status:'approved',reviewConfirmed:true};await rejects(f.call('agent_admin_visit_decide',decision,admin),409);
 await f.call('agent_admin_photo',{visitId:v.id,kind:'shop'},admin);await rejects(f.call('agent_admin_visit_decide',decision,admin),409);
 await f.call('agent_admin_photo',{visitId:v.id,kind:'selfie'},admin);await rejects(f.call('agent_admin_visit_decide',decision,{...admin,uid:'agent1'}),403);
 await f.call('agent_admin_visit_decide',decision,admin);assert.equal(f.db.records.get('teyzaAgentVisits/visit1').status,'approved');assert.equal(f.db.records.get('teyzaSellerAccounts/seller1').approvalStatus,'pending');
 await rejects(f.call('agent_admin_visit_decide',decision,admin),409);
});
test('A signed mandate and approved work alone never earn commission; the first full R99 invoice must be paid',async()=>{
 const f=setup(),v=await approved(f);const payout={visitId:v.id,revision:6,reference:'EFT-001',transferVerified:true};await rejects(f.call('agent_admin_commission_paid',payout,admin),409);
 paidInvoice(f);f.db.records.get('teyzaBilling/seller1/entries/invoice_2026-11').paidCents=4000;await rejects(f.call('agent_admin_commission_paid',payout,admin),409);
 f.db.records.get('teyzaBilling/seller1/entries/invoice_2026-11').paidCents=9900;assert.equal((await f.call('agent_visit_get',{visitId:v.id})).visit.progress.commission,'eligible');
 await rejects(f.call('agent_admin_commission_paid',{...payout,transferVerified:false},admin),422);await f.call('agent_admin_commission_paid',payout,admin);
 assert.equal(f.db.records.get('teyzaAgentCommissions/seller1').amountCents,9900);assert((await f.call('agent_admin_commission_paid',payout,admin)).alreadyRecorded);
 await rejects(f.call('agent_admin_commission_paid',{...payout,reference:'different'},admin),409);
});
test('Older paid subscriptions and later renewals cannot produce a second onboarding commission',async()=>{
 const f=setup(),v=await approved(f);paidInvoice(f);f.db.records.get('teyzaBilling/seller1/entries/invoice_2026-11').createdAt=start-1000;
 f.db.records.set('teyzaBilling/seller1/entries/invoice_2026-12',{kind:'subscription_invoice',debitCents:9900,paidCents:9900,createdAt:start+5000});
 await rejects(f.call('agent_admin_commission_paid',{visitId:v.id,revision:6,reference:'EFT-001',transferVerified:true},admin),409);
 assert.equal((await f.call('agent_visit_get',{visitId:v.id})).visit.progress.commission,'existing_subscription');
});
test('Withdrawn mandates, suspended agents and reversed first invoices block unpaid commissions; paid disputes are flagged',async()=>{
 const f=setup(),v=await approved(f);paidInvoice(f);const payout={visitId:v.id,revision:6,reference:'EFT-001',transferVerified:true};
 f.db.records.get('teyzaSellerMandates/seller1').status='withdrawn';await rejects(f.call('agent_admin_commission_paid',payout,admin),409);f.db.records.get('teyzaSellerMandates/seller1').status='signed_pending_activation';
 f.db.records.get('teyzaFieldAgents/agent1').status='suspended';await rejects(f.call('agent_admin_commission_paid',payout,admin),409);f.db.records.get('teyzaFieldAgents/agent1').status='approved';
 await f.call('agent_admin_commission_paid',payout,admin);f.db.records.get('teyzaBilling/seller1/entries/invoice_2026-11').paidCents=0;
 assert.equal((await f.call('agent_visit_get',{visitId:v.id})).visit.progress.commission,'paid_needs_review');
});
test('Expired private work photos are purged without deleting another storage prefix',async()=>{
 const f=setup();await visit(f);f.tick(91*86400000);await purgeAgentEvidence({db:f.db,bucket:f.bucket,clock:()=>start+91*86400000});assert.equal(f.files.size,0);assert(![...f.db.records.keys()].some(k=>k.startsWith('teyzaAgentCaptures/')||k.startsWith('teyzaAgentClaims/')));
 await rejects(f.call('agent_admin_photo',{visitId:'visit1',kind:'shop'},{...admin,auth_time:(start+91*86400000)/1000}),410);
});

test('Nearby discovery and manual shop records require approval, distinguish matches and never expose owner contact details',async()=>{
 const google=async()=>({ok:true,json:async()=>({places:[{id:'place1',displayName:{text:'Corner Shop'},formattedAddress:'12 Main Road, Durban',location:{latitude:-29.85,longitude:31.02}},{id:'place2',displayName:{text:'New Shop'},formattedAddress:'14 Main Road, Durban',location:{latitude:-29.8505,longitude:31.02}}]})});
 const f=setup({getPlacesKey:()=> 'test',fetchImpl:google});const address='12 Main Road, Durban';
 f.db.records.set('teyzaSellerAccounts/seller1',{uid:'seller1',category:'spaza',shopName:'Corner Shop',address,phone:'private',approvalStatus:'pending'});
 f.db.records.set('teyzaShopLocations/seller1',{ownerUid:'seller1',address,latitude:-29.85,longitude:31.02,consentAt:start,source:'device'});
 const center={latitude:-29.85,longitude:31.02};
 await rejects(f.call('agent_nearby',center,{uid:'applicant',email_verified:true}),403);
 await rejects(f.call('agent_admin_nearby',center,agent),403);
 await rejects(f.call('agent_admin_nearby',center,{...admin,auth_time:start/1000-301}),401);
 const result=await f.call('agent_nearby',center);assert.equal(result.registered.length,1);assert.equal(result.google.length,2);assert.equal(result.google.find(p=>p.name==='Corner Shop').possibleTeyzaMatch,true);assert.equal(result.google.find(p=>p.name==='New Shop').possibleTeyzaMatch,false);assert(!JSON.stringify(result).includes('private'));
 const lead={name:'Unlisted spaza',address:'15 Main Road Durban',googleStatus:'not_found',...center,accuracy:10,capturedAt:start,ownerPermission:true};
 await rejects(f.call('agent_lead_add',{...lead,ownerPermission:false}),422);await rejects(f.call('agent_lead_add',{...lead,accuracy:500}),422);
 assert((await f.call('agent_lead_add',lead)).saved);assert((await f.call('agent_lead_add',lead)).alreadyExists);
 const loaded=await f.call('agent_admin_nearby',center,admin);assert.equal(loaded.leads[0].googleStatus,'not_found');assert.equal(loaded.leads[0].possibleTeyzaMatch,false);assert(!JSON.stringify(loaded).includes('createdBy'));
});
test('Approved agents can update only their own contact details without changing approval status',async()=>{
 const f=setup(),update={name:'Updated Agent',phone:'0712345678',address:'20 High Road, Durban',area:'Durban',province:'KwaZulu-Natal',revision:0,status:'approved'};
 await rejects(f.call('agent_profile_update',update,{uid:'unknown',email_verified:true}),403);
 await f.call('agent_profile_update',update);const p=f.db.records.get('teyzaFieldAgents/agent1');assert.equal(p.address,update.address);assert.equal(p.status,'approved');assert.equal(p.revision,1);
 await rejects(f.call('agent_profile_update',update),409);
});
