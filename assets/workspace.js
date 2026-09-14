(() => {
 const sidebar=document.getElementById('sidebar');
 const toggle=document.getElementById('navToggle');
 const backdrop=document.getElementById('sidebarBackdrop');
 function setOpen(open){
  if(sidebar)sidebar.inert=!open && innerWidth<=980;
  sidebar?.classList.toggle('is-open',open);toggle?.setAttribute('aria-expanded',String(open));
  toggle?.setAttribute('aria-label',open?'Close navigation':'Open navigation');if(backdrop)backdrop.hidden=!open;
  document.body.style.overflow=open?'hidden':'';
  if(open) sidebar?.querySelector('[aria-current="page"]')?.focus();
 }
 toggle?.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
 backdrop?.addEventListener('click',()=>{setOpen(false);toggle?.focus()});
 document.addEventListener('keydown',event=>{
  if(toggle?.getAttribute('aria-expanded')!=='true')return;
  if(event.key==='Escape'){setOpen(false);toggle.focus()}
  if(event.key==='Tab'){
   const items=[...(sidebar?.querySelectorAll('a,button')||[])];const first=items[0],last=items.at(-1);
   if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus()}
   else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus()}
  }
 });
 if(sidebar)sidebar.inert=innerWidth<=980;
 window.addEventListener('resize',()=>{
  if(innerWidth>980 && toggle?.getAttribute('aria-expanded')==='true')setOpen(false);
  if(sidebar)sidebar.inert=innerWidth<=980 && toggle?.getAttribute('aria-expanded')!=='true';
 });
 document.querySelectorAll('[data-current-date]').forEach(el=>el.textContent=new Date().toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'long',year:'numeric'}));
 document.querySelectorAll('.field').forEach(field=>{const label=field.querySelector('label'),input=field.querySelector('input,select,textarea');if(label && input?.id)label.htmlFor=input.id;});
 document.querySelectorAll('.form-status,.notice,[id$="Status"]').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite')});
 document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>event.preventDefault()));

 function installSalesChat(){
  if(document.body.dataset.page!=='dashboard' || document.querySelector('[data-sales-chat-card]'))return;
  const anchor=document.querySelector('.welcome-banner');if(!anchor)return;
  const card=document.createElement('section');card.dataset.salesChatCard='';card.setAttribute('aria-label','Sales support');
  card.style.cssText='margin:16px 0;padding:18px 20px;border:1px solid rgba(8,127,91,.18);border-radius:16px;background:linear-gradient(135deg,rgba(8,127,91,.08),rgba(255,255,255,.95));display:grid;gap:12px;box-shadow:0 8px 24px rgba(18,53,45,.06)';
  card.innerHTML='<div style="display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap"><div><div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#087f5b">BUSINESS EXPO SALES SUPPORT</div><h3 style="margin:5px 0 4px;font-size:18px">Need help getting your business selling?</h3><p style="margin:0;color:#64748b">Chat with a sales person about setup, product uploads or connecting your selling channels.</p></div><button class="button button-primary" type="button" data-open-sales-chat>Chat with sales</button></div><form data-sales-chat-form hidden style="display:none;gap:10px"><label class="input-label">Your message<textarea name="message" rows="3" maxlength="1500" placeholder="Tell us what you need help with" required></textarea></label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="button button-primary" type="submit">Send message</button><button class="button" type="button" data-close-sales-chat>Close</button><span data-sales-chat-status role="status" aria-live="polite"></span></div></form>';
  anchor.after(card);
  const form=card.querySelector('[data-sales-chat-form]');
  card.querySelector('[data-open-sales-chat]')?.addEventListener('click',()=>{form.hidden=false;form.style.display='grid';card.querySelector('textarea')?.focus();});
  card.querySelector('[data-close-sales-chat]')?.addEventListener('click',()=>{form.hidden=true;form.style.display='none';});
  form?.addEventListener('submit',async event=>{
   event.preventDefault();const button=form.querySelector('[type="submit"]'),status=form.querySelector('[data-sales-chat-status]');const message=form.elements.message.value.trim();if(!message)return;
   button.disabled=true;button.textContent='Sending…';status.textContent='';
   try{const {apiFetch}=await import('../js/api-client.js');const result=await apiFetch('api/sales-chat.php',{method:'POST',body:JSON.stringify({message})});status.textContent=result.message||'Message sent.';form.reset();}
   catch(error){status.textContent=error.message||'Unable to send your message.';}
   finally{button.disabled=false;button.textContent='Send message';}
  });
 }
 installSalesChat();
})();
