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
 assert(source.includes('Visit and register this shop'));
 assert(source.includes('Show shops in this area'));
 assert(source.includes('Choose your area'));
 assert(source.includes('Pinetown'));
 assert(source.includes('Gqeberha'));
 assert(source.includes("if(!admin&&tab!=='registered')"));
 assert(source.includes('Registration steps and R90 eligibility'));
 assert(source.includes('ownerApp.href=\'/download.html\''));
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

test('R90 deployment targets only teyzaMobile in named Firebase codebase',()=>{
 const deployment=read('DEPLOY-TEYZA-WORK-R90.ps1');
 const configuration=JSON.parse(read('firebase.teyza-mobile-v39.json'));
 assert.equal(configuration.functions[0].codebase,'teyza-mobile');
 assert(deployment.includes("'functions:teyza-mobile:teyzaMobile'"));
 assert(!deployment.includes('--only functions:teyzaMobile'));
 assert(deployment.includes('agentRewardReviewEnabled'));
 assert(deployment.includes('publish-work-only.cjs deploy'));
});

test('Approved agents have a UID-bound check approval action and stale application errors clear',()=>{
 const page=read('web/app-first/public/work.html'),script=read('web/app-first/public/js/work.js');
 assert(page.includes('id="checkApproval"'));
 assert(page.includes('id="pendingAccount"'));
 assert(script.includes("api('agent_profile')"));
 assert(script.includes("$('notice').hidden=true"));
 assert(script.includes("auth.currentUser.uid.slice(-8)"));
 assert(script.includes("profile?.status==='approved'"));
 assert(script.includes("$('checkApproval').onclick"));
 assert(script.includes("await auth.currentUser?.getIdToken(true);await refreshAccount()"));
});

test('Work simplifies registration to area, capture, and owner consent without inventing automated WhatsApp',()=>{
 const html=read('web/app-first/public/work.html'),work=read('web/app-first/public/js/work.js');
 assert(html.includes('class="agent-journey"'));
 for(const step of ['Choose your area','Visit and capture','Owner confirms'])assert(html.includes(step));
 assert(!html.includes('class="field-dashboard-cards"'));
 assert(work.includes('Open WhatsApp invitation'));
 assert(work.includes('The owner asked me to send the Teyza invitation'));
 assert(work.includes('window.open(link'));
 assert(work.includes('https://wa.me/'));
 assert(work.includes("digits='27'+digits.slice(1)"));
 assert(work.includes('STEP 2 OF 3 · VISIT AND CAPTURE'));
 assert(work.includes('WhatsApp verification and Premium notifications require separate consented server-side templates'));
 assert(work.includes("api('agent_owner_link'"));
 assert(work.includes("api('agent_visit_submit'"));
 assert(work.includes('The owner must sign in and confirm personally'));
 assert(!work.includes('TEYZA_WHATSAPP_ACCESS_TOKEN'));
});
