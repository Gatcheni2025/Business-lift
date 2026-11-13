'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {quote,MONTHLY_CENTS,PRORATED_TERMS_VERSION}=require('./billing-proration');
const at=(y,m,d,h=12,min=0)=>Date.parse(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00+02:00`);
test('SA day-inclusive first payment prorates November, while every future whole month remains R99',()=>{
 const cases=[[1,9900,30],[10,6930,21],[12,6270,19],[15,5280,16],[20,3630,11],[25,1980,6],[30,330,1]];
 for(const [day,cents,daysRemaining] of cases){
  const q=quote(at(2026,11,day));
  assert.equal(q.amountCents,cents);assert.equal(q.daysInMonth,30);
  assert.equal(q.daysRemaining,daysRemaining);
  assert.equal(q.nextRenewalAt,Date.parse('2026-12-01T00:00:00.000Z'));
 }
 assert.equal(quote(at(2026,11,12),false).amountCents,9900,'Disabled rollout must preserve current R99 initial charge');
 assert.equal(MONTHLY_CENTS,9900);
 assert.match(PRORATED_TERMS_VERSION,/calendar-proration/);
});
test('Proration accounts for varying month lengths and leap years',()=>{
 for(const [date,cents,remaining,daysInMonth] of [
  [at(2026,2,12),6011,17,28],
  [at(2028,2,12),6145,18,29],
  [at(2026,12,12),6387,20,31],
  [at(2026,4,12),6270,19,30],
  [at(2027,1,1),9900,31,31]
 ]){
  const q=quote(date);assert.equal(q.amountCents,cents);
  assert.equal(q.daysRemaining,remaining);assert.equal(q.daysInMonth,daysInMonth);
 }
});
test('SA local calendar boundary changes only at local midnight; quote expires at that boundary',()=>{
 const justBefore=Date.parse('2026-11-11T21:59:59.000Z');
 const after=Date.parse('2026-11-11T22:00:00.000Z');
 const a=quote(justBefore),b=quote(after);
 assert.equal(a.quoteDate,'2026-11-11');
 assert.equal(b.quoteDate,'2026-11-12');
 assert.equal(a.quoteExpiresAt,after);
 assert.equal(a.amountCents,6600);assert.equal(b.amountCents,6270);
 assert.equal(a.monthlyCents,9900);assert.equal(b.monthlyCents,9900);
});
test('No negative, NaN or unbounded quote timestamps',()=>{
 for(const invalid of [NaN,Infinity,-1])assert.throws(()=>quote(invalid),/Invalid/);
});
