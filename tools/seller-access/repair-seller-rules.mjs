import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Mask strings/comments while preserving source offsets. Never rewrite a full
// project's rules from a bundled snapshot: the input must be its current rules.
function mask(source){
  const chars=source.split('');let mode='',quote='';
  for(let i=0;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(mode==='line'){if(c==='\n')mode='';else chars[i]=' ';continue;}
    if(mode==='block'){
      if(c==='*'&&n==='/'){chars[i]=chars[i+1]=' ';i++;mode='';}
      else if(c!=='\n')chars[i]=' ';continue;
    }
    if(mode==='string'){
      chars[i]=c==='\n'?'\n':' ';
      if(c==='\\'){if(i+1<source.length)chars[++i]=' ';}
      else if(c===quote)mode='';continue;
    }
    if(c==='/'&&n==='/'){chars[i]=chars[i+1]=' ';i++;mode='line';}
    else if(c==='/'&&n==='*'){chars[i]=chars[i+1]=' ';i++;mode='block';}
    else if(c==='"'||c==="'"){chars[i]=' ';quote=c;mode='string';}
  }
  if(mode==='block'||mode==='string')throw Error('Unclosed rules comment or string. No output written.');
  return chars.join('');
}
function endBlock(clean,start){
  let depth=0;
  for(let i=start;i<clean.length;i++){
    if(clean[i]==='{')depth++;
    if(clean[i]==='}'&&--depth===0)return i;
  }
  throw Error('Unbalanced rules braces. No output written.');
}
function rootBlock(clean){
  if(!/\bservice\s+cloud\.firestore\s*\{/.test(clean))throw Error('Expected Cloud Firestore rules, not Storage rules.');
  const roots=[...clean.matchAll(/\bmatch\s+\/databases\/\{([A-Za-z_]\w*)\}\/documents\s*\{/g)];
  if(roots.length!==1)throw Error('Expected exactly one Firestore database match. No output written.');
  const found=roots[0],start=found.index+found[0].length-1;
  return {start,end:endBlock(clean,start),database:found[1]};
}
const defaults=new URL('.',import.meta.url);
export function repairRules(source){
  let output=source.replace(/^\uFEFF/,'');const changes=[];
  for(const spec of [
    {collection:'teyzaSellerAccounts',pattern:/\bmatch\s+\/teyzaSellerAccounts\/\{([A-Za-z_]\w*)\}\s*\{/g,file:'seller-account.rules',kind:'get'},
    {collection:'teyzaDraftProducts',pattern:/\bmatch\s+\/teyzaDraftProducts\/\{([A-Za-z_]\w*)\}\/items\/\{([A-Za-z_]\w*)\}\s*\{/g,file:'seller-drafts.rules',kind:'get, list'}
  ]){
    const clean=mask(output),root=rootBlock(clean),matches=[...clean.matchAll(spec.pattern)]
      .filter(m=>m.index>root.start&&m.index<root.end);
    if(matches.length>1)throw Error('Duplicate '+spec.collection+' matches require manual review. No output written.');
    const marker='TEYZA_OWNER_ACCESS_R310_'+spec.collection;
    if(matches.length===0){
      let block=fs.readFileSync(new URL(spec.file,defaults),'utf8');
      block=block.replaceAll('$(database)','$('+root.database+')');
      const canonical=[...mask(block).matchAll(spec.pattern)][0];
      const start=canonical.index+canonical[0].length;
      block=block.slice(0,start)+'\n  // '+marker+block.slice(start);
      output=output.slice(0,root.end)+'\n'+block+'\n'+output.slice(root.end);
      changes.push('Added original strict '+spec.collection+' rules');continue;
    }
    const found=matches[0],start=found.index+found[0].length-1,end=endBlock(clean,start);
    // Only direct children of the database match are supported.
    let depth=0;for(const c of clean.slice(root.start+1,found.index)){
      if(c==='{')depth++;else if(c==='}')depth--;
    }
    if(depth!==0)throw Error('Nested seller rules require manual review. No output written.');
    const uid=found[1];
    const clause='\n  // '+marker+'\n  allow '+spec.kind+': if request.auth != null && request.auth.uid == '+uid+
      (spec.collection==='teyzaDraftProducts'?'\n    && exists(/databases/$('+root.database+')/documents/teyzaSellerAccounts/$('+uid+'))':'')+';\n';
    if(output.slice(start,end).includes(marker))continue;
    output=output.slice(0,start+1)+clause+output.slice(start+1);
    changes.push('Restored owner-only reads in '+spec.collection+'; existing writes preserved');
  }
  return {rules:output,changes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const input=path.resolve(process.argv[2]||'current-firestore.rules');
    const target=path.resolve(process.argv[3]||'firestore.seller-access.fixed.rules');
    if(input===target)throw Error('Input and output must differ.');
    const original=fs.readFileSync(input,'utf8');
    const result=repairRules(original);
    const hash=crypto.createHash('sha256').update(original).digest('hex').slice(0,12);
    const backup=path.join(path.dirname(target),'firestore.before-seller-access-'+hash+'.rules');
    if(!fs.existsSync(backup))fs.writeFileSync(backup,original,{flag:'wx'});
    fs.writeFileSync(target,result.rules);
    fs.writeFileSync(path.join(path.dirname(target),'firebase.seller-access.json'),JSON.stringify({firestore:{rules:path.basename(target)}},null,2)+'\n');
    console.log(JSON.stringify({output:path.basename(target),backup:path.basename(backup),changes:result.changes}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
