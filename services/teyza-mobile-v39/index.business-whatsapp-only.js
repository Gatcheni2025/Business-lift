'use strict';
// Independently deployed; only approved marketing/service templates.
const admin=require('firebase-admin'),{onDocumentCreated}=require('firebase-functions/v2/firestore'),{defineSecret}=require('firebase-functions/params');
const {createWorker}=require('./business-communications'),{whatsappSender}=require('./business-communication-providers');
const meta=defineSecret('TEYZA_WHATSAPP_ACCESS_TOKEN');
if(!admin.apps.length)admin.initializeApp();
const worker=createWorker({db:admin.firestore(),channel:'whatsapp',send:d=>whatsappSender(meta.value())(d)});
exports.teyzaBusinessWhatsApp=onDocumentCreated({document:'teyzaBusinessOutboundWhatsApp/{id}',region:'us-central1',maxInstances:1,concurrency:1,memory:'256MiB',timeoutSeconds:90,retry:false,secrets:[meta]},e=>worker.process(e.params.id));
