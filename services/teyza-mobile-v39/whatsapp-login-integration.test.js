'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createWhatsAppOtpMetaTransport}=require('./whatsapp-login-meta-transport');
const {createWhatsAppOtpHttp}=require('./whatsapp-login-http');

const settings={accessToken:'test-secret-access-token-long-enough',
  phoneNumberId:'1234567890123',wabaId:'9876543210123',apiVersion:'v26.0'};
const template={
  name:'teyza_auth_otp',status:'APPROVED',category:'AUTHENTICATION',language:'en',
  components:[{type:'BUTTONS',buttons:[{type:'OTP',otp_type:'COPY_CODE'}]}]
};
test('Meta OTP sender checks actual approved authentication category and emits copy-code template',async()=>{
  const calls=[];
  const transport=createWhatsAppOtpMetaTransport({...settings,
    request:async(url,options)=>{
      calls.push({url,options});
      if(options.method==='GET')return {ok:true,json:async()=>({data:[template]})};
      return {ok:true,json:async()=>({messages:[{id:'wamid.Synthetic123'}]})};
    }});
  const outcome=await transport.sendAuthenticationTemplate({
    phone:'+15555550123',otp:'357911',challengeId:'a'.repeat(48),template:'teyza_auth_otp'});
  assert.equal(outcome.accepted,true);
  assert.equal(calls.length,2);
  assert(calls[0].url.includes('/message_templates?'));
  assert.equal(calls[0].options.method,'GET');
  const request=JSON.parse(calls[1].options.body);
  assert.equal(request.type,'template');
  assert.equal(request.to,'15555550123');
  assert.equal(request.template.components[0].parameters[0].text,'357911');
  assert.equal(request.template.components[1].sub_type,'copy_code');
  assert.equal(request.template.components[1].parameters[0].coupon_code,'357911');
});
test('unapproved/wrong-category template fails without sending any OTP',async()=>{
  for(const variation of [{status:'PENDING'},{status:'REJECTED'},{category:'MARKETING'},
    {components:[]}]) {
    let posts=0;
    const meta=createWhatsAppOtpMetaTransport({...settings,request:async(_,options)=>{
      if(options.method==='POST')posts++;
      return {ok:true,json:async()=>({data:[{...template,...variation}]})};
    }});
    await assert.rejects(meta.sendAuthenticationTemplate({
      phone:'+15555550123',otp:'123456',challengeId:'b'.repeat(48),template:'teyza_auth_otp'}));
    assert.equal(posts,0);
  }
});
function response(){
  const out={headers:{},statusCode:200,body:null};
  out.set=(k,v)=>{out.headers[k]=v;return out;};
  out.status=n=>{out.statusCode=n;return out;};
  out.json=v=>{out.body=v;return out;};
  out.end=()=>out;
  return out;
}
function request({origin='https://teyza.co.za',method='POST',route='/start',body={phone:'+15555550123'},appCheck='app-check-token-valid-fixture-value',ip='192.0.2.3',authToken=''}={}){
  const headers={'origin':origin,'content-type':'application/json','x-firebase-appcheck':appCheck,'authorization':authToken};
  return {method,path:route,body,socket:{remoteAddress:ip},
    get:key=>headers[key.toLowerCase()]};
}
test('OTP endpoints remain HTTP 404 unless explicitly enabled',async()=>{
  const handler=createWhatsAppOtpHttp({engine:{setConsent:async()=>({enabled:true}),begin:async()=>({challengeId:'a'.repeat(48),expiresInSeconds:300}),
    verify:async()=>({uid:'seller-1',customToken:'synthetic-custom-token'})},
    verifyAppCheck:async()=>{},enabled:()=>false});
  const res=response();await handler.handle(request(),res);
  assert.equal(res.statusCode,404);
});
test('OTP API requires Firebase App Check and an approved origin',async()=>{
  const handler=createWhatsAppOtpHttp({engine:{setConsent:async()=>({enabled:true}),begin:async()=>({challengeId:'a'.repeat(48),expiresInSeconds:300}),
    verify:async()=>({uid:'seller-1',customToken:'synthetic-custom-token'})},
    verifyAppCheck:async token=>{if(!token.startsWith('app-check-'))throw Error('invalid');},
    enabled:()=>true});
  const foreign=response();await handler.handle(request({origin:'https://attacker.invalid'}),foreign);
  assert.equal(foreign.statusCode,403);assert(!foreign.headers['Access-Control-Allow-Origin']);
  const noCheck=response();await handler.handle(request({appCheck:'bad'}),noCheck);
  assert.equal(noCheck.statusCode,401);
  const valid=response();await handler.handle(request(),valid);
  assert.equal(valid.statusCode,200);assert.equal(valid.body.expiresInSeconds,300);
  assert.equal(valid.headers['Cache-Control'],'no-store');
  assert.equal(valid.headers['Access-Control-Allow-Origin'],'https://teyza.co.za');
});
test('OTP verification returns only an existing-UID Firebase custom token',async()=>{
  let call=0;
  const handler=createWhatsAppOtpHttp({engine:{setConsent:async()=>({enabled:true}),
    begin:async()=>{throw Error('not expected');},
    verify:async details=>{call++;assert.equal(details.code,'123456');
      return {uid:'seller-existing-01',customToken:'firebase-issued-token'};} },
    verifyAppCheck:async()=>{},enabled:()=>true});
  const res=response();await handler.handle(request({route:'/verify',
    body:{challengeId:'f'.repeat(48),code:'123456'}}),res);
  assert.equal(call,1);assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{uid:'seller-existing-01',customToken:'firebase-issued-token'});
});
test('OTP API refuses unknown JSON keys, paths and methods without exposing account details',async()=>{
  const handler=createWhatsAppOtpHttp({engine:{setConsent:async()=>({enabled:true}),begin:async()=>({}),verify:async()=>({})},
    verifyAppCheck:async()=>{},enabled:()=>true});
  for(const req of [request({route:'/surprise'}),request({body:{phone:'+15555550123',uid:'hijack'}}),
    request({method:'GET'})]){
    const res=response();await handler.handle(req,res);
    assert([400,404,405].includes(res.statusCode));
  }
});

test('login OTP consent endpoint requires a Firebase ID token and explicit choice',async()=>{
 let called=0;
 const handler=createWhatsAppOtpHttp({enabled:()=>true,verifyAppCheck:async()=>{},
   engine:{
     begin:async()=>{throw Error('unexpected');},
     verify:async()=>{throw Error('unexpected');},
     setConsent:async details=>{called++;assert.equal(details.agree,true);
       assert.equal(details.idToken,'synthetic-existing-user-session-token');return {enabled:true};}
   }});
 const noAuth=response();
 await handler.handle(request({route:'/consent',body:{agree:true}}),noAuth);
 assert.equal(noAuth.statusCode,401);
 const ok=response();
 await handler.handle(request({route:'/consent',body:{agree:true},
   authToken:'Bearer synthetic-existing-user-session-token'}),ok);
 assert.equal(ok.statusCode,200);assert.deepEqual(ok.body,{enabled:true});assert.equal(called,1);
});
