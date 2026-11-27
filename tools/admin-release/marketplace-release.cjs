'use strict';
// Version-pinned, scoped release helper. Never prints or writes secrets.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {connect,PROJECT}=require('./firebase-client.cjs');
const {patch,rollback,overlay,allFiles,versionName}=require('./hosting-patch.cjs');
const {assertAdminBackend}=require('./run.cjs');
const repo=path.resolve(__dirname,'../..'),mobileDir=path.join(repo,'services/teyza-mobile-v39');
const adminRoot=path.join(repo,'web/teyza-admin/public'),workRoot=path.join(repo,'web/app-first/public');
const backupPath=path.join(repo,'hosting-backup-teyza-marketplace-v61.json');
const healthUrl='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
const placesUrl='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/health';
const core=['teyzaMobile','teyzaCatalogueDraftChanged','teyzaCatalogueShopChanged','teyzaCatalogueApprovalChanged','teyzaSellerBillingChanged'];
const optional=['teyzaPublicationRepair','teyzaShopLocationRefresh'];
const flags=['billingMode','subscriptionMonthlyCents','sellerPaystackNewCheckoutDisabled','sellerMembershipBillingMode','membershipProrationEnabled','subscriptionTermsVersion','paystackRolloutMode','shopperAdsWebPaystackEnabled','paystackCheckoutAvailable','agentCommissionEnabled','sellerMandates','adminNetcashManualSubmission'];
function compareHealth(before,after){
 for(const k of flags)if(before[k]!==after[k])throw Error('Live payment or access setting changed: '+k+'. Hosting publication blocked.');
}
function parseEnv(text){
 const out={};
 for(let line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
  line=line.trim();if(!line||line.startsWith('#'))continue;
  const m=/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if(!m||Object.hasOwn(out,m[1]))throw Error('Ambiguous environment syntax; use the unchanged original deployment .env.');
  let v=m[2].trim();
  if(v.startsWith('"')||v.startsWith("'")){
   if(v.at(-1)!==v[0]||v.slice(1,-1).includes('\\'))throw Error('Unsupported quoted environment value; use a reviewed dotenv file.');
   v=v.slice(1,-1);
  }else v=v.replace(/\s+#.*$/,'').trim();
  if(/[\r\n]/.test(v))throw Error('Unsupported multiline environment value.');
  out[m[1]]=v;
 }
 return out;
}
function assertEnv(local,live){
 if(!live||typeof live!=='object')throw Error('Cannot verify live runtime configuration.');
 const excluded=new Set(['FIREBASE_CONFIG','GCLOUD_PROJECT','GCP_PROJECT','GOOGLE_CLOUD_PROJECT','FUNCTION_TARGET','FUNCTION_SIGNATURE_TYPE','FUNCTION_REGION','FUNCTION_NAME','K_SERVICE','K_REVISION','K_CONFIGURATION','PORT','NODE_ENV','EVENTARC_CLOUD_EVENT_SOURCE','X_GOOGLE_FUNCTION_NAME','X_GOOGLE_FUNCTION_REGION','X_GOOGLE_FUNCTION_VERSION','X_GOOGLE_FUNCTION_TRIGGER','LOG_EXECUTION_ID']);
 const expected=Object.fromEntries(Object.entries(live).filter(([k])=>!excluded.has(k)));
 const mismatch=[...new Set([...Object.keys(expected),...Object.keys(local)])].filter(k=>expected[k]!==local[k]);
 if(mismatch.length)throw Error('Local .env differs from deployed API configuration (names only): '+mismatch.join(', ')+'. Restore the exact deployed settings. No deployment started.');
}
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Health request failed.');return r.json();}
function call(bin,args){const r=spawnSync(bin,args,{cwd:repo,stdio:'inherit',windowsHide:false});if(r.error||r.status!==0)throw Error('Scoped command failed; inspect local output.');}
async function functionClient(){
 const {getGlobalDefaultAccount,setActiveAccount}=require('firebase-tools/lib/auth');
 const {requireAuth}=require('firebase-tools/lib/requireAuth');
 const {Client}=require('firebase-tools/lib/apiv2');
 const options={project:PROJECT,nonInteractive:true};const account=getGlobalDefaultAccount();if(account)setActiveAccount(options,account);
 await requireAuth(options);
 const client=new Client({urlPrefix:'https://cloudfunctions.googleapis.com',apiVersion:'v2'});
 return async(name,allowMissing=false)=>{
  try{return (await client.request({method:'GET',path:'/projects/'+PROJECT+'/locations/us-central1/functions/'+name,timeout:30000})).body;}
  catch(e){const code=e.context?.response?.statusCode??e.context?.response?.status??e.status;if(allowMissing&&code===404)return null;throw Error('Unable to verify deployed function '+name+'. No configuration values are displayed.');}
 };
}
async function preflight(){
 if(process.env.TEYZA_MAPS_BROWSER_KEY)throw Error('Unset the optional Maps browser-key override; this release preserves the existing map configuration.');
 const before=await json(healthUrl);assertAdminBackend(before);
 const envPath=path.join(mobileDir,'.env.'+PROJECT);
 if(!fs.existsSync(envPath))throw Error('Restore the exact existing '+path.basename(envPath)+' from the successful release. Never recreate payment settings.');
 for(const dir of [mobileDir,path.join(repo,'services/teyza-places-v34')]){
  for(const f of fs.readdirSync(dir).filter(n=>n==='.env'||n.startsWith('.env.'))){
   if(dir!==mobileDir||f!==path.basename(envPath))throw Error('Unexpected dotenv override: '+f+'. Review it before deployment.');
  }
 }
 const local=parseEnv(fs.readFileSync(envPath,'utf8'));
 const get=await functionClient(),live=await get('teyzaMobile');
 assertEnv(local,live.serviceConfig?.environmentVariables);
 const plan=local.TEYZA_PAYSTACK_MONTHLY_PLAN_CODE;
 if(!/^PLN_[A-Za-z0-9]+$/.test(plan||''))throw Error('Existing monthly plan configuration is missing.');
 const targets=[...core];
 for(const name of core.slice(1))await get(name);
 for(const name of optional)if(await get(name,true))targets.push(name);
 const placesFunction=await get('teyzaPlaces');
 assertEnv({},placesFunction.serviceConfig?.environmentVariables);
 const client=await connect(),domain=await client.hosting('GET','/projects/'+PROJECT+'/sites/'+PROJECT+'/customDomains/teyza.co.za');
 if(!domain.name?.endsWith('/customDomains/teyza.co.za'))throw Error('Incorrect live Hosting domain.');
 const current=versionName((await client.hosting('GET','/sites/'+PROJECT+'/channels/live')).release?.version?.name);
 const files=await allFiles(client,current);
 const changed=overlay(adminRoot,{workRoot});
 for(const p of ['/index.html','/assets/teyza-sprout-wordmark.svg','/assets/app/wordmark.svg','/assets/app/wordmark-light.svg','/assets/app/spaza-owner.webp','/assets/app/icon.svg','/assets/app-first.css','/assets/agent-map-first.css','/js/work-auth.mjs','/js/work-phone.mjs','/js/work-discovery.mjs'])if(!files.has(p))throw Error('Required live website dependency missing: '+p);
 console.log('Verified existing runtime configuration and Hosting domain; scoped targets: '+targets.join(', ')+', teyzaPlaces.');
 console.log('Planned Hosting files: '+changed.size+'; unrelated routes and files preserved. No writes in preflight.');
 return {before,targets,client};
}
async function main(){
 const action=process.argv[2];
 if(action==='rollback-hosting'){await rollback({client:await connect(),backupPath});return;}
 if(!['check','deploy'].includes(action))throw Error('Use check, deploy, or rollback-hosting.');
 const {before,targets,client}=await preflight();
 if(action==='check')return;
 if(process.argv[3]!=='--confirm-v61')throw Error('Explicit --confirm-v61 required for production.');
 const firebase=path.join(__dirname,'node_modules/firebase-tools/lib/bin/firebase.js');
 const run=(config,scope)=>call(process.execPath,[firebase,'deploy','--project',PROJECT,'--config',config,'--only',scope,'--non-interactive']);
 run('firebase.teyza-mobile-v39.json',targets.map(n=>'functions:teyza-mobile:'+n).join(','));
 const after=await json(healthUrl);compareHealth(before,after);assertAdminBackend(after,{marketplace:true});
 run('firebase.teyza-places-v34.json','functions:teyza-places:teyzaPlaces');
 const places=await json(placesUrl);if(places.ok!==true||places.marketplaceRelease!=='20261126-v61'||places.expandedBusinessDiscovery!==true)throw Error('Places capability check failed. Hosting was not published.');
 await patch({client,root:adminRoot,workRoot,backupPath});
 for(const [route,marker,priv] of [
  ['/admin','Marketplace control room',true],['/agents.html','Connect businesses.',false],
  ['/work.html','20261126-v61',true],['/owner-confirm.html','20261126-v61',true],
  ['/support-inbox.html','Support Centre',true]
 ]){
  const r=await fetch('https://teyza.co.za'+route,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  const body=await r.text();
  if(!r.ok||!body.includes(marker)||(priv&&!/noindex/i.test(r.headers.get('x-robots-tag')||'')))
   throw Error('Hosting was published but public smoke verification failed for '+route+'. Inspect the live release and rollback record before retrying.');
 }
 console.log('Marketplace backend, Places and scoped Hosting activated and public smoke checks passed. Verify signed-in Admin, agents and device journeys before store upload.');
}
if(require.main===module)main().catch(e=>{console.error('Marketplace release stopped: '+e.message);process.exitCode=1;});
module.exports={parseEnv,assertEnv,compareHealth};
