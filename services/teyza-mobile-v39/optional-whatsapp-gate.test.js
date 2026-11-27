'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('Core Teyza mobile API does not bind WhatsApp secrets; webhook binds its own credentials',()=>{
 const src=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
 const gate=src.indexOf("if(process.env.TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED==='1'){");
 const optional=src.slice(gate);
 assert(gate>0,'WhatsApp approval workers must remain explicitly opt-in');
 assert(optional.includes("defineSecret('TEYZA_WHATSAPP_ACCESS_TOKEN')"),'Optional approval workers require their own scoped sender token');
 assert(src.includes("process.env.TEYZA_ADMIN_DEPLOY_ONLY!=='1'"),'Admin-only deployments suppress optional approval workers');
 assert(src.includes("exports.teyzaMobile=onRequest"),'Core mobile API remains independently exported');
 const mobile=src.match(/exports\.teyzaMobile=onRequest\(\{[^}]+\}/)?.[0]||'';
 assert(mobile,'Core mobile function declaration missing');
 assert(!mobile.includes('whatsAppWebhookReplyToken')&&!mobile.includes('whatsappToken'),
  'Core mobile API must not bind WhatsApp secrets');
 const webhook=src.match(/exports\.teyzaWhatsAppWebhook=onRequest\(\{[^}]+\}/)?.[0]||'';
 assert(webhook.includes('whatsAppWebhookReplyToken'),'Only the scoped webhook may use the pilot reply token');
 assert(webhook.includes('whatsAppWebhookAppSecret'),'Webhook must require HMAC signature secret');
 assert(webhook.includes('whatsAppWebhookVerifyToken'),'Webhook must retain Meta verification token');
 assert(src.includes("const whatsAppWebhookReplyToken=defineSecret('TEYZA_WHATSAPP_ACCESS_TOKEN')"),
  'Webhook reply credential must be sourced from Secret Manager');
});
