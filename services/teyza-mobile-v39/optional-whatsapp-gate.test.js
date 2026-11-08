'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('Core Teyza mobile function does not require WhatsApp Meta secrets by default',()=>{
  const src=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
  const optional=src.indexOf("if(process.env.TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED==='1' &&");
  const declaration=src.indexOf("defineSecret('TEYZA_WHATSAPP_ACCESS_TOKEN')");
  assert(optional>0,'WhatsApp registration must be explicitly opt-in');
  assert(declaration>optional,'WhatsApp secret must not be registered outside the opt-in block');
  assert(src.includes("process.env.TEYZA_ADMIN_DEPLOY_ONLY!=='1'"),'Scoped deployment must still suppress optional WhatsApp registration');
  assert(src.includes("exports.teyzaMobile=onRequest"),'Core mobile API remains exported independently of WhatsApp');
});
