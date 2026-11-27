'use strict';
function uploadError(error){
 const code=Number(error?.code||error?.statusCode);
 const reference=code===404?'UPLOAD_STORAGE_MISSING':code===403?'UPLOAD_STORAGE_ACCESS':'UPLOAD_STORAGE_UNAVAILABLE';
 const message=code===404?'Photo storage has not been activated for Teyza.':code===403?'Teyza cannot access its photo storage.':'Photo storage is temporarily unavailable.';
 return Object.assign(new Error(message+' Your captured photo has not been discarded. Contact Teyza support with reference '+reference+'.'),{status:503,code:reference});
}
async function saveUpload(bucket,path,bytes,options){try{await bucket.file(path).save(bytes,options);}catch(error){throw uploadError(error);}}
async function uploadReadiness(bucket,secret){
 let encryption=false;try{encryption=Buffer.from(secret||'','base64').length===32;}catch(_){}
 if(!encryption)return {verificationUploads:false,uploadStatus:'VERIFICATION_KEY_NOT_CONFIGURED'};
 try{await bucket.getMetadata();return {verificationUploads:true,uploadStatus:'ready'};}
 catch(error){return {verificationUploads:false,uploadStatus:uploadError(error).code};}
}
module.exports={saveUpload,uploadError,uploadReadiness};
