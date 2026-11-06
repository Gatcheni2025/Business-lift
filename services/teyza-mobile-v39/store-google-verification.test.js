'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {verifyGoogleSubscription}=require('./store-google-verification');

const now=Date.parse('2026-11-06T12:00:00Z');
const expected={provider:'google_play',projectId:'business-lift-3c19c',
  appId:'com.asiyedriver.asiye',productId:'teyza_seller_monthly',
  accountBinding:'opaque-seller-id',environment:'production'};
const fixture=()=>({subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',
  startTime:'2026-11-01T00:00:00Z',
  externalAccountIdentifiers:{obfuscatedExternalAccountId:'opaque-seller-id'},
  lineItems:[{productId:'teyza_seller_monthly',expiryTime:'2026-12-01T00:00:00Z',
    autoRenewingPlan:{autoRenewEnabled:true}}]});
const token='fake-purchase-token';
const args=(data=fixture())=>({purchaseToken:token,expected,
  getAccessToken:async()=> 'fake-server-access-token',
  send:async()=>({ok:true,json:async()=>data}),now});

test('queries only the fixed Play API endpoint and evaluates the returned purchase',async()=>{
  let called=false;
  const a=args();
  a.send=async(url,options)=>{
    called=true;
    assert.equal(url,'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.asiyedriver.asiye/purchases/subscriptionsv2/tokens/fake-purchase-token');
    assert.equal(options.method,'GET');
    assert.equal(options.headers.authorization,'Bearer fake-server-access-token');
    assert.ok(options.signal instanceof AbortSignal);
    return {ok:true,json:async()=>fixture()};
  };
  const result=await verifyGoogleSubscription(a);
  assert.equal(called,true);
  assert.equal(result.allowed,true);
  assert.equal(result.paidUntilMs,Date.parse('2026-12-01T00:00:00Z'));
  assert.match(result.purchaseKey,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes(token));
});

test('rejects the wrong package without reaching Google',async()=>{
  let called=false;const a=args();a.expected={...expected,appId:'other.app'};
  a.send=async()=>{called=true;};
  assert.equal((await verifyGoogleSubscription(a)).allowed,false);
  assert.equal(called,false);
});

test('rejects a purchase belonging to another seller or product',async()=>{
  for(const change of [d=>{d.lineItems[0].productId='another_product';},
    d=>{d.externalAccountIdentifiers.obfuscatedExternalAccountId='other-seller';},
    d=>{delete d.externalAccountIdentifiers;}]){
    const d=fixture();change(d);
    assert.equal((await verifyGoogleSubscription(args(d))).code,'identity_mismatch');
  }
});

test('a test purchase never grants production project access',async()=>{
  const d=fixture();d.testPurchase={};
  assert.equal((await verifyGoogleSubscription(args(d))).allowed,false);
  const a=args(d);a.expected={...expected,environment:'sandbox',allowSandbox:true};
  assert.equal((await verifyGoogleSubscription(a)).code,'sandbox_in_production');
  a.expected={...a.expected,projectId:'teyza-test-project'};
  assert.equal((await verifyGoogleSubscription(a)).allowed,true);
});

test('fails closed for pending, expired, on-hold and paused subscriptions',async()=>{
  for(const state of ['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_EXPIRED',
    'SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED']){
    const d=fixture();d.subscriptionState=state;
    assert.equal((await verifyGoogleSubscription(args(d))).allowed,false,state);
  }
  const expired=fixture();expired.lineItems[0].expiryTime='2026-11-05T00:00:00Z';
  assert.equal((await verifyGoogleSubscription(args(expired))).code,'expired');
});

test('canceled access ends on its paid-through date and cannot claim renewal',async()=>{
  const d=fixture();d.subscriptionState='SUBSCRIPTION_STATE_CANCELED';
  assert.equal((await verifyGoogleSubscription(args(d))).allowed,false);
  d.lineItems[0].autoRenewingPlan.autoRenewEnabled=false;
  assert.equal((await verifyGoogleSubscription(args(d))).allowed,true);
  assert.equal((await verifyGoogleSubscription({...args(d),now:Date.parse('2026-12-01T00:00:00Z')})).allowed,false);
});

test('requires an unambiguous auto-renewing line and valid dates',async()=>{
  for(const change of [d=>d.lineItems.push({...d.lineItems[0]}),
    d=>{delete d.lineItems[0].autoRenewingPlan;},d=>{d.startTime='tomorrow';},
    d=>{d.lineItems[0].expiryTime='invalid';}]){
    const d=fixture();change(d);
    assert.equal((await verifyGoogleSubscription(args(d))).code,'invalid_provider_response');
  }
});

test('does not expose purchase tokens or provider errors on verification failure',async()=>{
  const a=args();a.send=async()=>{throw new Error('secret '+token);};
  assert.deepEqual(await verifyGoogleSubscription(a),{allowed:false,code:'verification_unavailable'});
  a.send=async()=>({ok:false,json:async()=>fixture()});
  assert.deepEqual(await verifyGoogleSubscription(a),{allowed:false,code:'verification_unavailable'});
});
