'use strict';
/**
 * Security boundary for separate Teyza WhatsApp OTP pilot endpoints.
 * Not exported as an HTTPS Cloud Function until an explicit operator flag
 * registers it. No login cookies or sessions; successful verification returns
 * one short-lived Firebase custom token for the EXISTING seller UID.
 *
 * All requests require Firebase App Check (web or native) and, for requests
 * with Origin, an exact approved HTTPS Teyza origin. No request body/OTP logs.
 */
const SAFE_ORIGINS=new Set(['https://teyza.co.za','https://www.teyza.co.za']);
function createWhatsAppOtpHttp({engine,verifyAppCheck,enabled=()=>false,
   origins=SAFE_ORIGINS,ipFromRequest=req=>req.socket?.remoteAddress}={}){
  if(!engine||typeof engine.begin!=='function'||typeof engine.verify!=='function'||
    typeof verifyAppCheck!=='function'||typeof enabled!=='function')
    throw Error('Incomplete OTP endpoint dependencies');
  async function handle(req,res){
    res.set('Cache-Control','no-store');
    res.set('Pragma','no-cache');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Vary','Origin');
    if(enabled()!==true){res.status(404).json({error:'Not found'});return;}
    const origin=req.get('Origin');
    if(origin&&(!origins.has(origin)||origin.includes('\n'))){
      res.status(403).json({error:'Forbidden'});return;
    }
    if(origin)res.set('Access-Control-Allow-Origin',origin);
    if(req.method==='OPTIONS'){
      if(!origin){res.status(403).end();return;}
      res.set('Access-Control-Allow-Methods','POST, OPTIONS');
      res.set('Access-Control-Allow-Headers','Content-Type, X-Firebase-AppCheck');
      res.set('Access-Control-Max-Age','600');
      res.status(204).end();return;
    }
    if(req.method!=='POST'){res.set('Allow','POST, OPTIONS');res.status(405).json({error:'Method not allowed'});return;}
    const route=(req.path||'').replace(/\/$/,'');
    if(route!=='/start'&&route!=='/verify'){res.status(404).json({error:'Not found'});return;}
    const type=(req.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
    const json=req.body;
    const length=Number(req.get('Content-Length')||0);
    if(type!=='application/json'||length>2048||!json||Array.isArray(json)||
       typeof json!=='object'||JSON.stringify(json).length>2048){
      res.status(400).json({error:'Invalid request'});return;
    }
    const appCheck=req.get('X-Firebase-AppCheck');
    if(typeof appCheck!=='string'||appCheck.length<20||appCheck.length>4096){
      res.status(401).json({error:'App verification required'});return;
    }
    try{await verifyAppCheck(appCheck);}
    catch{res.status(401).json({error:'App verification required'});return;}
    const keyset=Object.keys(json).sort().join(',');
    try{
      if(route==='/start'){
        if(keyset!=='phone'){res.status(400).json({error:'Invalid request'});return;}
        const remote=ipFromRequest(req);
        if(typeof remote!=='string'||remote.length<3||remote.length>128){
          res.status(503).json({error:'Verification temporarily unavailable'});return;
        }
        const result=await engine.begin({phone:json.phone,ip:remote});
        res.status(200).json({challengeId:result.challengeId,expiresInSeconds:result.expiresInSeconds});return;
      }
      if(keyset!=='challengeId,code'){res.status(400).json({error:'Invalid request'});return;}
      const result=await engine.verify({challengeId:json.challengeId,code:json.code});
      res.status(200).json({uid:result.uid,customToken:result.customToken});return;
    }catch{
      // Identical errors for wrong OTP, non-pilot accounts, disabled accounts,
      // Meta template rejection, exhausted challenges and unknown sellers.
      res.status(400).json({error:'WhatsApp verification could not be completed'});return;
    }
  }
  return {handle};
}
module.exports={createWhatsAppOtpHttp,SAFE_ORIGINS};
