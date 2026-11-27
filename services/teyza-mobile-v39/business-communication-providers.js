'use strict';
// Provider endpoints are fixed; secrets stay in the dedicated workers.
const {regions,SENDER}=require('./agent-welcome-mail');
async function json(fetchImpl,url,options){
 const r=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
 const b=await r.json();
 if(!r.ok||!b||typeof b!=='object')throw Error('provider_request_failed');
 return b;
}
function zohoSender(config,{fetchImpl=fetch}={}){
 if(!config||!Object.hasOwn(regions,config.region)||! /^\d{5,30}$/.test(config.accountId||'')||!['clientId','clientSecret','refreshToken'].every(k=>typeof config[k]==='string'&&config[k]))throw Error('zoho_configuration_required');
 const [accounts,mail]=regions[config.region];
 return async draft=>{
  const token=await json(fetchImpl,accounts+'/oauth/v2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken})});
  if(typeof token.access_token!=='string'||!token.access_token||token.error)throw Error('zoho_token_failed');
  const response=await json(fetchImpl,mail+'/api/accounts/'+config.accountId+'/messages',{method:'POST',headers:{Authorization:'Zoho-oauthtoken '+token.access_token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({fromAddress:SENDER,toAddress:draft.recipient,subject:draft.subject,content:draft.body,mailFormat:'plaintext',encoding:'UTF-8'})});
  const id=response?.data?.messageId;
  if(Number(response?.status?.code)!==200||!(typeof id==='string'&&/^\d{1,40}$/.test(id)||Number.isSafeInteger(id)&&id>0))throw Error('zoho_send_uncertain');
  return String(id);
 };
}
function whatsappSender(token,{fetchImpl=fetch}={}){
 if(typeof token!=='string'||token.length<20)throw Error('whatsapp_configuration_required');
 return async d=>{
  if(!/^\d{5,25}$/.test(d.phoneNumberId)||!/^v\d+\.\d+$/.test(d.apiVersion)||!/^\+27\d{9}$/.test(d.recipient))throw Error('whatsapp_configuration_required');
  const r=await json(fetchImpl,'https://graph.facebook.com/'+d.apiVersion+'/'+d.phoneNumberId+'/messages',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:d.recipient.slice(1),type:'template',template:{name:d.name,language:{code:d.language},components:[{type:'body',parameters:[{type:'text',text:d.businessName}]}]}})});
  const id=r?.messages?.[0]?.id;
  if(typeof id!=='string'||!/^wamid\./.test(id))throw Error('whatsapp_send_uncertain');
  return id;
 };
}
module.exports={zohoSender,whatsappSender};
