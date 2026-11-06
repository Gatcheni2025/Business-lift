import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readCurrentRules,prepareKnownRules} from './read-live-rules.mjs';

const account=fs.readFileSync(new URL('seller-account-legacy.rules',import.meta.url),'utf8');
const drafts=fs.readFileSync(new URL('seller-drafts-legacy.rules',import.meta.url),'utf8');
const known=`rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { ${account}\n${drafts}\n } }`;
const fake=(name='projects/business-lift-3c19c/rulesets/abc-123',files=[{name:'firestore.rules',content:known}])=>({
 requests:[],async request(req){this.requests.push(req);return {body:this.requests.length===1?{rulesetName:name}:{source:{files}}};}
});
test('Reads only the default Firestore release and its project ruleset',async()=>{
 const client=fake();assert.equal(await readCurrentRules(client),known);
 assert.deepEqual(client.requests.map(x=>[x.method,x.path]),[
  ['GET','/projects/business-lift-3c19c/releases/cloud.firestore'],
  ['GET','/projects/business-lift-3c19c/rulesets/abc-123']]);
 const candidate=prepareKnownRules(known).rules;
 assert.match(candidate,/function hasProductAccess/);assert.match(candidate,/validShape\(false\)/);
});
test('Different projects, changed rules and unexpected sources fail without a candidate',async()=>{
 await assert.rejects(readCurrentRules(fake('projects/another/rulesets/abc-123')));
 await assert.rejects(readCurrentRules(fake(undefined,[])));
 assert.throws(()=>prepareKnownRules(known.replace("status == 'draft'","status == 'live'")),/differ from the reviewed copy/);
});
