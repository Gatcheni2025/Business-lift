'use strict';
/**
 * Meta WhatsApp Cloud API sender for an approved AUTHENTICATION COPY_CODE OTP.
 * This is intentionally not used by the welcome/menu webhook.
 * No secrets, OTP values or phone numbers are written to logs.
 */
const TEMPLATE_NAME='teyza_auth_otp';
function createWhatsAppOtpMetaTransport({
  accessToken,phoneNumberId,wabaId,
  apiVersion='v26.0',templateName=TEMPLATE_NAME,language='en',
  request=fetch,timeoutMs=8000
}={}){
  if(typeof accessToken!=='string'||accessToken.length<20||
    !/^\d{5,25}$/.test(phoneNumberId||'')||
    !/^\d{5,25}$/.test(wabaId||'')||
    !/^v\d{2}\.\d+$/.test(apiVersion)||
    !/^[a-z][a-z0-9_]{3,100}$/.test(templateName)||
    !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)||
    typeof request!=='function')throw Error('Meta OTP sender configuration incomplete');
  const base='https://graph.facebook.com/'+apiVersion+'/';
  const headers={Authorization:'Bearer '+accessToken};
  async function checkedFetch(url,options={}){
    const response=await request(url,{...options,signal:AbortSignal.timeout(timeoutMs)});
    if(!response||typeof response.ok!=='boolean')throw Error('Invalid provider response');
    if(!response.ok)throw Error('Meta authentication template verification or delivery rejected');
    return response.json();
  }
  async function approvedTemplate(){
    const params=new URLSearchParams({
      name:templateName,fields:'name,status,category,language,components',limit:'5'
    });
    const result=await checkedFetch(base+wabaId+'/message_templates?'+params.toString(),
      {method:'GET',headers});
    const matches=(Array.isArray(result?.data)?result.data:[]).filter(t=>
      t?.name===templateName&&t?.language===language&&t?.status==='APPROVED'&&
      t?.category==='AUTHENTICATION');
    if(matches.length!==1)throw Error('Meta authentication template is not approved for this language');
    const parts=matches[0].components||[];
    const buttonPart=parts.find(c=>c.type==='BUTTONS');
    const hasCopyCode=Array.isArray(buttonPart?.buttons)&&buttonPart.buttons.some(b=>
      (b.type==='OTP'&&b.otp_type==='COPY_CODE')||b.type==='COPY_CODE');
    if(!hasCopyCode)throw Error('Meta template does not have an approved OTP copy-code button');
    return true;
  }
  async function sendAuthenticationTemplate({phone,otp,template,challengeId}={}){
    if(template!==templateName||typeof phone!=='string'||
       !/^\+[1-9]\d{7,14}$/.test(phone)||
       !/^\d{6}$/.test(otp)||
       typeof challengeId!=='string'||!/^[a-f0-9]{48}$/.test(challengeId))
       throw Error('Invalid authentication challenge');
    await approvedTemplate(); // Query actual Meta status, not a local "approved" flag.
    const payload={
      messaging_product:'whatsapp',recipient_type:'individual',
      to:phone.slice(1),type:'template',
      template:{name:templateName,language:{code:language},components:[
        {type:'body',parameters:[{type:'text',text:otp}]},
        {type:'button',sub_type:'copy_code',index:'0',
          parameters:[{type:'coupon_code',coupon_code:otp}]}
      ]}
    };
    const result=await checkedFetch(base+phoneNumberId+'/messages',
      {method:'POST',headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify(payload)});
    const accepted=typeof result?.messages?.[0]?.id==='string'&&
      result.messages[0].id.startsWith('wamid.');
    return {accepted}; // Accepted is not proof of delivery.
  }
  return {approvedTemplate,sendAuthenticationTemplate};
}
module.exports={createWhatsAppOtpMetaTransport,TEMPLATE_NAME};
