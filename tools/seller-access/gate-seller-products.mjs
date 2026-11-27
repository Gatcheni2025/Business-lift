import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mask,endBlock,rootBlock,repairRules} from './repair-seller-rules.mjs';

// A new allow clause cannot override an existing allow: Firestore rules are
// additive. Replace only an exactly recognised legacy block; stop on custom
// rules or an overlapping recursive write rule for a human review.
const pattern=/\bmatch\s+\/teyzaDraftProducts\/\{([A-Za-z_]\w*)\}\/items\/\{([A-Za-z_]\w*)\}\s*\{/g;
const accountPattern=/\bmatch\s+\/teyzaSellerAccounts\/\{([A-Za-z_]\w*)\}\s*\{/g;
const here=new URL('.',import.meta.url);
function normal(source){
 return source.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+/g,(_m,quoted)=>quoted||'');
}
function block(source){const clean=mask(source),m=[...clean.matchAll(pattern)][0];
 if(!m)throw Error('Bundled product rules are missing.');const open=m.index+m[0].length-1;
 return source.slice(m.index,endBlock(clean,open)+1);
}
function standard(value,uid,item,database){
 const word=name=>new RegExp('\\b'+name+'\\b','g');
 return normal(value.replace(word(uid),'TEYZA_SELLER').replace(word(item),'TEYZA_ITEM').replaceAll('$('+database+')','$(TEYZA_DB)'));
}
function accountStandard(value,uid){
 // Replace only the captured path variable, not auth.uid or the 'uid' field.
 const safe=uid.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return normal(value
  .replace(new RegExp('(match\\s+\\/teyzaSellerAccounts\\/\\{)'+safe+'(\\})'), '$1TEYZA_OWNER$2')
  .replace(new RegExp('(request\\.auth\\.uid\\s*==\\s*)'+safe+'\\b','g'),'$1TEYZA_OWNER')
  .replace(new RegExp('(request\\.resource\\.data\\.uid\\s*==\\s*)'+safe+'\\b','g'),'$1TEYZA_OWNER'));
}
function accountBlock(source){
 const clean=mask(source),m=[...clean.matchAll(accountPattern)][0];
 if(!m)throw Error('Bundled seller-account rules are missing.');
 return source.slice(m.index,endBlock(clean,m.index+m[0].length-1)+1);
}
function fixKnownAccount(source){
 const clean=mask(source),root=rootBlock(clean);
 const all=[...clean.matchAll(/\bmatch\s+\/teyzaSellerAccounts\b/g)].filter(m=>m.index>root.start&&m.index<root.end);
 const found=[...clean.matchAll(accountPattern)].filter(m=>m.index>root.start&&m.index<root.end);
 if(all.length!==found.length||found.length>1)throw Error('Overlapping or multiple seller-account rules need manual review. Nothing prepared.');
 if(!found.length)return {rules:source,changes:[]};
 const m=found[0],start=m.index+m[0].length-1,end=endBlock(clean,start);
 let depth=0;for(const c of clean.slice(root.start+1,m.index)){if(c==='{')depth++;else if(c==='}')depth--;}
 if(depth!==0)throw Error('Nested seller-account rules need manual review. Nothing prepared.');
 const old=accountBlock(fs.readFileSync(new URL('seller-account-legacy.rules',here),'utf8'));
 const next=accountBlock(fs.readFileSync(new URL('seller-account.rules',here),'utf8'));
 const current=source.slice(m.index,end+1);
 let currentNormal=accountStandard(current,m[1]);
 if(current.includes('TEYZA_OWNER_ACCESS_R310_teyzaSellerAccounts')){
  const added=accountStandard(`allow get: if request.auth != null && request.auth.uid == ${m[1]};`,m[1]);
  currentNormal=currentNormal.replace(added,'');
 }
 const wasOld=currentNormal===accountStandard(old,'uid');
 if(!wasOld&&currentNormal!==accountStandard(next,'uid'))
  throw Error('Existing seller-account rules differ from the known version. Review them manually; nothing prepared.');
 let raw=next.replace('match /teyzaSellerAccounts/{uid}','match /teyzaSellerAccounts/{'+m[1]+'}')
  .replace('request.auth.uid == uid','request.auth.uid == '+m[1])
  .replace('request.resource.data.uid == uid','request.resource.data.uid == '+m[1]);
 const signature=[...mask(raw).matchAll(accountPattern)][0],insert=signature.index+signature[0].length;
 raw=raw.slice(0,insert)+'\n  // TEYZA_OWNER_ACCESS_R310_teyzaSellerAccounts'+raw.slice(insert);
 return {rules:source.slice(0,m.index)+raw+source.slice(end+1),changes:[wasOld?
  'Allow safe profile edits while preserving server-managed fields':'Seller profile rule already present']};
}
export function gateProductRules(source){
 const profile=fixKnownAccount(source);source=profile.rules;
 const clean=mask(source),root=rootBlock(clean);
 for(const m of clean.matchAll(/\bmatch\s+\/[^\s;]*?\{[A-Za-z_]\w*\s*=\s*\*\*\}\s*\{/g)){
  if(m.index<root.start||m.index>root.end)continue;
  const open=m.index+m[0].length-1,body=clean.slice(open,endBlock(clean,open)+1);
  for(const clause of body.matchAll(/\ballow\s+([^:;]+):\s*if\s*([^;]+);/g)){
   if(/\b(write|create|update)\b/.test(clause[1])&&!/^false\s*$/.test(clause[2]))
    throw Error('An overlapping recursive write rule needs manual security review. Nothing prepared.');
  }
 }
 const all=[...clean.matchAll(/\bmatch\s+\/teyzaDraftProducts\b/g)].filter(m=>m.index>root.start&&m.index<root.end);
 const found=[...clean.matchAll(pattern)].filter(m=>m.index>root.start&&m.index<root.end);
 if(all.length!==found.length||found.length>1)throw Error('Overlapping or multiple product rules need manual review. Nothing prepared.');
 if(found.length===0){const repaired=repairRules(source);return {rules:repaired.rules,changes:[...profile.changes,...repaired.changes]};}
 const m=found[0],open=m.index+m[0].length-1,end=endBlock(clean,open),current=source.slice(m.index,end+1);
 const legacy=block(fs.readFileSync(new URL('seller-drafts-legacy.rules',here),'utf8'));
 const next=block(fs.readFileSync(new URL('seller-drafts.rules',here),'utf8'));
 const oldNormal=standard(legacy,'sellerId','itemId','database');
 const newNormal=standard(next,'sellerId','itemId','database');
 let currentNormal=standard(current,m[1],m[2],root.database);
 // The older repair helper may have prepended this owner-read-only clause.
 // Recognise that exact clause only; any other custom write logic still stops.
 if(current.includes('TEYZA_OWNER_ACCESS_R310_teyzaDraftProducts')){
  const added=standard(`allow get, list: if request.auth != null && request.auth.uid == ${m[1]} && exists(/databases/$(${root.database})/documents/teyzaSellerAccounts/$(${m[1]}));`,m[1],m[2],root.database);
  currentNormal=currentNormal.replace(added,'');
 }
 if(currentNormal!==oldNormal&&currentNormal!==newNormal)
  throw Error('Existing product write rules differ from the known version. Review them manually; nothing prepared.');
 const raw=next.replaceAll('sellerId',m[1]).replaceAll('itemId',m[2]).replaceAll('$(database)','$('+root.database+')');
 const signature=[...mask(raw).matchAll(pattern)][0],openReplacement=signature.index+signature[0].length;
 const replacement=raw.slice(0,openReplacement)+'\n  // TEYZA_OWNER_ACCESS_R310_teyzaDraftProducts'+raw.slice(openReplacement);
 const gated=source.slice(0,m.index)+replacement+source.slice(end+1);
 const repaired=repairRules(gated);
 return {rules:repaired.rules,changes:[...profile.changes,currentNormal===newNormal?'Product gate already present':'Replaced known product rule with approval and access gate',...repaired.changes]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const input=path.resolve(process.argv[2]||'current-firestore.rules'),output=path.resolve(process.argv[3]||'firestore.seller-approval.candidate.rules');
  if(input===output)throw Error('Input and output must differ.');
  const result=gateProductRules(fs.readFileSync(input,'utf8'));
  fs.writeFileSync(output,result.rules,{flag:'wx'});
  console.log(JSON.stringify({candidate:path.basename(output),changes:result.changes,deploy:false}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
