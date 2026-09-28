const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/onboarding-v2.js','utf8').replace(/^import .*;\n/gm,'');
const selectors=[...new Set([...source.matchAll(/\[data-ob-[^\]]+\]/g)].map(match=>match[0]))];
const nodes=new Map();
function node(){return {hidden:false,disabled:false,value:'',textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}},listeners:{},addEventListener(type,handler){this.listeners[type]=handler},replaceChildren(){},append(){},getAttribute(name){return this[name]},set src(value){this._src=value},get src(){return this._src}}}
for(const selector of selectors)nodes.set(selector,node());
nodes.set('#teyzaOnboarding',node());nodes.set('[data-ob-message]',node());nodes.set('[data-ob-business-frame]',node());
const frame=nodes.get('[data-ob-business-frame]');frame.contentWindow={};
const steps=[1,2,3].map(number=>Object.assign(node(),{dataset:{obStep:String(number)}}));
const tabs=[1,2,3].map(number=>Object.assign(node(),{dataset:{obTab:String(number)}}));
const payTabs=['eft','yeyza','ozow','payfast','other'].map(pay=>Object.assign(node(),{dataset:{obPay:pay}}));
const payFields=payTabs.map(tab=>Object.assign(node(),{dataset:{obPayFields:tab.dataset.obPay}}));
const groups={'[data-ob-step]':steps,'[data-ob-tab]':tabs,'[data-ob-pay]':payTabs,'[data-ob-pay-fields]':payFields};
const settings={};let ready={productReady:false,businessComplete:false,deliveryComplete:false,missingBusinessFields:['businessName'],businessVerification:{completed:0}};
let onAuth,sendMessage,navigated='',saves=[];
const sandbox={
 document:{querySelector:selector=>nodes.get(selector),querySelectorAll:selector=>groups[selector]||[],createTextNode:text=>({text}),createElement:()=>node(),body:{classList:{add(){},remove(){}}}},
 window:{addEventListener(type,handler){if(type==='message')sendMessage=handler}},location:{origin:'https://teyza.co.za',assign:path=>navigated=path},
 auth:{},onAuthStateChanged(_auth,handler){onAuth=handler},
 getWorkspaceSection:async(_user,section)=>({data:settings[section]||{}}),
 methods:[{code:'paxi_standard',mode:'courier',provider:'PAXI',name:'PAXI',guide:59.95,detail:'Standard bag'}],
 methodByCode:()=>({code:'paxi_standard',mode:'courier',provider:'PAXI',guide:59.95,detail:'Standard bag'}),
 methodFromSaved:()=>({code:'paxi_standard',mode:'courier',provider:'PAXI',guide:59.95,detail:'Standard bag'}),
 saveWorkspaceSection:async(_user,section,data)=>{settings[section]=data;saves.push(section);
  if(section==='delivery'){ready.deliveryComplete=true}
  if(['banking','payfast','paymentPreferences'].includes(section)){ready.productReady=true}
 },
 fetch:async()=>({ok:true,json:async()=>({ok:true,...ready})})
};
vm.runInNewContext(source,sandbox);
const click=async selector=>nodes.get(selector).listeners.click({currentTarget:nodes.get(selector)});
(async()=>{
 await onAuth({getIdToken:async()=> 'token'});
 assert.equal(steps[0].hidden,false);assert.equal(frame.src,'business-profile.html?embedded=1&setup=1');
 assert.equal(steps[1].hidden,true);
 await click('[data-ob-refresh]');assert.match(nodes.get('[data-ob-message]').textContent,/four verification checks/);
 ready={...ready,businessComplete:true,missingBusinessFields:[],businessVerification:{phoneVerified:true,identitySubmitted:true,locationConfirmed:true,proofOfAddressUploaded:true,location:{address:'12 Main Road',lat:-26.1,lng:28.0}}};
 sendMessage({origin:'https://evil.example',source:frame.contentWindow,data:{type:'teyza-onboarding-progress'}});
 assert.equal(steps[0].hidden,false,'foreign messages must not advance setup');
 sendMessage({origin:'https://teyza.co.za',source:frame.contentWindow,data:{type:'teyza-onboarding-progress'}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(steps[1].hidden,false);
 assert.equal(nodes.get('[data-ob-address]').textContent,'12 Main Road');nodes.get('[data-ob-fee]').value='25';
 await click('[data-ob-save-delivery]');assert.deepEqual(saves,['delivery']);assert.equal(steps[2].hidden,false);
 assert.equal(settings.delivery.pickupAddress,'12 Main Road');assert.equal(settings.delivery.baseDeliveryFee,25);
 nodes.get('[data-ob-bank]').value='Test bank';nodes.get('[data-ob-branch]').value='123456';nodes.get('[data-ob-holder]').value='A Seller';nodes.get('[data-ob-account]').value='12345678';
 await click('[data-ob-save-payment]');assert.deepEqual(saves,['delivery','banking']);assert.equal(navigated,'products.html#new-product');
 console.log('PASS: popup stays on verification until saved, ignores foreign messages, and advances through delivery and payment');
})().catch(error=>{console.error(error);process.exitCode=1});
