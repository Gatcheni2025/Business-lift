'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {verifyAppleSubscription}=require('./store-apple-verification');

// These are fake claims and trusted-dependency mocks, not a cryptographic test.
// Real Apple signatures and sandbox transactions remain a release requirement.
const now=Date.parse('2026-11-06T12:00:00Z');
const expected={provider:'apple_app_store',projectId:'business-lift-3c19c',
  appId:'za.co.teyza.shopper',appAppleId:123456789,productId:'teyza_seller_monthly',
  accountBinding:'4cb73a36-3abb-413c-a5b6-5a3da8cfd241',environment:'production'};
const fixture=()=>{
  const transaction={bundleId:expected.appId,productId:expected.productId,
    appAccountToken:expected.accountBinding,environment:'Production',
    originalTransactionId:'100000123456',purchaseDate:Date.parse('2026-11-01T00:00:00Z'),
    expiresDate:Date.parse('2026-12-01T00:00:00Z')};
  const renewal={originalTransactionId:transaction.originalTransactionId,autoRenewStatus:1};
  const response={bundleId:expected.appId,environment:'Production',appAppleId:expected.appAppleId,
    data:[{lastTransactions:[{originalTransactionId:transaction.originalTransactionId,status:1,
      signedTransactionInfo:'latest-signed',signedRenewalInfo:'renewal-signed'}]}]};
  return {first:{...transaction},transaction,renewal,response};
};
function args(f=fixture()){
  return {signedTransaction:'initial-signed',expected,now,
    verifier:{verifyAndDecodeTransaction:async signed=>{
      if(signed==='initial-signed')return f.first;
      if(signed==='latest-signed')return f.transaction;
      throw new Error('signature not verified');
    },verifyAndDecodeRenewalInfo:async signed=>{
      if(signed!=='renewal-signed')throw new Error('signature not verified');
      return f.renewal;
    }},
    client:{getAllSubscriptionStatuses:async id=>{
      assert.equal(id,'100000123456');return f.response;
    }}};
}

test('uses verified Apple transactions and server status for a matching seller',async()=>{
  const result=await verifyAppleSubscription(args());
  assert.equal(result.allowed,true);
  assert.equal(result.paidUntilMs,Date.parse('2026-12-01T00:00:00Z'));
  assert.match(result.purchaseKey,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes('100000123456'));
});

test('refuses an unverified transaction and never returns signature errors',async()=>{
  const a=args();a.signedTransaction='fake-bad-signed';
  assert.deepEqual(await verifyAppleSubscription(a),{allowed:false,code:'verification_unavailable'});
});

test('rejects a different account, product, bundle, or Apple app ID',async()=>{
  for(const change of [f=>{f.first.appAccountToken='other';},
    f=>{f.transaction.appAccountToken='other';},f=>{f.transaction.productId='other';},
    f=>{f.response.bundleId='other';},f=>{f.response.appAppleId=777;}]){
    const f=fixture();change(f);
    assert.equal((await verifyAppleSubscription(args(f))).allowed,false);
  }
});

test('does not turn sandbox purchases into production access',async()=>{
  const f=fixture();f.first.environment='Sandbox';f.transaction.environment='Sandbox';f.response.environment='Sandbox';
  const a=args(f);
  assert.equal((await verifyAppleSubscription(a)).allowed,false);
  a.expected={...expected,environment:'sandbox',allowSandbox:true};
  assert.equal((await verifyAppleSubscription(a)).code,'sandbox_in_production');
  a.expected={...a.expected,projectId:'teyza-test-project'};
  assert.equal((await verifyAppleSubscription(a)).allowed,true);
});

test('reconciles cancellation, expiry, grace period and revocation',async()=>{
  const f=fixture();f.renewal.autoRenewStatus=0;
  assert.equal((await verifyAppleSubscription(args(f))).allowed,true);
  assert.equal((await verifyAppleSubscription({...args(f),now:Date.parse('2026-12-02T00:00:00Z')})).allowed,false);
  f.response.data[0].lastTransactions[0].status=4;
  f.renewal.gracePeriodExpiresDate=Date.parse('2026-12-08T00:00:00Z');
  assert.equal((await verifyAppleSubscription({...args(f),now:Date.parse('2026-12-02T00:00:00Z')})).allowed,true);
  f.transaction.revocationDate=now;
  assert.equal((await verifyAppleSubscription(args(f))).code,'not_entitled');
});

test('fails closed for expired, retry, revoked or ambiguous statuses',async()=>{
  for(const status of [2,3,5]){
    const f=fixture();f.response.data[0].lastTransactions[0].status=status;
    assert.equal((await verifyAppleSubscription(args(f))).allowed,false);
  }
  const f=fixture();f.response.data[0].lastTransactions.push({...f.response.data[0].lastTransactions[0]});
  assert.equal((await verifyAppleSubscription(args(f))).code,'invalid_provider_response');
});

test('requires matching original transaction and signed renewal data',async()=>{
  for(const change of [f=>{f.renewal.originalTransactionId='other';},
    f=>{f.transaction.originalTransactionId='other';},
    f=>{f.response.data[0].lastTransactions[0].signedRenewalInfo='fake';},
    f=>{f.response.data[0].lastTransactions[0].status=4;}]){
    const f=fixture();change(f);
    assert.equal((await verifyAppleSubscription(args(f))).allowed,false);
  }
});
