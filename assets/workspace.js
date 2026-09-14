(() => {
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
