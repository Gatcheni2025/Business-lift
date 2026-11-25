'use strict';
const crypto=require('node:crypto'),D=require('./domain');
function effective(saved,shop={}){
 const s=saved||{},services=shop?.services||{};
 const boolean=(key,fallback)=>typeof s[key]==='boolean'?s[key]:fallback;
 return {pickupEnabled:boolean('pickupEnabled',shop?.pickupEnabled??true),deliveryEnabled:boolean('deliveryEnabled',shop?.deliveryEnabled===true),
  cashback:boolean('cashback',services.cashback===true),cardPayments:boolean('cardPayments',services.cardPayments===true),
  // Existing collection/delivery requests remain available until the seller
  // opts out. In-person card acceptance never opts a seller into online pay.
  onlineOrdersEnabled:boolean('onlineOrdersEnabled',services.onlineOrdersEnabled!==false),
  onlinePaymentsEnabled:boolean('onlinePaymentsEnabled',services.onlinePaymentsEnabled===true),
  liveChatEnabled:boolean('liveChatEnabled',services.liveChat!==false),
  deliveryFeeCents:Number.isInteger(s.deliveryFeeCents)?s.deliveryFeeCents:shop?.deliveryFeeCents||0,
  deliveryRadiusKm:Number.isInteger(s.deliveryRadiusKm)?s.deliveryRadiusKm:shop?.deliveryRadiusKm||0,
  deliveryNotes:s.deliveryNotes??shop?.deliveryNotes??'',cardPaymentFeePercent:0,
  cashDiscountPercent:[0,10].includes(s.cashDiscountPercent)?s.cashDiscountPercent:[0,10].includes(services.cashDiscountPercent)?services.cashDiscountPercent:0};
}
function exposed(values){return {pickupEnabled:values.pickupEnabled,deliveryEnabled:values.deliveryEnabled,
 deliveryFeeCents:values.deliveryEnabled?values.deliveryFeeCents:0,deliveryRadiusKm:values.deliveryEnabled?values.deliveryRadiusKm:0,
 deliveryNotes:values.deliveryNotes,services:{cashback:values.cashback,cardPayments:values.cardPayments,
  onlineOrdersEnabled:values.onlineOrdersEnabled,onlinePaymentsEnabled:values.onlinePaymentsEnabled,
  payAndCollect:values.pickupEnabled,liveChat:values.liveChatEnabled,cardPaymentFeePercent:0,cashDiscountPercent:values.cashDiscountPercent}};}
const paymentEnvironment=key=>/^sk_live_/.test(key||'')?'live':/^sk_test_/.test(key||'')?'test':'unconfigured';
const validPayout=(uid,payout,environment)=>payout?.ownerUid===uid&&payout.enabled===true&&
 payout.verifiedWithPaystack===true&&/^ACCT_[A-Za-z0-9]{6,48}$/.test(payout.code||'')&&
 ['live','test'].includes(environment)&&payout.mode===environment;
// This object contains capability/reasons only, never bank details, settlement
// codes, merchant credentials or an assertion that a shopper has already paid.
function commerce(saved,shop={}, {uid=shop?.sellerUid,publication={},category=shop?.shopCategory,payout=null,environment='unconfigured'}={}){
 const settings=effective(saved,shop);
 const orderReason=category!=='spaza'?'category_not_supported':!publication.approved?'seller_approval_pending':
  !publication.ready?'shop_setup_incomplete':!publication.live||shop?.status!=='active'?'shop_not_active':
  !publication.canSell?'selling_access_inactive':!settings.onlineOrdersEnabled?'online_orders_disabled':
  !settings.pickupEnabled&&!settings.deliveryEnabled?'fulfilment_unavailable':'ready';
 const settlementVerified=validPayout(uid,payout,environment);
 const paymentReason=orderReason!=='ready'?orderReason:!settings.onlinePaymentsEnabled?'online_payments_disabled':
  environment==='unconfigured'?'provider_not_configured':environment!=='live'?'test_mode':
  !settlementVerified?'settlement_pending':'ready';
 return {onlineOrdersEnabled:settings.onlineOrdersEnabled,onlinePaymentsEnabled:settings.onlinePaymentsEnabled,
  onlineOrdersReady:orderReason==='ready',onlinePaymentsReady:paymentReason==='ready',
  onlineOrdersReason:orderReason,onlinePaymentsReason:paymentReason,paymentEnvironment:environment,
  settlementVerified};
}
function quote(shop,saved,data,capability=null){
 const settings=effective(saved,shop),mode=data.mode,paymentMethod=data.paymentMethod||'arrange_with_shop';
 if(!settings.onlineOrdersEnabled)D.fail(409,'This shop has paused new online orders. You can still browse and contact the shop.');
 if(!['collection','delivery'].includes(mode))D.fail(422,'Choose delivery or collection.');
 if(!(mode==='delivery'?settings.deliveryEnabled:settings.pickupEnabled))D.fail(409,'This fulfilment option is not enabled by the shop.');
 if(!['cash','card_at_shop','card_online','arrange_with_shop'].includes(paymentMethod))D.fail(422,'Choose an available payment method.');
 if(paymentMethod==='card_at_shop'&&(!settings.cardPayments||mode!=='collection'))D.fail(409,'Card payment at the shop is available only for collection from a shop that accepts cards.');
 if(paymentMethod==='card_online'&&(!settings.onlinePaymentsEnabled||!capability?.onlinePaymentsReady))
  D.fail(409,'Online payment is not available for this shop yet. Choose cash or an available shop payment option.');
 const items=D.orderItems(data.items,shop.products||[]),subtotalCents=items.reduce((sum,p)=>sum+p.priceCents*p.quantity,0);
 const deliveryFeeCents=mode==='delivery'?settings.deliveryFeeCents:0;
 const cashDiscountPercent=paymentMethod==='cash'?settings.cashDiscountPercent:0;
 const cashDiscountCents=Math.round(subtotalCents*cashDiscountPercent/100),cardFeeCents=0;
 const amounts={items,mode,paymentMethod,subtotalCents,deliveryFeeCents,cashDiscountPercent,cashDiscountCents,cardFeeCents,
  totalCents:subtotalCents-cashDiscountCents+deliveryFeeCents};
 const onlineTotalCents=subtotalCents+deliveryFeeCents;
 const onlineAmountEligible=Number.isSafeInteger(onlineTotalCents)&&onlineTotalCents>=100&&onlineTotalCents<=5000000;
 if(paymentMethod==='card_online'&&!onlineAmountEligible)
  D.fail(422,'Online payment is available for baskets from R1 to R50,000. Choose another payment method for this basket.');
 const checkoutCapability=capability?{...capability,onlinePaymentsReady:capability.onlinePaymentsReady===true&&onlineAmountEligible,
  onlinePaymentsReason:capability.onlinePaymentsReady===true&&!onlineAmountEligible?'amount_out_of_range':capability.onlinePaymentsReason}:null;
 const quoteId=crypto.createHash('sha256').update(JSON.stringify({shopId:shop.sellerUid,...amounts})).digest('hex');
 return {...amounts,quoteId,cardPayments:settings.cardPayments,onlineOrdersEnabled:settings.onlineOrdersEnabled,
  onlinePaymentsEnabled:settings.onlinePaymentsEnabled,commerce:checkoutCapability,pickupEnabled:settings.pickupEnabled,
  deliveryEnabled:settings.deliveryEnabled,offeredCashDiscountPercent:settings.cashDiscountPercent};
}
module.exports={effective,exposed,quote,commerce,paymentEnvironment,validPayout};
