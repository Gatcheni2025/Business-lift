'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');

test('Admin-only Firebase discovery exposes teyzaMobile and no unconfigured WhatsApp triggers',()=>{
 const deploy=require('./index.admin-only');
 assert.deepEqual(Object.keys(deploy),['teyzaMobile']);
 assert.equal(typeof deploy.teyzaMobile,'function');
 const endpoint=deploy.teyzaMobile.__endpoint;
 assert.equal(endpoint?.platform,'gcfv2');
 const serialized=JSON.stringify(endpoint);
 assert(serialized.includes('TEYZA_VERIFICATION_ENCRYPTION_KEY'));
 assert(serialized.includes('TEYZA_PAYSTACK_SECRET_KEY'));
 assert(!serialized.includes('TEYZA_WHATSAPP_ACCESS_TOKEN'));
});
test('Optional WhatsApp defineSecret is registered only outside admin-only discovery',()=>{
 const full=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');
 const isolated=fs.readFileSync(path.join(__dirname,'index.admin-only.js'),'utf8');
 const guard="if(process.env.TEYZA_ADMIN_DEPLOY_ONLY!=='1'){";
 const registration="const whatsappToken=defineSecret('TEYZA_WHATSAPP_ACCESS_TOKEN');";
 const pos=full.indexOf(guard),defined=full.indexOf(registration);
 assert(pos>=0,'WhatsApp exports must have an admin-only guard');
 assert(defined>pos,'Optional secret declaration must run only inside the guard');
 assert(full.indexOf('exports.teyzaWhatsAppApprovalCreated',pos)>defined);
 assert(full.indexOf('exports.teyzaWhatsAppApprovalPending',pos)>defined);
 assert(full.indexOf("const paystackCancellation=",pos)>defined);
 const setup=isolated.indexOf("process.env.TEYZA_ADMIN_DEPLOY_ONLY='1'");
 const requireIndex=isolated.indexOf("require('./index')");
 assert(setup>=0&&setup<requireIndex,'Set the opt-out BEFORE loading index.js');
 assert(!isolated.includes("defineSecret('TEYZA_WHATSAPP_ACCESS_TOKEN')"));
});
test('Admin-only runner cannot deploy all functions or lose original manifest',()=>{
 const runner=fs.readFileSync(path.resolve(__dirname,'../../tools/admin-release/deploy-mobile-only.cjs'),'utf8');
 const script=fs.readFileSync(path.resolve(__dirname,'../../DEPLOY-TEYZA-ADMIN-R327.ps1'),'utf8');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'package.json'),'utf8'));
 assert.equal(manifest.main,'index.js','The source package must always retain its normal entrypoint');
 assert(runner.includes("main:'index.admin-only.js'"));
 assert(runner.includes("functions:teyza-mobile:teyzaMobile"));
 assert(runner.includes("'--non-interactive'"));
 assert(runner.includes('finally{'));
 assert(runner.includes('fs.writeFileSync(manifestPath,original)'));
 assert(script.includes('deploy-mobile-only.cjs'));
});
