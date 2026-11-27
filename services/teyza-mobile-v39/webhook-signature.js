'use strict';
// Paystack signatures must cover the exact raw request bytes, never re-stringified JSON.
const crypto=require('node:crypto');
function compare(expected,received){
 if(typeof received!=='string'||!/^[a-f0-9]{128}$/i.test(received))return false;
 return crypto.timingSafeEqual(expected,Buffer.from(received,'hex'));
}
function verifyLegacy(secret,body,header){
 if(typeof secret!=='string'||!secret.startsWith('sk_')||!Buffer.isBuffer(body))return false;
 return compare(crypto.createHmac('sha512',secret).update(body).digest(),header);
}
// Paystack-Signature: t=<unix_seconds>,v1=whk_<key_id>:<hex_digest>[,v1=...]
// HMAC-SHA512 key = whole whsec_ secret, message = "<t>." + raw body.
// Reject a stale or malformed signed request; do not fall back to an older
// x-paystack-signature when a modern header is present but invalid.
function verifyModern(signingSecret,body,header,now=Date.now()){
 if(typeof signingSecret!=='string'||!signingSecret.startsWith('whsec_')||
   !Buffer.isBuffer(body)||typeof header!=='string'||header.length>4096||header.length<10||
   !Number.isFinite(now))return false;
 const fields=header.split(',');
 if(fields.length>12)return false;
 const timestampFields=fields.filter(f=>f.trim().startsWith('t='));
 if(timestampFields.length!==1)return false;
 const stamp=timestampFields[0].trim().slice(2);
 if(!/^\d{10,12}$/.test(stamp))return false;
 const seconds=Number(stamp);
 if(!Number.isSafeInteger(seconds)||Math.abs(now/1000-seconds)>300)return false;
 const values=fields.map(f=>f.trim()).filter(f=>f.startsWith('v1='))
   .map(f=>f.slice(3)).filter(v=>/^whk_[A-Za-z0-9_-]{1,128}:[a-f0-9]{128}$/i.test(v));
 if(!values.length)return false;
 const expected=crypto.createHmac('sha512',signingSecret)
   .update(stamp+'.','utf8').update(body).digest();
 return values.some(value=>compare(expected,value.slice(value.indexOf(':')+1)));
}
function verifyWebhook({raw,legacy,modern,secretKey,signingSecret,now=Date.now()}={}){
 // A present modern header, including an empty or malformed one, MUST
 // fail closed instead of downgrading to the legacy secret-key signature.
 if(modern!==undefined&&modern!==null)
   return verifyModern(signingSecret,raw,modern,now);
 return verifyLegacy(secretKey,raw,legacy);
}
module.exports={verifyLegacy,verifyModern,verifyWebhook};
