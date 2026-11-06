'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluateAuthenticatedStoreClaim,canPrepareSubscription}=require('./store-billing-policy');

const now=1900000000000;
const expected={provider:'apple_app_store',projectId:'business-lift-3c19c',
  appId:'za.co.teyza.shopper',productId:'teyza_seller_monthly',
  accountBinding:'8c0fc625-f327-4a72-91ca-5cce142575ca',environment:'production'};
const claim={provider:expected.provider,environment:'production',appId:expected.appId,
  productId:expected.productId,accountBinding:expected.accountBinding,
  purchaseReference:'example-original-transaction',startsAtMs:now-1000,
  expiresAtMs:now+100000,state:'active',autoRenewing:true,revoked:false,refunded:false};
const eligible={approved:true,ready:true,blocked:false};
const empty={complete:true,memberships:[],pendingAttempts:[]};

test('a matching authenticated active store claim produces a hashed reference only',()=>{
  const result=evaluateAuthenticatedStoreClaim({claim,expected,now});
  assert.equal(result.allowed,true);assert.equal(result.paidUntilMs,claim.expiresAtMs);
  assert.match(result.purchaseKey,/^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes(claim.purchaseReference),false);
});
test('a mismatched app, product, seller binding, provider or environment is refused',()=>{
  for(const changes of [{appId:'other.app'},{productId:'other_product'},
    {accountBinding:'different-owner'},{provider:'google_play'},{environment:'sandbox'}]){
    assert.equal(evaluateAuthenticatedStoreClaim({claim:{...claim,...changes},expected,now}).allowed,false);
  }
});
test('test purchases cannot unlock the live project; an isolated project can assess sandbox claims',()=>{
  const sandbox={...expected,environment:'sandbox'};
  assert.equal(evaluateAuthenticatedStoreClaim({claim:{...claim,environment:'sandbox'},expected:sandbox,now}).code,'sandbox_in_production');
  assert.equal(evaluateAuthenticatedStoreClaim({claim:{...claim,environment:'sandbox'},
    expected:{...sandbox,projectId:'teyza-isolated-test',allowSandbox:true},now}).allowed,true);
  assert.equal(evaluateAuthenticatedStoreClaim({claim:{...claim,environment:'sandbox'},
    expected:{...sandbox,projectId:'teyza-isolated-test'},now}).code,'sandbox_not_enabled');
});
test('expired, pending, held, future, revoked and refunded claims do not grant paid access',()=>{
  for(const changes of [{expiresAtMs:now},{state:'pending'},{state:'on_hold'},
    {startsAtMs:now+1},{revoked:true},{refunded:true},{revoked:undefined},
    {refunded:undefined},{expiresAtMs:'1900000100000'}]){
    assert.equal(evaluateAuthenticatedStoreClaim({claim:{...claim,...changes},expected,now}).allowed,false);
  }
});
test('a cancellation keeps access until the paid-through date without representing an automatic renewal',()=>{
  assert.equal(evaluateAuthenticatedStoreClaim({claim:{...claim,state:'canceled',autoRenewing:false},expected,now}).allowed,true);
  assert.equal(evaluateAuthenticatedStoreClaim({claim:{...claim,state:'canceled',autoRenewing:true},expected,now}).allowed,false);
});
test('a different provider and reference produce different stored fingerprints',()=>{
  const apple=evaluateAuthenticatedStoreClaim({claim,expected,now}).purchaseKey;
  const googleExpected={...expected,provider:'google_play',appId:'com.asiyedriver.asiye',accountBinding:'server-generated-opaque-id'};
  const google=evaluateAuthenticatedStoreClaim({claim:{...claim,provider:'google_play',
    appId:googleExpected.appId,accountBinding:googleExpected.accountBinding},expected:googleExpected,now}).purchaseKey;
  assert.notEqual(apple,google);
});
test('only an approved, ready and unblocked seller can prepare a purchase',()=>{
  assert.equal(canPrepareSubscription({seller:eligible,snapshot:empty,now}).allowed,true);
  for(const changes of [{approved:false},{ready:false},{blocked:true},{blocked:undefined}])
    assert.equal(canPrepareSubscription({seller:{...eligible,...changes},snapshot:empty,now}).allowed,false);
});
test('incomplete provider state and pending checkouts block a second payment',()=>{
  assert.equal(canPrepareSubscription({seller:eligible,snapshot:{...empty,complete:false},now}).code,'billing_state_unknown');
  assert.equal(canPrepareSubscription({seller:eligible,snapshot:{...empty,pendingAttempts:[{provider:'paystack'}]},now}).code,'checkout_pending');
});
test('current Paystack or store membership and uncertain renewal block duplicate subscriptions',()=>{
  for(const provider of ['paystack','apple_app_store','google_play']){
    const current={provider,state:'active',paidUntilMs:now+1,autoRenewing:true};
    assert.equal(canPrepareSubscription({seller:eligible,snapshot:{...empty,memberships:[current]},now}).code,'membership_current');
    const uncertain={...current,paidUntilMs:now-1};
    assert.equal(canPrepareSubscription({seller:eligible,snapshot:{...empty,memberships:[uncertain]},now}).code,'renewal_needs_reconciliation');
  }
});
test('only a confirmed ended, nonrenewing and expired membership permits another purchase',()=>{
  const past={provider:'paystack',state:'canceled',paidUntilMs:now-1,autoRenewing:false};
  assert.equal(canPrepareSubscription({seller:eligible,snapshot:{...empty,memberships:[past]},now}).allowed,true);
  assert.equal(canPrepareSubscription({seller:eligible,snapshot:{...empty,memberships:[{...past,autoRenewing:true}]},now}).allowed,false);
  assert.equal(canPrepareSubscription({seller:eligible,snapshot:{...empty,memberships:[{...past,state:'unknown'}]},now}).allowed,false);
});
