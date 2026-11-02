'use strict';

// Verified account closure: immediately disable Firebase Authentication and revoke
// existing sessions. Full erasure follows after outstanding transactions, lawful
// retention and third-party token revocation are handled. Never call this
// 'permanently erased' until those actions really finish.
const crypto=require('node:crypto');
const D=require('./domain');
const MAX_AGE_MS=15*60*1000;
const COMPLETE_BY_MS=30*24*60*60*1000;
const actions=new Set([
  'account_deletion_request','account_deletion_status','account_apple_revoke',
  'ops_account_deletion_queue','ops_account_deletion_complete',
]);

function recent(actor, now) {
  const t=Number(actor?.auth_time)*1000;
  if(!Number.isFinite(t)||t<=0||t>now+300000||now-t>MAX_AGE_MS) {
    D.fail(403,'For your security, sign out and sign in again before deleting your account.');
  }
  if(actor?.teyzaPhoneBootstrap===true)D.fail(403,'Sign in normally before deleting your account.');
}
function admin(actor,now) {
  if(actor?.teyzaAdmin!==true||actor?.email_verified!==true||actor?.teyzaPhoneBootstrap===true)
    D.fail(403,'A verified Teyza administrator is required.');
  recent(actor,now);
}
function publicStatus(record) {
  return {
    requested:true,reference:record.reference,status:record.status,
    requestedAt:record.requestedAt,completeBy:record.completeBy,
    seller:record.seller===true,signInBlocked:record.authDisabledAt>0,
    canRegisterAgain:record.authDeletedAt>0,
    message:record.status==='completed'
      ? 'Your account deletion is complete.'
      : record.authDisabledAt>0
        ? 'Your Teyza account is closed for sign-in. Final personal-data erasure is in progress; records required by law may be retained.'
        : 'Your deletion request is recorded, but sign-in has not yet been disabled. Contact Teyza support if retry fails.',
  };
}
function createAccountDeletion({db,getAuthUser,deleteAuthUser,disableAuthUser,revokeAuthTokens,revokeAppleToken,clock=Date.now}) {
  const doc=path=>db.doc(path);
  const get=async ref=>{const s=await ref.get();return s.exists?s.data():null;};
  async function blockSignIn(uid,request) {
    if(request.status==='completed'||request.authDeletedAt>0)return publicStatus(request);
    if(typeof disableAuthUser!=='function'||typeof revokeAuthTokens!=='function'||
       typeof deleteAuthUser!=='function')
      D.fail(503,'Deletion identity closure is unavailable. Contact Teyza support with your reference.');
    // Permanently remove the OLD Auth identity now. Unlike merely disabling
    // an account, this frees its email for a genuinely new registration. Data
    // erasure, billing checks and Apple token obligations remain in the queue.
    try{
      await disableAuthUser(uid);
      await revokeAuthTokens(uid);
      await deleteAuthUser(uid);
    }catch(error){
      if(error?.code!=='auth/user-not-found')
        D.fail(503,'Deletion request saved but identity removal could not be confirmed. Contact Teyza support.');
    }
    const stoppedAt=clock();
    await doc('teyzaAccountDeletionRequests/'+uid).update({
      authDisabledAt:stoppedAt,authDeletedAt:stoppedAt,updatedAt:stoppedAt
    });
    return publicStatus({...request,authDisabledAt:stoppedAt,authDeletedAt:stoppedAt});
  }
  async function execute(actor,action,data={}) {
    if(!actor?.uid)D.fail(401,'Sign in first.');
    const uid=D.id(actor.uid),stamp=clock();
    if(action==='account_deletion_status') {
      const entry=await get(doc('teyzaAccountDeletionRequests/'+uid));
      // Older app releases saved requests but left Firebase Auth active.
      // Migrate those requests to a closed login on the next status read.
      return entry?blockSignIn(uid,entry):{requested:false};
    }
    if(action==='account_apple_revoke'){
      recent(actor,stamp);
      if(typeof revokeAppleToken!=='function')
        D.fail(503,'Apple provider revocation is temporarily unavailable.');
      const user=await getAuthUser(uid);
      if(!user?.providerData?.some(provider=>provider.providerId==='apple.com'))
        D.fail(403,'This Firebase account is not linked to Apple sign-in.');
      const authorizationCode=D.text(data.authorizationCode,'Apple authorization code',4096);
      if(authorizationCode.length<10)D.fail(422,'Apple authorization code is incomplete.');
      await revokeAppleToken(uid,authorizationCode,actor.verifiedFirebaseIdToken);
      await doc('teyzaAppleRevocations/'+uid).set({
        ownerUid:uid,status:'revoked',revokedAt:stamp
      });
      return {revoked:true};
    }
    if(action==='account_deletion_request') {
      if(data.confirmation!=='DELETE')D.fail(422,'Type DELETE to confirm your request.');
      recent(actor,stamp);
      const request=await db.runTransaction(async tx=>{
        const requestRef=doc('teyzaAccountDeletionRequests/'+uid);
        const sellerRef=doc('teyzaSellerAccounts/'+uid);
        const publicRef=doc('teyzaPublicShops/'+uid);
        const mandateRef=doc('teyzaSellerMandates/'+uid);
        const billingRef=doc('teyzaBilling/'+uid);
        const shopperProfileRef=doc('teyzaShopperProfiles/'+uid);
        const appleRevocationRef=doc('teyzaAppleRevocations/'+uid);
        const [old,a,shop,m,b,shopperProfile,appleRevocation]=await Promise.all([
          tx.get(requestRef),tx.get(sellerRef),tx.get(publicRef),tx.get(mandateRef),
          tx.get(billingRef),tx.get(shopperProfileRef),tx.get(appleRevocationRef),
        ]);
        if(old.exists)return old.data();
        const isSeller=a.exists&&a.data().uid===uid;
        const reference='TZ-DEL-'+crypto.randomBytes(6).toString('hex').toUpperCase();
        const record={uid,reference,status:'pending_review',seller:isSeller,
          requestedAt:stamp,completeBy:stamp+COMPLETE_BY_MS,
          needsBillingReview:isSeller&&(m.exists||b.exists),
          needsAppleTokenReview:!(appleRevocation.exists&&
            appleRevocation.data().ownerUid===uid&&appleRevocation.data().status==='revoked')};
        tx.set(requestRef,record);
        // Delete the shopper's saved delivery address and contact profile as
        // part of the closure transaction, independently of seller approval.
        // Order and tax records remain subject to the documented erasure review.
        if(shopperProfile.exists&&shopperProfile.data().ownerUid===uid)
          tx.delete(shopperProfileRef);
        // Immediately remove pending-closure sellers from public discovery and
        // stop new orders or new Teyza-managed invoices.
        if(isSeller)tx.update(sellerRef,{deletionPending:true,
          listingStatus:'not_listed',approvalStatus:'pending',
          updatedAt:new Date(stamp)});
        if(shop.exists&&shop.data().sellerUid===uid)tx.update(publicRef,{
          status:'suspended',sellingEnabled:false,catalogueEnabled:false,
          deletionPending:true,updatedAt:stamp,
        });
        // Internal mandate flag is NOT proof an external debit was cancelled:
        // external collections must be independently checked by operations.
        if(m.exists&&m.data().ownerUid===uid)tx.update(mandateRef,{
          status:'withdrawn',withdrawnAt:stamp,deletionPending:true,
        });
        if(b.exists&&b.data().ownerUid===uid)tx.update(billingRef,{
          status:'closure_review',deletionPending:true,updatedAt:stamp,
        });
        return record;
      });
      // The old Auth identity is removed so new registration uses a new UID.
      return blockSignIn(uid,request);
    }
    if(action==='ops_account_deletion_queue') {
      admin(actor,stamp);
      const pageSize=50;
      let query=db.collection('teyzaAccountDeletionRequests').orderBy('__name__').limit(pageSize+1);
      if(data.after)query=query.startAfter(D.id(data.after));
      const rows=await query.get();
      const page=rows.docs.slice(0,pageSize);
      return {requests:page.filter(x=>x.data().status!=='completed')
        .map(x=>({uid:x.id,reference:x.data().reference,status:x.data().status,
          signInBlocked:x.data().authDisabledAt>0,canRegisterAgain:x.data().authDeletedAt>0,
          requestedAt:x.data().requestedAt,completeBy:x.data().completeBy,
          seller:x.data().seller===true,needsBillingReview:x.data().needsBillingReview===true})),
        nextAfter:rows.docs.length>pageSize?page[page.length-1].id:null};
    }
    if(action==='ops_account_deletion_complete') {
      admin(actor,stamp);
      const target=D.id(data.uid);
      if(target===uid)D.fail(403,'Another administrator must review your own account deletion.');
      if(data.confirmedDataErased!==true||data.confirmedBillingResolved!==true||
         data.confirmedProviderRevocation!==true)
        D.fail(422,'Confirm data cleanup, external billing closure and applicable identity-provider revocation before completion.');
      const ref=doc('teyzaAccountDeletionRequests/'+target),r=await get(ref);
      if(!r)D.fail(404,'Deletion request not found.');
      if(r.status==='completed')return {completed:true,reference:r.reference};
      // Check every order, not just the first page; a merchant may have
      // hundreds of completed orders and one remaining open delivery.
      for(const field of ['ownerUid','shopperUid']) {
        let after=null;
        for(;;) {
          let query=db.collection('teyzaMobileOrders').where(field,'==',target)
            .orderBy('__name__').limit(100);
          if(after)query=query.startAfter(after);
          const orders=await query.get();
          if(orders.docs.some(x=>!['completed','cancelled'].includes(x.data().status)))
            D.fail(409,'Resolve outstanding orders before completing account deletion.');
          if(orders.docs.length<100)break;
          after=orders.docs[orders.docs.length-1];
        }
      }
      if(typeof deleteAuthUser!=='function')D.fail(503,'Account deletion service is not configured.');
      try { await deleteAuthUser(target); }
      catch(error) {
        if(error?.code!=='auth/user-not-found')throw error;
      }
      await ref.update({status:'completed',completedAt:clock(),reviewedBy:uid,
        retentionNotice:'Only records legally required for accounting, tax, disputes or safety are retained.'});
      return {completed:true,reference:r.reference};
    }
    D.fail(404,'Unknown account deletion action.');
  }
  return {execute};
}
module.exports={createAccountDeletion,actions,MAX_AGE_MS,COMPLETE_BY_MS};
