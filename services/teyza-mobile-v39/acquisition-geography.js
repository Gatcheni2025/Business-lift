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
const provinces=Object.freeze(Object.keys(prefixes));
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const code=v=>typeof v==='string'&&/^[A-Z0-9]{2,12}$/.test(v)?v:null;
const subcode=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?String(v):typeof v==='string'&&/^\d{4,15}$/.test(v)?v:null;
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
  const valid=rows.filter(r=>provinceFor(r.munic_code)&&subcode(r.sub_place_code)&&label(r.sub_place_name));
  const codes=[...new Set(valid.map(r=>r.munic_code))];
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
   const municipality=names.get(r.munic_code);if(!municipality)continue;
   const locality={localityId:r.munic_code+':'+subcode(r.sub_place_code),province:provinceFor(r.munic_code),municipality,municipalityCode:r.munic_code,township:label(r.sub_place_name),townshipCode:subcode(r.sub_place_code),geographySource:SOURCE,geographySourceVintage:VINTAGE};
   const old=byId.get(locality.localityId);
   if(old&&norm(old.township)!==norm(locality.township))ambiguous.add(locality.localityId);
   else byId.set(locality.localityId,locality);
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
  const result=await query(0,'munic_code = '+quoted(municipalityCode)+' AND sub_place_code = '+subplaceCode,'munic_code,sub_place_code,sub_place_name',10);
  if(result.more)D.fail(409,'Ambiguous official locality reference. Select another verified record.');
  const rows=(await rowsWithMunicipalities(result.rows)).filter(r=>r.localityId===id);
  if(rows.length!==1)D.fail(409,'The official locality reference could not be uniquely verified.');
  return rows[0];
 }
 return {search,resolve};
}
function projectedGeography(p){
 const province=p.province||({Durban:'KwaZulu-Natal',Johannesburg:'Gauteng'})[p.city]||'';
 let verified=false;
 if(p.geographySource===SOURCE&&p.geographySourceVintage===VINTAGE&&p.localityId&&p.municipality&&p.township&&p.municipalityCode&&p.townshipCode){
  try{const ids=parseLocalityId(p.localityId);verified=ids.municipalityCode===p.municipalityCode&&ids.subplaceCode===p.townshipCode&&provinceFor(ids.municipalityCode)===province;}catch(_){}
 }
 return {province,municipality:p.municipality||'',township:p.township||p.area||'',municipalityCode:verified?p.municipalityCode:'',townshipCode:verified?p.townshipCode:'',localityId:verified?p.localityId:'',geographySource:verified?SOURCE:'provisional',geographySourceVintage:verified?VINTAGE:'',geographyNeedsReview:!verified};
}
module.exports={createGeography,projectedGeography,parseLocalityId,provinceFor,provinces,SOURCE,VINTAGE};
