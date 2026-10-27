'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOperations,period,amount}=require('./operations');
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

const now=1793090000000,admin={uid:'admin1',teyzaAdmin:true,email_verified:true,auth_time:now/1000};
function setup(){const db=new FakeDB({'teyzaSellerAccounts/seller1':{uid:'seller1',category:'spaza',shopName:'Test Shop',approvalStatus:'approved'},'teyzaSellerAccounts/seller2':{uid:'seller2',category:'retail',shopName:'Second',approvalStatus:'pending'}});const svc=createOperations({db,clock:()=>now,rate:async()=>{}});return {db,call:(a,d={},actor=admin)=>svc.execute(actor,a,d)};}
const rejects=(p,status)=>assert.rejects(p,e=>e.status===status);
const invoice={sellerUid:'seller1',period:'2026-10',consentReference:'Recorded mandate A',consentConfirmed:true};
const payment={sellerUid:'seller1',period:'2026-10',amountCents:9900,reference:'Bank-TXN-001',receiptVerified:true};
test('Operations reject sellers, stale admins, phone bootstrap tokens and unverified reviewers',async()=>{const f=setup();for(const actor of [{uid:'seller1',email_verified:true},{...admin,auth_time:now/1000-301},{...admin,teyzaPhoneBootstrap:true},{...admin,email_verified:false}])await rejects(f.call('ops_sellers',{},actor),actor.teyzaAdmin&&actor.email_verified?401:403);});
test('Invoice requires approval and consent and is idempotent per seller/month',async()=>{const f=setup();await rejects(f.call('ops_invoice',{...invoice,consentConfirmed:false}),422);await rejects(f.call('ops_invoice',{...invoice,sellerUid:'seller2'}),409);await f.call('ops_invoice',invoice);assert((await f.call('ops_invoice',invoice)).alreadyCreated);const data=await f.call('ops_seller_detail',{sellerUid:'seller1'});assert.equal(data.entries.length,1);assert.equal(data.entries[0].balanceCents,9900);assert.equal(data.billing.monthlyCents,9900);});
test('Payments need an invoice, a verified receipt and exact integer cents',async()=>{const f=setup();await rejects(f.call('ops_payment',payment),409);await f.call('ops_invoice',invoice);await rejects(f.call('ops_payment',{...payment,receiptVerified:false}),422);await rejects(f.call('ops_payment',{...payment,amountCents:99.5}),422);await rejects(f.call('ops_payment',{...payment,amountCents:9901}),409);});
test('Partial payment, duplicate receipt retry and full payment reconcile without double credit',async()=>{const f=setup();await f.call('ops_invoice',invoice);const partial={...payment,amountCents:4000};await f.call('ops_payment',partial);assert((await f.call('ops_payment',partial)).alreadyRecorded);await rejects(f.call('ops_payment',payment),409);await f.call('ops_payment',{...payment,amountCents:5900,reference:'Bank-TXN-002'});const d=await f.call('ops_seller_detail',{sellerUid:'seller1'});assert.equal(d.entries.length,3);assert.equal(d.entries.at(-1).balanceCents,0);assert.equal(d.billing.status,'paid');});
test('Receipt references cannot be reassigned to another seller',async()=>{const f=setup();await f.call('ops_invoice',invoice);await f.call('ops_payment',payment);await rejects(f.call('ops_payment',{...payment,sellerUid:'seller2'}),409);});
test('Corrections retain the original entry, restore invoice balance and cannot repeat',async()=>{const f=setup();await f.call('ops_invoice',invoice);await f.call('ops_payment',payment);const d=await f.call('ops_seller_detail',{sellerUid:'seller1'}),p=d.entries.find(e=>e.kind==='payment');await f.call('ops_payment_reverse',{sellerUid:'seller1',paymentId:p.id,reason:'Recorded against the wrong receipt'});await rejects(f.call('ops_payment_reverse',{sellerUid:'seller1',paymentId:p.id,reason:'Repeat'}),409);const next=await f.call('ops_seller_detail',{sellerUid:'seller1'});assert.equal(next.entries.at(-1).balanceCents,9900);assert.equal(next.entries.length,3);assert.equal(next.billing.status,'needs_reconciliation');});
test('Seller statements are bound to the authenticated owner even if another UID is supplied',async()=>{const f=setup();await f.call('ops_invoice',invoice);const d=await f.call('seller_billing_statement',{sellerUid:'seller1'},{uid:'seller2',email_verified:true});assert.equal(d.seller.sellerUid,'seller2');assert.equal(d.entries.length,0);});
test('Finance decisions require consent, approved seller, expected status and capped amounts',async()=>{const f=setup(),path='teyzaCreditEnquiries/seller1/requests/r1';f.db.records.set(path,{ownerUid:'seller1',amountCents:100000,purpose:'Stock',status:'enquiry_received',consent:true});const data={path,expectedStatus:'enquiry_received',status:'approved_in_principle',approvedAmountCents:50000,note:'Manual review complete; subject to lender terms',reviewConfirmed:true};await rejects(f.call('ops_finance_decide',{...data,approvedAmountCents:100001}),409);await rejects(f.call('ops_finance_decide',{...data,expectedStatus:'under_review'}),409);await f.call('ops_finance_decide',data);assert.equal(f.db.records.get(path).disbursementStatus,'not_disbursed');await rejects(f.call('ops_finance_decide',{...data,expectedStatus:'approved_in_principle'}),409);});
test('Finance cannot approve own application or read arbitrary document paths',async()=>{const f=setup();await rejects(f.call('ops_finance_decide',{path:'users/seller1',note:'x',status:'declined'}),422);await rejects(f.call('ops_finance_decide',{path:'teyzaCreditEnquiries/admin1/requests/r1',note:'x',status:'declined',expectedStatus:'enquiry_received'}),403);});
test('Support updates protect concurrent edits and keep internal notes separate from seller replies',async()=>{const f=setup();const c=await f.call('ops_support_create',{sellerUid:'seller1',subject:'Login issue',message:'User reported a sign-in problem'});await f.call('ops_support_update',{ticketId:c.ticketId,revision:0,status:'in_progress',priority:'high',note:'Investigating'});await rejects(f.call('ops_support_update',{ticketId:c.ticketId,revision:0,status:'resolved',priority:'normal',note:'Old edit'}),409);const d=await f.call('ops_support_detail',{ticketId:c.ticketId});assert.equal(d.notes[0].note,'Investigating');const own=await f.call('seller_support_list',{}, {uid:'seller1',email_verified:true});assert(!JSON.stringify(own).includes('Investigating'));});
test('Strict validation rejects impossible months and fractional cents',()=>{for(const v of ['2026-00','2026-13','2026-10/other'])assert.throws(()=>period(v));for(const v of [0,-1,99.5,NaN,Infinity])assert.throws(()=>amount(v));});

test('Finance queue exposes only seller-bound finance requests and supports legacy enquiry records',async()=>{
 const f=setup();f.db.records.set('teyzaCreditEnquiries/seller1/requests/a',{ownerUid:'seller1',amountCents:100000,status:'enquiry_received'});
 f.db.records.set('otherPrivate/seller1/requests/b',{ownerUid:'seller1',secret:'unrelated'});
 f.db.records.set('teyzaCreditEnquiries/seller2/requests/c',{ownerUid:'seller1',amountCents:100000});
 f.db.collectionGroup=()=>{const query={orderBy:()=>query,limit:()=>query,startAfter:()=>query,get:async()=>({docs:[...f.db.records.keys()].filter(k=>k.includes('/requests/')).map(k=>f.db.snapshot(k))})};return query;};
 const r=await f.call('ops_finance_queue');assert.equal(r.requests.length,1);assert.equal(r.requests[0].path,'teyzaCreditEnquiries/seller1/requests/a');assert(!JSON.stringify(r).includes('unrelated'));
});
test('An oversized ledger is never returned as a complete statement with a false opening balance',async()=>{const f=setup();for(let n=0;n<501;n++)f.db.records.set('teyzaBilling/seller1/entries/e'+n,{ownerUid:'seller1',createdAt:n,debitCents:9900,creditCents:0});await rejects(f.call('ops_seller_detail',{sellerUid:'seller1'}),422);});
