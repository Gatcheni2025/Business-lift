'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paths,verify,assertR90Ready}=require('./publish-work-only.cjs');
test('Work publisher changes only approved field UI and leaves payments, Ads and Admin untouched',()=>{
 assert.deepEqual(paths,['/work.html','/js/work.js','/js/work-discovery.mjs','/js/work-map.mjs','/assets/agent-map-first.css']);
 for(const file of ['/admin.html','/pay/index.html','/ads/index.html','/agents.html'])assert(!paths.includes(file));
 const before=new Map([['/index.html','home'],['/admin.html','admin'],['/pay/index.html','pay'],['/work.html','old']]);
 const changed=new Map([['/work.html',{hash:'new'}],['/js/work.js',{hash:'work'}]]);
 const after=new Map([...before,['/work.html','new'],['/js/work.js','work']]);
 assert.doesNotThrow(()=>verify(before,after,changed));
 after.set('/admin.html','changed');
 assert.throws(()=>verify(before,after,changed),/Unrelated Hosting asset changed/);
});
test('Work publisher refuses R90 pages until backend supports approved-unpaid reward workflow',()=>{
 for(const health of [{ok:true,fieldAgentWorkspace:true,fieldAgentDiscovery:true,agentRewardReviewEnabled:false,agentRewardCents:9000,agentCommissionEnabled:false},
 {ok:true,fieldAgentWorkspace:true,fieldAgentDiscovery:true,agentRewardReviewEnabled:true,agentRewardCents:2500,agentCommissionEnabled:false},
 {ok:true,fieldAgentWorkspace:true,fieldAgentDiscovery:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:true}])
  assert.throws(()=>assertR90Ready(health),/not active/);
 assert.doesNotThrow(()=>assertR90Ready({ok:true,fieldAgentWorkspace:true,fieldAgentDiscovery:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false}));
});
