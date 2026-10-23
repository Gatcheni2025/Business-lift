'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./domain'),{createService}=require('./service'),C=require('./selfie-crypto');
class FakeDB {
  constructor(seed={}){this.records=new Map(Object.entries(structuredClone(seed)));this.serial=0;}
  doc(path){const db=this;return {path,id:path.split('/').pop(),get:async()=>db.snapshot(path),
    set:async(value,options)=>db.records.set(path,options?.merge?{...db.records.get(path),...structuredClone(value)}:structuredClone(value)),
    update:async value=>{assert(db.records.has(path));db.records.set(path,{...db.records.get(path),...structuredClone(value)});},
    collection:name=>db.collection(path+'/'+name)};}
  snapshot(path){const data=this.records.get(path);return {exists:data!==undefined,id:path.split('/').pop(),data:()=>structuredClone(data),ref:this.doc(path)};}
  collection(path){const db=this,filters=[];let sort=null,max=Infinity;const query={
    doc:(value)=>db.doc(path+'/'+(value||'generated'+(++db.serial))),
    where:(...filter)=>{filters.push(filter);return query;},orderBy:(...args)=>{sort=args;return query;},
    limit:value=>{max=value;return query;},get:async()=>{
      let rows=[...db.records].filter(([key,value])=>key.startsWith(path+'/')&&key.slice(path.length+1).indexOf('/')===-1&&
        filters.every(([field,op,wanted])=>op==='=='?value[field]===wanted:op==='array-contains'?value[field]?.includes(wanted):value[field]<=wanted));
      if(sort)rows.sort((a,b)=>(sort[1]==='desc'?-1:1)*((a[1][sort[0]]||0)-(b[1][sort[0]]||0)));
      const docs=rows.slice(0,max).map(([key])=>db.snapshot(key));return {docs,size:docs.length};
    }};return query;}
  transaction(){const writes=[],db=this;let wrote=false;return {get:async ref=>{assert(!wrote,'Transaction must read before writing');return ref.get();},
    set:(ref,value,options)=>{wrote=true;writes.push(()=>ref.set(value,options));},update:(ref,value)=>{wrote=true;writes.push(()=>ref.update(value));},
    commit:async()=>{for(const write of writes)await write();}};}
  async runTransaction(fn){const tx=this.transaction(),result=await fn(tx);await tx.commit();return result;}
  batch(){return this.transaction();}
}
const seller={uid:'seller1',category:'spaza',shopName:'Corner Shop',approvalStatus:'approved',listingStatus:'active'};
const shop={sellerUid:'seller1',status:'active',name:'Corner Shop',pickupEnabled:true,deliveryEnabled:true,deliveryFeeCents:1500,
  catalogueEnabled:true,products:[{id:'bread1',name:'Bread',priceCents:1800,stock:5}]};
const buyer={uid:'buyer1',email_verified:true,email:'buyer@example.test',name:'Buyer'};
const owner={uid:'seller1',email_verified:true,email:'owner@example.test'};
function fixture(extra={}){const db=new FakeDB({'teyzaSellerAccounts/seller1':seller,'teyzaPublicShops/seller1':shop,...extra});
 const files=new Map(),secret=Buffer.alloc(32,7).toString('base64');
 const bucket={name:'test-bucket',file:path=>({save:async bytes=>files.set(path,bytes),download:async()=>[files.get(path)]})};
 return {db,files,service:createService({db,bucket,clock:()=>1000000,sanitizeImage:async bytes=>bytes,
   encryptSelfie:bytes=>C.encrypt(bytes,secret),decryptSelfie:bytes=>C.decrypt(bytes,secret)})};}
const rejects=(promise,status)=>assert.rejects(promise,error=>error.status===status);
const services={deliveryEnabled:true,pickupEnabled:true,cashback:true,cardPayments:true,liveChatEnabled:true,deliveryFeeCents:1500,deliveryRadiusKm:5,deliveryNotes:'Local area'};

test('Unverified users and signed-out callers cannot use private services',async()=>{
 const {service}=fixture();await rejects(service.execute(null,'seller_summary'),401);
 await rejects(service.execute({uid:'seller1',email_verified:false},'save_services',services),403);
});
test('A shopper selecting owner mode cannot save another shop settings',async()=>{
 const {service,db}=fixture();await rejects(service.execute(buyer,'save_services',{...services,ownerUid:'seller1'}),403);
 assert.equal(db.records.has('teyzaShopSettings/buyer1'),false);
});
test('Pending sellers can prepare settings but cannot activate a public listing',async()=>{
 const {service,db}=fixture({'teyzaSellerAccounts/seller1':{...seller,approvalStatus:'pending'}});
 await service.execute(owner,'save_services',{...services,status:'active',approvalStatus:'approved'});
 assert.equal(db.records.get('teyzaShopSettings/seller1').cashback,true);
 assert.equal(db.records.get('teyzaPublicShops/seller1').services,undefined);
 assert.equal(db.records.get('teyzaSellerAccounts/seller1').approvalStatus,'pending');
});
test('Active sellers publish only validated service settings and trading hours',async()=>{
 const {service,db}=fixture();await service.execute(owner,'save_services',services);
 assert.equal(db.records.get('teyzaPublicShops/seller1').services.payAndCollect,true);
 const days=Array.from({length:7},()=>({closed:false,open:'20:00',close:'02:00'}));
 await service.execute(owner,'save_hours',{hours:days});assert.deepEqual(db.records.get('teyzaPublicShops/seller1').hours,days);
 await rejects(service.execute(owner,'save_hours',{hours:[{closed:false,open:'99:99',close:'17:00'}]}),422);
});
test('Credit requires consent and remains an enquiry, never an approved loan',async()=>{
 const {service,db}=fixture();const data={amountCents:100000,purpose:'Restock essentials',phone:'0712345678'};
 await rejects(service.execute(owner,'credit_enquiry',data),422);
 const result=await service.execute(owner,'credit_enquiry',{...data,consent:true,status:'approved',ownerUid:'attacker'});
 assert.equal(result.status,'enquiry_received');
 const record=db.records.get('teyzaCreditEnquiries/seller1/requests/'+result.id);assert.equal(record.ownerUid,'seller1');assert.equal(record.status,'enquiry_received');
});
test('Firebase UID shops open authenticated conversations, with isolation and idempotent sends',async()=>{
 const {service,db}=fixture();const opened=await service.execute(buyer,'chat_open',{shopId:'seller1'});
 await service.execute(buyer,'chat_send',{threadId:opened.threadId,message:'Do you have bread?',messageId:'message1'});
 await service.execute(buyer,'chat_send',{threadId:opened.threadId,message:'Do you have bread?',messageId:'message1'});
 assert.equal((await service.execute(owner,'chat_read',{threadId:opened.threadId})).messages.length,1);
 await rejects(service.execute({...buyer,uid:'outsider'},'chat_read',{threadId:opened.threadId}),403);
 assert.equal(db.records.get('teyzaMobileChats/'+opened.threadId).ownerUid,'seller1');
 assert.equal((await service.execute(owner,'chat_list')).threads.length,1);
});
test('Disabled chat and inactive shop listings reject new conversations',async()=>{
 const disabled=fixture({'teyzaShopSettings/seller1':{liveChatEnabled:false}});
 await rejects(disabled.service.execute(buyer,'chat_open',{shopId:'seller1'}),409);
 const inactive=fixture({'teyzaPublicShops/seller1':{...shop,status:'pending'}});
 await rejects(inactive.service.execute(buyer,'chat_open',{shopId:'seller1'}),409);
});
test('Order request ignores client pricing and binds the authenticated buyer and real fulfilment',async()=>{
 const {service,db}=fixture();const data={shopId:'seller1',requestId:'order1',mode:'delivery',address:'10 Test Road Durban',phone:'0712345678',
 items:[{id:'bread1',quantity:2,priceCents:1}],shopperUid:'attacker',totalCents:1};
 const result=await service.execute(buyer,'order_request',data),order=db.records.get('teyzaMobileOrders/'+result.id);
 assert.equal(order.shopperUid,'buyer1');assert.equal(order.totalCents,5100);assert.equal(order.status,'requested');assert.equal(order.reserved,false);
 assert.equal((await service.execute(buyer,'order_request',data)).id,result.id);
 assert.equal((await service.execute(owner,'order_list',{asOwner:true})).orders[0].id,result.id);
 assert.equal((await service.execute(buyer,'order_list')).orders[0].id,result.id);
 await rejects(service.execute({...buyer,uid:'outsider'},'order_update',{orderId:result.id,status:'cancelled'}),403);
});
test('Only owner confirmation reserves stock once; cancellation releases the reservation',async()=>{
 const {service,db}=fixture();const result=await service.execute(buyer,'order_request',{shopId:'seller1',requestId:'order2',mode:'collection',phone:'0712345678',items:[{id:'bread1',quantity:2}]});
 await rejects(service.execute(buyer,'order_update',{orderId:result.id,status:'confirmed'}),403);
 await service.execute(owner,'order_update',{orderId:result.id,status:'confirmed'});
 assert.equal(db.records.get('teyzaPublicShops/seller1').products[0].stock,3);
 await rejects(service.execute(owner,'order_update',{orderId:result.id,status:'confirmed'}),409);
 await service.execute(owner,'order_update',{orderId:result.id,status:'cancelled'});
 assert.equal(db.records.get('teyzaPublicShops/seller1').products[0].stock,5);
});
test('Invalid or disabled fulfilment and excess stock cannot create requests',async()=>{
 const {service}=fixture({'teyzaPublicShops/seller1':{...shop,deliveryEnabled:false}});
 const base={shopId:'seller1',requestId:'x',mode:'delivery',address:'Test address Durban',phone:'0712345678',items:[{id:'bread1',quantity:1}]};
 await rejects(service.execute(buyer,'order_request',base),409);
 await rejects(service.execute(buyer,'order_request',{...base,mode:'collection',items:[{id:'bread1',quantity:999}]}),422);
});
test('Private verification uses authenticated encryption and cannot self-approve',async()=>{
 const {service,db,files}=fixture();const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,23)]);
 await service.execute(owner,'verification_selfie',{consent:true,imageBase64:jpeg.toString('base64'),status:'approved'});
 const record=db.records.get('teyzaMobileVerification/seller1');assert.equal(record.status,'pending_review');
 assert.equal(record.method,'selfie_manual_review');assert(!files.get(record.objectPath).includes(jpeg));
 await rejects(service.execute(owner,'verification_read',{sellerUid:'seller1'}),403);
 const admin={...buyer,teyzaAdmin:true,auth_time:1000};
 const photo=await service.execute(admin,'verification_read',{sellerUid:'seller1'});assert.equal(photo.imageBase64,jpeg.toString('base64'));
 assert.equal(db.records.get('teyzaSellerAccounts/seller1').approvalStatus,'approved');
});
test('Encryption detects tampering; keys and image validation fail closed',()=>{
 const key=Buffer.alloc(32,5).toString('base64'),bytes=Buffer.from('private image');
 const encrypted=C.encrypt(bytes,key);encrypted[encrypted.length-1]^=1;assert.throws(()=>C.decrypt(encrypted,key));
 assert.throws(()=>C.encrypt(bytes,''));assert.throws(()=>D.imageBytes('not an image'));
});
test('Only trusted admins can publish an approved, active, eligible catalogue',async()=>{
 const submission={ownerUid:'seller1',status:'pending_review',products:shop.products};
 const {service,db}=fixture({'teyzaCatalogueSubmissions/seller1':submission,
  'teyzaDraftProducts/seller1/items/bread1':{ownerUid:'seller1',status:'draft',stockQty:5}});
 await rejects(service.execute(owner,'catalogue_review',{sellerUid:'seller1'}),403);
 const admin={...buyer,teyzaAdmin:true};await service.execute(admin,'catalogue_review',{sellerUid:'seller1'});
 assert.equal(db.records.get('teyzaCatalogueSubmissions/seller1').status,'published');
 const pending=fixture({'teyzaCatalogueSubmissions/seller1':submission,'teyzaPublicShops/seller1':{...shop,catalogueEnabled:false}});
 await rejects(pending.service.execute(admin,'catalogue_review',{sellerUid:'seller1'}),409);
});
test('Closing times and duplicate products do not silently become invalid orders',()=>{
 assert.throws(()=>D.hours(Array(7).fill({closed:false,open:'08:00',close:'08:00'})));
 assert.throws(()=>D.orderItems([{id:'bread1',quantity:1},{id:'bread1',quantity:1}],shop.products));
 assert.notEqual(D.threadId('ab','c'),D.threadId('a','bc'));
});

test('Publishing a reviewed catalogue cannot restore stock already reserved by an order',async()=>{
 const {service,db}=fixture({'teyzaDraftProducts/seller1/items/bread1':{ownerUid:'seller1',status:'draft',name:'Bread',category:'Groceries',priceCents:1800,stockQty:5}});
 await service.execute(owner,'catalogue_submit');
 const order=await service.execute(buyer,'order_request',{shopId:'seller1',requestId:'reservation',mode:'collection',phone:'0712345678',items:[{id:'bread1',quantity:2}]});
 await service.execute(owner,'order_update',{orderId:order.id,status:'confirmed'});
 await service.execute({...buyer,teyzaAdmin:true},'catalogue_review',{sellerUid:'seller1'});
 assert.equal(db.records.get('teyzaPublicShops/seller1').products[0].stock,3);
 assert.equal(db.records.get('teyzaDraftProducts/seller1/items/bread1').stockQty,3);
});
