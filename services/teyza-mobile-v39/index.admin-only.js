'use strict';
// Single-function Firebase CLI discovery entrypoint for the R327 admin release.
// The full index.js remains untouched: its WhatsApp, Paystack, notification
// and scheduled functions stay deployed and retain their current secret bindings.
// Only teyzaMobile is exposed to the CLI for this explicit partial deploy.
// Set the marker before loading the functions module: Firebase registers
// defineSecret parameters during require(), not only when an endpoint runs.
// Keep this flag confined to the isolated admin-only entrypoint. Full index.js
// retains the WhatsApp endpoints and their secret bindings unchanged.
process.env.TEYZA_ADMIN_DEPLOY_ONLY='1';
const {teyzaMobile}=require('./index');
if(typeof teyzaMobile!=='function'||teyzaMobile.__endpoint?.platform!=='gcfv2'){
 throw Error('The expected second-generation teyzaMobile HTTPS handler was not found.');
}
module.exports={teyzaMobile};
