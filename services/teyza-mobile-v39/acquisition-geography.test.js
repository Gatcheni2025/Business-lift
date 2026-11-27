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

test('Reviewed whole-municipality mergers keep historical source provenance and resolve stable canonical IDs',async()=>{
 const rows=[{munic_code:'MP322',sub_place_code:111111111,sub_place_name:'Synthetic Mbombela locality'},{munic_code:'NW402',sub_place_code:222222222,sub_place_name:'Synthetic Tlokwe locality'}];
 const queries=[];
 const g=G.createGeography({fetcher:async(url)=>{
  const u=new URL(url),where=u.searchParams.get('where');queries.push(where);
  const north=where.includes('NW')||where.includes('222222222');
  const attributes=u.pathname.includes('/2/')?[north?{munic_code:'NW405',munic_name:'JB Marks'}:{munic_code:'MP326',munic_name:'City of Mbombela'}]:[rows[north?1:0]];
  return {ok:true,json:async()=>({features:attributes.map(attributes=>({attributes}))})};
 }});
 for(const [province,term,current,old,sub] of [['Mpumalanga','Synthetic Mbombela','MP326','MP322','111111111'],['North West','Synthetic Tlokwe','NW405','NW402','222222222']]){
  const r=(await g.search(province,term)).localities[0];
  assert.equal(r.localityId,current+':'+sub);assert.equal(r.municipalityCode,current);assert.equal(r.sourceMunicipalityCode,old);
  assert.equal(r.municipalityCrosswalkEffectiveYear,2016);assert.equal(r.municipalityCrosswalkSource,'MDB-2023-2016-amalgamations');
  assert.deepEqual(await g.resolve(r.localityId),r);
  assert(queries.some(q=>q.includes('munic_code IN')&&q.includes("'"+old+"'")&&q.includes("'"+current+"'")&&q.includes('sub_place_code = '+sub)));
  assert.equal(G.projectedGeography(r).geographyNeedsReview,false);
  assert.equal(G.projectedGeography({...r,sourceMunicipalityCode:'KZN211'}).geographyNeedsReview,true);
  await assert.rejects(g.resolve(old+':'+sub),e=>e.status===422);
 }
});
test('Amalgamation never guesses a split municipality or accepts contradictory sub-place names',async()=>{
 const g=G.createGeography({fetcher:async(url)=>{
  const u=new URL(url),isMunicipality=u.pathname.includes('/2/');
  const rows=isMunicipality?[{munic_code:'MP326',munic_name:'City of Mbombela'}]:[
   {munic_code:'MP322',sub_place_code:111111111,sub_place_name:'Old name'},
   {munic_code:'MP326',sub_place_code:111111111,sub_place_name:'Different name'},
   {munic_code:'LIM352',sub_place_code:222222222,sub_place_name:'Former split municipality'}];
  return {ok:true,json:async()=>({features:rows.map(attributes=>({attributes}))})};
 }});
 await assert.rejects(g.resolve('MP326:111111111'),e=>e.status===409);
 assert.equal((await g.search('Limpopo','Former')).localities.length,0);
});
