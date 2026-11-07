'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createMandate,VERSION,terms,schedule}=require('./mandate'),cipher=require('./selfie-crypto');
class FakeDB {
  constructor(seed={}){this.records=new Map(Object.entries(structuredClone(seed)));this.serial=0;}
  doc(path){const db=this;return {path,id:path.split('/').pop(),get:async()=>db.snapshot(path),
    set:async(value,options)=>db.records.set(path,options?.merge?{...db.records.get(path),...structuredClone(value)}:structuredClone(value)),
    update:async value=>{assert(db.records.has(path));db.records.set(path,{...db.records.get(path),...structuredClone(value)});},
    collection:name=>db.collection(path+'/'+name)};}
  snapshot(path){const data=this.records.get(path);return {exists:data!==undefined,id:path.split('/').pop(),data:()=>structuredClone(data),ref:this.doc(path)};}
  collection(path){const db=this,filters=[];let sort=null,max=Infinity,after=null;const query={
    doc:(value)=>db.doc(path+'/'+(value||'generated'+(++db.serial))),
    where:(...filter)=>{filters.push(filter);return query;},orderBy:(...args)=>{sort=args;return query;},
    startAfter:value=>{after=value;return query;},limit:value=>{max=value;return query;},get:async()=>{
      let rows=[...db.records].filter(([key,value])=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')===-1&&
        filters.every(([field,op,wanted])=>op==='=='?value[field]===wanted:op==='array-contains'?value[field]?.includes(wanted):value[field]<=wanted));
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

const now=Date.parse('2026-10-27T08:00:00Z'),secret=crypto.randomBytes(32).toString('base64');
const actor={uid:'owner',email_verified:true},admin={uid:'admin',teyzaAdmin:true,email_verified:true,auth_time:now/1000};
const data={requestId:'request1',expectedMandateId:null,amountCents:9900,termsVersion:VERSION,firstDate:'2026-11-01',collectionDay:1,firstName:'Test',surname:'Owner',phone:'0712345678',documentKind:'id',documentNumber:'9001015009087',accountHolder:'Test Owner',bankName:'FNB',branchCode:'000000',accountNumber:'12345678901',accountType:'current',consent:true,identityConsent:true,imageBase64:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(120)]).toString('base64')};
function setup({authDisplayName='Test Owner'}={}){const db=new FakeDB({'teyzaSellerAccounts/owner':{uid:'owner',category:'spaza',approvalStatus:'approved',phone:'+27712345678',shopName:'Test Shop',address:'12 Main Road, Durban'},'teyzaPublicShops/owner':{sellerUid:'owner',status:'active'}}),files=new Map();const bucket={file:p=>({save:async b=>files.set(p,b),download:async()=>[files.get(p)]})};const svc=createMandate({db,bucket,sanitizeImage:async b=>b,encryptSelfie:async b=>cipher.encrypt(b,secret),decryptSelfie:async b=>cipher.decrypt(b,secret),getAuthUser:async()=>({displayName:authDisplayName}),clock:()=>now,rate:async()=>{}});return {db,files,call:(action,d={},a=actor)=>svc.execute(a,action,d)};}
const rejects=(p,status)=>assert.rejects(p,e=>e.status===status);
test('A signed mandate encrypts ID and banking data and never charges or activates the shop',async()=>{const f=setup(),r=await f.call('seller_mandate_submit',data);assert.equal(r.mandate.status,'pending_provider_authentication');assert.equal(r.mandate.collectionActive,false);assert.equal(r.mandate.branchCode,'250655');const raw=f.db.records.get('teyzaSellerMandates/owner');assert(!JSON.stringify([...f.db.records]).includes(data.accountNumber));assert(!JSON.stringify(r).includes(data.documentNumber));assert.equal(JSON.parse(cipher.decrypt(Buffer.from(raw.detailsEncrypted,'base64'),secret)).accountNumber,data.accountNumber);assert.equal(f.db.records.get('teyzaSellerAccounts/owner').approvalStatus,'approved');assert.equal(f.files.size,1);assert(![...f.db.records.keys()].some(k=>k.startsWith('teyzaBilling/')));assert.equal(raw.terms,terms(data.firstDate,1));});
test('Pending, rejected, unreviewed and suspended sellers cannot submit a debit-order request',async()=>{
 for(const change of [
  f=>f.db.records.set('teyzaSellerAccounts/owner',{...f.db.records.get('teyzaSellerAccounts/owner'),approvalStatus:'pending'}),
  f=>f.db.records.set('teyzaSellerAccounts/owner',{...f.db.records.get('teyzaSellerAccounts/owner'),approvalStatus:'rejected'}),
  f=>f.db.records.set('teyzaMobileVerification/owner',{ownerUid:'owner',status:'pending_review'}),
  f=>f.db.records.set('teyzaPublicShops/owner',{sellerUid:'owner',status:'suspended',moderationSource:'safety'})
 ]){const f=setup();change(f);await rejects(f.call('seller_mandate_submit',data),403);
  assert.equal(f.files.size,0);assert(!f.db.records.has('teyzaSellerMandates/owner'));}
});
test('Approval revoked between the initial check and transaction cannot create a mandate',async()=>{
 const f=setup(),run=f.db.runTransaction.bind(f.db);
 f.db.runTransaction=async fn=>{f.db.records.set('teyzaSellerAccounts/owner',{
   ...f.db.records.get('teyzaSellerAccounts/owner'),approvalStatus:'pending'});return run(fn);};
 await rejects(f.call('seller_mandate_submit',data),403);
 assert(!f.db.records.has('teyzaSellerMandates/owner'));
 assert(!f.db.records.has('teyzaBilling/owner'));
});
test('Exact amount, current terms, explicit consent, ID attachment, dates and bank fields are enforced',async()=>{for(const patch of [{amountCents:1},{termsVersion:'old'},{consent:false},{identityConsent:false},{imageBase64:''},{firstDate:'2026-11-31'},{collectionDay:31},{firstDate:'2026-10-01'},{accountNumber:'bank'},{documentNumber:'short'},{bankName:'forged'}]){const f=setup();await assert.rejects(f.call('seller_mandate_submit',{...data,...patch}),e=>e.status>=400);assert(!f.db.records.has('teyzaSellerMandates/owner'));}});
test('Mandates are owner bound, duplicate retries do not duplicate consent and stale replacements fail',async()=>{const f=setup();await f.call('seller_mandate_submit',{...data,sellerUid:'another'});assert(!f.db.records.has('teyzaSellerMandates/another'));assert((await f.call('seller_mandate_submit',data)).alreadySubmitted);assert.equal([...f.db.records.keys()].filter(k=>k.includes('/versions/')).length,1);await rejects(f.call('seller_mandate_submit',{...data,requestId:'request2'}),409);await rejects(f.call('seller_mandate_submit',{...data,accountNumber:'98765432100'}),409);});
test('Withdrawal preserves the signed record, is stale protected, and does not create any payment',async()=>{const f=setup();await f.call('seller_mandate_submit',data);await rejects(f.call('seller_mandate_withdraw',{mandateId:'old'}),409);await f.call('seller_mandate_withdraw',{mandateId:'request1'});assert.equal(f.db.records.get('teyzaSellerMandates/owner').status,'withdrawn');assert.equal(f.db.records.get('teyzaSellerMandates/owner/versions/request1').status,'pending_provider_authentication');assert((await f.call('seller_mandate_status')).required);});
test('Only a fresh trusted other administrator can view a current mandate ID and the view is audited',async()=>{const f=setup();await f.call('seller_mandate_submit',data);const target={sellerUid:'owner',mandateId:'request1'};await rejects(f.call('ops_mandate_image',target),403);await rejects(f.call('ops_mandate_image',target,{...admin,uid:'owner'}),403);await rejects(f.call('ops_mandate_image',target,{...admin,auth_time:now/1000-301}),401);await rejects(f.call('ops_mandate_image',{...target,mandateId:'old'},admin),409);const r=await f.call('ops_mandate_image',target,admin);assert.equal(r.imageBase64,data.imageBase64);assert([...f.db.records.values()].some(r=>r.action==='ops_mandate_image'));});
test('A reused ID must belong to this seller, remain current and match the entered document number',async()=>{const f=setup();f.db.records.set('teyzaSellerIdentity/owner',{ownerUid:'owner',kind:'id',evidenceId:'doc1',objectPath:'teyza-private/mobile-verification/owner/doc1.enc',expiresAt:now+86400000,detailsEncrypted:cipher.encrypt(Buffer.from(JSON.stringify({documentNumber:data.documentNumber})),secret).toString('base64')});await rejects(f.call('seller_mandate_submit',{...data,imageBase64:undefined,identityEvidenceId:'doc1',documentNumber:'9001015009088'}),422);await f.call('seller_mandate_submit',{...data,imageBase64:undefined,identityEvidenceId:'doc1'});assert.equal(f.files.size,0);});
test('Unregistered, bootstrap and unverified accounts cannot submit a mandate',async()=>{const f=setup();await rejects(f.call('seller_mandate_submit',data,{uid:'unknown',email_verified:true}),403);await rejects(f.call('seller_mandate_submit',data,{...actor,teyzaPhoneBootstrap:true}),403);await rejects(f.call('seller_mandate_submit',data,{uid:'owner'}),403);});
test('Collection date must be real, upcoming and on the agreed monthly day',()=>{schedule('2026-11-01',1,()=>now);for(const [date,day] of [['2026-11-31',1],['2026-11-01',2],['2026-12-29',29],['2026-09-01',1],['2028-11-01',1]])assert.throws(()=>schedule(date,day,()=>now));});

test('Mandate status prefills the seller address, verified contact and known holder name without exposing account numbers',async()=>{
 const f=setup(),status=await f.call('seller_mandate_status');
 assert.equal(status.seller.shopAddress,'12 Main Road, Durban');
 assert.equal(status.seller.phone,'+27712345678');
 assert.equal(status.seller.firstName,'Test');
 assert.equal(status.seller.surname,'Owner');
 assert(!JSON.stringify(status).includes(data.accountNumber));
 assert.equal(status.amountCents,9900);
});
test('Mandate prefill uses the current owner-bound saved profile when Firebase display name is empty',async()=>{
 const f=setup({authDisplayName:''});
 f.db.records.set('teyzaShopperProfiles/owner',{ownerUid:'owner',displayName:'Saved Owner'});
 const status=await f.call('seller_mandate_status');
 assert.equal(status.seller.firstName,'Saved');
 assert.equal(status.seller.surname,'Owner');
 assert.equal(status.seller.accountHolder,'Saved Owner');
 assert.equal(status.seller.shopAddress,'12 Main Road, Durban');
 assert(!JSON.stringify(status).includes(data.accountNumber));
});
test('A different owner profile is never used to prefill private seller identity',async()=>{
 const f=setup({authDisplayName:''});
 f.db.records.set('teyzaShopperProfiles/owner',{ownerUid:'another',displayName:'Another Person'});
 const status=await f.call('seller_mandate_status');
 assert.equal(status.seller.firstName,'');
 assert.equal(status.seller.surname,'');
 assert.equal(status.seller.accountHolder,'');
});
test('Signed mandate appears in admin inbox; sensitive details are only returned on audited explicit admin request',async()=>{
 const f=setup();
 const signed=await f.call('seller_mandate_submit',data);
 const inbox=await f.call('ops_mandate_queue',{},admin);
 assert.equal(inbox.mandates.length,1);
 assert.equal(inbox.mandates[0].shopAddress,'12 Main Road, Durban');
 assert(!JSON.stringify(inbox).includes(data.accountNumber));
 await rejects(f.call('ops_mandate_detail',{sellerUid:'owner',mandateId:signed.mandate.mandateId}),403);
 const detail=await f.call('ops_mandate_detail',{sellerUid:'owner',mandateId:signed.mandate.mandateId},admin);
 assert.equal(detail.sensitive.accountNumber,data.accountNumber);
 assert.equal(detail.mandate.collectionActive,false);
 assert([...f.db.records.values()].some(v=>v.action==='ops_mandate_detail'));
 const review=await f.call('ops_mandate_review',{sellerUid:'owner',mandateId:signed.mandate.mandateId,
   decision:'reviewed_pending_provider',reason:'Bank authentication needs accredited debit collection provider.',confirmed:true},admin);
 assert.equal(review.collectionActive,false);
 assert.equal(f.db.records.get('teyzaSellerMandates/owner').status,'reviewed_pending_provider');
 assert.equal(f.db.records.get('teyzaBilling/owner'),undefined);
});
test('Seller cannot replace registered contact phone in a signed mandate',async()=>{
 const f=setup();
 await rejects(f.call('seller_mandate_submit',{...data,phone:'+27825550111'}),409);
 assert(!f.db.records.has('teyzaSellerMandates/owner'));
});

test('Exporting a complete provider-review mandate requires fresh administrator credentials and is separately audited',async()=>{
 const f=setup();await f.call('seller_mandate_submit',data);
 const target={sellerUid:'owner',mandateId:'request1'};
 await rejects(f.call('ops_mandate_export',target),403);
 await rejects(f.call('ops_mandate_export',target,{...admin,auth_time:now/1000-301}),401);
 const result=await f.call('ops_mandate_export',target,admin);
 assert.equal(result.sensitive.accountNumber,data.accountNumber);
 assert.equal(result.mandate.collectionActive,false);
 assert([...f.db.records.values()].some(v=>v.action==='ops_mandate_export'));
 await f.call('seller_mandate_withdraw',{mandateId:'request1'});
 await rejects(f.call('ops_mandate_export',{...target,mandateId:'old'},admin),409);
});

test('Manual Netcash handoff records a provider portal receipt but never activates access or creates a debit',async()=>{
 const f=setup(),mandate=await f.call('seller_mandate_submit',data);
 const target={sellerUid:'owner',mandateId:mandate.mandate.mandateId,
   providerReference:'NC-RECEIPT-2026-0042',note:'PDF uploaded securely in Netcash portal on 07 November 2026.',
   confirmed:true};
 await rejects(f.call('ops_mandate_record_netcash_submission',target,admin),409);
 await f.call('ops_mandate_review',{sellerUid:'owner',mandateId:target.mandateId,
   decision:'reviewed_pending_provider',reason:'Owner consent reviewed, awaiting manual Netcash submission.',confirmed:true},admin);
 await rejects(f.call('ops_mandate_record_netcash_submission',{...target,confirmed:false},admin),422);
 const done=await f.call('ops_mandate_record_netcash_submission',target,admin);
 assert.equal(done.status,'submitted_to_netcash');
 assert.equal(done.collectionActive,false);
 const saved=f.db.records.get('teyzaSellerMandates/owner');
 assert.equal(saved.providerStatus,'submitted_unverified');
 assert.equal(saved.provider,'netcash');
 assert.equal(saved.providerReference,target.providerReference);
 assert.equal(saved.collectionActive,false);
 assert(!f.db.records.has('teyzaBilling/owner'));
 assert((await f.call('ops_mandate_record_netcash_submission',target,admin)).alreadyRecorded);
 await rejects(f.call('ops_mandate_record_netcash_submission',{...target,providerReference:'NC-RECEIPT-OTHER'},admin),409);
 assert([...f.db.records.values()].some(v=>v.action==='netcash_manual_submission'));
 const view=await f.call('seller_mandate_status');
 assert.equal(view.mandate.providerStatus,'submitted_unverified');
 assert(!JSON.stringify(view).includes(target.providerReference));
});
test('Manual Netcash submission requires another fresh admin and forbids withdrawn mandates',async()=>{
 const f=setup();await f.call('seller_mandate_submit',data);
 const submission={sellerUid:'owner',mandateId:'request1',providerReference:'NC-PORTAL-81726',
   note:'Submitted from secure Netcash office portal.',confirmed:true};
 await rejects(f.call('ops_mandate_record_netcash_submission',submission),403);
 await rejects(f.call('ops_mandate_record_netcash_submission',submission,{...admin,auth_time:now/1000-301}),401);
 await f.call('seller_mandate_withdraw',{mandateId:'request1'});
 await rejects(f.call('ops_mandate_record_netcash_submission',submission,admin),409);
 assert(!f.db.records.has('teyzaBilling/owner'));
});
