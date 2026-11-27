'use strict';
// Explicitly approved staging project only. No CLI fallback, no user ADC,
// no service account private key, no deployed code or provider calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks'),{createRequire}=require('node:module');
const projectId='teyza-national-staging',projectNumber='472628000220',databaseId='(default)';
const account='teyza-national-validator@teyza-national-staging.iam.gserviceaccount.com';
const host='firestore.googleapis.com',mode=process.argv[2];
assert(['--preflight','--run'].includes(mode),'Explicit --preflight or --run required');
assert.equal(process.env.TEYZA_STAGING_PROJECT_ID,projectId,'Exact approved staging project required');
assert.equal(process.env.TEYZA_STAGING_PROJECT_NUMBER,projectNumber,'Exact approved staging project number required');
for(const k of ['FIRESTORE_EMULATOR_HOST','FIRESTORE_HOST','FIREBASE_CONFIG','FIREBASE_TOKEN','GOOGLE_GHA_CREDS_PATH'])
 assert(!process.env[k],'Unexpected environment override: '+k);
for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_QUOTA_PROJECT'])
 assert(!process.env[k]||process.env[k]===projectId,'Conflicting project environment: '+k);
const adc=process.env.GOOGLE_APPLICATION_CREDENTIALS;
assert(adc&&path.isAbsolute(adc),'Explicit local staging impersonation ADC file required');
const credential=JSON.parse(fs.readFileSync(adc,'utf8'));
assert.equal(credential.type,'impersonated_service_account','User ADC and private key credentials forbidden');
const impersonation=new URL(credential.service_account_impersonation_url);
assert.equal(impersonation.origin,'https://iamcredentials.googleapis.com','Unexpected token issuer');
assert.equal(decodeURIComponent(impersonation.pathname),'/v1/projects/-/serviceAccounts/'+account+':generateAccessToken','Incorrect impersonated service account');
assert(!impersonation.search&&!impersonation.hash&&!impersonation.username&&!impersonation.password,'Unexpected token endpoint');
assert(!credential.delegates?.length,'Delegated impersonation not permitted');
assert(!credential.quota_project_id||credential.quota_project_id===projectId,'Incorrect quota project');
assert(!credential.source_credentials?.quota_project_id||credential.source_credentials.quota_project_id===projectId,'Incorrect source quota project');
if(mode==='--run')assert.equal(process.env.TEYZA_STAGING_WRITE_APPROVAL,'SEED-903-SYNTHETIC-ONLY','Explicit synthetic write approval required');
const req=createRequire(path.resolve(__dirname,'../../services/teyza-mobile-v39/package.json'));
const {Firestore}=req('@google-cloud/firestore');
const {createAcquisition}=require('../../services/teyza-mobile-v39/business-acquisition');
const G=require('../../services/teyza-mobile-v39/acquisition-geography');
const db=new Firestore({projectId,databaseId,keyFilename:adc,host,ssl:true});
const api=createAcquisition({db,geographyLookup:{resolve:async()=>{throw Error('External geography forbidden in cloud validation');},search:async()=>{throw Error('External geography forbidden in cloud validation');}}});
const output=process.argv[3];assert(output&&path.isAbsolute(output),'Absolute audit output path required');assert(!fs.existsSync(output),'Do not overwrite an existing audit report');
const root='teyzaBusinessProspects',admin={uid:'synthetic-reviewer'};
const delay=ms=>new Promise(r=>setTimeout(r,ms)),stamp=Date.now()-60000;
const base={name:'Synthetic business',city:'Synthetic city',area:'Synthetic area',address:'Synthetic address',category:'spaza',phone:'',email:'',stage:'identified',permissions:{},optedOut:false,historyVersion:1,revision:0,assignedTo:'synthetic-reviewer',createdAt:stamp,lastActivityAt:stamp,updatedAt:stamp};
let seeded=0;
const records=[];
function put(p,v){records.push([p,v]);}
const id=i=>'p'+String(i).padStart(4,'0');
const provinceRows=100,N=G.provinces.length*provinceRows;
for(let i=0;i<N;i++){
 const n=Math.floor(i/provinceRows),province=G.provinces[n],k=i%5;
 const row={...base,name:'Synthetic business '+i,province,municipality:'Synthetic municipality '+n,township:'Synthetic township '+n,area:'Synthetic township '+n,category:i%2?'retail':'spaza',email:k===1?'':'synthetic-'+i+'@example.test',permissions:k===0?{email:{granted:true}}:{},optedOut:k===4,historyVersion:k===2?0:1};
 if(k===3){row.response='interested';row.downloadConfirmedAt=stamp;}
 // Legacy pilot records have no explicit province and retain original city.
 if(k===2&&['Gauteng','KwaZulu-Natal'].includes(province)){row.city=province==='Gauteng'?'Johannesburg':'Durban';delete row.province;}
 // Synthetic locality IDs test the real equality-query path, not real geography.
 if(province==='KwaZulu-Natal'&&k!==2){Object.assign(row,{localityId:'ETH:123456789',municipalityCode:'ETH',townshipCode:'123456789',geographySource:G.SOURCE,geographySourceVintage:G.VINTAGE});}
 put(root+'/'+id(i),row);
 if(k===2)put(root+'/'+id(i)+'/events/older-contact',{type:'contact',channel:'email',createdAt:stamp});
}
for(let i=0;i<105;i++)put(root+'/p0002/events/event'+String(i).padStart(3,'0'),{type:'contact',channel:'email',createdAt:stamp+i});
function seller(p,uid,kind){
 const name='Synthetic seller '+kind;
 put(root+'/'+p,{...base,name,province:'KwaZulu-Natal',municipality:'Synthetic municipality',township:'Synthetic area',sellerUid:uid,stage:'registration_started'});
 put('teyzaBusinessProspectSellerLinks/'+uid,{prospectId:p});
 put('teyzaSellerAccounts/'+uid,{uid,shopName:name,category:'spaza',approvalStatus:kind==='pending'?'pending':'approved',listingPlan:'basic'});
 if(kind==='pending'){
  for(const type of ['teyzaMobileVerification','teyzaSellerIdentity'])put(type+'/'+uid,{ownerUid:uid,status:'pending_review',objectPath:'teyza-private/mobile-verification/'+uid+'/synthetic',expiresAt:Date.now()+86400000});
  return;
 }
 put('teyzaPublicShops/'+uid,{sellerUid:uid,status:'active',approvalStatus:'approved',identityVerified:true,latitude:-29.85,longitude:31.02});
 const paid=kind==='paid';
 put('teyzaBilling/'+uid,paid?{ownerUid:uid,status:'paid',paymentProvider:'paystack',paymentEnvironment:'live',paidUntil:Date.now()+86400000}:{ownerUid:uid,adminComplimentaryStatus:'active',adminComplimentaryReason:'Synthetic complimentary entitlement',adminComplimentaryBy:'reviewer',adminComplimentaryUntil:Date.now()+86400000});
 const adId='ad-'+uid,ref='ref-'+uid;
 put('teyzaShopperAds/'+adId,{ownerUid:uid,status:paid?'active':'approved_unpaid',paymentStatus:paid?'paid':'unpaid',radiusKm:10,amountCents:2900,latitude:-29.85,longitude:31.02,startsAt:stamp,endsAt:Date.now()+86400000,paymentReference:ref});
 if(paid)put('teyzaAdPayments/'+ref,{ownerUid:uid,advertisementId:adId,status:'paid',environment:'live',currency:'ZAR',amountCents:2900,verifiedAt:stamp,transactionId:'synthetic-transaction'});
}
seller('z-paid','s-paid','paid');seller('z-free','s-free','free');seller('z-pending','s-pending','pending');
const report={mode:mode==='--preflight'?'cloud staging read-only preflight':'cloud staging synthetic validation',projectId,projectNumber,databaseId,host,account,sourceCommit:'22569f6aaa4dcec56b32d742185a9a5a234a6aa5',expectedProspects:N+3,seededDocuments:0,checks:[],scans:[],queryPlans:[],limitations:['Measures backend SDK calls, not browser, deployed function, or nationwide SLA.','Query Explain examples are not a total billing calculation. Review actual staging Usage separately.','Synthetic data only; no production data or outbound actions.','Retained synthetic fixtures; no automatic cleanup or deletion.']};
function check(label,condition){report.checks.push({label,passed:Boolean(condition)});assert(condition,label);}
const R=require('../../services/teyza-mobile-v39/acquisition-report');
const scan=async(label,filters={},mutate=null)=>{
 const start=performance.now();let after=null,asOf=null,scanned=0,rows=[],pages=0,complete=false;const pageMs=[],counts=R.emptyCounts(),seen=new Set();
 do{
  const before=performance.now(),includeRows=pages===0;
  const response=await api.execute(admin,'ops_acquisition_command_page',{filters,includeRows,...(after?{after,asOf}:{})});
  pageMs.push(Math.round(performance.now()-before));
  assert.equal(response.schema,2);assert.equal(response.asOf,asOf??response.asOf);asOf=response.asOf;
  pages++;assert(pages<100);scanned+=response.scanned;
  for(const group of ['funnel','queues'])for(const k of Object.keys(counts[group]))counts[group][k]+=response.counts[group][k];
  rows.push(...response.prospects);
  after=response.next;complete=response.complete;
  if(after){assert(!seen.has(after),'Repeated cursor');seen.add(after);}
  if(pages===1&&mutate)await mutate();
 }while(after);
 assert(complete);
 const result={label,asOf,pages,scanned,elapsedMs:Math.round(performance.now()-start),maxPageMs:Math.max(...pageMs),pageMs,counts};
 report.scans.push(result);console.log(JSON.stringify(result));
 return {...result,rows};
};
(async()=>{
 try{
  assert.equal(db.projectId,projectId,'SDK target mismatch');
  const top=await db.listCollections();
  check('Dedicated staging database has no existing collections',top.length===0);
  if(mode==='--preflight'){report.passed=true;return;}
  assert.equal(records.length,1203,'Unexpected fixture size');
  check('Fresh staging collection',(await db.collection(root).limit(1).get()).empty);
  const start=performance.now();
  for(let i=0;i<records.length;i+=350){const batch=db.batch();for(const [p,v] of records.slice(i,i+350))batch.create(db.doc(p),v);await batch.commit();seeded+=Math.min(350,records.length-i);}
  report.seededDocuments=seeded;report.seedElapsedMs=Math.round(performance.now()-start);
  await delay(3500);
  const initial=await scan('full national baseline',{queue:'new_contact'});
  const f=initial.counts.funnel,q=initial.counts.queues;
  check('All 903 prospect records counted',f.discovered===N+3&&initial.scanned===N+3);
  check('New contacts exclude history, field visits, downloads, suppression and linked registrations',q.new_contact===N/5&&q.ready_to_contact===N/5);
  check('Missing contacts retained for visits',q.field_visit===N/5);
  check('Historical contact ledger beyond 100 events counted once',f.staffConfirmedContact===N/5&&q.awaiting_response===N/5);
  check('Downloads not approvals',f.downloads===N/5&&f.approved===2&&f.awaitingApproval===1);
  check('Paid seller and paid advertiser count once',f.paidSellers===1&&f.activeAdvertisers===1&&f.activePaidCampaigns===1&&f.payingBusinesses===1&&f.sellingAccessNotPaid===1);
  const idx=G.provinces.indexOf('KwaZulu-Natal');
  const filtered=await scan('province municipality township category',{province:'KwaZulu-Natal',municipality:'Synthetic municipality '+idx,township:'Synthetic township '+idx,category:'spaza'});
  check('All filtered rows including legacy province fallback',filtered.counts.funnel.discovered===50);
  const coded=await scan('official code equality',{province:'KwaZulu-Natal',municipalityCode:'ETH',localityId:'ETH:123456789'});
  check('Official reference filter excludes unmapped legacy rows',coded.counts.funnel.discovered===80);
  const concurrent=await scan('fixed snapshot with concurrent changes',{queue:'paying'},async()=>{
   await db.doc(root+'/zz-new').create({...base,name:'Synthetic concurrent new record'});
   await db.doc(root+'/'+id(N-5)).update({optedOut:true});
   await db.doc('teyzaAdPayments/ref-s-paid').update({refunded:true});
  });
  check('Original report snapshot survives writes across pages',concurrent.counts.funnel.discovered===N+3&&concurrent.counts.funnel.payingBusinesses===1&&concurrent.counts.queues.new_contact===N/5);
  await delay(3500);
  const updated=await scan('new snapshot after changes',{queue:'paying'});
  check('Fresh snapshot sees insert, opt-out and refund',updated.counts.funnel.discovered===N+4&&updated.counts.queues.new_contact===N/5-1&&updated.counts.funnel.activeAdvertisers===0&&updated.counts.funnel.paidSellers===1);
  check('Expired snapshot rejected before reads',await api.execute(admin,'ops_acquisition_command_page',{asOf:Date.now()-56*60000}).then(()=>false,e=>e.status===422));
  const queries=[['document-id cursor',db.collection(root).orderBy('__name__').limit(31)],['business type',db.collection(root).where('category','==','spaza').orderBy('__name__').limit(31)],['official township',db.collection(root).where('localityId','==','ETH:123456789').orderBy('__name__').limit(31)],['municipality code',db.collection(root).where('municipalityCode','==','ETH').orderBy('__name__').limit(31)],['legacy city',db.collection(root).where('city','==','Durban').orderBy('__name__').limit(31)],['contact ledger',db.collection(root+'/p0002/events').where('type','in',['contact','email_sent','message_accepted']).orderBy('__name__').limit(101)],['seller campaigns',db.collection('teyzaShopperAds').where('ownerUid','==','s-paid').orderBy('__name__').limit(101)]];
  for(const [label,query] of queries){const explain=await query.explain({analyze:true});const metrics=explain.metrics;assert(metrics?.planSummary&&metrics?.executionStats,'Query Explain missing metrics: '+label);report.queryPlans.push({label,planSummary:metrics.planSummary,executionStats:metrics.executionStats});}
  check('All seven cloud query/index explain checks completed',report.queryPlans.length===7);
  report.passed=true;
 }catch(e){report.passed=false;report.error=String(e?.message||e);console.error(e);process.exitCode=1;}
 finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report,null,2));await db.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
