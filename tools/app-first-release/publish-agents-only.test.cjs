'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paths,verify,assertR90Ready}=require('./publish-agents-only.cjs');
test('scoped agent deployment never modifies authenticated Work, billing or Admin files',()=>{
 assert.deepEqual(paths,['/agents.html','/assets/teyza-agents-map-first.css']);
 for(const file of ['/work.html','/js/work.js','/pay/index.html','/admin.html'])assert(!paths.includes(file));
 const before=new Map([['/index.html','home'],['/work.html','react'],['/pay/index.html','pay'],['/admin.html','admin'],['/agents.html','old']]);
 const managed=new Map([['/agents.html',{hash:'new'}],['/assets/teyza-agents-map-first.css',{hash:'css'}]]);
 const after=new Map([...before,['/agents.html','new'],['/assets/teyza-agents-map-first.css','css']]);
 assert.doesNotThrow(()=>verify(before,after,managed));
});
test('agent deployment fails closed if unrelated Hosting bytes change',()=>{
 const before=new Map([['/work.html','react'],['/agents.html','old']]);
 const managed=new Map([['/agents.html',{hash:'new'}]]);
 const after=new Map([['/work.html','broken'],['/agents.html','new']]);
 assert.throws(()=>verify(before,after,managed),/Unrelated Hosting asset changed/);
});
test('agent deployment fails closed if a managed CSS upload is absent',()=>{
 const before=new Map([['/agents.html','old']]);
 const managed=new Map([['/agents.html',{hash:'new'}],['/assets/teyza-agents-map-first.css',{hash:'css'}]]);
 const after=new Map([['/agents.html','new'],['/assets/teyza-agents-map-first.css','bad']]);
 assert.throws(()=>verify(before,after,managed),/Agent asset was not verified/);
});

test('Agents R90 release requires explicit live backend confirmation',()=>{
 assert.throws(()=>assertR90Ready({ok:true,agentCommissionEnabled:false,agentCommissionCents:9000}),/not confirmed active/);
 assert.throws(()=>assertR90Ready({ok:true,agentCommissionEnabled:true,agentCommissionCents:2500}),/not confirmed active/);
 assert.doesNotThrow(()=>assertR90Ready({ok:true,agentCommissionEnabled:true,agentCommissionCents:9000}));
});
