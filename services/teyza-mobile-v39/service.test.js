'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./domain'),{createService}=require('./service'),C=require('./selfie-crypto');
const catalogue=require('./catalogue');
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
const seller={uid:'seller1',category:'spaza',shopName:'Corner Shop',approvalStatus:'approved',listingStatus:'active'};
const shop={sellerUid:'seller1',status:'active',name:'Corner Shop',pickupEnabled:true,deliveryEnabled:true,deliveryFeeCents:1500,
  catalogueEnabled:true,products:[{id:'bread1',name:'Bread',priceCents:1800,stock:5}]};
const buyer={uid:'buyer1',email_verified:true,email:'buyer@example.test',name:'Buyer'};
const owner={uid:'seller1',email_verified:true,email:'owner@example.test'};
function fixture(extra={},options={}){const db=new FakeDB({'teyzaSellerAccounts/seller1':seller,'teyzaPublicShops/seller1':shop,...extra});
 const files=new Map(),secret=Buffer.alloc(32,7).toString('base64');
 const bucket={name:'test-bucket',file:path=>({save:async bytes=>files.set(path,bytes),download:async()=>[files.get(path)]})};
 return {db,files,service:createService({db,bucket,clock:()=>1000000,sanitizeImage:async bytes=>bytes,
   encryptSelfie:bytes=>C.encrypt(bytes,secret),decryptSelfie:bytes=>C.decrypt(bytes,secret),...options})};}
const rejects=(promise,status)=>assert.rejects(promise,error=>error.status===status);
test('Only completed-order shoppers rate a shop; edits and repeat orders never inflate its count',async()=>{
 const {service,db}=fixture({'teyzaMobileOrders/done':{ownerUid:'seller1',shopperUid:'buyer1',status:'completed'},
  'teyzaMobileOrders/waiting':{ownerUid:'seller1',shopperUid:'buyer1',status:'requested'}});
 await rejects(service.execute(owner,'shop_rate',{orderId:'done',stars:5}),403);
 await rejects(service.execute(buyer,'shop_rate',{orderId:'waiting',stars:5}),409);
 await rejects(service.execute({...buyer,email_verified:false},'shop_rate',{orderId:'done',stars:5}),403);
 await rejects(service.execute(buyer,'shop_rate',{orderId:'done',stars:6}),422);
 await service.execute(buyer,'shop_rate',{orderId:'done',stars:5,ratingCount:1000});
 await service.execute(buyer,'shop_rate',{orderId:'done',stars:3});
 let s=db.records.get('teyzaPublicShops/seller1');assert.equal(s.ratingCount,1);assert.equal(s.rating,3);
 db.records.set('teyzaMobileOrders/second',{ownerUid:'seller1',shopperUid:'buyer2',status:'completed'});
 await service.execute({...buyer,uid:'buyer2'},'shop_rate',{orderId:'second',stars:5});
 s=db.records.get('teyzaPublicShops/seller1');assert.equal(s.ratingCount,2);assert.equal(s.rating,4);
 assert.equal(s.ratingSource,'teyza_completed_orders');
 db.records.set('teyzaPublicShops/seller1',{...s,status:'suspended'});
 await rejects(service.execute(buyer,'shop_rate',{orderId:'done',stars:5}),409);
});
test('Existing approved active shops reconcile old listing flags but suspended shops stay paused',async()=>{
 const {service,db}=fixture({'teyzaSellerAccounts/seller1':{...seller,listingStatus:'not_listed'},
  'teyzaMobileVerification/seller1':{ownerUid:'seller1',status:'approved'}});
 const summary=await service.execute(owner,'seller_summary');
 assert.equal(summary.publicationStatus,'active');assert.equal(summary.identityVerified,true);
 assert.equal(db.records.get('teyzaSellerAccounts/seller1').listingStatus,'active');
 db.records.set('teyzaPublicShops/seller1',{...db.records.get('teyzaPublicShops/seller1'),status:'suspended',identityVerified:false});
 assert.equal((await service.execute(owner,'seller_summary')).publicationStatus,'suspended');
 assert.equal(db.records.get('teyzaPublicShops/seller1').identityVerified,false);
});
const services={deliveryEnabled:true,pickupEnabled:true,cashback:true,cardPayments:true,liveChatEnabled:true,deliveryFeeCents:1500,deliveryRadiusKm:5,deliveryNotes:'Local area'};

test('Native seller registration binds the verified actor and cannot approve, activate or replace an existing shop',async()=>{
 const {service,db}=fixture();const data={category:'retail',shopName:'Local Retail',phone:'0712345678',address:'Durban',consent:true,
  uid:'seller1',ownerEmail:'forged@test',approvalStatus:'approved',listingStatus:'active'};
 await rejects(service.execute(buyer,'seller_register',{...data,consent:false}),422);
 await service.execute(buyer,'seller_register',data);
 const saved=db.records.get('teyzaSellerAccounts/buyer1');assert.equal(saved.uid,'buyer1');assert.equal(saved.ownerEmail,buyer.email);
 assert.equal(saved.approvalStatus,'pending');assert.equal(saved.listingStatus,'not_listed');assert.equal(saved.category,'retail');
 await service.execute(buyer,'seller_register',{...data,shopName:'Replaced'});assert.equal(db.records.get('teyzaSellerAccounts/buyer1').shopName,'Local Retail');
 assert.equal(db.records.has('teyzaPublicShops/buyer1'),false);
});
test('Only recent trusted reviewers can see the queue and approve the exact selfie they viewed',async()=>{
 const {service,db}=fixture({'teyzaSellerAccounts/seller1':{...seller,approvalStatus:'pending',listingStatus:'not_listed'}});
 const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,23)]);
 await service.execute(owner,'verification_selfie',{consent:true,imageBase64:jpeg.toString('base64')});
 const submissionId=db.records.get('teyzaMobileVerification/seller1').submissionId;
 const admin={...buyer,teyzaAdmin:true,auth_time:1000};
 await rejects(service.execute(owner,'admin_seller_queue'),403);
 await rejects(service.execute({...admin,auth_time:600},'admin_seller_queue'),401);
 await rejects(service.execute({...admin,auth_time:undefined},'admin_seller_queue'),401);
 assert.equal((await service.execute(admin,'admin_seller_queue')).sellers[0].shopName,'Corner Shop');
 const decision={sellerUid:'seller1',submissionId,status:'approved'};
 await rejects(service.execute(admin,'admin_seller_review',decision),409);
 await rejects(service.execute({...owner,teyzaAdmin:true,auth_time:1000},'admin_seller_review',decision),403);
 await service.execute(admin,'verification_read',{sellerUid:'seller1',submissionId});
 await service.execute(admin,'admin_seller_review',decision);
 const account=db.records.get('teyzaSellerAccounts/seller1');assert.equal(account.approvalStatus,'approved');assert.equal(account.listingStatus,'active');
 assert.equal(db.records.get('teyzaPublicShops/seller1').catalogueEnabled,true);
 assert.equal(db.records.get('teyzaSellerReviewAudit/'+submissionId).reviewedBy,'buyer1');
 await rejects(service.execute(admin,'admin_seller_review',decision),409);
});
test('Resubmission invalidates prior review; request-new-photo needs a note and suspends the old public shop',async()=>{
 const {service,db}=fixture();const admin={...buyer,teyzaAdmin:true,auth_time:1000};
 const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,23)]);
 await service.execute(owner,'verification_selfie',{consent:true,imageBase64:jpeg.toString('base64')});
 const old=db.records.get('teyzaMobileVerification/seller1').submissionId;
 await service.execute(admin,'verification_read',{sellerUid:'seller1',submissionId:old});
 await service.execute(owner,'verification_selfie',{consent:true,imageBase64:jpeg.toString('base64')});
 await rejects(service.execute(admin,'admin_seller_review',{sellerUid:'seller1',submissionId:old,status:'approved'}),409);
 const submissionId=db.records.get('teyzaMobileVerification/seller1').submissionId;
 await rejects(service.execute(admin,'admin_seller_review',{sellerUid:'seller1',submissionId,status:'needs_new_photo'}),422);
 await service.execute(admin,'admin_seller_review',{sellerUid:'seller1',submissionId,status:'needs_new_photo',reason:'Please retake in good light.'});
 assert.equal(db.records.get('teyzaSellerAccounts/seller1').approvalStatus,'pending');assert.equal(db.records.get('teyzaPublicShops/seller1').status,'suspended');
 assert.equal(db.records.get('teyzaPublicShops/seller1').catalogueEnabled,true);
 assert.equal([...db.records.keys()].filter(k=>k.startsWith('teyzaVerificationPhotos/')).length,2);
});
test('Seller inbox, read actions, preferences and device tokens stay scoped to the authenticated owner',async()=>{
 const {service,db}=fixture({'teyzaSellerNotifications/seller1/items/n1':{title:'One',createdAt:10,read:false},
  'teyzaSellerNotifications/other/items/n2':{title:'Private',createdAt:20,read:false}});
 await rejects(service.execute(buyer,'notification_list'),403);
 assert.deepEqual((await service.execute(owner,'notification_list')).notifications.map(r=>r.id),['n1']);
 await service.execute(owner,'notification_read',{ids:['n1','n2'],ownerUid:'other'});
 assert.equal(db.records.get('teyzaSellerNotifications/seller1/items/n1').read,true);
 assert.equal(db.records.get('teyzaSellerNotifications/other/items/n2').read,false);
 await service.execute(owner,'notification_preferences',{orders:true,messages:true,stock:false,reviews:true});
 assert.equal((await service.execute(owner,'notification_list')).preferences.stock,false);
 const token='firebase-device-token-with-enough-entropy';
 await service.execute(owner,'notification_device_save',{token,platform:'android',ownerUid:'other'});
 const device=[...db.records].find(([k])=>k.startsWith('teyzaMobileDevices/'))[1];assert.equal(device.ownerUid,'seller1');assert(device.expiresAt>1000000);
 await service.execute(owner,'notification_device_delete',{token});assert.equal([...db.records].find(([k])=>k.startsWith('teyzaMobileDevices/'))[1].token,'');
 await rejects(service.execute(owner,'notification_read',{ids:['../other']}),422);
});

test('Notification events deduplicate, respect preferences and deliver generic seller-only phone alerts',async()=>{
 const {createNotifications,notificationFor}=require('./notifications');
 const {db}=fixture({'teyzaMobileDevices/d1':{ownerUid:'seller1',token:'owned-token',expiresAt:2000000},
  'teyzaMobileDevices/d2':{ownerUid:'other',token:'other-token',expiresAt:2000000},
  'teyzaMobileDevices/d3':{ownerUid:'seller1',token:'expired-token',expiresAt:1}});
 const sends=[];const notifications=createNotifications({db,clock:()=>1000000,messaging:{sendEachForMulticast:async value=>{sends.push(value);return {responses:[{success:true}]};}}});
 const value=notificationFor('order',null,{ownerUid:'seller1',status:'requested',shopperName:'PRIVATE CUSTOMER'},'order1');
 await notifications.queue('event1',value);await notifications.queue('event1',value);
 const entries=[...db.records.keys()].filter(k=>k.startsWith('teyzaSellerNotifications/'));assert.equal(entries.length,1);
 await notifications.deliver(db.doc(entries[0]));await notifications.deliver(db.doc(entries[0]));assert.equal(sends.length,1);
 assert.deepEqual(sends[0].tokens,['owned-token']);assert.equal(sends[0].data.ownerUid,'seller1');assert(!JSON.stringify(sends[0]).includes('PRIVATE CUSTOMER'));
 assert.equal(notificationFor('stock',{stockQty:5},{ownerUid:'seller1',status:'draft',stockQty:4},'p'),null);
 assert.equal(notificationFor('stock',{stockQty:6},{ownerUid:'seller1',status:'draft',stockQty:5},'p').category,'stock');
 assert.equal(notificationFor('stock',{stockQty:1},{ownerUid:'seller1',status:'draft',stockQty:0},'p').title,'Product sold out');
 assert.equal(notificationFor('message',null,{sender:'owner'},'thread'),null);
 db.records.set('teyzaSellerNotificationPreferences/seller1',{preferences:{orders:false}});
 await notifications.queue('event2',value);assert.equal([...db.records.keys()].filter(k=>k.startsWith('teyzaSellerNotifications/')).length,1);
});
test('Repeated device registration rotates the oldest device instead of silently blocking new phone alerts',async()=>{
 const seed={};for(let i=0;i<20;i++)seed['teyzaMobileDevices/old'+i]={ownerUid:'seller1',token:'old-token-'+i,updatedAt:i,expiresAt:2000000};
 const {service,db}=fixture(seed);
 await service.execute(owner,'notification_device_save',{token:'new-device-registration-token',platform:'ios'});
 const current=[...db.records].filter(([k,v])=>k.startsWith('teyzaMobileDevices/')&&v.ownerUid==='seller1');
 assert.equal(current.length,20);assert(current.some(([,v])=>v.token==='new-device-registration-token'));
 assert.equal(db.records.get('teyzaMobileDevices/old0').ownerUid,'');
});
test('Selfie retention is recorded before private bytes are uploaded and failed storage never creates a reviewable submission',async()=>{
 const {db}=fixture();let attempted=false;
 const service=createService({db,clock:()=>1000000,sanitizeImage:async b=>b,encryptSelfie:async b=>b,
  bucket:{file:path=>({save:async()=>{attempted=true;assert([...db.records.values()].some(v=>v.objectPath===path&&v.expiresAt===1000000+90*86400000));throw new Error('storage unavailable');}})}});
 const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,23)]);
 await assert.rejects(service.execute(owner,'verification_selfie',{consent:true,imageBase64:jpeg.toString('base64')}));
 assert(attempted);assert.equal(db.records.has('teyzaMobileVerification/seller1'),false);
});

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
 const photo=await service.execute(admin,'verification_read',{sellerUid:'seller1',submissionId:record.submissionId});assert.equal(photo.imageBase64,jpeg.toString('base64'));
 assert.equal(db.records.get('teyzaSellerAccounts/seller1').approvalStatus,'approved');
});
test('Encryption detects tampering; keys and image validation fail closed',()=>{
 const key=Buffer.alloc(32,5).toString('base64'),bytes=Buffer.from('private image');
 const encrypted=C.encrypt(bytes,key);encrypted[encrypted.length-1]^=1;assert.throws(()=>C.decrypt(encrypted,key));
 assert.throws(()=>C.encrypt(bytes,''));assert.throws(()=>D.imageBytes('not an image'));
});
test('Only trusted admins publish approved active shops and priced plans keep their entitlement',async()=>{
 const submission={ownerUid:'seller1',status:'pending_review',products:shop.products};
 const {service,db}=fixture({'teyzaCatalogueSubmissions/seller1':submission,
  'teyzaDraftProducts/seller1/items/bread1':{ownerUid:'seller1',status:'draft',stockQty:5}});
 await rejects(service.execute(owner,'catalogue_review',{sellerUid:'seller1'}),403);
 const admin={...buyer,teyzaAdmin:true};await service.execute(admin,'catalogue_review',{sellerUid:'seller1'});
 assert.equal(db.records.get('teyzaCatalogueSubmissions/seller1').status,'published');
 const basic=fixture({'teyzaCatalogueSubmissions/seller1':submission,'teyzaPublicShops/seller1':{...shop,catalogueEnabled:false},
   'teyzaDraftProducts/seller1/items/bread1':{ownerUid:'seller1',status:'draft',stockQty:5}});
 await basic.service.execute(admin,'catalogue_review',{sellerUid:'seller1'});
 assert.deepEqual(basic.db.records.get('teyzaPublicShops/seller1').products,[]);
 const highlight=basic.db.records.get('teyzaPublicShops/seller1').productHighlights[0];
 assert.equal(highlight.name,'Bread');assert.equal('priceCents' in highlight,false);
 const pending=fixture({'teyzaCatalogueSubmissions/seller1':submission,'teyzaSellerAccounts/seller1':{...seller,approvalStatus:'pending'}});
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
test('The selectable catalogue has 184 products and 48 photo types without invented shop prices or stock',()=>{
 assert.equal(catalogue.templates.size,184);assert.equal(Object.keys(catalogue.data.photos).length,48);
 for(const p of catalogue.templates.values()){
   assert(catalogue.data.photos[p.photo]);assert.equal(p.priceCents,undefined);assert.equal(p.stockQty,undefined);
   assert(D.id(catalogue.prefix+p.id));
 }
});
test('Catalogue selection binds the actor and ignores submitted names, photos, owner and approval fields',async()=>{
 const {service,db}=fixture();
 await rejects(service.execute(buyer,'catalogue_add',{products:[{templateId:'milk-2-l',priceCents:3000,stockQty:4}]}),403);
 const result=await service.execute(owner,'catalogue_add',{ownerUid:'victim',products:[{
   templateId:'milk-2-l',priceCents:3000,stockQty:4,name:'Injected',imageUrl:'https://bad.test/x',status:'approved'}]});
 const id='catalog_milk-2-l',draft=db.records.get('teyzaDraftProducts/seller1/items/'+id);
 assert.equal(result.publication,'live');assert.equal(draft.name,'Full cream milk · 2 L');assert.equal(draft.ownerUid,'seller1');
 const publicProduct=db.records.get('teyzaPublicShops/seller1').products.find(p=>p.id===id);
 assert.equal(publicProduct.priceCents,3000);assert.equal(publicProduct.imageUrl,catalogue.photoUrl('milk'));
 assert.equal(db.records.has('teyzaDraftProducts/victim/items/'+id),false);
});
test('Pending shops save privately and activation publishes only selected names/photos on basic plans',async()=>{
 const {service,db}=fixture({'teyzaSellerAccounts/seller1':{...seller,approvalStatus:'pending'}});
 const input={products:[{templateId:'white-bread-700-g',priceCents:1800,stockQty:2}]};
 assert.equal((await service.execute(owner,'catalogue_add',input)).publication,'private');
 assert(!db.records.get('teyzaPublicShops/seller1').productHighlights.some(p=>p.id==='catalog_white-bread-700-g'));
 db.records.set('teyzaSellerAccounts/seller1',seller);
 db.records.set('teyzaPublicShops/seller1',{...shop,catalogueEnabled:false});
 await service.synchronizeCatalogue('seller1');
 const publicShop=db.records.get('teyzaPublicShops/seller1');
 assert.equal(publicShop.products.length,0);
 const p=publicShop.productHighlights.find(p=>p.id==='catalog_white-bread-700-g');
 assert.equal(p.priceCents,undefined);assert.equal(p.stock,undefined);assert.equal(p.inStock,true);
 assert.equal(publicShop.productHighlights.some(p=>p.id==='catalog_rice-1-kg'),false);
});
test('The same template in two shops retains different prices and stock without cross-shop changes',async()=>{
 const otherSeller={...seller,uid:'seller2',category:'retail'},otherShop={...shop,sellerUid:'seller2',name:'Other Shop'};
 const {service,db}=fixture({'teyzaSellerAccounts/seller2':otherSeller,'teyzaPublicShops/seller2':otherShop});
 await service.execute(owner,'catalogue_add',{products:[{templateId:'rice-1-kg',priceCents:2500,stockQty:8}]});
 await service.execute({...owner,uid:'seller2'},'catalogue_add',{products:[{templateId:'rice-1-kg',priceCents:2800,stockQty:3}]});
 for(const [uid,price,stock] of [['seller1',2500,8],['seller2',2800,3]]){
   const p=db.records.get('teyzaPublicShops/'+uid).products.find(p=>p.id==='catalog_rice-1-kg');
   assert.equal(p.priceCents,price);assert.equal(p.stock,stock);
 }
});
test('Retries preserve reserved stock and synchronization correctly exposes sold-out status',async()=>{
 const {service,db}=fixture();const input={products:[{templateId:'white-bread-700-g',priceCents:1800,stockQty:2}]};
 await service.execute(owner,'catalogue_add',input);
 const requested=await service.execute(buyer,'order_request',{shopId:'seller1',requestId:'catalogue-order',mode:'collection',phone:'0711234567',items:[{id:'catalog_white-bread-700-g',quantity:2}]});
 await service.execute(owner,'order_update',{orderId:requested.id,status:'confirmed'});
 await service.execute(owner,'catalogue_add',input);await service.synchronizeCatalogue('seller1');
 const publicShop=db.records.get('teyzaPublicShops/seller1');
 assert.equal(publicShop.products.find(p=>p.id==='catalog_white-bread-700-g').stock,0);
 assert.equal(publicShop.productHighlights.find(p=>p.id==='catalog_white-bread-700-g').inStock,false);
 assert.equal(db.records.get('teyzaDraftProducts/seller1/items/catalog_white-bread-700-g').stockQty,0);
});
test('Edits, removals and plan changes update the range without filling it with unselected templates',async()=>{
 const {service,db}=fixture();await service.execute(owner,'catalogue_add',{products:[{templateId:'milk-2-l',priceCents:3000,stockQty:4}]});
 const key='teyzaDraftProducts/seller1/items/catalog_milk-2-l';
 db.records.set(key,{...db.records.get(key),priceCents:3200,stockQty:1});await service.synchronizeCatalogue('seller1');
 assert.equal(db.records.get('teyzaPublicShops/seller1').products.find(p=>p.id==='catalog_milk-2-l').priceCents,3200);
 db.records.set('teyzaPublicShops/seller1',{...db.records.get('teyzaPublicShops/seller1'),catalogueEnabled:false});
 await service.synchronizeCatalogue('seller1');assert.equal(db.records.get('teyzaPublicShops/seller1').products.length,0);
 db.records.delete(key);await service.synchronizeCatalogue('seller1',{removedProductId:'catalog_milk-2-l'});
 assert.equal(db.records.get('teyzaPublicShops/seller1').productHighlights.some(p=>p.id==='catalog_milk-2-l'),false);
 assert.equal(db.records.get('teyzaPublicShops/seller1').productHighlights.some(p=>p.id==='catalog_rice-1-kg'),false);
});
test('Invalid selections and forged draft contents cannot publish a made-up catalogue item',async()=>{
 const {service,db}=fixture();
 for(const products of [[{templateId:'invented',priceCents:100,stockQty:1}],[{templateId:'milk-2-l',stockQty:1}],
   [{templateId:'milk-2-l',priceCents:100,stockQty:-1}]])await rejects(service.execute(owner,'catalogue_add',{products}),422);
 db.records.set('teyzaDraftProducts/seller1/items/catalog_milk-2-l',{ownerUid:'another',name:'Injected',category:'Dairy & Eggs',status:'draft',priceCents:100,stockQty:9});
 await service.synchronizeCatalogue('seller1');
 assert(!db.records.get('teyzaPublicShops/seller1').products.some(p=>p.id==='catalog_milk-2-l'));
});
test('Reviewed replacement photos persist and catalogue review uses the current template price and stock',async()=>{
 const {service,db}=fixture();
 await service.execute(owner,'catalogue_add',{products:[{templateId:'milk-2-l',priceCents:3000,stockQty:4}]});
 const url='https://example.test/reviewed-owner-photo.jpg';
 db.records.set('teyzaProductPhotos/seller1/items/catalog_milk-2-l',{ownerUid:'seller1',url});
 await service.execute(owner,'catalogue_submit');
 const key='teyzaDraftProducts/seller1/items/catalog_milk-2-l';
 db.records.set(key,{...db.records.get(key),priceCents:3200,stockQty:2});
 await service.execute({...owner,uid:'admin',teyzaAdmin:true},'catalogue_review',{sellerUid:'seller1'});
 await service.synchronizeCatalogue('seller1');
 const published=db.records.get('teyzaPublicShops/seller1');
 assert.equal(published.products[0].imageUrl,url);assert.equal(published.products[0].priceCents,3200);assert.equal(published.products[0].stock,2);
 assert.equal(published.productHighlights[0].imageUrl,url);
 await service.synchronizeCatalogue('seller1');assert.deepEqual(db.records.get('teyzaPublicShops/seller1'),published);
});

const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,23)]).toString('base64');
const mobile='+27712345678';
const phoneUser={uid:'buyer1',phoneNumber:mobile,providerData:[{providerId:'phone',phoneNumber:mobile}]};
const newOwner={...buyer,email_verified:false};
const registration={legalType:'individual',category:'spaza',shopName:'New Local Shop',phone:'0712345678',address:'KwaMashu, Durban',consent:true};
const personal={legalType:'individual',kind:'passport',documentNumber:'PRIVATE-PASSPORT-123',imageBase64:jpeg,consent:true};
const onboardFixture=(user=phoneUser)=>fixture({}, {getAuthUser:async()=>user});
async function ready(service,{company=false}={}){
 const details=company?{...registration,legalType:'company',companyName:'Local Trading Pty Ltd',registrationNumber:'2026/123456/07'}:registration;
 await service.execute(newOwner,'seller_register',details);
 await service.execute(newOwner,'seller_identity_submit',company?{...details,imageBase64:jpeg}:personal);
 await service.execute(newOwner,'verification_selfie',{consent:true,imageBase64:jpeg});
}
test('A new seller registers and prepares private products before email or mobile verification',async()=>{
 const {service,db}=onboardFixture(null);
 await service.execute(newOwner,'seller_register',registration);
 const saved=await service.execute(newOwner,'catalogue_add',{products:[{templateId:'milk-2-l',priceCents:3000,stockQty:4}]});
 assert.equal(saved.publication,'private');assert(!db.records.has('teyzaPublicShops/buyer1'));
 await rejects(service.execute(newOwner,'seller_onboarding_complete',{phoneVerified:true,status:'active'}),409);
});
test('Completion requires real linked phone, document and selfie; forged completion fields grant nothing',async()=>{
 const {service,db}=onboardFixture();await service.execute(newOwner,'seller_register',registration);
 await rejects(service.execute(newOwner,'seller_onboarding_complete',{identityVerified:true,selfie:true}),409);
 await service.execute(newOwner,'seller_identity_submit',personal);
 await rejects(service.execute(newOwner,'seller_onboarding_complete'),409);
 assert(!db.records.has('teyzaPublicShops/buyer1'));
 for(const user of [null,{...phoneUser,phoneNumber:'+27829999999'},{...phoneUser,providerData:[]},{...phoneUser,disabled:true}]){
  const f=onboardFixture(user);await ready(f.service);await rejects(f.service.execute(newOwner,'seller_onboarding_complete',{phoneVerified:true}),409);
  assert(!f.db.records.has('teyzaPublicShops/buyer1'));
 }
});
test('Document + selfie + OTP enables the actual selected range without claiming manual identity approval or a paid plan',async()=>{
 const {service,db}=onboardFixture();await ready(service);
 await service.execute(newOwner,'catalogue_add',{products:[{templateId:'milk-2-l',priceCents:3000,stockQty:4}]});
 const result=await service.execute(newOwner,'seller_onboarding_complete',{ownerUid:'seller1',catalogueEnabled:true,approvalStatus:'approved'});
 const shop=db.records.get('teyzaPublicShops/buyer1');assert.equal(result.sellingStatus,'active');assert.equal(shop.sellerUid,'buyer1');
 assert.equal(shop.identityVerified,false);assert.equal(shop.verificationStatus,'pending_review');assert.equal(shop.catalogueEnabled,false);
 assert.equal(shop.status,'active');assert.equal(shop.products[0].priceCents,3000);assert.equal(shop.products.length,1);
 assert.equal(db.records.get('teyzaSellerAccounts/buyer1').approvalStatus,'pending');
 assert(!JSON.stringify(shop).includes('PRIVATE-PASSPORT'));assert(!('phone' in shop));
 assert(!('objectPath' in shop));assert(!('detailsEncrypted' in shop));
 const again=await service.execute(newOwner,'seller_onboarding_complete');assert.equal(again.sellingStatus,'active');
 assert.equal(db.records.get('teyzaPublicShops/buyer1').products.length,1);
});
test('Company sellers must provide company registration details and the matching certificate type',async()=>{
 const {service,db}=onboardFixture();
 await rejects(service.execute(newOwner,'seller_register',{...registration,legalType:'company'}),422);
 await service.execute(newOwner,'seller_register',{...registration,legalType:'company',companyName:'Local Trading Pty Ltd',registrationNumber:'2026/123456/07'});
 await rejects(service.execute(newOwner,'seller_identity_submit',personal),409);
 await rejects(service.execute(newOwner,'seller_identity_submit',{legalType:'company',imageBase64:jpeg,consent:true}),422);
 await service.execute(newOwner,'seller_identity_submit',{legalType:'company',companyName:'Local Trading Pty Ltd',registrationNumber:'2026/123456/07',imageBase64:jpeg,consent:true});
 await service.execute(newOwner,'verification_selfie',{consent:true,imageBase64:jpeg});
 await service.execute(newOwner,'seller_onboarding_complete');
 assert.equal(db.records.get('teyzaSellerIdentity/buyer1').kind,'company');assert.equal(db.records.get('teyzaPublicShops/buyer1').sellingEnabled,true);
});
test('Identity numbers and document images are encrypted, private, consented and bound to the actor',async()=>{
 const {service,db,files}=onboardFixture();await service.execute(newOwner,'seller_register',registration);
 await rejects(service.execute(newOwner,'seller_identity_submit',{...personal,consent:false}),422);
 await service.execute(newOwner,'seller_identity_submit',{...personal,sellerUid:'seller1',status:'approved'});
 const record=db.records.get('teyzaSellerIdentity/buyer1');
 assert(!JSON.stringify(record).includes(personal.documentNumber));assert(!files.get(record.objectPath).includes(Buffer.from(jpeg,'base64')));
 assert.equal(db.records.has('teyzaSellerIdentity/seller1'),false);assert(record.objectPath.startsWith('teyza-private/mobile-verification/buyer1/'));
 await rejects(service.execute(owner,'seller_identity_read',{sellerUid:'buyer1',evidenceId:record.evidenceId}),403);
 const reviewer={...owner,teyzaAdmin:true,auth_time:1000};
 const opened=await service.execute(reviewer,'seller_identity_read',{sellerUid:'buyer1',evidenceId:record.evidenceId});
 assert.equal(opened.details.documentNumber,personal.documentNumber);assert.equal(opened.imageBase64,jpeg);
 await rejects(service.execute({...newOwner,teyzaAdmin:true,auth_time:1000},'seller_identity_read',{sellerUid:'buyer1',evidenceId:record.evidenceId}),403);
});
test('Version 2 admin approval requires both current private views and actual OTP, then adds the badge',async()=>{
 const {service,db}=onboardFixture();await ready(service);await service.execute(newOwner,'seller_onboarding_complete');
 const reviewer={...owner,teyzaAdmin:true,auth_time:1000};
 const selfie=db.records.get('teyzaMobileVerification/buyer1'),id=db.records.get('teyzaSellerIdentity/buyer1');
 const decision={sellerUid:'buyer1',submissionId:selfie.submissionId,evidenceId:id.evidenceId,status:'approved'};
 await service.execute(reviewer,'verification_read',decision);
 await rejects(service.execute(reviewer,'admin_seller_review',decision),409);
 await service.execute(reviewer,'seller_identity_read',decision);await service.execute(reviewer,'admin_seller_review',decision);
 assert.equal(db.records.get('teyzaPublicShops/buyer1').identityVerified,true);
 assert.equal(db.records.get('teyzaSellerAccounts/buyer1').listingStatus,'active');
 assert.equal(db.records.get('teyzaPublicShops/buyer1').status,'active');
 assert.equal(db.records.get('teyzaPublicShops/buyer1').catalogueEnabled,false);
});
test('Moderation cannot be bypassed by completing again, uploading replacement files or claiming approval',async()=>{
 const {service,db}=onboardFixture();await ready(service);await service.execute(newOwner,'seller_onboarding_complete');
 const reviewer={...owner,teyzaAdmin:true,auth_time:1000};
 const decision={sellerUid:'buyer1',submissionId:db.records.get('teyzaMobileVerification/buyer1').submissionId,
  evidenceId:db.records.get('teyzaSellerIdentity/buyer1').evidenceId,status:'needs_new_photo',reason:'Please take a clearer selfie.'};
 await service.execute(reviewer,'admin_seller_review',decision);
 await service.execute(newOwner,'seller_identity_submit',personal);await service.execute(newOwner,'verification_selfie',{consent:true,imageBase64:jpeg});
 await rejects(service.execute(newOwner,'seller_onboarding_complete',{approvalStatus:'approved'}),409);
 assert.equal(db.records.get('teyzaPublicShops/buyer1').status,'suspended');
});
test('Phone edits pause selling and synchronization cannot turn the listing back on',async()=>{
 const {service,db}=onboardFixture();await ready(service);await service.execute(newOwner,'seller_onboarding_complete');
 const account=db.records.get('teyzaSellerAccounts/buyer1');db.records.set('teyzaSellerAccounts/buyer1',{...account,phone:'+27829999999'});
 await service.synchronizeCatalogue('buyer1');assert.equal(db.records.get('teyzaPublicShops/buyer1').status,'suspended');
 await service.synchronizeCatalogue('buyer1');assert.equal(db.records.get('teyzaPublicShops/buyer1').status,'suspended');
 await rejects(service.execute(newOwner,'seller_onboarding_complete'),409);
});
test('Phone proof is checked against the account read inside the completion transaction',async()=>{
 const {service,db}=onboardFixture();await ready(service);
 const other=createService({db,clock:()=>1000000,getAuthUser:async()=>{
  db.records.set('teyzaSellerAccounts/buyer1',{...db.records.get('teyzaSellerAccounts/buyer1'),phone:'+27829999999'});return phoneUser;
 }});
 await rejects(other.execute(newOwner,'seller_onboarding_complete'),409);assert(!db.records.has('teyzaPublicShops/buyer1'));
});
test('Replacing evidence invalidates stale administrator decisions and expired documents cannot start selling',async()=>{
 const {service,db}=onboardFixture();await ready(service);
 const reviewer={...owner,teyzaAdmin:true,auth_time:1000},old=db.records.get('teyzaSellerIdentity/buyer1');
 const decision={sellerUid:'buyer1',submissionId:db.records.get('teyzaMobileVerification/buyer1').submissionId,evidenceId:old.evidenceId,status:'approved'};
 await service.execute(reviewer,'seller_identity_read',decision);await service.execute(reviewer,'verification_read',decision);
 await service.execute(newOwner,'seller_identity_submit',personal);
 await rejects(service.execute(reviewer,'admin_seller_review',decision),409);
 const id=db.records.get('teyzaSellerIdentity/buyer1');db.records.set('teyzaSellerIdentity/buyer1',{...id,expiresAt:1});
 await rejects(service.execute(newOwner,'seller_onboarding_complete'),409);
});
test('Instant phone bootstrap is owner-bound, grants no OTP status and cannot renew administrator review access',async()=>{
 const issued=[];const f=fixture({}, {getAuthUser:async uid=>({uid}),createPhoneToken:async uid=>{issued.push(uid);return 'native-link-token';}});
 await f.service.execute(newOwner,'seller_register',registration);
 const result=await f.service.execute(newOwner,'seller_phone_session',{uid:'seller1',phoneVerified:true});
 assert.equal(result.uid,'buyer1');assert.equal(result.token,'native-link-token');assert.deepEqual(issued,['buyer1']);
 assert.equal(f.db.records.get('teyzaSellerOnboarding/buyer1').sellingStatus,'not_started');
 await rejects(f.service.execute({...owner,teyzaAdmin:true,teyzaPhoneBootstrap:true,auth_time:1000},'admin_seller_queue'),401);
 await rejects(f.service.execute({...newOwner,uid:'unregistered'},'seller_phone_session'),403);
});

test('Upload readiness checks the real bucket and encryption configuration',async()=>{
 const {uploadReadiness}=require('./upload-storage'),secret=Buffer.alloc(32,1).toString('base64');
 assert.equal((await uploadReadiness({getMetadata:async()=>[{}]},secret)).verificationUploads,true);
 for(const [code,expected] of [[404,'UPLOAD_STORAGE_MISSING'],[403,'UPLOAD_STORAGE_ACCESS'],[500,'UPLOAD_STORAGE_UNAVAILABLE']]){
  const result=await uploadReadiness({getMetadata:async()=>{throw Object.assign(new Error('private details'),{code});}},secret);
  assert.equal(result.verificationUploads,false);assert.equal(result.uploadStatus,expected);assert(!JSON.stringify(result).includes('private details'));
 }
 assert.equal((await uploadReadiness({},'bad')).uploadStatus,'VERIFICATION_KEY_NOT_CONFIGURED');
});
test('A missing bucket gives an actionable error without accepting private evidence',async()=>{
 const bucket={file:()=>({save:async()=>{throw Object.assign(new Error('bucket missing'),{code:404});}})};
 const {service,db}=fixture({}, {bucket});const imageBase64=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,23)]).toString('base64');
 await assert.rejects(service.execute(owner,'verification_selfie',{imageBase64,consent:true}),e=>e.status===503&&e.code==='UPLOAD_STORAGE_MISSING');
 assert.equal(db.records.has('teyzaMobileVerification/seller1'),false);
 await assert.rejects(service.execute(owner,'seller_identity_submit',{legalType:'individual',kind:'id',documentNumber:'test-id',imageBase64,consent:true}),e=>e.code==='UPLOAD_STORAGE_MISSING');
 assert.equal(db.records.has('teyzaSellerIdentity/seller1'),false);
});
test('Shop-front upload binds the owner, requires public-photo consent and preserves stock and plan',async()=>{
 const {service,db}=fixture();const imageBase64=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,23)]).toString('base64');
 await rejects(service.execute(owner,'shop_front_submit',{imageBase64}),422);
 await rejects(service.execute(buyer,'shop_front_submit',{imageBase64,consent:true,ownerUid:'seller1'}),403);
 const saved=await service.execute(owner,'shop_front_submit',{imageBase64,consent:true,ownerUid:'other'});
 const record=db.records.get('teyzaShopFrontPhotos/seller1');assert.equal(record.ownerUid,'seller1');assert(record.objectPath.startsWith('teyza/shop-fronts/seller1/'));
 const published=db.records.get('teyzaPublicShops/seller1');assert(published.photoUrl.includes('shopPhoto=seller1'));
 assert.deepEqual(published.products,shop.products);assert.equal(published.catalogueEnabled,true);
 assert.equal((await service.execute(owner,'shop_front_read')).shopFront.imageBase64,imageBase64);
 assert((await service.publicShopPhoto('seller1',saved.photoId)).length>0);
 await rejects(service.publicShopPhoto('seller1','wrong-photo'),404);
 db.records.set('teyzaPublicShops/seller1',{...published,status:'suspended'});
 await rejects(service.publicShopPhoto('seller1',saved.photoId),404);
});
test('A pending shop can prepare its front photo without publishing it or exposing identity images',async()=>{
 const {service,db}=fixture({'teyzaPublicShops/seller1':{...shop,status:'not_listed'}});
 const imageBase64=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(150,23)]).toString('base64');
 const saved=await service.execute({...owner,email_verified:false},'shop_front_submit',{imageBase64,consent:true});
 assert.equal(db.records.get('teyzaPublicShops/seller1').photoUrl,undefined);
 await rejects(service.publicShopPhoto('seller1',saved.photoId),404);
 db.records.set('teyzaPublicShops/seller1',shop);
 db.records.set('teyzaShopFrontPhotos/seller1',{ownerUid:'seller1',photoId:saved.photoId,objectPath:'teyza-private/mobile-verification/seller1/private.enc'});
 await rejects(service.publicShopPhoto('seller1',saved.photoId),404);
});
