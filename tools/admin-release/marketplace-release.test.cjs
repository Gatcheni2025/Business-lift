'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {parseEnv,assertEnv,compareHealth}=require('./marketplace-release.cjs');
test('Release refuses missing or changed runtime settings without disclosing values',()=>{
 const local=parseEnv('TEYZA_SELLER_PAYSTACK_ENABLED=false\nTEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_example\n');
 assert.doesNotThrow(()=>assertEnv(local,{...local,FIREBASE_CONFIG:'generated'}));
 assert.throws(()=>assertEnv({...local,TEYZA_SELLER_PAYSTACK_ENABLED:'true'},local),/TEYZA_SELLER_PAYSTACK_ENABLED/);
 assert.throws(()=>assertEnv(local,{...local,TEYZA_EXTRA:'setting'}),/TEYZA_EXTRA/);
 assert.throws(()=>parseEnv('A=one\nA=two'),/Ambiguous/);
 const h={paystackCheckoutAvailable:false,sellerPaystackNewCheckoutDisabled:true};
 assert.doesNotThrow(()=>compareHealth(h,{...h,marketplaceRelease:'20261126-v61'}));
 assert.throws(()=>compareHealth(h,{...h,paystackCheckoutAvailable:true}),/setting changed/);
});
