'use strict';
// Never accept app-reported success as a payment. Validate with the relevant
// store, its cryptographic signing authority and the original Teyza UID token.
const crypto=require('node:crypto');
const D=require('./domain');
const storeProducts=require('./shopper-ads-store-products');
const googlePackage=()=>process.env.TEYZA_GOOGLE_PLAY_PACKAGE||'';
const appleBundle=()=>process.env.TEYZA_APPLE_IAP_BUNDLE_ID||'';
const appleAppId=()=>Number(process.env.TEYZA_APPLE_IAP_APP_ID);
const tokenForUid=uid=>{
 const h=crypto.createHash('sha256').update('teyza-ad-account-v1:'+uid).digest('hex');
 // Deterministic opaque UUID for StoreKit 2 appAccountToken and Google account ID.
 return h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
};
const keyForPurchase=(platform,token)=>crypto.createHash('sha256')
 .update('teyza-ads-purchase-v1:'+platform+':'+token).digest('hex');
function permitted(){
 return process.env.TEYZA_ADS_STORE_BILLING_ENABLED==='true';
}
function requireServerReady(){
 if(!permitted())D.fail(503,'Store advertising purchases are not yet available. Your approved ad remains saved.');
}
function appleRoots(value){
 let parsed;
 try{parsed=JSON.parse(Buffer.from(value||'','base64').toString('utf8'));}
 catch(_){D.fail(503,'Apple IAP root certificate configuration is missing.');}
 if(!Array.isArray(parsed)||parsed.length<1||parsed.length>5)
  D.fail(503,'Apple IAP root certificates have not been configured.');
 return parsed.map(b64=>{
  if(typeof b64!=='string'||!/^[A-Za-z0-9+/=]+$/.test(b64)||b64.length<500)
   D.fail(503,'Invalid trusted Apple certificate format.');
  return Buffer.from(b64,'base64');
 });
}
function createProviderVerifier({getAppleApiKey=()=>'',getAppleRoots=()=>'',send=fetch,
  createGoogleAuth=()=>new (require('google-auth-library').GoogleAuth)({
   scopes:['https://www.googleapis.com/auth/androidpublisher']})}={}){
 async function google({productId,proof}){
  requireServerReady();
  const pkg=googlePackage();
  if(!/^[a-zA-Z][a-zA-Z0-9_.]{4,150}$/.test(pkg))
   D.fail(503,'Google Play package configuration is missing.');
  if(typeof proof!=='string'||proof.length<20||proof.length>5000)
   D.fail(422,'Valid Google Play purchase token required.');
  const auth=await createGoogleAuth().getClient();
  const access=await auth.getAccessToken();
  const token=typeof access==='string'?access:access?.token;
  if(!token)D.fail(503,'Google Play verification credentials unavailable.');
  const path='/androidpublisher/v3/applications/'+encodeURIComponent(pkg)+
   '/purchases/products/'+encodeURIComponent(productId)+'/tokens/'+encodeURIComponent(proof);
  let response;
  try{response=await send('https://androidpublisher.googleapis.com'+path,{
   headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error'});}
  catch(_){D.fail(503,'Google Play verification is temporarily unavailable.');}
  if(!response.ok)D.fail(503,'Google Play has not verified this purchase.');
  const receipt=await response.json();
  if(receipt.purchaseState!==0||receipt.productId&&receipt.productId!==productId||
     receipt.quantity!=null&&receipt.quantity!==1||
     receipt.refundableQuantity!=null&&receipt.refundableQuantity<1)
   D.fail(409,'Google Play purchase is pending, cancelled or not eligible.');
  if(receipt.consumptionState!==0&&receipt.consumptionState!==1)
   D.fail(409,'Google Play purchase consumption state is invalid.');
  return {platform:'android',provider:'google_play',productId,
   purchaseId:proof,accountToken:receipt.obfuscatedExternalAccountId||'',
   purchasedAt:Number(receipt.purchaseTimeMillis),
   environment:receipt.purchaseType===0?'sandbox':'production',
   alreadyConsumed:receipt.consumptionState===1};
 }
 async function googleConsume({productId,purchaseId}){
  requireServerReady();
  const pkg=googlePackage();
  const auth=await createGoogleAuth().getClient();
  const access=await auth.getAccessToken();
  const token=typeof access==='string'?access:access?.token;
  if(!token)D.fail(503,'Google Play consumption permission is missing.');
  const path='/androidpublisher/v3/applications/'+encodeURIComponent(pkg)+
   '/purchases/products/'+encodeURIComponent(productId)+'/tokens/'+encodeURIComponent(purchaseId)+':consume';
  const response=await send('https://androidpublisher.googleapis.com'+path,{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:'{}',redirect:'error'});
  if(!response.ok)D.fail(503,'The paid product is recorded, but Google Play consumption requires retry.');
  return true;
 }
 async function apple({productId,proof}){
  requireServerReady();
  const bundleId=appleBundle(),appId=appleAppId();
  const apiKey=getAppleApiKey();
  const issuer=process.env.TEYZA_APPLE_IAP_ISSUER_ID||'';
  const keyId=process.env.TEYZA_APPLE_IAP_KEY_ID||'';
  if(!/^[A-Za-z0-9.-]{6,150}$/.test(bundleId)||!Number.isSafeInteger(appId)||
     !apiKey.includes('BEGIN PRIVATE KEY')||!issuer||!keyId)
   D.fail(503,'Apple App Store Server verification is not configured.');
  if(typeof proof!=='string'||proof.length<200||proof.length>25000||proof.split('.').length!==3)
   D.fail(422,'Valid Apple StoreKit 2 signed transaction required.');
  const {SignedDataVerifier,AppStoreServerAPIClient,Environment}=
   require('@apple/app-store-server-library');
  const roots=appleRoots(getAppleRoots());
  const variants=[Environment.PRODUCTION];
  if(process.env.TEYZA_ADS_STORE_SANDBOX_ALLOWED==='true')
   variants.push(Environment.SANDBOX);
  let receipt,environment;
  for(const env of variants){
   try{
    const verifier=new SignedDataVerifier(roots,true,env,bundleId,
      env===Environment.PRODUCTION?appId:undefined);
    receipt=await verifier.verifyAndDecodeTransaction(proof);
    environment=env;break;
   }catch(_){/* Never trust an unsigned payload to determine environment. */}
  }
  if(!receipt)D.fail(409,'Apple signed transaction could not be verified.');
  if(!/^[0-9]{5,30}$/.test(String(receipt.transactionId||''))||
     receipt.productId!==productId||receipt.type!=='Consumable'||
     receipt.revocationDate!=null||
     receipt.inAppOwnershipType&&receipt.inAppOwnershipType!=='PURCHASED')
   D.fail(409,'Apple transaction does not match this active advertising purchase.');
  const client=new AppStoreServerAPIClient(apiKey,keyId,issuer,bundleId,environment);
  let info;
  try{info=await client.getTransactionInfo(String(receipt.transactionId));}
  catch(_){D.fail(503,'Apple transaction status cannot be confirmed right now.');}
  if(typeof info?.signedTransactionInfo!=='string')
   D.fail(503,'Apple did not return authoritative signed transaction status.');
  const verifier=new SignedDataVerifier(roots,true,environment,bundleId,
    environment===Environment.PRODUCTION?appId:undefined);
  let current;
  try{current=await verifier.verifyAndDecodeTransaction(info.signedTransactionInfo);}
  catch(_){D.fail(409,'Apple current signed transaction status is invalid.');}
  if(current.transactionId!==receipt.transactionId||current.productId!==productId||
     current.revocationDate!=null||current.type!=='Consumable')
   D.fail(409,'Apple transaction was revoked or differs from the purchase.');
  return {platform:'ios',provider:'apple_app_store',productId,
   purchaseId:String(current.transactionId),accountToken:current.appAccountToken||'',
   purchasedAt:Number(current.purchaseDate),
   environment:environment===Environment.PRODUCTION?'production':'sandbox'};
 }
 return {google,googleConsume,apple};
}
module.exports={createProviderVerifier,tokenForUid,keyForPurchase,permitted,
 requireServerReady,appleRoots};
