'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {quote}=require('./shop-services');
const shop={sellerUid:'seller1',pickupEnabled:true,deliveryEnabled:true,
  services:{cardPayments:true,cashDiscountPercent:10},
  products:[{id:'stock1',name:'Rice',priceCents:2500,stock:10}]};
const request=(mode='delivery',paymentMethod='card_online')=>({
  mode,paymentMethod,items:[{id:'stock1',quantity:2}]});
test('card-online order is quoted only when the seller accepts cards',()=>{
  const ok=quote(shop,{cardPayments:true},request());
  assert.equal(ok.paymentMethod,'card_online');
  assert.equal(ok.subtotalCents,5000);
  assert.equal(ok.cardFeeCents,0);
  assert.equal(ok.cashDiscountCents,0);
  assert.throws(()=>quote(shop,{cardPayments:false},request()),e=>e.status===409);
});
test('card-at-shop remains collection-only; cash discount stays cash-only',()=>{
  assert.throws(()=>quote(shop,{cardPayments:true},request('delivery','card_at_shop')),
    e=>e.status===409);
  assert.equal(quote(shop,{cardPayments:true},request('collection','card_at_shop')).cardFeeCents,0);
  assert.equal(quote(shop,{cardPayments:true},request('collection','cash')).cashDiscountCents,500);
});
