'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('./acquisition-report'),S=require('./acquisition-summary'),F=require('./acquisition-refresh');
const now=Date.UTC(2026,10,27,12);
function example(id,extra={}){return {id,name:'Synthetic '+id,category:'spaza',city:'Durban',area:'Umlazi',province:'KwaZulu-Natal',township:'Umlazi',municipality:'eThekwini',email:'synthetic@example.test',phone:'',stage:'identified',permissions:{email:{granted:true}},...extra};}
async function generation(prospects,asOf=now){
 const counts=R.emptyCounts();for(const p of prospects)R.addCounts(counts,R.classify(p,asOf));
 return S.collectGeneration({asOf,readPage:async()=>({schema:2,asOf,complete:true,next:null,prospects,scanned:prospects.length,counts})});
}
function prior(g,f){
 return F.decode({asOf:g.asOf,encoded:f.encoded},{asOf:g.asOf,fingerprintHash:f.fingerprintHash,prospectCount:g.rows.size,scopeCount:g.aggregates.size});
}
test('Incremental fingerprints are canonical and unchanged records require zero row or scope writes',async()=>{
 const a=await generation([example('b'),example('a')]),b=await generation([example('a'),example('b')],now+1000);
 const f=F.fingerprint(a),next=F.fingerprint(b);
 assert.equal(f.fingerprintHash,next.fingerprintHash);
 const plan=F.deltaPlan(prior(a,f),b,next);assert.equal(plan.ops.length,0);assert.equal(plan.withinBound,true);
 assert(!f.encoded.includes('synthetic@example.test'));
});
test('Delta moves old geography, deletes absent rows, creates new rows and subtracts obsolete aggregates',async()=>{
 const a=await generation([example('a'),example('b')]);
 const b=await generation([example('a',{province:'Gauteng',municipality:'Johannesburg',township:'Soweto',area:'Soweto',optedOut:true}),example('c')],now+1000);
 const f=F.fingerprint(a),n=F.fingerprint(b),plan=F.deltaPlan(prior(a,f),b,n);
 assert.deepEqual(plan.ops.filter(x=>x.group==='rows').map(x=>[x.id,x.kind]).sort(),[['a','update'],['b','delete'],['c','create']]);
 assert(plan.ops.some(x=>x.group==='scopes'&&x.kind==='create'));assert.equal(b.aggregates.get(S.NATIONAL).queues.new_contact,1);assert.equal(b.aggregates.get(S.NATIONAL).queues.blocked,1);
 assert(plan.withinBound);
});
test('Invalid fingerprint and incomplete authoritative reconciliation stop publication',async()=>{
 const g=await generation([example('a')]),f=F.fingerprint(g);
 assert.throws(()=>F.decode({asOf:g.asOf,encoded:f.encoded+'x'},{asOf:g.asOf,fingerprintHash:f.fingerprintHash,prospectCount:1,scopeCount:g.aggregates.size}),F.IntegrityError);
 const bad={...g,aggregates:new Map(g.aggregates)};bad.aggregates.set(S.NATIONAL,R.emptyCounts());assert.throws(()=>F.fingerprint(bad),/Invalid exact generation/);
 await assert.rejects(S.collectGeneration({asOf:now,readPage:async()=>({schema:2,asOf:now,complete:true,next:null,prospects:[example('a')],scanned:1,counts:R.emptyCounts()})}),/count mismatch/);
});
test('Daily follow-up membership changes at SAST midnight even with unchanged prospect source',async()=>{
 const midnight=Date.UTC(2026,10,27,22);
 const p=example('a',{nextFollowUpAt:midnight+12*3600000});
 const before=await generation([p],midnight-1000),after=await generation([p],midnight);
 assert.equal(before.aggregates.get(S.NATIONAL).queues.ready_to_contact,0);assert.equal(after.aggregates.get(S.NATIONAL).queues.ready_to_contact,1);
 assert.equal(after.aggregates.get(S.NATIONAL).queues.follow_up_due,1);
 const f=F.fingerprint(before);assert(F.deltaPlan(prior(before,f),after,F.fingerprint(after)).ops.length>0);
 assert.equal(S.fresh(midnight-1000,midnight),false);
});
test('Large delta exceeds atomic bound and requires reviewed full rollover',async()=>{
 const rows=Array.from({length:30},(_,i)=>example('a'+i,{municipality:'Municipality '+i,township:'Township '+i,area:'Township '+i}));
 // Use the same public collector pagination contract, not a synthetic partial total.
 async function many(items){
  const readPage=async({after})=>{const at=after?items.findIndex(x=>x.id===after)+1:0,prospects=items.slice(at,30),counts=R.emptyCounts();for(const p of prospects)R.addCounts(counts,R.classify(p,now));const next=at+30<items.length?prospects.at(-1).id:null;return {schema:2,asOf:now,complete:next===null,next,prospects,scanned:prospects.length,counts};};
  return S.collectGeneration({readPage,asOf:now});
 }
 const a=await many(rows),b=await many(rows.map(x=>({...x,municipality:'New '+x.municipality,township:'New '+x.township,area:'New '+x.area,optedOut:true})));
 const f=F.fingerprint(a),plan=F.deltaPlan(prior(a,f),b,F.fingerprint(b));assert(plan.ops.length+3>F.MAX_DELTA_WRITES);assert.equal(plan.withinBound,false);
});
test('Scheduler is isolated and production main and admin-only entrypoints do not import it',()=>{
 const read=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
 assert(!read('index.js').includes('index.reporting-only'));assert(!read('index.admin-only.js').includes('index.reporting-only'));
 const source=read('index.reporting-only.js');assert(source.includes("const project='teyza-national-staging'"));assert(source.includes("TEYZA_STAGING_REPORTING_ENABLED!=='true'"));assert(!source.includes('business-lift-3c19c'));
});
