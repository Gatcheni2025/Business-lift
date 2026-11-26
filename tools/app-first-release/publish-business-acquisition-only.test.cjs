'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {paths,files,verify,assertR90Ready}=require('./publish-business-acquisition-only.cjs');
test('Business Acquisition scoped publisher preserves all unrelated site assets and requires backend',()=>{
 assert.equal(paths.length,13);assert(paths.includes('/js/teyza-business-acquisition.js'));assert(paths.includes('/for-shop-owners.html'));assert(!paths.includes('/seller-subscriptions.html'));
 assert(!paths.includes('/agents.html'));assert(!paths.includes('/work.html'));assert(!paths.includes('/pay/index.html'));
 const items=files(),before=new Map([['/index.html','home'],['/agents.html','agents'],['/pay/index.html','pay'],...paths.slice(0,-1).map(p=>[p,'old'])]),after=new Map(before);
 for(const [p,v] of items)after.set(p,v.hash);
 assert.doesNotThrow(()=>verify(before,after,items));assert.throws(()=>verify(before,new Map([...after,['/agents.html','changed']]),items));
 const health={ok:true,adminBusinessAcquisition:true,agentRewardReviewEnabled:true,agentRewardCents:9000,agentCommissionEnabled:false,fieldAgentWorkspace:true,fieldAgentDiscovery:true};
 assert.doesNotThrow(()=>assertR90Ready(health));assert.throws(()=>assertR90Ready({...health,adminBusinessAcquisition:false}));
});
test('Business invitation destination shows the actual app and direct store links before optional detail',()=>{const fs=require('node:fs'),path=require('node:path');const html=fs.readFileSync(path.resolve(__dirname,'../../web/app-first/public/for-shop-owners.html'),'utf8');const main=html.slice(html.indexOf('<main id="main">'),html.indexOf('</main>'));const hero=main.slice(0,main.indexOf('data-teyza-demo'));for(const text of ['Put your business','/assets/app/home.webp','/assets/app/nearby-shops.webp','https://play.google.com/store/apps/details?id=com.asiyedriver.asiye','https://apps.apple.com/za/app/id6827037733','Get help getting started'])assert(hero.includes(text),text);assert(main.includes('example shop, items and request are illustrative'));assert(main.includes('tel:+27315661165'));assert(main.includes('Registration and verification are free'));assert(main.includes('/seller-subscriptions.html'));assert(html.includes('/assets/app-demo.js'));});
