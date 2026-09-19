(() => {
 document.body.classList.add('dashboard-contrast');
 document.title=document.title.replace(/Business Expo/gi,'Teyza');
 document.querySelectorAll('.workspace-brand').forEach(brand=>{brand.innerHTML='<span class="teyza-logo-mark"><span>T</span></span><span class="teyza-word">TEYZA<small>Everyone can sell.</small></span>';});
 document.querySelectorAll('.sidebar-footer>small,.workspace-footer>span').forEach(el=>el.textContent='TEYZA · Everyone can sell.');
 document.querySelectorAll('p,h1,h2,h3,small,span').forEach(el=>{if(el.children.length===0&&/Business Expo/i.test(el.textContent))el.textContent=el.textContent.replace(/Business Expo/gi,'Teyza');});
 const sidebar=document.getElementById('sidebar');
 const toggle=document.getElementById('navToggle');
 const backdrop=document.getElementById('sidebarBackdrop');
 function setOpen(open){
  sidebar.inert=!open && innerWidth<=980;
  sidebar.classList.toggle('is-open',open);toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');backdrop.hidden=!open;
  document.body.style.overflow=open?'hidden':'';
  if(open) sidebar.querySelector('[aria-current="page"]')?.focus();
 }
 toggle?.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
 backdrop?.addEventListener('click',()=>{setOpen(false);toggle.focus()});
 document.addEventListener('keydown',event=>{
  if(toggle?.getAttribute('aria-expanded')!=='true')return;
  if(event.key==='Escape'){setOpen(false);toggle.focus()}
  if(event.key==='Tab'){
   const items=[...sidebar.querySelectorAll('a,button')];const first=items[0],last=items.at(-1);
   if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus()}
  }
 });
 if(sidebar)sidebar.inert=innerWidth<=980;
 window.addEventListener('resize',()=>{
  if(innerWidth>980 && toggle?.getAttribute('aria-expanded')==='true')setOpen(false);
  if(sidebar)sidebar.inert=innerWidth<=980 && toggle?.getAttribute('aria-expanded')!=='true';
 });
 document.querySelectorAll('[data-current-date]').forEach(el=>el.textContent=new Date().toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'long',year:'numeric'}));
 // Associate legacy field labels with their controls without changing integration IDs.
 document.querySelectorAll('.field').forEach(field=>{const label=field.querySelector('label'),input=field.querySelector('input,select,textarea');if(label && input?.id)label.htmlFor=input.id;});
 document.querySelectorAll('.form-status,.notice,[id$="Status"]').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite')});
 // Block accidental native GET submission while a page's module is still loading.
 document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>event.preventDefault()));
})();
