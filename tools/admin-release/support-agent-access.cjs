'use strict';
// Explicit operator-only grant for the limited customer support role.
// A support agent must NEVER gain teyzaAdmin or other privileges.
const {connect,PROJECT}=require('./firebase-client.cjs');
async function supportAgentAccess({client,uid,revoke=false,log=console.log}){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid||''))throw Error('Supply an exact Firebase Authentication UID.');
 const endpoint='/projects/'+PROJECT+'/accounts';
 const get=async()=>{
  const result=await client.identity('POST',endpoint+':lookup',{localId:[uid]});
  if(result.users?.length!==1||result.users[0].localId!==uid)throw Error('Firebase user UID was not found.');
  return result.users[0];
 };
 const user=await get();
 if(!revoke&&(user.disabled||user.emailVerified!==true||!user.email))
  throw Error('Agent must have an active Firebase account with a verified email.');
 let claims;
 try{claims=JSON.parse(user.customAttributes||'{}');}
 catch(_){throw Error('Unable to read existing custom claims. No changes made.');}
 if(!claims||typeof claims!=='object'||Array.isArray(claims))
  throw Error('Invalid existing claims; no changes made.');
 if(claims.teyzaAdmin===true&&!revoke)
  throw Error('This account has full administrator access. Do not add the support role to it.');
 if(revoke)delete claims.teyzaSupportAgent;
 else claims.teyzaSupportAgent=true;
 const serialized=JSON.stringify(claims);
 if(Buffer.byteLength(serialized)>1000)throw Error('Firebase custom claims exceed size limit.');
 await client.identity('POST',endpoint+':update',{
  localId:uid,customAttributes:serialized,
  ...(revoke?{validSince:String(Math.floor(Date.now()/1000))}:{})
 });
 const stored=JSON.parse((await get()).customAttributes||'{}');
 if(JSON.stringify(Object.entries(stored).sort())!==JSON.stringify(Object.entries(claims).sort()))
  throw Error('Support agent role verification failed.');
 log('Teyza support-agent access '+(revoke?'revoked':'granted')+' for '+user.email+'.');
 log('Have the agent sign out and sign in at https://teyza.co.za/support-inbox.html.');
 return claims;
}
if(require.main===module){
 const [cmd,uid]=process.argv.slice(2);
 if(!['grant','revoke'].includes(cmd))throw Error('Usage: node support-agent-access.cjs grant|revoke <UID>');
 connect().then(client=>supportAgentAccess({client,uid,revoke:cmd==='revoke'}))
  .catch(error=>{console.error('Support-agent access stopped:',error.message);process.exitCode=1;});
}
module.exports={supportAgentAccess};
