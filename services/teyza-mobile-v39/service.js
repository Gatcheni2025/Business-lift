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
const adminUsers=require('./admin-users');
const mandate=require('./mandate');
const fieldAgents=require('./field-agents');
const ratings=require('./ratings');
const P=require('./publication');
const locations=require('./shop-location');
const addresses=require('./shop-address');
const deletion=require('./account-deletion');
const billingCheckout=require('./billing-paystack');
const orderPaystack=require('./order-paystack');

function createService({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getAuthUser=async()=>null,deleteAuthUser,disableAuthUser,revokeAuthTokens,revokeAppleToken,createPhoneToken,listAuthUsers,getAuthUserByEmail,createAuthUser,updateAuthUser,sendPasswordResetEmail,
  getPlacesKey=()=>'',getAddressSigningKey=()=>'',getPaystackSecret=()=>'',getPaystackPlanCode=()=>'',paystackFetch=fetch,addressFetch=fetch,clock=Date.now}) {
  const doc = path => db.doc(path);
  const read = async path => { const snap = await doc(path).get(); return snap.exists?snap.data():null; };
  const owner = async uid => D.seller(await read('teyzaSellerAccounts/'+uid),uid);
  // Never start a trial during login, approval or product browsing.
  const trialAccount=async (_uid,account)=>account;
  const active = async uid => {
    const [shop,saved,setup,verification,billing]=await Promise.all(['teyzaPublicShops/','teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/','teyzaBilling/'].map(p=>read(p+uid)));
    const account=await trialAccount(uid,saved);
    return P.assertLive(uid,account,setup||{},verification,shop,billing,clock());
  };
  async function requireApproval(tx,uid,shop){
    const [a,o,v,b]=await Promise.all(['teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/','teyzaBilling/'].map(p=>tx.get(doc(p+uid))));
    return P.assertLive(uid,a.exists?a.data():null,o.exists?o.data():{},v.exists?v.data():null,shop,b.exists?b.data():null,clock());
  }
  async function synchronizeCatalogue(uid,{additions=[],removedProductId=null}={}) {
    D.id(uid);
    return db.runTransaction(async tx=>{
      const accountRef=doc('teyzaSellerAccounts/'+uid),shopRef=doc('teyzaPublicShops/'+uid);
      const setupRef=doc('teyzaSellerOnboarding/'+uid);
      const [accountSnap,shopSnap,draftSnap,setupSnap,verificationSnap,settingsSnap,frontSnap,locationSnap,billingSnap,photoSnap]=await Promise.all([
        tx.get(accountRef),tx.get(shopRef),tx.get(db.collection('teyzaDraftProducts/'+uid+'/items').limit(201)),tx.get(setupRef),tx.get(doc('teyzaMobileVerification/'+uid)),tx.get(doc('teyzaShopSettings/'+uid)),tx.get(doc('teyzaShopFrontPhotos/'+uid)),tx.get(doc('teyzaShopLocations/'+uid)),tx.get(doc('teyzaBilling/'+uid)),tx.get(db.collection('teyzaProductPhotos/'+uid+'/items').limit(201))]);
      let account=accountSnap.exists?accountSnap.data():null;
      // Migrate old trials to free without billing or resetting trial dates.
      if(account?.listingPlan==='trial'){
        account={...account,listingPlan:'free'};
        tx.update(accountRef,{listingPlan:'free',updatedAt:new Date(clock())});
      }
      const registered=account?.uid===uid&&['spaza','retail','wholesale'].includes(account.category);
      if(additions.length&&!registered)D.fail(403,'Register your shop with this account first.');
      if(additions.length&&account.approvalStatus!=='approved')
        D.fail(403,'Your seller registration must be approved before adding products.');
      if(additions.length&&!P.eligible(uid,account,billingSnap.exists?billingSnap.data():null,clock()))
        D.fail(403,'Activate product access before adding products, or ask an administrator about complimentary access.');
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
        front:frontSnap.exists?frontSnap.data():null,location:locationSnap.exists?locationSnap.data():null,
         billing:billingSnap.exists?billingSnap.data():null,drafts:entries,photos:photoSnap.docs.map(x=>({id:x.id,data:x.data()})),removedProductId,now:clock()});
      const eligible=next?.status==='active',canPublish=Boolean(eligible&&P.eligible(uid,account,billingSnap.exists?billingSnap.data():null,clock()));
      if(next){
        const listing=eligible?'active':'not_listed';
        if(account.listingStatus!==listing)tx.update(accountRef,{listingStatus:listing,updatedAt:new Date(clock())});
        if(setup.requiredVersion===2&&setup.completedAt){
          const sellingStatus=eligible?'active':['pending_review','awaiting_subscription'].includes(next.status)?'pending_approval':next.status==='suspended'?'paused':'not_started';
          if(setup.sellingStatus!==sellingStatus)tx.set(setupRef,{sellingStatus,updatedAt:clock()},{merge:true});
        }
      }
      for(const item of added)tx.set(doc('teyzaDraftProducts/'+uid+'/items/'+item.id),item.record);
      if(next&&JSON.stringify(next)!==JSON.stringify(shop))tx.set(shopRef,{...next,updatedAt:clock()});
      return {addedIds:added.map(p=>p.id),alreadyAdded,publication:canPublish?'live':'private',
        publicCount:canPublish?next?.productHighlights.length||0:0};
    });
  }
  // Wholesale prices are never exposed in the anonymous shopper directory.
  // Registered, reviewed spaza operators can source from live suppliers.
  async function assertSpazaBuyer(uid,tx=null){
    const refs=['teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/','teyzaPublicShops/','teyzaBilling/'].map(x=>doc(x+uid));
    const entries=await Promise.all(refs.map(ref=>tx?tx.get(ref):ref.get()));
    const [a,o,v,p,b]=entries.map(row=>row.exists?row.data():null);
    if(a?.uid!==uid||a.category!=='spaza')D.fail(403,'Wholesale ordering is available to registered spaza shop owners only.');
    const state=P.state(uid,a,o||{},v,p,b,clock());
    if(!state.ready||!state.approved)D.fail(403,'Complete your spaza registration and seller approval to access wholesale prices.');
    // Previously activated merchants are migrated separately; new free or unpaid
    // accounts cannot unlock the R99 Basic wholesale stock benefit.
    if(!P.eligible(uid,a,b,clock()))D.fail(403,'Your shop needs a current Paystack membership or a valid time-limited admin access grant to view wholesale prices.');
    return a;
  }
  function wholesalePair(spazaUid,supplierUid){
    return doc('teyzaWholesaleConnections/'+D.id(spazaUid)+'_'+D.id(supplierUid));
  }
  async function connectedSupplier(spazaUid,supplierUid,tx=null){
    const ref=wholesalePair(spazaUid,supplierUid),snap=await (tx?tx.get(ref):ref.get());
    const link=snap.exists?snap.data():null;
    if(!link||link.spazaUid!==spazaUid||link.supplierUid!==supplierUid||link.status!=='approved')
      D.fail(403,'Connect with this wholesaler and receive approval before accessing wholesale prices or ordering stock.');
    return link;
  }
  function supplierOffer(shop,settings,link){
    const percent=Number.isInteger(link.discountPercent)&&link.discountPercent>=0&&link.discountPercent<=50?
      link.discountPercent:0;
    const products=(shop.products||[]).map(p=>({...p,
      priceCents:Math.max(1,Math.round(p.priceCents*(100-percent)/100))}));
    const fee=Number.isInteger(link.deliveryFeeCents)&&link.deliveryFeeCents>=0?
      link.deliveryFeeCents:offers.effective(settings,shop).deliveryFeeCents;
    return {shop:{...shop,products},settings:{...(settings||{}),deliveryFeeCents:fee},
      discountPercent:percent,deliveryFeeCents:fee};
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
  const agentWorkspace=fieldAgents.createFieldAgents({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getPlacesKey,fetchImpl:addressFetch,clock,rate});
  const shopRatings=ratings.createRatings({db,clock,rate});
  const shopAddress=addresses.createShopAddress({getPlacesKey,getSigningKey:getAddressSigningKey,fetchImpl:addressFetch,clock,rate});
  const shopLocation=locations.createShopLocation({db,clock,rate,synchronize:synchronizeCatalogue,shopAddress});
  const adminOperations=operations.createOperations({db,clock,rate,
    getPaystackMode:()=>getPaystackSecret().startsWith('sk_live_')?'live':'test',
    synchronize:synchronizeCatalogue});
  const adminUserManagement=adminUsers.createAdminUsers({db,clock,rate,listAuthUsers,getAuthUser,getAuthUserByEmail,createAuthUser,updateAuthUser,revokeAuthTokens,sendPasswordResetEmail});
  const sellerExperience=experience.createSellerExperience({db,clock,rate,getAuthUser,shopAddress});
  const sellerBilling=billingCheckout.createBilling({db,clock,getSecret:getPaystackSecret,
    getPlanCode:getPaystackPlanCode,send:paystackFetch,refresh:synchronizeCatalogue});
  const shopperOrderPayments=orderPaystack.createOrderPaystack({db,clock,getSecret:getPaystackSecret,
    send:paystackFetch,rate});
  const sellerOnboarding=onboarding.createOnboarding({db,bucket,sanitizeImage,encryptSelfie,decryptSelfie,getAuthUser,createPhoneToken,clock,rate});
  async function syncSettings(uid,values) {
    const ref=doc('teyzaPublicShops/'+uid);
    await db.runTransaction(async tx => {
      const [snap,accountSnap,setupSnap,v,b]=await Promise.all([tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+uid)),tx.get(doc('teyzaSellerOnboarding/'+uid)),tx.get(doc('teyzaMobileVerification/'+uid)),tx.get(doc('teyzaBilling/'+uid))]);
      const setup=setupSnap.exists?setupSnap.data():{};
      const account=D.seller(accountSnap.exists?accountSnap.data():null,uid);
      if(!snap.exists||snap.data().status!=='active'||!P.state(uid,account,setup,v.exists?v.data():null,snap.data(),b.exists?b.data():null,clock()).live)return;
      const update={};
      if(values.hours)update.hours=values.hours;
      if('pickupEnabled' in values) {
        Object.assign(update,offers.exposed(values));
      }
      tx.update(ref,update);
    });
  }
  const shopFront=createShopFront({db,bucket,sanitizeImage,clock,rate});
  const accountDeletion=deletion.createAccountDeletion({db,getAuthUser,deleteAuthUser,disableAuthUser,revokeAuthTokens,revokeAppleToken,clock});
  async function registeredShopper(uid){
    const profile=await read('teyzaShopperProfiles/'+uid);
    if(profile?.ownerUid!==uid||
       typeof profile.displayName!=='string'||profile.displayName.trim().length<2||
       typeof profile.phone!=='string'||profile.phone.replace(/\D/g,'').length<9||
       typeof profile.contactEmail!=='string'||!(/^[^@\s]+@[^@\s]+\.[^@\s]+$/).test(profile.contactEmail)||
       typeof profile.address!=='string'||profile.address.trim().length<8||
       !P.coordinates(profile.latitude,profile.longitude))
      D.fail(403,'Save your name, phone, email and delivery address once before shopping.');
    return profile;
  }
  async function execute(auth, action, data={}) {
    if(!auth?.uid)D.fail(401,'Sign in to continue.');
    const uid=D.id(auth.uid);
    // Account deletion must be available regardless of an unverified email or
    // shop approval. Pending-closure users cannot create more data or orders.
    if(deletion.actions.has(action))return accountDeletion.execute(auth,action,data);
    const deletionRecord=await read('teyzaAccountDeletionRequests/'+uid);
    if(deletionRecord&&deletionRecord.status!=='completed'&&auth.teyzaAdmin!==true)
      D.fail(403,'Your account deletion is being processed. Save your deletion reference and contact Teyza support if you need assistance.');
    if(action==='shopper_profile_read'){
      const profile=await read('teyzaShopperProfiles/'+uid);
      return {profile:profile?.ownerUid===uid?profile:null};
    }
    if(action==='shopper_profile_save'){
      const address=D.text(data.address,'delivery street address',300);
      if(address.length<8)D.fail(422,'Enter your full delivery address.');
      const displayName=D.text(data.displayName,'shopper name',120);
      const phone=D.text(data.phone,'shopper phone',30);
      if(phone.replace(/\D/g,'').length<9||phone.replace(/\D/g,'').length>15)
        D.fail(422,'Enter a valid contact number.');
      const lat=Number(data.latitude),lng=Number(data.longitude);
      if(!P.coordinates(lat,lng))D.fail(422,'Select an address with a valid map location.');
      const area=D.text(data.area||'','delivery area',130,false);
      const city=D.text(data.city||'','delivery city',130,false);
      const suppliedEmail=D.text(data.email,'shopper contact email',150).trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(suppliedEmail))
        D.fail(422,'Enter a valid email address.');
      // Do NOT pretend the contact email verifies Firebase identity.
      // It is used for communication, while account authority stays with UID.
      const profile={ownerUid:uid,displayName,phone,address,area,city,
        latitude:lat,longitude:lng,contactEmail:suppliedEmail,
        email:typeof auth.email==='string'?auth.email:'',
        emailVerified:auth.email_verified===true,updatedAt:clock()};
      await doc('teyzaShopperProfiles/'+uid).set(profile,{merge:true});
      return {saved:true,profile};
    }
    if(fieldAgents.actions.has(action))return agentWorkspace.execute(auth,action,data);
    if(addresses.actions.has(action))return shopAddress.execute(uid,action,data);
    if(locations.actions.has(action))return shopLocation.execute(auth,action,data);
    if(ratings.actions.has(action))return shopRatings.execute(auth,action,data);
    if(action==='seller_mandate_submit')D.fail(410,
      'New Teyza debit mandates are discontinued. Use the supported checkout to pay for a seller membership.');
    if(billingCheckout.actions.has(action)){
      if(action==='billing_status')await rate(uid,'billing-status',8,60000);
      return sellerBilling.execute(auth,action,data);
    }
    if(orderPaystack.actions.has(action))return shopperOrderPayments.execute(auth,action,data);
    if(mandate.actions.has(action))return sellerMandate.execute(auth,action,data);
    if(adminUsers.actions.has(action))return adminUserManagement.execute(auth,action,data);
    if(operations.actions.has(action))return adminOperations.execute(auth,action,data);
    if(['shop_front_read','shop_front_submit'].includes(action))return shopFront.execute(auth,action,data);
    if(onboarding.actions.has(action))return sellerOnboarding.execute(auth,action,data);
    const isShopperAction=['order_quote','order_request','order_list',
      'chat_open','chat_list','chat_read','chat_send','chat_block','chat_report',
      'notification_list','notification_read','notification_preferences',
      'notification_device_save','notification_device_delete'].includes(action);
    // One-time location + contact onboarding is sufficient for a basic buyer
    // account. Never use this bypass for seller approvals, finance or stock.
    let shopperProfile=null;
    if(!auth.email_verified&&!auth.phone_number){
      if(isShopperAction)shopperProfile=await registeredShopper(uid);
      else if(!['seller_register','seller_whatsapp_preferences','verification_selfie','seller_summary','catalogue_add','catalogue_sync'].includes(action))
        D.fail(403,'Verify your email or mobile number before using seller services.');
    }
    if(experience.actions.has(action))return sellerExperience.execute(auth,action,data);
    if(action==='wholesale_link_request'){
      const account=await read('teyzaSellerAccounts/'+uid);
      if(account?.uid!==uid||account.category!=='spaza'||account.deletionPending===true)
        D.fail(403,'Register your spaza shop before requesting a wholesale supplier link.');
      const placeId=D.text(data.placeId,'Google business reference',200);
      if(!/^[A-Za-z0-9_-]{4,200}$/.test(placeId))D.fail(422,'Choose a valid Google-listed wholesale supplier.');
      const name=D.text(data.name,'supplier name',140);
      const address=D.text(data.address||'','supplier address',300,false);
      await rate(uid,'wholesale-link-request',5,86400000);
      const requestId=crypto.createHash('sha256').update(uid+':'+placeId).digest('hex');
      const ref=doc('teyzaWholesaleLinkRequests/'+requestId);
      const old=await ref.get();
      if(old.exists)return {requested:true,alreadyRequested:true,reference:requestId};
      await ref.create({requesterUid:uid,placeId,supplierName:name,address,
        status:'awaiting_supplier_outreach',source:'google_places',createdAt:clock()});
      return {requested:true,reference:requestId};
    }
    if(action==='wholesale_connection_request'){
      await assertSpazaBuyer(uid);
      const supplierUid=D.id(data.supplierUid);
      if(supplierUid===uid)D.fail(422,'Choose a different wholesale business.');
      const supplier=await active(supplierUid);
      if(supplier.shopCategory!=='wholesale')D.fail(422,'This shop is not a verified wholesale supplier.');
      await rate(uid,'wholesale-connect',12,86400000);
      const ref=wholesalePair(uid,supplierUid);
      return db.runTransaction(async tx=>{
        const old=await tx.get(ref);
        if(old.exists&&['pending','approved'].includes(old.data().status))
          return {status:old.data().status,alreadyRequested:true};
        tx.set(ref,{spazaUid:uid,supplierUid,status:'pending',
          discountPercent:0,deliveryFeeCents:null,
          createdAt:old.exists?old.data().createdAt:clock(),updatedAt:clock()});
        return {status:'pending',requested:true};
      });
    }
    if(action==='wholesale_connection_respond'){
      const account=await owner(uid);
      if(account.category!=='wholesale')D.fail(403,'Only verified wholesaler owners can respond.');
      await active(uid);
      const buyerUid=D.id(data.spazaUid),status=data.status;
      if(!['approved','declined'].includes(status))D.fail(422,'Accept or decline the connection.');
      // Terms are always chosen by the supplier, not the spaza client.
      const discountPercent=data.discountPercent??0;
      if(!Number.isInteger(discountPercent)||discountPercent<0||discountPercent>50)
        D.fail(422,'Discount must be between 0% and 50%.');
      const deliveryFeeCents=data.deliveryFeeCents??null;
      if(deliveryFeeCents!==null&&(!Number.isInteger(deliveryFeeCents)||
          deliveryFeeCents<0||deliveryFeeCents>1000000))
        D.fail(422,'Enter a valid delivery fee in cents.');
      const buyer=await owner(buyerUid);
      if(buyer.category!=='spaza')D.fail(403,'Only registered spaza shops can connect.');
      await rate(uid,'wholesale-respond',50,3600000);
      const ref=wholesalePair(buyerUid,uid);
      return db.runTransaction(async tx=>{
        const old=await tx.get(ref);
        if(!old.exists||old.data().supplierUid!==uid||old.data().spazaUid!==buyerUid)
          D.fail(404,'This spaza shop has not requested a connection.');
        if(old.data().status==='declined'&&status==='approved')
          D.fail(409,'The spaza must send a new connection request.');
        tx.update(ref,{status,discountPercent:status==='approved'?discountPercent:0,
          deliveryFeeCents:status==='approved'?deliveryFeeCents:null,updatedAt:clock()});
        return {status,spazaUid:buyerUid};
      });
    }
    if(action==='wholesale_connection_chat_open'){
      const account=await owner(uid);
      if(!['spaza','wholesale'].includes(account.category))
        D.fail(403,'Only connected spaza shops and wholesalers can open supplier chat.');
      const supplierUid=account.category==='wholesale'?uid:D.id(data.supplierUid);
      const spazaUid=account.category==='spaza'?uid:D.id(data.spazaUid);
      await active(supplierUid);
      await assertSpazaBuyer(spazaUid);
      await connectedSupplier(spazaUid,supplierUid);
      await rate(uid,'wholesale-chat-open',20,60000);
      const supplier=await owner(supplierUid),spaza=await owner(spazaUid);
      const ref=doc('teyzaMobileChats/'+D.threadId(supplierUid,spazaUid));
      await db.runTransaction(async tx=>{
        const saved=await tx.get(ref);
        if(saved.exists)D.member(saved.data(),uid);
        for(const member of [supplierUid,spazaUid])
          tx.set(doc('teyzaMobileChatIndex/'+member+'/threads/'+ref.id),
            {updatedAt:saved.exists?saved.data().updatedAt:clock()});
        if(saved.exists)return;
        tx.set(ref,{ownerUid:supplierUid,shopperUid:spazaUid,
          members:[supplierUid,spazaUid],shopName:supplier.shopName,
          shopperName:spaza.shopName,lastMessage:'',messageCount:0,
          updatedAt:clock(),ownerUnread:0,shopperUnread:0,
          wholesalePartnerChat:true});
      });
      return {threadId:ref.id,shopName:account.category==='spaza'?
        supplier.shopName:spaza.shopName};
    }
    if(action==='wholesale_connections'){
      const account=await owner(uid);
      if(!['spaza','wholesale'].includes(account.category))D.fail(403,'Only shop owners can view wholesale connections.');
      const supplier=account.category==='wholesale';
      const rows=await db.collection('teyzaWholesaleConnections')
        .where(supplier?'supplierUid':'spazaUid','==',uid).limit(100).get();
      const entries=await Promise.all(rows.docs.map(async snap=>{
        const item=snap.data(),otherUid=supplier?item.spazaUid:item.supplierUid;
        const other=await read('teyzaSellerAccounts/'+otherUid);
        return other?.uid===otherUid?{...item,id:snap.id,
          name:other.shopName||'Shop',area:other.address||''}:null;
      }));
      return {connections:entries.filter(Boolean)};
    }
    if(action==='wholesale_directory'){
      await assertSpazaBuyer(uid);await rate(uid,'wholesale-discovery',40,60000);
      const results=await publicDirectory(data.after||'',true);
      results.entries=await Promise.all(results.entries.map(async entry=>{
        const supplierUid=entry.id;
        const link=await read(wholesalePair(uid,supplierUid).path);
        if(link?.spazaUid===uid&&link.supplierUid===supplierUid&&link.status==='approved'){
          const offered=supplierOffer(entry,await read('teyzaShopSettings/'+supplierUid),link);
          return {...entry,products:offered.shop.products,
            productHighlights:offered.shop.products.map(p=>({
              id:p.id,name:p.name,category:p.category,inStock:p.stock>0,
              priceCents:p.priceCents,imageUrl:p.imageUrl||''
            })),connected:true,connectionStatus:'approved',
            discountPercent:offered.discountPercent,deliveryFeeCents:offered.deliveryFeeCents};
        }
        return {...entry,connected:false,connectionStatus:link?.status||'none',
          discountPercent:0,products:[],productHighlights:[],deliveryFeeCents:null};
      }));
      return results;
    }
    if(action==='catalogue_add'||action==='catalogue_sync'){
      await owner(uid);await rate(uid,'catalogue-edit',30,60000);
      return synchronizeCatalogue(uid,{additions:action==='catalogue_add'?catalogue.selection(data.products):[],
        removedProductId:action==='catalogue_sync'&&data.removedProductId?D.id(data.removedProductId):null});
    }
    if (action==='seller_summary') {
      await owner(uid);await synchronizeCatalogue(uid);
      const account=await trialAccount(uid,await owner(uid));
      const [config,verification,finance,catalogue,photos,publicShop,setup,location,front,billing,promotion]=await Promise.all([
        read('teyzaShopSettings/'+uid),read('teyzaMobileVerification/'+uid),
        db.collection('teyzaCreditEnquiries/'+uid+'/requests').orderBy('createdAt','desc').limit(30).get(),
        read('teyzaCatalogueSubmissions/'+uid),db.collection('teyzaProductPhotos/'+uid+'/items').limit(200).get(),
        read('teyzaPublicShops/'+uid),read('teyzaSellerOnboarding/'+uid),read('teyzaShopLocations/'+uid),read('teyzaShopFrontPhotos/'+uid),read('teyzaBilling/'+uid),read('teyzaPromotions/'+uid)]);
      const publication=P.state(uid,account,setup||{},verification,publicShop,billing,clock()),pin=P.locationFor(uid,account,location,publicShop,clock());
      return {listingPlan:account.listingPlan==='trial'?'free':account.listingPlan||'free',
        listingPaid:P.entitled(uid,account,billing,clock()),
        complimentaryAccess:P.complimentary(uid,account,billing,clock()),
        complimentaryUntil:P.complimentary(uid,account,billing,clock())?billing.adminComplimentaryUntil:null,
        paidUntil:billing?.paidUntil||null,renewalSetup:billing?.renewalSetup||null,introEligible:billing?.introUsed!==true,
        promotionEndsAt:promotion?.endsAt||null,
        promotionActive:P.entitled(uid,account,billing,clock())&&promotion?.ownerUid===uid&&promotion.status==='active'&&promotion.endsAt>clock(),
         settings:{...(config||{}),...offers.effective(config,publicShop)},shopFront:validShopFront(front,uid)?{photoId:front.photoId}:null,
        approvalStatus:publication.approved?'approved':'pending',setupComplete:publication.ready,
        location:pin,hasLocation:Boolean(pin),publicationStatus:publication.live&&publicShop?.status==='active'?'active':publication.status,
        sellingEnabled:publication.canSell&&publicShop?.sellingEnabled===true,identityVerified:publication.approved,
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
      const account=await owner(uid);
      if(action==='product_photo'){
        if(account.approvalStatus!=='approved')D.fail(403,'Your seller registration must be approved before adding product photos.');
        if(!P.eligible(uid,account,await read('teyzaBilling/'+uid),clock()))D.fail(403,'Activate product access before adding product photos.');
      }
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
      await synchronizeCatalogue(uid);
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
      const images=new Map(photos.docs.map(x=>[x.id,catalogue.uploadedPhoto(uid,x.id,x.data())]));
      const products=drafts.docs.filter(x=>x.data().ownerUid===uid&&x.data().status==='draft').map(x=>{
        const entry={id:x.id,data:x.data()},p=catalogue.canonical(uid,entry)||catalogue.custom(uid,entry);
        if(!p)D.fail(422,'Check the name, category, price and stock on each product.');
        return {...p,imageUrl:images.get(x.id)||p.imageUrl||''};
      });
      if(!products.length)D.fail(422,'Add at least one product before submitting your catalogue.');
      // Validate stored drafts again. A client cannot publish a pending shop or enable priced listings.
      for(const p of products){
        if(!Number.isInteger(p.stock)||p.stock<0||p.stock>100000)D.fail(422,'Check the available stock on each product.');
        D.text(p.category,'product category',60);
        D.orderItems([{id:p.id,quantity:1}],[{...p,stock:Math.max(1,p.stock)}]);
      }
      // Older apps may still submit a catalogue. Synchronize it immediately;
      // seller identity and payment remain separate server-enforced gates.
      const result=await synchronizeCatalogue(uid);
      const status=result.publication==='live'?'published':'waiting_for_access';
      await doc('teyzaCatalogueSubmissions/'+uid).set({ownerUid:uid,status,products,submittedAt:clock()});
      return {status};
    }
    if(action==='catalogue_review') {
      experience.recentAdmin(auth,clock);
      const sellerUid=D.id(data.sellerUid);
      if(sellerUid===uid)D.fail(403,'Another administrator must review your own products.');
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
        tx.update(shopRef,{products:shop.catalogueEnabled===true||shop.sellingEnabled===true?products:[],productHighlights,
          reviewedProductIds:products.map(p=>p.id)});
        tx.update(accountRef,{catalogueApprovalRequired:true});
        tx.update(submissionRef,{status:'published',reviewedBy:uid,reviewedAt:clock()});
        return {status:'published'};
      });
    }
    // Chat moderation is server-owned. Clients cannot forge a reporter, recipient or
    // message body; only verified thread participants can submit a report or block.
    if(action==='chat_block'||action==='chat_report') {
      const threadId=D.id(data.threadId),threadRef=doc('teyzaMobileChats/'+threadId);
      const thread=D.member(await read(threadRef.path),uid);
      const otherUid=thread.ownerUid===uid?thread.shopperUid:thread.ownerUid;
      if(action==='chat_block') {
        if(typeof data.blocked!=='boolean')D.fail(422,'Choose block or unblock.');
        await rate(uid,'chat-block',30,3600000);
        await doc('teyzaChatBlocks/'+threadId+'_'+uid).set({
          threadId,blockerUid:uid,blockedUid:otherUid,blocked:data.blocked,updatedAt:clock()
        });
        return {blocked:data.blocked};
      }
      const messageId=D.id(data.messageId),messageSnap=await threadRef.collection('messages').doc(messageId).get();
      if(!messageSnap.exists||messageSnap.data().senderUid!==otherUid)D.fail(403,'You can only report a message sent by the other participant.');
      const reasons=['harassment','hate','scam','spam','unsafe','other'];
      if(!reasons.includes(data.reason))D.fail(422,'Select a reason for reporting the message.');
      await rate(uid,'chat-report',10,3600000);
      const reportId=crypto.createHash('sha256').update(uid+':'+threadId+':'+messageId).digest('hex');
      const reportRef=doc('teyzaChatReports/'+reportId),prior=await reportRef.get();
      if(prior.exists)return {reported:true,reference:reportId};
      await reportRef.create({
        threadId,messageId,reporterUid:uid,reportedUid:otherUid,
        reason:data.reason,messageText:String(messageSnap.data().text||'').slice(0,1000),
        status:'open',createdAt:clock()
      });
      return {reported:true,reference:reportId};
    }
    if(action==='chat_report_queue'||action==='chat_report_resolve'){
      if(auth.teyzaAdmin!==true||auth.email_verified!==true||
          !Number.isFinite(Number(auth.auth_time))||Math.abs(clock()/1000-Number(auth.auth_time))>900)
        D.fail(403,'Recently authenticated Teyza administrator required.');
      if(action==='chat_report_queue'){
        const rows=await db.collection('teyzaChatReports').where('status','==','open').limit(50).get();
        return {reports:rows.docs.map(x=>({id:x.id,...x.data()}))};
      }
      const reportId=D.id(data.reportId);
      if(!['resolved','dismissed'].includes(data.status))D.fail(422,'Choose resolved or dismissed.');
      const ref=doc('teyzaChatReports/'+reportId),entry=await ref.get();
      if(!entry.exists)D.fail(404,'Report not found.');
      await ref.update({status:data.status,reviewedBy:uid,reviewedAt:clock()});
      return {resolved:true};
    }
    if(action==='chat_open') {
      const sellerUid=D.id(data.shopId);
      if(sellerUid===uid)D.fail(422,'Open Live chat on your seller dashboard to reply to shoppers.');
      const shop=await active(sellerUid),settings=await read('teyzaShopSettings/'+sellerUid);
      if(shop.shopCategory==='wholesale'){
        await assertSpazaBuyer(uid);
        await connectedSupplier(uid,sellerUid);
      }
      if(settings?.liveChatEnabled===false)D.fail(409,'This shop is not accepting chat messages right now.');
      await rate(uid,'chatopen',shopperProfile?5:20,60000);
      const ref=doc('teyzaMobileChats/'+D.threadId(sellerUid,uid));
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(snap.exists)D.member(snap.data(),uid);
        for(const member of [sellerUid,uid])tx.set(doc('teyzaMobileChatIndex/'+member+'/threads/'+ref.id),{updatedAt:snap.exists?snap.data().updatedAt:clock()});
        if(snap.exists)return;
        tx.set(ref,{ownerUid:sellerUid,shopperUid:uid,members:[sellerUid,uid],shopName:shop.name,
          shopperName:shopperProfile?.displayName||auth.name||auth.email||'Shopper',lastMessage:'',messageCount:0,updatedAt:clock(),ownerUnread:0,shopperUnread:0});
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
        const checks=await Promise.all([thread.ownerUid,thread.shopperUid].map(member=>
          read('teyzaChatBlocks/'+ref.id+'_'+member)));
        if(checks.some(c=>c?.blocked===true))D.fail(403,'This conversation is blocked. Unblock to continue.');
        const config=await read('teyzaShopSettings/'+thread.ownerUid);
        await active(thread.ownerUid);
        if(config?.liveChatEnabled===false)D.fail(409,'Chat is paused for this shop.');
        await rate(uid,'message',shopperProfile?8:30,60000);
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
      const blocks=await Promise.all([thread.ownerUid,thread.shopperUid].map(member=>
        read('teyzaChatBlocks/'+ref.id+'_'+member)));
      return {blockedByMe:blocks[thread.ownerUid===uid?0:1]?.blocked===true,
        blocked:blocks.some(item=>item?.blocked===true),
        messages:messages.docs.map(x=>({id:x.id,...x.data()})).reverse()};
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
      const shop=await active(sellerUid);
      const settings=await read('teyzaShopSettings/'+sellerUid);
      if(shop.shopCategory==='wholesale'){
        await assertSpazaBuyer(uid);
        const link=await connectedSupplier(uid,sellerUid);
        const offered=supplierOffer(shop,settings,link);
        return {quote:offers.quote(offered.shop,offered.settings,data)};
      }
      return {quote:offers.quote(shop,settings,data)};
    }
    if(action==='order_request') {
      const sellerUid=D.id(data.shopId),requestId=D.id(data.requestId);
      if(sellerUid===uid)D.fail(422,'Choose another shop to place an order.');
      if(!['collection','delivery'].includes(data.mode))D.fail(422,'Choose delivery or collection.');
      const address=data.mode==='delivery'?D.text(data.address,'delivery address',300):'';
      const phone=D.text(data.phone,'contact number',25);
      if(shopperProfile){
        if(phone!==shopperProfile.phone||(data.mode==='delivery'&&address!==shopperProfile.address))
          D.fail(403,'Use your saved contact and delivery details, or update them in your profile first.');
      }
      await rate(uid,'orders',shopperProfile?5:20,3600000);
      const ref=doc('teyzaMobileOrders/'+D.threadId(uid,requestId)),shopRef=doc('teyzaPublicShops/'+sellerUid);
      return db.runTransaction(async tx=>{
        const [existing,shopSnap,config]=await Promise.all([tx.get(ref),tx.get(shopRef),tx.get(doc('teyzaShopSettings/'+sellerUid))]);
        if(existing.exists){if(existing.data().shopperUid!==uid)D.fail(403,'Order access denied.');return {id:ref.id,status:existing.data().status};}
        const shop=await requireApproval(tx,sellerUid,shopSnap.exists?shopSnap.data():null);
        let offeredShop=shop,offeredSettings=config.exists?config.data():null;
        if(shop.shopCategory==='wholesale'){
          await assertSpazaBuyer(uid,tx);
          const link=await connectedSupplier(uid,sellerUid,tx);
          const offered=supplierOffer(shop,offeredSettings,link);
          offeredShop=offered.shop;offeredSettings=offered.settings;
        }
        const estimate=offers.quote(offeredShop,offeredSettings,data);
        if(data.expectedQuoteId!==undefined&&data.expectedQuoteId!==estimate.quoteId)D.fail(409,'Prices or shop services changed. Refresh the order total before sending this request.');
        const {items,subtotalCents,deliveryFeeCents,totalCents,paymentMethod,cashDiscountCents,cashDiscountPercent,cardFeeCents}=estimate;
        tx.set(ref,{ownerUid:sellerUid,shopperUid:uid,shopName:shop.name||shop.shopName||'Shop',
          shopperName:shopperProfile?.displayName||auth.name||auth.email||'Shopper',
          mode:data.mode,address,phone,items,subtotalCents,deliveryFeeCents,totalCents,paymentMethod,cashDiscountCents,cashDiscountPercent,cardFeeCents,
          orderType:shop.shopCategory==='wholesale'?'wholesale_stock':'retail',
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
  async function publicDirectory(after='',wholesaleOnly=false){
    let query=db.collection('teyzaPublicShops').where('status','==','active').orderBy('__name__').limit(100);
    if(after)query=query.startAfter(D.id(after));
    const result=await query.get(),entries=[];
    for(let offset=0;offset<result.docs.length;offset+=10){
      const batch=await Promise.all(result.docs.slice(offset,offset+10).map(async row=>{
        const uid=row.id,shop=row.data();
        if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||shop.sellerUid!==uid)return null;
        // Do not leak wholesale catalogue prices via the public customer endpoint.
        // Anonymous directory may show verified wholesalers' names, not B2B prices.
        const [saved,o,v,l,f,c,b,promo]=await Promise.all(['teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/','teyzaShopLocations/','teyzaShopFrontPhotos/','teyzaShopSettings/','teyzaBilling/','teyzaPromotions/'].map(p=>read(p+uid)));
        const a=await trialAccount(uid,saved);
        if((wholesaleOnly&&a?.category!=='wholesale') ||
           (shop.shopCategory && shop.shopCategory!==a.category) ||
           !P.state(uid,a,o||{},v,shop,b,clock()).live)return null;
        const pin=P.locationFor(uid,a,l,shop,clock()),current=P.locationMatches(uid,a,l),projected={...shop,name:a.shopName,address:a.address||'',shopCategory:a.category,
           sponsored:P.entitled(uid,a,b,clock())&&promo?.ownerUid===uid&&promo.status==='active'&&promo.endsAt>clock(),
          area:pin?.area||(current?l.area:null)||(shop.address&&shop.address!==a.address?a.address:shop.area)||a.address||'',
          city:pin?.city||(current?l.city:'')||(!l&&(!shop.address||shop.address===a.address)?shop.city||'':'')};
        Object.assign(projected,offers.exposed(offers.effective(c,shop)));
        delete projected.latitude;delete projected.longitude;if(pin)Object.assign(projected,pin);
        if(f?.ownerUid===uid&&f.photoId)projected.photoUrl=require('./shop-front').publicUrl(uid,f.photoId);
        // Never leak previously stored products through a stale public listing.
        if(!P.eligible(uid,a,b,clock())){
          projected.products=[];projected.productHighlights=[];
          projected.catalogueEnabled=false;projected.sellingEnabled=false;
        }
        const publicItem=P.publicRow(uid,projected);
        if(a.category==='wholesale'&&!wholesaleOnly){publicItem.products=[];publicItem.productHighlights=[];}
        return publicItem;
      }));entries.push(...batch.filter(Boolean));
    }
    return {entries,next:result.docs.length===100?result.docs.at(-1).id:null,wholesaleOnly};
  }
  async function reconcilePublicationBatch(){
    // Rerun once after changing Free-plan publication eligibility. The
    // completed v1 marker must not hide previously approved free sellers.
    const ref=doc('teyzaMaintenance/publication-free-products-v3'),old=await ref.get();
    if(old.exists&&old.data().completedAt)return {complete:true};
    let query=db.collection('teyzaSellerAccounts').orderBy('__name__').limit(100);
    if(old.exists&&old.data().after)query=query.startAfter(old.data().after);
    const rows=await query.get();
    for(let i=0;i<rows.docs.length;i+=10)await Promise.all(rows.docs.slice(i,i+10).map(r=>{
      const a=r.data();return a.uid===r.id&&['spaza','retail','wholesale'].includes(a.category)?synchronizeCatalogue(r.id):null;
    }));
    const complete=rows.docs.length<100;
    await ref.set({after:rows.docs.at(-1)?.id||'',...(complete?{completedAt:clock()}:{}),updatedAt:clock()});
    return {complete,checked:rows.docs.length};
  }
  async function paystackWebhook(raw,signature,event){
    if(event?.event==='charge.success'&&/^TZO-[a-f0-9]{26}$/.test(event?.data?.reference||''))
      return shopperOrderPayments.webhook(raw,signature,event);
    return sellerBilling.webhook(raw,signature,event);
  }
  return {execute,paystackWebhook,reconcilePendingMemberships:()=>sellerBilling.reconcilePending(),
    synchronizeCatalogue,publicDirectory,reconcilePublicationBatch,refreshShopLocations:shopLocation.refresh,
    publicShopPhoto:shopFront.publicPhoto};
}
module.exports = {createService};
