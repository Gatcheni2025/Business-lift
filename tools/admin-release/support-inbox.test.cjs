'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {paths,managedFiles,verify,check}=require('./publish-support-inbox-only.cjs');
const {supportAgentAccess}=require('./support-agent-access.cjs');
const root=path.resolve(__dirname,'../../web/teyza-admin/public');
test('Premium Support screen has a two-way chat interface with separated historical cases',()=>{
 const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
 const script=fs.readFileSync(path.join(root,'js/teyza-operations.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'assets/teyza-app-admin.css'),'utf8');
 assert(html.includes('Support inbox'));
 for(const marker of ['ops-chat-workspace','ops-chat-layout','ops-chat-sidebar',
   'ops-chat-thread-panel','ops-chat-messages','ops-chat-bubble','ops-chat-composer',
   'ops-support-cases','ops_support_thread','ops_support_reply'])
  assert(script.includes(marker),marker);
 assert(script.includes('whatsAppActive'));
 assert(script.includes('Meta accepted · delivery not confirmed'));
 assert(css.includes('@media(max-width:680px)'));
});
test('Independent support agent inbox uses Firebase login and secure server actions',()=>{
 const html=fs.readFileSync(path.join(root,'support-inbox.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'js/teyza-support-inbox.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'assets/teyza-support-inbox.css'),'utf8');
 assert(html.includes('noindex,nofollow'));
 assert(html.includes('WhatsApp Support Inbox'));
 for(const a of ['ops_whatsapp_support_inbox','ops_support_thread','ops_support_reply',
   'teyzaSupportAgent','getIdTokenResult','onAuthStateChanged','signOut'])
  assert(js.includes(a),a);
 assert(!html.includes('teyzaAdmin=true'));
 assert(css.includes('@media(max-width:760px)'));
});
test('Scoped publisher can add new inbox page and assets while preserving payment files',async()=>{
 assert.deepEqual(paths,[
  '/admin.html','/js/teyza-operations.js','/assets/teyza-app-admin.css',
  '/support-inbox.html','/js/teyza-support-inbox.js','/assets/teyza-support-inbox.css']);
 const managed=managedFiles();
 assert.equal(managed.size,6);
 const previous=new Map([
  ['/admin.html','old-admin'],['/js/teyza-operations.js','old-operations'],
  ['/assets/teyza-app-admin.css','old-css'],
  ['/pay/index.html','pay-unmodified'],
  ['/ads/index.html','ads-unmodified'],['/work.html','work-unmodified']]);
 const later=new Map([...previous,...[...managed].map(([p,v])=>[p,v.hash])]);
 verify(previous,later,managed);
 later.set('/pay/index.html','changed');
 assert.throws(()=>verify(previous,later,managed),/Unrelated Hosting file changed/);
 const version='sites/business-lift-3c19c/versions/production';
 const fake=missing=>({hosting:async(method,url)=>{
  if(method!=='GET')throw Error('Check may not write.');
  if(url.endsWith('/customDomains/teyza.co.za'))
   return {name:'projects/business-lift-3c19c/sites/business-lift-3c19c/customDomains/teyza.co.za'};
  if(url.endsWith('/channels/live'))return {release:{version:{name:version}}};
  if(url.endsWith('/versions/production/files'))
   return {files:[...previous].filter(([p])=>p!==missing)
     .map(([p,hash])=>({path:p,hash,status:'ACTIVE'}))};
  throw Error('Unexpected request '+url);
 }});
 await assert.doesNotReject(check(fake(null)));
 await assert.rejects(check(fake('/admin.html')),/missing required Admin files.*admin.html/);
});
test('Support operator role grant preserves other claims and refuses a full admin account',async()=>{
 const original={localId:'supportAgent123',email:'agent@example.org',emailVerified:true,
  customAttributes:JSON.stringify({someOtherClaim:true})};
 let user=structuredClone(original);
 const client={identity:async(method,url,body)=>{
  if(url.endsWith(':lookup'))return {users:[user]};
  if(url.endsWith(':update')){
   assert.equal(body.localId,original.localId);
   user={...user,customAttributes:body.customAttributes};
   return {localId:original.localId};
  }
  throw Error('Unknown URL');
 }};
 await supportAgentAccess({client,uid:original.localId,log:()=>{}});
 assert.equal(JSON.parse(user.customAttributes).teyzaSupportAgent,true);
 assert.equal(JSON.parse(user.customAttributes).someOtherClaim,true);
 await supportAgentAccess({client,uid:original.localId,revoke:true,log:()=>{}});
 assert.equal(JSON.parse(user.customAttributes).teyzaSupportAgent,undefined);
 assert.equal(JSON.parse(user.customAttributes).someOtherClaim,true);
 user={...original,customAttributes:JSON.stringify({teyzaAdmin:true})};
 await assert.rejects(supportAgentAccess({client,uid:original.localId,log:()=>{}}),/full administrator/);
});
