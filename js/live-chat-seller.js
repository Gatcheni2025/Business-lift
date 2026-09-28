import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext} from "./business-context.js";

const esc=(v)=>String(v??"");
let currentUser=null,businessId="",businessName="Your business",threads=[],activeThreadId="",panelOpen=false,pollTimer=null;

function el(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
function ensureStyle(){
  if(document.querySelector('link[data-teyza-live-chat]'))return;
  const link=document.createElement("link");link.rel="stylesheet";link.href="assets/live-chat.css?v=1";link.dataset.teyzaLiveChat="1";document.head.appendChild(link);
}
function timeLabel(value){
  if(!value)return "";
  const d=new Date(value);if(Number.isNaN(d.getTime()))return "";
  return d.toLocaleString("en-ZA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
}
async function api(mode,options={}){
  const token=await currentUser.getIdToken();
  const url=new URL("api/chat.php",location.href);
  url.searchParams.set("mode",mode);
  if(options.threadId)url.searchParams.set("threadId",options.threadId);
  const response=await fetch(url,{method:options.method||"GET",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:options.body?JSON.stringify(options.body):undefined,cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw new Error(data.error||"Live chat is unavailable.");
  return data;
}
function build(){
  if(document.querySelector("[data-tz-seller-chat]"))return;
  ensureStyle();
  const launcher=el("button","tz-chat-launcher");launcher.type="button";launcher.dataset.tzSellerChat="";launcher.setAttribute("aria-label","Open customer live chat");
  launcher.innerHTML='<span aria-hidden="true">💬</span><span>Live chat</span>';
  const badge=el("span","tz-chat-launcher-badge");badge.hidden=true;badge.dataset.tzChatBadge="";launcher.appendChild(badge);

  const panel=el("section","tz-chat-panel");panel.hidden=true;panel.dataset.tzChatPanel="";panel.setAttribute("aria-label","Customer live chat");
  const head=el("div","tz-chat-head");
  const titleWrap=el("div");const title=el("strong","", "Customer live chat");const sub=el("small","", businessName);titleWrap.append(title,sub);
  const headActions=el("div","tz-chat-head-actions");
  const close=el("button","tz-chat-icon-btn","✕");close.type="button";close.setAttribute("aria-label","Close live chat");close.dataset.tzChatClose="";
  headActions.append(close);head.append(titleWrap,headActions);

  const share=el("div","tz-chat-share");
  const shareText=el("span","", "Share your customer chat link");
  const copy=el("button","", "Copy link");copy.type="button";copy.dataset.tzCopyChat="";
  share.append(shareText,copy);

  const body=el("div","tz-chat-body");body.dataset.tzChatBody="";
  const status=el("div","tz-chat-status","");status.hidden=true;status.dataset.tzChatStatus="";
  panel.append(head,share,body,status);
  document.body.append(panel,launcher);

  launcher.addEventListener("click",()=>setOpen(!panelOpen));
  close.addEventListener("click",()=>setOpen(false));
  copy.addEventListener("click",copyLink);
}
function setStatus(message,error=false){
  const n=document.querySelector("[data-tz-chat-status]");if(!n)return;
  n.hidden=!message;n.textContent=message||"";n.classList.toggle("error",!!error);
}
function setOpen(open){
  panelOpen=open;
  const panel=document.querySelector("[data-tz-chat-panel]");if(panel)panel.hidden=!open;
  if(open){renderInbox();refreshInbox().catch(e=>setStatus(e.message,true));}
}
async function copyLink(){
  const link=location.origin+"/chat.html?business="+encodeURIComponent(businessId);
  try{await navigator.clipboard.writeText(link);setStatus("Customer chat link copied.");}
  catch{window.prompt("Copy this customer chat link:",link);}
}
function unreadCount(){return threads.reduce((sum,t)=>sum+Number(t.unreadSeller||0),0)}
function updateBadge(){
  const badge=document.querySelector("[data-tz-chat-badge]");if(!badge)return;
  const count=unreadCount();badge.hidden=count<1;badge.textContent=count>99?"99+":String(count);
}
function renderInbox(){
  const body=document.querySelector("[data-tz-chat-body]");if(!body)return;
  activeThreadId="";
  body.replaceChildren();
  const inbox=el("div","tz-chat-inbox");
  if(!threads.length){
    const empty=el("div","tz-chat-empty");empty.innerHTML="<strong>No customer conversations yet</strong>Share your customer chat link. New messages will appear here.";inbox.append(empty);
  }else{
    threads.forEach(t=>{
      const button=el("button","tz-chat-thread-item");button.type="button";button.dataset.threadId=t.id;
      const top=el("strong");const name=el("span","",t.clientName||"Customer");top.append(name);
      if(Number(t.unreadSeller||0)>0)top.append(el("span","tz-chat-unread",String(t.unreadSeller)));
      const last=el("p","",(t.lastSender==="seller"?"You: ":"")+String(t.lastMessage||""));
      const when=el("p","",timeLabel(t.updatedAt));when.style.fontSize="10px";
      button.append(top,last,when);
      button.addEventListener("click",()=>openThread(t.id));
      inbox.append(button);
    });
  }
  body.append(inbox);
  updateBadge();
}
async function refreshInbox(){
  if(!currentUser)return;
  const data=await api("seller-inbox");threads=data.threads||[];
  updateBadge();
  if(panelOpen&&!activeThreadId)renderInbox();
}
function renderMessages(thread){
  const body=document.querySelector("[data-tz-chat-body]");if(!body)return;
  body.replaceChildren();
  const meta=el("div","tz-chat-meta");
  const back=el("button","tz-chat-back","← Conversations");back.type="button";back.style.color="#155a9c";back.addEventListener("click",()=>{activeThreadId="";renderInbox()});
  const customer=el("div","",thread.clientName||"Customer");
  const detail=el("small","",thread.clientEmail||"");
  meta.append(back,customer,detail);

  const messages=el("div","tz-chat-messages");messages.dataset.tzMessages="";
  (thread.messages||[]).forEach(m=>{
    const bubble=el("div","tz-chat-message "+(m.sender==="seller"?"me":"them"));
    bubble.append(document.createTextNode(esc(m.text)));
    bubble.append(el("small","",timeLabel(m.createdAt)));
    messages.append(bubble);
  });
  const compose=el("form","tz-chat-compose");
  const area=el("textarea");area.placeholder="Reply to customer…";area.maxLength=2000;area.rows=1;area.dataset.tzReply="";
  const send=el("button","tz-chat-send","Send");send.type="submit";
  compose.append(area,send);
  compose.addEventListener("submit",async e=>{
    e.preventDefault();const message=area.value.trim();if(!message)return;
    send.disabled=true;
    try{
      const data=await api("",{method:"POST",body:{action:"seller-message",threadId:thread.id,message}});
      area.value="";renderMessages(data.thread);await refreshInbox();
    }catch(error){setStatus(error.message,true)}finally{send.disabled=false}
  });
  area.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();compose.requestSubmit()}});
  body.append(meta,messages,compose);
  requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;area.focus()});
}
async function openThread(id){
  activeThreadId=id;setStatus("");
  try{const data=await api("seller-thread",{threadId:id});renderMessages(data.thread);await refreshInbox();}
  catch(error){setStatus(error.message,true)}
}
function startPolling(){
  clearInterval(pollTimer);
  pollTimer=setInterval(async()=>{
    try{
      await refreshInbox();
      if(panelOpen&&activeThreadId){
        const data=await api("seller-thread",{threadId:activeThreadId});
        renderMessages(data.thread);
      }
    }catch(_){}
  },5000);
}
onAuthStateChanged(auth,async user=>{
  if(!user)return;
  currentUser=user;
  try{
    const context=await getBusinessContext(user);
    businessId=String(context.businessId||"");
    businessName=String(context.business?.businessName||"Your business");
    if(!businessId)return;
    build();await refreshInbox();startPolling();
  }catch(error){console.error("Seller live chat failed",error)}
});
