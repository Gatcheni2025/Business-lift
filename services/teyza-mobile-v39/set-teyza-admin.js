'use strict';
// Run only from an authorised local Admin SDK environment. Never ship credentials.
const admin=require('firebase-admin');
const [uid,flag]=process.argv.slice(2);
if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid||'')||!['--grant','--revoke'].includes(flag)){
 console.error('Usage: node set-teyza-admin.js FIREBASE_USER_UID --grant|--revoke');process.exit(1);
}
admin.initializeApp({projectId:'business-lift-3c19c'});
(async()=>{
 const user=await admin.auth().getUser(uid);
 if(flag==='--grant'&&(!user.emailVerified||user.disabled))throw new Error('Choose an enabled, email-verified reviewer account.');
 const claims={...(user.customClaims||{})};
 if(flag==='--grant')claims.teyzaAdmin=true;else delete claims.teyzaAdmin;
 await admin.auth().setCustomUserClaims(uid,claims);
 if(flag==='--revoke')await admin.auth().revokeRefreshTokens(uid);
 console.log(flag==='--grant'?'Reviewer access granted:':'Reviewer access revoked:',uid,user.email||'(no email)');
 console.log('The user must sign out and sign in again. Other custom claims were preserved.');
})().catch(e=>{console.error('Reviewer setup failed:',e.code||e.message);process.exitCode=1;});
