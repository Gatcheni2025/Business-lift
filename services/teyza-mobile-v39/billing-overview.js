'use strict';
const P=require('./publication');
const {MONTHLY_CENTS}=require('./billing-paystack');
const validTime=value=>Number.isFinite(value)&&value>0?value:null;
const expiry=(billing,now)=>validTime(billing?.paidUntil)>now?billing.paidUntil:null;
function summarize(uid,account,billing,transactions=[],now=Date.now()){
  if(account?.uid!==uid)throw Error('Seller identity does not match billing request');
  // An account is paid only if Paystack's verified live payment was recorded.
  // Historical manual receipts, Netcash and sandbox transactions are NOT paid.
  const livePaid=P.entitled(uid,account,billing,now);
  const complimentary=P.complimentary(uid,account,billing,now);
  const legacyAccess=P.mandateAccess(uid,account,billing,now);
  const state=billing?.ownerUid===uid?billing:{};
  const renewal=state.renewalSetup||'not_started';
  const hasLiveSubscription=livePaid&&state.paymentEnvironment==='live'&&
    /^SUB_[A-Za-z0-9]+$/.test(state.paystackSubscriptionCode||'')&&
    ['scheduled','active'].includes(renewal);
  const billedAt=validTime(state.nextBillingAt);
  const through=livePaid?expiry(state,now):null;
  // The gateway is the source of truth for future renewal. Use the server
  // period boundary only while the live subscription remains scheduled/active.
  const nextBillingAt=hasLiveSubscription&&(billedAt&&billedAt>now?billedAt:through)?(billedAt&&billedAt>now?billedAt:through):null;
  const paymentFailed=renewal==='payment_failed';
  const status=livePaid?'paid':complimentary?'complimentary_access':
    legacyAccess?'legacy_temporary_access':paymentFailed?'payment_failed':
    renewal==='cancelled'?'cancelled':renewal==='action_required'?'action_required':'not_subscribed';
  // An amount to pay is NOT the same as a debt or raised invoice. Only show a
  // payable renewal on a provider-reported failure after paid coverage ended.
  const amountDueCents=paymentFailed&&!livePaid?MONTHLY_CENTS:null;
  const rows=transactions.filter(row=>row?.ownerUid===uid&&row?.kind!=='promotion')
    .map(row=>({
      reference:typeof row.reference==='string'?row.reference:'',
      date:validTime(row.verifiedAt)||validTime(row.createdAt),
      kind:row.kind||'membership',
      status:row.status||'pending',
      amountCents:Number.isSafeInteger(row.amountCents)&&row.amountCents>=0?row.amountCents:0,
      currency:row.currency==='ZAR'?'ZAR':'unknown',
      environment:row.environment||row.paymentEnvironment||'unknown',
      paymentVerified:row.status==='paid'&&(row.environment==='live'||row.paymentEnvironment==='live')
    })).sort((a,b)=>(b.date||0)-(a.date||0)).slice(0,30);
  return {
    sellerUid:uid,shopName:account.shopName||'',businessType:account.category,
    provider:'paystack',currency:'ZAR',
    monthlyFeeCents:MONTHLY_CENTS,
    status,accessActive:P.eligible(uid,account,billing,now),
    paymentVerified:livePaid,renewalStatus:renewal,
    paidThrough:through,nextBillingAt,nextBillAmountCents:nextBillingAt?MONTHLY_CENTS:null,
    amountDueCents,amountDueIsInvoice:false,
    paymentRequiredCents:!livePaid&&account.approvalStatus==='approved'?MONTHLY_CENTS:null,
    temporaryAccessUntil:complimentary?state.adminComplimentaryUntil:
      legacyAccess?state.mandateAccessUntil:null,
    temporaryAccessKind:complimentary?'admin_grant':legacyAccess?'historic_mandate_processing':null,
    lastPaymentReference:livePaid?state.lastReference||null:null,
    transactions:rows,hasMoreTransactions:transactions.length>30,
    // Not an available payment option. Legacy bank mandates remain stored for
    // audit and withdrawal, and must never be copied into Paystack credentials.
    paymentMethod:'card',mandateCollectionEnabled:false,
  };
}
module.exports={summarize};
