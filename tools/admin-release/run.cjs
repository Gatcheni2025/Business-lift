'use strict';
const path=require('node:path');
const {connect}=require('./firebase-client.cjs'),{patch,rollback}=require('./hosting-patch.cjs'),{reviewer}=require('./reviewer.cjs');
async function main(){
 const [action,uid]=process.argv.slice(2);
 if(!['deploy','rollback','grant','revoke'].includes(action))throw new Error('Use DEPLOY-ADMIN.ps1, GRANT-ADMIN.ps1 or ROLLBACK-ADMIN.ps1.');
 if(['grant','revoke'].includes(action)&&!/^[A-Za-z0-9_-]{1,128}$/.test(uid||''))throw new Error('Supply the exact Firebase administrator UID.');
 if(action==='deploy'){
  const r=await fetch('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',{signal:AbortSignal.timeout(30000)});
  const health=await r.json();if(!r.ok||health.adminReview!==true||health.verificationUploads!==true||health.sellerOnboarding!==true)
   throw new Error('The existing mobile seller review and upload service is not ready. Deploy R3.15 first.');
 }
 const client=await connect(),backupPath=path.resolve(__dirname,'../../hosting-backup-R316.json');
 if(action==='deploy')await patch({client,root:path.resolve(__dirname,'../../public'),backupPath});
 else if(action==='rollback')await rollback({client,backupPath});
 else await reviewer({client,uid,revoke:action==='revoke'});
}
if(require.main===module)main().catch(error=>{console.error('Teyza admin setup stopped:',error.message);process.exitCode=1;});
module.exports={main};
