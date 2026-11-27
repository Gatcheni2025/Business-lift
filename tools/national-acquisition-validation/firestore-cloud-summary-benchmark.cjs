'use strict';
// One approved staging-only generation. Never deploy or mutate source fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{spawnSync}=require('node:child_process'),{createRequire}=require('node:module');
const projectId='teyza-national-staging',projectNumber='472628000220',databaseId='(default)';
const account='teyza-national-validator@teyza-national-staging.iam.gserviceaccount.com';
const [comparisonPath,output]=process.argv.slice(2);
const candidateDir=path.resolve(__dirname,'../..');
assert(comparisonPath&&path.isAbsolute(comparisonPath)&&output&&path.isAbsolute(output)&&!fs.existsSync(output),'Explicit comparison report and new audit path required');
const git=(dir,args)=>{const p=spawnSync('git',['-C',dir,...args],{encoding:'utf8',windowsHide:true});assert.equal(p.status,0,'Git inspection failed');return p.stdout.trim();};
const candidate=git(candidateDir,['rev-parse','HEAD']);
const release='2473a220378321a813839f3cfd0c3d37ad9711da';
assert.equal(candidate,process.env.TEYZA_STAGING_SUMMARY_COMMIT,'Unapproved audit commit');
assert.equal(git(candidateDir,['rev-parse','HEAD^']),release,'Unexpected release parent');
assert.equal(git(candidateDir,['status','--porcelain','--untracked-files=no']),'','Tracked source modified');
assert.equal(git(candidateDir,['diff','--name-only',release,'HEAD']),'tools/national-acquisition-validation/firestore-cloud-summary-benchmark.cjs','Audit branch must only add this harness');
assert.equal(process.version,'v24.20.0','Use the verified local Node runtime');
assert.equal(process.env.TEYZA_STAGING_SUMMARY_APPROVAL,'PUBLISH-ONE-STAGING-SUMMARY-1182','Explicit scoped approval required');
const prior=JSON.parse(fs.readFileSync(comparisonPath,'utf8'));
assert.equal(prior.passed,true);assert.equal(prior.projectId,projectId);assert.equal(prior.projectNumber,projectNumber);assert.equal(prior.databaseId,databaseId);assert.equal(prior.account,account);assert.equal(prior.candidate,release);assert.equal(prior.baseline,'da9c198f81c1be743c12aca434df69ec2165440d');assert.equal(prior.mode,'read-only comparison');
assert.equal(prior.summaryDryRun.prospects,904);assert.equal(prior.summaryDryRun.scopes,276);assert.equal(prior.summaryDryRun.parity,true);assert.equal(prior.summaryDryRun.persisted,false);assert.equal(prior.comparisons.length,3);assert(prior.comparisons.every(x=>x.parity===true));
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
const forbidden=()=>{throw Error('Unapproved write or external action');};
const R=require('../../services/teyza-mobile-v39/acquisition-report'),G=require('../../services/teyza-mobile-v39/acquisition-geography'),S=require('../../services/teyza-mobile-v39/acquisition-summary');
const {createAcquisition}=require('../../services/teyza-mobile-v39/business-acquisition');
const readDb={doc:p=>raw.doc(p),collection:p=>raw.collection(p),runTransaction:(fn,opt)=>{assert.equal(opt?.readOnly,true,'Write transaction forbidden on reporting path');return raw.runTransaction(fn,opt);},batch:forbidden,bulkWriter:forbidden};
const api=createAcquisition({db:readDb,geographyLookup:{resolve:forbidden,search:forbidden}});
const admin={uid:'synthetic-reviewer'};
const expectedRows=904,expectedScopes=276,maxWrites=1182;
const report={projectId,projectNumber,databaseId,account,candidate,release,node:process.version,mode:'single staging summary generation',passed:false,targetMet:false,approvedMaxWrites:maxWrites,confirmedWrites:0,checks:[],timings:[],queryPlans:[],manifest:null,limitations:['Local Windows-to-cloud SDK timings; not deployed browser or API end-to-end latency.','One complete reporting generation only, no automatic refresh or retention.','Expiry simulated by the summary reader clock; the database clock is not changed.','Usage totals must be reviewed in staging billing/quota dashboard.','An interrupted write may be committed despite an error; do not retry or delete partial state.']};
function check(label,value){report.checks.push({label,passed:Boolean(value)});assert(value,label);}
function elapsed(t){return Math.round(performance.now()-t);}
function safeGenerationWriter(generation){
 const pendingRows=new Set(generation.rows.keys()),pendingScopes=new Set(generation.aggregates.keys());
 let gen=null,finished=false,inFlight=false;
 function pathParts(ref){
  const parts=ref.path.split('/');
  assert.equal(parts[0],S.ROOT,'Only generation documents may be created');
  assert(/^[a-f0-9-]{36}$/.test(parts[1]),'Invalid generation ID');
  if(gen===null)gen=parts[1];
  assert.equal(parts[1],gen,'Only one generation allowed');
  return parts;
 }
 function reserve(ref,value,local){
  const parts=pathParts(ref);
  assert.equal(parts.length,4,'Only summary row/scope creation allowed');
  const set=parts[2]==='rows'?pendingRows:parts[2]==='scopes'?pendingScopes:null;
  const values=parts[2]==='rows'?generation.rows:generation.aggregates;
  assert(set&&set.has(parts[3]),'Unexpected or duplicate summary document');
  const expected=parts[2]==='rows'?values.get(parts[3]):{counts:values.get(parts[3])};
  assert.deepEqual(value,expected,'Unexpected summary content');
  assert(!local.some(x=>x.ref.path===ref.path),'Duplicate batch write');
  assert(report.confirmedWrites+local.length+1<=maxWrites-2,'Approved write limit exceeded');
  local.push({ref,value,set,id:parts[3]});
 }
 return {doc:p=>raw.doc(p),batch:()=>{
  assert(!finished&&!inFlight,'Unexpected batch state');
  const b=raw.batch(),local=[];
  return {create:(ref,v)=>{reserve(ref,v,local);b.create(ref,v);},commit:async()=>{
   assert(local.length>0&&local.length<=200&&!inFlight&&!finished,'Invalid batch');
   inFlight=true;try{await b.commit();for(const item of local)item.set.delete(item.id);report.confirmedWrites+=local.length;console.log('Confirmed summary document writes: '+report.confirmedWrites+' / '+maxWrites);}finally{inFlight=false;}
  }};
 },runTransaction:async(fn,opt)=>{
  assert(!opt&&!finished&&!inFlight&&pendingRows.size===0&&pendingScopes.size===0&&report.confirmedWrites===maxWrites-2,'Cannot publish incomplete generation');
  const result=await raw.runTransaction(async tx=>{
   let checked=false,created=false,pointed=false,manifestValue=null;
   const result=await fn({get:async ref=>{assert.equal(ref.path,S.CONTROL);const prior=await tx.get(ref);assert(!prior.exists,'Existing pointer: do not overwrite');checked=true;return prior;},
    create:(ref,value)=>{assert(checked&&!created);assert.deepEqual(pathParts(ref),[S.ROOT,gen]);assert.equal(value.generation,gen);assert.equal(value.asOf,generation.asOf);assert.equal(value.prospectCount,expectedRows);assert.equal(value.scopeCount,expectedScopes);manifestValue=value;created=true;tx.create(ref,value);},
    set:(ref,value)=>{assert(checked&&created&&!pointed);assert.equal(ref.path,S.CONTROL);assert.deepEqual(value,manifestValue);pointed=true;tx.create(ref,value);}});
   assert(checked&&created&&pointed,'Incomplete publication transaction');return result;
  });
  report.confirmedWrites+=2;finished=true;return result;
 },bulkWriter:forbidden};
}
async function exact(filters,asOf){
 const counts=R.emptyCounts();let after=null,pages=0,scanned=0;const seen=new Set(),start=performance.now();
 do{
  const p=await api.execute(admin,'ops_acquisition_command_page',{filters,asOf,includeRows:false,...(after?{after}:{})});
  assert.equal(p.schema,2);assert.equal(p.asOf,asOf);assert.equal(p.complete,p.next===null);
  for(const g of ['funnel','queues'])for(const k of Object.keys(counts[g]))counts[g][k]+=p.counts[g][k];
  pages++;scanned+=p.scanned;after=p.next;assert(!after||!seen.has(after));if(after)seen.add(after);assert(pages<100);
 }while(after);
 return {counts,pages,scanned,elapsedMs:elapsed(start)};
}
function expectedIds(generation,filters){
 const scope=S.scopeFor(R.parseFilters(filters));assert(scope);
 const k=S.lookup(scope,filters.queue||'');
 return [...generation.rows].filter(([,row])=>row.lookupKeys.includes(k)).map(([id])=>id).sort();
}
async function summary(generation,manifest,filters,label,repeat=1){
 const scope=S.scopeFor(R.parseFilters(filters)),ids=expectedIds(generation,filters);
 const want=generation.aggregates.get(scope)||R.emptyCounts();
 let first=null;
 for(let i=0;i<repeat;i++){
  const start=performance.now(),p=await api.execute(admin,'ops_acquisition_command_page',{preferSummary:true,filters});
  const ms=elapsed(start);report.timings.push({label,attempt:i+1,elapsedMs:ms,rows:p.prospects?.length??null});
  assert.equal(p.summarySchema,1,'Summary fell back to exact report');assert.equal(p.summaryGeneration,manifest.generation);assert.equal(p.asOf,manifest.asOf);
  assert.deepEqual(p.counts,want);assert.deepEqual(p.prospects.map(x=>x.id),ids.slice(0,30));assert.equal(p.next,ids.length>30?ids[29]:null);
  for(const pRow of p.prospects){assert.equal(pRow.snapshotOnly,true);assert(!Object.hasOwn(pRow,'phone')&&!Object.hasOwn(pRow,'email')&&!Object.hasOwn(pRow,'permissions')&&!Object.hasOwn(pRow,'outbound'),'Unexpected sensitive contact data');assert.deepEqual(pRow,generation.rows.get(pRow.id).display);}
  if(i===0)first=p;
 }
 check(label+' count, queue membership, redaction and generation parity',true);
 return {first,ids,want};
}
(async()=>{
 try{
  assert.equal(raw.projectId,projectId);
  const collectionNames=(await raw.listCollections()).map(x=>x.id).sort();
  // These are the only collections seeded by the approved synthetic fixture.
  const allowed=['teyzaBusinessProspects','teyzaBusinessProspectSellerLinks','teyzaSellerAccounts','teyzaMobileVerification','teyzaSellerIdentity','teyzaPublicShops','teyzaBilling','teyzaShopperAds','teyzaAdPayments'].sort();
  check('Only expected synthetic top-level collections',JSON.stringify(collectionNames)===JSON.stringify(allowed));
  check('No previous summary generations or pointers',(await raw.collection(S.ROOT).listDocuments()).length===0&&(await raw.collection(S.CONTROL.split('/')[0]).listDocuments()).length===0);
  const asOf=Math.floor(Date.now()/1000)*1000-1000;report.asOf=asOf;
  const idx=G.provinces.indexOf('KwaZulu-Natal');
  const cases=[['national',{queue:'new_contact'},904],['geographic',{province:'KwaZulu-Natal',municipality:'Synthetic municipality '+idx,township:'Synthetic township '+idx,category:'spaza'},50],['official locality',{province:'KwaZulu-Natal',municipalityCode:'ETH',localityId:'ETH:123456789'},80]];
  const start=performance.now(),generation=await api.collectReportingGeneration(asOf);
  report.buildElapsedMs=elapsed(start);
  check('Expected prospect and scope counts',generation.rows.size===expectedRows&&generation.aggregates.size===expectedScopes);
  const ids=[...Array.from({length:900},(_,i)=>'p'+String(i).padStart(4,'0')),'z-paid','z-free','z-pending','zz-new'].sort();
  check('Exactly the original 904 synthetic prospect IDs',JSON.stringify([...generation.rows.keys()].sort())===JSON.stringify(ids));
  report.exactReferences=[];
  for(const [label,filters,n] of cases){
   const reference=await exact(filters,asOf);
   check(label+' fresh exact report parity',reference.counts.funnel.discovered===n&&require('node:util').isDeepStrictEqual(reference.counts,generation.aggregates.get(S.scopeFor(R.parseFilters(filters)))));
   report.exactReferences.push({label,...reference});
  }
  check('Generation still within freshness window',S.fresh(asOf,Date.now()));
  check('No existing pointer immediately before publication',!(await raw.doc(S.CONTROL).get()).exists);
  console.log('Publishing exactly '+maxWrites+' new summary-only documents. No existing prospect changes.');
  const pubStart=performance.now();
  report.manifest=await S.publishGeneration({db:safeGenerationWriter(generation),generation});
  report.publishElapsedMs=elapsed(pubStart);
  const manifest=report.manifest;
  check('Exactly 1182 confirmed summary writes',report.confirmedWrites===maxWrites);
  const national=await summary(generation,manifest,cases[0][1],'national dashboard',3);
  const moreStart=performance.now(),more=await api.execute(admin,'ops_acquisition_command_page',{preferSummary:true,summaryGeneration:manifest.generation,asOf:manifest.asOf,after:national.first.next,filters:national.first.filters});
  report.timings.push({label:'national next page',attempt:1,elapsedMs:elapsed(moreStart),rows:more.prospects?.length??null});
  check('Indexed continuation uses same snapshot and correct next 30 IDs',more.summarySchema===1&&more.summaryGeneration===manifest.generation&&more.asOf===manifest.asOf&&require('node:util').isDeepStrictEqual(more.counts,national.want)&&require('node:util').isDeepStrictEqual(more.prospects.map(x=>x.id),national.ids.slice(30,60)));
  await summary(generation,manifest,cases[1][1],'geographic dashboard',3);
  await summary(generation,manifest,cases[2][1],'official locality dashboard',3);
  for(const q of ['field_visit','awaiting_response','pending_approval','paying','blocked'])await summary(generation,manifest,{queue:q},q);
  await summary(generation,manifest,{province:'Limpopo',queue:'new_contact'},'Limpopo new contacts');
  const t=performance.now(),{metrics}=await raw.collection(S.ROOT+'/'+manifest.generation+'/rows').where('lookupKeys','array-contains',S.lookup(S.NATIONAL,'new_contact')).orderBy('__name__').limit(31).explain({analyze:true});
  assert(metrics?.planSummary&&metrics?.executionStats);
  report.queryPlans.push({label:'summary lookupKeys array membership and document-ID order',elapsedMs:elapsed(t),planSummary:metrics.planSummary,executionStats:metrics.executionStats});
  const expiredClock=()=>asOf+S.MAX_AGE+1;
  check('Expired summary cannot serve a first page',(await S.readSummaryPage({db:readDb,data:{filters:cases[0][1]},clock:expiredClock}))===null);
  await assert.rejects(S.readSummaryPage({db:readDb,data:{filters:cases[0][1],summaryGeneration:manifest.generation,asOf,after:national.first.next},clock:expiredClock}),e=>e.status===409);
  check('Expired continuation returns conflict',true);
  check('Post-mutation summaryAfter barrier rejects older summary',(await S.readSummaryPage({db:readDb,data:{filters:cases[0][1],summaryAfter:asOf}}))===null);
  check('Unsupported free-text search uses exact path',(await S.readSummaryPage({db:readDb,data:{filters:{search:'Synthetic'}}}))===null);
  check('Published pointer unchanged',require('node:util').isDeepStrictEqual((await raw.doc(S.CONTROL).get()).data(),manifest));
  const finalCount=(await raw.collection('teyzaBusinessProspects').count().get()).data().count;
  check('Existing 904 prospect records preserved',finalCount===904);
  const dashboard=report.timings.filter(x=>x.label.endsWith('dashboard'));
  report.targetMet=dashboard.length===9&&dashboard.every(x=>x.elapsedMs<=3000);
  report.passed=true;
 }catch(e){report.error=String(e?.message||e);console.error(report.error);process.exitCode=1;}
 finally{fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report,null,2));await raw.terminate();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
