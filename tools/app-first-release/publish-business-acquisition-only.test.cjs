'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paths,files,verify,assertR90Ready}=require('./publish-business-acquisition-only.cjs');
test('Business Acquisition scoped publisher preserves all unrelated site assets and requires backend',()=>{
 assert.equal(paths.length,12);assert(paths.includes('/js/teyza-business-acquisition.js'));
 assert(!paths.includes('/agents.html'));assert(!paths.includes('/work.html'));assert(!paths.includes('/pay/index.html'));
 const items=files(),before=new Map([['/index.html','home'],['/agents.html','agents'],['/pay/index.html','pay'],...paths.slice(0,-1).map(p=>[p,'old'])]),after=new Map(before);
 for(const [p,v] of items)after.set(p,v.hash);
 assert.doesNotThrow(()=>verify(before,after,items));assert.throws(()=>verify(before,new Map([...after,['/agents.html','changed']]),items));
 const health={ok:true,adminBusinessAcquisition:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true};
 assert.doesNotThrow(()=>assertR90Ready(health));assert.throws(()=>assertR90Ready({...health,adminBusinessAcquisition:false}));
});