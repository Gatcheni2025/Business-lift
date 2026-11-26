'use strict';
// Independently deployed; never import into index.js or the mobile handler.
const admin=require('firebase-admin'),{onDocumentCreated}=require('firebase-functions/v2/firestore'),{defineJsonSecret}=require('firebase-functions/params');
const {createWorker}=require('./business-communications'),{zohoSender}=require('./business-communication-providers');
const zoho=defineJsonSecret('TEYZA_BUSINESS_MAIL_ZOHO');
if(!admin.apps.length)admin.initializeApp();
const worker=createWorker({db:admin.firestore(),channel:'email',send:d=>zohoSender(zoho.value())(d)});
exports.teyzaBusinessEmail=onDocumentCreated({document:'teyzaBusinessOutboundEmail/{id}',region:'us-central1',maxInstances:1,concurrency:1,memory:'256MiB',timeoutSeconds:90,retry:false,secrets:[zoho]},e=>worker.process(e.params.id));
