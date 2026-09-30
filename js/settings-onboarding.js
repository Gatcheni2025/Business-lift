import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getWorkspaceSection,saveWorkspaceSection} from "./business-context.js?v=2";
const steps=[
 ['Business & verification','Your business details, phone, identity and verified address.','business-profile.html','◎'],
 ['Delivery & collection','Delivery services, customer fees and collection preferences.','delivery-settings.html','↗'],
 ['Payments & banking','Choose how you get paid and add your settlement details.','payments.html','○'],
 ['Shop preferences','Shop name, support contacts, returns, order and stock notifications.','shop-settings.html','⚙'],
 ['Sales channels','Choose and connect the channels you want to sell through.','sales-channels.html','⇄'],
 ['Store','Review your storefront and how customers see your business.','store.html','▣'],
 ['Partner network','Review your partner network preferences. Optional.','network.html','♧']
];
const params=new URLSearchParams(location.search);
const list=document.querySelector('#settings-list');
const stepParam=params.get('setupStep');
const requested=stepParam===null?null:Number(stepParam);
const step=Number.isInteger(requested)&&requested>=0&&requested<steps.length?requested:null;
let user=null,progress={};
function stepUrl(index){return steps[index][2]+'?setupStep='+index;}
if(list){
 steps.forEach(([title,description,url,icon])=>{const link=document.createElement('a');link.className='settings-row';link.href=url;link.innerHTML=`<span aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${description}</small></span><b aria-hidden="true">›</b>`;list.append(link);});
 document.querySelector('#settings-guide')?.remove();
 const start=document.querySelector('.settings-intro .simple-action');
 if(start)start.href=stepUrl(0);
}
if(step!==null&&location.pathname.endsWith('/'+steps[step][2])){
 const bar=document.createElement('section');bar.className='setup-navigation';bar.setAttribute('aria-label','Guided setup');
 bar.innerHTML=`<div><a href="settings.html">← Settings</a><strong>Step ${step+1} of ${steps.length} · ${steps[step][0]}</strong><p>Save your changes below, then continue. You can return to any setting later.</p></div><div class="setup-navigation-actions">${step>0?`<a href="${stepUrl(step-1)}">Back</a>`:''}<button type="button" data-setup-next>${step===steps.length-1?'Finish review':'Next →'}</button></div><p data-setup-status role="status"></p>`;
 document.querySelector('main')?.prepend(bar);
 bar.querySelector('[data-setup-next]').addEventListener('click',async event=>{
  const button=event.currentTarget,status=bar.querySelector('[data-setup-status]');button.disabled=true;
  try{
   if(!user)throw new Error('Please wait for your account to load.');
   const updated={...progress,reviewed:{...progress.reviewed,[steps[step][2]]:true},nextStep:Math.min(step+1,steps.length-1),reviewComplete:step===steps.length-1||progress.reviewComplete===true};
   await saveWorkspaceSection(user,'setupGuide',updated);
   location.assign(step===steps.length-1?'settings.html?reviewed=1':stepUrl(step+1));
  }catch(error){status.textContent=error.message;button.disabled=false;}
 });
}
onAuthStateChanged(auth,async current=>{
 if(!current)return;user=current;
 if(!list&&step===null)return;
 try{
  const saved=await getWorkspaceSection(user,'setupGuide');progress=saved.data||{};
  if(list){
   const start=document.querySelector('.settings-intro .simple-action');
   const next=Number(progress.nextStep||0);if(start)start.href=stepUrl(Number.isInteger(next)&&next>=0&&next<steps.length&&!progress.reviewComplete?next:0);
   if(params.get('reviewed')==='1'){const note=document.createElement('p');note.setAttribute('role','status');note.textContent='Settings review complete. Verification approval is tracked separately.';list.before(note);}
  }
 }catch(error){const status=document.querySelector('[data-setup-status]');if(status)status.textContent='Could not load review progress. '+error.message;}
});
