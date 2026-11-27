'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sellerDetailDiagnostic}=require('./seller-detail-diagnostic');

test('admin full-account diagnostics identify source lines without leaking seller or payment data',()=>{
  const err=new TypeError('Seller UID private_customer_123 and sk_live_SECRET and billing details');
  err.stack='TypeError: Seller UID private_customer_123 and sk_live_SECRET\n'+
    '    at createOperations (/srv/functions/services/teyza-mobile-v39/operations.js:195:27)\n'+
    '    at async Object.execute (/srv/functions/services/teyza-mobile-v39/service.js:292:16)\n'+
    '    at processTicksAndRejections (node:internal/process/task_queues:95:5)';
  const result=sellerDetailDiagnostic(err,'ops_seller_detail');
  assert.deepEqual(result,{
    operation:'ops_seller_detail',
    type:'TypeError',
    frames:['operations.js:195:27','service.js:292:16']
  });
  const encoded=JSON.stringify(result);
  for(const secret of ['private_customer_123','sk_live_SECRET','billing details','/srv/functions'])
    assert.equal(encoded.includes(secret),false);
});
test('unknown actions and error objects remain bounded and never echo arbitrary caller input',()=>{
  const err={name:'Unknown secret name',message:'password=123',
    stack:'Not A Code Frame\n    at Object.x (/tmp/leak/token.txt:1:2)'};
  const result=sellerDetailDiagnostic(err,'ops_seller_detail?uid=stolen');
  assert.deepEqual(result,{operation:'unrelated',type:'Error',frames:[]});
});
test('empty errors and repeated stack frames do not crash diagnostics',()=>{
  assert.deepEqual(sellerDetailDiagnostic(null,'seller_billing_statement'),
    {operation:'seller_billing_statement',type:'Error',frames:[]});
  const err={name:'ReferenceError',stack:'ReferenceError\n'+
    Array.from({length:20},(_,i)=>'    at call (/root/private/operations.js:'+(i+1)+':7)').join('\n')};
  const result=sellerDetailDiagnostic(err,'ops_seller_detail');
  assert.equal(result.frames.length,5);
  assert.equal(result.frames[0],'operations.js:1:7');
  assert.equal(result.frames[4],'operations.js:5:7');
});
