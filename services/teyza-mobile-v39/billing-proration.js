'use strict';

// All prices are integer cents. A calendar day of access counts even if
// checkout happens part-way through that day. South Africa has UTC+02:00
// year-round. No local machine timezone, floats-as-money or client prices.
const MONTHLY_CENTS=9900,SA_HOURS=2,SA_OFFSET_MS=SA_HOURS*3600000;
const PRORATED_TERMS_VERSION='seller-r99-calendar-proration-2026-11';
function quote(ms,enabled=true){
 if(!Number.isFinite(ms)||ms<0)throw Error('Invalid pricing timestamp');
 const sa=new Date(ms+SA_OFFSET_MS),year=sa.getUTCFullYear(),month=sa.getUTCMonth(),
  day=sa.getUTCDate(),daysInMonth=new Date(Date.UTC(year,month+1,0)).getUTCDate(),
  daysRemaining=daysInMonth-day+1;
 const pad=v=>String(v).padStart(2,'0');
 // Full R99 at day 1, even in February and leap years.
 const amountCents=enabled?Math.round(MONTHLY_CENTS*daysRemaining/daysInMonth):MONTHLY_CENTS;
 return {
  amountCents,monthlyCents:MONTHLY_CENTS,currency:'ZAR',
  prorated:enabled,daysInMonth,daysRemaining,
  quoteDate:`${year}-${pad(month+1)}-${pad(day)}`,
  nextRenewalAt:Date.UTC(year,month+1,1,0,0,0),
  quoteExpiresAt:Date.UTC(year,month,day+1,0,0,0)-SA_OFFSET_MS
 };
}
module.exports={quote,MONTHLY_CENTS,PRORATED_TERMS_VERSION};
