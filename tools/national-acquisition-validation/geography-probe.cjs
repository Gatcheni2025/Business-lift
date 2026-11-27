'use strict';
// Read-only public geography audit. No prospect, account, contact or Firebase data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const G=require('../../services/teyza-mobile-v39/acquisition-geography');
const base='https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/P_Dm_M_Lm_Sp_W_Bound/FeatureServer';
const samples=[
 ['Eastern Cape','BUF',['Mdantsane']],
 ['Free State','MAN',['Botshabelo']],
 ['Gauteng','JHB',['Orlando','Soweto']],
 ['KwaZulu-Natal','ETH',['Umlazi','KwaMashu']],
 ['Limpopo','LIM354',['Seshego']],
 ['Mpumalanga','MP326',['Kanyamazane','Ka Nyamazane']],
 ['Northern Cape','NC091',['Galeshewe']],
 ['North West','NW405',['Ikageng']],
 ['Western Cape','CPT',['Khayelitsha','Site C']]
];
const output=process.argv[2]||path.join(__dirname,'geography-audit.json');
let requests=0;
async function publicGet(url,options={}){
 const u=new URL(url);assert.equal(u.origin,'https://dpmegis.dpme.gov.za');
 assert(u.pathname.startsWith(new URL(base).pathname+'/'));assert.equal(options.method||'GET','GET');
 requests++;
 return fetch(u,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
}
const geo=G.createGeography({fetcher:publicGet});
const cleanError=e=>String(e?.message||e).slice(0,300);
async function metadata(layer,fields){
 const start=performance.now();
 try{
  const response=await publicGet(base+'/'+layer+'?f=json');assert(response.ok,'HTTP '+response.status);
  const data=await response.json();assert(!data.error,'ArcGIS metadata error');
  assert(Array.isArray(data.fields),'Missing field metadata');
  const found=data.fields.map(f=>f.name);assert(fields.every(f=>found.includes(f)),'Required layer field missing: '+fields.filter(f=>!found.includes(f)).join(', '));
  const count=await publicGet(base+'/'+layer+'/query?where=1%3D1&returnCountOnly=true&f=json');assert(count.ok,'Count request failed');
  const c=await count.json();assert(Number.isSafeInteger(c.count)&&c.count>0,'Invalid source feature count');
  return {ok:true,name:data.name,fields,featureCount:c.count,elapsedMs:Math.round(performance.now()-start)};
 }catch(e){return {ok:false,error:cleanError(e),elapsedMs:Math.round(performance.now()-start)};}
}
async function sample([province,expectedMunicipalityCode,terms]){
 const start=performance.now(),attempts=[];
 for(const term of terms){
  try{
   const r=await geo.search(province,term);
   assert(r.localities.every(x=>x.province===province),'Cross-province locality returned');
   const matches=r.localities.filter(x=>x.municipalityCode===expectedMunicipalityCode);
   attempts.push({term,returned:r.localities.length,matches:matches.length,more:r.more});
   for(const m of matches.slice(0,2)){
    try{
     const exact=await geo.resolve(m.localityId);
     assert.deepEqual(exact,m);
     return {province,expectedMunicipalityCode,ok:true,term,reference:exact,attempts,elapsedMs:Math.round(performance.now()-start)};
    }catch(e){attempts.push({term,localityId:m.localityId,error:cleanError(e)});}
   }
  }catch(e){attempts.push({term,error:cleanError(e)});}
 }
 return {province,expectedMunicipalityCode,ok:false,attempts,elapsedMs:Math.round(performance.now()-start)};
}
(async()=>{
 const layers=await Promise.all([metadata(0,['objectid','munic_code','sub_place_code','sub_place_name']),metadata(2,['objectid','munic_code','munic_name','province_code'])]);
 const results=[];
 for(let i=0;i<samples.length;i+=3)results.push(...await Promise.all(samples.slice(i,i+3).map(sample)));
 const report={capturedAt:new Date().toISOString(),source:base,vintage:G.VINTAGE,mode:'public GET only',requests,layers,results,provincesPassed:results.filter(x=>x.ok).length,provincesTested:results.length,allSamplesPassed:layers.every(x=>x.ok)&&results.every(x=>x.ok),currentBoundaryCoverageCertified:false,limitations:['These are representative search and round-trip checks, not all-township coverage.','Expected codes are review fixtures; a sample miss requires source/alias/boundary investigation.','Municipality layer is 2018; current MDB and Stats SA reference crosswalk remains a release requirement.']};
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(!report.allSamplesPassed)process.exitCode=1;
})().catch(e=>{console.error(cleanError(e));process.exitCode=1;});
