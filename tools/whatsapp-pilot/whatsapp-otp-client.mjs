/**
 * Client adapter for the separate, disabled WhatsApp login pilot.
 * NOT imported by Teyza live /pay, /ads, mobile or registration pages.
 * The server verifies the OTP and issues a custom Firebase token for the
 * EXISTING seller UID. Never create a new seller or phone-only Firebase user.
 */
export function createTeyzaOtpPilotClient({
 endpoint,auth,signInWithCustomToken,getAppCheckToken,request=fetch
}={}){
 if(typeof endpoint!=='string'||!/^https:\/\/us-central1-business-lift-3c19c\.cloudfunctions\.net\/teyzaWhatsAppLoginOtpPilot\/?$/.test(endpoint)||
   !auth||typeof signInWithCustomToken!=='function'||typeof getAppCheckToken!=='function'||
   typeof request!=='function')throw Error('Pilot not configured');
 const base=endpoint.replace(/\/$/,'');
 async function post(route,body,{idToken}={}){
   const appCheck=await getAppCheckToken();
   if(typeof appCheck!=='string'||appCheck.length<20)throw Error('App Check unavailable');
   const response=await request(base+route,{
     method:'POST',cache:'no-store',credentials:'omit',
     headers:{'Content-Type':'application/json','X-Firebase-AppCheck':appCheck,
       ...(idToken?{'Authorization':'Bearer '+idToken}:{})},
     body:JSON.stringify(body)
   });
   if(!response.ok)throw Error('WhatsApp pilot verification not completed');
   return response.json();
 }
 const begin=({phone})=>post('/start',{phone});
 async function verify({challengeId,code}){
   const result=await post('/verify',{challengeId,code});
   if(typeof result?.uid!=='string'||!result.uid||
     typeof result?.customToken!=='string'||!result.customToken)
       throw Error('Invalid server verified sign-in result');
   // Do not silently switch a signed-in user to another seller UID.
   if(auth.currentUser?.uid&&auth.currentUser.uid!==result.uid)
       throw Error('Signed-in seller differs from the verified account');
   const credential=await signInWithCustomToken(auth,result.customToken);
   if(credential?.user?.uid!==result.uid||auth.currentUser?.uid!==result.uid)
       throw Error('Firebase account identity mismatch');
   return {uid:result.uid};
 }
 async function consent({agree}){
   const user=auth.currentUser;
   if(!user||typeof user.getIdToken!=='function')throw Error('Sign in before granting OTP consent');
   if(typeof agree!=='boolean')throw Error('Explicit consent choice required');
   return post('/consent',{agree},{idToken:await user.getIdToken(true)});
 }
 return {begin,verify,consent};
}
