'use strict';
// Local setup only. stdin and stdout contain confidential credentials;
// capture stdout directly into Secret Manager. Never run with console logging.
const fs=require('node:fs');
const {configureZoho}=require('./agent-welcome-mail');
(async()=>{
 const c=JSON.parse(fs.readFileSync(0,'utf8'));
 const config=await configureZoho({...c,pdf:fs.readFileSync(process.argv[2])});
 process.stdout.write(JSON.stringify(config));
})().catch(e=>{process.stderr.write('Zoho setup failed ('+(/^TEYZA_MAIL_[A-Z0-9_]+$/.test(e?.code||'')?e.code:'invalid_input')+'). No applicant email was sent.');process.exitCode=1;});
