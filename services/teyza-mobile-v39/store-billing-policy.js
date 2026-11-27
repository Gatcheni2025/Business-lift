'use strict';

// This module is a policy building block, not a receipt verifier. It is not
// wired to an endpoint or publication rules. Only a future trusted server-side
// Apple/Google verifier may supply claims; client-supplied claims are not proof.
const {createHash}=require('node:crypto');

const STORE_PROVIDERS=new Set(['apple_app_store','google_play']);
const ALL_PROVIDERS=new Set(['apple_app_store','google_play','paystack']);
const ENTITLED_STATES=new Set(['active','grace','canceled']);
const ENDED_STATES=new Set(['expired','canceled','ended']);
const PRODUCTION_PROJECT='business-lift-3c19c';
const denied=code=>({allowed:false,code});

function validText(value,max=256){
  return typeof value==='string'&&value.length>0&&value.length<=max&&value.trim()===value;
}
function validTime(value){return Number.isSafeInteger(value)&&value>=0;}

/**
 * Evaluate a normalized claim already authenticated with the appropriate
 * provider API and bound to the seller by server-held data. This function
 * does not validate an Apple signature, call Google, or grant any access.
 */
function evaluateAuthenticatedStoreClaim({claim,expected,now=Date.now()}={}){
  if(!claim||!expected||!validTime(now)||!STORE_PROVIDERS.has(expected.provider)||
      !validText(expected.projectId)||!validText(expected.appId)||
      !validText(expected.productId)||!validText(expected.accountBinding)||
      !['production','sandbox'].includes(expected.environment))return denied('invalid_configuration');
  if(expected.projectId===PRODUCTION_PROJECT&&expected.environment!=='production')
    return denied('sandbox_in_production');
  if(expected.environment==='sandbox'&&expected.allowSandbox!==true)
    return denied('sandbox_not_enabled');
  if(claim.provider!==expected.provider||claim.environment!==expected.environment||
      claim.appId!==expected.appId||claim.productId!==expected.productId||
      claim.accountBinding!==expected.accountBinding)return denied('identity_mismatch');
  if(!validText(claim.purchaseReference,8192)||!validTime(claim.expiresAtMs)||
      !validTime(claim.startsAtMs)||claim.startsAtMs>now||
      typeof claim.autoRenewing!=='boolean'||typeof claim.revoked!=='boolean'||
      typeof claim.refunded!=='boolean')return denied('invalid_claim');
  if(claim.revoked===true||claim.refunded===true||!ENTITLED_STATES.has(claim.state))
    return denied('not_entitled');
  if(claim.expiresAtMs<=now)return denied('expired');
  // A canceled subscription can remain usable through its paid period, but it
  // cannot simultaneously be presented as renewing without reconciliation.
  if(claim.state==='canceled'&&claim.autoRenewing)return denied('inconsistent_state');
  return {allowed:true,paidUntilMs:claim.expiresAtMs,
    autoRenewing:claim.autoRenewing,
    purchaseKey:createHash('sha256').update(expected.provider).update('\0')
      .update(claim.purchaseReference).digest('hex')};
}

/**
 * Decide whether a NEW subscription may be prepared, never whether to charge.
 * The snapshot must be assembled by the server from all providers and all
 * pending checkouts; uncertainty blocks a new purchase until reconciled.
 */
function canPrepareSubscription({seller,snapshot,now=Date.now()}={}){
  if(!validTime(now)||!seller||seller.approved!==true||seller.ready!==true||
      seller.blocked!==false)return denied('seller_not_eligible');
  if(!snapshot||snapshot.complete!==true||!Array.isArray(snapshot.memberships)||
      !Array.isArray(snapshot.pendingAttempts))return denied('billing_state_unknown');
  if(snapshot.pendingAttempts.length>0)return denied('checkout_pending');
  for(const membership of snapshot.memberships){
    if(!membership||!ALL_PROVIDERS.has(membership.provider)||
        !validTime(membership.paidUntilMs)||typeof membership.autoRenewing!=='boolean'||
        !validText(membership.state))return denied('billing_state_unknown');
    if(membership.paidUntilMs>now)return denied('membership_current');
    if(membership.autoRenewing||!ENDED_STATES.has(membership.state))
      return denied('renewal_needs_reconciliation');
  }
  return {allowed:true};
}

module.exports={evaluateAuthenticatedStoreClaim,canPrepareSubscription};
