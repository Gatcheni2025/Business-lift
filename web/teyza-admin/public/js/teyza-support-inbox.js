import {auth} from '/js/teyza-app-admin-firebase.mjs';
import {createApi} from '/js/teyza-app-admin-model.mjs';
import {onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,signOut}
 from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';

const $=id=>document.getElementById(id);
const api=createApi({user:()=>auth.currentUser});
const state={ready:false,loading:false,selected:null,tickets:[],next:null,generation:0};
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const stamp=ms=>Number.isFinite(Number(ms))&&Number(ms)>0?new Date(Number(ms)).toLocaleString('en-ZA'):'Not available';
function notice(text,kind=''){
 const box=$('notice');box.textContent=text;box.className='notice '+kind;box.hidden=false;
}
function reset(){
 state.ready=false;state.generation++;state.loading=false;state.selected=null;state.tickets=[];
 state.next=null;$('workspace').hidden=true;$('login').hidden=false;
 $('logout').hidden=true;$('identity').textContent='';
 $('thread-panel').hidden=true;$('conversation-placeholder').hidden=false;
 $('tickets').replaceChildren();$('thread').replaceChildren();
}
function isWindowOpen(ticket){const time=Number(ticket?.whatsAppLastInboundAt)||0;
 return time>0&&Date.now()>=time&&Date.now()-time<23*60*60*1000;}
function agentCanSend(){return state.ready&&state.selected&&isWindowOpen(state.selected);}
function threadStatus(message){
 if(message.sender!=='admin')return '';
 const label={accepted:'Meta accepted • delivery not yet confirmed',
 sending:'Sending to Meta…',needs_review:'Delivery needs staff review',
 window_expired:'Not sent • WhatsApp reply window expired',
 configuration_required:'Not sent • sender configuration missing'};
 return label[message.whatsAppReplyStatus]||'Reply saved • WhatsApp sending pending';
}
function paintTickets(){
 const term=$('search').value.trim().toLocaleLowerCase();
 const rows=state.tickets.filter(t=>[t.shopName,t.lastMessage].some(v=>String(v||'').toLocaleLowerCase().includes(term)));
 const list=$('tickets');list.replaceChildren();
 for(const t of rows){
  const btn=make('button',undefined,'ticket'+(state.selected?.id===t.id?' selected':''));
  btn.type='button';btn.setAttribute('role','listitem');btn.setAttribute('aria-current',state.selected?.id===t.id?'true':'false');
  const title=make('div',undefined,'ticket-top');title.append(make('strong',t.shopName||'Teyza business'),
   make('small',stamp(t.lastMessageAt)));
  const preview=make('p',t.lastMessage||'Seller requested an agent','preview');
  const meta=make('div',undefined,'ticket-bottom');meta.append(make('span',isWindowOpen(t)?'WhatsApp reply window open':'Reply window closed','window-pill'));
  if(Number(t.adminUnread)>0)meta.append(make('span',t.adminUnread+' pending','unread-pill'));
  btn.append(title,preview,meta);
  btn.addEventListener('click',()=>openThread(t));
  list.append(btn);
 }
 if(!rows.length)list.append(make('p',state.tickets.length?'No matching conversations.':'No active WhatsApp support conversations yet.','empty-queue'));
 $('queue-meta').textContent=state.tickets.length+' conversation'+(state.tickets.length===1?'':'s')+' loaded';
 $('more').hidden=!state.next;
}
async function reload(first=true){
 if(!state.ready||state.loading)return;
 const session=state.generation;state.loading=true;$('refresh').disabled=true;
 try{
  const result=await api('ops_whatsapp_support_inbox',first?{}:{after:state.next});
  if(session!==state.generation)return;
  if(first){state.tickets=result.tickets||[];}
  else {
   const items=new Map(state.tickets.map(t=>[t.id,t]));
   for(const t of result.tickets||[])items.set(t.id,t);
   state.tickets=[...items.values()];
  }
  state.tickets.sort((a,b)=>(b.lastMessageAt||0)-(a.lastMessageAt||0));
  state.next=result.next||null;
  if(state.selected){
   state.selected=state.tickets.find(x=>x.id===state.selected.id)||null;
   if(!state.selected){$('thread-panel').hidden=true;$('conversation-placeholder').hidden=false;}
  }
  paintTickets();paintComposer();
 }catch(e){handleError(e);}
 finally{state.loading=false;$('refresh').disabled=false;}
}
function paintComposer(){
 const t=state.selected;
 if(!t)return;
 $('thread-title').textContent=t.shopName||'Teyza business';
 $('thread-meta').textContent='Last inbound WhatsApp message: '+stamp(t.whatsAppLastInboundAt);
 const allowed=agentCanSend();
 $('reply').disabled=!allowed;$('send').disabled=!allowed;
 $('send-hint').textContent=allowed?
  'Your reply is securely saved, then queued for delivery to this seller in WhatsApp. Check the delivery indicator after sending.':
  'The 24-hour WhatsApp customer-service window may be closed. Ask the seller to send a new WhatsApp message before replying.';
}
async function openThread(t){
 state.selected=t;const requestId=++state.generation;
 $('conversation-placeholder').hidden=true;$('thread-panel').hidden=false;paintTickets();paintComposer();
 $('thread').replaceChildren(make('p','Loading conversation…','empty-queue'));
 try{
  const result=await api('ops_support_thread',{ticketId:t.id});
  if(requestId!==state.generation)return;
  const thread=$('thread');thread.replaceChildren();
  const rows=result.messages||[];
  if(!rows.length)thread.append(make('p','No messages yet. The seller has requested a consultant.','empty-queue'));
  for(const m of rows){
   const msg=make('article',undefined,'bubble '+(m.sender==='admin'?'agent':'seller'));
   msg.append(make('strong',m.sender==='admin'?'Teyza Support':'Business owner'));
   msg.append(make('p',m.text||''));
   const footer=make('small',stamp(m.createdAt));const status=threadStatus(m);
   if(status)footer.textContent+=' · '+status;
   msg.append(footer);thread.append(msg);
  }
  thread.scrollTop=thread.scrollHeight;
 }catch(e){handleError(e);}
}
function handleError(e){
 if(e?.status===401||e?.status===403){
  reset();notice(e?.message||'Session expired. Sign in again.','error');
 }else notice(e?.message||'Unable to load messages. Refresh and try again.','error');
}
async function signIn(provider){
 try{
  if(provider==='google')await signInWithPopup(auth,new GoogleAuthProvider());
  else await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);
  $('password').value='';
 }catch(e){notice(e?.message||'Could not sign in.','error');}
}
$('google').addEventListener('click',()=>signIn('google'));
$('email-form').addEventListener('submit',event=>{event.preventDefault();signIn('password');});
$('logout').addEventListener('click',async()=>{await signOut(auth);reset();});
$('refresh').addEventListener('click',()=>reload());
$('more').addEventListener('click',()=>{if(state.next)reload(false);});
$('search').addEventListener('input',paintTickets);
$('reply-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!agentCanSend()){notice('This WhatsApp reply window is closed. Ask the seller to message us again.','error');return;}
 const msg=$('reply').value.trim(),t=state.selected;
 if(msg.length<2||msg.length>1000){notice('Enter a response between 2 and 1000 characters.','error');return;}
 $('send').disabled=true;
 try{
  await api('ops_support_reply',{ticketId:t.id,message:msg,
   messageId:'a'+crypto.randomUUID().replaceAll('-','')});
  $('reply').value='';notice('Reply saved. The WhatsApp worker is processing delivery.','success');
  await openThread(t);await reload();
 }catch(e){handleError(e);}
 finally{paintComposer();}
});
onAuthStateChanged(auth,async user=>{
 reset();if(!user)return;
 try{
  const token=await user.getIdTokenResult(true);
  if(token.claims.teyzaSupportAgent!==true&&token.claims.teyzaAdmin!==true)
   throw Error('This account is not authorised for Teyza support. Request a support-agent role from your operator.');
  const age=Math.floor(Date.now()/1000)-Number(token.claims.auth_time);
  if(!Number.isFinite(age)||age>290)
   throw Error('For your security, please sign out and sign in again to open a fresh support session.');
  state.ready=true;$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;
  $('identity').textContent=user.email||'Authorised agent';
  await reload();
 }catch(e){reset();notice(e.message||'Support login failed.','error');}
});
setInterval(()=>{
 if(!state.ready||document.hidden||state.loading)return;
 reload();
 if(state.selected&&!state.loading)openThread(state.selected);
},20000);
