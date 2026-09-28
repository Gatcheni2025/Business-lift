const params=new URLSearchParams(location.search);
const businessId=String(document.body.dataset.teyzaBusiness||params.get("business")||"").trim().toUpperCase();
if(!/^TZ_[A-F0-9]{8}$/.test(businessId)){
  const note=document.querySelector("[data-chat-page-status]");
  if(note)note.textContent="This chat link is missing a valid Teyza seller.";
}else{
  const tokenKey="teyzaChatToken:"+businessId;
  const nameKey="teyzaChatName:"+businessId;
  const emailKey="teyzaChatEmail:"+businessId;
  let clientToken=localStorage.getItem(tokenKey)||"";
  let businessName="Teyza seller",panelOpen=false,pollTimer=null,currentThread=null;

  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n};
  const timeLabel=(value)=>{const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toLocaleString("en-ZA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})};
  async function request(url,options={}){
    const response=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||"Live chat is unavailable.");
    return data;
  }
  async function loadInfo(){
    const url=new URL("api/chat.php",location.href);url.searchParams.set("mode","public-info");url.searchParams.set("businessId",businessId);
    const data=await request(url);businessName=data.businessName||businessName;
    const pageName=document.querySelector("[data-chat-business-name]");if(pageName)pageName.textContent=businessName;
  }
  function build(){
    if(document.querySelector("[data-tz-client-chat]"))return;
    const launcher=el("button","tz-chat-launcher");launcher.type="button";launcher.dataset.tzClientChat="";launcher.setAttribute("aria-label","Open live chat");launcher.innerHTML='<span aria-hidden="true">💬</span><span>Chat with seller</span>';
    const badge=el("span","tz-chat-launcher-badge");badge.hidden=true;badge.dataset.tzChatBadge="";launcher.append(badge);

    const panel=el("section","tz-chat-panel");panel.hidden=true;panel.dataset.tzClientPanel="";panel.setAttribute("aria-label","Live chat with seller");
    const head=el("div","tz-chat-head");const text=el("div");text.append(el("strong","",businessName),el("small","", "● Live chat · messages are saved"));
    const close=el("button","tz-chat-icon-btn","✕");close.type="button";close.setAttribute("aria-label","Close chat");head.append(text,close);
    const body=el("div","tz-chat-body");body.dataset.tzClientBody="";
    const status=el("div","tz-chat-status");status.hidden=true;status.dataset.tzClientStatus="";
    const powered=el("div","tz-chat-powered","Powered by Teyza");
    panel.append(head,body,status,powered);document.body.append(panel,launcher);

    launcher.addEventListener("click",()=>setOpen(!panelOpen));close.addEventListener("click",()=>setOpen(false));
    if(document.body.dataset.chatAutoOpen==="1")setTimeout(()=>setOpen(true),300);
  }
  function setStatus(message,error=false){
    const n=document.querySelector("[data-tz-client-status]");if(!n)return;n.hidden=!message;n.textContent=message||"";n.classList.toggle("error",!!error);
  }
  function setOpen(open){
    panelOpen=open;const panel=document.querySelector("[data-tz-client-panel]");if(panel)panel.hidden=!open;
    if(open)refresh().catch(e=>setStatus(e.message,true));
  }
  function renderStart(){
    const body=document.querySelector("[data-tz-client-body]");if(!body)return;body.replaceChildren();
    const wrap=el("form","tz-chat-start");
    const intro=el("p","",`Start a conversation with ${businessName}. Your name is required; email is optional.`);
    const nameLabel=el("label","", "Your name");const name=el("input");name.required=true;name.maxLength=80;name.value=localStorage.getItem(nameKey)||"";name.placeholder="Your name";nameLabel.append(name);
    const emailLabel=el("label","", "Email (optional)");const email=el("input");email.type="email";email.maxLength=160;email.value=localStorage.getItem(emailKey)||"";email.placeholder="you@example.com";emailLabel.append(email);
    const msgLabel=el("label","", "Message");const msg=el("textarea");msg.required=true;msg.maxLength=2000;msg.rows=4;msg.placeholder="How can the seller help?";msgLabel.append(msg);
    const send=el("button","tz-chat-send","Start chat");send.type="submit";
    wrap.append(intro,nameLabel,emailLabel,msgLabel,send);
    wrap.addEventListener("submit",async e=>{
      e.preventDefault();send.disabled=true;setStatus("");
      try{
        const data=await sendMessage(msg.value,name.value,email.value);
        currentThread=data.thread;msg.value="";renderThread(currentThread);
      }catch(error){setStatus(error.message,true)}finally{send.disabled=false}
    });
    body.append(wrap);setTimeout(()=>name.focus(),50);
  }
  function renderThread(thread){
    const body=document.querySelector("[data-tz-client-body]");if(!body)return;body.replaceChildren();
    const meta=el("div","tz-chat-meta");meta.innerHTML='<span class="tz-chat-online"></span>Chatting with '+businessName;
    const messages=el("div","tz-chat-messages");
    (thread?.messages||[]).forEach(m=>{
      const bubble=el("div","tz-chat-message "+(m.sender==="client"?"me":"them"));
      bubble.append(document.createTextNode(String(m.text||"")));bubble.append(el("small","",timeLabel(m.createdAt)));messages.append(bubble);
    });
    const form=el("form","tz-chat-compose");const area=el("textarea");area.rows=1;area.maxLength=2000;area.placeholder="Type a message…";const send=el("button","tz-chat-send","Send");send.type="submit";form.append(area,send);
    form.addEventListener("submit",async e=>{
      e.preventDefault();const message=area.value.trim();if(!message)return;send.disabled=true;setStatus("");
      try{const data=await sendMessage(message);currentThread=data.thread;area.value="";renderThread(currentThread)}
      catch(error){setStatus(error.message,true)}finally{send.disabled=false}
    });
    area.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
    body.append(meta,messages,form);requestAnimationFrame(()=>{messages.scrollTop=messages.scrollHeight;area.focus()});
    const badge=document.querySelector("[data-tz-chat-badge]");if(badge)badge.hidden=true;
  }
  async function sendMessage(message,name="",email=""){
    const payload={action:"client-message",businessId,clientToken,message};
    if(name)payload.name=name;if(email)payload.email=email;
    const data=await request("api/chat.php",{method:"POST",body:JSON.stringify(payload)});
    if(data.clientToken){clientToken=data.clientToken;localStorage.setItem(tokenKey,clientToken)}
    if(name)localStorage.setItem(nameKey,name);if(email)localStorage.setItem(emailKey,email);
    return data;
  }
  async function refresh(){
    if(!clientToken){renderStart();return}
    const url=new URL("api/chat.php",location.href);url.searchParams.set("mode","client-thread");url.searchParams.set("businessId",businessId);url.searchParams.set("clientToken",clientToken);
    const data=await request(url);
    if(!data.thread){clientToken="";localStorage.removeItem(tokenKey);renderStart();return}
    const previousCount=(currentThread?.messages||[]).length;currentThread=data.thread;
    if(panelOpen)renderThread(currentThread);
    else if((currentThread.messages||[]).length>previousCount){
      const last=currentThread.messages.at(-1);if(last?.sender==="seller"){const badge=document.querySelector("[data-tz-chat-badge]");if(badge){badge.hidden=false;badge.textContent=String(Math.max(1,Number(currentThread.unreadClient||1)))}}
    }
  }
  async function init(){
    try{await loadInfo();build();await refresh();pollTimer=setInterval(()=>refresh().catch(()=>{}),5000)}
    catch(error){const note=document.querySelector("[data-chat-page-status]");if(note)note.textContent=error.message;console.error(error)}
  }
  init();
}
