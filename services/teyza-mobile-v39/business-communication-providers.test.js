'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {zohoSender,whatsappSender}=require('./business-communication-providers');
test('Zoho sends one plain text message from official mailbox, requires real acceptance ID',async()=>{
 const calls=[],fetchImpl=async(url,opt)=>{calls.push({url,opt});return {ok:true,json:async()=>calls.length===1?{access_token:'synthetic-token'}:{status:{code:200},data:{messageId:'123'}}};};
 const send=zohoSender({region:'us',accountId:'12345',clientId:'synthetic',clientSecret:'synthetic',refreshToken:'synthetic'},{fetchImpl});
 assert.equal(await send({recipient:'shop@example.test',subject:'Test',body:'Hello'}),'123');
 assert.equal(calls.length,2);assert.equal(calls[0].url,'https://accounts.zoho.com/oauth/v2/token');
 assert.equal(calls[1].url,'https://mail.zoho.com/api/accounts/12345/messages');assert.equal(JSON.parse(calls[1].opt.body).fromAddress,'support@teyza.co.za');
 assert.equal(JSON.parse(calls[1].opt.body).mailFormat,'plaintext');
});
test('WhatsApp sends exactly one approved template to the recorded number',async()=>{
 let request;const send=whatsappSender('synthetic-access-token-only',{fetchImpl:async(url,opt)=>{request={url,body:JSON.parse(opt.body)};return {ok:true,json:async()=>({messages:[{id:'wamid.synthetic'}]})};}});
 assert.equal(await send({phoneNumberId:'123456789',apiVersion:'v26.0',recipient:'+27712345678',name:'approved_test',language:'en',businessName:'Synthetic Shop'}),'wamid.synthetic');
 assert.equal(request.body.type,'template');assert.equal(request.body.to,'27712345678');assert.equal(request.body.template.components[0].parameters[0].text,'Synthetic Shop');
});

test('Real pinned Firebase SDK discovers precisely one isolated worker for each channel',()=>{
 const {spawnSync}=require('node:child_process'),path=require('node:path');
 const script=path.resolve(__dirname,'../../tools/admin-release/deploy-business-communication-worker.cjs');
 for(const [channel,fn,collection] of [['email','teyzaBusinessEmail','teyzaBusinessOutboundEmail'],['whatsapp','teyzaBusinessWhatsApp','teyzaBusinessOutboundWhatsApp']]){
  const r=spawnSync(process.execPath,[script,channel,'--check-discovery'],{encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr||r.stdout||String(r.error||''));
  assert(r.stdout.includes('SDK discovery verified: '+fn+' | '+collection+'/{id} | exactly one Gen 2 endpoint.'));
  assert(r.stdout.includes('No production writes.'));
 }
});
