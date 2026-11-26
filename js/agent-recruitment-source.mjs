// Recruitment attribution is optional, unverified and never used for eligibility.
// Pass only our three known campaign labels; no click IDs, cookies or personal data.
const cities=new Set(['johannesburg','durban','cape_town']);
export function recruitmentCity(search){
 const p=new URLSearchParams(search);
 for(const [key,value] of [['utm_source','meta'],['utm_medium','paid_social'],['utm_campaign','teyza_field_agents']]){
  if(p.getAll(key).length!==1||p.get(key)!==value)return null;
 }
 const city=p.get('utm_content');
 return p.getAll('utm_content').length===1&&cities.has(city)?city:null;
}
export function recruitmentSource(search){
 const city=recruitmentCity(search);
 return city?'meta_'+city:null;
}
export function carryRecruitmentSource(root,search){
 const city=recruitmentCity(search);
 if(!city)return;
 const query=new URLSearchParams({utm_source:'meta',utm_medium:'paid_social',utm_campaign:'teyza_field_agents',utm_content:city});
 for(const link of root.querySelectorAll('a[href="/work.html"]'))link.setAttribute('href','/work.html?'+query.toString());
}
if(typeof document!=='undefined'&&typeof location!=='undefined'&&location.pathname==='/agents.html')carryRecruitmentSource(document,location.search);
