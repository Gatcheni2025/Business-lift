const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('js/business-context.js','utf8')
  .replace(/^export /gm,'')+'\nthis.sectionApi={getWorkspaceSection,saveWorkspaceSection};';
const calls=[];
const sandbox={URLSearchParams,Map,document:{querySelectorAll:()=>[]},fetch:async(url,options)=>{
  const parsed=new URL(url,'https://teyza.co.za/');
  calls.push({url:parsed,options});
  assert.equal(parsed.searchParams.get('action'),'section');
  assert.equal(parsed.searchParams.get('section'),'delivery');
  return {ok:true,json:async()=>({ok:true,data:{pickupAddress:'12 Main Road'}})};
}};
vm.runInNewContext(source,sandbox);

(async()=>{
  const user={uid:'seller',getIdToken:async()=> 'test-token'};
  await sandbox.sectionApi.getWorkspaceSection(user,'delivery');
  await sandbox.sectionApi.saveWorkspaceSection(user,'delivery',{baseDeliveryFee:59.95});
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.headers.Authorization,'Bearer test-token');
  assert.equal(calls[1].options.method,'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body),{baseDeliveryFee:59.95});
  console.log('PASS: workspace section reads and writes use separate action and section parameters');
})().catch(error=>{console.error(error);process.exitCode=1});
