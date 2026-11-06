import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gateProductRules} from './gate-seller-products.mjs';
const legacy=fs.readFileSync(new URL('seller-drafts-legacy.rules',import.meta.url),'utf8');
const legacyAccount=fs.readFileSync(new URL('seller-account-legacy.rules',import.meta.url),'utf8');
const wrap=body=>`rules_version='2'; service cloud.firestore { match /databases/{database}/documents { ${body} } }`;
test('Known old product rules are replaced while unrelated rules stay intact',()=>{
 const other='match /other/{id} {allow read: if true; allow write: if false;}';
 const result=gateProductRules(wrap(legacy+other));
 assert.match(result.rules,/function hasProductAccess/);assert(result.rules.includes(other));
 assert.equal(gateProductRules(result.rules).rules,result.rules);
});
test('The exact old owner-read repair can be upgraded without retaining its old writes',()=>{
 const source=wrap(legacy.replace('{\n  function draftOwner()',`{\n  // TEYZA_OWNER_ACCESS_R310_teyzaDraftProducts\n  allow get, list: if request.auth != null && request.auth.uid == sellerId\n    && exists(/databases/$(database)/documents/teyzaSellerAccounts/$(sellerId));\n  function draftOwner()`));
 assert.match(gateProductRules(source).rules,/function hasProductAccess/);
});
test('Known live account rules keep server-managed fields immutable but permit profile updates',()=>{
 const original=wrap(legacyAccount+legacy),result=gateProductRules(original);
 assert.match(result.rules,/validShape\(false\)/);
 assert.match(result.rules,/validShape\(true\)/);
 assert.match(result.rules,/affectedKeys\(\)\.hasOnly/);
 assert.equal(gateProductRules(result.rules).rules,result.rules);
 const renamed=original.replaceAll('{uid}','{owner}').replaceAll('request.auth.uid == uid','request.auth.uid == owner')
  .replaceAll('request.resource.data.uid == uid','request.resource.data.uid == owner');
 assert.match(gateProductRules(renamed).rules,/request\.auth\.uid == owner/);
 assert.throws(()=>gateProductRules(original.replace("allow delete: if false;","allow delete: if true;")),/account rules differ/);
});
test('Missing product rules receive the new gate, while custom or overlapping writes fail closed',()=>{
 assert.match(gateProductRules(wrap('')).rules,/function hasProductAccess/);
 for(const rules of [wrap(legacy.replace('stockQty <= 100000','stockQty <= 500')),
  wrap(legacy+' match /{document=**} { allow read, write: if request.auth != null; }'),
  wrap(legacy+' match /{collection}/{document=**} { allow write: if true; }'),
  wrap(legacy+' match /teyzaDraftProducts/{path=**} { allow write: if true; }')])
  assert.throws(()=>gateProductRules(rules));
});
