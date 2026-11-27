'use strict';
const {PROJECT}=require('./firebase-client.cjs');
async function reviewer({client,uid,revoke=false,log=console.log}){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid||''))throw new Error('Copy the exact administrator User UID from Firebase Authentication.');
 const endpoint='/projects/'+PROJECT+'/accounts';
 const read=async()=>{const r=await client.identity('POST',endpoint+':lookup',{localId:[uid]});
  if(r.users?.length!==1||r.users[0].localId!==uid)throw new Error('No unique Firebase account was found for that UID.');return r.users[0];};
 const user=await read();
 if(!revoke&&(user.disabled||user.emailVerified!==true||!user.email))throw new Error('Choose an enabled administrator account with a verified email. Sign in with Google or verify that account’s email first.');
 let claims;try{claims=JSON.parse(user.customAttributes||'{}');}catch(_){throw new Error('Existing custom claims could not be read. No changes were made.');}
 if(!claims||Array.isArray(claims)||typeof claims!=='object')throw new Error('Existing custom claims could not be read.');
 if(revoke)delete claims.teyzaAdmin;else claims.teyzaAdmin=true;
 const next=JSON.stringify(claims);if(Buffer.byteLength(next)>1000)throw new Error('Custom claims exceed the Firebase limit.');
 await client.identity('POST',endpoint+':update',{localId:uid,customAttributes:next,...(revoke?{validSince:String(Math.floor(Date.now()/1000))}:{})});
 const confirmed=JSON.parse((await read()).customAttributes||'{}');
 if(!require('node:util').isDeepStrictEqual(confirmed,claims))throw new Error('Reviewer claims could not be confirmed. Check this account in Firebase.');
 log((revoke?'Administrator access revoked: ':'Administrator access granted: ')+user.email+' ('+uid+').');
 log('Sign out and sign in at https://teyza.co.za/admin to refresh access. Other custom claims were preserved.');
 return claims;
}
module.exports={reviewer};
