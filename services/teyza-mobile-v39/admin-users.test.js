'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminUsers}=require('./admin-users');

const now=1_800_000_000_000;
const admin={uid:'admin1',teyzaAdmin:true,email_verified:true,auth_time:now/1000};
const regular={uid:'shopper1',email_verified:true,email:'shopper@example.test',auth_time:now/1000};
class FakeDB{
 constructor(){this.rows=new Map();}
 doc(path){const db=this;return {
   async get(){const record=db.rows.get(path);return {exists:record!==undefined,data:()=>record};},
   async set(data){db.rows.set(path,structuredClone(data));},
   async update(data){const old=db.rows.get(path);if(!old)throw Error('Missing '+path);
     db.rows.set(path,{...old,...structuredClone(data)});}
 };}
}
function fixture({sendFails=false}={}){
 const db=new FakeDB(),users=new Map([
  ['admin1',{uid:'admin1',email:'reviewer@teyza.co.za',emailVerified:true,
    disabled:false,customClaims:{teyzaAdmin:true},providerData:[]}],
  ['shopper1',{uid:'shopper1',email:'shopper@example.test',emailVerified:true,
    disabled:false,providerData:[{providerId:'password'}]}]
 ]);
 let counter=0;const sent=[],revoked=[];
 const findEmail=async email=>{const u=[...users.values()].find(x=>x.email===email);
   if(!u)throw Object.assign(Error('not found'),{code:'auth/user-not-found'});return u;};
 const service=createAdminUsers({db,clock:()=>now,
  rate:async()=>{},
  getAuthUser:async uid=>users.get(uid)||Promise.reject(Error('not found')),
  getAuthUserByEmail:findEmail,
  listAuthUsers:async(limit,pageToken)=>{
    const offset=pageToken?Number(pageToken):0;
    const all=[...users.values()].slice(offset,offset+limit);
    return {users:all,pageToken:offset+limit<users.size?String(offset+limit):undefined};
  },
  createAuthUser:async values=>{
    assert(values.password.length>=40);
    assert.equal(values.emailVerified,false);
    assert.equal(values.disabled,false);
    assert(!Object.prototype.hasOwnProperty.call(values,'customClaims'));
    const user={uid:'created'+(++counter),...values,providerData:[]};
    delete user.password;users.set(user.uid,user);return user;
  },
  updateAuthUser:async(uid,fields)=>{const old=users.get(uid);
    assert(old);const updated={...old,...fields};users.set(uid,updated);return updated;},
  revokeAuthTokens:async uid=>revoked.push(uid),
  sendPasswordResetEmail:async email=>{
    if(sendFails)throw Error('Firebase mail unavailable');
    sent.push(email);
  },
 });
 return {db,service,users,sent,revoked};
}
const reject=(promise,status)=>assert.rejects(promise,err=>err.status===status);

test('Only recently signed-in verified reviewers can list and create users',async()=>{
 const {service}=fixture();
 await reject(service.execute(regular,'ops_users'),403);
 await reject(service.execute({...admin,auth_time:now/1000-301},'ops_users'),401);
 await reject(service.execute({...admin,email_verified:false},'ops_users'),403);
 await reject(service.execute({...admin,teyzaPhoneBootstrap:true},'ops_users'),401);
 await reject(service.execute(regular,'ops_user_create',{
   email:'new@example.test',displayName:'A User',requestedRole:'shopper',confirmed:true}),403);
 const result=await service.execute(admin,'ops_users');
 assert.equal(result.users.length,2);
 assert(result.users.some(u=>u.admin===true));
 assert(result.users.every(u=>!Object.prototype.hasOwnProperty.call(u,'password')));
});
test('Admin creates a non-privileged shopper and mails a password setup link once',async()=>{
 const {service,users,sent,db}=fixture();
 const input={email:'New@Example.Test',displayName:'First Customer',
   requestedRole:'shopper',confirmed:true,teyzaAdmin:true,emailVerified:true};
 const created=await service.execute(admin,'ops_user_create',input);
 assert.equal(created.created,true);assert.equal(created.inviteSent,true);
 assert.equal(created.user.email,'new@example.test');
 assert.equal(created.user.verified,false);assert.equal(created.user.admin,false);
 assert.equal(created.user.registeredRole,'shopper');
 assert.deepEqual(sent,['new@example.test']);
 assert.equal(users.get(created.user.uid).customClaims,undefined);
 assert(!JSON.stringify(created).includes('password'));
 assert(db.rows.get('teyzaAdminUserAudit/'+created.user.uid)===undefined);
 const detail=await service.execute(admin,'ops_user_detail',{userUid:created.user.uid});
 assert.equal(detail.user.invitationStatus,'sent');
 assert.equal(detail.seller,null);
 await reject(service.execute(admin,'ops_user_create',input),409);
});
test('Seller account invitation does not bypass verification or grant shop approval',async()=>{
 const {service,db}=fixture();
 const result=await service.execute(admin,'ops_user_create',{
   email:'store@example.test',displayName:'Store Owner',requestedRole:'seller',confirmed:true});
 assert.equal(result.user.registeredRole,'seller');
 assert.equal(db.rows.get('teyzaSellerAccounts/'+result.user.uid),undefined);
 assert(!result.user.admin);
});
test('Failed email delivery is visible and reviewer may resend without recreating account',async()=>{
 const {service,db}=fixture({sendFails:true});
 const created=await service.execute(admin,'ops_user_create',{
   email:'owner@example.test',displayName:'Owner',requestedRole:'seller',confirmed:true});
 assert.equal(created.created,true);
 assert.equal(created.inviteSent,false);
 assert.equal(db.rows.get('teyzaAdminProvisionedUsers/'+created.user.uid).invitationStatus,'failed');
 await assert.rejects(service.execute(admin,'ops_user_invite',{userUid:created.user.uid}),/Firebase mail unavailable/);
});
test('Suspend and reinstate regular users, revoke tokens and protect admins and self',async()=>{
 const {service,users,revoked}=fixture();
 await reject(service.execute(admin,'ops_user_set_disabled',{
   userUid:'admin1',disabled:true,confirmed:true}),403);
 await reject(service.execute(admin,'ops_user_set_disabled',{
   userUid:'shopper1',disabled:true}),422);
 await service.execute(admin,'ops_user_set_disabled',{
   userUid:'shopper1',disabled:true,confirmed:true});
 assert.equal(users.get('shopper1').disabled,true);
 assert.deepEqual(revoked,['shopper1']);
 await service.execute(admin,'ops_user_set_disabled',{
   userUid:'shopper1',disabled:false,confirmed:true});
 assert.equal(users.get('shopper1').disabled,false);
 assert.deepEqual(revoked,['shopper1']);
 await reject(service.execute(admin,'ops_user_invite',{userUid:'admin1'}),403);
});
