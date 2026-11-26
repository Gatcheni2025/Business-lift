'use strict';
// Stage only the isolated worker and its reviewed local module dependencies.
// Never upload the mobile .env, agent training manual, credentials or mobile entrypoint.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'services/teyza-mobile-v39');
const args=process.argv.slice(2),channel=args[0];
const options={
 email:{entry:'index.business-mail-only.js',codebase:'teyza-business-mail',fn:'teyzaBusinessEmail',secret:'TEYZA_BUSINESS_MAIL_ZOHO'},
 whatsapp:{entry:'index.business-whatsapp-only.js',codebase:'teyza-business-whatsapp',fn:'teyzaBusinessWhatsApp',secret:'TEYZA_WHATSAPP_ACCESS_TOKEN'}
};
if(!Object.hasOwn(options,channel)||args.length!==2||args[1]!=='--confirm-isolated-worker')throw Error('Use email or whatsapp and --confirm-isolated-worker. No production writes.');
const spec=options[channel],project='business-lift-3c19c';
const cli=path.join(__dirname,'node_modules/firebase-tools/lib/bin/firebase.js');
if(!fs.existsSync(cli))throw Error('Install pinned admin-release dependencies first.');
const files=new Set();
function collect(name){
 if(!/^[A-Za-z0-9_.-]+\.js$/.test(name)||name.includes('..')||name.endsWith('.test.js'))throw Error('Unexpected local dependency.');
 if(files.has(name))return;files.add(name);
 const data=fs.readFileSync(path.join(source,name),'utf8');
 for(const m of data.matchAll(/require\(['"]\.\/([A-Za-z0-9_.-]+)['"]\)/g))collect(m[1].endsWith('.js')?m[1]:m[1]+'.js');
}
collect(spec.entry);
function run(bin,argv,cwd=root){
 const result=spawnSync(bin,argv,{cwd,stdio:'inherit',windowsHide:false});
 if(result.error||result.status!==0)throw Error('Isolated worker command failed; inspect local output.');
}
async function main(){
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
 const temp=fs.mkdtempSync(path.join(root,'.teyza-communication-stage-')),config=path.join(root,path.basename(temp)+'.json');
 try{
  for(const f of files)fs.copyFileSync(path.join(source,f),path.join(temp,f));
  const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  fs.writeFileSync(path.join(temp,'package.json'),JSON.stringify({...pkg,main:spec.entry},null,2)+'\n');
  fs.copyFileSync(path.join(source,'package-lock.json'),path.join(temp,'package-lock.json'));
  fs.writeFileSync(config,JSON.stringify({functions:[{source:path.basename(temp),codebase:spec.codebase,runtime:'nodejs22'}]}));
  // npm.cmd is invoked via a fixed Windows command only; no user-provided shell arguments.
  if(process.platform==='win32')run('cmd.exe',['/d','/c','npm ci --omit=dev'],temp);
  else run('npm',['ci','--omit=dev'],temp);
  console.log('Deploying only '+spec.fn+'; selected channel remains disabled.');
  run(process.execPath,[cli,'deploy','--config',config,'--only','functions:'+spec.codebase+':'+spec.fn,'--project',project,'--non-interactive']);
  console.log('Worker deployed. Do not enable direct sends until provider setup and authorized test verification.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(config,{force:true});}
}
main().catch(()=>{console.error('Isolated worker setup stopped. No enable action was performed.');process.exitCode=1;});
