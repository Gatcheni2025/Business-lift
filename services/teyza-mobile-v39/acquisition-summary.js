'use strict';
// Immutable reporting generations. This module is never an authorization source.
// The exact report and all existing live mutation checks remain authoritative.
const crypto=require('node:crypto'),D=require('./domain'),R=require('./acquisition-report');
const SCHEMA=1,MAX_AGE=5*60000,MAX_PROSPECTS=20000,MAX_SCOPES=80000;
const CONTROL='teyzaAcquisitionReportControl/current',ROOT='teyzaAcquisitionReportGenerations';
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const key=(province='',municipality='',township='',category='')=>hash([province,municipality,township,category]);
const lookup=(scope,queue='')=>hash([scope,queue]);
const NATIONAL=key();
const unique=a=>[...new Set(a)];
const day=now=>Math.floor((now+7200000)/86400000);
function fresh(asOf,now){return Number.isSafeInteger(asOf)&&asOf>0&&asOf<=now&&now-asOf<=MAX_AGE&&day(asOf)===day(now);}
function scopeFor(f){
 // Free-text business search or intersecting name+code selectors require the
 // exact live snapshot. Do not silently broaden a scope to serve a cache hit.
 if(f.search||f.municipality&&f.municipalityCode||f.township&&f.localityId)return null;
 return key(f.province,f.municipalityCode?'code:'+f.municipalityCode:f.municipality?'name:'+norm(f.municipality):'',f.localityId?'code:'+f.localityId:f.township?'name:'+norm(f.township):'',f.category);
}
function scopesFor(p){
 const provinces=unique(['',p.province||'']),categories=unique(['',p.category||'']);
 const municipalities=unique(['',...[p.municipality,p.municipalityCode].filter(Boolean).map(s=>'name:'+norm(s)),...(p.municipalityCode?['code:'+p.municipalityCode]:[])]);
 const townships=unique(['',...[p.township,p.area,p.localityId].filter(Boolean).map(s=>'name:'+norm(s)),...(p.localityId?['code:'+p.localityId]:[])]);
 const scopes=[];
 for(const province of provinces)for(const municipality of municipalities)for(const township of townships)for(const category of categories)scopes.push(key(province,municipality,township,category));
 return unique(scopes);
}
function sameCounts(a,b){
 return ['funnel','queues'].every(g=>Object.keys(R.emptyCounts()[g]).every(k=>Number.isSafeInteger(a?.[g]?.[k])&&a[g][k]===b?.[g]?.[k]));
}
function validCounts(c){
 if(!['funnel','queues'].every(g=>Object.keys(R.emptyCounts()[g]).every(k=>Number.isSafeInteger(c?.[g]?.[k])&&c[g][k]>=0)))return false;
 const f=c.funnel;return Object.values(c.queues).every(n=>n<=f.discovered)&&Object.entries(f).every(([k,n])=>k==='activePaidCampaigns'||n<=f.discovered)&&f.approved<=f.registered&&f.awaitingApproval<=f.registered&&f.payingBusinesses<=f.approved&&f.paidSellers<=f.payingBusinesses&&f.activeAdvertisers<=f.payingBusinesses&&f.activePaidCampaigns>=f.activeAdvertisers;
}
function safeRow(p,facts,scopes){
 // No destinations, consent records, provider IDs, website links, raw billing,
 // payment references, verification documents, or seller UID are cached.
 const seller=p.seller?Object.fromEntries(['status','approved','approvalSubmitted','paidMembership','sellingAccess','activePaidAdvertising','activePaidCampaigns','unpaidCampaigns','advertisingReview'].filter(k=>p.seller[k]!==undefined).map(k=>[k,p.seller[k]])):null;
 const display=Object.fromEntries(['id','name','province','municipality','city','area','township','category','localityId','geographySourceVintage','geographyNeedsReview','outreachState','response','downloadConfirmedAt','stage','optedOut','assignedTo','nextFollowUpAt'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
 const queues=R.queueKeys.filter(k=>facts.queues[k]);
 return {display:{...display,contactNote:p.contactNote||'Contact details recorded',seller,commercialInterest:p.commercialInterest?.kind?{kind:p.commercialInterest.kind}:null,snapshotOnly:true},lookupKeys:scopes.flatMap(s=>['',...queues].map(q=>lookup(s,q)))};
}
// The collector uses the exact unfiltered snapshot API, all rows and all
// pages. It is read-only and can also be used for staging comparison.
async function collectGeneration({readPage,asOf,pageSize=30}){
 if(![30,60].includes(pageSize))throw Error('Invalid internal reporting page size.');
 const rows=new Map(),aggregates=new Map([[NATIONAL,R.emptyCounts()]]),seen=new Set();let after=null,pages=0;
 do{
  const page=await readPage({filters:{},asOf,includeRows:true,...(after?{after}:{})});
  if(page?.schema!==2||page.asOf!==asOf||page.complete!==(page.next===null)||!Array.isArray(page.prospects)||page.prospects.length!==page.scanned||page.scanned>pageSize||page.next&&(!page.scanned||seen.has(page.next)))throw Error('Incomplete exact snapshot; summary not publishable.');
  const pageCounts=R.emptyCounts();
  for(const p of page.prospects){
   if(typeof p.id!=='string'||!p.id||rows.has(p.id))throw Error('Duplicate or invalid prospect in exact snapshot.');
   const facts=R.classify(p,asOf),scopes=scopesFor(p);
   R.addCounts(pageCounts,facts);
   for(const scope of scopes){if(!aggregates.has(scope))aggregates.set(scope,R.emptyCounts());R.addCounts(aggregates.get(scope),facts);}
   rows.set(p.id,safeRow(p,facts,scopes));
   if(rows.size>MAX_PROSPECTS||aggregates.size>MAX_SCOPES)throw Error('Reporting generation exceeds safe build bound; partition before rollout.');
  }
  if(!sameCounts(page.counts,pageCounts))throw Error('Exact report count mismatch; summary not publishable.');
  after=page.next;if(after)seen.add(after);pages++;
 }while(after);
 return {asOf,rows,aggregates,pages};
}
// Operator/job entrypoint, deliberately not exposed as an admin action. Publish
// the pointer only after all immutable rows and scope counts are committed.
async function publishGeneration({db,generation,clock=Date.now}){
 const {asOf,rows,aggregates}=generation;
 if(!fresh(asOf,clock())||rows.size>MAX_PROSPECTS||aggregates.size>MAX_SCOPES||!validCounts(aggregates.get(NATIONAL))||aggregates.get(NATIONAL).funnel.discovered!==rows.size)throw Error('Expired or invalid generation.');
 const id=crypto.randomUUID(),prefix=ROOT+'/'+id,docs=[];
 for(const [rowId,value] of rows)docs.push([prefix+'/rows/'+rowId,value]);
 for(const [scope,counts] of aggregates){if(!validCounts(counts))throw Error('Invalid aggregate.');docs.push([prefix+'/scopes/'+scope,{counts}]);}
 for(let i=0;i<docs.length;i+=200){const batch=db.batch();for(const [path,value] of docs.slice(i,i+200))batch.create(db.doc(path),value);await batch.commit();}
 const manifest={schema:SCHEMA,generation:id,asOf,prospectCount:rows.size,scopeCount:aggregates.size,completedAt:clock()};
 await db.runTransaction(async tx=>{
  const pointer=db.doc(CONTROL),prior=await tx.get(pointer);
  if(!fresh(asOf,clock())||prior.exists&&prior.data().asOf>=asOf)throw Error('Expired or superseded generation; pointer unchanged.');
  tx.create(db.doc(prefix),manifest);tx.set(pointer,manifest);
 });
 return manifest;
}
// Read a single complete generation in one read-only transaction. An unavailable
// or stale first request falls back to exact report. A continuation never mixes
// summary generations or silently falls back to another snapshot.
async function readSummaryPage({db,data,clock=Date.now}){
 const filters=R.parseFilters(data.filters),scope=scopeFor(filters),requested=data.summaryGeneration;
 if(requested!==undefined&&(typeof requested!=='string'||!/^[a-f0-9-]{36}$/.test(requested)||!data.after||!Number.isSafeInteger(data.asOf)))D.fail(422,'Invalid reporting summary continuation.');
 const unavailable=()=>{if(requested)D.fail(409,'Reporting snapshot changed or expired. Refresh the Command Centre.');return null;};
 if(!scope||data.includeRows===false||data.after&&!requested||data.asOf&&!requested)return unavailable();
 return db.runTransaction(async tx=>{
  const snap=await tx.get(db.doc(CONTROL)),manifest=snap.exists?snap.data():null;
  if(!manifest||manifest.invalidated===true||manifest.schema!==SCHEMA||typeof manifest.generation!=='string'||!/^[a-f0-9-]{36}$/.test(manifest.generation)||!fresh(manifest.asOf,clock())||data.summaryAfter&&manifest.asOf<=data.summaryAfter||requested&&(requested!==manifest.generation||data.asOf!==manifest.asOf))return unavailable();
  const prefix=ROOT+'/'+manifest.generation;
  let q=db.collection(prefix+'/rows').where('lookupKeys','array-contains',lookup(scope,filters.queue)).orderBy('__name__').limit(31);
  if(data.after)q=q.startAfter(D.id(data.after));
  const [stored,page,meta]=await Promise.all([tx.get(db.doc(prefix+'/scopes/'+scope)),tx.get(q),tx.get(db.doc(prefix))]);
  if(!meta.exists||meta.data().generation!==manifest.generation||meta.data().asOf!==manifest.asOf||meta.data().prospectCount!==manifest.prospectCount)return unavailable();
  const counts=stored.exists?stored.data().counts:R.emptyCounts(),expected=filters.queue?counts?.queues?.[filters.queue]:counts?.funnel?.discovered;
  if(!validCounts(counts)||scope===NATIONAL&&(!stored.exists||counts.funnel.discovered!==manifest.prospectCount)||!stored.exists&&page.docs.length||!data.after&&page.docs.length!==Math.min(31,expected))return unavailable();
  const selected=page.docs.slice(0,30),prospects=selected.map(s=>s.data().display);
  if(prospects.some((p,i)=>!p||p.id!==selected[i].id||p.snapshotOnly!==true||p.email||p.phone))return unavailable();
  return {summarySchema:SCHEMA,summaryGeneration:manifest.generation,asOf:manifest.asOf,completedAt:manifest.completedAt,filters,counts,scanned:counts.funnel.discovered,prospects,next:page.docs.length>30?selected.at(-1).id:null};
 },{readOnly:true});
}
module.exports={SCHEMA,MAX_AGE,CONTROL,ROOT,NATIONAL,scopeFor,scopesFor,lookup,fresh,validCounts,collectGeneration,publishGeneration,readSummaryPage};
