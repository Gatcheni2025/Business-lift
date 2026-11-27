'use strict';
// Scheduled exact-snapshot reconciliation with incremental *publication*.
// Never treat eventual Firestore event delivery as a complete change feed.
// Existing actions and payment/consent authorities are not called by this worker.
const crypto=require('node:crypto'),S=require('./acquisition-summary');
const LEASE='teyzaAcquisitionReportControl/refreshLease';
const LEASE_MS=5*60000,RETENTION_MS=24*3600000,AUDIT_MS=60*60000;
const MAX_DELTA_WRITES=350,MAX_FULL_WRITES=5000,MAX_DELTA_BYTES=6*1024*1024,MAX_STATE_BYTES=700000;
const FULL_COOLDOWN_MS=30*60000,MAX_RETENTION_DELETES=200,MAX_MANIFESTS=500;
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const rowId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const scopeId=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function canonical(v){return JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);}
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
const statePath=id=>S.ROOT+'/'+id+'/maintenance/state';
const manifestPath=id=>S.ROOT+'/'+id;
const equal=(a,b)=>canonical(a)===canonical(b);
const data=s=>s.exists?s.data():null;
const bytes=v=>Buffer.byteLength(canonical(v));
function need(ok,reason){if(!ok)throw Error(reason);}
class IntegrityError extends Error{}
function integrity(ok,reason){if(!ok)throw new IntegrityError(reason);}
function managed(m){return m?.managed===true&&m.schema===S.SCHEMA&&uuid(m.generation)&&Number.isSafeInteger(m.asOf)&&Number.isSafeInteger(m.completedAt);}
function fingerprint(g){
 need(g.rows instanceof Map&&g.aggregates instanceof Map&&S.validCounts(g.aggregates.get(S.NATIONAL))&&g.aggregates.get(S.NATIONAL).funnel.discovered===g.rows.size,'Invalid exact generation.');
 need(g.rows.size+g.aggregates.size+3<=MAX_FULL_WRITES,'Managed generation exceeds rollout write bound. Partition before rollout.');
 const encode=(values,valid)=>[...values].map(([id,value])=>{need(valid(id),'Unsafe reporting document ID.');return [id,hash(value)];}).sort(([a],[b])=>a<b?-1:a>b?1:0);
 for(const [id,row] of g.rows)need(row.display?.id===id&&row.display.snapshotOnly===true&&!Object.hasOwn(row.display,'email')&&!Object.hasOwn(row.display,'phone')&&Array.isArray(row.lookupKeys),'Invalid redacted summary row.');
 for(const counts of g.aggregates.values())need(S.validCounts(counts),'Invalid aggregate.');
 const encoded=JSON.stringify({rows:encode(g.rows,rowId),scopes:encode(g.aggregates,scopeId)});
 need(Buffer.byteLength(encoded)<=MAX_STATE_BYTES,'Reporting fingerprint exceeds safe Firestore document size.');
 return {encoded,fingerprintHash:hash(encoded)};
}
function decode(state,manifest){
 integrity(state&&typeof state.encoded==='string'&&Buffer.byteLength(state.encoded)<=MAX_STATE_BYTES&&hash(state.encoded)===manifest.fingerprintHash&&state.asOf===manifest.asOf,'Invalid prior fingerprint state.');
 let parsed;try{parsed=JSON.parse(state.encoded);}catch{throw new IntegrityError('Unreadable prior fingerprint state.');}
 integrity(parsed&&typeof parsed==='object','Invalid prior fingerprint object.');
 function map(entries,valid,size){
  integrity(Array.isArray(entries)&&entries.length===size,'Incomplete fingerprint state.');
  const m=new Map();
  for(const entry of entries){integrity(Array.isArray(entry)&&entry.length===2&&valid(entry[0])&&scopeId(entry[1])&&!m.has(entry[0]),'Invalid fingerprint entry.');m.set(...entry);}
  return m;
 }
 return {rows:map(parsed.rows,rowId,manifest.prospectCount),scopes:map(parsed.scopes,scopeId,manifest.scopeCount)};
}
function deltaPlan(prior,g,f){
 const next=JSON.parse(f.encoded),ops=[];
 for(const [group,values] of [['rows',g.rows],['scopes',g.aggregates]]){
  const old=prior[group],keys=new Map(next[group]);
  for(const [id,digest] of keys)if(old.get(id)!==digest)ops.push({group,id,value:group==='rows'?values.get(id):{counts:values.get(id)},kind:old.has(id)?'update':'create'});
  for(const id of old.keys())if(!keys.has(id))ops.push({group,id,kind:'delete'});
 }
 const estimate=ops.reduce((n,o)=>n+bytes(o)+256,0)+Buffer.byteLength(f.encoded)+4096;
 return {ops,estimate,withinBound:ops.length+3<=MAX_DELTA_WRITES&&estimate<=MAX_DELTA_BYTES};
}
async function acquire(db,clock){
 const token=crypto.randomUUID(),ref=db.doc(LEASE);
 return db.runTransaction(async tx=>{
  const old=data(await tx.get(ref)),now=clock();
  if(old&&Number.isSafeInteger(old.expiresAt)&&old.expiresAt>now)return null;
  tx.set(ref,{token,acquiredAt:now,expiresAt:now+LEASE_MS});return token;
 });
}
async function release(db,token){
 await db.runTransaction(async tx=>{const ref=db.doc(LEASE),old=data(await tx.get(ref));if(old?.token===token)tx.delete(ref);});
}
async function checkLease(tx,db,token,clock){
 const lease=data(await tx.get(db.doc(LEASE)));need(lease?.token===token&&lease.expiresAt>clock(),'Reporting lease lost or expired.');
}
async function guard(tx,db,token,prior,clock,asOf){
 await checkLease(tx,db,token,clock);
 const live=data(await tx.get(db.doc(S.CONTROL)));
 need(equal(live,prior),'Reporting pointer changed concurrently.');
 need(S.fresh(asOf,clock())&&(!live||asOf>live.asOf),'Reporting snapshot expired or superseded.');
}
function manifest(id,g,f,clock,prior=null,audited=false){
 const now=clock();
 return {schema:S.SCHEMA,generation:id,asOf:g.asOf,prospectCount:g.rows.size,scopeCount:g.aggregates.size,completedAt:now,managed:true,
  fingerprintHash:f.fingerprintHash,createdAt:prior?.createdAt??now,auditedAt:audited?now:prior?.auditedAt??0};
}
async function publishFull({db,g,f,prior,token,clock}){
 if(managed(prior)&&prior.invalidated!==true&&clock()-prior.createdAt<FULL_COOLDOWN_MS)throw Error('Large change requires a reviewed rebuild; full-write cooldown active.');
 const id=crypto.randomUUID(),prefix=manifestPath(id),docs=[];
 for(const [key,row] of g.rows)docs.push([prefix+'/rows/'+key,row]);
 for(const [key,counts] of g.aggregates)docs.push([prefix+'/scopes/'+key,{counts}]);
 // Each partial batch has a lease/pointer/freshness guard; no pointer becomes
 // visible until all rows, counts and fingerprint state have been created.
 let confirmed=0;
 for(let i=0;i<docs.length;i+=200){
  const chunk=docs.slice(i,i+200);
  await db.runTransaction(async tx=>{
   await guard(tx,db,token,prior,clock,g.asOf);
   for(const [path,value] of chunk)tx.create(db.doc(path),value);
  });confirmed+=chunk.length;
 }
 const next=manifest(id,g,f,clock,null,true);
 await db.runTransaction(async tx=>{
  await guard(tx,db,token,prior,clock,g.asOf);
  tx.create(db.doc(statePath(id)),{asOf:g.asOf,encoded:f.encoded});
  tx.create(db.doc(prefix),next);tx.set(db.doc(S.CONTROL),next);
 });
 return {kind:'full',manifest:next,summaryWrites:confirmed+3,rowWrites:g.rows.size,scopeWrites:g.aggregates.size};
}
async function publishDelta({db,g,f,prior,token,clock,plan,audited}){
 const prefix=manifestPath(prior.generation),next=manifest(prior.generation,g,f,clock,prior,audited);
 await db.runTransaction(async tx=>{
  await guard(tx,db,token,prior,clock,g.asOf);
  const [old,oldState]=await Promise.all([tx.get(db.doc(prefix)),tx.get(db.doc(statePath(prior.generation)))]);
  need(equal(data(old),prior),'Prior generation manifest changed.');
  decode(data(oldState),prior);
  for(const op of plan.ops){
   const ref=db.doc(prefix+'/'+op.group+'/'+op.id);
   if(op.kind==='delete')tx.delete(ref);
   else if(op.kind==='create')tx.create(ref,op.value);
   else tx.update(ref,op.value);
  }
  // One transaction changes rows, aggregates, manifest and active pointer.
  // A page continuation pins asOf; it must restart after this version changes.
  tx.update(db.doc(statePath(prior.generation)),{asOf:g.asOf,encoded:f.encoded});
  tx.update(db.doc(prefix),next);tx.set(db.doc(S.CONTROL),next);
 });
 return {kind:'delta',manifest:next,summaryWrites:plan.ops.length+3,rowWrites:plan.ops.filter(o=>o.group==='rows').length,scopeWrites:plan.ops.filter(o=>o.group==='scopes').length};
}
async function auditPrior(db,m,clock){
 // Full stored-view integrity audit, at one read-only transaction snapshot.
 return db.runTransaction(async tx=>{
  const p=data(await tx.get(db.doc(S.CONTROL)));need(equal(p,m),'Pointer changed before stored summary audit.');
  const [meta,state]=await Promise.all([tx.get(db.doc(manifestPath(m.generation))),tx.get(db.doc(statePath(m.generation)))]);
  integrity(equal(data(meta),m),'Manifest mismatch.');
  const expected=decode(data(state),m);
  for(const group of ['rows','scopes']){
   const hashes=expected[group];let after=null,n=0;
   do{
    let q=db.collection(manifestPath(m.generation)+'/'+group).orderBy('__name__').limit(201);if(after)q=q.startAfter(after);
    const result=await tx.get(q),rows=result.docs.slice(0,200);
    for(const r of rows){const v=r.data(),value=group==='rows'?v:v.counts;integrity(value&&hashes.get(r.id)===hash(value),'Stored reporting content failed fingerprint audit.');n++;}
    after=result.docs.length>200?rows.at(-1).id:null;
   }while(after);
   integrity(n===hashes.size,'Stored reporting count failed fingerprint audit.');
  }
  return true;
 },{readOnly:true});
}
async function invalidate(db,token,prior,clock){
 return db.runTransaction(async tx=>{
  await checkLease(tx,db,token,clock);const current=data(await tx.get(db.doc(S.CONTROL)));
  need(equal(current,prior),'Pointer changed during integrity check.');
  const marked={...prior,invalidated:true,invalidatedAt:clock()};tx.set(db.doc(S.CONTROL),marked);return marked;
 });
}
async function retain({db,token,clock,limit=MAX_RETENTION_DELETES}){
 need(Number.isInteger(limit)&&limit>=0&&limit<=MAX_RETENTION_DELETES,'Invalid retention bound.');
 const listed=await db.collection(S.ROOT).where('managed','==',true).orderBy('__name__').limit(MAX_MANIFESTS+1).get();
 need(listed.docs.length<=MAX_MANIFESTS,'Too many managed manifests; reviewed retention required.');
 const current=data(await db.doc(S.CONTROL).get());
 if(!managed(current)||current.invalidated===true||!S.fresh(current.asOf,clock()))return {deleted:0,generations:0};
 const candidates=listed.docs.map(s=>({id:s.id,m:s.data()})).filter(({id,m})=>id!==current.generation&&managed(m)&&m.generation===id&&m.asOf<current.asOf).sort((a,b)=>b.m.asOf-a.m.asOf);
 // Keep at least the two most recent superseded managed generations, and
 // every generation completed within 24h. Unmanaged audit artifacts and
 // incomplete generations without manifests are NEVER automatically deleted.
 let deleted=0,generations=0;
 for(const {id,m} of candidates.slice(2)){
  if(deleted>=limit)break;if(clock()-m.completedAt<RETENTION_MS)continue;
  const prefix=manifestPath(id);
  const result=await db.runTransaction(async tx=>{
   await checkLease(tx,db,token,clock);
   const [pointer,old]=await Promise.all([tx.get(db.doc(S.CONTROL)),tx.get(db.doc(prefix))]);
   const active=data(pointer),manifest=data(old);
   if(!equal(active,current)||!equal(manifest,m)||active.generation===id||manifest.asOf>=active.asOf||clock()-manifest.completedAt<RETENTION_MS)return {deleted:0,complete:false};
   const cap=limit-deleted;
   const rowDocs=(await tx.get(db.collection(prefix+'/rows').orderBy('__name__').limit(cap))).docs;
   const scopeDocs=rowDocs.length<cap?(await tx.get(db.collection(prefix+'/scopes').orderBy('__name__').limit(cap-rowDocs.length))).docs:[];
   const remaining=cap-rowDocs.length-scopeDocs.length;
   // Remove parent only when both collections are empty or fully consumed
   // and two deletes remain; known maintenance state only.
   const finish=remaining>=2;
   for(const s of [...rowDocs,...scopeDocs])tx.delete(s.ref);
   if(finish){tx.delete(db.doc(statePath(id)));tx.delete(db.doc(prefix));}
   return {deleted:rowDocs.length+scopeDocs.length+(finish?2:0),complete:finish};
  });
  deleted+=result.deleted;generations+=Number(result.complete);
 }
 return {deleted,generations};
}
async function refresh({db,collect,clock=Date.now,asOf=Math.floor(clock()/1000)*1000-1000,retention=true}){
 need(typeof collect==='function'&&S.fresh(asOf,clock()),'Invalid refresh snapshot.');
 const token=await acquire(db,clock);
 if(!token)return {kind:'busy',summaryWrites:0};
 try{
  let prior=data(await db.doc(S.CONTROL).get());
  if(prior&&asOf<=prior.asOf)return {kind:'already_current',summaryWrites:0};
  const g=await collect(asOf);need(g.asOf===asOf&&S.fresh(asOf,clock()),'Exact reconciliation expired.');
  const f=fingerprint(g);let audited=false,plan=null;
  if(managed(prior)&&prior.invalidated!==true){
   try{
    const old=data(await db.doc(statePath(prior.generation)).get());
    const state=decode(old,prior);
    if(!Number.isSafeInteger(prior.auditedAt)||clock()-prior.auditedAt>=AUDIT_MS){await auditPrior(db,prior,clock);audited=true;}
    plan=deltaPlan(state,g,f);
   }catch(e){
    // A confirmed integrity discrepancy invalidates the cache. Transient
    // Firestore errors stop the run instead of forcing an expensive rebuild.
    if(!(e instanceof IntegrityError))throw e;
    prior=await invalidate(db,token,prior,clock);
   }
  }
  const result=plan?.withinBound?await publishDelta({db,g,f,prior,token,clock,plan,audited}):await publishFull({db,g,f,prior,token,clock});
  // Retention is best-effort after a successfully published snapshot. Failure
  // is surfaced separately; it never hides or rolls back publication.
  if(retention)try{result.retention=await retain({db,token,clock});}catch(e){result.retention={error:String(e?.message||e).slice(0,200)};}
  return result;
 }finally{await release(db,token);}
}
module.exports={IntegrityError,LEASE,LEASE_MS,RETENTION_MS,AUDIT_MS,MAX_DELTA_WRITES,MAX_FULL_WRITES,MAX_RETENTION_DELETES,fingerprint,decode,deltaPlan,refresh,retain,acquire,release,auditPrior};
