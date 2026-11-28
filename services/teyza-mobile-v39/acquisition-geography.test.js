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

test('All 31 documented predecessor codes reconcile with stable successor locality IDs; divided municipalities stay provisional',async()=>{
 const expected={"MP322":"MP326","MP323":"MP326","NW401":"NW405","NW402":"NW405","EC143":"EC145","EC144":"EC145","EC127":"EC129","EC128":"EC129","EC132":"EC139","EC133":"EC139","EC134":"EC139","EC103":"EC101","EC107":"EC101","FS164":"MAN","GT482":"GT485","GT483":"GT485","KZN431":"KZN436","KZN432":"KZN436","KZN234":"KZN237","KZN236":"KZN237","KZN232":"KZN238","KZN233":"KZN238","KZN273":"KZN276","KZN274":"KZN276","KZN215":"KZN216","LIM474":"LIM476","LIM475":"LIM476","LIM364":"LIM368","LIM365":"LIM368","NC081":"NC087","NC083":"NC087"};
 assert.deepEqual(G.mergers,expected);
 for(const [old,target] of Object.entries(expected)){
  const province=G.provinceFor(target),sub='123456789',row={munic_code:old,sub_place_code:Number(sub),sub_place_name:'Synthetic locality'};
  const geo=G.createGeography({fetcher:async url=>{
   const u=new URL(url),isMunicipality=u.pathname.includes('/2/'),where=u.searchParams.get('where');
   if(!isMunicipality&&where.includes('sub_place_code ='))assert(where.includes("'"+old+"'")&&where.includes("'"+target+"'"));
   return {ok:true,json:async()=>({features:[{attributes:isMunicipality?{munic_code:target,munic_name:'Synthetic municipality'}:row}]})};
  }});
  const result=(await geo.search(province,'Synthetic')).localities[0];
  assert.equal(result.localityId,target+':'+sub);assert.equal(result.sourceMunicipalityCode,old);assert.equal(result.province,province);
  assert.deepEqual(await geo.resolve(result.localityId),result);assert.equal(G.projectedGeography(result).geographyNeedsReview,false);
  await assert.rejects(geo.resolve(old+':'+sub),e=>e.status===422);
 }
 for(const old of ['KZN211','KZN283','LIM352','LIM342']){
  const province=G.provinceFor(old);
  const geo=G.createGeography({fetcher:async url=>({ok:true,json:async()=>({features:[{attributes:new URL(url).pathname.includes('/2/')?{munic_code:old,munic_name:'Former municipality'}:{munic_code:old,sub_place_code:123456789,sub_place_name:'Synthetic locality'}}]})})});
  assert.equal((await geo.search(province,'Synthetic')).localities.length,0);
  await assert.rejects(geo.resolve(old+':123456789'),e=>e.status===409);
  assert.equal(G.projectedGeography({province,municipality:'Former',township:'Synthetic',municipalityCode:old,townshipCode:'123456789',localityId:old+':123456789',geographySource:G.SOURCE,geographySourceVintage:G.VINTAGE}).geographyNeedsReview,true);
 }
});

test('Province browsing uses bounded alphabetical pages and advances across omitted records',async()=>{
 const calls=[];
 const geo=G.createGeography({fetcher:async url=>{
  const u=new URL(url);calls.push(u);
  const offset=Number(u.searchParams.get('resultOffset'));
  const rows=u.pathname.includes('/2/')?[{munic_code:'KZN225',munic_name:'Synthetic municipality'}]:offset===0?[
   {munic_code:'ETH',sub_place_code:111111111,sub_place_name:'Inanda'},
   {munic_code:'KZN211',sub_place_code:222222222,sub_place_name:'Former split'},
   {munic_code:'JHB',sub_place_code:333333333,sub_place_name:'Wrong province'},
   {munic_code:'KZN225',sub_place_code:444444444,sub_place_name:'Synthetic community'}
  ]:[{munic_code:'ETH',sub_place_code:555555555,sub_place_name:'Umlazi'}];
  return {ok:true,json:async()=>({features:rows.map(attributes=>({attributes})),exceededTransferLimit:!u.pathname.includes('/2/')&&offset===0})};
 }});
 const first=await geo.browse('KwaZulu-Natal');
 assert.equal(first.schema,1);assert.equal(first.nextOffset,4);assert.equal(first.requiresCurrentBoundaryReview,true);
 assert.deepEqual(first.localities.map(x=>x.township),['Inanda','Synthetic community']);
 const second=await geo.browse('KwaZulu-Natal','',first.nextOffset);assert.equal(second.nextOffset,null);assert.equal(second.localities[0].township,'Umlazi');
 assert.equal(calls[0].searchParams.get('resultRecordCount'),'50');
 assert.equal(calls[0].searchParams.get('orderByFields'),'sub_place_name ASC,objectid ASC');
 assert.equal(calls[0].searchParams.get('returnGeometry'),'false');
 assert.match(calls[0].searchParams.get('where'),/KZN%/);
 await geo.browse('KwaZulu-Natal','Kwa',4);assert.match(calls.at(-1).searchParams.get('where'),/UPPER\(sub_place_name\) LIKE 'KWA%'/);
 const before=calls.length;
 for(const [p,q,o] of [['invalid','',0],['KwaZulu-Natal','%',0],['KwaZulu-Natal','',-1],['KwaZulu-Natal','',1.5],['KwaZulu-Natal','',100001],['KwaZulu-Natal','','0']])await assert.rejects(geo.browse(p,q,o),e=>e.status===422);
 assert.equal(calls.length,before);
});
test('All nine provinces allow empty-name browsing and unavailable references fail closed',async()=>{
 const calls=[];
 const geo=G.createGeography({fetcher:async url=>{calls.push(new URL(url));return {ok:true,json:async()=>({features:[]})};}});
 for(const province of G.provinces){const r=await geo.browse(province);assert.equal(r.province,province);assert.deepEqual(r.localities,[]);assert.equal(r.nextOffset,null);}
 assert.equal(calls.length,9);assert(calls.every(u=>u.searchParams.get('resultOffset')==='0'&&!u.searchParams.get('where').includes('sub_place_name')));
 await assert.rejects(fixture({unavailable:true}).g.browse('Eastern Cape'),e=>e.status===503);
});
