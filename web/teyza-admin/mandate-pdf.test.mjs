import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMandateRequestPdf} from './public/js/teyza-mandate-pdf.mjs';
const example={
 mandate:{mandateId:'mandate_test_1',status:'pending_provider_authentication',acceptedAt:Date.UTC(2026,10,6),
  termsVersion:'teyza-debit-request-v2',terms:'I authorise secure processing for provider bank authentication. No debit is initiated until formal validation.',
  bankName:'FNB',branchCode:'250655',firstDate:'2026-12-01',collectionDay:1},
 shopName:'Test spaza',shopAddress:'12 Market Road, Durban',
 ownerEmail:'seller@example.test',sensitive:{firstName:'Test',surname:'Seller',phone:'+27711234567',
  documentKind:'id',documentNumber:'9001015009087',accountHolder:'Test Seller',
  accountNumber:'12345678901',accountType:'current'}
};
test('Admin provider-review export is a complete PDF and marks pending bank authentication',()=>{
 const pdf=buildMandateRequestPdf(example);
 const body=new TextDecoder().decode(pdf);
 assert(body.startsWith('%PDF-1.4'));
 assert(body.endsWith('%%EOF\n'));
 assert(body.includes('xref\n'));
 assert(body.includes('TEYZA MANDATE REQUEST - NOT BANK-AUTHENTICATED'));
 assert(body.includes(example.sensitive.accountNumber));
 assert(body.includes(example.mandate.mandateId));
 assert(body.includes(example.shopAddress));
 assert(body.includes('99.00 monthly'));
 assert(!body.includes('<script>'));
});
test('A masked-only, incomplete, or withdrawn mandate cannot be exported',()=>{
 assert.throws(()=>buildMandateRequestPdf({mandate:{mandateId:'mandate'}}));
 assert.throws(()=>buildMandateRequestPdf({...example,mandate:{...example.mandate,status:'withdrawn'}}));
});
