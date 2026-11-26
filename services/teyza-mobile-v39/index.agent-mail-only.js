'use strict';
// Deploy ONLY through the isolated agent-mail codebase. Never import this
// module into the live mobile service or its admin-only entrypoint.
const fs=require('node:fs'),path=require('node:path');
const admin=require('firebase-admin');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {defineJsonSecret}=require('firebase-functions/params');
const {MANUAL,createZohoSender,createWorker}=require('./agent-welcome-mail');
const zoho=defineJsonSecret('TEYZA_AGENT_MAIL_ZOHO');
if(!admin.apps.length)admin.initializeApp();
let sender;
const worker=createWorker({db:admin.firestore(),getAuthUser:uid=>admin.auth().getUser(uid),
 getSender:()=>sender??(sender=createZohoSender(zoho.value(),{pdf:fs.readFileSync(path.join(__dirname,MANUAL))}))});
exports.teyzaAgentWelcomeMail=onSchedule({region:'us-central1',schedule:'* * * * *',timeZone:'Africa/Johannesburg',
 maxInstances:1,concurrency:1,memory:'256MiB',timeoutSeconds:240,retryCount:0,secrets:[zoho]},async()=>{await worker.run();});
