'use strict';
// DPME government GIS: sub-place layer 0 and Local Municipality (2018) layer 2.
// https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/P_Dm_M_Lm_Sp_W_Bound/FeatureServer
// This is a published reference, not a claim that every informal settlement or
// every post-2018 boundary is present. No business addresses or contacts are sent.
const D=require('./domain');
const SOURCE='DPME-P_Dm_M_Lm_Sp_W_Bound';
const VINTAGE='municipality-2018; sub-place vintage unspecified';
const BASE='https://dpmegis.dpme.gov.za/arcgis/rest/services/Hosted/P_Dm_M_Lm_Sp_W_Bound/FeatureServer';
const prefixes=Object.freeze({'Eastern Cape':['EC'],'Free State':['FS'],Gauteng:['GT'],'KwaZulu-Natal':['KZN'],Limpopo:['LIM','LP'],Mpumalanga:['MP'],'Northern Cape':['NC'],'North West':['NW'],'Western Cape':['WC']});
// Metro codes and names: South African government local-government directory.
// https://www.gov.za/links/local-government
const metros=Object.freeze({BUF:['Eastern Cape','Buffalo City'],NMA:['Eastern Cape','Nelson Mandela Bay'],MAN:['Free State','Mangaung'],EKU:['Gauteng','City of Ekurhuleni'],JHB:['Gauteng','City of Johannesburg'],TSH:['Gauteng','City of Tshwane'],ETH:['KwaZulu-Natal','eThekwini'],CPT:['Western Cape','City of Cape Town']});
// Whole-municipality amalgamations only; no inference for divided/partial areas.
// MDB 2023 investigation, pre/post-merger table; effective after 2016 LGE.
// https://www.demarcation.org.za/wp-content/uploads/2023/09/Investigation-of-the-feasibility-of-aligning-amalgamations-with-the-Census-FINAL-REPORT.pdf
// 2026-11-27 complete public inventory: audit commit 727f490a67c12577a0ba0e1ee3e4818e74e73c14.
// 27 additional predecessor codes confirmed present, 1,299 source features.
const mergers=Object.freeze({"MP322":"MP326","MP323":"MP326","NW401":"NW405","NW402":"NW405","EC143":"EC145","EC144":"EC145","EC127":"EC129","EC128":"EC129","EC132":"EC139","EC133":"EC139","EC134":"EC139","EC103":"EC101","EC107":"EC101","FS164":"MAN","GT482":"GT485","GT483":"GT485","KZN431":"KZN436","KZN432":"KZN436","KZN234":"KZN237","KZN236":"KZN237","KZN232":"KZN238","KZN233":"KZN238","KZN273":"KZN276","KZN274":"KZN276","KZN215":"KZN216","LIM474":"LIM476","LIM475":"LIM476","LIM364":"LIM368","LIM365":"LIM368","NC081":"NC087","NC083":"NC087"});
const splitMunicipalities=Object.freeze(['KZN211','KZN283','LIM352','LIM342']);
const MERGER_SOURCE='MDB-2023-2016-amalgamations';
const canonicalMunicipality=m=>Object.hasOwn(mergers,m)?mergers[m]:m;
const originalCodes=m=>[m,...Object.entries(mergers).filter(([,v])=>v===m).map(([k])=>k)];
const provinces=Object.freeze(Object.keys(prefixes));
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const code=v=>typeof v==='string'&&/^[A-Z0-9]{2,12}$/.test(v)?v:null;
const subcode=v=>{const s=typeof v==='number'&&Number.isSafeInteger(v)&&v>0?String(v):v;return typeof s==='string'&&/^\d{4,15}$/.test(s)?s:null;};
function provinceFor(m){
 if(!code(m))return null;
 if(Object.hasOwn(metros,m))return metros[m][0];
 return provinces.find(p=>prefixes[p].some(x=>m.startsWith(x)&&m.length>x.length))||null;
}
function parseLocalityId(value){
 const match=typeof value==='string'&&/^([A-Z0-9]{2,12}):(\d{4,15})$/.exec(value);
 if(!match||!provinceFor(match[1]))D.fail(422,'Choose a valid official locality reference.');
 return {municipalityCode:match[1],subplaceCode:match[2]};
}
const quoted=v=>"'"+v.replaceAll("'","''")+"'";
const label=v=>typeof v==='string'&&v.trim()&&v.length<=254&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():null;
function createGeography({fetcher=fetch}={}){
 async function query(layer,where,fields,count){
  if(![0,2].includes(layer))throw Error('Unexpected geography source layer');
  const url=new URL(BASE+'/'+layer+'/query');
  url.search=new URLSearchParams({f:'json',where,outFields:fields,returnGeometry:'false',resultRecordCount:String(count),orderByFields:'objectid ASC'}).toString();
  try{
   const r=await fetcher(url.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
   if(!r.ok)throw Error('HTTP error');
   const body=await r.json();
   if(body.error||!Array.isArray(body.features)||body.features.length>count||body.features.some(f=>!f.attributes||typeof f.attributes!=='object'))throw Error('Invalid source response');
   return {rows:body.features.map(f=>f.attributes),more:body.exceededTransferLimit===true};
  }catch(_){D.fail(503,'Official locality reference unavailable. Retry or save a provisional location for review; no authoritative allocation was assumed.');}
 }
 async function rowsWithMunicipalities(rows){
  const valid=rows.filter(r=>provinceFor(r.munic_code)&&!splitMunicipalities.includes(r.munic_code)&&subcode(r.sub_place_code)&&label(r.sub_place_name));
  const codes=[...new Set(valid.map(r=>canonicalMunicipality(r.munic_code)))];
  const locals=codes.filter(c=>!Object.hasOwn(metros,c));
  const names=new Map(codes.filter(c=>Object.hasOwn(metros,c)).map(c=>[c,metros[c][1]]));
  if(locals.length){
   const m=await query(2,'munic_code IN ('+locals.map(quoted).join(',')+')','munic_code,munic_name,province_code',Math.max(1,locals.length*3));
   if(m.more)D.fail(503,'Municipality reference incomplete. Refine the locality search.');
   const grouped=new Map();
   for(const row of m.rows){
    const name=label(row.munic_name);if(!locals.includes(row.munic_code)||!name)continue;
    const values=grouped.get(row.munic_code)||new Set();values.add(name);grouped.set(row.munic_code,values);
   }
   for(const [c,values] of grouped)if(values.size===1)names.set(c,[...values][0]);
  }
  const byId=new Map(),ambiguous=new Set();
  for(const r of valid){
   const municipalityCode=canonicalMunicipality(r.munic_code),municipality=names.get(municipalityCode);
   if(!municipality||provinceFor(municipalityCode)!==provinceFor(r.munic_code))continue;
   const locality={localityId:municipalityCode+':'+subcode(r.sub_place_code),province:provinceFor(municipalityCode),municipality,municipalityCode,township:label(r.sub_place_name),townshipCode:subcode(r.sub_place_code),geographySource:SOURCE,geographySourceVintage:VINTAGE,
    ...(r.munic_code===municipalityCode?{}:{sourceMunicipalityCode:r.munic_code,municipalityCrosswalkSource:MERGER_SOURCE,municipalityCrosswalkEffectiveYear:2016})};
   const old=byId.get(locality.localityId);
   // Multiple historic/current rows are acceptable only when the sub-place
   // names agree; prefer the direct current code, otherwise retain provenance
   // and choose a deterministic source code for duplicate identical labels.
   if(old&&norm(old.township)!==norm(locality.township))ambiguous.add(locality.localityId);
   else if(!old||(!locality.sourceMunicipalityCode&&old.sourceMunicipalityCode)||
    (old.sourceMunicipalityCode&&locality.sourceMunicipalityCode&&locality.sourceMunicipalityCode<old.sourceMunicipalityCode))byId.set(locality.localityId,locality);
  }
  return [...byId.values()].filter(r=>!ambiguous.has(r.localityId));
 }
 async function search(province,input){
  if(!provinces.includes(province))D.fail(422,'Choose a South African province first.');
  const term=D.text(input??'','township or locality',80);
  // Only locality names go to the official public source, never prospect identity.
  if(term.length<2||!/^[\p{L}\p{N} .()'’-]+$/u.test(term))D.fail(422,'Enter at least two letters of a locality name.');
  const conditions=[...prefixes[province].map(p=>'munic_code LIKE '+quoted(p+'%')),...Object.entries(metros).filter(([,v])=>v[0]===province).map(([c])=>'munic_code = '+quoted(c))];
  const result=await query(0,'UPPER(sub_place_name) LIKE '+quoted(term.toUpperCase()+'%')+' AND ('+conditions.join(' OR ')+')','munic_code,sub_place_code,sub_place_name',50);
  const localities=(await rowsWithMunicipalities(result.rows)).filter(r=>r.province===province);
  return {source:SOURCE,vintage:VINTAGE,localities,more:result.more,requiresCurrentBoundaryReview:true};
 }
 async function resolve(id){
  const {municipalityCode,subplaceCode}=parseLocalityId(id);
  const canonical=canonicalMunicipality(municipalityCode);
  if(canonical!==municipalityCode)D.fail(422,'Select the updated official locality reference.');
  if(splitMunicipalities.includes(canonical))D.fail(409,'Former municipality was divided; official spatial boundary review required.');
  const codes=originalCodes(canonical);
  const municipalityWhere=codes.length===1?'munic_code = '+quoted(canonical):'munic_code IN ('+codes.map(quoted).join(',')+')';
  const result=await query(0,municipalityWhere+' AND sub_place_code = '+subplaceCode,'munic_code,sub_place_code,sub_place_name',10);
  if(result.more)D.fail(409,'Ambiguous official locality reference. Select another verified record.');
  const rows=(await rowsWithMunicipalities(result.rows)).filter(r=>r.localityId===id);
  if(rows.length!==1)D.fail(409,'The official locality reference could not be uniquely verified.');
  return rows[0];
 }
 return {search,resolve};
}
function projectedGeography(p){
 const province=p.province||(p.city==='Durban'?'KwaZulu-Natal':p.city==='Johannesburg'?'Gauteng':'');
 let verified=false;
 if(p.geographySource===SOURCE&&p.geographySourceVintage===VINTAGE&&p.localityId&&p.municipality&&p.township&&p.municipalityCode&&p.townshipCode){
  try{const ids=parseLocalityId(p.localityId);verified=ids.municipalityCode===p.municipalityCode&&ids.subplaceCode===p.townshipCode&&provinceFor(ids.municipalityCode)===province&&canonicalMunicipality(ids.municipalityCode)===ids.municipalityCode&&!splitMunicipalities.includes(ids.municipalityCode);}catch(_){}
 }
 if(verified&&p.sourceMunicipalityCode){
  verified=Object.hasOwn(mergers,p.sourceMunicipalityCode)&&mergers[p.sourceMunicipalityCode]===p.municipalityCode&&p.municipalityCrosswalkSource===MERGER_SOURCE&&p.municipalityCrosswalkEffectiveYear===2016;
 }
 return {province,municipality:p.municipality||'',township:p.township||p.area||'',municipalityCode:verified?p.municipalityCode:'',townshipCode:verified?p.townshipCode:'',localityId:verified?p.localityId:'',geographySource:verified?SOURCE:'provisional',geographySourceVintage:verified?VINTAGE:'',geographyNeedsReview:!verified,
  ...(verified&&p.sourceMunicipalityCode?{sourceMunicipalityCode:p.sourceMunicipalityCode,municipalityCrosswalkSource:MERGER_SOURCE,municipalityCrosswalkEffectiveYear:2016}:{})};
}
module.exports={createGeography,projectedGeography,parseLocalityId,provinceFor,provinces,SOURCE,VINTAGE,mergers,splitMunicipalities};
