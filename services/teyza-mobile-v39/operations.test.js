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
test('Legacy mandate and manual payment endpoints refuse to change billing',async()=>{
 const f=setup();
 const before=structuredClone([...f.db.records]);
 for(const [action,data] of [['ops_invoice',invoice],['ops_payment',payment],
   ['ops_payment_reverse',{sellerUid:'seller1',paymentId:'payment_a',reason:'undo'}]])
   await rejects(f.call(action,data),410);
 assert.deepEqual([...f.db.records],before,'Manual payment actions must never create a paid entitlement');
});
test('Admin shows same-email account types separately and flags deletion-pending UID',async()=>{
 const f=setup();
 f.db.records.set('teyzaSellerAccounts/seller1',{...f.db.records.get('teyzaSellerAccounts/seller1'),
   ownerEmail:'shared@example.test',shopName:'Approved Spaza'});
 f.db.records.set('teyzaSellerAccounts/seller2',{...f.db.records.get('teyzaSellerAccounts/seller2'),
   ownerEmail:'shared@example.test',shopName:'Old Tester',deletionPending:true});
 const d=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(d.seller.sellerUid,'seller1');
 assert.equal(d.relatedAccounts.length,2);
 assert.deepEqual(d.relatedAccounts.map(a=>a.sellerUid).sort(),['seller1','seller2']);
 assert.equal(d.relatedAccounts.find(a=>a.sellerUid==='seller1').approvalStatus,'approved');
 assert.equal(d.relatedAccounts.find(a=>a.sellerUid==='seller2').approvalStatus,'pending');
 assert.equal(d.relatedAccounts.find(a=>a.sellerUid==='seller2').deletionPending,true);
 assert.equal(d.relatedAccounts.find(a=>a.sellerUid==='seller2').isCurrent,false);
});
test('Product approvals queue shows a verified Paystack seller and submitted catalogue',async()=>{
 const f=setup();
 f.db.records.set('teyzaSellerAccounts/seller1',{...f.db.records.get('teyzaSellerAccounts/seller1'),listingPlan:'basic'});
 f.db.records.set('teyzaPublicShops/seller1',{sellerUid:'seller1',status:'active',sellingEnabled:true,
   products:[{id:'catalog_milk',name:'Milk',category:'Dairy',priceCents:2500,stock:3}]});
 f.db.records.set('teyzaSellerOnboarding/seller1',{completedAt:now});
 f.db.records.set('teyzaMobileVerification/seller1',{ownerUid:'seller1',status:'approved'});
 f.db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',status:'paid',
   paymentProvider:'paystack',paymentEnvironment:'live',paidUntil:now+86400000});
 f.db.records.set('teyzaCatalogueSubmissions/seller1',{ownerUid:'seller1',
   status:'pending_review',products:[{id:'catalog_milk',name:'Milk',category:'Dairy',priceCents:2500,stock:3}]});
 const ref='TZM_'+('1'.repeat(26));
 f.db.records.set('teyzaPaystackPayments/'+ref,{ownerUid:'seller1',status:'pending',
   kind:'intro',amountCents:4900,createdAt:now});
 const q=await f.call('ops_catalogue_queue');
 assert.equal(q.submissions.length,1);assert.equal(q.submissions[0].productCount,1);
 assert.equal(q.submissions[0].paidMembership,true);
 const d=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(d.membershipPaid,true);assert.equal(d.canApproveCatalogue,true);
 assert.equal(d.catalogue.products[0].name,'Milk');
 assert.equal(d.payments[0].reference,ref);assert.equal(d.paystackMode,'test');
 assert.equal(d.mandate,undefined,'Bank mandate information must not be returned to new admin billing');
});
test('Product approvals queue and seller detail never treat bank receipts or sandbox payments as paid',async()=>{
 const f=setup();
 f.db.records.set('teyzaCatalogueSubmissions/seller1',{ownerUid:'seller1',
   status:'pending_review',products:[]});
 f.db.records.set('teyzaSellerAccounts/seller1',{...f.db.records.get('teyzaSellerAccounts/seller1'),listingPlan:'basic'});
 f.db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',status:'paid',monthlyCents:9900,latestPeriod:'2026-10'});
 let q=await f.call('ops_catalogue_queue');assert.equal(q.submissions[0].paidMembership,false);
 let d=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(d.membershipPaid,false);assert.equal(d.canApproveCatalogue,false);
 f.db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',status:'paid',paidUntil:now+86400000,
   paymentEnvironment:'test'});
 q=await f.call('ops_catalogue_queue');assert.equal(q.submissions[0].paidMembership,false);
 d=await f.call('ops_seller_detail',{sellerUid:'seller1'});assert.equal(d.membershipPaid,false);
});
test('Admin distinguishes sixteen public products from missing, changed and valid shop coordinates',async()=>{
  const f=setup();
  const account=f.db.records.get('teyzaSellerAccounts/seller1');
  f.db.records.set('teyzaSellerAccounts/seller1',{...account,address:'12 Main Road, Durban'});
  f.db.records.set('teyzaPublicShops/seller1',{sellerUid:'seller1',status:'active',
    name:'Test Shop',address:'12 Main Road, Durban',
    products:Array.from({length:16},(_,i)=>({id:'item'+i,name:'Item '+i,priceCents:1000+i,stock:5}))});
  f.db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',mandateAccessStatus:'active',
    mandateAccessKind:'processing_7d',mandateAccessMandateId:'mandate_qa',mandateAccessUntil:now+86400000});
  let detail=await f.call('ops_seller_detail',{sellerUid:'seller1'});
  assert.equal(detail.shopperVisibility.directoryEligible,true);
  assert.equal(detail.shopperVisibility.publicProductCount,16);
  assert.equal(detail.shopperVisibility.status,'pin_missing');
  assert.equal(detail.shopperVisibility.hasValidPin,false);
  f.db.records.set('teyzaShopLocations/seller1',{ownerUid:'seller1',
    address:'12 Main Road, Durban',area:'KwaMashu',city:'Durban',
    latitude:-29.7402,longitude:30.992,consentAt:now-60000,
    source:'google_places',coordinatesExpireAt:now+5*86400000});
  detail=await f.call('ops_seller_detail',{sellerUid:'seller1'});
  assert.equal(detail.shopperVisibility.status,'location_ready');
  assert.equal(detail.shopperVisibility.hasValidPin,true);
  assert.equal(detail.shopperVisibility.latitude,-29.7402);
  f.db.records.set('teyzaSellerAccounts/seller1',{...f.db.records.get('teyzaSellerAccounts/seller1'),
    address:'20 Second Road, Durban'});
  detail=await f.call('ops_seller_detail',{sellerUid:'seller1'});
  assert.equal(detail.shopperVisibility.status,'address_changed');
  assert.equal(detail.shopperVisibility.hasValidPin,false);
});
test('Only a separate recently signed-in admin can grant explicitly confirmed complimentary shop access',async()=>{
 const f=setup(),input={sellerUid:'seller1',days:7,
  reason:'Approved small business community launch demonstration',confirmed:true};
 await rejects(f.call('ops_complimentary_access',input,{...admin,teyzaAdmin:false}),403);
 await rejects(f.call('ops_complimentary_access',input,{...admin,auth_time:now/1000-301}),401);
 await rejects(f.call('ops_complimentary_access',{...input,confirmed:false}),422);
 await rejects(f.call('ops_complimentary_access',{...input,reason:'brief'}),422);
 await rejects(f.call('ops_complimentary_access',{...input,days:365}),422);
 await rejects(f.call('ops_complimentary_access',{...input,sellerUid:'seller2'}),409);
 const result=await f.call('ops_complimentary_access',input);
 assert.equal(result.granted,true);assert.equal(result.paid,false);
 assert.equal(result.until,now+7*86400000);
 const billing=f.db.records.get('teyzaBilling/seller1');
 assert.equal(billing.status,undefined,'Complimentary access must not falsify paid billing');
 assert.equal(billing.adminComplimentaryBy,'admin1');
 assert.equal(billing.adminComplimentaryUntil,result.until);
 assert([...f.db.records.keys()].some(p=>p.startsWith('teyzaOperationsAudit/')));
 await rejects(f.call('ops_complimentary_access',input),409);
 const detail=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(detail.membershipPaid,false);
 assert.equal(detail.complimentaryAccess,true);
 const previous=f.db.records.get('teyzaSellerAccounts/seller1');
 f.db.records.set('teyzaSellerAccounts/seller1',{...previous,approvalStatus:'rejected'});
 const blocked=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(blocked.complimentaryAccess,false,'A revoked shop identity approval blocks complimentary access');
});
test('Admin can publish a saved spaza range only with approved, active selling access, confirmation and an audit',async()=>{
 const syncCalls=[],f=(()=>{
   const db=new FakeDB({
     'teyzaSellerAccounts/seller1':{uid:'seller1',category:'spaza',shopName:'Test Shop',approvalStatus:'approved'},
     'teyzaPublicShops/seller1':{sellerUid:'seller1',status:'active',products:[],catalogueEnabled:false},
     'teyzaDraftProducts/seller1/items/rice':{ownerUid:'seller1',status:'draft',name:'Rice',priceCents:2500,stockQty:3},
   });
   const sync=async (target,options)=>{
     syncCalls.push({target,options});
     db.records.set('teyzaPublicShops/'+target,{...db.records.get('teyzaPublicShops/'+target),products:[
       {id:'rice',name:'Rice',category:'Groceries',priceCents:2500,stock:3}]});
     return {publication:'live',publicCount:1};
   };
   const svc=createOperations({db,clock:()=>now,rate:async()=>{},synchronize:sync});
   return {db,call:(action,data={},actor=admin)=>svc.execute(actor,action,data)};
 })();
 const input={sellerUid:'seller1',reason:'Reviewed live shop and current stock for publication',confirmed:true};
 await rejects(f.call('ops_catalogue_publish',input),409);
 const grant=await f.call('ops_complimentary_access',{
   sellerUid:'seller1',days:30,reason:'Verified QA local seller for temporary listing',confirmed:true});
 assert.equal(grant.paid,false);
 await rejects(f.call('ops_catalogue_publish',{...input,confirmed:false}),422);
 await rejects(f.call('ops_catalogue_publish',{...input,reason:'short'}),422);
 await rejects(f.call('ops_catalogue_publish',input,{...admin,uid:'seller1'}),403);
 await rejects(f.call('ops_catalogue_publish',input,{...admin,auth_time:now/1000-301}),401);
 const result=await f.call('ops_catalogue_publish',input);
 assert.equal(result.published,true);assert.equal(result.publicProductCount,1);
 assert.equal(result.noPaymentRecorded,true);
 assert.deepEqual(syncCalls.at(-1),{target:'seller1',options:{publishIntent:true}});
 const audit=[...f.db.records.values()].find(x=>x.action==='ops_catalogue_publish');
 assert.equal(audit.target,'seller1');assert.equal(audit.details.noPaymentRecorded,true);
 const detail=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(detail.sellingStatus.savedDraftCount,1);
 assert.equal(detail.sellingStatus.publicProductCount,1);
 assert.equal(detail.sellingStatus.publicProductsAllowed,true);
});
test('Wholesalers remain shop listings only: admin cannot publish retail-facing prices',async()=>{
 const f=setup();
 f.db.records.set('teyzaSellerAccounts/seller1',{...f.db.records.get('teyzaSellerAccounts/seller1'),category:'wholesale'});
 f.db.records.set('teyzaPublicShops/seller1',{sellerUid:'seller1',status:'active',shopCategory:'wholesale',products:[
   {id:'bulk',name:'Private bulk prices',priceCents:10000,stock:2}]});
 const input={sellerUid:'seller1',reason:'Attempt to publish wholesale supplier prices',confirmed:true};
 await rejects(f.call('ops_catalogue_publish',input),409);
 const detail=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(detail.sellingStatus.publicProductCount,0);
 assert.equal(detail.sellingStatus.publicProductsAllowed,false);
});
test('Seller statements are bound to the authenticated owner even when another UID is supplied',async()=>{const f=setup();f.db.records.set('teyzaBilling/seller1/entries/invoice_2026-10',{ownerUid:'seller1',kind:'subscription_invoice',createdAt:now,debitCents:9900,creditCents:0});const d=await f.call('seller_billing_statement',{sellerUid:'seller1'},{uid:'seller2',email_verified:true});assert.equal(d.seller.sellerUid,'seller2');assert.equal(d.entries.length,0);});
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
