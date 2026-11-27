'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createOperations:rawCreateOperations,period,amount}=require('./operations');
const createOperations=require('./test-admin-fixtures.cjs').withModuleAdminFixtures(rawCreateOperations);
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
        filters.every(([field,op,wanted])=>op==='=='?value[field]===wanted:op==='array-contains'?value[field]?.includes(wanted):op==='in'?wanted.includes(value[field]):value[field]<=wanted));
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
test('Seller billing overview is UID-scoped, includes genuine Paystack history and never grants payment',async()=>{
 const f=setup();
 f.db.records.set('teyzaSellerAccounts/seller1',{...f.db.records.get('teyzaSellerAccounts/seller1'),listingPlan:'basic'});
 f.db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',status:'paid',
   paymentProvider:'paystack',paymentEnvironment:'live',paidUntil:now+86400000,
   nextBillingAt:now+86400000,renewalSetup:'scheduled',paystackSubscriptionCode:'SUB_A1'});
 f.db.records.set('teyzaPaystackPayments/pay1',{ownerUid:'seller1',kind:'intro',status:'paid',
   amountCents:1000,currency:'ZAR',environment:'live',verifiedAt:now-10000});
 f.db.records.set('teyzaPaystackPayments/payOther',{ownerUid:'seller2',kind:'monthly',
   status:'paid',amountCents:9900,currency:'ZAR',environment:'live',verifiedAt:now-5000});
 const before=structuredClone([...f.db.records]);
 const result=await f.call('seller_billing_overview',{sellerUid:'seller2'},{
   uid:'seller1',email_verified:true,auth_time:now/1000});
 assert.equal(result.sellerUid,'seller1');
 assert.equal(result.status,'paid');
 assert.equal(result.nextBillAmountCents,9900);
 assert.equal(result.amountDueCents,null);
 assert.deepEqual(result.transactions.map(x=>x.reference),['pay1']);
 assert.deepEqual([...f.db.records],before,'Reading a statement must not change billing or access');
 await rejects(f.call('seller_billing_overview',{sellerUid:'seller1'},{
   uid:'seller2',email_verified:false}),403);
});
test('Legacy mandate and manual payment endpoints refuse to change billing',async()=>{
 const f=setup();
 const before=structuredClone([...f.db.records]);
 for(const [action,data] of [['ops_invoice',invoice],['ops_payment',payment],
   ['ops_payment_reverse',{sellerUid:'seller1',paymentId:'payment_a',reason:'undo'}]])
   await rejects(f.call(action,data),410);
 assert.deepEqual([...f.db.records],before,'Manual payment actions must never create a paid entitlement');
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

test('Seller support conversations are scoped to the signed-in UID and replies reach the owner',async()=>{
 const f=setup(),seller={uid:'seller1',email_verified:true},intruder={uid:'seller2',email_verified:true};
 const opened=await f.call('seller_support_open',{sellerUid:'seller2'},seller);
 assert.equal(opened.ticketId,'seller_seller1');
 assert.equal(f.db.records.get('teyzaSupportTickets/seller_seller1').ownerUid,'seller1');
 const id='seller_msg_1';
 await f.call('seller_support_message',{ticketId:'seller_seller2',message:'Please help me understand my membership status.',messageId:id},seller);
 const saved=f.db.records.get('teyzaSupportTickets/seller_seller1/messages/'+id);
 assert.equal(saved.senderUid,'seller1');
 assert.equal((await f.call('seller_support_thread',{},seller)).messages[0].text,saved.text);
 await rejects(f.call('seller_support_thread',{ticketId:'seller_seller1'},intruder),404);
 await rejects(f.call('ops_support_thread',{ticketId:'seller_seller1'},seller),403);
 await rejects(f.call('ops_support_reply',{ticketId:'seller_seller1',message:'See https://teyza.co.za/pay',messageId:'admin_link_1'}),422);
 await f.call('ops_support_reply',{ticketId:'seller_seller1',message:'Your seller review is complete. We can assist with your membership status.',messageId:'admin_msg_1'});
 const thread=await f.call('seller_support_thread',{},seller);
 assert.equal(thread.messages.length,2);
 assert.equal(thread.messages[1].sender,'admin');
 assert.equal(f.db.records.has('teyzaBilling/seller1'),false,'Support cannot create a billing record');
 assert.equal(f.db.records.get('teyzaSellerAccounts/seller1').approvalStatus,'approved');
 const adminThread=await f.call('ops_support_thread',{ticketId:'seller_seller1'});
 assert.equal(adminThread.messages.length,2);
});
test('Seller support messages are idempotent and cannot impersonate admins',async()=>{
 const f=setup(),seller={uid:'seller1',email_verified:true};
 await f.call('seller_support_open',{},seller);
 await f.call('seller_support_message',{message:'Hi team',messageId:'fixed_1'},seller);
 await f.call('seller_support_message',{message:'Hi team',messageId:'fixed_1'},seller);
 assert.equal((await f.call('seller_support_thread',{},seller)).messages.length,1);
 await rejects(f.call('seller_support_message',{message:'Changed message',messageId:'fixed_1'},seller),409);
 await rejects(f.call('ops_support_reply',{ticketId:'seller_seller1',message:'Unauthorised',messageId:'bad_1'},seller),403);
});

test('One business account API separates verified onboarding, free shop and Paystack membership',async()=>{
 const f=setup();
 f.db.records.set('teyzaSellerAccounts/seller1',{
   ...f.db.records.get('teyzaSellerAccounts/seller1'),
   approvalStatus:'approved',listingPlan:'free',address:'12 Main Road, Durban',phone:'+27712345678'});
 f.db.records.set('teyzaSellerOnboarding/seller1',{completedAt:now,verifiedPhone:'+27712345678'});
 f.db.records.set('teyzaMobileVerification/seller1',{ownerUid:'seller1',status:'approved',
   objectPath:'teyza-private/mobile-verification/seller1/selfie',expiresAt:now+86400000});
 f.db.records.set('teyzaPublicShops/seller1',{sellerUid:'seller1',status:'active',products:[]});
 const api=createOperations({db:f.db,clock:()=>now,rate:async()=>{},getAuthUser:async uid=>({
   uid,emailVerified:true,phoneNumber:'+27712345678',providerData:[{providerId:'phone',phoneNumber:'+27712345678'}]})});
 const detail=await api.execute(admin,'ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(detail.businessAccount.approvalStatus,'approved');
 assert.equal(detail.businessAccount.membershipStatus,'free');
 assert.equal(detail.businessAccount.manualIdentityReviewRequired,false);
 assert.equal(detail.businessAccount.verificationChecks.find(x=>x.id==='email').complete,true);
 assert.equal(detail.businessAccount.verificationChecks.find(x=>x.id==='phone').complete,true);
 assert.equal(detail.membershipPaid,false);
 assert.equal(f.db.records.has('teyzaBilling/seller1'),false);
});
test('Unapproved business remains a single pending verification, not an independent paid approval',async()=>{
 const f=setup();
 const response=await f.call('ops_seller_detail',{sellerUid:'seller2'});
 assert.equal(response.businessAccount.approvalStatus,'pending');
 assert.equal(response.businessAccount.manualIdentityReviewRequired,true);
 assert.equal(response.businessAccount.membershipStatus,'free');
 assert.equal(response.businessAccount.upgradeRequired,false);
 assert(response.businessAccount.missingRequirements.includes('identity'));
 assert.equal(response.membershipPaid,false);
});

test('Business directory Premium badge cannot be forged by archived manual paid records',async()=>{
 const f=setup(),account=f.db.records.get('teyzaSellerAccounts/seller1');
 f.db.records.set('teyzaSellerAccounts/seller1',{...account,listingPlan:'basic'});
 f.db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',status:'paid',paidUntil:now+86400000,
   paymentProvider:'manual_receipt',paymentEnvironment:'live'});
 let result=await f.call('ops_sellers');
 assert.equal(result.sellers.find(x=>x.sellerUid==='seller1').subscription,'free');
 f.db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',status:'paid',paidUntil:now+86400000,
   paymentProvider:'paystack',paymentEnvironment:'live'});
 result=await f.call('ops_sellers');
 assert.equal(result.sellers.find(x=>x.sellerUid==='seller1').subscription,'premium');
});

test('Admin directory coalesces same-email seller records only to exact Firebase Auth UID',async()=>{
 const f=setup();
 f.db.records.set('teyzaSellerAccounts/legacySeller',{uid:'legacySeller',category:'spaza',shopName:'Historical Shop',ownerEmail:'OWNER@example.test',approvalStatus:'approved'});
 f.db.records.set('teyzaSellerAccounts/currentSeller',{uid:'currentSeller',category:'spaza',shopName:'Current Shop',ownerEmail:'owner@example.test',approvalStatus:'pending'});
 const api=createOperations({db:f.db,clock:()=>now,rate:async()=>{},
   getAuthUserByEmail:async email=>{assert.equal(email,'owner@example.test');return {uid:'currentSeller'};}});
 const d=await api.execute(admin,'ops_sellers');
 assert.equal(d.sellers.filter(s=>s.ownerEmail.toLowerCase()==='owner@example.test').length,1);
 const seller=d.sellers.find(s=>s.ownerEmail.toLowerCase()==='owner@example.test');
 assert.equal(seller.sellerUid,'currentSeller');
 assert.equal(seller.approvalStatus,'pending');
});
test('Admin directory quarantines email collisions when Firestore UIDs do not match the actual Auth user',async()=>{
 const f=setup();
 for(const uid of ['legacySeller','otherSeller'])
   f.db.records.set('teyzaSellerAccounts/'+uid,{uid,category:'spaza',shopName:uid,ownerEmail:'owner@example.test',approvalStatus:uid==='legacySeller'?'approved':'pending'});
 const api=createOperations({db:f.db,clock:()=>now,rate:async()=>{},getAuthUserByEmail:async()=>({uid:'realAuthUid'})});
 const d=await api.execute(admin,'ops_sellers');
 const record=d.sellers.find(s=>s.ownerEmail==='owner@example.test');
 assert(record);
 assert.equal(record.accountConflict,true);
 assert.equal(record.sellerUid,'');
 assert.equal(record.subscription,'blocked');
 assert.equal(d.sellers.filter(s=>s.ownerEmail==='owner@example.test').length,1);
});
test('Lightweight profile does not fetch seller statements or payment history after a detail failure',async()=>{
 const f=setup();
 const original=f.db.collection.bind(f.db);
 f.db.collection=(path)=>{
   if(path.startsWith('teyzaBilling/seller1/entries')||path==='teyzaPaystackPayments')
     throw Error('Costly read must not happen in summary');
   return original(path);
 };
 const profile=await f.call('ops_seller_profile',{sellerUid:'seller1'});
 assert.equal(profile.partial,true);
 assert.equal(profile.seller.sellerUid,'seller1');
 assert.equal(profile.businessAccount.approvalStatus,'approved');
 assert.equal(profile.membershipPaid,false);
 assert.deepEqual(profile.payments,[]);
});

test('Admin full seller details safely validate a real current identity document',async()=>{
 const f=setup();
 const currentIdentity={ownerUid:'seller1',kind:'id',legalType:'individual',
  evidenceId:'real_uploaded_identity_1',
  objectPath:'teyza-private/mobile-verification/seller1/real_uploaded_identity_1.enc',
  expiresAt:now+86400000};
 f.db.records.set('teyzaSellerIdentity/seller1',currentIdentity);
 const before=structuredClone([...f.db.records]);
 const result=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 const check=result.businessAccount.verificationChecks.find(x=>x.id==='identity');
 assert.equal(check.complete,true,'Unexpired evidence should be recognized by the admin');
 assert.deepEqual([...f.db.records],before,'Opening admin detail must not change the seller or payments');
 const statement=await f.call('seller_billing_statement',{},{
   uid:'seller1',email_verified:true,auth_time:now/1000});
 assert.equal(statement.businessAccount.verificationChecks.find(x=>x.id==='identity').complete,true,
   'Seller billing statement uses the same safe identity read path');
});
test('Admin detail treats expired or misowned evidence as incomplete without a server exception',async()=>{
 const f=setup();
 for(const evidence of [
  {ownerUid:'seller1',objectPath:'teyza-private/mobile-verification/seller1/document.enc',expiresAt:now-1},
  {ownerUid:'another_user',objectPath:'teyza-private/mobile-verification/seller1/document.enc',expiresAt:now+86400000},
  {ownerUid:'seller1',objectPath:'other-location/document.enc',expiresAt:now+86400000}
 ]){
  f.db.records.set('teyzaSellerIdentity/seller1',evidence);
  const result=await f.call('ops_seller_detail',{sellerUid:'seller1'});
  assert.equal(result.businessAccount.verificationChecks.find(x=>x.id==='identity').complete,false);
 }
});

test('National admin map lists only fresh verified public Teyza shops and separates linked Google places',async()=>{
 const f=setup();
 const base={sellerUid:'seller1',name:'Township Grocer',shopCategory:'spaza',status:'active',approvalStatus:'approved',identityVerified:true,
   latitude:-29.85,longitude:31.02,coordinateSource:'google_places',coordinatesExpireAt:now+86400000,googlePlaceId:'ChIJapproved1234'};
 f.db.records.set('teyzaPublicShops/seller1',base);
 f.db.records.set('teyzaPublicShops/seller2',{...base,sellerUid:'seller2',name:'Old pending',approvalStatus:'pending'});
 f.db.records.set('teyzaPublicShops/seller3',{...base,sellerUid:'seller3',name:'Expired location',coordinatesExpireAt:now-1000});
 f.db.records.set('teyzaPublicShops/seller4',{...base,sellerUid:'seller4',name:'Not published',status:'pending_review'});
 let rows=await f.call('ops_map_shops');
 assert.equal(rows.scope,'published_teyza_shops_only');
 assert.equal(rows.googlePlacesCensus,false);
 assert.equal(rows.shops.length,1);
 assert.equal(rows.shops[0].source,'google_and_teyza');
 assert.equal(rows.shops[0].googlePlaceId,'ChIJapproved1234');
 assert.equal(rows.shops[0].ownerEmail,undefined);
 await rejects(f.call('ops_map_shops',{}, {uid:'seller1',email_verified:true}),403);
});
test('WhatsApp admin status never exposes access tokens or recipient contact information',async()=>{
 const f=setup();
 f.db.records.set('teyzaWhatsAppApprovalOutbox/abc',{status:'queued',sellerUid:'seller1',phone:'+27712345678'});
 const d=await f.call('ops_whatsapp_status');
 assert.equal(d.counts.queued,1);
 assert.equal(d.tokenVerified,false);
 assert.equal(JSON.stringify(d).includes('+27712345678'),false);
 await rejects(f.call('ops_whatsapp_status',{}, {uid:'seller1',email_verified:true}),403);
});

test('WhatsApp webhook admin diagnostics return only aggregate signed event categories',async()=>{
 const f=setup();
 f.db.records.set('teyzaWhatsAppWebhookEvents/id-1',{kind:'inbound',eventType:'text',sender:'SHOULD_NOT_SHOW'});
 f.db.records.set('teyzaWhatsAppWebhookEvents/id-2',{kind:'status',eventType:'delivered',phone:'SHOULD_NOT_SHOW'});
 const result=await f.call('ops_whatsapp_status');
 assert.equal(result.webhookEvents.counts.inbound,1);
 assert.equal(result.webhookEvents.counts.delivered,1);
 assert(!JSON.stringify(result).includes('SHOULD_NOT_SHOW'));
 await rejects(f.call('ops_whatsapp_status',{}, {uid:'seller1',email_verified:true}),403);
});

test('WhatsApp diagnostics validate real phone ID and API version formats without claiming a running worker',async(t)=>{
 const names=['TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED','TEYZA_WHATSAPP_PHONE_NUMBER_ID','TEYZA_WHATSAPP_API_VERSION'];
 const saved=names.map(name=>[name,process.env[name]]);
 t.after(()=>{for(const [name,value] of saved){if(value===undefined)delete process.env[name];else process.env[name]=value;}});
 process.env.TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED='1';
 process.env.TEYZA_WHATSAPP_PHONE_NUMBER_ID='123456789012345';
 process.env.TEYZA_WHATSAPP_API_VERSION='v23.0';
 const f=setup(),result=await f.call('ops_whatsapp_status');
 assert.equal(result.fields.phoneNumberId,true);assert.equal(result.fields.apiVersion,true);
 assert.equal(result.enabled,true);assert.equal(result.configurationScope,'api_instance');
 assert.equal(result.workerRunningVerified,false);assert.equal(result.tokenVerified,false);
 assert(!JSON.stringify(result).includes('123456789012345'));
 for(const [phone,version] of [['abc','23.0'],['\\ddd','v\\ddd\\x\\ddd'],['1234x','v23x0']]){
  process.env.TEYZA_WHATSAPP_PHONE_NUMBER_ID=phone;process.env.TEYZA_WHATSAPP_API_VERSION=version;
  const invalid=await f.call('ops_whatsapp_status');
  assert.equal(invalid.fields.phoneNumberId,false);assert.equal(invalid.fields.apiVersion,false);
 }
});

test('WhatsApp sample separates signed welcome receipts from API acceptance and does not count sentinel rows',async()=>{
 const f=setup(),source='meta_whatsapp_signed_webhook';
 const entries=[
  {status:'accepted',deliveryStatus:'delivered',deliveryStatusSource:source},
  {status:'accepted',deliveryStatus:'read',deliveryStatusSource:source},
  {status:'accepted',deliveryStatus:'failed',deliveryStatusSource:source},
  {status:'accepted',deliveryStatus:'sent',deliveryStatusSource:source},
  {status:'accepted'},
  {status:'accepted',deliveryStatus:'delivered',deliveryStatusSource:'unverified'},
  {status:'needs_review',reason:'delivery_uncertain'},
  {status:'queued'}
 ];
 for(let n=0;n<100;n++)f.db.records.set('teyzaWhatsAppApprovalOutbox/m'+String(n).padStart(3,'0'),entries[n%entries.length]);
 f.db.records.set('teyzaWhatsAppApprovalOutbox/zz_sentinel',{status:'configuration_required'});
 for(let n=0;n<100;n++)f.db.records.set('teyzaWhatsAppWebhookEvents/m'+String(n).padStart(3,'0'),{kind:'status',eventType:'sent'});
 f.db.records.set('teyzaWhatsAppWebhookEvents/zz_sentinel',{kind:'status',eventType:'delivered'});
 const before=structuredClone([...f.db.records]),result=await f.call('ops_whatsapp_status');
 assert.equal(result.sampled,100);assert.equal(result.sampleLimit,100);assert.equal(result.sampleLimited,true);
 assert.equal(result.sampleOrder,'document_id');assert.equal(result.counts.configuration_required,undefined);
 assert.deepEqual(result.deliveryCounts,{sent:13,delivered:13,read:13,failed:13,awaiting_receipt:24,uncertain:12,not_sent:12});
 assert.equal(result.webhookEvents.sampled,100);assert.equal(result.webhookEvents.sampleLimited,true);
 assert.deepEqual(result.webhookEvents.counts,{sent:100});
 assert.deepEqual([...f.db.records],before,'Diagnostics must not resend messages or mutate records');
});

test('Current seller welcome reports acceptance separately from matched delivery and current consent',async()=>{
 const f=setup(),phone='+27712345678',source='meta_whatsapp_signed_webhook';
 f.db.records.get('teyzaSellerAccounts/seller1').phone=phone;
 f.db.records.set('teyzaMobileVerification/seller1',{ownerUid:'seller1',submissionId:'current1',status:'approved'});
 f.db.records.set('teyzaWhatsAppPreferences/seller1',{ownerUid:'seller1',phone,optedIn:true});
 f.db.records.set('teyzaWhatsAppApprovalOutbox/current1',{sellerUid:'seller1',submissionId:'current1',status:'accepted',
  providerMessageId:'wamid.PRIVATE',acceptedAt:now-1000,createdAt:now-2000});
 let result=await f.call('ops_seller_detail',{sellerUid:'seller1'}),welcome=result.whatsappWelcome;
 assert.equal(welcome.currentConsent,'opted_in');assert.equal(welcome.queueStatus,'accepted');
 assert.equal(welcome.deliveryStatus,'awaiting_receipt');assert.equal(welcome.deliveryConfirmed,false);
 assert(!JSON.stringify(welcome).includes(phone));assert(!JSON.stringify(result).includes('wamid.PRIVATE'));
 f.db.records.get('teyzaWhatsAppApprovalOutbox/current1').deliveryStatus='delivered';
 welcome=(await f.call('ops_seller_detail',{sellerUid:'seller1'})).whatsappWelcome;
 assert.equal(welcome.deliveryConfirmed,false,'An unsigned label is not delivery evidence');
 Object.assign(f.db.records.get('teyzaWhatsAppApprovalOutbox/current1'),{
  deliveryStatus:'sent',deliveryStatusSource:source,deliveryStatusAt:now-500});
 welcome=(await f.call('ops_seller_detail',{sellerUid:'seller1'})).whatsappWelcome;
 assert.equal(welcome.deliveryStatus,'sent');assert.equal(welcome.deliveryConfirmed,false);
 Object.assign(f.db.records.get('teyzaWhatsAppApprovalOutbox/current1'),{deliveryStatus:'read',deliveryStatusAt:now});
 f.db.records.get('teyzaWhatsAppPreferences/seller1').optedIn=false;
 const before=structuredClone([...f.db.records]);
 welcome=(await f.call('ops_seller_detail',{sellerUid:'seller1'})).whatsappWelcome;
 assert.equal(welcome.currentConsent,'opted_out');assert.equal(welcome.deliveryStatus,'read');
 assert.equal(welcome.deliveryConfirmed,true);assert.equal(welcome.receiptAt,now);
 assert.deepEqual([...f.db.records],before);
 const own=await f.call('seller_billing_statement',{sellerUid:'seller2'},{uid:'seller1',email_verified:true});
 assert.equal(own.whatsappWelcome,undefined,'Admin diagnostics are not added to the seller billing endpoint');
});

test('Welcome diagnostics reject wrong seller/submission records and expose only safe failure codes',async()=>{
 const f=setup();
 f.db.records.set('teyzaMobileVerification/seller1',{ownerUid:'seller1',submissionId:'current1',status:'approved'});
 f.db.records.set('teyzaWhatsAppPreferences/seller1',{ownerUid:'seller2',optedIn:true,phone:'PRIVATE'});
 f.db.records.set('teyzaWhatsAppApprovalOutbox/current1',{sellerUid:'seller2',submissionId:'current1',status:'accepted',
  deliveryStatus:'read',deliveryStatusSource:'meta_whatsapp_signed_webhook',providerMessageId:'PRIVATE'});
 let welcome=(await f.call('ops_seller_detail',{sellerUid:'seller1'})).whatsappWelcome;
 assert.equal(welcome.currentConsent,'not_recorded');assert.equal(welcome.queueStatus,'unavailable');assert.equal(welcome.deliveryConfirmed,false);
 f.db.records.set('teyzaWhatsAppApprovalOutbox/current1',{sellerUid:'seller1',submissionId:'old_submission',status:'accepted',
  deliveryStatus:'read',deliveryStatusSource:'meta_whatsapp_signed_webhook'});
 welcome=(await f.call('ops_seller_detail',{sellerUid:'seller1'})).whatsappWelcome;
 assert.equal(welcome.queueStatus,'unavailable');
 f.db.records.set('teyzaWhatsAppApprovalOutbox/current1',{sellerUid:'seller1',submissionId:'current1',status:'accepted',
  deliveryStatus:'failed',deliveryStatusSource:'meta_whatsapp_signed_webhook',deliveryErrorCode:131026,providerErrorCode:'PRIVATE',
  reason:'PRIVATE',providerMessageId:'PRIVATE',deliveryStatusAt:now});
 welcome=(await f.call('ops_seller_detail',{sellerUid:'seller1'})).whatsappWelcome;
 assert.equal(welcome.deliveryStatus,'failed');assert.equal(welcome.deliveryConfirmed,false);
 assert.equal(welcome.deliveryErrorCode,131026);assert.equal(welcome.providerErrorCode,null);assert.equal(welcome.reason,null);
 assert(!JSON.stringify(welcome).includes('PRIVATE'));
 f.db.records.get('teyzaMobileVerification/seller1').submissionId='../current1';
 welcome=(await f.call('ops_seller_detail',{sellerUid:'seller1'})).whatsappWelcome;
 assert.equal(welcome.queueStatus,'not_queued');
 for(const actor of [{uid:'seller1',email_verified:true},{...admin,auth_time:now/1000-301},
  {uid:'agent1',teyzaSupportAgent:true,email_verified:true,auth_time:now/1000}]){
  await rejects(f.call('ops_seller_detail',{sellerUid:'seller1'},actor),actor.teyzaAdmin?401:403);
 }
});

test('Modern registration checklist does not reuse a stale completion timestamp',async()=>{
 const f=setup(),phone='+27712345678';
 f.db.records.get('teyzaSellerAccounts/seller1').phone=phone;
 f.db.records.set('teyzaSellerOnboarding/seller1',{requiredVersion:2,legalType:'individual',
  completedAt:now-2000,identityEvidenceId:'old_id',selfieSubmissionId:'old_selfie',verifiedPhone:phone,sellingStatus:'not_started'});
 const detail=await f.call('ops_seller_detail',{sellerUid:'seller1'});
 assert.equal(detail.businessAccount.verificationChecks.find(x=>x.id==='onboarding').complete,false);
 assert.equal(detail.businessAccount.registrationProgress.submitted,false);
 assert(detail.businessAccount.missingRequirements.includes('onboarding'));
});


test('Support agents see only active WhatsApp handoffs and can answer in the seller thread',async()=>{
 const f=setup(),agent={uid:'support_1',teyzaSupportAgent:true,email_verified:true,auth_time:now/1000};
 f.db.records.set('teyzaSupportTickets/seller_seller1',{
  ownerUid:'seller1',shopName:'Test Shop',source:'seller_admin_chat',status:'open',
  whatsAppActive:true,whatsAppLastInboundAt:now-10000,whatsAppHandoffAt:now-20000,
  lastMessage:'Please help me',lastMessageAt:now-10000,updatedAt:now-10000,
  messageCount:1,adminUnread:1,revision:0
 });
 f.db.records.set('teyzaSupportTickets/seller_seller2',{
  ownerUid:'seller2',shopName:'Another Shop',source:'seller_admin_chat',status:'open',
  whatsAppActive:false,lastMessage:'Private non-WhatsApp ticket',messageCount:0
 });
 const data=await f.call('ops_whatsapp_support_inbox',{},agent);
 assert.equal(data.tickets.length,1);
 assert.equal(data.tickets[0].shopName,'Test Shop');
 assert.equal(data.tickets[0].adminUnread,1);
 assert(!JSON.stringify(data).includes('Private non-WhatsApp ticket'));
 const thread=await f.call('ops_support_thread',{ticketId:'seller_seller1'},agent);
 assert.equal(thread.ticket.shopName,'Test Shop');
 await f.call('ops_support_reply',{ticketId:'seller_seller1',
  message:'Thanks for contacting Teyza. How can I help?',messageId:'agent_reply_1'},agent);
 const reply=f.db.records.get('teyzaSupportTickets/seller_seller1/messages/agent_reply_1');
 assert.equal(reply.sender,'admin');
 assert.equal(reply.senderUid,'support_1');
 await rejects(f.call('ops_support_thread',{ticketId:'seller_seller2'},agent),404);
 await rejects(f.call('ops_support_reply',{ticketId:'seller_seller2',message:'No',messageId:'blocked_1'},agent),404);
});
test('Support agent claim never enables seller approvals, payments, finance or user management',async()=>{
 const f=setup(),agent={uid:'support_1',teyzaSupportAgent:true,email_verified:true,auth_time:now/1000};
 for(const [action,data] of [
  ['ops_sellers',{}],['ops_users',{}],['ops_finance_queue',{}],
  ['ops_payment',{sellerUid:'seller1',amountCents:9900}],
  ['ops_seller_detail',{sellerUid:'seller1'}],['ops_support_list',{}],
  ['ops_whatsapp_status',{}]
 ])await rejects(f.call(action,data,agent),403);
 await rejects(f.call('ops_whatsapp_support_inbox',{},{
  ...agent,teyzaSupportAgent:false}),403);
 await rejects(f.call('ops_whatsapp_support_inbox',{},{
  ...agent,email_verified:false}),403);
 await rejects(f.call('ops_whatsapp_support_inbox',{},{
  ...agent,auth_time:now/1000-301}),401);
});

test('Business acquisition is recent verified Admin only, idempotent by business location, consent first, and never writes seller approvals',async()=>{
 const f=setup(),newBusiness={name:'Test Shop',city:'Durban',area:'Umlazi',address:'Synthetic 1',category:'spaza',phone:'0712345678',email:'shop@example.test',source:'owner_inquiry',sourceReference:'Synthetic callback form',authorisedSource:true};
 const create=()=>f.call('ops_acquisition_create',newBusiness);
 for(const actor of [{uid:'seller1',email_verified:true},{uid:'support1',teyzaSupportAgent:true,email_verified:true,auth_time:now/1000},{...admin,auth_time:now/1000-301}])
  await rejects(f.call('ops_acquisition_list',{},actor),actor.teyzaAdmin?401:403);
 await rejects(f.call('ops_acquisition_create',{...newBusiness,authorisedSource:false}),422);
 const {prospect:p}=await create();assert.equal(p.stage,'identified');assert.equal(p.phone,'+27712345678');assert.equal(p.assignedTo,admin.uid);
 await rejects(create(),409);
 const event=(p,data)=>f.call('ops_acquisition_event',{id:p.id,revision:p.revision,confirmed:true,note:'Synthetic event',...data});
 await rejects(event(p,{type:'contact',channel:'whatsapp'}),409);
 await rejects(event(p,{type:'permission',channel:'whatsapp',ownerOptIn:false}),422);
 const a=(await event(p,{type:'permission',channel:'whatsapp',ownerOptIn:true})).prospect;
 await rejects(event(p,{type:'progress',stage:'interested'}),409);
 await rejects(event(a,{type:'contact',channel:'email'}),409);
 const b=(await event(a,{type:'contact',channel:'whatsapp'})).prospect;
 const c=(await event(b,{type:'progress',stage:'registration_started',nextFollowUpAt:now+86400000})).prospect;
 const original=structuredClone(f.db.records.get('teyzaSellerAccounts/seller1'));
 await rejects(f.call('ops_acquisition_link',{id:c.id,revision:c.revision,sellerUid:'seller2',ownerConfirmed:true}),409);
 const linked=(await f.call('ops_acquisition_link',{id:c.id,revision:c.revision,sellerUid:'seller1',ownerConfirmed:true})).prospect;
 assert.equal(linked.seller.status,'approved');assert.equal(linked.seller.listed,false);
 assert.deepEqual(f.db.records.get('teyzaSellerAccounts/seller1'),original);
 const dup=(await f.call('ops_acquisition_create',{...newBusiness,address:'Synthetic 2'})).prospect;
 await rejects(f.call('ops_acquisition_link',{id:dup.id,revision:dup.revision,sellerUid:'seller1',ownerConfirmed:true}),409);
 const blocked=(await event(linked,{type:'opt_out'})).prospect;
 assert.equal(blocked.optedOut,true);assert.equal(blocked.nextFollowUpAt,null);
 await rejects(event(blocked,{type:'permission',channel:'whatsapp',ownerOptIn:true}),409);
 await rejects(event(dup,{type:'permission',channel:'whatsapp',ownerOptIn:true}),409);
 const listing=await f.call('ops_acquisition_list');assert.equal(listing.prospects.length,2);assert(listing.prospects.every(r=>r.optedOut));
 const detail=await f.call('ops_acquisition_detail',{id:p.id});assert(detail.events.some(x=>x.type==='opt_out'));assert(detail.events.some(x=>x.type==='seller_linked'));
 assert.equal(f.db.records.has('teyzaBilling/seller1'),false);
});

test('Invitation and registration welcome logs distinguish staff-confirmed sent records, consent, and owner support',async()=>{
 const f=setup();
 f.db.records.set('teyzaSellerAccounts/seller1',{uid:'seller1',shopName:'Test Shop',category:'spaza',approvalStatus:'pending',ownerEmail:'shop@example.test'});
 const input={name:'Test Shop',city:'Durban',area:'Umlazi',address:'Synthetic Road',category:'spaza',phone:'0712345678',email:'shop@example.test',source:'owner_inquiry',sourceReference:'Owner contacted us',authorisedSource:true};
 let p=(await f.call('ops_acquisition_create',input)).prospect;
 const evt=(v,extra)=>f.call('ops_acquisition_event',{id:v.id,revision:v.revision,note:'Synthetic evidence',confirmed:true,...extra});
 const mail={type:'email_sent',sentConfirmed:true,sentAt:now-1000,reference:'Synthetic Zoho Sent message'};
 await rejects(evt(p,{...mail,kind:'invitation'}),409);
 await rejects(evt(p,{...mail,kind:'welcome'}),409);
 p=(await evt(p,{type:'permission',channel:'email',ownerOptIn:true})).prospect;
 await rejects(evt(p,{...mail,kind:'invitation',sentConfirmed:false}),422);
 await rejects(evt(p,{...mail,kind:'invitation',sentAt:now+1}),422);
 p=(await evt(p,{...mail,kind:'invitation'})).prospect;
 assert.equal(p.emailHistory.invitation.status,'staff_confirmed_in_zoho_sent');
 assert.equal(p.emailHistory.invitation.sentAt,now-1000);
 await rejects(evt(p,{...mail,kind:'invitation'}),409);
 p=(await f.call('ops_acquisition_link',{id:p.id,revision:p.revision,sellerUid:'seller1',ownerConfirmed:true})).prospect;
 assert.equal(p.seller.welcomeEmailEligible,true);
 const seller=f.db.records.get('teyzaSellerAccounts/seller1');
 f.db.records.set('teyzaSellerAccounts/seller1',{...seller,ownerEmail:'changed@example.test'});
 assert.equal((await f.call('ops_acquisition_detail',{id:p.id})).prospect.seller.welcomeEmailEligible,false);
 await rejects(evt(p,{...mail,kind:'welcome'}),409);
 f.db.records.set('teyzaSellerAccounts/seller1',seller);
 p=(await evt(p,{type:'opt_out'})).prospect;
 p=(await evt(p,{...mail,kind:'welcome'})).prospect;
 assert(p.emailHistory.welcome);
 p=(await evt(p,{type:'help_requested',channel:'email'})).prospect;
 assert.equal(p.help.state,'open');
 p=(await evt(p,{type:'help_replied'})).prospect;
 assert.equal(p.help.state,'waiting_for_owner');
 p=(await evt(p,{type:'help_resolved'})).prospect;
 assert.equal(p.help.state,'resolved');
 f.db.records.set('teyzaSupportTickets/t1',{ownerUid:'seller1',subject:'Synthetic owner question',status:'open',source:'seller_admin_chat'});
 f.db.records.set('teyzaSupportTickets/t2',{ownerUid:'seller2',subject:'Another business',status:'open'});
 const detail=await f.call('ops_acquisition_detail',{id:p.id});
 assert.equal(detail.support.length,1);assert.equal(detail.support[0].id,'t1');
 assert(detail.events.some(e=>e.type==='email_sent'&&e.kind==='welcome'));
 assert.equal(f.db.records.get('teyzaSellerAccounts/seller1').approvalStatus,'pending');
});

test('Business direct email is gated, queued once, rechecked, and accepted only from provider response',async()=>{
 const f=setup(),{CONTROL,collections,createWorker}=require('./business-communications');
 const create={name:'Test Shop',city:'Durban',area:'Umlazi',address:'Synthetic direct send',category:'spaza',email:'shop@example.test',phone:'0712345678',source:'owner_inquiry',sourceReference:'Synthetic owner permission',authorisedSource:true};
 let p=(await f.call('ops_acquisition_create',create)).prospect;
 const send=(v,extra={})=>f.call('ops_acquisition_send',{id:v.id,revision:v.revision,channel:'email',kind:'invitation',confirmed:true,...extra});
 await rejects(send(p),409);
 f.db.records.set(CONTROL,{emailEnabled:true});
 await rejects(send(p),409);
 p=(await f.call('ops_acquisition_event',{id:p.id,revision:p.revision,type:'permission',channel:'email',confirmed:true,ownerOptIn:true,note:'Synthetic opt-in'})).prospect;
 await rejects(send(p,{confirmed:false}),422);
 assert.equal((await send(p)).message.status,'queued');
 p=(await f.call('ops_acquisition_detail',{id:p.id})).prospect;
 assert.equal(p.outbound.email_invitation.status,'queued');
 await rejects(send(p),409);
 const job=[...f.db.records.keys()].find(k=>k.startsWith(collections.email+'/')).split('/').at(-1);
 let sends=0;
 const worker=createWorker({db:f.db,channel:'email',clock:()=>now,send:async d=>{sends++;assert.equal(d.recipient,'shop@example.test');assert(d.body.includes('personally invite Test Shop'));return '123456789';}});
 await worker.process(job);await worker.process(job);assert.equal(sends,1);
 p=(await f.call('ops_acquisition_detail',{id:p.id})).prospect;
 assert.equal(p.outbound.email_invitation.status,'accepted');assert.equal(p.outbound.email_invitation.providerId,'123456789');
 await rejects(f.call('ops_acquisition_send',{id:p.id,revision:p.revision,channel:'email',kind:'invitation',confirmed:true},{uid:'seller1',email_verified:true}),403);
});
test('Queued direct sends cancel after opt-out; uncertain provider response is never retried',async()=>{
 const {CONTROL,collections,createWorker}=require('./business-communications');
 for(const optOut of [true,false]){
  const f=setup();f.db.records.set(CONTROL,{emailEnabled:true});
  let p=(await f.call('ops_acquisition_create',{name:'Synthetic Shop',city:'Durban',area:'Umlazi',address:'Synthetic test',category:'spaza',email:'shop@example.test',source:'owner_inquiry',sourceReference:'Owner enquiry',authorisedSource:true})).prospect;
  const evt=(p,extra)=>f.call('ops_acquisition_event',{id:p.id,revision:p.revision,confirmed:true,note:'Synthetic record',...extra});
  p=(await evt(p,{type:'permission',channel:'email',ownerOptIn:true})).prospect;
  await f.call('ops_acquisition_send',{id:p.id,revision:p.revision,channel:'email',kind:'invitation',confirmed:true});
  p=(await f.call('ops_acquisition_detail',{id:p.id})).prospect;
  if(optOut)p=(await evt(p,{type:'opt_out'})).prospect;
  const id=[...f.db.records.keys()].find(k=>k.startsWith(collections.email+'/')).split('/').at(-1);
  let count=0;const w=createWorker({db:f.db,channel:'email',clock:()=>now,send:async()=>{count++;throw Error('Synthetic timeout');}});
  await w.process(id);await w.process(id);assert.equal(count,optOut?0:1);
  assert.equal((await f.call('ops_acquisition_detail',{id:p.id})).prospect.outbound.email_invitation.status,optOut?'cancelled':'review_required');
 }
});
test('WhatsApp direct sends require exact approved template configuration and channel consent',async()=>{
 const f=setup(),{CONTROL,collections,createWorker}=require('./business-communications'),{whatsappBodies}=require('./business-message-templates');
 let p=(await f.call('ops_acquisition_create',{name:'Synthetic Shop',city:'Johannesburg',area:'Soweto',address:'Synthetic test',category:'spaza',phone:'0712345678',source:'owner_inquiry',sourceReference:'Owner enquiry',authorisedSource:true})).prospect;
 p=(await f.call('ops_acquisition_event',{id:p.id,revision:p.revision,type:'permission',channel:'whatsapp',confirmed:true,ownerOptIn:true,note:'Synthetic consent'})).prospect;
 const send=()=>f.call('ops_acquisition_send',{id:p.id,revision:p.revision,channel:'whatsapp',kind:'invitation',confirmed:true});
 const cfg={whatsappEnabled:true,whatsappPhoneNumberId:'123456789',whatsappApiVersion:'v26.0',whatsappTemplates:{invitation:{approved:true,name:'synthetic_invitation',language:'en',body:'wrong'}}};
 f.db.records.set(CONTROL,cfg);await rejects(send(),409);
 cfg.whatsappTemplates.invitation.body=whatsappBodies.invitation;f.db.records.set(CONTROL,cfg);await send();
 const id=[...f.db.records.keys()].find(k=>k.startsWith(collections.whatsapp+'/')).split('/').at(-1);
 let count=0;await createWorker({db:f.db,channel:'whatsapp',clock:()=>now,send:async d=>{count++;assert.equal(d.recipient,'+27712345678');assert.equal(d.businessName,'Synthetic Shop');return 'wamid.synthetic';}}).process(id);
 assert.equal(count,1);assert.equal((await f.call('ops_acquisition_detail',{id:p.id})).prospect.outbound.whatsapp_invitation.status,'accepted');
});

test('Create prospect may record actual initial owner permissions, never infers consent from an address',async()=>{
 const f=setup(),data={name:'Initial Consent Shop',city:'Durban',area:'Umlazi',address:'Synthetic',category:'spaza',email:'shop@example.test',phone:'0712345678',source:'owner_inquiry',sourceReference:'Owner inquiry',authorisedSource:true};
 await rejects(f.call('ops_acquisition_create',{...data,initialConsentChannels:['email'],initialConsentNote:'Owner explicit consent'}),422);
 await rejects(f.call('ops_acquisition_create',{...data,initialConsentChannels:['phone'],initialConsentConfirmed:true,initialConsentNote:'Owner explicit consent'}),422);
 const p=(await f.call('ops_acquisition_create',{...data,initialConsentChannels:['email','whatsapp'],initialConsentConfirmed:true,initialConsentNote:'Owner requested both marketing channels'})).prospect;
 assert.equal(p.permissions.email.granted,true);assert.equal(p.permissions.whatsapp.granted,true);
 const d=await f.call('ops_acquisition_detail',{id:p.id});assert.equal(d.events.filter(e=>e.type==='permission').length,2);
});


test('Acquisition stores independently verified website and place reference, prevents duplicate Place IDs and adds only missing contacts',async()=>{
 const f=setup(),data={name:'Synthetic Place Shop',city:'Durban',area:'Umlazi',address:'Independent Road',category:'spaza',source:'owner_provided',sourceReference:'Owner confirmation',authorisedSource:true,googlePlaceId:'SyntheticPlace1234',website:'https://example.test/contact'};
 await rejects(f.call('ops_acquisition_create',data),422);
 await rejects(f.call('ops_acquisition_create',{...data,independentSourceConfirmed:true,website:'javascript:alert(1)'}),422);
 let p=(await f.call('ops_acquisition_create',{...data,independentSourceConfirmed:true})).prospect;
 assert.equal(p.website,'https://example.test/contact');assert.equal(p.googlePlaceId,'SyntheticPlace1234');assert.deepEqual(p.permissions,{});
 assert.deepEqual((await f.call('ops_acquisition_place_matches',{placeIds:['SyntheticPlace1234','SyntheticPlace5678']})).matches,[{placeId:'SyntheticPlace1234',id:p.id}]);
 await rejects(f.call('ops_acquisition_create',{...data,name:'Different Name',independentSourceConfirmed:true}),409);
 await rejects(f.call('ops_acquisition_place_matches',{placeIds:['invalid!']}),422);
 const evt=(v,extra)=>f.call('ops_acquisition_event',{id:v.id,revision:v.revision,type:'contact_update',confirmed:true,note:'Independent owner source',authorisedSource:true,...extra});
 await rejects(evt(p,{email:'owner@example.test',authorisedSource:false}),422);
 p=(await evt(p,{email:'owner@example.test',phone:'0712345678'})).prospect;
 assert.equal(p.email,'owner@example.test');assert.equal(p.phone,'+27712345678');assert.deepEqual(p.permissions,{});
 await rejects(evt(p,{email:'different@example.test'}),409);
 const detail=await f.call('ops_acquisition_detail',{id:p.id});assert(detail.events.some(e=>e.type==='contact_update'));
 const blocked=(await f.call('ops_acquisition_event',{id:p.id,revision:p.revision,type:'opt_out',confirmed:true,note:'Synthetic opt out'})).prospect;
 await rejects(evt(blocked,{email:'other@example.test'}),409);
});

test('National prospect intake, missing-contact routing, WhatsApp-only and evidence-based conversion',async()=>{
 const f=setup(),base={name:'Synthetic National Shop',city:'Polokwane',province:'Limpopo',municipality:'Polokwane',area:'Seshego',address:'Synthetic address',category:'retail',source:'owner_inquiry',sourceReference:'Owner enquiry',authorisedSource:true,geographyConfirmed:true};
 await rejects(f.call('ops_acquisition_create',{...base,geographyConfirmed:false}),422);
 await rejects(f.call('ops_acquisition_create',{...base,province:'Invalid'}),422);
 await rejects(f.call('ops_acquisition_create',{...base,phoneKind:'whatsapp_only'}),422);
 let p=(await f.call('ops_acquisition_create',base)).prospect;
 assert.equal(p.province,'Limpopo');assert.equal(p.municipality,'Polokwane');assert.equal(p.geographyNeedsReview,true);assert.equal(p.geographySource,'provisional');
 assert.equal(p.contactQueue,'field_visit');assert.match(p.contactNote,/No phone number or email/);
 const evt=(p,extra)=>f.call('ops_acquisition_event',{id:p.id,revision:p.revision,confirmed:true,note:'Synthetic owner evidence',...extra});
 p=(await evt(p,{type:'contact_update',phone:'0712345678',phoneKind:'whatsapp_only',authorisedSource:true})).prospect;
 assert.equal(p.phone,'+27712345678');assert.equal(p.phoneKind,'whatsapp_only');assert.equal(p.contactQueue,'contact_details_available');assert.match(p.contactNote,/WhatsApp only/);
 await rejects(evt(p,{type:'permission',channel:'phone',ownerOptIn:true}),422);
 await rejects(evt(p,{type:'contact',channel:'whatsapp'}),409);
 p=(await evt(p,{type:'permission',channel:'whatsapp',ownerOptIn:true})).prospect;
 p=(await evt(p,{type:'contact',channel:'whatsapp'})).prospect;
 assert.equal(p.contactedAt,now);assert.equal(p.lastWhatsAppContactAt,now);
 p=(await evt(p,{type:'response',response:'interested'})).prospect;assert.equal(p.response,'interested');
 await rejects(evt(p,{type:'app_download',ownerConfirmedDownload:false}),422);
 p=(await evt(p,{type:'app_download',ownerConfirmedDownload:true})).prospect;
 assert.equal(p.downloadConfirmedAt,now);assert.equal(p.seller,null);
 await rejects(evt(p,{type:'commercial_interest',interest:'both'}),409);
 assert.equal(f.db.records.has('teyzaBilling/seller1'),false);
});
test('Legacy pilot records retain identity and can confirm missing geography; all nine provinces accepted',async()=>{
 const f=setup(),base={name:'Synthetic shop',city:'Durban',area:'Umlazi',address:'Legacy synthetic',category:'spaza',source:'owner_inquiry',sourceReference:'Owner enquiry',authorisedSource:true};
 let p=(await f.call('ops_acquisition_create',base)).prospect;
 assert.equal(p.province,'KwaZulu-Natal');assert.equal(p.geographyNeedsReview,true);const id=p.id;
 p=(await f.call('ops_acquisition_event',{id:p.id,revision:p.revision,type:'geography_update',confirmed:true,note:'Confirmed by owner',province:'KwaZulu-Natal',municipality:'eThekwini',geographyConfirmed:true})).prospect;
 assert.equal(p.id,id);assert.equal(p.geographyNeedsReview,true);assert.equal(p.municipality,'eThekwini');
 for(const province of ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape']){
  const n=(await f.call('ops_acquisition_create',{...base,city:'Synthetic '+province,area:'Test area',address:'Synthetic '+province,province,municipality:'Test municipality',geographyConfirmed:true})).prospect;
  assert.equal(n.province,province);assert.equal(n.geographyNeedsReview,true);
 }
});

test('Official allocation derives source codes on the server and preserves legacy IDs and events',async()=>{
 const f=setup(),G=require('./acquisition-geography'),{createAcquisition}=require('./business-acquisition');
 const official={localityId:'ETH:123456789',province:'KwaZulu-Natal',municipality:'eThekwini',municipalityCode:'ETH',township:'KwaMashu',townshipCode:'123456789',geographySource:G.SOURCE,geographySourceVintage:G.VINTAGE};
 const api=createAcquisition({db:f.db,clock:()=>now,geographyLookup:{resolve:async id=>{assert.equal(id,official.localityId);return official;},search:async()=>({localities:[official]})}});
 const input={name:'Synthetic Shop',city:'Durban',area:'Kwa Mashu',address:'Synthetic 1',category:'spaza',source:'owner_inquiry',sourceReference:'Owner',authorisedSource:true};
 const p=(await api.execute(admin,'ops_acquisition_create',input)).prospect;
 await rejects(api.execute(admin,'ops_acquisition_create',{...input,city:'eThekwini',area:'KwaMashu',province:'KwaZulu-Natal',municipality:'eThekwini',localityId:official.localityId,geographyConfirmed:true}),409);
 const q=(await api.execute(admin,'ops_acquisition_event',{id:p.id,revision:p.revision,type:'geography_update',confirmed:true,note:'Official reference checked',province:'KwaZulu-Natal',municipality:'Untrusted client label',localityId:official.localityId,geographyConfirmed:true})).prospect;
 assert.equal(q.id,p.id);assert.equal(q.area,'Kwa Mashu');assert.equal(q.township,'KwaMashu');assert.equal(q.municipality,'eThekwini');assert.equal(q.localityId,official.localityId);assert.equal(q.geographyNeedsReview,false);
 const detail=await api.execute(admin,'ops_acquisition_detail',{id:p.id});
 assert(detail.events.some(e=>e.type==='created'));assert(detail.events.some(e=>e.type==='geography_update'));
});

test('National report counts every snapshot page, filters on server, and reconciles old contacts outside recent history',async()=>{
 const f=setup(),R=require('./acquisition-report'),id='legacy1';
 const base={name:'Historic Spaza',city:'Durban',area:'Umlazi',address:'Legacy',category:'spaza',phone:'+27712345678',email:'',stage:'identified',permissions:{whatsapp:{granted:true}},revision:0};
 f.db.records.set('teyzaBusinessProspects/'+id,base);
 f.db.records.set('teyzaBusinessProspects/'+id+'/events/old-contact',{type:'contact',channel:'whatsapp',createdAt:now-1000000});
 for(let i=0;i<35;i++)f.db.records.set('teyzaBusinessProspects/'+id+'/events/new-'+i,{type:'permission',channel:'whatsapp',createdAt:now-10000+i});
 for(let i=0;i<65;i++)f.db.records.set('teyzaBusinessProspects/p'+String(i).padStart(3,'0'),{...base,name:'Prospect '+i,city:i<32?'Polokwane':'Durban',province:i<32?'Limpopo':'KwaZulu-Natal',municipality:i<32?'Polokwane':'eThekwini',area:i<32?'Seshego':'Umlazi',category:i<32?'retail':'spaza',historyVersion:1,phone:i%2?'':base.phone,permissions:i%2?{}:base.permissions});
 const before=structuredClone([...f.db.records]);const filters={province:'KwaZulu-Natal',category:'spaza',township:'Umlazi',queue:'new_contact'};
 const total=R.emptyCounts();let cursor=null,asOf=null,pages=0,seen=[],scanned=0;
 do{
  const page=await f.call('ops_acquisition_command_page',{filters,...(cursor?{after:cursor,asOf}:{} )});
  assert.equal(page.schema,2);assert.equal(page.asOf,asOf??page.asOf);asOf=page.asOf;cursor=page.next;pages++;scanned+=page.scanned;
  for(const group of ['funnel','queues'])for(const k of Object.keys(total[group]))total[group][k]+=page.counts[group][k];
  seen.push(...page.prospects);
 }while(cursor);
 assert(pages>1);assert.equal(total.funnel.discovered,34);assert.equal(total.funnel.contacted,1);assert.equal(total.funnel.staffConfirmedContact,1);
 assert(!seen.some(p=>p.id===id));assert(seen.every(p=>p.province==='KwaZulu-Natal'&&p.category==='spaza'&&p.phone));
 assert.equal(scanned,34);assert.equal(total.queues.new_contact,seen.length);
 const detail=await f.call('ops_acquisition_detail',{id});assert.equal(detail.prospect.lastWhatsAppContactAt,now-1000000);assert(!detail.events.some(e=>e.type==='contact'));
 await rejects(f.call('ops_acquisition_send',{id,revision:0,channel:'whatsapp',kind:'invitation',confirmed:true}),409);
 await rejects(f.call('ops_acquisition_command_page',{filters:{province:'Not a province'}}),422);
 await rejects(f.call('ops_acquisition_command_page',{after:'p001'}),422);
 await rejects(f.call('ops_acquisition_command_page',{asOf:now-56*60000}),422);
 await rejects(f.call('ops_acquisition_command_page',{}, {uid:'seller1',email_verified:true}),403);
 assert.deepEqual([...f.db.records],before);
});

test('National report reconciles paid memberships, current ad transactions, approval evidence and duplicate-free paying businesses without writes',async()=>{
 const f=setup(),R=require('./acquisition-report'),day=86400000;
 const make=async(name,category,sellerUid,address)=>{
  let p=(await f.call('ops_acquisition_create',{name,category,city:'Durban',area:'Umlazi',address,source:'owner_inquiry',sourceReference:'Synthetic owner enquiry',authorisedSource:true})).prospect;
  return (await f.call('ops_acquisition_link',{id:p.id,revision:p.revision,sellerUid,ownerConfirmed:true})).prospect;
 };
 const set=(path,value)=>f.db.records.set(path,value);
 const account=f.db.records.get('teyzaSellerAccounts/seller1');
 set('teyzaSellerAccounts/seller1',{...account,listingPlan:'basic'});
 set('teyzaPublicShops/seller1',{sellerUid:'seller1',status:'active',approvalStatus:'approved',identityVerified:true,latitude:-29.85,longitude:31.02});
 const paid={ownerUid:'seller1',status:'paid',paymentProvider:'paystack',paymentEnvironment:'live',paidUntil:now+day};
 set('teyzaBilling/seller1',paid);
 const p=await make('Test Shop','spaza','seller1','Synthetic paid');
 const pending=await make('Second','retail','seller2','Synthetic pending');
 const expiry=now+day;
 set('teyzaMobileVerification/seller2',{ownerUid:'seller2',status:'pending_review',objectPath:'teyza-private/mobile-verification/seller2/selfie',expiresAt:expiry});
 set('teyzaSellerIdentity/seller2',{ownerUid:'seller2',status:'pending_review',objectPath:'teyza-private/mobile-verification/seller2/identity',expiresAt:expiry});
 const ad={ownerUid:'seller1',status:'active',paymentStatus:'paid',radiusKm:10,amountCents:2900,latitude:-29.85,longitude:31.02,startsAt:now-20000,endsAt:expiry};
 const payment={ownerUid:'seller1',status:'paid',environment:'live',currency:'ZAR',amountCents:2900,verifiedAt:now-20000,transactionId:'gateway-123'};
 const variants=[
  ['good',{},{}],['good2',{},{}],['unpaid',{status:'approved_unpaid',paymentStatus:'unpaid'},{}],
  ['expired',{endsAt:now-2000},{}],['paused',{status:'paused'},{}],['sandbox',{}, {environment:'test'}],
  ['wrongowner',{}, {ownerUid:'seller2'}],['wrongamount',{}, {amountCents:999}],
  ['wrongcampaign',{}, {advertisementId:'another'}],['refund',{}, {refunded:true}],
  ['reversed',{}, {reversed:true}],['wrongcurrency',{}, {currency:'USD'}],
  ['notverified',{}, {verifiedAt:null}],['future',{}, {verifiedAt:now+day}],['missingtransaction',{}, {transactionId:''}]
 ];
 for(const [id,adOverride,payOverride] of variants){const reference='TZA-'+id;set('teyzaShopperAds/'+id,{...ad,paymentReference:reference,...adOverride});set('teyzaAdPayments/'+reference,{...payment,advertisementId:id,...payOverride});}
 set('teyzaShopperAds/nopayment',{...ad,paymentReference:'TZA-missing'});
 const before=structuredClone([...f.db.records]);
 const options=[],run=f.db.runTransaction.bind(f.db);f.db.runTransaction=(fn,opt)=>{if(opt)options.push(opt);return run(fn);};
 const page=await f.call('ops_acquisition_command_page',{filters:{queue:'paying'}});
 assert.equal(page.complete,true);assert.equal(page.counts.funnel.discovered,2);assert.equal(page.counts.funnel.registered,2);assert.equal(page.counts.funnel.awaitingApproval,1);
 assert.equal(page.counts.funnel.approved,1);assert.equal(page.counts.funnel.paidSellers,1);assert.equal(page.counts.funnel.activeAdvertisers,1);
 assert.equal(page.counts.funnel.activePaidCampaigns,2);assert.equal(page.counts.funnel.payingBusinesses,1);assert.equal(page.counts.queues.paying,1);
 assert.deepEqual(page.prospects.map(x=>x.id),[p.id]);assert.equal(page.prospects[0].seller.unpaidCampaigns,1);assert(page.prospects[0].seller.advertisingReview>=8);
 assert(options.some(o=>o.readOnly===true&&o.readTime.toMillis()===page.asOf));
 assert.deepEqual([...f.db.records],before);
 const review=await f.call('ops_acquisition_command_page',{filters:{queue:'pending_approval'},asOf:page.asOf});
 assert.deepEqual(review.prospects.map(x=>x.id),[pending.id]);
 const countOnly=await f.call('ops_acquisition_command_page',{asOf:page.asOf,includeRows:false});assert.deepEqual(countOnly.prospects,[]);assert.equal(countOnly.counts.funnel.payingBusinesses,1);
 for(const billing of [
  {ownerUid:'seller1',adminComplimentaryStatus:'active',adminComplimentaryReason:'Synthetic complimentary access',adminComplimentaryBy:'admin1',adminComplimentaryUntil:expiry},
  {ownerUid:'seller1',mandateAccessStatus:'active',mandateAccessKind:'processing_7d',mandateAccessMandateId:'mandate1',mandateAccessUntil:expiry},
  {...paid,paymentEnvironment:'test'},{...paid,paidUntil:now-2000}
 ]){
  set('teyzaBilling/seller1',billing);const result=await f.call('ops_acquisition_command_page',{});
  assert.equal(result.counts.funnel.paidSellers,0);assert.equal(result.counts.funnel.payingBusinesses,1,'Only the genuine live advertiser remains paying');
  assert.equal(result.counts.funnel.sellingAccessNotPaid,Number(Boolean(billing.adminComplimentaryStatus||billing.mandateAccessStatus)));
 }
 set('teyzaPublicShops/seller1',{sellerUid:'seller1',status:'suspended',approvalStatus:'approved',identityVerified:true,latitude:-29.85,longitude:31.02});
 const suspended=await f.call('ops_acquisition_command_page',{});
 assert.equal(suspended.counts.funnel.activeAdvertisers,0);assert.equal(suspended.counts.funnel.payingBusinesses,0);
});
test('National queues distinguish contact attempts, evidence, missing contacts and SAST follow-up dates',async()=>{
 const R=require('./acquisition-report'),stamp=now-10000;
 const base={stage:'identified',phone:'0712345678',phoneKind:'whatsapp_only',permissions:{whatsapp:{granted:true}},seller:null};
 assert.equal(R.classify(base,now).queues.ready_to_contact,true);
 assert.equal(R.classify({...base,permissions:{phone:{granted:true}}},now).queues.permission_needed,true);
 const missing=R.classify({...base,phone:'',email:''},now);assert.equal(missing.queues.new_contact,false);assert.equal(missing.queues.field_visit,true);
 const historic=await R.history({...base,historyVersion:0},async()=>[{type:'message_accepted',kind:'invitation',channel:'email',acceptedAt:stamp}],now);
 const accepted=R.classify({...base,...historic},now);assert.equal(accepted.queues.new_contact,false);assert.equal(accepted.queues.awaiting_response,true);assert.equal(accepted.funnel.providerAccepted,1);assert.equal(accepted.funnel.staffConfirmedContact,0);
 const unknown=await R.history({...base,stage:'registration_started'},async()=>[],now);
 assert.equal(R.classify({...base,...unknown},now).queues.history_review,true);
 const download=R.classify({...base,downloadConfirmedAt:stamp},now);assert.equal(download.funnel.downloads,1);assert.equal(download.funnel.approved,0);assert.equal(download.queues.registration_help,true);
 assert.equal(R.classify({...base,optedOut:true},now).queues.new_contact,false);
 const tomorrow=(Math.floor((now+7200000)/86400000)+1)*86400000-7200000;
 assert.equal(R.classify({...base,nextFollowUpAt:tomorrow-1},now).queues.follow_up_due,true);
 assert.equal(R.classify({...base,nextFollowUpAt:tomorrow},now).queues.follow_up_due,false);
 const geo={city:'Durban',area:'Umlazi',province:'KwaZulu-Natal',municipality:'eThekwini',category:'spaza'};
 assert(R.matches(geo,R.parseFilters({province:'KwaZulu-Natal',municipality:' ETHEKWINI ',township:'Umlazi',category:'spaza'})));
 assert(!R.matches(geo,R.parseFilters({municipality:'Mangaung'})));
 assert(!R.matches(geo,R.parseFilters({category:'retail'})));
 assert.throws(()=>R.parseFilters({province:'Gauteng',municipalityCode:'ETH'}),e=>e.status===422);
});
