'use strict';

// Isolated server-side building block. NOT connected to an endpoint, app or
// Firestore. Production must supply Apple's official verifier, configured with
// pinned Apple root certificates, the correct environment/bundle/app ID, and
// an authenticated App Store Server API client. Never accept these from users.
const {evaluateAuthenticatedStoreClaim}=require('./store-billing-policy');
const BUNDLE='za.co.teyza.shopper';
const deny=code=>({allowed:false,code});
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/\s/.test(v);
const safeTime=v=>Number.isSafeInteger(v)&&v>=0;

/** Verify Apple-signed transaction data and re-query current server status.
 * A successful result is NOT yet an entitlement: replay-safe persistence,
 * lifecycle notifications, and publication integration are still required.
 */
async function verifyAppleSubscription({signedTransaction,expected,verifier,client,now=Date.now()}={}){
  if(!expected||expected.provider!=='apple_app_store'||expected.appId!==BUNDLE||
      !['production','sandbox'].includes(expected.environment)||
      !text(expected.productId,256)||!text(expected.accountBinding,256)||
      !text(signedTransaction,32768)||!verifier||!client||
      typeof verifier.verifyAndDecodeTransaction!=='function'||
      typeof verifier.verifyAndDecodeRenewalInfo!=='function'||
      typeof client.getAllSubscriptionStatuses!=='function'||
      (expected.environment==='production'&&(!Number.isSafeInteger(expected.appAppleId)||expected.appAppleId<=0)))
    return deny('invalid_request');
  const appleEnvironment=expected.environment==='production'?'Production':'Sandbox';
  try{
    const first=await verifier.verifyAndDecodeTransaction(signedTransaction);
    if(!first||first.bundleId!==BUNDLE||first.productId!==expected.productId||
        first.environment!==appleEnvironment||first.appAccountToken!==expected.accountBinding||
        !text(first.originalTransactionId,128))return deny('identity_mismatch');
    const response=await client.getAllSubscriptionStatuses(first.originalTransactionId);
    if(!response||response.bundleId!==BUNDLE||response.environment!==appleEnvironment||
        (expected.environment==='production'&&response.appAppleId!==expected.appAppleId)||
        !Array.isArray(response.data))return deny('invalid_provider_response');
    const matching=[];
    for(const group of response.data){
      if(!group||!Array.isArray(group.lastTransactions))return deny('invalid_provider_response');
      for(const item of group.lastTransactions){
        if(item?.originalTransactionId===first.originalTransactionId)matching.push(item);
      }
    }
    if(matching.length!==1)return deny('invalid_provider_response');
    const latest=matching[0];
    if(![1,4].includes(latest.status)||!text(latest.signedTransactionInfo,32768)||
        !text(latest.signedRenewalInfo,32768))return deny('not_entitled');
    const transaction=await verifier.verifyAndDecodeTransaction(latest.signedTransactionInfo);
    const renewal=await verifier.verifyAndDecodeRenewalInfo(latest.signedRenewalInfo);
    if(!transaction||!renewal||transaction.originalTransactionId!==first.originalTransactionId||
        renewal.originalTransactionId!==first.originalTransactionId||transaction.bundleId!==BUNDLE||
        transaction.environment!==appleEnvironment||transaction.productId!==expected.productId||
        transaction.appAccountToken!==expected.accountBinding||
        ![0,1].includes(renewal.autoRenewStatus))return deny('identity_mismatch');
    if(!safeTime(transaction.purchaseDate)||!safeTime(transaction.expiresDate)||
        (latest.status===4&&!safeTime(renewal.gracePeriodExpiresDate)))
      return deny('invalid_provider_response');
    const claim={provider:'apple_app_store',appId:BUNDLE,productId:transaction.productId,
      accountBinding:transaction.appAccountToken,environment:expected.environment,
      purchaseReference:first.originalTransactionId,startsAtMs:transaction.purchaseDate,
      expiresAtMs:latest.status===4?renewal.gracePeriodExpiresDate:transaction.expiresDate,
      state:latest.status===4?'grace':'active',autoRenewing:renewal.autoRenewStatus===1,
      revoked:transaction.revocationDate!==undefined&&transaction.revocationDate!==null,
      refunded:transaction.revocationDate!==undefined&&transaction.revocationDate!==null};
    return evaluateAuthenticatedStoreClaim({claim,expected,now});
  }catch(_error){
    // Signed payloads can appear in provider errors: never return or log them.
    return deny('verification_unavailable');
  }
}

module.exports={verifyAppleSubscription};
