'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./acquisition-geography');
function fixture({unavailable=false,ambiguous=false}={}){
 const calls=[];
 const g=G.createGeography({fetcher:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});
  assert.equal(u.hostname,'dpmegis.dpme.gov.za');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(u.searchParams.get('returnGeometry'),'false');
  if(unavailable)throw Error('network');
  let attrs=u.pathname.includes('/2/')?[{munic_code:'LIM354',munic_name:'Polokwane'}]:u.searchParams.get('where').includes('ETH')?[{munic_code:'ETH',sub_place_code:123456789,sub_place_name:'KwaMashu'}]:[{munic_code:'LIM354',sub_place_code:987654321,sub_place_name:'Seshego'},...(ambiguous?[{munic_code:'LIM354',sub_place_code:987654321,sub_place_name:'Other'}]:[])];
  return {ok:true,json:async()=>({features:attrs.map(attributes=>({attributes}))})};
 }});
 return {g,calls};
}
test('Government sub-place reference joins municipality and province codes; no client labels trusted',async()=>{
 const {g,calls}=fixture(),r=await g.search('Limpopo','Seshego');
 assert.equal(r.localities.length,1);assert.equal(r.localities[0].municipality,'Polokwane');assert.equal(r.localities[0].province,'Limpopo');assert.equal(r.localities[0].localityId,'LIM354:987654321');
 assert.deepEqual(await g.resolve('LIM354:987654321'),r.localities[0]);assert.equal(r.requiresCurrentBoundaryReview,true);
 assert.equal((await g.resolve('ETH:123456789')).municipality,'eThekwini');
 assert(calls.every(c=>!c.u.searchParams.has('address')));
});
test('Ambiguous, unavailable and malformed sources fail closed; provisional is never official',async()=>{
 const a=fixture({ambiguous:true});await assert.rejects(a.g.resolve('LIM354:987654321'),e=>e.status===409);
 await assert.rejects(fixture({unavailable:true}).g.search('Gauteng','Soweto'),e=>e.status===503);
 await assert.rejects(a.g.search('Gauteng',"a%'; DROP"),e=>e.status===422);
 await assert.rejects(a.g.resolve('ETH:1 OR 1=1'),e=>e.status===422);
 assert.equal(G.projectedGeography({city:'Durban',area:'Umlazi'}).geographyNeedsReview,true);
});
