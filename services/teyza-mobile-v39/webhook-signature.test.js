'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {verifyLegacy,verifyModern,verifyWebhook}=require('./webhook-signature');
const raw=Buffer.from('{"event":"charge.success","data":{"reference":"TZM-example"}}','utf8');
const key='whsec_test_signing_secret_ABC123',legacySecret='sk_live_test_not_real';
const at=Date.parse('2026-11-09T15:20:00.000Z');
const stamp=String(Math.floor(at/1000));
function modern(body=raw,secret=key,seconds=stamp,ids=['whk_active123']){
 const signature=crypto.createHmac('sha512',secret).update(seconds+'.','utf8').update(body).digest('hex');
 return ['t='+seconds,...ids.map(x=>'v1='+x+':'+signature)].join(',');
}
test('A legacy Paystack raw-body signature remains accepted until migrated',()=>{
 const signature=crypto.createHmac('sha512',legacySecret).update(raw).digest('hex');
 assert(verifyLegacy(legacySecret,raw,signature));
 assert(verifyWebhook({raw,legacy:signature,secretKey:legacySecret,now:at}));
 assert(!verifyWebhook({raw:Buffer.concat([raw,Buffer.from(' ')]),legacy:signature,secretKey:legacySecret,now:at}));
});
test('Timestamped Paystack-Signature accepts whsec HMAC of exact t.raw and multiple v1 key IDs',()=>{
 const header=modern(raw,key,stamp,['whk_old123','whk_new456']);
 assert(verifyModern(key,raw,header,at));
 assert(verifyWebhook({raw,modern:header,legacy:'',secretKey:legacySecret,signingSecret:key,now:at}));
 assert(!verifyModern(key,Buffer.from('tampered'),header,at));
 assert(!verifyModern('whsec_some_other_secret',raw,header,at));
});
test('Modern signature protects against replay, missing secret, malformed key id, broken timestamp and altered payload',()=>{
 for(const offset of [-301000,301000])
   assert(!verifyModern(key,raw,modern(),at+offset),'Modern signature older/newer than 5 minutes must fail');
 assert(!verifyModern('',raw,modern(),at));
 assert(!verifyModern(key,raw,'t=invalid,v1=whk_active123:'+('a'.repeat(128)),at));
 assert(!verifyModern(key,raw,'t='+stamp+',v1=another_key:'+('a'.repeat(128)),at));
 assert(!verifyModern(key,raw,modern()+',t='+stamp,at));
 assert(!verifyModern(key,raw,'t='+stamp+',v1=whk_active123:not-a-hmac',at));
 assert(!verifyModern(key,raw,'t='+stamp,at));
 assert(!verifyModern(key,raw,modern().repeat(300),at));
});
test('An invalid modern header cannot fall back to a valid legacy signature',()=>{
 const old=crypto.createHmac('sha512',legacySecret).update(raw).digest('hex');
 assert(!verifyWebhook({raw,legacy:old,modern:'t='+stamp+',v1=whk_active123:'+('f'.repeat(128)),
   secretKey:legacySecret,signingSecret:key,now:at}));
 assert(!verifyWebhook({raw,legacy:old,modern:modern(raw,key,String(Number(stamp)-301)),
   secretKey:legacySecret,signingSecret:key,now:at}));
});
test('No unverified payload ever succeeds without a signature',()=>{
 assert(!verifyWebhook({raw,secretKey:legacySecret,signingSecret:key,now:at}));
 assert(!verifyWebhook({raw:'not bytes',modern:modern(),signingSecret:key,now:at}));
});
