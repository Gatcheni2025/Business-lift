import test from 'node:test';
import assert from 'node:assert/strict';
import {ReviewState,createApi,filteredRows,photoBlob,serviceUrl} from './public/js/teyza-app-admin-model.mjs';

const row={sellerUid:'seller1',submissionId:'current-selfie',evidenceId:'current-document',shopName:'Corner Shop',category:'spaza'};
test('App admin sends the authenticated native review contract and preserves server errors',async()=>{
 const calls=[],actor={getIdToken:async()=>'private-token'},data={sellerUid:'seller1',evidenceId:'current-document'};
 const api=createApi({user:()=>actor,fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({ok:true,imageBase64:'photo'})};}});
 assert.equal((await api('seller_identity_read',data)).imageBase64,'photo');
 assert.equal(calls[0].url,serviceUrl);assert(!calls[0].url.includes('.php'));
 assert.deepEqual(JSON.parse(calls[0].options.body),{action:'seller_identity_read',data});
 assert.equal(calls[0].options.headers.Authorization,'Bearer private-token');assert.equal(calls[0].options.cache,'no-store');
 const denied=createApi({user:()=>actor,fetcher:async()=>({ok:false,status:409,json:async()=>({error:'This document changed. Refresh the review queue.'})})});
 await assert.rejects(denied('admin_seller_review'),e=>e.status===409&&e.message.includes('document changed'));
 let touched=false;await assert.rejects(createApi({user:()=>null,fetcher:async()=>{touched=true;}})('admin_seller_queue'),e=>e.status===401);assert(!touched);
});
test('Only two inspected current photos allow approval and current references are submitted',()=>{
 const state=new ReviewState();state.account('admin1');state.select(row);
 state.viewed('selfie',1000);assert(!state.canApprove(1001));
 state.viewed('identity',1000);assert(state.canApprove(1001));
 assert.deepEqual(state.decision('approved',' Looks correct ',1001),{sellerUid:'seller1',submissionId:'current-selfie',evidenceId:'current-document',status:'approved',reason:'Looks correct'});
 assert(!state.canApprove(301000));assert.throws(()=>state.decision('approved','',301000));
 state.select({...row,submissionId:'replacement'});assert(!state.canApprove());
});
test('Account and selection changes invalidate delayed evidence and prevent self-approval',()=>{
 const state=new ReviewState();state.account('admin1');state.select(row);let ticket=state.ticket();
 state.viewed('identity');state.viewed('selfie');state.account('admin2');assert(!state.current(ticket));assert.equal(state.views.size,0);assert.equal(state.selected,null);
 state.select(row);ticket=state.ticket();state.select({...row,sellerUid:'seller2'});assert(!state.current(ticket));
 state.account('seller1');state.select(row);state.viewed('identity');state.viewed('selfie');assert(!state.canApprove());assert.throws(()=>state.decision('approved',''));
});
test('Expired or missing documents cannot be approved and negative outcomes need a note',()=>{
 const state=new ReviewState();state.account('admin');state.select({...row,expired:true});state.viewed('identity');state.viewed('selfie');assert(!state.canApprove());
 assert.throws(()=>state.decision('rejected',''));assert.throws(()=>state.decision('needs_new_photo','  '));
 assert.equal(state.decision('needs_new_photo','Please retake in good light.').status,'needs_new_photo');
 assert.throws(()=>state.decision('rejected','x'.repeat(401)));
 state.select({...row,evidenceId:null});state.viewed('identity');state.viewed('selfie');assert(!state.canApprove());
});
test('Loaded seller search covers shop, phone, email, address and category without changing records',()=>{
 const rows=[{...row,phone:'+27712345678',ownerEmail:'owner@example.test',address:'Durban'},
  {...row,sellerUid:'retail',category:'retail',shopName:'Town Wholesalers'}];
 assert.equal(filteredRows(rows,'OWNER@','all')[0].sellerUid,'seller1');
 assert.equal(filteredRows(rows,'7123','spaza').length,1);assert.equal(filteredRows(rows,'durban','retail').length,0);
 assert.equal(filteredRows(rows,'','all').length,2);assert.equal(rows.length,2);
});
test('Only bounded JPEG evidence is converted to a temporary preview blob',()=>{
 assert.equal(photoBlob(Buffer.from([255,216,255,1,2,3]).toString('base64')).type,'image/jpeg');
 for(const value of [null,'%%%',Buffer.from('<svg>unsafe</svg>').toString('base64'),'a'.repeat(6000001)])assert.throws(()=>photoBlob(value));
});
