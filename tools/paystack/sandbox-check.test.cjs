'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runSandbox}=require('./sandbox-check.cjs');
const now=Date.parse('2026-11-06T12:00:00Z');
function fakePaystack(){
 const calls=[];let init,subscription,status='active';
 const send=async(url,opts)=>{
  const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;
  calls.push({path:u.pathname,method:opts.method,body,auth:opts.headers.Authorization});
  let data;
  if(u.pathname==='/plan'&&opts.method==='POST')data={plan_code:'PLN_QA1',domain:'test',amount:9900,interval:'monthly',currency:'ZAR'};
  else if(u.pathname==='/plan/PLN_QA1')data={plan_code:'PLN_QA1',domain:'test',amount:9900,interval:'monthly',currency:'ZAR',invoice_limit:0};
  else if(u.pathname==='/transaction/initialize'){init=body;data={authorization_url:'https://checkout.paystack.com/test_qa'};}
  else if(u.pathname.startsWith('/transaction/verify/'))data={reference:init.reference,status:'success',currency:'ZAR',domain:'test',
   paid_at:new Date(now).toISOString(),amount:4900,id:12345,customer:{email:init.email,customer_code:'CUS_QA1'},
   authorization:{reusable:true,authorization_code:'AUTH_QA1'}};
  else if(u.pathname==='/subscription'&&opts.method==='POST'){
   subscription={subscription_code:'SUB_QA1',domain:'test',amount:9900,customer:{customer_code:'CUS_QA1'},
    plan:{plan_code:'PLN_QA1'},next_payment_date:body.start_date,email_token:'test-token'};data=subscription;
  }else if(u.pathname==='/subscription/SUB_QA1')data={...subscription,status};
  else if(u.pathname==='/subscription/disable'){assert.deepEqual(body,{code:'SUB_QA1',token:'test-token'});status='cancelled';data={};}
  else throw Error('Unexpected mock request '+url);
  return {ok:true,json:async()=>({status:true,data})};
 };
 return {send,calls};
}
test('Isolated Paystack check verifies R49, schedules R99, and cancels only its test subscription',async()=>{
 const fake=fakePaystack();let opened;
 const result=await runSandbox({key:'sk_test_FAKE',send:fake.send,clock:()=>now,confirm:async url=>{opened=url;return true;}});
 assert.equal(opened,'https://checkout.paystack.com/test_qa');
 assert.deepEqual(result,{status:'verified',initialCents:4900,renewalCents:9900,nextPaymentDate:'2026-12-06',testEntitlement:false,cancelled:true});
 assert(fake.calls.every(c=>c.auth==='Bearer sk_test_FAKE'));
 assert.equal(fake.calls.filter(c=>c.path==='/transaction/initialize')[0].body.amount,4900);
 assert.equal(fake.calls.filter(c=>c.path==='/subscription').length,1);
 assert.equal(fake.calls.filter(c=>c.path==='/subscription/disable').length,1);
});
test('A live or invalid key cannot make any request',async()=>{
 const fake=fakePaystack();
 for(const key of ['sk_live_REAL','bad',''])await assert.rejects(runSandbox({key,send:fake.send,confirm:async()=>true}),/TEST key/);
 assert.equal(fake.calls.length,0);
});
test('Stopping checkout never creates or cancels a subscription',async()=>{
 const fake=fakePaystack();
 const result=await runSandbox({key:'sk_test_FAKE',send:fake.send,clock:()=>now,confirm:async()=>false});
 assert.equal(result.status,'stopped');
 assert(!fake.calls.some(c=>c.path.startsWith('/subscription')));
});
test('Provider date mismatch cancels the newly created test subscription and reports failure',async()=>{
 const fake=fakePaystack();
 const send=async(url,opts)=>{
  const response=await fake.send(url,opts);
  if(url.endsWith('/subscription/SUB_QA1')){
   const old=response.json;response.json=async()=>{const data=await old();data.data.next_payment_date='2026-12-05T12:00:00Z';return data;};
  }
  return response;
 };
 await assert.rejects(runSandbox({key:'sk_test_FAKE',send,clock:()=>now,confirm:async()=>true}),/renewal date/);
 assert(fake.calls.some(c=>c.path==='/subscription/disable'));
});
