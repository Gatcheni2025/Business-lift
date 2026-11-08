'use strict';
// Single-function Firebase CLI discovery entrypoint for the R327 admin release.
// The full index.js remains untouched: its WhatsApp, Paystack, notification
// and scheduled functions stay deployed and retain their current secret bindings.
// Only teyzaMobile is exposed to the CLI for this explicit partial deploy.
const {teyzaMobile}=require('./index');
if(typeof teyzaMobile!=='function'||teyzaMobile.__endpoint?.platform!=='gcfv2'){
 throw Error('The expected second-generation teyzaMobile HTTPS handler was not found.');
}
module.exports={teyzaMobile};
