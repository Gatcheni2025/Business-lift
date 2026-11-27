'use strict';

// Isolated server-side building block. This module is NOT wired to an endpoint,
// Firestore, publication checks, or the app. Its dependencies must be supplied
// only by trusted server code; a client must not supply expected or send.
const {evaluateAuthenticatedStoreClaim}=require('./store-billing-policy');

const PACKAGE='com.asiyedriver.asiye';
const PLAY_ORIGIN='https://androidpublisher.googleapis.com';
const states={
  SUBSCRIPTION_STATE_ACTIVE:'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD:'grace',
  SUBSCRIPTION_STATE_CANCELED:'canceled'
};
const deny=code=>({allowed:false,code});
const text=(value,max)=>typeof value==='string'&&value.length>0&&
  value.length<=max&&!/\s/.test(value);
function timestamp(value){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value))return null;
  const t=Date.parse(value);
  return Number.isSafeInteger(t)&&t>=0?t:null;
}

/** Query Play directly, then evaluate only its response, never a client claim.
 * getAccessToken, send and expected are trusted SERVER dependencies. Until
 * replay-safe persistence, purchase acknowledgement, notifications, and
 * entitlement wiring exist, even an allowed result must not grant access.
 */
async function verifyGoogleSubscription({purchaseToken,expected,getAccessToken,send=fetch,now=Date.now()}={}){
  if(!expected||expected.provider!=='google_play'||expected.appId!==PACKAGE||
      !text(purchaseToken,8192)||typeof getAccessToken!=='function'||typeof send!=='function')
    return deny('invalid_request');
  try{
    const accessToken=await getAccessToken();
    if(!text(accessToken,16384))return deny('verification_unavailable');
    const path=`/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE)}`+
      `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const response=await send(PLAY_ORIGIN+path,{
      method:'GET',headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'},
      signal:AbortSignal.timeout(10000)
    });
    if(!response||response.ok!==true||typeof response.json!=='function')
      return deny('verification_unavailable');
    const data=await response.json();
    if(!data||typeof data!=='object'||!Array.isArray(data.lineItems)||data.lineItems.length!==1)
      return deny('invalid_provider_response');
    const line=data.lineItems[0];
    if(!line||!line.autoRenewingPlan||typeof line.autoRenewingPlan.autoRenewEnabled!=='boolean')
      return deny('invalid_provider_response');
    const startsAtMs=timestamp(data.startTime);
    const expiresAtMs=timestamp(line.expiryTime);
    if(startsAtMs===null||expiresAtMs===null)return deny('invalid_provider_response');
    const claim={
      provider:'google_play',appId:PACKAGE,productId:line.productId,
      accountBinding:data.externalAccountIdentifiers?.obfuscatedExternalAccountId,
      environment:Object.hasOwn(data,'testPurchase')?'sandbox':'production',
      purchaseReference:purchaseToken,startsAtMs,expiresAtMs,
      state:states[data.subscriptionState]||'unsupported',
      autoRenewing:line.autoRenewingPlan.autoRenewEnabled,
      // Play's current state is queried directly. Refund/revocation lifecycle
      // notifications and periodic re-verification remain mandatory before use.
      revoked:false,refunded:false
    };
    return evaluateAuthenticatedStoreClaim({claim,expected,now});
  }catch(_error){
    // Provider errors can contain tokens: never return or log the exception.
    return deny('verification_unavailable');
  }
}

module.exports={verifyGoogleSubscription};
