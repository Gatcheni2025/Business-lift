'use strict';
// ISOLATED staging-only scheduler entrypoint, not loaded by index.js or
// index.admin-only.js. No deployment configuration or live activation here.
// A separately reviewed staging deployment is required to enable this job.
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createAcquisition}=require('./business-acquisition');
const {refresh}=require('./acquisition-refresh');
const project='teyza-national-staging';
exports.teyzaAcquisitionReportingRefresh=onSchedule({
 region:'us-central1',schedule:'every 2 minutes',timeZone:'Africa/Johannesburg',
 serviceAccount:'teyza-national-validator@teyza-national-staging.iam.gserviceaccount.com',
 maxInstances:1,concurrency:1,memory:'512MiB',timeoutSeconds:240,retryCount:0
},async()=>{
 if(process.env.GCLOUD_PROJECT!==project||process.env.GCP_PROJECT&&process.env.GCP_PROJECT!==project||
  process.env.TEYZA_STAGING_REPORTING_PROJECT_NUMBER!=='472628000220'||process.env.TEYZA_STAGING_REPORTING_ENABLED!=='true'){
  console.log('Reporting refresh disabled or project not approved.');return;
 }
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIRESTORE_HOST)throw Error('Unexpected Firestore host override.');
 const app=getApps().find(a=>a.name==='teyza-reporting')||initializeApp({projectId:project},'teyza-reporting');
 const db=getFirestore(app);
 const forbidden=()=>{throw Error('External geography forbidden in reporting worker.');};
 const api=createAcquisition({db,geographyLookup:{resolve:forbidden,search:forbidden}});
 const result=await refresh({db,collect:api.collectReportingGeneration});
 // No prospect or payment data in operational logs.
 console.log(JSON.stringify({kind:result.kind,summaryWrites:result.summaryWrites,rowWrites:result.rowWrites,scopeWrites:result.scopeWrites,asOf:result.manifest?.asOf,retention:result.retention}));
 if(result.retention?.error)throw Error('Reporting retention requires review.');
});
