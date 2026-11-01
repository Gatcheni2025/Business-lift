'use strict';

// Verified, self-service account-deletion initiation. Erasure is intentionally
// separated from initiation because shop owners can have outstanding deliveries,
// statutory billing records, external mandates and Apple token-revocation work.
const crypto=require('node:crypto');
const D=require('./domain');
const MAX_AGE_MS=15*60*1000;
const COMPLETE_BY_MS=30*24*60*60*1000;
const actions=new Set([
  'account_deletion_request','account_deletion_status',
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
    seller:record.seller===true,
    message:record.status==='completed'
      ? 'Your account deletion is complete.'
      : 'Your deletion request has been received. We aim to complete it within 30 days. Some billing and order records may need lawful retention.',
  };
}
function createAccountDeletion({db,getAuthUser,deleteAuthUser,clock=Date.now}) {
  const doc=path=>db.doc(path);
  const get=async ref=>{const s=await ref.get();return s.exists?s.data():null;};
  async function execute(actor,action,data={}) {
    if(!actor?.uid)D.fail(401,'Sign in first.');
    const uid=D.id(actor.uid),stamp=clock();
    if(action==='account_deletion_status') {
      const entry=await get(doc('teyzaAccountDeletionRequests/'+uid));
      return entry?publicStatus(entry):{requested:false};
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
        const [old,a,shop,m,b]=await Promise.all([
          tx.get(requestRef),tx.get(sellerRef),tx.get(publicRef),tx.get(mandateRef),tx.get(billingRef),
        ]);
        if(old.exists)return old.data();
        const isSeller=a.exists&&a.data().uid===uid;
        const reference='TZ-DEL-'+crypto.randomBytes(6).toString('hex').toUpperCase();
        const record={uid,reference,status:'pending_review',seller:isSeller,
          requestedAt:stamp,completeBy:stamp+COMPLETE_BY_MS,
          needsBillingReview:isSeller&&(m.exists||b.exists),
          needsAppleTokenReview:true};
        tx.set(requestRef,record);
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
      return publicStatus(request);
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
