'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('WhatsApp pilot client signs into the original Firebase UID without creating accounts',async()=>{
 const {createTeyzaOtpPilotClient}=await import('./whatsapp-otp-client.mjs');
 let signedInToken=null,calls=[],auth={currentUser:null};
 const client=createTeyzaOtpPilotClient({
  endpoint:'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaWhatsAppLoginOtpPilot',
  auth,getAppCheckToken:async()=> 'synthetic-pilot-app-check-token-1234',
  signInWithCustomToken:async(a,token)=>{
    signedInToken=token;
    a.currentUser={uid:'seller-existing-test',getIdToken:async()=> 'existing-id-token'};
    return {user:a.currentUser};
  },
  request:async(url,opts)=>{
    calls.push({url,opts});
    return {ok:true,json:async()=>url.endsWith('/start')
      ?{challengeId:'a'.repeat(48),expiresInSeconds:300}
      :{uid:'seller-existing-test',customToken:'issued-token-for-seller-existing-test'}};
  }
 });
 const start=await client.begin({phone:'+15555550123'});
 assert.equal(start.expiresInSeconds,300);
 const result=await client.verify({challengeId:start.challengeId,code:'654321'});
 assert.equal(result.uid,'seller-existing-test');
 assert.equal(signedInToken,'issued-token-for-seller-existing-test');
 assert.equal(calls.length,2);
 assert.equal(calls[1].opts.headers['X-Firebase-AppCheck'],'synthetic-pilot-app-check-token-1234');
 assert.equal(calls[1].opts.credentials,'omit');
});
test('signed-in UID mismatch stops login before changing Firebase auth',async()=>{
 const {createTeyzaOtpPilotClient}=await import('./whatsapp-otp-client.mjs');
 let signCalls=0;
 const client=createTeyzaOtpPilotClient({
  endpoint:'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaWhatsAppLoginOtpPilot',
  auth:{currentUser:{uid:'different-logged-user'}},
  getAppCheckToken:async()=> 'synthetic-pilot-app-check-token-1234',
  signInWithCustomToken:async()=>{signCalls++;},
  request:async()=>({ok:true,json:async()=>({uid:'seller-existing-test',customToken:'token'})})
 });
 await assert.rejects(client.verify({challengeId:'a'.repeat(48),code:'123456'}),/differs/);
 assert.equal(signCalls,0);
});
test('separate consent posts a verified existing-user Firebase ID token',async()=>{
 const {createTeyzaOtpPilotClient}=await import('./whatsapp-otp-client.mjs');
 let headers=null;
 const client=createTeyzaOtpPilotClient({
  endpoint:'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaWhatsAppLoginOtpPilot',
  auth:{currentUser:{uid:'seller-existing-test',getIdToken:async(force)=>{assert.equal(force,true);return 'synthetic-id-token';}}},
  getAppCheckToken:async()=> 'synthetic-pilot-app-check-token-1234',
  signInWithCustomToken:async()=>{},
  request:async(_,opts)=>{headers=opts.headers;return {ok:true,json:async()=>({enabled:true})};}
 });
 const result=await client.consent({agree:true});
 assert.equal(result.enabled,true);
 assert.equal(headers.Authorization,'Bearer synthetic-id-token');
});
