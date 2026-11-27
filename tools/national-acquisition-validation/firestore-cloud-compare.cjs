'use strict';
// Existing 904-record synthetic staging dataset only. No writes, no reseed,
// no provider calls or deployment. Compare both sources at ONE fresh readTime.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{spawnSync}=require('node:child_process'),{createRequire}=require('node:module');
const projectId='teyza-national-staging',projectNumber='472628000220',databaseId='(default)';
const account='teyza-national-validator@teyza-national-staging.iam.gserviceaccount.com';
const [baselineDir,output]=process.argv.slice(2);
const candidateDir=path.resolve(__dirname,'../..');
assert(baselineDir&&path.isAbsolute(baselineDir)&&output&&path.isAbsolute(output)&&!fs.existsSync(output),'Explicit new audit path and baseline required');
const git=(dir,args)=>{const p=spawnSync('git',['-C',dir,...args],{encoding:'utf8',windowsHide:true});assert.equal(p.status,0,'Git inspection failed');return p.stdout.trim();};
const baseline=git(baselineDir,['rev-parse','HEAD']),candidate=git(candidateDir,['rev-parse','HEAD']);
assert.equal(baseline,'da9c198f81c1be743c12aca434df69ec2165440d','Unapproved baseline');
assert.equal(candidate,process.env.TEYZA_STAGING_COMPARISON_COMMIT,'Unapproved candidate');
for(const dir of [baselineDir,candidateDir])assert.equal(git(dir,['status','--porcelain','--untracked-files=no']),'','Tracked source modified');
assert.equal(process.env.TEYZA_STAGING_PROJECT_ID,projectId);assert.equal(process.env.TEYZA_STAGING_PROJECT_NUMBER,projectNumber);
for(const k of ['FIRESTORE_EMULATOR_HOST','FIRESTORE_HOST','FIREBASE_CONFIG','FIREBASE_TOKEN','GOOGLE_GHA_CREDS_PATH','TEYZA_STAGING_WRITE_APPROVAL'])assert(!process.env[k],'Unexpected environment override: '+k);
for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_QUOTA_PROJECT'])assert(!process.env[k]||process.env[k]===projectId,'Conflicting project environment');
const adc=process.env.GOOGLE_APPLICATION_CREDENTIALS;assert(adc&&path.isAbsolute(adc));
const cred=JSON.parse(fs.readFileSync(adc,'utf8'));assert.equal(cred.type,'impersonated_service_account');
const url=new URL(cred.service_account_impersonation_url);
assert.equal(url.origin,'https://iamcredentials.googleapis.com');assert.equal(decodeURIComponent(url.pathname),'/v1/projects/-/serviceAccounts/'+account+':generateAccessToken');assert(!url.search&&!url.hash&&!url.username&&!url.password&&!cred.delegates?.length);
assert(!cred.quota_project_id||cred.quota_project_id===projectId);assert(!cred.source_credentials?.quota_project_id||cred.source_credentials.quota_project_id===projectId);
const req=createRequire(path.join(candidateDir,'services/teyza-mobile-v39/package.json')),{Firestore}=req('@google-cloud/firestore');
const raw=new Firestore({projectId,databaseId,keyFilename:adc,host:'firestore.googleapis.com',ssl:true});
const forbidden=()=>{throw Error('Write or external action prohibited in read-only comparison');};
const db={doc:p=>raw.doc(p),collection:p=>raw.collection(p),runTransaction:(fn,options)=>{assert.equal(options?.readOnly,true,'Write transaction prohibited');return raw.runTransaction(fn,options);},batch:forbidden,bulkWriter:forbidden};
const make=dir=>require(path.join(dir,'services/teyza-mobile-v39/business-acquisition.js')).createAcquisition({db,geographyLookup:{resolve:forbidden,search:forbidden}});
const old=make(baselineDir),next=make(candidateDir),R=require('../../services/teyza-mobile-v39/acquisition-report'),G=require('../../services/teyza-mobile-v39/acquisition-geography'),S=require('../../services/teyza-mobile-v39/acquisition-summary');
const admin={uid:'synthetic-reviewer'},asOf=Math.floor(Date.now()/1000)*1000-1000;
const report={projectId,projectNumber,databaseId,account,baseline,candidate,node:process.version,asOf,mode:'read-only comparison',comparisons:[],summaryDryRun:null,queryPlans:[],passed:false,limitations:['Same snapshot correctness and Windows-to-cloud elapsed times, not deployed API/browser SLA.','Summary generated in memory only; persisted-summary cloud latency, write cost, scheduled refresh and retention need a separately approved staging materialization.']};
async function scan(api,filters){
 const start=performance.now(),counts=R.emptyCounts();let after=null,scanned=0,pages=0;const pageMs=[];
 do{
  const t=performance.now(),p=await api.execute(admin,'ops_acquisition_command_page',{filters,asOf,includeRows:pages===0,...(after?{after}:{})});
  assert.equal(p.schema,2);assert.equal(p.asOf,asOf);assert.equal(p.complete,p.next===null);assert(p.next!==after||p.next===null,'Repeated cursor');
  for(const group of ['funnel','queues'])for(const k of Object.keys(counts[group]))counts[group][k]+=p.counts[group][k];
  pageMs.push(Math.round(performance.now()-t));scanned+=p.scanned;pages++;assert(pages<100);after=p.next;
 }while(after);
 return {counts,scanned,pages,elapsedMs:Math.round(performance.now()-start),maxPageMs:Math.max(...pageMs)};
}
(async()=>{
 try{
  assert.equal(raw.projectId,projectId);
  const idx=G.provinces.indexOf('KwaZulu-Natal');
  const cases=[['national',{queue:'new_contact'},904],['geographic',{province:'KwaZulu-Natal',municipality:'Synthetic municipality '+idx,township:'Synthetic township '+idx,category:'spaza'},50],['official locality',{province:'KwaZulu-Natal',municipalityCode:'ETH',localityId:'ETH:123456789'},80]];
  for(const [label,filters,expected] of cases){
   const reference=await scan(old,filters),optimized=await scan(next,filters);
   assert.equal(reference.counts.funnel.discovered,expected,'Unexpected staging fixture count');
   assert.deepEqual(optimized.counts,reference.counts,'Snapshot parity failed: '+label);
   if(label==='national'){assert.equal(optimized.counts.funnel.paidSellers,1);assert.equal(optimized.counts.funnel.activeAdvertisers,0);assert.equal(optimized.counts.queues.new_contact,179);}
   report.comparisons.push({label,reference,optimized,parity:true});console.log(JSON.stringify(report.comparisons.at(-1)));
  }
  const t=performance.now(),generation=await next.collectReportingGeneration(asOf),buildElapsedMs=Math.round(performance.now()-t);
  assert.equal(generation.rows.size,904);assert.deepEqual(generation.aggregates.get(S.NATIONAL),report.comparisons[0].reference.counts);
  for(const [i,entry] of cases.entries()){
   const scope=S.scopeFor(R.parseFilters(entry[1]));assert(scope);
   assert.deepEqual(generation.aggregates.get(scope),report.comparisons[i].reference.counts);
  }
  report.summaryDryRun={prospects:generation.rows.size,scopes:generation.aggregates.size,pages:generation.pages,buildElapsedMs,parity:true,persisted:false};
  const q=[['province equality',raw.collection('teyzaBusinessProspects').where('province','==','KwaZulu-Natal').orderBy('__name__').limit(31)],['campaign owner IN',raw.collection('teyzaShopperAds').where('ownerUid','in',['s-paid','s-free']).orderBy('__name__').limit(101)]];
  for(const [label,query] of q){const {metrics}=await query.explain({analyze:true});assert(metrics?.planSummary&&metrics?.executionStats);report.queryPlans.push({label,planSummary:metrics.planSummary,executionStats:metrics.executionStats});}
  report.passed=true;
 }catch(e){report.error=String(e?.message||e);console.error(report.error);process.exitCode=1;}
 finally{fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report,null,2));await raw.terminate();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
