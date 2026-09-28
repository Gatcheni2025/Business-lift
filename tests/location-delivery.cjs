const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/address-search.js','utf8').replace(/export (function|async function|const)/g,'$1')+'\nthis.api={placeFromFeature,suggestAddresses,addressAt};';
const calls=[];
const context={URLSearchParams,globalThis:{},fetch:async(url)=>{
 calls.push(String(url));
 return {ok:true,json:async()=>({features:[{properties:{housenumber:'12',street:'Main Road',city:'Johannesburg',country:'South Africa'},geometry:{coordinates:[28.04,-26.20]}}]})};
}};
vm.runInNewContext(source,context);
(async()=>{
 const suggestions=await context.api.suggestAddresses('12 Main Road','South Africa');
 assert.equal(suggestions[0].address,'12 Main Road, Johannesburg, South Africa');
 assert.equal(suggestions[0].lat,-26.20);
 assert.match(calls[0],/countrycode=ZA/);
 const nearby=await context.api.addressAt(-26.2,28.04);
 assert.equal(nearby.address,suggestions[0].address);
 assert.match(calls[1],/\/reverse\?/);
 const code=fs.readFileSync('js/delivery-methods.js','utf8').replace(/export (const|function)/g,'$1')+'\nthis.delivery={methods,methodFromSaved};';
 const deliveryContext={};vm.runInNewContext(code,deliveryContext);
 assert.equal(deliveryContext.delivery.methodFromSaved({serviceCode:'postnet_prepaid'}).guide,99);
 assert.equal(deliveryContext.delivery.methodFromSaved({}).code,'paxi_standard');
 assert.equal(deliveryContext.delivery.methods.find(x=>x.code==='pickup').guide,0);
 console.log('PASS: address suggestions map to coordinates, reverse geocoding, and delivery guide choices');
})().catch(e=>{console.error(e);process.exitCode=1});
