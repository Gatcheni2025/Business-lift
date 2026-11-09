import test from 'node:test';import assert from 'node:assert/strict';import {cents,statementRows} from './public/js/teyza-operations-model.mjs';
test('Rand input is converted exactly and rejects malformed or fractional-cent entries',()=>{assert.equal(cents('99'),9900);assert.equal(cents('99.50'),9950);for(const v of ['0','-2','99.999','1e3','NaN','1,000','<script>'])assert.throws(()=>cents(v));});
test('Statement descriptions are plain cell values, never interpolated as HTML',()=>{const rows=statementRows([{createdAt:1000,description:'<img onerror=alert(1)>',debitCents:9900,balanceCents:9900}]);assert.equal(rows[0][1],'<img onerror=alert(1)>');assert.equal(rows[0].length,7);});


import {inspectSellerPublicFeed} from './public/js/teyza-public-feed-check.mjs';
const exactUid='loSa0gLBnGP8iygGw3N7qp9yuT93';
const reply=(payload)=>({ok:true,json:async()=>({ok:true,...payload})});

test('Live feed probe matches exact Firebase seller UID, not a displayed shop name',async()=>{
 const requests=[];
 const result=await inspectSellerPublicFeed(exactUid,{fetcher:async(url,opts)=>{
  requests.push([url,opts]);
  return reply({entries:[
   {id:'different-uid',sellerUid:'different-uid',name:'smindlos',products:[{id:'not-me',name:'Other shop',stock:3,priceCents:1200}]},
   {id:exactUid,sellerUid:exactUid,name:'smindlos',
    products:[{id:'rice',name:'Rice',stock:3,priceCents:1500},
      {id:'invalid',name:'Product lacking a valid price',stock:2,priceCents:0}],
    productHighlights:[{id:'reference',name:'Milk',inStock:true}]}
  ],next:null});
 }});
 assert.equal(requests.length,1);
 assert.equal(new URL(requests[0][0]).searchParams.get('after'),exactUid.slice(0,-1));
 assert.equal(new URL(requests[0][0]).searchParams.get('publicShops'),'1');
 assert.equal(requests[0][1].cache,'no-store');
 assert.equal(result.found,true);
 assert.equal(result.publicProductCount,2);
 assert.equal(result.shopperProductCount,1);
 assert.equal(result.inStockProductCount,1);
 assert.equal(result.highlightCount,1);
});
test('Live public listing with no products is reported as empty, even if it has highlights',async()=>{
 const result=await inspectSellerPublicFeed(exactUid,{fetcher:async()=>reply({entries:[
   {id:exactUid,sellerUid:exactUid,name:'smindlos',products:[],productHighlights:[{id:'rice',name:'Rice'}]}
 ],next:null})});
 assert.equal(result.publicProductCount,0);assert.equal(result.shopperProductCount,0);
 assert.equal(result.highlightCount,1);
});
test('A matching name with another seller UID cannot be treated as live stock',async()=>{
 const result=await inspectSellerPublicFeed(exactUid,{fetcher:async()=>reply({entries:[
  {id:'other',sellerUid:'other',name:'smindlos',products:[{id:'bread',name:'Bread',stock:1,priceCents:2000}]}
 ],next:null})});
 assert.equal(result.found,false);
});
test('Live feed errors and stalled pages fail closed rather than claiming products are published',async()=>{
 await assert.rejects(inspectSellerPublicFeed(exactUid,{fetcher:async()=>({ok:false,status:503})}),/unavailable/);
 await assert.rejects(inspectSellerPublicFeed(exactUid,{fetcher:async()=>reply({entries:[],next:exactUid.slice(0,-1)})}),/did not advance/);
 await assert.rejects(inspectSellerPublicFeed('invalid uid',{fetcher:async()=>{throw Error('must never call');}}),/valid seller UID/);
});
