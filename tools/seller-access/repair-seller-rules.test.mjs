import test from 'node:test';
import assert from 'node:assert/strict';
import {repairRules} from './repair-seller-rules.mjs';

const deny="rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{doc=**} {allow read, write: if false;} } }";
test('Missing seller paths add original strict rules and a second repair is unchanged',()=>{
  const first=repairRules(deny);
  assert.equal(first.changes.length,2);
  assert.match(first.rules,/approvalStatus == 'pending'/);
  assert.match(first.rules,/stockQty <= 100000/);
  assert.match(first.rules,/allow read, write: if false/);
  const next=repairRules(first.rules);assert.equal(next.rules,first.rules);assert.equal(next.changes.length,0);
});
test('Existing write/admin rules and unrelated collections are retained byte-for-byte',()=>{
  const account="allow get: if request.auth.token.admin == true; allow update: if request.auth.token.admin == true;";
  const products="allow write: if false;";
  const other="match /private/{key} { allow read: if request.auth.uid == key; allow write: if false; }";
  const source=`rules_version='2'; service cloud.firestore { match /databases/{db}/documents {
    match /teyzaSellerAccounts/{accountUid} { ${account} }
    match /teyzaDraftProducts/{shopUid}/items/{itemUid} { ${products} }
    ${other}
  } }`;
  const result=repairRules(source).rules;
  for(const text of [account,products,other])assert.ok(result.includes(text));
  assert.match(result,/request.auth.uid == accountUid/);
  assert.match(result,/request.auth.uid == shopUid/);
  assert.ok(result.includes('/databases/$(db)/documents/teyzaSellerAccounts/$(shopUid)'));
  assert.equal(repairRules(result).rules,result);
});
test('Braces and fake matches inside comments or strings cannot change the selected scope',()=>{
  const source=deny.replace('match /{doc=**}',`// match /teyzaSellerAccounts/{bad} { }\n/* } */\nfunction example(){return '}';}\nmatch /{doc=**}`);
  const result=repairRules(source);assert.equal(result.changes.length,2);
  assert.ok(result.rules.includes("function example(){return '}';}"));
});
test('Ambiguous, nested, storage and malformed inputs fail closed',()=>{
  for(const source of [
    deny.replace('match /{doc=**}', 'match /teyzaSellerAccounts/{a} {} match /teyzaSellerAccounts/{b} {} match /{doc=**}'),
    deny.replace('match /{doc=**}', 'match /parents/{p} {match /teyzaSellerAccounts/{a} {}} match /{doc=**}'),
    'service firebase.storage {match /b/{bucket}/o {}}',
    deny.slice(0,-4),deny+' /* unclosed'
  ])assert.throws(()=>repairRules(source));
});
