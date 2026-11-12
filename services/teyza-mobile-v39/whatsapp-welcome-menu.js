'use strict';
// These predefined, link-free menus are returned ONLY within an authenticated
// WhatsApp 24-hour customer service window after the seller replies.
const WELCOME_BUTTONS=Object.freeze([
 {index:'0',payload:'TEYZA_WELCOME_SELL',title:'Start selling on Teyza'},
 {index:'1',payload:'TEYZA_WELCOME_ADS',title:'Advertise on Teyza'},
 {index:'2',payload:'TEYZA_WELCOME_SUPPORT',title:'Talk to consultant'}
]);
function welcomeTemplateComponents(){
 return WELCOME_BUTTONS.map(({index,payload})=>({
  type:'button',sub_type:'quick_reply',index,
  parameters:[{type:'payload',payload}]
 }));
}
function richWelcomeComponents({name,businessName,imageId}){
 if(!/^[0-9]{6,40}$/.test(String(imageId||'')))throw Error('Meta welcome image media ID is required.');
 if(!name||!businessName)throw Error('Approved seller name and business name are required.');
 return [
  {type:'header',parameters:[{type:'image',image:{id:imageId}}]},
  {type:'body',parameters:[
    {type:'text',text:name},
    {type:'text',text:businessName}
  ]},
  ...welcomeTemplateComponents()
 ];
}
function buttons(body){
 return {messaging_product:'whatsapp',type:'interactive',interactive:{
  type:'button',body:{text:body},action:{buttons:WELCOME_BUTTONS.map(({payload,title})=>({
   type:'reply',reply:{id:payload,title:title.length<=20?title:'Start selling'}
  }))}}};
}
function list(body,rows,title){
 return {messaging_product:'whatsapp',type:'interactive',interactive:{
  type:'list',body:{text:body},action:{
   button:'Choose a topic',sections:[{title,rows}]}}};
}
const row=(id,title,description)=>({id,title,description});
function responseFor(raw){
 const option=String(raw||'').trim();
 switch(option){
  case 'TEYZA_WELCOME_SELL':
   return list('Welcome to Teyza selling! Choose what you would like to learn. No purchase is initiated here.',[
    row('TEYZA_SELL_START','How to start','Verification, upgrade, product listing'),
    row('TEYZA_SELL_BENEFITS','Selling benefits','Local reach, wholesale offers and finance'),
    row('TEYZA_HOME','All services','Back to the welcome menu')
   ],'Selling on Teyza');
  case 'TEYZA_WELCOME_ADS':
   return list('Welcome to Teyza community advertising. Choose a topic for your local promotion.',[
    row('TEYZA_ADS_START','How to advertise','Create, submit and review an advert'),
    row('TEYZA_ADS_BENEFITS','Advertising benefits','Reach local shoppers within your radius'),
    row('TEYZA_HOME','All services','Back to the welcome menu')
   ],'Teyza advertising');
  case 'TEYZA_WELCOME_SUPPORT':
   return buttons('Thank you! Your request to speak with a friendly Teyza consultant has been added to the Teyza Support inbox. Our team can assist with account approvals, selling, advertising and general enquiries. Please never share passwords or OTPs here. Reply with another service option to explore while your request is reviewed.');
  case 'TEYZA_SELL_START':
   return buttons('How to start selling on Teyza:\n1. Register your spaza shop or business.\n2. Verify your phone, owner ID and business location.\n3. Wait for Teyza approval.\n4. Review available account upgrade options.\n5. Once eligible access is verified, add your products or services.\nUse the Teyza app for account help. Reply STOP to end WhatsApp updates.');
  case 'TEYZA_SELL_BENEFITS':
   return buttons('Benefits for eligible Teyza sellers:\n• Be discovered by nearby shoppers.\n• Showcase products or services and manage enquiries.\n• Connect with participating wholesalers for stock discounts and delivery offers.\n• Request business or stock-finance consideration (subject to approval).\nSelling access depends on account approval and eligibility.');
  case 'TEYZA_ADS_START':
   return buttons('To advertise to your community:\n1. Prepare your business image and promotional description.\n2. Choose your preferred local advertising radius.\n3. Submit the advert for Teyza review.\n4. Campaigns appear only after moderation and required payment verification.\nFor help, use the Teyza app Support inbox.');
  case 'TEYZA_ADS_BENEFITS':
   return buttons('Teyza Ads can help your business reach shoppers around your approved location. You can select your local radius and promote eligible products, services or offers. All adverts are reviewed before appearing in the app. This message does not initiate advertising payment.');
  case 'TEYZA_SUPPORT_APPROVAL':
   return buttons('Need help with approval? Check that your owner documents, selfie, verified number, shop photo and map location are complete. For personalised assistance, open Support in the Teyza app. Never send ID numbers, OTPs or passwords in this chat.');
  case 'TEYZA_SUPPORT_ORDERS':
   return buttons('To manage customer orders and enquiries, open your Teyza seller dashboard. Use Orders for requests and Messages for customer chats. For account problems, open Support in the app.');
  case 'TEYZA_HOME':
   return buttons('Welcome to Teyza Business! 🌱 What would you like to explore today?');
  default:return null;
 }
}
module.exports={WELCOME_BUTTONS,welcomeTemplateComponents,richWelcomeComponents,responseFor};
