'use strict';
// Stage only the isolated worker and its reviewed local module dependencies.
// Never upload the mobile .env, agent training manual, credentials or mobile entrypoint.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'services/teyza-mobile-v39');
const args=process.argv.slice(2),channel=args[0];
const options={
 email:{entry:'index.business-mail-only.js',codebase:'teyza-business-mail',fn:'teyzaBusinessEmail',secret:'TEYZA_BUSINESS_MAIL_ZOHO'},
 whatsapp:{entry:'index.business-whatsapp-only.js',codebase:'teyza-business-whatsapp',fn:'teyzaBusinessWhatsApp',secret:'TEYZA_WHATSAPP_ACCESS_TOKEN'}
};
const dryRun=args[1]==='--check-package',discoveryOnly=args[1]==='--check-discovery';
if(!Object.hasOwn(options,channel)||args.length!==2||(!dryRun&&!discoveryOnly&&args[1]!=='--confirm-isolated-worker'))throw Error('Use email or whatsapp and --check-package, --check-discovery (read only), or --confirm-isolated-worker. No production writes.');
const spec=options[channel],project='business-lift-3c19c';
const cli=path.join(__dirname,'node_modules/firebase-tools/lib/bin/firebase.js');
if(!dryRun&&!discoveryOnly&&!fs.existsSync(cli))throw Error('Install pinned admin-release dependencies first.');
const files=new Set();
function collect(name){
 if(!/^[A-Za-z0-9_.-]+\.(?:js|json)$/.test(name)||name.includes('..')||name.endsWith('.test.js')||name.startsWith('.')||['package.json','package-lock.json'].includes(name))throw Error('Unexpected local dependency.');
 if(files.has(name))return;files.add(name);
 const data=fs.readFileSync(path.join(source,name),'utf8');
 // Explicit JSON imports keep their original extension and are data, not JS.
 if(name.endsWith('.json')){JSON.parse(data);return;}
 for(const m of data.matchAll(/require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)){
  const dependency=m[1];
  if(!/^[A-Za-z0-9_.-]+$/.test(dependency)||dependency.includes('..'))throw Error('Unexpected local dependency.');
  collect(/\.(?:js|json)$/.test(dependency)?dependency:dependency+'.js');
 }
}
collect(spec.entry);
if(dryRun){
 console.log(JSON.stringify({channel,entry:spec.entry,files:[...files].sort(),productionWrites:false},null,2));
 process.exit(0);
}
function run(bin,argv,cwd=root,env=process.env){
 const result=spawnSync(bin,argv,{cwd,env,stdio:'inherit',windowsHide:false});
 if(result.error||result.status!==0)throw Error('Isolated worker command failed; inspect local output.');
}
async function verifyDisabled(){
 const {getGlobalDefaultAccount,setActiveAccount}=require('firebase-tools/lib/auth');
 const {requireAuth}=require('firebase-tools/lib/requireAuth'),{Client}=require('firebase-tools/lib/apiv2');
 const opt={project,nonInteractive:true},account=getGlobalDefaultAccount();if(account)setActiveAccount(opt,account);await requireAuth(opt);
 const secrets=new Client({urlPrefix:'https://secretmanager.googleapis.com',apiVersion:'v1'});
 const meta=await secrets.get('/projects/'+project+'/secrets/'+spec.secret+'/versions/latest',{skipLog:{resBody:true},timeout:30000});
 if(meta.body?.state!=='ENABLED')throw Error('Required provider secret is not enabled. No deploy.');
 // Read only: require explicit control to remain disabled until a separate verification.
 const db=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1'});
 const route='/projects/'+project+'/databases/(default)/documents/teyzaBusinessCommunicationSettings/control';
 let control;
 try{control=(await db.get(route,{skipLog:{resBody:true},timeout:30000})).body;}
 catch(e){if((e.context?.response?.statusCode??e.context?.response?.status??e.status)!==404)throw Error('Cannot verify communication control.');}
 const enabled=control?.fields?.[channel==='email'?'emailEnabled':'whatsappEnabled']?.booleanValue;
 if(enabled===true)throw Error('Disable the selected communication channel before deploying its worker.');

}
function createStage(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'teyza-business-worker-'));
 const dest=path.join(temp,'functions');
 try{
  fs.mkdirSync(dest);
  for(const f of files)fs.copyFileSync(path.join(source,f),path.join(dest,f===spec.entry?'index.js':f));
  // Use the conventional index.js layout of the previously successful agent-mail worker.
  fs.copyFileSync(path.join(source,'package.json'),path.join(dest,'package.json'));
  fs.copyFileSync(path.join(source,'package-lock.json'),path.join(dest,'package-lock.json'));
  if(JSON.parse(fs.readFileSync(path.join(dest,'package.json'),'utf8')).main!=='index.js')throw Error('Unexpected package entrypoint.');
  const config=path.join(temp,'firebase.json');
  fs.writeFileSync(config,JSON.stringify({functions:[{source:'functions',codebase:spec.codebase,runtime:'nodejs22',ignore:['node_modules','.git','firebase-debug.log','firebase-debug.*.log','functions.yaml']}]}));
  return {temp,dest,config};
 }catch(e){fs.rmSync(temp,{recursive:true,force:true});throw e;}
}
function discover(stage,modules){
 // Run the installed SDK itself, not a hand-authored manifest. Its JSON
 // output is valid YAML and is the exact input Firebase CLI accepts.
 const sdk=path.join(modules,'firebase-functions','lib','bin','firebase-functions.js');
 if(!fs.existsSync(sdk))throw Error('Install the pinned service dependencies first.');
 const manifest=path.join(stage.dest,'functions.yaml');
 const env={...process.env,NODE_PATH:modules,GCLOUD_PROJECT:project,FIREBASE_CONFIG:JSON.stringify({projectId:project}),FUNCTIONS_MANIFEST_OUTPUT_PATH:manifest};
 delete env.FUNCTION_TARGET;delete env.K_SERVICE;delete env.FUNCTIONS_CONTROL_API;
 run(process.execPath,[sdk,stage.dest],stage.dest,env);
 const stack=JSON.parse(fs.readFileSync(manifest,'utf8'));
 const keys=Object.keys(stack.endpoints||{});
 if(stack.specVersion!=='v1alpha1'||keys.length!==1||keys[0]!==spec.fn)throw Error('SDK manifest must contain exactly '+spec.fn+'; discovered: '+keys.join(', '));
 const e=stack.endpoints[spec.fn],trigger=e.eventTrigger;
 const expectedPath=channel==='email'?'teyzaBusinessOutboundEmail/{id}':'teyzaBusinessOutboundWhatsApp/{id}';
 if(e.platform!=='gcfv2'||e.entryPoint!==spec.fn||trigger?.eventType!=='google.cloud.firestore.document.v1.created'||trigger.eventFilters?.database!=='(default)'||trigger.eventFilterPathPatterns?.document!==expectedPath||trigger.retry!==false||!Array.isArray(e.region)||e.region.length!==1||e.region[0]!=='us-central1')throw Error('Unexpected worker trigger manifest.');
 if(e.secretEnvironmentVariables?.length!==1||e.secretEnvironmentVariables[0].key!==spec.secret)throw Error('Unexpected worker secret binding.');
 console.log('SDK discovery verified: '+spec.fn+' | '+expectedPath+' | exactly one Gen 2 endpoint.');
}
async function main(){
 if(!discoveryOnly)await verifyDisabled();
 const stage=createStage();
 try{
  if(discoveryOnly){
   discover(stage,path.join(source,'node_modules'));
   console.log('Read-only SDK discovery passed. No production writes.');
   return;
  }
  // No build scripts, no dotenv, no credential material copied.
  if(process.platform==='win32')run('cmd.exe',['/d','/c','npm ci --omit=dev --ignore-scripts --no-audit --no-fund'],stage.dest);
  else run('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],stage.dest);
  discover(stage,path.join(stage.dest,'node_modules'));
  console.log('Deploying only '+spec.fn+'; selected channel remains disabled.');
  run(process.execPath,[cli,'deploy','--config',stage.config,'--only','functions:'+spec.codebase+':'+spec.fn,'--project',project,'--non-interactive'],stage.temp);
  console.log('Worker deployed. Do not enable direct sends until provider setup and authorized test verification.');
 }finally{fs.rmSync(stage.temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error('Isolated worker setup stopped: '+(typeof e.message==='string'&&/^(SDK manifest must contain exactly |Unexpected worker |Install the pinned|Unexpected package entrypoint|Isolated worker command failed|Cannot verify communication control|Disable the selected communication channel|Required provider secret)/.test(e.message)?e.message:'Configuration or provider metadata check failed.'));console.error('No enable action was performed.');process.exitCode=1;});
