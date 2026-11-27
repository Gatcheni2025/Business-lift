'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const base='https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/P_Dm_M_Lm_Sp_W_Bound/FeatureServer';
const G=require('../../services/teyza-mobile-v39/acquisition-geography');
// MDB 2023 report Appendix 1, financial distress table. Only candidate
// crosswalks, NOT a change to the application or a certified current boundary.
const candidates={
 EC143:'EC145',EC144:'EC145',EC127:'EC129',EC128:'EC129',
 EC132:'EC139',EC133:'EC139',EC134:'EC139',EC103:'EC101',EC107:'EC101',
 FS164:'MAN',GT482:'GT485',GT483:'GT485',
 KZN431:'KZN436',KZN432:'KZN436',KZN234:'KZN237',KZN236:'KZN237',
 KZN232:'KZN238',KZN233:'KZN238',KZN273:'KZN276',KZN274:'KZN276',KZN215:'KZN216',
 LIM474:'LIM476',LIM475:'LIM476',LIM364:'LIM368',LIM365:'LIM368',
 MP322:'MP326',MP323:'MP326',NC081:'NC087',NC083:'NC087',NW401:'NW405',NW402:'NW405'
};
const splits={KZN211:['ETH','KZN212'],LIM352:['LIM351','LIM353','LIM354'],LIM342:['LIM341','LIM344','LIM343','LIM345']};
const existing={MP322:'MP326',MP323:'MP326',NW401:'NW405',NW402:'NW405'};
const metros=['BUF','NMA','MAN','EKU','JHB','TSH','ETH','CPT'];
let requests=0;
async function get(layer,params){
 const u=new URL(base+'/'+layer+'/query');u.search=new URLSearchParams({...params,f:'json',returnGeometry:'false'});
 assert.equal(u.origin,'https://dpmegis.dpme.gov.za');requests++;
 const r=await fetch(u,{method:'GET',redirect:'error',signal:AbortSignal.timeout(18000),headers:{Accept:'application/json'}});
 if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();
 if(data.error)throw Error(JSON.stringify(data.error).slice(0,300));return data;
}
async function inventory(layer,fields){
 const count=(await get(layer,{where:'1=1',returnCountOnly:'true'})).count;assert(Number.isSafeInteger(count)&&count>0&&count<100000,'Invalid source count');
 const seen=new Set(),counts=new Map(),names=new Map();
 let last=-1;
 for(let page=0;seen.size<count&&page<200;page++){
  const r=await get(layer,{where:'objectid > '+last,outFields:'objectid,munic_code'+(fields?',munic_name':''),orderByFields:'objectid ASC',resultRecordCount:'1000'});
  assert(Array.isArray(r.features)&&r.features.length>0,'Incomplete page');
  for(const {attributes:a} of r.features){
   assert(Number.isSafeInteger(a.objectid)&&a.objectid>last&&!seen.has(a.objectid),'Non-monotonic source IDs');
   last=a.objectid;seen.add(a.objectid);
   const code=typeof a.munic_code==='string'&&a.munic_code.trim()?a.munic_code.trim():'(missing)';
   counts.set(code,(counts.get(code)||0)+1);
   if(fields){const list=names.get(code)||new Set();if(a.munic_name)list.add(a.munic_name);names.set(code,list);}
  }
 }
 assert.equal(seen.size,count,'Full source inventory mismatch');
 return {count,counts,names};
}
(async()=>{
 const [sub,mun]=await Promise.all([inventory(0,false),inventory(2,true)]);
 const current=new Set([...mun.counts.keys(),...metros]);
 const old=Object.entries(candidates).map(([code,target])=>({code,target,features:sub.counts.get(code)||0,sourceInMunicipalityLayer:mun.counts.has(code),targetAvailable:current.has(target),targetName:metros.includes(target)?target:[...(mun.names.get(target)||[])].join(' / '),alreadyImplemented:existing[code]===target}));
 const divided=Object.entries(splits).map(([code,targets])=>({code,targets,features:sub.counts.get(code)||0}));
 const missing=[...sub.counts].filter(([code])=>!current.has(code)).sort((a,b)=>a[0].localeCompare(b[0])).map(([code,features])=>({code,features,candidateTarget:candidates[code]||null,splitReview:Object.hasOwn(splits,code),province:G.provinceFor(code)||null}));
 const report={date:new Date().toISOString(),testedCommit:'22569f6aaa4dcec56b32d742185a9a5a234a6aa5',source:base,requests,subPlaceFeatures:sub.count,municipalFeatures:mun.count,distinctSubPlaceCodes:sub.counts.size,distinctMunicipalityCodes:mun.counts.size,completeInventory:true,
 oldCodes:old,splitCodes:divided,missingMunicipalityCodes:missing,additionalWholeMergerCandidatesPresent:old.filter(r=>r.features>0&&r.targetAvailable&&!r.alreadyImplemented&&!r.sourceInMunicipalityLayer),unexplainedCodes:missing.filter(r=>!r.candidateTarget&&!r.splitReview),
 currentBoundaryCoverageCertified:false,notes:'Public source codes only; source count reconciliation is not a spatial 2026 boundary certification. No Firebase credentials, no Firebase access, no code changes to application.'};
 fs.mkdirSync('national-validation',{recursive:true});fs.writeFileSync('national-validation/municipal-code-inventory.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
