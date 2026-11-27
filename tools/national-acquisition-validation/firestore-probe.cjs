'use strict';
// Only run in a fresh localhost Firestore emulator with a synthetic demo project.
// Never connect to a deployed database, functions emulator, auth or message provider.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks'),{createRequire}=require('node:module');
const projectId='demo-teyza-national-validation',host='127.0.0.1:8189';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,host,'Local emulator required');
assert.equal(process.env.GCLOUD_PROJECT,projectId,'Exact demo project required');
assert(!process.env.GOOGLE_APPLICATION_CREDENTIALS&&!process.env.FIREBASE_TOKEN&&!process.env.GOOGLE_GHA_CREDS_PATH,'Cloud credentials prohibited');
const req=createRequire(path.resolve(__dirname,'../../services/teyza-mobile-v39/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app');
const {getFirestore}=req('firebase-admin/firestore');
const {createAcquisition}=require('../../services/teyza-mobile-v39/business-acquisition');
const G=require('../../services/teyza-mobile-v39/acquisition-geography');
const app=initializeApp({projectId},'national-validation'),db=getFirestore(app);
db.settings({host,ssl:false});
const api=createAcquisition({db,geographyLookup:{resolve:async()=>{throw Error('External geography forbidden in emulator test');},search:async()=>{throw Error('External geography forbidden in emulator test');}}});
const output=process.argv[2]||path.join(__dirname,'emulator-audit.json');
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
const report={mode:'loopback emulator only',projectId,host,expectedProspects:N+3,seededDocuments:0,checks:[],scans:[],limitations:['No cloud billing, IAM, production index or cloud latency evidence.','Emulator read-time behavior may differ from Cloud Firestore.','Synthetic data only; no production data or outbound actions.']};
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
  check('Fresh emulator collection', (await db.collection(root).limit(1).get()).empty);
  const start=performance.now();
  for(let i=0;i<records.length;i+=350){const batch=db.batch();for(const [p,v] of records.slice(i,i+350))batch.set(db.doc(p),v);await batch.commit();seeded+=Math.min(350,records.length-i);}
  report.seededDocuments=seeded;report.seedElapsedMs=Math.round(performance.now()-start);
  await delay(2200);
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
  check('All filtered rows including legacy province fallback',filtered.counts.funnel.discovered===50&&filtered.scanned===103);
  const coded=await scan('official code equality',{province:'KwaZulu-Natal',municipalityCode:'ETH',localityId:'ETH:123456789'});
  check('Official reference filter excludes unmapped legacy rows',coded.counts.funnel.discovered===80);
  const concurrent=await scan('fixed snapshot with concurrent changes',{queue:'paying'},async()=>{
   await db.doc(root+'/zz-new').set({...base,name:'Synthetic concurrent new record'});
   await db.doc(root+'/'+id(N-5)).update({optedOut:true});
   await db.doc('teyzaAdPayments/ref-s-paid').update({refunded:true});
  });
  check('Original report snapshot survives writes across pages',concurrent.counts.funnel.discovered===N+3&&concurrent.counts.funnel.payingBusinesses===1&&concurrent.counts.queues.new_contact===N/5);
  await delay(2200);
  const updated=await scan('new snapshot after changes',{queue:'paying'});
  check('Fresh snapshot sees insert, opt-out and refund',updated.counts.funnel.discovered===N+4&&updated.counts.queues.new_contact===N/5-1&&updated.counts.funnel.activeAdvertisers===0&&updated.counts.funnel.paidSellers===1);
  check('Expired snapshot rejected before reads',await api.execute(admin,'ops_acquisition_command_page',{asOf:Date.now()-56*60000}).then(()=>false,e=>e.status===422));
  // Real SDK validation of immutable summary writes and array-contains query.
  // This file remains hard-guarded to the loopback demo project.
  const S=require('../../services/teyza-mobile-v39/acquisition-summary');
  const collectStart=performance.now(),generation=await api.collectReportingGeneration(updated.asOf);
  const collectElapsedMs=Math.round(performance.now()-collectStart);
  const publishStart=performance.now(),manifest=await S.publishGeneration({db,generation});
  const publishElapsedMs=Math.round(performance.now()-publishStart),summaryStart=performance.now();
  const summary=await api.execute(admin,'ops_acquisition_command_page',{preferSummary:true,filters:{queue:'new_contact'}});
  const readElapsedMs=Math.round(performance.now()-summaryStart);
  check('Published summary exactly matches full snapshot counts',JSON.stringify(summary.counts)===JSON.stringify(updated.counts)&&summary.summaryGeneration===manifest.generation);
  check('Summary uses indexed queue membership and redacted rows',summary.prospects.length===30&&summary.prospects.every(p=>p.snapshotOnly&&!p.email&&!p.phone));
  const more=await api.execute(admin,'ops_acquisition_command_page',{preferSummary:true,summaryGeneration:summary.summaryGeneration,asOf:summary.asOf,after:summary.next,filters:summary.filters});
  check('Summary continuation preserves generation and excludes duplicate IDs',more.prospects.length===30&&!more.prospects.some(p=>summary.prospects.some(a=>a.id===p.id)));
  const scoped=await api.execute(admin,'ops_acquisition_command_page',{preferSummary:true,filters:{province:'KwaZulu-Natal',municipality:'Synthetic municipality '+idx,township:'Synthetic township '+idx,category:'spaza'}});
  check('Summary scoped geographic totals preserve legacy rows',scoped.counts.funnel.discovered===50);
  report.summary={collectElapsedMs,publishElapsedMs,readElapsedMs,manifest};
  report.passed=true;
 }catch(e){report.passed=false;report.error=String(e?.message||e);console.error(e);process.exitCode=1;}
 finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await db.terminate();await deleteApp(app);}
})().catch(e=>{console.error(e);process.exitCode=1;});
