'use strict';
const D = require('./domain');
const {saveUpload}=require('./upload-storage');
const {createShopFront,valid:validShopFront}=require('./shop-front');
const offers=require('./shop-services');
const crypto = require('node:crypto');
const experience=require('./seller-experience');
const catalogue=require('./catalogue');
const onboarding=require('./onboarding');
const operations=require('./operations');
const mandate=require('./mandate');
const fieldAgents=require('./field-agents');
const ratings=require('./ratings');
const P=require('./publication');
const locations=require('./shop-location');
const addresses=require('./shop-address');

function createService({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getAuthUser=async()=>null,createPhoneToken,
  getPlacesKey=()=>'',getAddressSigningKey=()=>'',addressFetch=fetch,clock=Date.now}) {
  const doc = path => db.doc(path);
  const read = async path => { const snap = await doc(path).get(); return snap.exists?snap.data():null; };
  const owner = async uid => D.seller(await read('teyzaSellerAccounts/'+uid),uid);
  const active = async uid => {
    const [shop,account,setup,verification]=await Promise.all(['teyzaPublicShops/','teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/'].map(p=>read(p+uid)));
    return P.assertLive(uid,account,setup||{},verification,shop);
  };
  async function requireApproval(tx,uid,shop){
    const [a,o,v]=await Promise.all(['teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/'].map(p=>tx.get(doc(p+uid))));
    return P.assertLive(uid,a.exists?a.data():null,o.exists?o.data():{},v.exists?v.data():null,shop);
  }
  async function synchronizeCatalogue(uid,{additions=[],removedProductId=null}={}) {
    D.id(uid);
    return db.runTransaction(async tx=>{
      const accountRef=doc('teyzaSellerAccounts/'+uid),shopRef=doc('teyzaPublicShops/'+uid);
      const setupRef=doc('teyzaSellerOnboarding/'+uid);
      const [accountSnap,shopSnap,draftSnap,setupSnap,verificationSnap,settingsSnap,frontSnap,locationSnap]=await Promise.all([
        tx.get(accountRef),tx.get(shopRef),tx.get(db.collection('teyzaDraftProducts/'+uid+'/items').limit(201)),tx.get(setupRef),tx.get(doc('teyzaMobileVerification/'+uid)),tx.get(doc('teyzaShopSettings/'+uid)),tx.get(doc('teyzaShopFrontPhotos/'+uid)),tx.get(doc('teyzaShopLocations/'+uid))]);
      const account=accountSnap.exists?accountSnap.data():null;
      const registered=account?.uid===uid&&['spaza','retail'].includes(account.category);
      if(additions.length&&!registered)D.fail(403,'Register your shop with this account first.');
      const entries=draftSnap.docs.map(x=>({id:x.id,data:x.data()}));
      const existing=new Map(entries.map(p=>[p.id,p.data]));
      const added=[];let alreadyAdded=0;
      for(const row of additions){
        if(existing.has(row.id)){
          const old=existing.get(row.id);
          if(old.ownerUid!==uid||old.status!=='draft')D.fail(409,'This product reference is already in use. Refresh your products.');
          alreadyAdded++;continue; // A retry must never reset stock already reserved by an order.
        }
        const record={...row,ownerUid:uid,createdAt:new Date(clock()),updatedAt:new Date(clock())};
        entries.push({id:row.id,data:record});added.push({id:row.id,record});
      }
      if(additions.length&&entries.length>200)D.fail(422,'A shop can list up to 200 products. Remove an unused product first.');
      const shop=shopSnap.exists?shopSnap.data():null;
      const setup=setupSnap.exists?setupSnap.data():{};
      const verification=verificationSnap.exists?verificationSnap.data():null;
      const next=P.project(uid,{account,setup,verification,shop,settings:settingsSnap.exists?settingsSnap.data():{},
        front:frontSnap.exists?frontSnap.data():null,location:locationSnap.exists?locationSnap.data():null,drafts:entries,removedProductId,now:clock()});
      const eligible=next?.status==='active';
      if(next){
        const listing=eligible?'active':'not_listed';
        if(account.listingStatus!==listing)tx.update(accountRef,{listingStatus:listing,updatedAt:new Date(clock())});
        if(setup.requiredVersion===2&&setup.completedAt){
          const sellingStatus=eligible?'active':next.status==='pending_review'?'pending_approval':next.status==='suspended'?'paused':'not_started';
          if(setup.sellingStatus!==sellingStatus)tx.set(setupRef,{sellingStatus,updatedAt:clock()},{merge:true});
        }
      }
      for(const item of added)tx.set(doc('teyzaDraftProducts/'+uid+'/items/'+item.id),item.record);
      if(next&&JSON.stringify(next)!==JSON.stringify(shop))tx.set(shopRef,{...next,updatedAt:clock()});
      return {addedIds:added.map(p=>p.id),alreadyAdded,publication:eligible?'live':'private',
        publicCount:eligible?next?.productHighlights.length||0:0};
    });
  }
  async function rate(uid,kind,max,window) {
    const ref=doc('teyzaMobileLimits/'+uid+'_'+kind);
    await db.runTransaction(async tx => {
      const saved=await tx.get(ref),old=saved.exists?saved.data():{};
      const fresh=clock()-(old.start||0)>=window;
      const count=fresh?0:(old.count||0);
      if(count>=max)D.fail(429,'Please wait before trying again.');
      tx.set(ref,{start:fresh?clock():old.start,count:count+1});
    });
  }
  const sellerMandate=mandate.createMandate({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,clock,rate});
  const agentWorkspace=fieldAgents.createFieldAgents({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,clock,rate});
  const shopRatings=ratings.createRatings({db,clock,rate});
  const shopAddress=addresses.createShopAddress({getPlacesKey,getSigningKey:getAddressSigningKey,fetchImpl:addressFetch,clock,rate});
  const shopLocation=locations.createShopLocation({db,clock,rate,synchronize:synchronizeCatalogue,shopAddress});
  const adminOperations=operations.createOperations({db,clock,rate});
  const sellerExperience=experience.createSellerExperience({db,clock,rate,getAuthUser,shopAddress});
  const sellerOnboarding=onboarding.createOnboarding({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getAuthUser,createPhoneToken,clock,rate});
  async function syncSettings(uid,values) {
    const ref=doc('teyzaPublicShops/'+uid);
    await db.runTransaction(async tx => {
      const [snap,accountSnap,setupSnap,v]=await Promise.all([tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaSellerOnboarding/'+uid)),tx.get(doc('teyzaMobileVerification/'+uid))]);
      const setup=setupSnap.exists?setupSnap.data():{};
      const account=D.seller(accountSnap.exists?accountSnap.data():null,uid);
      if(!snap.exists||snap.data().status!=='active'||!P.state(uid,account,setup,v.exists?v.data():null,snap.data()).live)return;
      const update={};
      if(values.hours)update.hours=values.hours;
      if('pickupEnabled' in values) {
        Object.assign(update,offers.exposed(values));
      }
      tx.update(ref,update);
    });
  }
  const shopFront=createShopFront({db,bucket,sanitizeImage,clock,rate});
  async function execute(auth, action, data={}) {
    if(!auth?.uid)D.fail(401,'Sign in to continue.');
    const uid=D.id(auth.uid);
    if(fieldAgents.actions.has(action))return agentWorkspace.execute(auth,action,data);
    if(addresses.actions.has(action))return shopAddress.execute(uid,action,data);
    if(locations.actions.has(action))return shopLocation.execute(auth,action,data);
    if(ratings.actions.has(action))return shopRatings.execute(auth,action,data);
    if(mandate.actions.has(action))return sellerMandate.execute(auth,action,data);
    if(operations.actions.has(action))return adminOperations.execute(auth,action,data);
    if(['shop_front_read','shop_front_submit'].includes(action))return shopFront.execute(auth,action,data);
    if(onboarding.actions.has(action))return sellerOnboarding.execute(auth,action,data);
    if (!auth.email_verified&&!auth.phone_number&&!['seller_register','verification_selfie','seller_summary','catalogue_add','catalogue_sync'].includes(action))
      D.fail(403,'Verify your email or mobile number before using shop services or sending requests.');
    if(experience.actions.has(action))return sellerExperience.execute(auth,action,data);
    if(action==='catalogue_add'||action==='catalogue_sync'){
      await owner(uid);await rate(uid,'catalogue-edit',30,60000);
      return synchronizeCatalogue(uid,{additions:action==='catalogue_add'?catalogue.selection(data.products):[],
        removedProductId:action==='catalogue_sync'&&data.removedProductId?D.id(data.removedProductId):null});
    }
    if (action==='seller_summary') {
      await owner(uid);await synchronizeCatalogue(uid);
      const account=await owner(uid);
      const [config,verification,finance,catalogue,photos,publicShop,setup,location,front]=await Promise.all([
        read('teyzaShopSettings/'+uid),read('teyzaMobileVerification/'+uid),
        db.collection('teyzaCreditEnquiries/'+uid+'/requests').orderBy('createdAt','desc').limit(30).get(),
        read('teyzaCatalogueSubmissions/'+uid),db.collection('teyzaProductPhotos/'+uid+'/items').limit(200).get(),
        read('teyzaPublicShops/'+uid),read('teyzaSellerOnboarding/'+uid),read('teyzaShopLocations/'+uid),read('teyzaShopFrontPhotos/'+uid)]);
      const publication=P.state(uid,account,setup||{},verification,publicShop),pin=P.locationFor(uid,account,location,publicShop,clock());
      return {settings:{...(config||{}),...offers.effective(config,publicShop)},shopFront:validShopFront(front,uid)?{photoId:front.photoId}:null,
        approvalStatus:publication.approved?'approved':'pending',setupComplete:publication.ready,
        location:pin,hasLocation:Boolean(pin),publicationStatus:publication.live&&publicShop?.status==='active'?'active':publication.status,
        sellingEnabled:publication.live&&publicShop?.sellingEnabled===true,identityVerified:publication.approved,
        verification:verification?{status:verification.status,submittedAt:verification.submittedAt,reviewNote:verification.reviewNote||''}:null,
        credit:finance.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>b.createdAt-a.createdAt),
        rating:publicShop?.ratingSource==='teyza_completed_orders'?publicShop.rating:null,
        ratingCount:publicShop?.ratingSource==='teyza_completed_orders'?publicShop.ratingCount:0,
        catalogueStatus:catalogue?.status||'not_submitted',photos:photos.docs.map(x=>({id:x.id,url:x.data().url}))};
    }
    if(action==='update_services'){
      await owner(uid);await rate(uid,'settings',40,60000);
      const allowed=['deliveryEnabled','pickupEnabled','cashback','cardPayments','liveChatEnabled','deliveryFeeCents','deliveryRadiusKm','deliveryNotes','cashDiscountPercent','cardPaymentFeePercent'];
      if(!Object.keys(data).length||Object.keys(data).some(k=>!allowed.includes(k)))D.fail(422,'Choose valid shop service settings.');
      const values=await db.runTransaction(async tx=>{
        const ref=doc('teyzaShopSettings/'+uid);
        const [s,a,p]=await Promise.all([tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaPublicShops/'+uid))]);
        D.seller(a.exists?a.data():null,uid);
        const next=D.settings({...offers.effective(s.exists?s.data():null,p.exists?p.data():null),...data});
        tx.set(ref,{...next,ownerUid:uid,updatedAt:clock()},{merge:true});return next;
      });
      await syncSettings(uid,values);return {saved:true,settings:values};
    }
    if(action==='save_services'||action==='save_hours'||action==='save_restock') {
      await owner(uid);await rate(uid,'settings',40,60000);
      let values;
      if(action==='save_services'){
        values=await db.runTransaction(async tx=>{
          const ref=doc('teyzaShopSettings/'+uid);
          const [s,a]=await Promise.all([tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+uid))]);
          D.seller(a.exists?a.data():null,uid);
          // Older app versions do not send this optional setting. Preserve the
          // seller's choice until a current client explicitly changes it.
          const next=D.settings({...data,cashDiscountPercent:Object.hasOwn(data,'cashDiscountPercent')?
            data.cashDiscountPercent:offers.effective(s.exists?s.data():null).cashDiscountPercent});
          tx.set(ref,{...next,ownerUid:uid,updatedAt:clock()},{merge:true});return next;
        });
      }else{
        values=action==='save_hours'?{hours:D.hours(data.hours),timezone:'Africa/Johannesburg'}:{restockList:D.restock(data.items)};
        await doc('teyzaShopSettings/'+uid).set({...values,ownerUid:uid,updatedAt:clock()},{merge:true});
      }
      if(action!=='save_restock')await syncSettings(uid,values);
      return {saved:true};
    }
    if(action==='credit_enquiry') {
      await owner(uid);const values=D.credit(data);await rate(uid,'credit',3,86400000);
      const ref=db.collection('teyzaCreditEnquiries/'+uid+'/requests').doc();
      await ref.set({...values,ownerUid:uid,ownerEmail:auth.email||'',createdAt:clock()});
      return {id:ref.id,status:values.status};
    }
    if(action==='verification_selfie'||action==='product_photo') {
      await owner(uid);
      if(data.consent!==true)D.fail(422,'Confirm that you want to submit this photo.');
      const bytes=D.imageBytes(data.imageBase64);
      await rate(uid,action,action==='verification_selfie'?5:30,3600000);
      let jpeg;try{jpeg=await sanitizeImage(bytes);}catch(_){D.fail(422,'This photo could not be read. Take another photo.');}
      const stamp=clock();
      if(action==='verification_selfie') {
        const submissionId=crypto.randomUUID();
        const path='teyza-private/mobile-verification/'+uid+'/'+submissionId+'.enc';
        const encrypted=await encryptSelfie(jpeg);
        // Register cleanup first: an interrupted upload must not orphan a private photo.
        await doc('teyzaVerificationPhotos/'+submissionId).set({ownerUid:uid,objectPath:path,expiresAt:stamp+90*86400000});
        await saveUpload(bucket,path,encrypted,{contentType:'application/octet-stream',resumable:false,
          metadata:{cacheControl:'private,no-store'}});
        await db.runTransaction(async tx=>{
          const ref=doc('teyzaPublicShops/'+uid),accountRef=doc('teyzaSellerAccounts/'+uid),setupRef=doc('teyzaSellerOnboarding/'+uid);
          const [snap,a,o]=await Promise.all([tx.get(ref),tx.get(accountRef),tx.get(setupRef)]);
          D.seller(a.exists?a.data():null,uid);
          tx.update(accountRef,{approvalStatus:'pending',listingStatus:'not_listed',updatedAt:new Date(stamp)});
          if(o.exists&&o.data().requiredVersion===2)tx.set(setupRef,{sellingStatus:'not_started',updatedAt:stamp},{merge:true});
          tx.set(doc('teyzaMobileVerification/'+uid),{ownerUid:uid,status:'pending_review',submissionId,
            method:'selfie_manual_review',objectPath:path,submittedAt:stamp,expiresAt:stamp+90*86400000,
            consentVersion:'selfie-review-v1',consentAt:stamp});
          if(snap.exists&&snap.data().sellerUid===uid)tx.update(ref,{sellingEnabled:false,approvalStatus:'pending',identityVerified:false,verificationStatus:'pending_review',...(!P.held(snap.data())&&o.data()?.moderationBlocked!==true?{status:'pending_setup',moderationSource:'onboarding'}:{})});
        });
        return {status:'pending_review'};
      }
      const productId=D.id(data.productId);
      const product=await read('teyzaDraftProducts/'+uid+'/items/'+productId);
      if(!product||product.ownerUid!==uid||product.status!=='draft')D.fail(403,'Save your product draft before adding its photo.');
      const token=crypto.randomUUID(),path='teyza/product-photos/'+uid+'/'+productId+'/'+token+'.jpg';
      await saveUpload(bucket,path,jpeg,{contentType:'image/jpeg',resumable:false,
        metadata:{metadata:{firebaseStorageDownloadTokens:token}}});
      const url='https://firebasestorage.googleapis.com/v0/b/'+bucket.name+'/o/'+encodeURIComponent(path)+'?alt=media&token='+token;
      await doc('teyzaProductPhotos/'+uid+'/items/'+productId).set({ownerUid:uid,url,objectPath:path,updatedAt:stamp});
      return {url};
    }
    if(action==='verification_review')D.fail(409,'Use the current seller review screen to review a submission.');
    if(action==='verification_read') {
      experience.recentAdmin(auth,clock);
      const target=D.id(data.sellerUid),ref=doc('teyzaMobileVerification/'+target),record=await read(ref.path);
      if(target===uid)D.fail(403,'Another administrator must review your own shop.');
      if(!record||record.ownerUid!==target||record.expiresAt<=clock()||!record.objectPath||
        !record.objectPath.startsWith('teyza-private/mobile-verification/'+target+'/'))D.fail(404,'No current selfie submission is available.');
      const submissionId=record.submissionId||'legacy_'+record.submittedAt;
      if(data.submissionId!==submissionId)D.fail(409,'This selfie changed. Refresh the review queue.');
      const [bytes]=await bucket.file(record.objectPath).download();
      await doc('teyzaVerificationViews/'+uid+'/submissions/'+submissionId).set({sellerUid:target,viewedAt:clock()});
      return {imageBase64:(await decryptSelfie(bytes)).toString('base64')};
    }
    if(action==='catalogue_submit') {
      await owner(uid);await rate(uid,'catalogue',10,3600000);
      const [drafts,photos]=await Promise.all([db.collection('teyzaDraftProducts/'+uid+'/items').limit(200).get(),db.collection('teyzaProductPhotos/'+uid+'/items').get()]);
      const images=Object.fromEntries(photos.docs.map(x=>[x.id,x.data().url]));
      const products=drafts.docs.filter(x=>x.data().ownerUid===uid&&x.data().status==='draft').map(x=>{
        const p=x.data(),template=catalogue.templateFor(x.id);return {id:x.id,name:p.name,category:p.category,priceCents:p.priceCents,stock:p.stockQty,
          imageUrl:images[x.id]||(template?catalogue.photoUrl(template.photo):'')};
      });
      if(!products.length)D.fail(422,'Add at least one product before submitting your catalogue.');
      // Validate stored drafts again. A client cannot publish a pending shop or enable priced listings.
      for(const p of products){
        if(!Number.isInteger(p.stock)||p.stock<0||p.stock>100000)D.fail(422,'Check the available stock on each product.');
        D.text(p.category,'product category',60);
        D.orderItems([{id:p.id,quantity:1}],[{...p,stock:Math.max(1,p.stock)}]);
      }
      await doc('teyzaCatalogueSubmissions/'+uid).set({ownerUid:uid,status:'pending_review',products,submittedAt:clock()});
      return {status:'pending_review'};
    }
    if(action==='catalogue_review') {
      if(auth.teyzaAdmin!==true)D.fail(403,'Teyza administrator access is required.');
      const sellerUid=D.id(data.sellerUid);
      return db.runTransaction(async tx=>{
        const accountRef=doc('teyzaSellerAccounts/'+sellerUid),shopRef=doc('teyzaPublicShops/'+sellerUid),submissionRef=doc('teyzaCatalogueSubmissions/'+sellerUid);
        const [accountSnap,shopSnap,submissionSnap]=await Promise.all([tx.get(accountRef),tx.get(shopRef),tx.get(submissionRef)]);
        const account=D.seller(accountSnap.exists?accountSnap.data():null,sellerUid);
        const shop=await requireApproval(tx,sellerUid,shopSnap.exists?shopSnap.data():null);
        const submission=submissionSnap.exists?submissionSnap.data():null;
        if((account.approvalStatus!=='approved'||account.listingStatus!=='active')&&shop.sellingEnabled!==true)
          D.fail(409,'Approve and activate the shop before publishing a catalogue.');
        if(submission?.status!=='pending_review'||!Array.isArray(submission.products)||submission.products.length>200)
          D.fail(409,'There is no pending catalogue to review.');
        const drafts=await Promise.all(submission.products.map(p=>tx.get(doc('teyzaDraftProducts/'+sellerUid+'/items/'+D.id(p.id)))));
        const products=submission.products.map((p,index)=>{
          const current=drafts[index].exists?drafts[index].data():null;
          if(!current||current.ownerUid!==sellerUid||current.status!=='draft'||!Number.isInteger(current.stockQty)||current.stockQty<0)
            D.fail(409,'The product drafts changed. Ask the shop to resubmit its catalogue.');
          const template=catalogue.templateFor(p.id),currentProduct=template?catalogue.canonical(sellerUid,{id:p.id,data:current}):null;
          if(template&&!currentProduct)D.fail(409,'This catalogue product changed. Use a custom product for a different item.');
          return currentProduct?{...currentProduct,imageUrl:p.imageUrl||currentProduct.imageUrl,
            customPhotoApproved:Boolean(p.imageUrl&&p.imageUrl!==currentProduct.imageUrl)}:{...p,stock:current.stockQty};
        });
        const productHighlights=products.map(({priceCents,stock,...p})=>({...p,inStock:stock>0}));
        tx.update(shopRef,{products:shop.catalogueEnabled===true||shop.sellingEnabled===true?products:[],productHighlights});
        tx.update(submissionRef,{status:'published',reviewedBy:uid,reviewedAt:clock()});
        return {status:'published'};
      });
    }
    if(action==='chat_open') {
      const sellerUid=D.id(data.shopId);
      if(sellerUid===uid)D.fail(422,'Open Live chat on your seller dashboard to reply to shoppers.');
      const shop=await active(sellerUid),settings=await read('teyzaShopSettings/'+sellerUid);
      if(settings?.liveChatEnabled===false)D.fail(409,'This shop is not accepting chat messages right now.');
      await rate(uid,'chatopen',20,60000);
      const ref=doc('teyzaMobileChats/'+D.threadId(sellerUid,uid));
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(snap.exists)D.member(snap.data(),uid);
        for(const member of [sellerUid,uid])tx.set(doc('teyzaMobileChatIndex/'+member+'/threads/'+ref.id),{updatedAt:snap.exists?snap.data().updatedAt:clock()});
        if(snap.exists)return;
        tx.set(ref,{ownerUid:sellerUid,shopperUid:uid,members:[sellerUid,uid],shopName:shop.name,
          shopperName:auth.name||auth.email||'Shopper',lastMessage:'',messageCount:0,updatedAt:clock(),ownerUnread:0,shopperUnread:0});
      });
      return {threadId:ref.id};
    }
    if(action==='chat_list') {
      const ownerMode=data.asOwner===true;if(ownerMode)await owner(uid);
      const index=await db.collection('teyzaMobileChatIndex/'+uid+'/threads').orderBy('updatedAt','desc').limit(100).get();
      const rows=await Promise.all(index.docs.map(x=>doc('teyzaMobileChats/'+x.id).get()));
      return {scope:ownerMode?'owner':'all',threads:rows.filter(x=>x.exists&&(!ownerMode||x.data().ownerUid===uid)).map(x=>{
        const t=D.member(x.data(),uid);return {id:x.id,name:t.ownerUid===uid?t.shopperName:t.shopName,
          lastMessage:t.lastMessage,updatedAt:t.updatedAt,unread:t.ownerUid===uid?t.ownerUnread:t.shopperUnread};
      }).sort((a,b)=>b.updatedAt-a.updatedAt)};
    }
    if(action==='chat_read'||action==='chat_send') {
      const ref=doc('teyzaMobileChats/'+D.id(data.threadId));
      const thread=D.member(await read(ref.path),uid);
      if(action==='chat_send') {
        const message=D.text(data.message,'message',1000),messageId=D.id(data.messageId);
        const config=await read('teyzaShopSettings/'+thread.ownerUid);
        await active(thread.ownerUid);
        if(config?.liveChatEnabled===false)D.fail(409,'Chat is paused for this shop.');
        await rate(uid,'message',30,60000);
        const entry=ref.collection('messages').doc(messageId);
        await db.runTransaction(async tx=>{
          const [snapshot,existing]=await Promise.all([tx.get(ref),tx.get(entry)]);
          const t=D.member(snapshot.exists?snapshot.data():null,uid);
          if(existing.exists)return;
          const ownerMessage=t.ownerUid===uid;
          tx.set(entry,{senderUid:uid,sender:ownerMessage?'owner':'shopper',text:message,createdAt:clock(),sequence:(t.messageCount||0)+1});
          for(const member of [t.ownerUid,t.shopperUid])tx.set(doc('teyzaMobileChatIndex/'+member+'/threads/'+ref.id),{updatedAt:clock()});
          tx.update(ref,{lastMessage:message,lastMessageId:messageId,messageCount:(t.messageCount||0)+1,updatedAt:clock(),
            [ownerMessage?'shopperUnread':'ownerUnread']:(t[ownerMessage?'shopperUnread':'ownerUnread']||0)+1});
        });
      }
      const messages=await ref.collection('messages').orderBy('sequence','desc').limit(60).get();
      await db.runTransaction(async tx=>{
        const current=await tx.get(ref),t=D.member(current.exists?current.data():null,uid);
        if((t.lastMessageId||null)===(thread.lastMessageId||null))tx.update(ref,{[t.ownerUid===uid?'ownerUnread':'shopperUnread']:0});
      });
      return {messages:messages.docs.map(x=>({id:x.id,...x.data()})).reverse()};
    }
    if(action==='order_chat') {
      const order=await read('teyzaMobileOrders/'+D.id(data.orderId));
      if(!order||![order.ownerUid,order.shopperUid].includes(uid))D.fail(403,'Order access denied.');
      const ref=doc('teyzaMobileChats/'+D.threadId(order.ownerUid,order.shopperUid));
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(snap.exists)D.member(snap.data(),uid);
        for(const member of [order.ownerUid,order.shopperUid])tx.set(doc('teyzaMobileChatIndex/'+member+'/threads/'+ref.id),{updatedAt:snap.exists?snap.data().updatedAt:clock()});
        if(snap.exists)return;
        tx.set(ref,{ownerUid:order.ownerUid,shopperUid:order.shopperUid,members:[order.ownerUid,order.shopperUid],
          shopName:order.shopName,shopperName:order.shopperName,lastMessage:'',messageCount:0,updatedAt:clock(),ownerUnread:0,shopperUnread:0});
      });return {threadId:ref.id};
    }
    if(action==='order_list') {
      const ownerMode=data.asOwner===true;if(ownerMode)await owner(uid);
      const index=await db.collection('teyzaMobileOrderIndex/'+uid+'/'+(ownerMode?'ownerOrders':'shopperOrders')).orderBy('createdAt','desc').limit(100).get();
      const rows=await Promise.all(index.docs.map(x=>doc('teyzaMobileOrders/'+x.id).get()));
      return {orders:rows.filter(x=>x.exists&&x.data()[ownerMode?'ownerUid':'shopperUid']===uid).map(x=>({id:x.id,...x.data()})).sort((a,b)=>b.createdAt-a.createdAt)};
    }
    if(action==='order_quote'){
      const sellerUid=D.id(data.shopId);if(sellerUid===uid)D.fail(422,'Choose another shop to place an order.');
      await rate(uid,'order-quotes',60,60000);
      return {quote:offers.quote(await active(sellerUid),await read('teyzaShopSettings/'+sellerUid),data)};
    }
    if(action==='order_request') {
      const sellerUid=D.id(data.shopId),requestId=D.id(data.requestId);
      if(sellerUid===uid)D.fail(422,'Choose another shop to place an order.');
      if(!['collection','delivery'].includes(data.mode))D.fail(422,'Choose delivery or collection.');
      const address=data.mode==='delivery'?D.text(data.address,'delivery address',300):'';
      const phone=D.text(data.phone,'contact number',25);
      await rate(uid,'orders',20,3600000);
      const ref=doc('teyzaMobileOrders/'+D.threadId(uid,requestId)),shopRef=doc('teyzaPublicShops/'+sellerUid);
      return db.runTransaction(async tx=>{
        const [existing,shopSnap,config]=await Promise.all([tx.get(ref),tx.get(shopRef),tx.get(doc('teyzaShopSettings/'+sellerUid))]);
        if(existing.exists){if(existing.data().shopperUid!==uid)D.fail(403,'Order access denied.');return {id:ref.id,status:existing.data().status};}
        const shop=await requireApproval(tx,sellerUid,shopSnap.exists?shopSnap.data():null);
        const estimate=offers.quote(shop,config.exists?config.data():null,data);
        if(data.expectedQuoteId!==undefined&&data.expectedQuoteId!==estimate.quoteId)D.fail(409,'Prices or shop services changed. Refresh the order total before sending this request.');
        const {items,subtotalCents,deliveryFeeCents,totalCents,paymentMethod,cashDiscountCents,cashDiscountPercent,cardFeeCents}=estimate;
        tx.set(ref,{ownerUid:sellerUid,shopperUid:uid,shopName:shop.name,shopperName:auth.name||auth.email||'Shopper',
          mode:data.mode,address,phone,items,subtotalCents,deliveryFeeCents,totalCents,paymentMethod,cashDiscountCents,cashDiscountPercent,cardFeeCents,
          status:'requested',paymentStatus:'arrange_with_shop',createdAt:clock(),updatedAt:clock(),reserved:false});
        tx.set(doc('teyzaMobileOrderIndex/'+uid+'/shopperOrders/'+ref.id),{createdAt:clock()});
        tx.set(doc('teyzaMobileOrderIndex/'+sellerUid+'/ownerOrders/'+ref.id),{createdAt:clock()});
        return {id:ref.id,status:'requested',totalCents};
      });
    }
    if(action==='order_update') {
      const orderRef=doc('teyzaMobileOrders/'+D.id(data.orderId));
      await rate(uid,'orderupdates',60,60000);
      return db.runTransaction(async tx=>{
        const snapshot=await tx.get(orderRef),order=snapshot.exists?snapshot.data():null;
        if(!order||![order.ownerUid,order.shopperUid].includes(uid))D.fail(403,'Order access denied.');
        const isOwner=order.ownerUid===uid;
        const next=D.transition(order,data.status,isOwner);
        if(next==='confirmed'||(next==='cancelled'&&order.reserved)) {
          const ref=doc('teyzaPublicShops/'+order.ownerUid),shopSnap=await tx.get(ref);
          const shop=shopSnap.exists?shopSnap.data():null;
          if(next==='confirmed'){await requireApproval(tx,order.ownerUid,shop);D.orderItems(order.items,shop.products||[]);}
          const draftRefs=order.items.map(p=>doc('teyzaDraftProducts/'+order.ownerUid+'/items/'+p.id));
          const drafts=await Promise.all(draftRefs.map(ref=>tx.get(ref)));
          const delta=next==='confirmed'?-1:1;
          if(shop){
            const quantities=Object.fromEntries(order.items.map(x=>[x.id,x.quantity]));
            const products=(shop.products||[]).map(p=>quantities[p.id]?{...p,stock:p.stock+delta*quantities[p.id]}:p);
            tx.update(ref,{products});
          }
          for(let i=0;i<drafts.length;i++){
            const draft=drafts[i].exists?drafts[i].data():null;
            if(draft?.ownerUid===order.ownerUid&&draft.status==='draft'&&Number.isInteger(draft.stockQty)){
              if(next==='confirmed'&&draft.stockQty<order.items[i].quantity)D.fail(409,'Available shop stock changed. Check your products before confirming.');
              tx.update(draftRefs[i],{stockQty:draft.stockQty+delta*order.items[i].quantity,updatedAt:new Date(clock())});
            }
          }
        }
        tx.update(orderRef,{status:next,updatedAt:clock(),reserved:next==='confirmed'?true:['cancelled','completed'].includes(next)?false:order.reserved});
        return {status:next};
      });
    }
    D.fail(404,'This shop service is not available.');
  }
  async function publicDirectory(after=''){
    let query=db.collection('teyzaPublicShops').where('status','==','active').orderBy('__name__').limit(100);
    if(after)query=query.startAfter(D.id(after));
    const result=await query.get(),entries=[];
    for(let offset=0;offset<result.docs.length;offset+=10){
      const batch=await Promise.all(result.docs.slice(offset,offset+10).map(async row=>{
        const uid=row.id,shop=row.data();
        if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||shop.sellerUid!==uid)return null;
        const [a,o,v,l,f,c]=await Promise.all(['teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/','teyzaShopLocations/','teyzaShopFrontPhotos/','teyzaShopSettings/'].map(p=>read(p+uid)));
        if(!P.state(uid,a,o||{},v,shop).live)return null;
        const pin=P.locationFor(uid,a,l,shop,clock()),current=P.locationMatches(uid,a,l),projected={...shop,name:a.shopName,address:a.address||'',shopCategory:a.category,
          area:pin?.area||(current?l.area:null)||(shop.address&&shop.address!==a.address?a.address:shop.area)||a.address||'',
          city:pin?.city||(current?l.city:'')||(!l&&(!shop.address||shop.address===a.address)?shop.city||'':'')};
        Object.assign(projected,offers.exposed(offers.effective(c,shop)));
        delete projected.latitude;delete projected.longitude;if(pin)Object.assign(projected,pin);
        if(f?.ownerUid===uid&&f.photoId)projected.photoUrl=require('./shop-front').publicUrl(uid,f.photoId);
        return P.publicRow(uid,projected);
      }));entries.push(...batch.filter(Boolean));
    }
    return {entries,next:result.docs.length===100?result.docs.at(-1).id:null};
  }
  async function reconcilePublicationBatch(){
    const ref=doc('teyzaMaintenance/publication-approval-v1'),old=await ref.get();
    if(old.exists&&old.data().completedAt)return {complete:true};
    let query=db.collection('teyzaSellerAccounts').orderBy('__name__').limit(100);
    if(old.exists&&old.data().after)query=query.startAfter(old.data().after);
    const rows=await query.get();
    for(let i=0;i<rows.docs.length;i+=10)await Promise.all(rows.docs.slice(i,i+10).map(r=>{
      const a=r.data();return a.uid===r.id&&['spaza','retail'].includes(a.category)?synchronizeCatalogue(r.id):null;
    }));
    const complete=rows.docs.length<100;
    await ref.set({after:rows.docs.at(-1)?.id||'',...(complete?{completedAt:clock()}:{}),updatedAt:clock()});
    return {complete,checked:rows.docs.length};
  }
  return {execute,synchronizeCatalogue,publicDirectory,reconcilePublicationBatch,refreshShopLocations:shopLocation.refresh,
    publicShopPhoto:shopFront.publicPhoto};
}
module.exports = {createService};
