'use strict';
const crypto=require('node:crypto'),D=require('./domain');
function effective(saved,shop={}){
 const s=saved||{},services=shop?.services||{};
 const boolean=(key,fallback)=>typeof s[key]==='boolean'?s[key]:fallback;
 return {pickupEnabled:boolean('pickupEnabled',shop?.pickupEnabled??true),deliveryEnabled:boolean('deliveryEnabled',shop?.deliveryEnabled===true),
  cashback:boolean('cashback',services.cashback===true),cardPayments:boolean('cardPayments',services.cardPayments===true),
  liveChatEnabled:boolean('liveChatEnabled',services.liveChat!==false),
  deliveryFeeCents:Number.isInteger(s.deliveryFeeCents)?s.deliveryFeeCents:shop?.deliveryFeeCents||0,
  deliveryRadiusKm:Number.isInteger(s.deliveryRadiusKm)?s.deliveryRadiusKm:shop?.deliveryRadiusKm||0,
  deliveryNotes:s.deliveryNotes??shop?.deliveryNotes??'',cardPaymentFeePercent:0,
  cashDiscountPercent:[0,10].includes(s.cashDiscountPercent)?s.cashDiscountPercent:[0,10].includes(services.cashDiscountPercent)?services.cashDiscountPercent:0};
}
function exposed(values){return {pickupEnabled:values.pickupEnabled,deliveryEnabled:values.deliveryEnabled,
 deliveryFeeCents:values.deliveryEnabled?values.deliveryFeeCents:0,deliveryRadiusKm:values.deliveryEnabled?values.deliveryRadiusKm:0,
 deliveryNotes:values.deliveryNotes,services:{cashback:values.cashback,cardPayments:values.cardPayments,
  payAndCollect:values.pickupEnabled,liveChat:values.liveChatEnabled,cardPaymentFeePercent:0,cashDiscountPercent:values.cashDiscountPercent}};}
function quote(shop,saved,data){
 const settings=effective(saved,shop),mode=data.mode,paymentMethod=data.paymentMethod||'arrange_with_shop';
 if(!['collection','delivery'].includes(mode))D.fail(422,'Choose delivery or collection.');
 if(!(mode==='delivery'?settings.deliveryEnabled:settings.pickupEnabled))D.fail(409,'This fulfilment option is not enabled by the shop.');
 if(!['cash','card_at_shop','arrange_with_shop'].includes(paymentMethod))D.fail(422,'Choose an available payment method.');
 if(paymentMethod==='card_at_shop'&&(!settings.cardPayments||mode!=='collection'))D.fail(409,'Card payment at the shop is available only for collection from a shop that accepts cards.');
 const items=D.orderItems(data.items,shop.products||[]),subtotalCents=items.reduce((sum,p)=>sum+p.priceCents*p.quantity,0);
 const deliveryFeeCents=mode==='delivery'?settings.deliveryFeeCents:0;
 const cashDiscountPercent=paymentMethod==='cash'?settings.cashDiscountPercent:0;
 const cashDiscountCents=Math.round(subtotalCents*cashDiscountPercent/100),cardFeeCents=0;
 const amounts={items,mode,paymentMethod,subtotalCents,deliveryFeeCents,cashDiscountPercent,cashDiscountCents,cardFeeCents,
  totalCents:subtotalCents-cashDiscountCents+deliveryFeeCents};
 const quoteId=crypto.createHash('sha256').update(JSON.stringify({shopId:shop.sellerUid,...amounts})).digest('hex');
 return {...amounts,quoteId,cardPayments:settings.cardPayments,pickupEnabled:settings.pickupEnabled,
  deliveryEnabled:settings.deliveryEnabled,offeredCashDiscountPercent:settings.cashDiscountPercent};
}
module.exports={effective,exposed,quote};
