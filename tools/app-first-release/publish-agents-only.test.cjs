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
 const ready={ok:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true};
 assert.throws(()=>assertR90Ready({ok:true,agentCommissionEnabled:true,agentCommissionCents:9000}),/not confirmed active/);
 for(const [key,value] of [['agentRewardReviewEnabled',false],['agentRewardCents',2500],['agentCommissionEnabled',true],['fieldAgentWorkspace',false],['fieldAgentDiscovery',false]])assert.throws(()=>assertR90Ready({...ready,[key]:value}),/not confirmed active/);
 assert.doesNotThrow(()=>assertR90Ready(ready));
});

 test('recruitment page directs applicants and agents to genuine entry points',()=>{
 const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'../..');
 const page=fs.readFileSync(path.join(root,'web/app-first/public/agents.html'),'utf8');
 assert.equal(page,fs.readFileSync(path.join(root,'agents.html'),'utf8'));
 for(const needle of ['href="/work.html"','https://apps.apple.com/za/app/id6827037733','https://play.google.com/store/apps/details?id=com.asiyedriver.asiye','No payment is offered for recruiting agents','Income is not guaranteed','awaiting payment','https://wa.me/?text='])assert(page.includes(needle),needle);
 assert(!page.includes('agent-preview-map'));
 });

test('earnings selector provides correct gross examples and clear caveats without scripts or form submission',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'../..');
 const page=fs.readFileSync(path.join(root,'web/app-first/public/agents.html'),'utf8');
 const style=fs.readFileSync(path.join(root,'web/app-first/public/assets/teyza-agents-map-first.css'),'utf8');
 assert.equal(style,fs.readFileSync(path.join(root,'assets/teyza-agents-map-first.css'),'utf8'));
 const section=page.match(/<section class="section agent-earnings"[\s\S]*?<\/section>/)[0];
 for(const count of [0,1,5,10,20,50,100]){const amount='R'+String(count*90).replace(/\B(?=(\d{3})+(?!\d))/g,',');assert(section.includes('id="earnings-'+count+'"'));assert(section.includes('data-earnings="'+count+'"><span>Illustrative gross reward</span><strong>'+amount+'</strong>'));assert(style.includes('#earnings-'+count+':checked~.agent-earnings-results [data-earnings="'+count+'"]'));}
 assert.equal((section.match(/ checked>/g)||[]).length,1);assert(section.includes('id="earnings-20" checked'));assert(section.includes('not forecasts, salaries or guaranteed earnings'));assert(section.includes('No reward for recruiting agents.'));assert(!/<form|<script/.test(section));
});
