'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {expiredIdentity}=require('./verification-cleanup');
test('Expired identity cleanup removes private references and its expiry-query entry',()=>{
 const record={evidenceId:'doc1',expiresAt:100,objectPath:'private/file',detailsEncrypted:'ciphertext'},remove={deleteField:true};
 const patch=expiredIdentity(record,record,101,remove);
 assert.deepEqual(patch,{objectPath:remove,detailsEncrypted:remove,expiresAt:remove,photoRemovedAt:101});
});
test('Cleanup cannot remove a newer document installed after the expiry query',()=>{
 assert.equal(expiredIdentity({evidenceId:'new',expiresAt:200},{evidenceId:'old',expiresAt:100},300,{}),null);
});
test('A renewed, already-cleared or missing record is not treated as expired evidence',()=>{
 for(const current of [null,{evidenceId:'doc1'},{evidenceId:'doc1',expiresAt:500}])
  assert.equal(expiredIdentity(current,{evidenceId:'doc1'},100,{}),null);
});
