'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {paths,verify,files,assertR90Ready}=require('./publish-agent-communications-only.cjs');
test('communications hosting overlay is a single existing admin asset and fails closed',()=>{
 assert.deepEqual(paths,['/js/teyza-field-admin.js']);
 const managed=files(),before=new Map([['/index.html','same'],['/agents.html','keep'],[paths[0],'old']]),after=new Map(before);
 for(const [p,v] of managed)after.set(p,v.hash);
 assert.doesNotThrow(()=>verify(before,after,managed));
 assert.throws(()=>verify(before,new Map([...after,['/agents.html','changed']]),managed));
 assert.throws(()=>assertR90Ready({ok:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true}));
 assert.doesNotThrow(()=>assertR90Ready({ok:true,adminAgentCommunications:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true}));
});