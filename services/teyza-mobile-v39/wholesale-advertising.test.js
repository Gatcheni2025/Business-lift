'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createWholesaleAdvertising}=require('./wholesale-advertising');
const started=Date.parse('2026-11-09T09:00:00Z');
class FakeDB{
 constructor(data){this.docs=new Map(Object.entries(structuredClone(data)));}
 doc(path){const self=this;return{path,id:path.split('/').pop(),
  get:async()=>self.snapshot(path),
  set:async(value,opts)=>self.docs.set(path,opts?.merge?{...self.docs.get(path),...structuredClone(value)}:structuredClone(value)),
  update:async value=>self.docs.set(path,{...self.docs.get(path),...structuredClone(value)})};}
 snapshot(path){const obj=this.docs.get(path);return{
  id:path.split('/').pop(),exists:obj!==undefined,
  data:()=>structuredClone(obj),ref:this.doc(path)};}
 collection(path){const db=this,filters=[];let limit=Infinity;const q={
  where:(...args)=>{filters.push(args);return q;},limit:n=>{limit=n;return q;},
  get:async()=>({docs:[...db.docs.keys()].filter(x=>x.startsWith(path+'/')&&
   x.slice(path.length+1).indexOf('/')<0).filter(k=>filters.every(([field,op,val])=>{
    const found=db.docs.get(k)[field];
    return op==='=='?found===val:op==='array-contains'?Array.isArray(found)&&found.includes(val):false;
   })).slice(0,limit).map(k=>db.snapshot(k))})};return q;}
 async runTransaction(fn){
  const writes=[],tx={get:ref=>ref.get(),
    set:(ref,value,opts)=>writes.push(()=>ref.set(value,opts)),
    update:(ref,value)=>writes.push(()=>ref.update(value))};
  const result=await fn(tx);for(const write of writes)await write();return result;
 }
}
function fixture(){
 const db=new FakeDB({
  'teyzaSellerAccounts/supplier':{uid:'supplier',category:'wholesale',shopName:'Wholesale Depot',approvalStatus:'approved'},
  'teyzaPublicShops/supplier':{sellerUid:'supplier',shopCategory:'wholesale',name:'Wholesale Depot',status:'active'},
  'teyzaBilling/supplier':{ownerUid:'supplier',mandateAccessStatus:'active',mandateAccessKind:'processing_7d',
    mandateAccessMandateId:'request1',mandateAccessUntil:started+7*86400000},
  'teyzaSellerAccounts/spaza':{uid:'spaza',category:'spaza',shopName:'Community Spaza',approvalStatus:'approved'},
  'teyzaPublicShops/spaza':{sellerUid:'spaza',shopCategory:'spaza',name:'Community Spaza',status:'active',area:'Durban'},
  'teyzaSellerAccounts/shopper':{uid:'shopper',category:'retail',shopName:'Another Shop',approvalStatus:'approved'},
  'teyzaPublicShops/shopper':{sellerUid:'shopper',shopCategory:'retail',name:'Another Shop',status:'active'}
 });
 let now=started;
 const svc=createWholesaleAdvertising({db,clock:()=>now,rate:async()=>{}});
 const supplier={uid:'supplier',email_verified:true};
 const spaza={uid:'spaza',email_verified:true};
 const admin={uid:'admin',teyzaAdmin:true,email_verified:true,auth_time:started/1000};
 return {db,service:svc,supplier,spaza,admin,setNow:n=>now=n,
  call:(actor,action,data={})=>svc.execute(actor,action,data)};
}
const rejects=(p,status)=>assert.rejects(p,e=>e.status===status);
test('Only opted-in, approved public spaza shops are eligible for targeted wholesaler advertising',async()=>{
 const f=fixture();
 assert.deepEqual((await f.call(f.supplier,'wholesale_spaza_directory')).shops,[]);
 await f.call(f.spaza,'wholesale_ad_opt_in',{optedIn:true});
 const shops=(await f.call(f.supplier,'wholesale_spaza_directory')).shops;
 assert.equal(shops.length,1);assert.equal(shops[0].name,'Community Spaza');
 assert.equal(shops[0].ownerEmail,undefined);assert.equal(shops[0].phone,undefined);
 await rejects(f.call({uid:'shopper',email_verified:true},'wholesale_spaza_directory'),403);
 await f.call(f.spaza,'wholesale_ad_opt_in',{optedIn:false});
 assert.deepEqual((await f.call(f.supplier,'wholesale_spaza_directory')).shops,[]);
});
test('Moderated R99 campaign reaches opted-in spaza only after independent approval',async()=>{
 const f=fixture();
 await f.call(f.spaza,'wholesale_ad_opt_in',{optedIn:true});
 const input={title:'Wholesale stock discount',message:'Special grocery pack pricing and affordable delivery.',
   targetUids:['spaza']};
 await rejects(f.call(f.supplier,'wholesale_ad_submit',{...input,targetUids:['shopper']}),409);
 const submitted=await f.call(f.supplier,'wholesale_ad_submit',input);
 assert.equal(submitted.status,'pending_review');
 assert.equal((await f.call(f.spaza,'wholesale_ads')).campaigns.length,0);
 assert.equal((await f.call(f.admin,'ops_wholesale_ads_queue')).campaigns.length,1);
 await rejects(f.call(f.supplier,'ops_wholesale_ad_review',{campaignId:submitted.campaignId,
  decision:'approved',confirmed:true}),403);
 await f.call(f.admin,'ops_wholesale_ad_review',{campaignId:submitted.campaignId,
  decision:'approved',confirmed:true});
 const offers=(await f.call(f.spaza,'wholesale_ads')).campaigns;
 assert.equal(offers.length,1);assert.equal(offers[0].supplierUid,'supplier');
 assert.equal(offers[0].message,input.message);
 assert.equal((await f.call(f.supplier,'wholesale_ads')).campaigns.length,1);
 await f.call(f.supplier,'wholesale_ad_pause',{campaignId:submitted.campaignId});
 assert.equal((await f.call(f.spaza,'wholesale_ads')).campaigns.length,0);
});
test('Wholesale invitations require voluntary spaza acceptance, not silent connections',async()=>{
 const f=fixture();
 await rejects(f.call(f.supplier,'wholesale_spaza_invite',{spazaUid:'spaza'}),409);
 await f.call(f.spaza,'wholesale_ad_opt_in',{optedIn:true});
 const invited=await f.call(f.supplier,'wholesale_spaza_invite',{spazaUid:'spaza'});
 assert.equal(invited.status,'invited');
 assert.equal(f.db.docs.get('teyzaWholesaleConnections/spaza_supplier').status,'invited');
 const accepted=await f.call(f.spaza,'wholesale_spaza_accept_invite',{supplierUid:'supplier',accept:true});
 assert.equal(accepted.status,'pending');
 assert.equal(f.db.docs.get('teyzaWholesaleConnections/spaza_supplier').status,'pending');
});
test('Expired R99 access or revoked spaza consent stops delivery of supplier campaigns',async()=>{
 const f=fixture();
 await f.call(f.spaza,'wholesale_ad_opt_in',{optedIn:true});
 const ad=await f.call(f.supplier,'wholesale_ad_submit',{title:'Limited supplier offer',
  message:'Stock discount at participating distributors only.',targetUids:['spaza']});
 await f.call(f.admin,'ops_wholesale_ad_review',{campaignId:ad.campaignId,
  decision:'approved',confirmed:true});
 await f.call(f.spaza,'wholesale_ad_opt_in',{optedIn:false});
 assert.deepEqual((await f.call(f.spaza,'wholesale_ads')).campaigns,[]);
 await f.call(f.spaza,'wholesale_ad_opt_in',{optedIn:true});
 f.setNow(started+8*86400000);
 assert.deepEqual((await f.call(f.spaza,'wholesale_ads')).campaigns,[]);
 await rejects(f.call(f.supplier,'wholesale_ad_submit',{title:'Another offer',
  message:'New product promotions for shops in Durban.',targetUids:['spaza']}),403);
});
