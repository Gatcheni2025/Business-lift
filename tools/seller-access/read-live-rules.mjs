import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {gateProductRules} from './gate-seller-products.mjs';

const PROJECT='business-lift-3c19c';
// The complete rules supplied for review on 6 Nov 2026, ignoring only
// whitespace and comments outside quoted strings. A changed production rule
// must be reviewed again instead of silently replacing somebody else's work.
const EXPECTED='d808d386d578de41678ce654e5e4c23dde19793cc84a37203f0feef27fee506d';
const compact=source=>source.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+/g,(_m,quoted)=>quoted||'');
const hash=source=>crypto.createHash('sha256').update(compact(source)).digest('hex');

export async function readCurrentRules(client){
 const release=(await client.request({method:'GET',path:`/projects/${PROJECT}/releases/cloud.firestore`,timeout:30000})).body;
 const name=release?.rulesetName;
 if(typeof name!=='string'||!/^projects\/(?:business-lift-3c19c|983479810697)\/rulesets\/[A-Za-z0-9_-]+$/.test(name))
  throw Error('Unexpected Firebase ruleset name. Nothing prepared.');
 const ruleset=(await client.request({method:'GET',path:'/'+name,timeout:30000})).body;
 const files=ruleset?.source?.files;
 if(!Array.isArray(files)||files.length!==1||typeof files[0]?.content!=='string'||!files[0].content||Buffer.byteLength(files[0].content)>256*1024)
  throw Error('Firebase returned an unexpected rules source. Nothing prepared.');
 return files[0].content;
}

export function prepareKnownRules(source){
 if(hash(source)!==EXPECTED)throw Error('The current Firebase rules differ from the reviewed copy. Stop and request another review.');
 return gateProductRules(source);
}

async function main(){
 const cliRoot=path.resolve(process.argv[2]||'');
 const out=path.resolve(process.argv[3]||'');
 if(!fs.existsSync(path.join(cliRoot,'package.json'))||!fs.existsSync(out))
  throw Error('Firebase CLI or output folder not found. Nothing prepared.');
 const require=createRequire(path.join(cliRoot,'package.json'));
 const {getGlobalDefaultAccount,setActiveAccount}=require('./lib/auth');
 const {requireAuth}=require('./lib/requireAuth');
 const {Client}=require('./lib/apiv2');
 const options={project:PROJECT,nonInteractive:true};
 const account=getGlobalDefaultAccount();if(account)setActiveAccount(options,account);
 await requireAuth(options);
 const client=new Client({urlPrefix:'https://firebaserules.googleapis.com',apiVersion:'v1'});
 let current;
 try{current=await readCurrentRules(client);}catch(error){
  if(error?.message?.startsWith('Unexpected Firebase')||error?.message?.startsWith('Firebase returned'))throw error;
  throw Error('Could not read Firestore rules with the signed-in Firebase account. Check project access; nothing prepared.');
 }
 const result=prepareKnownRules(current);
 const backup=path.join(out,'current-firestore.rules');
 const candidate=path.join(out,'firestore.seller-approval.candidate.rules');
 if(fs.existsSync(backup)||fs.existsSync(candidate))throw Error('Rules review files already exist. Use a new folder; nothing was overwritten.');
 fs.writeFileSync(backup,current,{flag:'wx'});
 try{fs.writeFileSync(candidate,result.rules,{flag:'wx'});}catch(error){fs.unlinkSync(backup);throw error;}
 console.log('Current published rules match the reviewed copy.');
 console.log('Prepared local backup and seller-approval candidate. No Firebase settings were changed.');
 for(const change of result.changes)console.log('- '+change);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error(error?.message||'Rules check failed. Nothing was deployed.');process.exitCode=1;});
}
