'use strict';
// Final bounded staging-only incremental benchmark. No deployment or outbound actions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{spawnSync}=require('node:child_process'),{createRequire}=require('node:module');
const projectId='teyza-national-staging',projectNumber='472628000220',databaseId='(default)';
const account='teyza-national-validator@teyza-national-staging.iam.gserviceaccount.com';
const [benchmarkPath,output]=process.argv.slice(2);
const candidateDir=path.resolve(__dirname,'../..');
assert(benchmarkPath&&path.isAbsolute(benchmarkPath)&&output&&path.isAbsolute(output)&&!fs.existsSync(output),'Explicit original benchmark report and new audit path required');
const git=(dir,args)=>{const p=spawnSync('git',['-C',dir,...args],{encoding:'utf8',windowsHide:true});assert.equal(p.status,0,'Git inspection failed');return p.stdout.trim();};
const candidate=git(candidateDir,['rev-parse','HEAD']);
const release='0f990f94b9331e40e6d1938ec9d6e3d0634a415a';
assert.equal(candidate,process.env.TEYZA_STAGING_INCREMENTAL_COMMIT,'Unapproved audit commit');
assert.equal(git(candidateDir,['rev-parse','HEAD^']),release,'Unexpected release parent');
assert.equal(git(candidateDir,['status','--porcelain','--untracked-files=no']),'','Tracked source modified');
assert.equal(git(candidateDir,['diff','--name-only',release,'HEAD']),'tools/national-acquisition-validation/firestore-cloud-incremental-final.cjs','Audit branch must only add this harness');
assert.equal(process.version,'v24.20.0','Use the verified local Node runtime');
assert.equal(process.env.TEYZA_STAGING_INCREMENTAL_APPROVAL,'APPROVE-STAGING-1400','Explicit scoped approval required');
const prior=JSON.parse(fs.readFileSync(benchmarkPath,'utf8'));
assert.equal(prior.passed,true);assert.equal(prior.targetMet,true);assert.equal(prior.projectId,projectId);assert.equal(prior.projectNumber,projectNumber);assert.equal(prior.databaseId,databaseId);assert.equal(prior.account,account);assert.equal(prior.candidate,'c93f5ea35aa6b58f54765ad27e0dbff00b227960');assert.equal(prior.release,'2473a220378321a813839f3cfd0c3d37ad9711da');assert.equal(prior.confirmedWrites,1182);assert.equal(prior.manifest.prospectCount,904);assert.equal(prior.manifest.scopeCount,276);assert.equal(prior.mode,'single staging summary generation');
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
const F=require('../../services/teyza-mobile-v39/acquisition-refresh');
const {FieldValue}=req('@google-cloud/firestore');
const eq=require('node:util').isDeepStrictEqual;
const report={projectId,projectNumber,databaseId,account,release,candidate,mode:'bounded staging incremental benchmark',passed:false,checks:[],cycles:[],timings:[],maxOperations:1400,confirmedSummaryOperations:0,confirmedFixtureOperations:0,sourceRestored:null,limitations:['SDK timings from local Windows, not full browser/deployed API latency.','Exact scans still read all authoritative prospects and related evidence.','Only one new managed generation; retention disabled. The original unmanaged benchmark stays intact.','On uncertain failure, preserve reports and inspect state; never retry automatically.']};
const fixturePath='teyzaBusinessProspects/p0000',fixture=raw.doc(fixturePath);
const cap=1400;
let managedId=null,original=null,temporary=null,mutationAttempted=false,restored=false;
function check(label,value){report.checks.push({label,passed:Boolean(value)});assert(value,label);}
function confirmLimit(n){assert(report.confirmedSummaryOperations+report.confirmedFixtureOperations+n<=cap,'Approved operation ceiling exceeded');}
function allow(ref,kind){
 const p=ref.path;
 if([S.CONTROL,F.LEASE,F.FULL_ATTEMPT].includes(p)){
  assert(kind!=='delete'||p===F.LEASE,'Only the transient lease may be deleted');
  return;
 }
 const parts=p.split('/');
 assert(parts[0]===S.ROOT&&/^[a-f0-9-]{36}$/.test(parts[1])&&parts[1]!==prior.manifest.generation,'Original or unexpected generation write prohibited');
 assert(kind!=='delete','Reporting-document deletions prohibited in this benchmark');
 if(!managedId)managedId=parts[1];
 assert.equal(parts[1],managedId,'Only one new generation allowed');
 assert(parts.length===2||parts.length===4&&(['rows','scopes'].includes(parts[2])||parts[2]==='maintenance'&&parts[3]==='state'),'Unexpected generation write path');
}
const writer={doc:p=>raw.doc(p),collection:p=>raw.collection(p),runTransaction:async(fn,opt)=>{
 if(opt?.readOnly===true)return raw.runTransaction(fn,opt);
 assert(!opt,'Unexpected transaction options');
 let committed=0;
 const result=await raw.runTransaction(async tx=>{
  let count=0;
  function reserve(ref,kind){allow(ref,kind);confirmLimit(++count+2);}
  const result=await fn({get:ref=>tx.get(ref),
   create:(ref,v)=>{reserve(ref,'create');tx.create(ref,v);},
   set:(ref,v)=>{reserve(ref,'set');tx.set(ref,v);},
   update:(ref,v)=>{reserve(ref,'update');tx.update(ref,v);},
   delete:ref=>{reserve(ref,'delete');tx.delete(ref);}});
  committed=count;return result;
 });
 report.confirmedSummaryOperations+=committed;
 return result;
},batch:forbidden,bulkWriter:forbidden};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ids=[...Array.from({length:900},(_,i)=>'p'+String(i).padStart(4,'0')),'z-paid','z-free','z-pending','zz-new'].sort();
async function cycle(label){
 let generation=null,buildMs=null;
 const start=performance.now(),result=await F.refresh({db:writer,retention:false,collect:async asOf=>{
  const t=performance.now();generation=await api.collectReportingGeneration(asOf);buildMs=Math.round(performance.now()-t);
  assert.deepEqual([...generation.rows.keys()].sort(),ids,'Unexpected synthetic fixture IDs');
  assert.equal(generation.aggregates.size,276,'Unexpected reporting scope count');return generation;
 }});
 assert(generation&&['full','delta'].includes(result.kind),'Expected completed reconciliation');
 assert.equal(result.manifest.generation,managedId);
 report.cycles.push({label,kind:result.kind,summaryWrites:result.summaryWrites,rowWrites:result.rowWrites,scopeWrites:result.scopeWrites,buildMs,totalMs:Math.round(performance.now()-start),asOf:result.manifest.asOf,completedAt:result.manifest.completedAt,freshnessRemainingMs:result.manifest.asOf+S.MAX_AGE-result.manifest.completedAt,counts:generation.aggregates.get(S.NATIONAL)});
 const idx=G.provinces.indexOf('KwaZulu-Natal');
 const queries=[['national',{queue:'new_contact'}],['ready to contact',{queue:'ready_to_contact'}],['geographic',{province:'KwaZulu-Natal',municipality:'Synthetic municipality '+idx,township:'Synthetic township '+idx,category:'spaza'}]];
 let first=null;
 for(const [name,filters] of queries){
  const t=performance.now(),p=await api.execute(admin,'ops_acquisition_command_page',{preferSummary:true,filters});
  report.timings.push({cycle:label,query:name,elapsedMs:Math.round(performance.now()-t)});
  const scope=S.scopeFor(R.parseFilters(filters)),expected=generation.aggregates.get(scope)||R.emptyCounts();
  const key=S.lookup(scope,filters.queue||''),wanted=[...generation.rows].filter(([,r])=>r.lookupKeys.includes(key)).map(([id])=>id).sort();
  assert.equal(p.summaryGeneration,result.manifest.generation);assert.equal(p.asOf,result.manifest.asOf);
  assert.deepEqual(p.counts,expected);assert.deepEqual(p.prospects.map(x=>x.id),wanted.slice(0,30));assert.equal(p.next,wanted.length>30?wanted[29]:null);
  assert(p.prospects.every(x=>x.snapshotOnly===true&&!Object.hasOwn(x,'phone')&&!Object.hasOwn(x,'email')));
  if(!first)first=p;
 }
 check(label+' exact count and indexed queue parity',true);
 console.log(JSON.stringify(report.cycles.at(-1)));
 return {result,generation,first};
}
async function changeFixture(){
 const snap=await fixture.get();assert(snap.exists);
 original=snap.data();assert.equal(original.name,'Synthetic business 0');assert.equal(original.email,'synthetic-0@example.test');assert.equal(original.historyVersion,1);assert.equal(original.stage,'identified');assert(!original.optedOut&&!original.contactedAt&&!original.response&&!original.nextFollowUpAt);assert.equal(original.permissions?.email?.granted,true);
 const tomorrow=(Math.floor((Date.now()+7200000)/86400000)+1)*86400000-7200000;
 temporary={...original,nextFollowUpAt:tomorrow+12*3600000};
 // Record a non-sensitive fixture rollback recipe before changing it. Only the
 // one follow-up field may be changed; never overwrite other source fields.
 report.fixtureRecovery={path:fixturePath,field:'nextFollowUpAt',originalPresent:Object.hasOwn(original,'nextFollowUpAt'),originalValue:original.nextFollowUpAt??null,temporaryValue:temporary.nextFollowUpAt};
 fs.writeFileSync(output+'.fixture-recovery.json',JSON.stringify(report.fixtureRecovery,null,2),{flag:'wx'});
 mutationAttempted=true;
 await raw.runTransaction(async tx=>{
  const live=await tx.get(fixture);assert(live.exists&&eq(live.data(),original),'Fixture changed concurrently');
  confirmLimit(1);tx.update(fixture,{nextFollowUpAt:temporary.nextFollowUpAt});
 });
 report.confirmedFixtureOperations++;
}
async function restore(){
 if(!mutationAttempted||restored)return;
 let wrote=false;
 await raw.runTransaction(async tx=>{
  wrote=false;const live=await tx.get(fixture);assert(live.exists,'Fixture missing during restoration');
  if(eq(live.data(),original))return;
  assert(eq(live.data(),temporary),'Unexpected concurrent fixture change; manual restoration review required');
  confirmLimit(1);
  tx.update(fixture,{nextFollowUpAt:Object.hasOwn(original,'nextFollowUpAt')?original.nextFollowUpAt:FieldValue.delete()});wrote=true;
 });
 if(wrote)report.confirmedFixtureOperations++;
 restored=eq((await fixture.get()).data(),original);report.sourceRestored=restored;assert(restored,'Fixture restoration not verified');
}
(async()=>{
 try{
  assert.equal(raw.projectId,projectId);
  const pointer=(await raw.doc(S.CONTROL).get()).data();
  check('Original unmanaged benchmark pointer unchanged',eq(pointer,prior.manifest)&&pointer.managed!==true);
  const manifests=await raw.collection(S.ROOT).listDocuments();
  check('Only original benchmark generation exists',manifests.length===1&&manifests[0].id===prior.manifest.generation);
  check('No managed worker lease or full-build attempt exists',!(await raw.doc(F.LEASE).get()).exists&&!(await raw.doc(F.FULL_ATTEMPT).get()).exists);
  const initial=await cycle('initial managed publication');
  check('Single managed generation with 1185 summary writes',initial.result.kind==='full'&&initial.result.summaryWrites===1185);
  await delay(2200);
  const noop=await cycle('unchanged refresh');
  check('Unchanged refresh requires exactly three summary-state writes',noop.result.kind==='delta'&&noop.result.summaryWrites===3&&noop.result.rowWrites===0&&noop.result.scopeWrites===0&&eq(noop.generation.aggregates.get(S.NATIONAL),initial.generation.aggregates.get(S.NATIONAL)));
  await assert.rejects(api.execute(admin,'ops_acquisition_command_page',{preferSummary:true,summaryGeneration:initial.first.summaryGeneration,asOf:initial.first.asOf,after:initial.first.next,filters:initial.first.filters}),e=>e.status===409);
  check('Old version continuation rejected',true);
  // The live fixture mutation is the one expressly approved staging-only edit.
  await changeFixture();await delay(2200);
  const changed=await cycle('one synthetic follow-up changed');
  const base=noop.generation.aggregates.get(S.NATIONAL),modified=changed.generation.aggregates.get(S.NATIONAL);
  check('Single-row delta and correct ready-to-contact count',changed.result.kind==='delta'&&changed.result.rowWrites===1&&modified.queues.ready_to_contact===base.queues.ready_to_contact-1&&modified.queues.new_contact===base.queues.new_contact&&modified.funnel.discovered===904);
  await restore();await delay(2200);
  const final=await cycle('original fixture restored');
  check('Restoration reconciled exactly',final.result.kind==='delta'&&final.result.rowWrites===1&&eq(final.generation.aggregates.get(S.NATIONAL),base)&&F.fingerprint(final.generation).fingerprintHash===F.fingerprint(noop.generation).fingerprintHash);
  check('Complete persisted fingerprint audit',await F.auditPrior(raw,final.result.manifest,Date.now));
  check('Original benchmark manifest preserved',eq((await raw.doc(S.ROOT+'/'+prior.manifest.generation).get()).data(),prior.manifest));
  check('904 original prospects preserved and temporary change restored',(await raw.collection('teyzaBusinessProspects').count().get()).data().count===904&&restored);
  const q=raw.collection(S.ROOT).where('managed','==',true).orderBy('__name__').limit(10);
  const {metrics}=await q.explain({analyze:true});assert(metrics?.planSummary&&metrics?.executionStats);
  report.retentionQueryPlan={planSummary:metrics.planSummary,executionStats:metrics.executionStats};
  report.targetMet=report.timings.length===12&&report.timings.every(x=>x.elapsedMs<=3000);
  report.passed=true;
 }catch(e){report.error=String(e?.message||e);console.error(report.error);process.exitCode=1;}
 finally{
  if(mutationAttempted&&!restored)try{await restore();}catch(e){report.restoreError=String(e?.message||e);report.sourceRestored=false;process.exitCode=1;}
  fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report,null,2));await raw.terminate();
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
