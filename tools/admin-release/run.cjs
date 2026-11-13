'use strict';
const path=require('node:path'),fs=require('node:fs');
const {connect}=require('./firebase-client.cjs'),{patch,rollback}=require('./hosting-patch.cjs'),{reviewer}=require('./reviewer.cjs');
function assertAdminBackend(health){
 const required=[
  'googlePlaceClaims','sellerApprovalBeforeCheckout','adminOperations','adminReview',
  'automaticProductPublication','adminPaystackVerify','adminComplimentaryAccess',
  'manualReceiptsRetired','historicSellerMandatesReadOnly',
  'adminMandatePdfExport','adminUsers','adminSellerDocuments','physicalGoodsPaystack'
 ];
 const closed=health?.sellerPaystackNewCheckoutDisabled===true&&
   health.sellerMembershipBillingMode==='checkout_disabled'&&
   health.paystackCheckoutAvailable===false;
 const restrictedPilot=health?.sellerPaystackNewCheckoutDisabled===false&&
   health.sellerMembershipBillingMode==='paystack_card_subscription'&&
   health.paystackCheckoutAvailable===true&&
   health.paystackRolloutMode==='pilot'&&
   health.membershipProrationEnabled===true&&
   health.subscriptionMonthlyCents===9900&&
   health.subscriptionTermsVersion==='seller-r99-calendar-proration-2026-11';
 if(health?.ok!==true||health.version!=='3.25.0'||health.agentCommissionEnabled!==false||
    health.adminProductReview!==false||(!closed&&!restrictedPilot)||
    health.sellerMandates!==false||
    health.sellerMandateRequestV3!==false||
    health.adminNetcashManualSubmission!==false||
    required.some(key=>health[key]!==true)){
   throw new Error('Backend does not confirm safe seller approval and closed/pilot-only Paystack operation. Hosting was not changed.');
 }
}
async function main(){
 const [action,uid]=process.argv.slice(2);
 if(!['deploy','rollback','grant','revoke'].includes(action))throw new Error('Use DEPLOY-ADMIN.ps1, GRANT-ADMIN.ps1 or ROLLBACK-ADMIN.ps1.');
 if(['grant','revoke'].includes(action)&&!/^[A-Za-z0-9_-]{1,128}$/.test(uid||''))throw new Error('Supply the exact Firebase administrator UID.');
 if(action==='deploy'){
  const r=await fetch('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',{signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error('The seller operations backend health check failed.');
  assertAdminBackend(await r.json());
 }
 const client=await connect(),backupPath=path.resolve(__dirname,'../../hosting-backup-teyza-admin-r327.json');
 const currentSource=path.resolve(__dirname,'../../web/teyza-admin/public');
 const bundleSource=path.resolve(__dirname,'../../public');
 const root=fs.existsSync(path.join(currentSource,'admin.html'))?currentSource:bundleSource;
 if(action==='deploy')await patch({client,root,backupPath});
 else if(action==='rollback')await rollback({client,backupPath});
 else await reviewer({client,uid,revoke:action==='revoke'});
}
if(require.main===module)main().catch(error=>{console.error('Teyza admin setup stopped:',error.message);process.exitCode=1;});
module.exports={main,assertAdminBackend};


