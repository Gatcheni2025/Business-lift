import {startPhone,confirmPhone,clearPhone} from './work-phone.mjs';
import {auth,ready,api,el} from './work-auth.mjs';
import {onAuthStateChanged,GoogleAuthProvider,OAuthProvider,signInWithPopup,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
const $=id=>document.getElementById(id),token=location.hash.slice(1);let epoch=0,busy=false;
function notice(text,error=false){$('notice').textContent=text;$('notice').className='notice'+(error?' error':'');$('notice').hidden=false;}
async function run(fn){if(busy)return;busy=true;const ticket=epoch,buttons=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);try{await fn();}catch(e){if(ticket===epoch)notice(e.message,true);}finally{busy=false;buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});}}
function check(f,name,text){const l=el('label',undefined,'check'),i=el('input');i.type='checkbox';i.name=name;i.required=true;l.append(i,el('span',text));f.append(l);return i;}
async function load(){
 const ticket=epoch,r=await api('agent_owner_inspect',{token});if(ticket!==epoch)return;
 const root=$('ownerWorkspace');root.hidden=false;
 root.replaceChildren(el('span','SHOP OWNER CONFIRMATION','eyebrow'),el('h1',r.visit.shopName),el('p',r.visit.address),el('p','Agent: '+r.visit.agentName));
 if(!r.registered){root.append(el('p','Register your shop for free in the Teyza app using this account, then return to this link. The agent cannot register or make a purchase on your behalf.'));const a=el('a','Get the Teyza app','primary');a.href='/download.html#sellers';root.append(a);return;}
 root.append(el('p','Your registered shop: '+r.shopName));
 if(!r.confirmed){const f=el('form');check(f,'consent','I confirm this agent assisted my shop and I agree to link this visit to my registered shop.');const b=el('button','Confirm agent visit','primary');b.type='submit';f.append(b);f.onsubmit=e=>{e.preventDefault();if(!f.reportValidity())return;run(async()=>{await api('agent_owner_confirm',{token,consent:true});await load();notice('Your shop confirmation was recorded.');});};root.append(f);return;}
 root.append(el('h2','Visit confirmed'),el('p','Thank you. This confirmation does not approve your shop or collect a payment.','warning'),el('p','Registration is free. When you choose to add products, membership is R49 for the first month and R99 per month thereafter, subject to the available payment method.'));
 const a=el('a','Return to the app','outline');a.href='/download.html#sellers';root.append(a);
}
$('loginForm').onsubmit=e=>{e.preventDefault();run(async()=>{await ready;await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);});};$('google').onclick=()=>run(async()=>{await ready;await signInWithPopup(auth,new GoogleAuthProvider());});$('apple').onclick=()=>run(async()=>{await ready;await signInWithPopup(auth,new OAuthProvider('apple.com'));});$('sendPhoneCode').onclick=()=>run(async()=>{await startPhone($('signInPhone').value);$('phoneCodePanel').hidden=false;notice('SMS code sent. Enter it below.');});$('confirmPhoneCode').onclick=()=>run(async()=>{await confirmPhone($('phoneCode').value);});$('logout').onclick=()=>run(()=>signOut(auth));
onAuthStateChanged(auth,async user=>{epoch++;clearPhone();$('phoneCode').value='';$('signInPhone').value='';$('phoneCodePanel').hidden=true;$('ownerWorkspace').replaceChildren();$('ownerWorkspace').hidden=true;$('password').value='';$('logout').hidden=!user;$('login').hidden=!!user;$('notice').hidden=true;if(!user)return;if(!user.emailVerified&&!user.phoneNumber){notice('Verify your email in the Teyza app, then reopen this page.',true);return;}try{await load();}catch(e){notice(e.message,true);}});
