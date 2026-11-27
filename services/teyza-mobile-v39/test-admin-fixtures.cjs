'use strict';
// Test-only fixture adapters for existing synthetic business behaviour tests.
// Issue and validate real sessions through the production issuer. No production
// module imports this file, and raw dispatcher tests do not use these adapters.
const {createAdminSessions,protectedAdminAction}=require('./admin-session');
function passwordActor(actor){return {...actor,firebase:actor.firebase||{sign_in_provider:'password'}};}
const fixtureAdmin=(actor,action)=>actor?.teyzaAdmin===true&&actor.email_verified===true&&protectedAdminAction(action);
const currentRecord=actor=>({uid:actor.uid,emailVerified:true,disabled:false,customClaims:{teyzaAdmin:true}});
function isolatedDB(){
 const rows=new Map();
 return {doc:key=>({key,get:async()=>({exists:rows.has(key),data:()=>({...rows.get(key)})})}),
 runTransaction:async fn=>fn({get:ref=>ref.get(),set:(ref,value)=>rows.set(ref.key,{...value}),
 update:(ref,patch)=>rows.set(ref.key,{...rows.get(ref.key),...patch})})};
}
function withModuleAdminFixtures(factory){
 return options=>{
  const module=factory(options),clock=options.clock||Date.now;
  return {...module,execute:async(actor,action,...args)=>{
   if(!fixtureAdmin(actor,action))return module.execute(actor,action,...args);
   const identity=passwordActor(actor),issuer=createAdminSessions({db:isolatedDB(),clock,rate:async()=>{},getAuthUser:async()=>currentRecord(identity)});
   const {sessionToken}=await issuer.start(identity);
   return module.execute(await issuer.validate(identity,sessionToken),action,...args);
  }};
 };
}
function withServiceAdminFixtures(factory){
 return options=>{
  // Explicit raw fixture option: no synthetic claims or implicit session creation.
  if(options.rawAdminFixture===true)return factory(options);
  const actors=new Map(),tokens=new Map(),lookup=options.getAuthUser|| (async()=>null);
  const service=factory({...options,getAuthUser:async uid=>actors.get(uid)||lookup(uid)});
  return {...service,execute:async(actor,action,data={},token)=>{
   if(token!==undefined||!fixtureAdmin(actor,action))return service.execute(actor,action,data,token);
   const identity=passwordActor(actor),key=identity.uid+':'+identity.auth_time;
   const previous=actors.get(identity.uid);
   actors.set(identity.uid,currentRecord(identity));
   try{
    let session=tokens.get(key);
    if(!session){
     const started=await service.execute(identity,'admin_session_start');
     session=started.sessionToken;tokens.set(key,session);
    }
    return await service.execute(identity,action,data,session);
   }finally{if(previous)actors.set(identity.uid,previous);else actors.delete(identity.uid);}
  }};
 };
}
module.exports={withModuleAdminFixtures,withServiceAdminFixtures};
