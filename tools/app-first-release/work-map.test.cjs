'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Work map uses existing website-restricted Google Maps config and never asks an agent for a key',()=>{
 const map=read('web/app-first/public/js/work-map.mjs');
 assert(map.includes("'/assets/teyza-maps-config.json'"));
 assert(map.includes('Directions in Google Maps'));
 assert(!map.includes('localStorage.getItem'));
 assert(!map.includes('TEYZA_BROWSER_MAPS_KEY'));
 const html=read('web/app-first/public/work.html');
 assert(!html.includes('name="teyza-browser-map-key"'));
});
test('Work discovery supports all business types, directions, guided visits and private owner confirmation',()=>{
 const source=read('web/app-first/public/js/work-discovery.mjs');
 assert(source.includes("['all','All shops, businesses and wholesalers']"));
 assert(source.includes('Directions ↗'));
 assert(source.includes('Start owner-approved visit'));
 assert(source.includes('How to register a shop and qualify for R90 review'));
 assert(source.includes("onStartVisit({name:x.name"));
 assert(source.includes('category:category.value'));
 const work=read('web/app-first/public/js/work.js');
 assert(work.includes("onStartVisit:record=>newVisit(record)"));
 assert(work.includes("api('agent_rewards')"));
 assert(work.includes("api('agent_admin_reward_approve'"));
 assert(work.includes("approved · awaiting payment"));
 assert(!work.includes("api('agent_admin_commission_paid'"));
});
test('Website root mirrors remain exactly consistent with Work release files',()=>{
 for(const name of ['work.js','work-map.mjs','work-discovery.mjs'])
  assert.equal(read('js/'+name),read('web/app-first/public/js/'+name),name);
 assert.equal(read('assets/agent-map-first.css'),read('web/app-first/public/assets/agent-map-first.css'));
});
