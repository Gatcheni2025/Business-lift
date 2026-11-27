'use strict';
// Simple public contact popup; no hidden tracking or automatic messaging.
(()=>{
 if(!document.body||document.getElementById('teyza-help-widget'))return;
 const root=document.createElement('aside');
 root.id='teyza-help-widget';
 root.className='tw-help';
 root.setAttribute('aria-label','Teyza help');
 root.innerHTML=[
 '<div class="tw-help-panel" id="tw-help-panel" hidden>',
 '<header class="tw-help-header"><span class="tw-help-monogram" aria-hidden="true">T</span>',
 '<div><strong>Chat with Teyza</strong><small>Business support and registration help</small></div>',
 '<button type="button" class="tw-help-close" aria-label="Close Teyza chat panel">×</button></header>',
 '<div class="tw-help-body">',
 '<p class="tw-help-greeting"><strong>Hi there! 👋</strong> Need help with Teyza? Choose how to reach our team.</p>',
 '<a class="tw-help-link tw-help-link--wa" href="https://wa.me/27798261972?text=AGENT" target="_blank" rel="noopener noreferrer" aria-label="Open WhatsApp for approved Teyza sellers">',
 '<span class="tw-help-symbol" aria-hidden="true">◉</span>',
 '<span><strong>WhatsApp seller support</strong><small>Approved sellers: send AGENT to request a consultant</small></span><span aria-hidden="true">↗</span></a>',
 '<a class="tw-help-link" href="mailto:support@teyza.co.za?subject=Teyza%20website%20support">',
 '<span class="tw-help-symbol" aria-hidden="true">✉</span>',
 '<span><strong>New to Teyza? Email us</strong><small>Registration, accounts and general enquiries</small></span><span aria-hidden="true">↗</span></a>',
 '<a class="tw-help-more" href="/support.html">Visit our support centre</a>',
 '<p class="tw-help-note">WhatsApp opens in its own app. Our team replies when available, not instantly. Never share passwords, OTPs or bank details in chat.</p>',
 '</div></div>',
 '<button type="button" class="tw-help-toggle" aria-controls="tw-help-panel" aria-expanded="false" aria-label="Open Teyza chat">',
 '<span class="tw-help-toggle-symbol" aria-hidden="true">✦</span><span>Chat with us</span></button>'
 ].join('');
 document.body.append(root);
 const toggle=root.querySelector('.tw-help-toggle');
 const panel=root.querySelector('#tw-help-panel');
 function show(open,restoreFocus=false){
  panel.hidden=!open;
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'Close Teyza chat':'Open Teyza chat');
  if(restoreFocus)toggle.focus();
 }
 toggle.addEventListener('click',()=>show(panel.hidden));
 root.querySelector('.tw-help-close').addEventListener('click',()=>show(false,true));
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!panel.hidden)show(false,true);
 });
 document.addEventListener('click',event=>{
  if(!root.contains(event.target)&&!panel.hidden)show(false);
 });
})();