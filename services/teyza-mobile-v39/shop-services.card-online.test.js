'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {quote,commerce,effective}=require('./shop-services');
const shop={sellerUid:'seller1',pickupEnabled:true,deliveryEnabled:true,
  services:{cardPayments:true,cashDiscountPercent:10},
  products:[{id:'stock1',name:'Rice',priceCents:2500,stock:10}]};
const request=(mode='delivery',paymentMethod='card_online')=>({
  mode,paymentMethod,items:[{id:'stock1',quantity:2}]});
const live={onlinePaymentsReady:true};
test('online orders require an explicit payment preference and live settlement readiness',()=>{
  const ok=quote(shop,{cardPayments:false,onlinePaymentsEnabled:true},request(),live);
  assert.equal(ok.paymentMethod,'card_online');
  assert.equal(ok.subtotalCents,5000);
  assert.equal(ok.cardFeeCents,0);
  assert.equal(ok.cashDiscountCents,0);
  assert.throws(()=>quote(shop,{cardPayments:true},request(),live),e=>e.status===409);
  assert.throws(()=>quote(shop,{onlinePaymentsEnabled:true},request()),e=>e.status===409);
  assert.throws(()=>quote(shop,{onlinePaymentsEnabled:true},request(),{onlinePaymentsReady:false}),e=>e.status===409);
});
test('Pausing online ordering leaves discovery/card-at-shop settings untouched and blocks new requests',()=>{
 const settings={onlineOrdersEnabled:false,cardPayments:true,onlinePaymentsEnabled:true};
 assert.throws(()=>quote(shop,settings,request('collection','cash')),e=>e.status===409);
 assert.equal(effective(settings,shop).cardPayments,true);
 assert.equal(effective({},shop).onlineOrdersEnabled,true,'Existing orders were offered before the new preference');
 assert.equal(effective({},shop).onlinePaymentsEnabled,false,'POS acceptance never activates online payment');
});
test('Out-of-range online totals are rejected before an order can be placed while cash remains available',()=>{
 for(const priceCents of [50,5000001]){
  const store={...shop,products:[{id:'stock1',name:'Item',priceCents,stock:10}]};
  const request={mode:'collection',items:[{id:'stock1',quantity:1}]};
  const cash=quote(store,{onlinePaymentsEnabled:true},{...request,paymentMethod:'cash'},live);
  assert.equal(cash.commerce.onlinePaymentsReady,false);assert.equal(cash.commerce.onlinePaymentsReason,'amount_out_of_range');
  assert.throws(()=>quote(store,{onlinePaymentsEnabled:true},{...request,paymentMethod:'card_online'},live),e=>e.status===422);
 }
});
test('Commerce readiness distinguishes seller intent, approval, access, currency environment and verified payout',()=>{
 const config={onlineOrdersEnabled:true,onlinePaymentsEnabled:true};
 const store={...shop,status:'active',shopCategory:'spaza'};
 const state={registered:true,ready:true,approved:true,live:true,canSell:true};
 const payout={ownerUid:'seller1',code:'ACCT_seller12345',enabled:true,verifiedWithPaystack:true,mode:'live'};
 const opts={publication:state,payout,environment:'live'};
 assert.equal(commerce(config,store,opts).onlinePaymentsReady,true);
 const cases=[
  [{...opts,publication:{...state,approved:false}},'seller_approval_pending'],
  [{...opts,publication:{...state,ready:false}},'shop_setup_incomplete'],
  [{...opts,publication:{...state,canSell:false}},'selling_access_inactive'],
  [{...opts,environment:'unconfigured'},'provider_not_configured'],
  [{...opts,environment:'test'},'test_mode'],
  [{...opts,payout:null},'settlement_pending'],
  [{...opts,payout:{...payout,ownerUid:'other'}},'settlement_pending'],
  [{...opts,category:'retail'},'category_not_supported']
 ];
 for(const [context,reason] of cases){const result=commerce(config,store,context);
  assert.equal(result.onlinePaymentsReady,false);assert.equal(result.onlinePaymentsReason,reason);}
 assert.equal(commerce({...config,onlineOrdersEnabled:false},store,opts).onlineOrdersReason,'online_orders_disabled');
 assert.equal(commerce({...config,onlinePaymentsEnabled:false},store,opts).onlinePaymentsReason,'online_payments_disabled');
 assert.equal(commerce(config,{...store,pickupEnabled:false,deliveryEnabled:false},opts).onlineOrdersReason,'fulfilment_unavailable');
 assert.equal(JSON.stringify(commerce(config,store,opts)).includes(payout.code),false,'No settlement identifier is exposed publicly');
});
test('card-at-shop remains collection-only; cash discount stays cash-only',()=>{
  assert.throws(()=>quote(shop,{cardPayments:true},request('delivery','card_at_shop')),
    e=>e.status===409);
  assert.equal(quote(shop,{cardPayments:true},request('collection','card_at_shop')).cardFeeCents,0);
  assert.equal(quote(shop,{cardPayments:true},request('collection','cash')).cashDiscountCents,500);
});
