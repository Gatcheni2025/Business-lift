'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLivePlacesGate,discovery,contact,area}=require('./places-acceptance-gate.cjs');
const url=discovery+'?'+new URLSearchParams(area);
const place='SyntheticPlace123456789';
const data={ok:true,provider:'google_places',version:'3.6',category:'spaza',entries:[{placeId:place},{placeId:place+'2'},{placeId:place+'3'}],returned:3};
test('bounded live discovery permits only one exact KwaMashu search and two unique listed contacts, no redirects or extra endpoints',async()=>{
 const calls=[];
 const gate=createLivePlacesGate({fetchImpl:async (u,opts)=>{calls.push({u,opts});return {ok:true,json:async()=>u.startsWith(discovery)?data:{ok:true,phone:'',websiteUrl:''}};}});
 for(const invalid of [url+'&x=1',url.replace('spaza','variety'),url.replace('5000','8000'),url.replace('-29.7416','-29.74'),url.replace('https://','http://'),url.replace('shopper-discover','shopper-place-photo.php'),url+'&category=spaza'])assert.equal((await gate.get(invalid,'GET')).status,403);
 assert.equal((await gate.get(url,'POST')).status,403);
 assert.equal((await gate.get(contact+'?placeId='+place,'GET')).status,403);
 assert.equal(calls.length,0);
 const simultaneous=await Promise.all([gate.get(url,'GET'),gate.get(url,'GET')]);assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,403]);
 assert.equal((await gate.get(contact+'?placeId=NotReturned123456','GET')).status,403);
 assert.equal((await gate.get(contact+'?placeId='+place,'GET')).status,200);
 assert.equal((await gate.get(contact+'?placeId='+place,'GET')).status,403);
 assert.equal((await gate.get(contact+'?placeId='+place+'2','GET')).status,200);
 assert.equal((await gate.get(contact+'?placeId='+place+'3','GET')).status,403);
 assert.equal(calls.length,3);for(const c of calls){assert.equal(c.opts.redirect,'error');assert.deepEqual(c.opts.headers,{Accept:'application/json'});}
 assert.deepEqual(gate.snapshot(),{searchAttempts:1,searchSucceeded:true,returnedListings:3,partialResults:false,contactAttempts:2,contactSucceeded:2,listedPhone:0,noListedPhone:2});
});
test('failure and invalid response consume the allowance, with no contact authorization',async()=>{
 for(const fetchImpl of [async()=>{throw Error('network');},async()=>({ok:false,status:503}),async()=>({ok:true,json:async()=>({entries:[]})})]){
  const gate=createLivePlacesGate({fetchImpl});
  assert.equal((await gate.get(url,'GET')).status,502);assert.equal((await gate.get(url,'GET')).status,403);
  assert.equal((await gate.get(contact+'?placeId='+place,'GET')).status,403);assert.equal(gate.snapshot().searchAttempts,1);assert(!gate.snapshot().searchSucceeded);
 }
});
