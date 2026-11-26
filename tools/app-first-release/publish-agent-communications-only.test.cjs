'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {paths,verify,files,assertR90Ready}=require('./publish-agent-communications-only.cjs');
test('communications and attribution hosting overlay changes only reviewed assets and fails closed',()=>{
 assert.deepEqual(paths,['/js/teyza-field-admin.js','/agents.html','/work.html','/work-privacy.html','/js/work.js','/js/agent-recruitment-source.mjs']);
 const managed=files(),before=new Map([['/index.html','same'],['/pay/index.html','keep'],...paths.slice(0,-1).map(p=>[p,'old'])]),after=new Map(before);
 for(const [p,v] of managed)after.set(p,v.hash);
 assert.doesNotThrow(()=>verify(before,after,managed));
 assert.throws(()=>verify(before,new Map([...after,['/pay/index.html','changed']]),managed));
 const ready={ok:true,adminAgentCommunications:true,agentRecruitmentSource:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true};
 assert.throws(()=>assertR90Ready({...ready,agentRecruitmentSource:false}));
 assert.throws(()=>assertR90Ready({...ready,adminAgentCommunications:false}));
 assert.doesNotThrow(()=>assertR90Ready(ready));
});
test('only known recruitment campaign city is passed; no unrelated query fields are propagated',async()=>{
 const {recruitmentSource,carryRecruitmentSource}=await import('../../web/app-first/public/js/agent-recruitment-source.mjs');
 const base='?utm_source=meta&utm_medium=paid_social&utm_campaign=teyza_field_agents&utm_content=';
 for(const city of ['johannesburg','durban','cape_town'])assert.equal(recruitmentSource(base+city),'meta_'+city);
 for(const query of ['',base+'elsewhere',base+'durban&utm_content=johannesburg','?utm_content=durban',base+'durban&utm_source=other'])assert.equal(recruitmentSource(query),null);
 const links=[{setAttribute(key,value){assert.equal(key,'href');this.href=value;}}];
 const root={querySelectorAll(selector){assert.equal(selector,'a[href="/work.html"]');return links;}};
 carryRecruitmentSource(root,base+'durban&fbclid=private-click&email=private@example.test');
 assert.equal(links[0].href,'/work.html'+base+'durban');
});
