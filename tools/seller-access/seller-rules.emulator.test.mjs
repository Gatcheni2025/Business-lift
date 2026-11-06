import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc,serverTimestamp,Timestamp} from 'firebase/firestore';
import fs from 'node:fs';
import {repairRules} from './repair-seller-rules.mjs';
let env;
const account=(uid,category='spaza')=>({uid,category,shopName:'KZN Market',ownerEmail:uid+'@example.test',phone:'0311234567',
  address:'Durban',companyName:'',registrationNumber:'',approvalStatus:'pending',listingStatus:'not_listed',createdAt:Timestamp.fromMillis(1000),updatedAt:Timestamp.fromMillis(1000)});
const product=uid=>({ownerUid:uid,name:'Bread',category:'Groceries',description:'',priceCents:1800,stockQty:10,status:'draft',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
const db=uid=>env.authenticatedContext(uid,{email:uid+'@example.test',email_verified:true}).firestore();
before(async()=>{
  const rules=repairRules(fs.readFileSync(new URL('emulator.rules',import.meta.url),'utf8')).rules;
  env=await initializeTestEnvironment({projectId:'demo-teyza-seller-access',firestore:{rules}});
  await env.withSecurityRulesDisabled(async context=>{
    for(const [uid,type] of [['owner1','spaza'],['owner2','retail']]){
      await setDoc(doc(context.firestore(),'teyzaSellerAccounts',uid),account(uid,type));
      await setDoc(doc(context.firestore(),'teyzaDraftProducts',uid,'items','bread'),product(uid));
    }
  });
});
after(async()=>{await env?.cleanup();});
test('Pending Spaza and retail owners can read only their own account and draft list',async()=>{
  for(const uid of ['owner1','owner2']){
    const own=db(uid);assert.equal((await assertSucceeds(getDoc(doc(own,'teyzaSellerAccounts',uid)))).data().approvalStatus,'pending');
    await assertSucceeds(getDocs(collection(own,'teyzaDraftProducts',uid,'items')));
    await assertFails(getDoc(doc(own,'teyzaSellerAccounts',uid==='owner1'?'owner2':'owner1')));
    await assertFails(getDocs(collection(own,'teyzaSellerAccounts')));
  }
});
test('Anonymous and unrelated accounts cannot read private shop or product documents',async()=>{
  for(const other of [env.unauthenticatedContext().firestore(),db('stranger')]){
    await assertFails(getDoc(doc(other,'teyzaSellerAccounts','owner1')));
    await assertFails(getDoc(doc(other,'teyzaDraftProducts','owner1','items','bread')));
    await assertFails(getDocs(collection(other,'teyzaDraftProducts','owner1','items')));
  }
});
test('Owners may edit profile details but cannot grant approval, activation, category or public writes',async()=>{
  const own=db('owner1'),ref=doc(own,'teyzaSellerAccounts','owner1');
  await assertSucceeds(updateDoc(ref,{shopName:'Updated Market',updatedAt:serverTimestamp()}));
  for(const data of [{approvalStatus:'approved'},{listingStatus:'active'},{category:'retail'}])
    await assertFails(updateDoc(ref,{...data,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(own,'teyzaPublicShops','owner1'),{status:'active'}));
});
test('Product writes require approval and paid or complimentary access; owner can still remove a draft',async()=>{
  const own=db('owner1'),ref=doc(own,'teyzaDraftProducts','owner1','items','new-bread');
  await assertFails(setDoc(ref,product('owner1')));
  await env.withSecurityRulesDisabled(async context=>{
    await updateDoc(doc(context.firestore(),'teyzaSellerAccounts','owner1'),{approvalStatus:'approved',listingPlan:'basic'});
    await setDoc(doc(context.firestore(),'teyzaBilling','owner1'),{ownerUid:'owner1',status:'paid',paymentEnvironment:'live',paidUntil:Date.now()+86400000});
  });
  await assertSucceeds(setDoc(ref,product('owner1')));
  await assertSucceeds(updateDoc(ref,{stockQty:8,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{ownerUid:'owner2',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{status:'published',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{stockQty:-1,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{createdAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp()}));
  await assertFails(deleteDoc(doc(db('owner2'),'teyzaDraftProducts','owner1','items','new-bread')));
  await assertSucceeds(deleteDoc(ref));
  await env.withSecurityRulesDisabled(async context=>{
    await updateDoc(doc(context.firestore(),'teyzaBilling','owner1'),{paymentEnvironment:'test'});
  });
  await assertFails(setDoc(ref,product('owner1')));
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'teyzaBilling','owner1'),{ownerUid:'owner1',adminComplimentaryStatus:'active',
      adminComplimentaryReason:'Approved pilot access',adminComplimentaryBy:'reviewer1',adminComplimentaryUntil:Date.now()+86400000});
  });
  await assertSucceeds(setDoc(ref,product('owner1')));
  await env.withSecurityRulesDisabled(async context=>{
    await updateDoc(doc(context.firestore(),'teyzaSellerAccounts','owner1'),{approvalStatus:'pending'});
  });
  await assertFails(updateDoc(ref,{stockQty:3,updatedAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(ref));
});
test('A missing own account returns a missing document; drafts still require registered ownership',async()=>{
  const own=db('newowner');assert.equal((await assertSucceeds(getDoc(doc(own,'teyzaSellerAccounts','newowner')))).exists(),false);
  await assertFails(getDocs(collection(own,'teyzaDraftProducts','newowner','items')));
  await assertFails(setDoc(doc(own,'teyzaSellerAccounts','newowner'),{...account('newowner'),approvalStatus:'approved',createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(doc(own,'teyzaSellerAccounts','newowner'),{...account('newowner'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(getDocs(collection(own,'teyzaDraftProducts','newowner','items')));
});

test('Unverified email accounts can register but cannot add products before approval',async()=>{
  const own=env.authenticatedContext('phoneowner',{email:'phoneowner@example.test',email_verified:false}).firestore();
  await assertSucceeds(setDoc(doc(own,'teyzaSellerAccounts','phoneowner'),{...account('phoneowner'),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(own,'teyzaDraftProducts','phoneowner','items','bread'),product('phoneowner')));
  for(const name of ['teyzaSellerIdentity','teyzaSellerOnboarding','teyzaMobileVerification','teyzaShopClaims','teyzaClaimedPlaces','teyzaWhatsAppPreferences','teyzaWhatsAppApprovalOutbox']){
    await assertFails(getDoc(doc(own,name,'phoneowner')));
    await assertFails(setDoc(doc(own,name,'phoneowner'),{sellingStatus:'active',phoneVerified:true,status:'approved'}));
  }
});

test('Agent approval, evidence, attribution and commission records remain server-only even for admin clients',async()=>{
 const contexts=[env.unauthenticatedContext().firestore(),db('agent1'),env.authenticatedContext('reviewer',{teyzaAdmin:true,email_verified:true}).firestore()];
 for(const client of contexts)for(const name of ['teyzaFieldAgents','teyzaAgentVisits','teyzaAgentEvidence','teyzaAgentCaptures','teyzaAgentClaims','teyzaSellerAgentAttribution','teyzaAgentCommissions','teyzaAgentPayoutReferences','teyzaAgentReviewViews','teyzaAgentAudit']){
  await assertFails(getDoc(doc(client,name,'agent1')));await assertFails(setDoc(doc(client,name,'agent1'),{uid:'agent1',status:'approved',amountCents:9900}));
 }
});
