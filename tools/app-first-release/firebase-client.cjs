'use strict';
// Reuses the signed-in Firebase CLI account. Credentials stay inside firebase-tools.
// This adapter is pinned and is never shipped to the public website.
const PROJECT='business-lift-3c19c';
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
   if(!url.startsWith('https://upload-firebasehosting.googleapis.com/upload/'))throw new Error('Unexpected Hosting upload origin.');
   const target=new URL(url),client=new Client({urlPrefix:target.origin});
   await client.request({method:'POST',path:target.pathname,body:bytes,headers:{'Content-Type':'application/octet-stream'},responseType:'xml',timeout:60000});
  }
 };
}
module.exports={PROJECT,connect};
