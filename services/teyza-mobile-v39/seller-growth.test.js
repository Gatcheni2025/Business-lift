'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSellerGrowth}=require('./seller-growth');
const {createWhatsAppGrowth}=require('./whatsapp-growth');

function fixture(){
 const uid='seller1',phone='+27712345678',now=1731370000000;
 const records=new Map([['teyzaSellerAccounts/'+uid,{uid,category:'spaza',
  phone,approvalStatus:'approved'}]]);
 let auth={phoneNumber:phone,providerData:[{providerId:'phone',phoneNumber:phone}]};
 let requests=[],token='TEST_META_ACCESS_TOKEN_123',operatorApproved=true,connected=true;
 const doc=path=>({
  path,get:async()=>({exists:records.has(path),data:()=>records.get(path)}),
  update:async v=>records.set(path,{...records.get(path),...v}),
 });
 let queue=Promise.resolve();
 const db={doc,runTransaction:fn=>{
   const next=queue.then(async()=>{
     const writes=[],tx={
       get:ref=>ref.get(),
       create:(ref,value)=>writes.push(()=>{if(records.has(ref.path))throw Error('duplicate');records.set(ref.path,value);}),
       update:(ref,value)=>writes.push(()=>records.set(ref.path,{...records.get(ref.path),...value})),
     };
     const value=await fn(tx);
     for(const w of writes)w();
     return value;
   });
   queue=next.catch(()=>{});return next;
  }};
 const grow=createSellerGrowth({db,getAuthUser:async()=>auth,clock:()=>now});
 const meta=createWhatsAppGrowth({db,getAuthUser:async()=>auth,getToken:()=>token,
  getConfig:()=>({phoneNumberId:'123456789',apiVersion:'v24.0',
    upgradeTemplate:'teyza_growth_upgrade_info',advertiseTemplate:'teyza_growth_ads_info',
    language:'en',operatorApproved}),clock:()=>now,
  send:async(url,options)=>{requests.push({url,options});if(!connected)throw Error('uncertain connection');
    return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.test'}]})};}});
 return {uid,phone,now,records,requests,grow,meta,
  withAuth:a=>{auth=a;},disable:()=>{token='';},unapprove:()=>{operatorApproved=false;},
  disconnect:()=>{connected=false;}};
}
const user={uid:'seller1'};
test('Only a verified registered seller may request information with explicit consent',async()=>{
 const f=fixture();
 await assert.rejects(()=>f.grow.execute(user,'seller_growth_interest',{purpose:'upgrade'}),/consent/i);
 await assert.rejects(()=>f.grow.execute(user,'seller_growth_interest',{purpose:'unknown',whatsappConsent:true}),/Choose/);
 f.withAuth({phoneNumber:f.phone,providerData:[]});
 await assert.rejects(()=>f.grow.execute(user,'seller_growth_interest',{purpose:'upgrade',whatsappConsent:true}),/Verify this shop/);
 assert.equal(f.records.size,1);
});
test('One deduplicated request a day; recipient and URLs are never accepted from app',async()=>{
 const f=fixture();
 const data={purpose:'upgrade',whatsappConsent:true,phone:'+27000000000',url:'https://example.com/buy'};
 const [a,b]=await Promise.all([f.grow.execute(user,'seller_growth_interest',data),
   f.grow.execute(user,'seller_growth_interest',data)]);
 assert.equal(a.requested,true);assert.equal(b.requested,true);
 assert.equal([a,b].filter(x=>x.alreadyRequested).length,1);
 const entry=[...f.records.entries()].find(([k])=>k.startsWith('teyzaWhatsAppGrowthOutbox/'));
 assert.equal(entry[1].status,'queued');assert.equal(entry[1].purpose,'upgrade');
 assert.equal(entry[1].phone,undefined);assert.equal(entry[1].url,undefined);
 assert.match(entry[1].phoneFingerprint,/^[a-f0-9]{64}$/);
});
test('Consent-bound approved information template is sent once; no checkout link',async()=>{
 const f=fixture();
 const req=await f.grow.execute(user,'seller_growth_interest',{purpose:'advertise',whatsappConsent:true});
 await Promise.all([f.meta.deliver(req.reference),f.meta.deliver(req.reference)]);
 assert.equal(f.requests.length,1);
 const msg=JSON.parse(f.requests[0].options.body);
 assert.equal(msg.to,'27712345678');assert.equal(msg.type,'template');
 assert.deepEqual(msg.template,{name:'teyza_growth_ads_info',language:{code:'en'}});
 assert.ok(!JSON.stringify(msg).includes('teyza.co.za/'));
 assert.equal(f.records.get('teyzaWhatsAppGrowthOutbox/'+req.reference).status,'accepted');
 await f.meta.deliver(req.reference);assert.equal(f.requests.length,1);
});
test('Unapproved Meta template, changed contact, consent withdrawal and uncertain delivery are fail-closed',async()=>{
 const f=fixture(),req=await f.grow.execute(user,'seller_growth_interest',{purpose:'upgrade',whatsappConsent:true});
 f.unapprove();await f.meta.deliver(req.reference);assert.equal(f.requests.length,0);
 assert.equal(f.records.get('teyzaWhatsAppGrowthOutbox/'+req.reference).status,'configuration_required');
 const g=fixture(),r=await g.grow.execute(user,'seller_growth_interest',{purpose:'upgrade',whatsappConsent:true});
 g.records.set('teyzaWhatsAppPreferences/seller1',{ownerUid:'seller1',optedIn:false,consentAt:g.now+1000});
 await g.meta.deliver(r.reference);assert.equal(g.requests.length,0);
 assert.equal(g.records.get('teyzaWhatsAppGrowthOutbox/'+r.reference).status,'skipped');
 const h=fixture(),rr=await h.grow.execute(user,'seller_growth_interest',{purpose:'upgrade',whatsappConsent:true});
 h.records.set('teyzaSellerAccounts/seller1',{uid:'seller1',category:'spaza',phone:'+27821234567'});
 await h.meta.deliver(rr.reference);assert.equal(h.requests.length,0);
 const k=fixture(),x=await k.grow.execute(user,'seller_growth_interest',{purpose:'advertise',whatsappConsent:true});
 k.disconnect();await k.meta.deliver(x.reference);
 assert.equal(k.records.get('teyzaWhatsAppGrowthOutbox/'+x.reference).status,'needs_review');
 await k.meta.deliver(x.reference);assert.equal(k.requests.length,1);
});
