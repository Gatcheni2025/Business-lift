'use strict';
// Reuses the signed-in Firebase CLI account. Credentials stay inside firebase-tools.
// This adapter is pinned and is never shipped to the public website.
const PROJECT='business-lift-3c19c';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function errorInfo(error){
 const seen=new Set(),queue=[error];let code='',http=null,network=false;
 while(queue.length&&seen.size<12){const e=queue.shift();if(!e||typeof e!=='object'||seen.has(e))continue;seen.add(e);
  if(typeof e.code==='string'&&/^[A-Z][A-Z0-9_]{1,39}$/.test(e.code))code=e.code;
  const status=e.context?.response?.statusCode??e.context?.response?.status;
  if(Number.isInteger(status)&&status>=400&&status<=599)http=status;
  if(typeof e.message==='string'&&/^(Failed to make request|Timeout reached making request)/.test(e.message))network=true;
  queue.push(e.original,e.cause);
 }
 return {code,http,network};
}
function retryable(info){return info.http!==null?[408,429,500,502,503,504].includes(info.http):info.network||/^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ERR_STREAM_PREMATURE_CLOSE|UND_ERR_[A-Z_]+)$/.test(info.code);}
async function uploadWithRetry(client,target,bytes,{wait=sleep,log=console.log}={}){
 for(let attempt=1;attempt<=4;attempt++){
  try{await client.request({method:'POST',path:target.pathname,body:bytes,headers:{'Content-Type':'application/octet-stream',...(attempt>1?{Connection:'close'}:{})},responseType:'xml',timeout:60000});return;}
  catch(error){const info=errorInfo(error);if(attempt===4||!retryable(info)){
   const detail=info.http!==null?'HTTP '+info.http:info.code||'network request failed';
   throw new Error('Firebase file upload failed ('+detail+'). No release was published by this step.');
  }
  log('Upload interrupted; retrying ('+(attempt+1)+'/4).');await wait(1000*2**(attempt-1));}
 }
}
async function connect(){
 const {getGlobalDefaultAccount,setActiveAccount}=require('firebase-tools/lib/auth');
 const {requireAuth}=require('firebase-tools/lib/requireAuth');
 const {Client}=require('firebase-tools/lib/apiv2');
 const options={project:PROJECT,nonInteractive:true};
 const account=getGlobalDefaultAccount();if(account)setActiveAccount(options,account);
 await requireAuth(options);
 const hosting=new Client({urlPrefix:'https://firebasehosting.googleapis.com',apiVersion:'v1beta1'});
 const identity=new Client({urlPrefix:'https://identitytoolkit.googleapis.com',apiVersion:'v1'});
 return {
  hosting:async(method,path,body,queryParams)=>(await hosting.request({method,path,body,queryParams,timeout:60000})).body,
  identity:async(method,path,body)=>(await identity.request({method,path,body,timeout:30000})).body,
  upload:async(url,bytes)=>{
   const target=new URL(url);
   if(target.protocol!=='https:'||target.hostname!=='upload-firebasehosting.googleapis.com'||target.port||target.username||target.password||target.search||target.hash||!/^\/upload\/sites\/business-lift-3c19c\/versions\/[A-Za-z0-9_-]+\/files\/[a-f0-9]{64}$/.test(target.pathname))throw new Error('Unexpected Hosting upload origin or path.');
   const client=new Client({urlPrefix:target.origin});
   await uploadWithRetry(client,target,bytes);
  }
 };
}
module.exports={PROJECT,connect,errorInfo,retryable,uploadWithRetry};
