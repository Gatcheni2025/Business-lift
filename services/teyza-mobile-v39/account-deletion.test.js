'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAccountDeletion}=require('./account-deletion');

class FakeDB {
  constructor(seed={}){this.records=new Map(Object.entries(structuredClone(seed)));}
  doc(path){const db=this;return {
    path,id:path.split('/').pop(),
    get:async()=>db.snap(path),
    set:async data=>db.records.set(path,structuredClone(data)),
    update:async data=>{if(!db.records.has(path))throw Error('missing '+path);
      db.records.set(path,{...db.records.get(path),...structuredClone(data)});},
  };}
  snap(path){const d=this.records.get(path);return {exists:d!==undefined,id:path.split('/').pop(),
    data:()=>structuredClone(d),ref:this.doc(path)};}
  async runTransaction(fn){
    const writes=[],db=this;
    const tx={
      get:async r=>r.get(),
      set:(r,data)=>writes.push(()=>r.set(data)),
      update:(r,data)=>writes.push(()=>r.update(data)),
    };
    const out=await fn(tx);
    for(const w of writes)await w();
    return out;
  }
  collection(path) {
    const db=this,filters=[];
    const q={
      where:(field,op,value)=>{filters.push([field,op,value]);return q;},
      orderBy:()=>q,limit:()=>q,
      get:async()=>({docs:[...db.records].filter(([key,obj])=>
        key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')<0&&
        filters.every(([f,op,v])=>op==='=='&&obj[f]===v))
        .map(([key])=>db.snap(key))}),
    };
    return q;
  }
}
const now=1762000000000;
const buyer={uid:'shopper1',auth_time:now/1000-60,email_verified:false};
const seller={uid:'seller1',auth_time:now/1000-60,email_verified:true};
const admin={uid:'ops1',auth_time:now/1000-60,email_verified:true,teyzaAdmin:true};
const fail=(promise,status)=>assert.rejects(promise,error=>error.status===status);
const instance=(seed={},opts={})=>{
  const db=new FakeDB(seed),deleted=[];
  return {db,deleted,service:createAccountDeletion({
    db,clock:()=>now,deleteAuthUser:async uid=>{deleted.push(uid);},...opts})};
};

test('shopper can request deletion without verified email; durable reference is idempotent',async()=>{
  const {service,db}=instance();
  await fail(service.execute(buyer,'account_deletion_request',{confirmation:'yes'}),422);
  const r=await service.execute(buyer,'account_deletion_request',{confirmation:'DELETE'});
  assert.match(r.reference,/^TZ-DEL-[0-9A-F]{12}$/);
  assert.equal(r.status,'pending_review');
  assert.equal(r.seller,false);
  assert.equal(r.completeBy,now+30*86400000);
  assert.equal(db.records.size,1);
  const duplicate=await service.execute(buyer,'account_deletion_request',{confirmation:'DELETE'});
  assert.equal(duplicate.reference,r.reference);
  assert.equal((await service.execute(buyer,'account_deletion_status')).reference,r.reference);
});
test('seller deletion suspends public shop and flags billing and mandate review',async()=>{
  const {service,db}=instance({
    'teyzaSellerAccounts/seller1':{uid:'seller1',approvalStatus:'approved',listingStatus:'active'},
    'teyzaPublicShops/seller1':{sellerUid:'seller1',status:'active',sellingEnabled:true,catalogueEnabled:true},
    'teyzaSellerMandates/seller1':{ownerUid:'seller1',status:'signed_pending_activation'},
    'teyzaBilling/seller1':{ownerUid:'seller1',status:'paid'},
  });
  const r=await service.execute(seller,'account_deletion_request',{confirmation:'DELETE'});
  assert.equal(r.seller,true);
  assert.equal(db.records.get('teyzaPublicShops/seller1').status,'suspended');
  assert.equal(db.records.get('teyzaPublicShops/seller1').sellingEnabled,false);
  assert.equal(db.records.get('teyzaSellerAccounts/seller1').listingStatus,'not_listed');
  assert.equal(db.records.get('teyzaSellerMandates/seller1').status,'withdrawn');
  assert.equal(db.records.get('teyzaBilling/seller1').status,'closure_review');
  assert.equal(db.records.get('teyzaAccountDeletionRequests/seller1').needsBillingReview,true);
});
test('stale sign-ins and another user cannot request or read deletion for a different UID',async()=>{
  const {service}=instance();
  await fail(service.execute({...buyer,auth_time:now/1000-3600},'account_deletion_request',{confirmation:'DELETE'}),403);
  await fail(service.execute({...buyer,teyzaPhoneBootstrap:true},'account_deletion_request',{confirmation:'DELETE'}),403);
  const r=await service.execute(buyer,'account_deletion_request',{confirmation:'DELETE',uid:'victim'});
  assert.equal(r.requested,true);
  assert.deepEqual(await service.execute(seller,'account_deletion_status'),{requested:false});
});
test('only recently signed-in admin can list and complete; live orders and confirmations block closure',async()=>{
  const {service,db,deleted}=instance({'teyzaMobileOrders/order1':{
    ownerUid:'seller1',shopperUid:'shopper1',status:'requested',
  }});
  const request=await service.execute(seller,'account_deletion_request',{confirmation:'DELETE'});
  await fail(service.execute(buyer,'ops_account_deletion_queue'),403);
  await fail(service.execute({...admin,auth_time:now/1000-3600},'ops_account_deletion_queue'),403);
  const q=await service.execute(admin,'ops_account_deletion_queue');
  assert.equal(q.requests[0].reference,request.reference);
  await fail(service.execute(admin,'ops_account_deletion_complete',{uid:'seller1'}),422);
  const confirmed={uid:'seller1',confirmedDataErased:true,
    confirmedBillingResolved:true,confirmedProviderRevocation:true};
  await fail(service.execute(admin,'ops_account_deletion_complete',confirmed),409);
  db.records.set('teyzaMobileOrders/order1',{ownerUid:'seller1',shopperUid:'shopper1',status:'completed'});
  const result=await service.execute(admin,'ops_account_deletion_complete',confirmed);
  assert.equal(result.completed,true);
  assert.deepEqual(deleted,['seller1']);
  assert.equal(db.records.get('teyzaAccountDeletionRequests/seller1').status,'completed');
});
