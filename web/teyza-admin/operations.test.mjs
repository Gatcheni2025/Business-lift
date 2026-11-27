import test from 'node:test';import assert from 'node:assert/strict';import {cents,statementRows} from './public/js/teyza-operations-model.mjs';
test('Rand input is converted exactly and rejects malformed or fractional-cent entries',()=>{assert.equal(cents('99'),9900);assert.equal(cents('99.50'),9950);for(const v of ['0','-2','99.999','1e3','NaN','1,000','<script>'])assert.throws(()=>cents(v));});
test('Statement descriptions are plain cell values, never interpolated as HTML',()=>{const rows=statementRows([{createdAt:1000,description:'<img onerror=alert(1)>',debitCents:9900,balanceCents:9900}]);assert.equal(rows[0][1],'<img onerror=alert(1)>');assert.equal(rows[0].length,7);});

test('Admin agent approval identifies Firebase account and requires inspected documents',async()=>{
 const {readFileSync}=await import('node:fs');
 const script=readFileSync(new URL('./public/js/teyza-field-admin.js',import.meta.url),'utf8');
 assert(script.includes('Agent sign-in: '));
 assert(script.includes('Account ID ending '));
 assert(script.includes('Approve this exact agent account'));
 assert(script.includes('Open the current ID/passport and CV before approving'));
 assert(script.includes("api('agent_admin_profile_decide'"));
 assert(script.includes('Check approval on work.html'));
});
