'use strict';
const D = require('./domain');
const crypto = require('node:crypto');

function createService({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,clock=Date.now}) {
  const doc = path => db.doc(path);
  const read = async path => { const snap = await doc(path).get(); return snap.exists?snap.data():null; };
  const owner = async uid => D.seller(await read('teyzaSellerAccounts/'+uid),uid);
  const active = async uid => D.published(await read('teyzaPublicShops/'+uid),uid);
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
  async function syncSettings(uid,values) {
    const ref=doc('teyzaPublicShops/'+uid);
    await db.runTransaction(async tx => {
      const [snap,accountSnap]=await Promise.all([tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+uid))]);
      const account=D.seller(accountSnap.exists?accountSnap.data():null,uid);
      if (!snap.exists || snap.data().status!=='active' || snap.data().sellerUid!==uid ||
          account.approvalStatus!=='approved' || account.listingStatus!=='active') return;
      const update={};
      if(values.hours)update.hours=values.hours;
      if('pickupEnabled' in values) {
        update.pickupEnabled=values.pickupEnabled;update.deliveryEnabled=values.deliveryEnabled;
        update.services={cashback:values.cashback,cardPayments:values.cardPayments,
          payAndCollect:values.pickupEnabled,liveChat:values.liveChatEnabled};
        update.deliveryFeeCents=values.deliveryFeeCents;update.deliveryRadiusKm=values.deliveryRadiusKm;
        update.deliveryNotes=values.deliveryNotes;
      }
      tx.update(ref,update);
    });
  }
  async function execute(auth, action, data={}) {
    if(!auth?.uid)D.fail(401,'Sign in to continue.');
    const uid=D.id(auth.uid);
    if (!auth.email_verified) D.fail(403,'Verify your email before using shop services or sending requests.');
    if (action==='seller_summary') {
      await owner(uid);
      const [config,verification,finance,catalogue,photos]=await Promise.all([
        read('teyzaShopSettings/'+uid),read('teyzaMobileVerification/'+uid),
        db.collection('teyzaCreditEnquiries/'+uid+'/requests').orderBy('createdAt','desc').limit(30).get(),
        read('teyzaCatalogueSubmissions/'+uid),db.collection('teyzaProductPhotos/'+uid+'/items').limit(100).get()]);
      return {settings:config||{},verification:verification?{status:verification.status,submittedAt:verification.submittedAt}:null,
        credit:finance.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>b.createdAt-a.createdAt),
        catalogueStatus:catalogue?.status||'not_submitted',photos:photos.docs.map(x=>({id:x.id,url:x.data().url}))};
    }
    if(action==='save_services'||action==='save_hours'||action==='save_restock') {
      await owner(uid);await rate(uid,'settings',40,60000);
      const values=action==='save_services'?D.settings(data):action==='save_hours'?{hours:D.hours(data.hours),timezone:'Africa/Johannesburg'}:{restockList:D.restock(data.items)};
      await doc('teyzaShopSettings/'+uid).set({...values,ownerUid:uid,updatedAt:clock()},{merge:true});
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
        const path='teyza-private/mobile-verification/'+uid+'/selfie.enc';
        const encrypted=await encryptSelfie(jpeg);
        await bucket.file(path).save(encrypted,{contentType:'application/octet-stream',resumable:false,
          metadata:{cacheControl:'private,no-store'}});
        await doc('teyzaMobileVerification/'+uid).set({ownerUid:uid,status:'pending_review',
          method:'selfie_manual_review',objectPath:path,submittedAt:stamp,expiresAt:stamp+90*86400000,
          consentVersion:'selfie-review-v1',consentAt:stamp});
        return {status:'pending_review'};
      }
      const productId=D.id(data.productId);
      const product=await read('teyzaDraftProducts/'+uid+'/items/'+productId);
      if(!product||product.ownerUid!==uid||product.status!=='draft')D.fail(403,'Save your product draft before adding its photo.');
      const token=crypto.randomUUID(),path='teyza/product-photos/'+uid+'/'+productId+'/'+token+'.jpg';
      await bucket.file(path).save(jpeg,{contentType:'image/jpeg',resumable:false,
        metadata:{metadata:{firebaseStorageDownloadTokens:token}}});
      const url='https://firebasestorage.googleapis.com/v0/b/'+bucket.name+'/o/'+encodeURIComponent(path)+'?alt=media&token='+token;
      await doc('teyzaProductPhotos/'+uid+'/items/'+productId).set({ownerUid:uid,url,objectPath:path,updatedAt:stamp});
      return {url};
    }
    if(action==='verification_read'||action==='verification_review') {
      if(auth.teyzaAdmin!==true)D.fail(403,'Teyza reviewer access is required.');
      const target=D.id(data.sellerUid),ref=doc('teyzaMobileVerification/'+target),record=await read(ref.path);
      if(!record||record.expiresAt<=clock()||!record.objectPath)D.fail(404,'No current selfie submission is available.');
      if(action==='verification_read') {
        if(!auth.auth_time||clock()/1000-auth.auth_time>300)D.fail(401,'Sign in again before reviewing private photos.');
        const [bytes]=await bucket.file(record.objectPath).download();
        return {imageBase64:(await decryptSelfie(bytes)).toString('base64')};
      }
      if(!['approved','needs_new_photo'].includes(data.status))D.fail(422,'Choose a review outcome.');
      await ref.update({status:data.status,reviewedAt:clock(),reviewedBy:uid});
      return {status:data.status};
    }
    if(action==='catalogue_submit') {
      await owner(uid);await rate(uid,'catalogue',10,3600000);
      const [drafts,photos]=await Promise.all([db.collection('teyzaDraftProducts/'+uid+'/items').limit(100).get(),db.collection('teyzaProductPhotos/'+uid+'/items').get()]);
      const images=Object.fromEntries(photos.docs.map(x=>[x.id,x.data().url]));
      const products=drafts.docs.filter(x=>x.data().ownerUid===uid&&x.data().status==='draft').map(x=>{
        const p=x.data();return {id:x.id,name:p.name,category:p.category,priceCents:p.priceCents,stock:p.stockQty,imageUrl:images[x.id]||''};
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
        const shop=D.published(shopSnap.exists?shopSnap.data():null,sellerUid);
        const submission=submissionSnap.exists?submissionSnap.data():null;
        if(account.approvalStatus!=='approved'||account.listingStatus!=='active'||shop.catalogueEnabled!==true)
          D.fail(409,'Approve and activate an eligible priced listing before publishing a catalogue.');
        if(submission?.status!=='pending_review'||!Array.isArray(submission.products)||submission.products.length>100)
          D.fail(409,'There is no pending catalogue to review.');
        const drafts=await Promise.all(submission.products.map(p=>tx.get(doc('teyzaDraftProducts/'+sellerUid+'/items/'+D.id(p.id)))));
        const products=submission.products.map((p,index)=>{
          const current=drafts[index].exists?drafts[index].data():null;
          if(!current||current.ownerUid!==sellerUid||current.status!=='draft'||!Number.isInteger(current.stockQty)||current.stockQty<0)
            D.fail(409,'The product drafts changed. Ask the shop to resubmit its catalogue.');
          return {...p,stock:current.stockQty};
        });
        tx.update(shopRef,{products});
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
      const index=await db.collection('teyzaMobileChatIndex/'+uid+'/threads').orderBy('updatedAt','desc').limit(100).get();
      const rows=await Promise.all(index.docs.map(x=>doc('teyzaMobileChats/'+x.id).get()));
      return {threads:rows.filter(x=>x.exists).map(x=>{
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
    if(action==='order_request') {
      const sellerUid=D.id(data.shopId),requestId=D.id(data.requestId);
      if(sellerUid===uid)D.fail(422,'Choose another shop to place an order.');
      if(!['collection','delivery'].includes(data.mode))D.fail(422,'Choose delivery or collection.');
      const address=data.mode==='delivery'?D.text(data.address,'delivery address',300):'';
      const phone=D.text(data.phone,'contact number',25);
      await rate(uid,'orders',20,3600000);
      const ref=doc('teyzaMobileOrders/'+D.threadId(uid,requestId)),shopRef=doc('teyzaPublicShops/'+sellerUid);
      return db.runTransaction(async tx=>{
        const [existing,shopSnap]=await Promise.all([tx.get(ref),tx.get(shopRef)]);
        if(existing.exists){if(existing.data().shopperUid!==uid)D.fail(403,'Order access denied.');return {id:ref.id,status:existing.data().status};}
        const shop=D.published(shopSnap.exists?shopSnap.data():null,sellerUid);
        if(!(data.mode==='delivery'?shop.deliveryEnabled:shop.pickupEnabled))D.fail(409,'This fulfilment option is not enabled by the shop.');
        const items=D.orderItems(data.items,shop.products||[]);
        const subtotal=items.reduce((n,p)=>n+p.priceCents*p.quantity,0);
        const fee=data.mode==='delivery'&&Number.isInteger(shop.deliveryFeeCents)?shop.deliveryFeeCents:0;
        tx.set(ref,{ownerUid:sellerUid,shopperUid:uid,shopName:shop.name,shopperName:auth.name||auth.email||'Shopper',
          mode:data.mode,address,phone,items,subtotalCents:subtotal,deliveryFeeCents:fee,totalCents:subtotal+fee,
          status:'requested',paymentStatus:'arrange_with_shop',createdAt:clock(),updatedAt:clock(),reserved:false});
        tx.set(doc('teyzaMobileOrderIndex/'+uid+'/shopperOrders/'+ref.id),{createdAt:clock()});
        tx.set(doc('teyzaMobileOrderIndex/'+sellerUid+'/ownerOrders/'+ref.id),{createdAt:clock()});
        return {id:ref.id,status:'requested'};
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
          if(next==='confirmed'){D.published(shop,order.ownerUid);D.orderItems(order.items,shop.products||[]);}
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
  return {execute};
}
module.exports = {createService};
