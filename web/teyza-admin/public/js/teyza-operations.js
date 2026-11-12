import {createFieldAdmin} from '/js/teyza-field-admin.js?v=R323';
import {photoBlob} from '/js/teyza-app-admin-model.mjs?v=R323';
import {downloadMandateRequestPdf} from '/js/teyza-mandate-pdf.mjs';
import {money,cents,statementRows} from '/js/teyza-operations-model.mjs?v=R323';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const titles={users:'Users & access',overview:'Your operations, at a glance.',sellers:'Business accounts',products:'Product activity',billing:'Finance & payments',support:'A better support desk.',finance:'Stock finance review',field:'HR & field team'};
export function createOperations({api,onError,getReviewSummary=()=>({loaded:false,count:0,hasMore:false})}){
 const root=document.getElementById('operationsPanel'),approvals=document.getElementById('approvalView');
 const navButtons=[...document.querySelectorAll('[data-admin-view]')];
 const enableNavigation=enabled=>{for(const item of navButtons)item.disabled=!enabled;};
 let mandatePhotoUrl=null;
 function clearMandatePhoto(){if(mandatePhotoUrl){document.getElementById('largePhoto').removeAttribute('src');URL.revokeObjectURL(mandatePhotoUrl);mandatePhotoUrl=null;}}
 function clearMandateDialogs(){for(const dialog of document.querySelectorAll('.ops-mandate-dialog')){
  if(dialog.open)dialog.close();dialog.replaceChildren();dialog.remove();
 }}
 document.getElementById('photoDialog').addEventListener('close',clearMandatePhoto);
 let generation=0,ready=false,view='overview',sellers=[],next=null,selected=null,detail=null,accountTab='summary',archiveExpanded=false,sellerSnapshotLoaded=false,
     users=[],usersNext=null,userSelected=null,userDetail=null,
      tickets=[],finance=[],catalogueQueue=[],catalogueLimited=false,wholesaleAdQueue=[],wholesaleAdError=null,shopperAdQueue=[],shopperAdError=null,shopperAdPreview=null,shopperAdActivationQueue=[],shopperAdActivationError=null,closures=[],closuresNext=null,mandates=[],mandatesLoaded=false,mandatesLimited=false,
     moreFinance=null,moreTickets=null,busy=false,mandateError=null;
 const message=(t,k='')=>{const box=document.getElementById('notice');box.textContent=t;box.className='notice '+k;box.hidden=false;};
 const fieldAdmin=createFieldAdmin({api:(action,data)=>request(action,data),onError,message});
 function clear(){fieldAdmin.clear();clearMandatePhoto();clearMandateDialogs();generation++;ready=false;view='overview';sellers=[];next=null;selected=null;detail=null;archiveExpanded=false;sellerSnapshotLoaded=false;users=[];usersNext=null;userSelected=null;userDetail=null;tickets=[];finance=[];catalogueQueue=[];catalogueLimited=false;wholesaleAdQueue=[];wholesaleAdError=null;shopperAdQueue=[];shopperAdError=null;shopperAdPreview=null;shopperAdActivationQueue=[];shopperAdActivationError=null;closures=[];closuresNext=null;mandates=[];mandatesLoaded=false;mandatesLimited=false;mandateError=null;moreFinance=null;moreTickets=null;busy=false;enableNavigation(false);root.replaceChildren();}
 async function request(action,data={}){const stamp=generation;const reply=await api(action,data);if(!ready||stamp!==generation)throw Object.assign(Error('Session changed.'),{stale:true});return reply;}
 async function safely(fn){if(!ready||busy)return;busy=true;try{await fn();}catch(e){if(!e.stale)onError(e);}finally{busy=false;}}
 function button(text,fn,kind='quiet'){const b=el('button',text,'button '+kind);b.type='button';b.onclick=()=>safely(fn);return b;}
 function card(title,description){const c=el('section',undefined,'panel ops-card');c.append(el('h3',title));if(description)c.append(el('p',description,'footnote'));return c;}
 function field(form,label,name,type='text',value='',required=true){const l=el('label',label);const i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;i.name=name;i.required=required;i.value=value;if(type==='textarea'){i.rows=3;i.maxLength=2000;}l.append(i);form.append(l);return i;}
 function choice(form,label,name,options,value){const l=el('label',label),s=el('select');s.name=name;for(const [v,t] of options){const o=el('option',t);o.value=v;s.append(o);}s.value=value;l.append(s);form.append(l);return s;}
 function check(form,label,name){const l=el('label',undefined,'confirm-check'),i=el('input');i.type='checkbox';i.name=name;i.required=true;l.append(i,el('span',label));form.append(l);return i;}
 function submit(form,text,fn){const b=el('button',text,'button primary');b.type='submit';form.append(b);form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())safely(()=>fn(new FormData(form)));};}
 function table(headers,rows){const wrap=el('div',undefined,'table-wrap'),t=el('table'),head=el('thead'),h=el('tr'),body=el('tbody');for(const v of headers)h.append(el('th',v));head.append(h);for(const values of rows){const tr=el('tr');for(const v of values){const td=el('td');td.append(v instanceof Node?v:document.createTextNode(String(v??'')));tr.append(td);}body.append(tr);}if(!rows.length){const tr=el('tr'),td=el('td','No records to display.');td.colSpan=headers.length;tr.append(td);body.append(tr);}t.append(head,body);wrap.append(t);return wrap;}
 function tag(text){const label=String(text||'pending').replaceAll('_',' '),pill=el('span',label,'status-pill');
  if(/^(approved|active|verified|connected|resolved)\b/i.test(label))pill.classList.add('status-good');
  else if(/^(rejected|declined|suspended|failed)\b/i.test(label))pill.classList.add('status-alert');
  return pill;}
 function heading(){root.replaceChildren();const h=el('div',undefined,'workspace-title');const text=el('div');text.append(el('span','TEYZA OPERATIONS','eyebrow'),el('h2',titles[view]));if(view==='overview')text.append(el('p','The people, reviews and requests that keep your marketplace moving.'));h.append(text,button('Refresh',()=>refresh()));root.append(h);}
 function show(){for(const b of document.querySelectorAll('[data-admin-view]')){const active=b.dataset.adminView===view;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');}approvals.hidden=view!=='approvals';root.hidden=view==='approvals';if(view==='approvals')return;heading();if(!ready)return;
  if(view==='field')fieldAdmin.render(root);if(view==='users')userManagement();if(view==='overview')overview();if(view==='products')productsView();if(view==='sellers'||view==='billing')registry();if(view==='support')support();if(view==='finance')financeView();}
 function overview(){
  const review=getReviewSummary(),stats=el('div',undefined,'overview-stats');
  const stat=(label,value,note,target,tone)=>{
   const b=el('button',undefined,'overview-stat '+tone);b.type='button';
   b.append(el('span',label,'overview-stat-label'),el('strong',String(value)),el('small',note),el('span','Open →','overview-stat-link'));
   b.onclick=()=>safely(()=>navigate(target));stats.append(b);
  };
  stat('Seller verification',review.loaded?review.count:'—',review.loaded?(review.hasMore?'Loaded queue · more available':'Loaded review queue'):'Queue unavailable — open to retry','approvals','tone-mint');
  stat('Seller records',sellerSnapshotLoaded?sellers.length:'—',sellerSnapshotLoaded?(next?'Loaded page · more available':'Loaded seller records'):'Registry unavailable — open to retry','sellers','tone-cream');
  stat('Approved sellers',sellerSnapshotLoaded?sellers.filter(s=>s.approvalStatus==='approved').length:'—','Among loaded seller records','sellers','tone-blue');
  stat('Historic mandate records',mandatesLoaded?mandates.length:'—',mandatesLoaded?(mandatesLimited?'First 50 archived records':'Archived for audit only'):'Mandate archive unavailable','billing','tone-sand');
  root.append(stats);

  const grid=el('div',undefined,'overview-grid');
  const desk=el('section',undefined,'panel overview-panel overview-desk');
  const deskHead=el('div',undefined,'overview-panel-heading');
  const deskTitle=el('div');deskTitle.append(el('h3','Your review desk'),el('p','Pick up where your team needs you.'));
  deskHead.append(deskTitle,el('span','QUICK ACTIONS','overview-kicker'));desk.append(deskHead);
  const actions=el('div',undefined,'overview-actions');
  for(const [target,label,desc,number] of [
   ['sellers','Business accounts & approvals','One profile: verify the business and view what is missing.',review.loaded?String(review.count)+' loaded':'Open queue'],
   ['billing','Finance and membership','Check Paystack membership, settlement and archived mandates.',mandatesLoaded?String(mandates.length)+' loaded':'Open inbox'],
   ['support','Manage support requests','Follow up on the cases your team has recorded.','Open cases'],
   ['field','Manage the field team','Review applications, areas and visits.','Open HR']]){
    const b=el('button',undefined,'overview-action');b.type='button';
    const copy=el('span',undefined,'overview-action-copy');copy.append(el('strong',label),el('small',desc));
    b.append(el('span',label.slice(0,1),'overview-action-icon'),copy,el('span',number,'overview-action-meta'),el('span','→','overview-action-arrow'));
    b.onclick=()=>safely(()=>navigate(target));actions.append(b);
  }
  desk.append(actions);grid.append(desk);

  const mix=el('section',undefined,'panel overview-panel overview-mix');
  mix.append(el('h3','Seller status'),el('p',sellerSnapshotLoaded?
   (next?'Based on the loaded page; more records are available.':'Based on the currently loaded seller records.'):
   'Seller records have not loaded yet.'));
  if(sellerSnapshotLoaded&&sellers.length){
   const groups=[['Approved',sellers.filter(s=>s.approvalStatus==='approved').length,'approved'],
    ['Pending',sellers.filter(s=>s.approvalStatus==='pending').length,'pending'],
    ['Other',sellers.filter(s=>!['approved','pending'].includes(s.approvalStatus)).length,'other']];
   for(const [label,count,tone] of groups){const row=el('div',undefined,'mix-row');
    const line=el('div',undefined,'mix-label');line.append(el('span',label),el('strong',String(count)));
    const bar=el('div',undefined,'mix-bar');bar.setAttribute('aria-hidden','true');
    const fill=el('span',undefined,'mix-fill '+tone);fill.style.width=(count/sellers.length*100)+'%';bar.append(fill);row.append(line,bar);mix.append(row);}
  }else mix.append(el('p',sellerSnapshotLoaded?'No seller records were returned.':'Open the seller directory to retry.','overview-empty'));
  mix.append(button('Open seller directory',()=>navigate('sellers')));grid.append(mix);

  const recent=el('section',undefined,'panel overview-panel overview-sellers');
  const recentHead=el('div',undefined,'overview-panel-heading'),recentTitle=el('div');
  recentTitle.append(el('h3','Seller directory'),el('p','A quick look at loaded shops.'));
  recentHead.append(recentTitle,button('View all',()=>navigate('sellers')));recent.append(recentHead);
  if(sellerSnapshotLoaded&&sellers.length){
   const rows=sellers.slice(0,5).map(s=>{
    const name=el('div',undefined,'overview-seller-name');name.append(el('strong',s.shopName||'Unnamed shop'),el('small',s.category==='spaza'?'Spaza shop':s.category==='retail'?'Retail or wholesale':'Business'));
    return [name,tag(s.approvalStatus||'unknown'),button('Open account',async()=>{await navigate('sellers');await choose(s);})];
   });recent.append(table(['Shop','Verification',''],rows));
  }else recent.append(el('p',sellerSnapshotLoaded?'No seller records to show.':'Seller information is unavailable.','overview-empty'));
  grid.append(recent);

  const guidance=el('section',undefined,'panel overview-panel overview-guide');
  guidance.append(el('span','A LITTLE GUIDANCE','overview-kicker'),el('h3','A clear next step for every seller.'),
   el('p','Verify the owner first. Review any mandate separately; a submitted form is not a collected payment.'));
  guidance.append(button('Open seller verification',()=>navigate('approvals')));grid.append(guidance);
  root.append(grid);
 }
 async function choose(s){if(view==='products')view='sellers';const sameAccount=selected?.sellerUid===s.sellerUid&&detail!==null;selected=s;if(!sameAccount)accountTab=view==='billing'?'finance':'summary';detail=null;const loading=card('Opening seller account…',s.shopName);loading.setAttribute('role','status');root.replaceChildren(loading);loading.scrollIntoView({block:'start',behavior:'instant'});try{
    try{detail=await request('ops_seller_detail',{sellerUid:s.sellerUid});}
    catch(error){
      if(error.stale||![500,502,503,504].includes(error.status))throw error;
      detail=await request('ops_seller_profile',{sellerUid:s.sellerUid});
      accountTab='summary';
    }
    show();const account=root.querySelector('[data-seller-account]');
    account?.scrollIntoView({block:'start',behavior:'instant'});
    account?.focus({preventScroll:true});
   }catch(error){
     if(!error.stale){
       selected=null;detail=null;show();
       message('Business account details are temporarily unavailable. No approval or payment was changed. Refresh the backend and try again.','warning');
       root.scrollIntoView({block:'start',behavior:'instant'});
     }
     throw error;
   }}
 function sellerPicker(form){return choice(form,'Seller','sellerUid',sellers.map(s=>[s.sellerUid,s.shopName+' · '+s.sellerUid]),selected?.sellerUid||sellers[0]?.sellerUid);}
 function registry(){
   if(!detail&&view!=='billing')root.append(button('Review pending business verifications',()=>navigate('approvals')));
   const c=card(view==='billing'?'Choose a business for finance':'Business account directory',
     next?'Load more to find an account.':'Select a business to view one unified account profile.');const input=el('input');input.type='search';input.placeholder='Search shop, phone or email';input.setAttribute('aria-label','Search loaded sellers');const list=el('div');const draw=()=>{const term=input.value.toLowerCase();list.replaceChildren(table(['Shop / owner','Status','Subscription',''],sellers.filter(s=>[s.shopName,s.ownerEmail,s.phone].join(' ').toLowerCase().includes(term)).map(s=>[[s.shopName,s.ownerEmail].filter(Boolean).join(' · '),tag(s.accountConflict?'Account ownership conflict':s.approvalStatus==='approved'?'Business approved':'Verification in progress'),
      tag(s.accountConflict?'Review required':s.subscription==='premium'?'Premium account':s.subscription==='temporary_access'?'Temporary access':'Free account'),
      s.accountConflict?button('Review conflict',()=>showAccountConflict(s)):button('Open account',()=>choose(s))])));};input.oninput=draw;c.append(input,list);draw();if(next)c.append(button('Load more sellers',async()=>{const r=await request('ops_sellers',{after:next});sellers=[...sellers,...r.sellers];next=r.next;show();}));if(!detail){
      root.append(c);
      if(view==='billing'){closureReview();mandateQueue();}
      root.append(el('p','Select a business account to inspect its verification, shop visibility, membership, support and financial history.','footnote'));
      return;
   }

 function showAccountConflict(s){
   const warning=card('Account ownership conflict · '+s.ownerEmail,
     'Multiple historical seller documents share one email. We cannot infer which record owns Firebase Auth, nor copy approval, documents or Paystack history between UIDs.');
   warning.append(el('p','Affected seller UIDs: '+(s.conflictingSellerUids||[]).join(' · '),'notice warning'),
     el('p','Verify the authoritative Firebase Authentication UID and investigate historical records before any account migration. No seller approval, billing, or deletion has been changed.','footnote'));
   root.replaceChildren(warning,button('← Back to business directory',()=>show()));
 }
 function mandateQueue(){
   const box=el('details',undefined,'panel ops-card ops-legacy-archive');
   box.open=archiveExpanded;
   box.addEventListener('toggle',()=>{archiveExpanded=box.open;});
   const archiveToggle=el('summary');archiveToggle.append(el('h3','Historic Netcash mandate archive — read-only'));
   box.append(archiveToggle,
     el('p','Archived consent only. These mandates cannot authorise a new debit or prove a Paystack subscription.','footnote'));
   box.append(table(['Seller','Account ending','Bank','Mandate','Action'],
     mandates.map(m=>[m.shopName||m.sellerUid,'•••• '+(m.accountLast4||'—'),
       m.bankName||'—',tag(m.status),
       button('Open mandate',()=>choose(sellers.find(s=>s.sellerUid===m.sellerUid)||
         {sellerUid:m.sellerUid,shopName:m.shopName||'Seller'}))])));
   if(!mandatesLoaded)box.append(el('p','Unable to load mandates: '+(mandateError||'An unknown error occurred.')+'. Select Refresh to check again.','notice warning'));
   else if(!mandates.length)box.append(el('p','No mandates have been submitted.','footnote'));
   box.append(button('Refresh mandates',()=>refresh()));
   root.append(box);
 }
 async function inspectMandate(m){
   if(!m||!selected)return;
   const info=await request('ops_mandate_detail',{sellerUid:selected.sellerUid,mandateId:m.mandateId});
   const dialog=el('dialog');dialog.className='ops-mandate-dialog';
   const content=el('div',undefined,'ops-mandate-content');
   content.append(el('h3','R99 debit-order consent request · provider approval pending'),
     el('p','Shop: '+info.shopName+' · '+info.shopAddress),
     el('p','Seller email: '+(info.ownerEmail||'—')),
     el('p','Status: '+info.mandate.status+' · No debit has been collected by Teyza.'),
     el('p','Bank: '+info.mandate.bankName+' · Branch: '+info.mandate.branchCode),
     el('p','Account holder: '+info.sensitive.accountHolder),
     el('p','Account number: '+info.sensitive.accountNumber),
     el('p','Account type: '+info.sensitive.accountType),
     el('p','Contact: '+info.sensitive.firstName+' '+info.sensitive.surname+' · '+info.sensitive.phone),
     el('p','Owner ID: '+info.sensitive.documentKind+' '+info.sensitive.documentNumber),
     el('p','Mandate reference: '+info.mandate.mandateId),
     el('p','First collection: '+info.mandate.firstDate+' · day '+info.mandate.collectionDay+' monthly'),
     el('p','Accepted: '+new Date(info.mandate.acceptedAt).toLocaleString('en-ZA')),
     el('p','Consent text: '+info.mandate.terms),
     el('p','Sensitive details are displayed only to authorised administrators and this view is audited.',
       'notice warning'));
   const exportedSellerUid=info.sellerUid,exportedId=info.mandate.mandateId;
   const download=button('Download historical mandate PDF',async()=>{
     if(!confirm('This historical document contains full bank and identity details. It is not authority for a new debit. Continue?'))return;
     const exportData=await request('ops_mandate_export',{
       sellerUid:exportedSellerUid,mandateId:exportedId});
     downloadMandateRequestPdf(exportData);
     message('Confidential mandate request downloaded. Keep this historical document private. New Netcash collection is retired.','success');
   },'primary');
   content.append(download,el('p','Includes seller consent, shop address, bank details and R99 dates. It is NOT a Netcash-approved signed mandate; a checkbox alone is insufficient.','footnote'));
   const close=el('button','Close and clear details','button primary');
   close.type='button';close.onclick=()=>dialog.close();
   content.append(close);dialog.append(content);
   dialog.addEventListener('close',()=>{dialog.replaceChildren();dialog.remove();});
   document.body.append(dialog);dialog.showModal();
 }
 function mandateReview(m){
   const box=card('Historic Netcash mandate · '+(m.shopName||'Seller'),
     'Archived consent only. New Netcash collections and approvals are disabled; no payment is recorded.');
   box.append(tag(m.status),el('p',m.bankName+' · account ending '+m.accountLast4),
     el('p','First requested collection date: '+m.firstDate),
     button('View private mandate (audited)',()=>inspectMandate(m)));
   if(detail?.mandateAccessActive&&detail.mandateAccessUntil)box.append(el('p',
     (detail.mandateAccessKind==='processing_7d'?'Processing access until ':'Provider-confirmed access until ')+
       new Date(detail.mandateAccessUntil).toLocaleString('en-ZA'),'notice success'));
   box.append(el('p','This Netcash record is retained for audit only. Future selling access requires independently verified Paystack payment.','notice warning'));
   root.append(box);
 }
 function closureReview(){const box=card('Account closures and payment review','Cancellation is complete only when Paystack confirms it. Investigate needs-attention items and any checkout or refund still open.');
  const relevant=closures.filter(x=>x.seller&&x.needsBillingReview);
  box.append(table(['Seller ID','Deletion reference','Paystack cancellation',''],relevant.map(x=>[
   x.uid,x.reference,tag(x.paystackCancellationStatus||'billing review'),
   button('Open seller payment review',()=>choose(sellers.find(s=>s.sellerUid===x.uid)||{sellerUid:x.uid,shopName:'Seller'}))])));
  if(closuresNext)box.append(button('Load more account closures',async()=>{const r=await request('ops_account_deletion_queue',{after:closuresNext});closures.push(...(r.requests||[]));closuresNext=r.nextAfter||null;show();}));
  root.append(box);
 }
  const d=detail,account=card(d.seller.shopName,'Seller account · '+d.seller.sellerUid);account.dataset.sellerAccount=d.seller.sellerUid;account.tabIndex=-1;account.append(button('← Back to seller directory',async()=>{selected=null;detail=null;show();root.scrollIntoView({block:'start',behavior:'instant'});}));account.append(el('p',d.seller.ownerEmail+' · '+d.seller.phone),
    el('p',d.seller.address),
    tag(d.seller.approvalStatus==='approved'?'Business approved':'Verification pending'),
    tag(d.membershipPaid?'Premium account':d.complimentaryAccess?'Temporary access · not paid':'Free account'));
  account.append(el('p','Account ID: '+d.seller.sellerUid+' · '+(d.businessAccount?.type||'Business')));
  if(d.seller.approvalStatus!=='approved')
    account.append(el('p','The registration is recorded. Final identity and business verification is pending; payment is a separate decision.','notice warning'));if(d.seller.approvalStatus==='approved')
    account.append(el('p','Business approval is complete. Your shop listing can be free and live; subscription status is separate. Do not approve the seller or products again.','notice success'));
  else account.append(button('Open approval desk',()=>navigate('approvals')));
  root.append(account);
  const accountTabs=el('nav',undefined,'ops-account-tabs');
  accountTabs.setAttribute('aria-label','Business account sections');
  for(const [key,label] of [
    ['summary','Overview'],['verification','Verification'],['shop','Shop & selling'],
    ['finance','Finance'],['chat','Support']
  ]){
    const control=el('button',label,'button '+(accountTab===key?'primary':'quiet'));
    control.type='button';control.setAttribute('aria-current',accountTab===key?'page':'false');
    control.onclick=()=>{accountTab=key;show();root.querySelector('[data-seller-account]')?.scrollIntoView({block:'start',behavior:'instant'});};
    accountTabs.append(control);
  }
  root.append(accountTabs);
  if(d.partial){
    const limited=card('Business account summary · limited service',
      'Full account details returned a server error. The basic registration status is available, but documents, payments, shop product counts and financial history have NOT been loaded.');
    limited.append(el('p','Business verification: '+(d.seller.approvalStatus==='approved'?'Approved':'Pending')),
      el('p','Community listing: '+(d.businessAccount?.isPublic?'Live':'Not yet live')),
      el('p','Selling: '+(d.membershipPaid?'Verified Premium':d.complimentaryAccess?'Temporary access':'Free')),
      el('p','The detailed backend must recover before financial or verification decisions can be made.','notice warning'),
      button('Retry complete account',()=>choose({...sellers.find(x=>x.sellerUid===d.seller.sellerUid),sellerUid:d.seller.sellerUid,shopName:d.seller.shopName})));
    root.append(limited);
    return;
  }
  if(accountTab==='summary'){
    const life=d.businessAccount||{},isApproved=d.seller.approvalStatus==='approved';
    const summary=card('Business account overview',
      'One business verification outcome. Membership and settlement are separate finance decisions.');
    summary.append(el('p','Business type: '+(life.type||'Registered business')),
      el('p','Business verification: '+(isApproved?'Approved':'Verification pending')),
      el('p','Community visibility: '+(life.isPublic?'Shop is live':'Not yet live')),
      el('p','Selling entitlement: '+(d.membershipPaid?'Premium account':
        d.complimentaryAccess?'Temporary access · not a payment':'Free account · unable to sell')),
      el('p','Product approval: Not required; products publish automatically after verified membership.'));
    if(!isApproved){
      const remaining=life.missingRequirements||[];
      summary.append(el('p',remaining.length?
        'Registration checklist still missing: '+remaining.join(', ').replaceAll('_',' '):
        'Uploaded requirements look complete; final identity review has not yet been recorded.',
        'notice warning'),button('Open one verification checklist',()=>{accountTab='verification';show();}));
    }
    if(isApproved&&!life.isPublic)
      summary.append(el('p','Check shop location and publication status under Shop & selling.','notice warning'));
    summary.append(button('View membership & finance',()=>{accountTab='finance';show();}),
      button('View seller support',()=>{accountTab='chat';show();}));
    root.append(summary);
  }
  if(accountTab==='verification'){
    const life=d.businessAccount||{},checks=life.verificationChecks||[];
    const review=card('One business verification checklist','Registration is free. Email and phone checks are automatic. An uploaded ID and selfie still require genuine identity review; uploading does not prove identity.');
    if(checks.length)review.append(table(['Requirement','Status'],checks.map(x=>[
      x.label,tag(x.complete?'Complete':'Missing')
    ])));
    review.append(el('p',d.seller.approvalStatus==='approved'?
      'Final business approval: Approved. No repeat approval required.':
      'Final business approval: Awaiting business and identity review. No payment is required to be verified.',
      d.seller.approvalStatus==='approved'?'notice success':'notice warning'));
    if(d.seller.approvalStatus!=='approved')
      review.append(button('Review final verification decision',()=>navigate('approvals')));
    root.append(review);
    sellerDocuments();
  }
  if(accountTab==='shop'){
  const status=d.sellingStatus;
  if(status){
    const review=card('Business approval · free listing · premium selling','One final seller approval only. Free shop discovery is separate from verified membership; products do not require individual admin approval.');
    review.append(el('p','Business verification: '+(status.sellerApproved?'Approved':'Still in progress')),
      el('p','Registration: '+(status.shopSetupComplete?'Complete':'Needs finishing')),
      el('p','Community listing: '+(d.businessAccount?.isPublic?'Shop is live':'Not yet live')),
      el('p','Selling account: '+(d.membershipPaid?'Premium account':
        d.complimentaryAccess?'Temporary access · not subscribed':'Free · upgrade needed after verification')),
      el('p','Public products: '+Number(status.publicProductCount||0)+' · No individual product approvals'));
    if(status.publicProductsAllowed===false){
      review.append(el('p','Wholesaler listing only. Supplier products and prices are not shown on the public shopper app.','notice'));
    }else{
      review.append(el('p','Saved seller products: '+(status.savedDraftCount??'Not checked')+
        ' · Live-priced products: '+(status.publicProductCount||0)));
      if(status.draftLimitReached)review.append(el('p','More than 200 private drafts found. Contact Teyza support before publishing.','notice warning'));
      if(status.canSell&&status.publicProductCount>0&&
          (status.savedDraftCount||0)<=status.publicProductCount)
        review.append(el('p','These products are already published. There is no need to approve them again. Check their public-directory and nearby-location status below.','notice success'));
      if(status.canSell&&((status.savedDraftCount||0)>(status.publicProductCount||0))){
        const form=el('form',undefined,'ops-form');
        field(form,'Reason to repair the seller catalogue sync','reason','textarea');
        check(form,'I checked the shop approval and selling entitlement. This publishes the seller’s saved product prices and stock, without collecting or recording R99.','confirmed');
        submit(form,'Repair saved-product sync',async fd=>{
          const reason=String(fd.get('reason')||'').trim();
          if(reason.length<15)throw Error('Explain this publication in at least 15 characters.');
          if(!confirm('Repair the approved seller’s existing product sync? This is not an extra product approval or a payment.'))return;
          const result=await request('ops_catalogue_publish',{sellerUid:d.seller.sellerUid,reason,confirmed:true});
          await choose(selected);
          message((result.publicProductCount||0)+' products synced to the shopper catalogue. No extra approval was recorded.','success');
        });
        review.append(form);
      }
    }
    const visibility=d.shopperVisibility;
    if(visibility){
      const details=el('div',undefined,'ops-visibility-diagnostic');
      details.append(el('h4','Shopper discovery and location check'),
        el('p','Public directory eligibility: '+(visibility.directoryEligible?'Approved and active':'Not currently eligible')+
          ' · Public-feed priced products: '+Number(visibility.publicProductCount||0)));
      if(!visibility.hasValidPin){
        const problem=visibility.status==='address_changed'
          ?'The seller changed the shop address after setting the location. Save a new shop pin matching the updated address.'
          :visibility.status==='pin_expired'
          ?'The saved Google shop coordinates have expired. Refresh and save the shop location.'
          :visibility.status==='seller_not_public'
          ?'This shop is not eligible for the public directory yet. Check the current seller verification and approval.'
          :'No valid shop coordinates are available. Ask the seller to open My business → Shop location, confirm the address, and save the pin.';
        details.append(el('p',problem,'notice warning'));
      }else{
        details.append(el('p','Valid physical shop pin: '+Number(visibility.latitude).toFixed(5)+
          ', '+Number(visibility.longitude).toFixed(5)+
          '. Customer results use the distance from their saved delivery location within the selected search radius.','notice success'));
      }
      review.append(details);
    }
    if(!status.sellerApproved){
      review.append(el('p','Business verification is still pending. Uploaded identity evidence is not a separate final approval. Use the one checklist in this account.','notice warning'),
        button('Open verification checklist',()=>{accountTab='verification';show();}));
    }else if(!status.shopSetupComplete)
      review.append(el('p','Registration is approved. Finish shop setup and phone verification.','notice warning'));
    else if(!status.sellingAccessActive)
      review.append(el('p','Shop approval is complete and is not a charge. The free listing can be discoverable; to sell or advertise the business needs a verified premium membership (or an audited temporary access grant). The seller upgrades independently. No product-by-product approval is required.','notice warning'));
    if(d.mandateAccessActive)review.append(el('p',
      (d.mandateAccessKind==='processing_7d'?'7-day processing access until ':'30-day provider-accepted access until ')+
      new Date(d.mandateAccessUntil).toLocaleString('en-ZA'),'notice success'));
    root.append(review);
  }
  }
  if(accountTab==='finance'){
  const sellerMandate=mandates.find(m=>m.sellerUid===d.seller.sellerUid);
  if(sellerMandate)mandateReview(sellerMandate);
  // Seller ID approval is independent from Paystack purchase confirmation.
  const billing=card('Paystack seller membership',d.membershipPaid?'Seller membership verified by Paystack.':
    'No active verified Paystack membership. Shop review can be completed, but products remain disabled until payment is confirmed.');
  billing.append(tag(d.membershipPaid?'Paystack paid':d.complimentaryAccess?'Admin promotional access · not a payment':'Not paid'));
  billing.append(el('p','Mode: '+(d.paystackMode==='live'?'Live Paystack':'Paystack TEST — not real money')));
  billing.append(el('p','Membership: '+(d.billing?.status||'not started')+
    ' · Plan: '+(d.seller.listingPlan||'free')+
    ' · Renewal: '+(d.billing?.renewalSetup||'not scheduled')));
  if(d.billing?.paidUntil)
    billing.append(el('p','Paid until: '+new Date(d.billing.paidUntil).toLocaleString('en-ZA')));
  if(d.complimentaryAccess){
    billing.append(el('p','Promotional access ends: '+new Date(d.complimentaryUntil).toLocaleString('en-ZA')+' · Reason: '+(d.complimentaryReason||'')));
    billing.append(button('Revoke promotional access',async()=>{
      const reason=prompt('Enter a reason for revoking temporary access (at least 15 characters):');
      if(!reason||reason.trim().length<15)throw Error('A revocation reason of at least 15 characters is required.');
      if(!confirm('Revoke this complimentary grant now? This does not refund any real payment.'))return;
      await request('ops_complimentary_revoke',{sellerUid:d.seller.sellerUid,
        reason:reason.trim(),confirmed:true});
      message('Temporary access revoked and audited. Public product eligibility updated.','success');
      await choose(selected);
    }));
  }
  billing.append(el('p','New subscriptions must be authorised by the seller with Paystack card checkout on the Teyza website. Historic Netcash mandates remain read-only and are not chargeable.','footnote'));
  billing.append(el('p','Standard Premium remains R99/month. Admins may run occasional audited 7-, 14-, or 30-day promotional access grants for approved shops; these are not price discounts or Paystack payments.','footnote'));
  if(d.paystackMode!=='live')
    billing.append(el('p','TEST MODE: a successful sandbox payment does not mean real funds were collected. Do not activate a live seller on test transactions.','notice warning'));
  if(d.seller.approvalStatus==='approved'&&!d.membershipPaid&&!d.complimentaryAccess){
    const exception=el('form',undefined,'ops-form');
    choice(exception,'Admin promotional access','days',[[7,'7 days'],[14,'14 days'],[30,'30 days']],7);
    field(exception,'Campaign name / reason (audited)','reason','textarea');
    const confirmText=check(exception,'This is a time-limited complimentary grant, not a Paystack payment.','confirmed');
    submit(exception,'Grant promotional access',async fd=>{
      const reason=String(fd.get('reason')||'').trim();
      if(reason.length<15)throw Error('Enter a reason of at least 15 characters.');
      if(!confirm('Grant time-limited Premium access as an admin promotion without recording payment? Seller approval and identity verification remain mandatory. The standard R99 subscription price does not change.'))return;
      await request('ops_complimentary_access',{sellerUid:d.seller.sellerUid,
        days:Number(fd.get('days')),reason,confirmed:true});
      message('Admin promotional access granted with an audit record and expiry. No Paystack payment was recorded.','success');
      await choose(selected);
    });
    billing.append(exception);
  }
  root.append(billing);
  const payment=card('Payment references','Only references issued for this seller are eligible for confirmation. The server independently verifies payment with Paystack.');
  payment.append(table(['Reference','Type','Amount','Status','Action'],
    (d.payments||[]).map(row=>[
      row.reference,row.kind,money(row.amountCents),tag(row.status),
      row.status==='pending'&&/^TZM[_-]/.test(row.reference)?
        button('Verify with Paystack',async()=>{
          const result=await request('ops_paystack_confirm',{sellerUid:d.seller.sellerUid,reference:row.reference});
          await choose(selected);
          message(result.verified?'Paystack payment verified. Seller product eligibility has been refreshed.':'Payment needs refund review before this account can be closed.',result.verified?'success':'warning');
        }):row.status==='refund_review'?button('Verify processed refund',async()=>{
          const refundId=prompt('Enter the numeric Paystack refund ID after issuing a full refund:');
          if(refundId===null)return;
          if(!/^[0-9]{1,20}$/.test(refundId.trim()))throw Error('Enter a valid numeric Paystack refund ID.');
          await request('ops_paystack_refund_confirm',{sellerUid:d.seller.sellerUid,reference:row.reference,refundId:refundId.trim()});
          await choose(selected);message('Paystack confirmed the full refund was processed.','success');
        }):''
    ])));
  if(!(d.payments||[]).length)
    payment.append(el('p','No Paystack checkout reference has been recorded for this seller. The seller must use a supported checkout channel.','footnote'));
  root.append(payment);
  const settlement=card('Shopper order payments · Paystack','Paystack checkout for physical goods uses a verified seller subaccount. This is separate from Teyza seller membership fees.');
  if(d.payout?.connected)settlement.append(tag('Connected '+d.payout.mode),
    el('p',d.payout.businessName+' · '+d.payout.subaccountCode+' · Platform percentage configured at Paystack: '+d.payout.percentageCharge+'%'));
  else settlement.append(el('p','No settlement subaccount linked for this shop. Buyers cannot pay this seller through Paystack yet.','notice warning'));
  const payoutForm=el('form',undefined,'ops-form');
  field(payoutForm,'Verified Paystack subaccount code (ACCT_)','subaccountCode','text',d.payout?.subaccountCode||'');
  check(payoutForm,'I inspected this approved shop beneficiary and its bank settlement information in Paystack.','confirmed');
  submit(payoutForm,'Verify and connect Paystack',async fd=>{
    const code=String(fd.get('subaccountCode')||'').trim();
    if(!confirm('Link Paystack '+code+' to '+d.seller.shopName+' after verification? No debit or transfer will be initiated.'))return;
    const result=await request('ops_order_subaccount',{sellerUid:d.seller.sellerUid,
      subaccountCode:code,confirmed:true});
    message('Seller Paystack subaccount '+result.subaccountCode+' verified in '+result.mode+' mode.','success');
    await choose(selected);
  });
  settlement.append(payoutForm);root.append(settlement);
  }
  if(accountTab==='shop'){
  const catalogue=card('Seller products','An approved shop with active Paystack or temporary selling access can publish saved stock. Private drafts are not made public by approval or temporary access alone; use the seller’s Publish saved products action, or an audited admin catalogue repair.');
  const submitted=d.catalogue?.products||[];
  catalogue.append(tag(d.catalogue?.status||'not submitted'));
  catalogue.append(el('p',submitted.length+' products in the current listing.'));
  catalogue.append(table(['Product','Category','Price','Stock'],submitted.map(p=>[
    p.name||p.id,p.category||'Other',money(p.priceCents||0),p.stock??'Not supplied'
  ])));
  if(d.sellingStatus?.canSell===true&&d.sellingStatus?.publicProductsAllowed!==false&&Number(d.sellingStatus?.savedDraftCount||0)>0&&!Number(d.sellingStatus?.publicProductCount||0)){
    catalogue.append(el('p','This business has saved products and valid selling access, but no public products. Ask the seller to select Publish saved products, or use Repair saved-product sync in Shop & selling. Neither action creates a payment or adds another business approval.','notice warning'));
  }
  if(!d.canApproveCatalogue)catalogue.append(el('p','Products remain private until seller approval, shop setup and verified or temporary selling access are complete. Check the publication status above.','notice warning'));
  root.append(catalogue);
  }
  if(accountTab==='finance'){
  const statement=card('Historical seller statement','Existing manual invoices and receipts are kept for audit only. They no longer enable product selling.');
  statement.append(button('Print historical statement',()=>printStatement(d)));
  statement.append(table(['Date','Description','Period','Reference','Charge','Payment','Balance'],
    d.entries.map(e=>statementRows([e])[0])));
  root.append(statement);
  }
  if(accountTab==='chat')sellerAccountSupport(d);
 }

 function sellerAccountSupport(d){
   const sellerUid=d.seller.sellerUid,ticketId='seller_'+sellerUid;
   const panel=card('Teyza Support · '+d.seller.shopName,
     'Private business-owner conversation. Customer chat is separate. Support cannot activate memberships or send payment links.');
   const history=el('div',undefined,'ops-support-thread');
   const load=async()=>{
     try{
       const response=await request('ops_support_thread',{ticketId});
       if(detail?.seller?.sellerUid!==sellerUid||accountTab!=='chat')return;
       history.replaceChildren();
       const rows=response.messages||[];
       if(!rows.length)history.append(el('p','No messages have been sent.'));
       for(const m of rows){
         const bubble=el('div',undefined,'ops-support-bubble');
         bubble.append(el('strong',m.sender==='admin'?'Teyza Support':'Business owner'),el('p',m.text));
         history.append(bubble);
       }
     }catch(error){
       if(error.stale)return;
       if(error.status===404)history.replaceChildren(el('p','No conversation yet. The seller can start one from the app.'));
       else throw error;
     }
   };
   panel.append(button('Load conversation',load),history);
   const reply=el('form',undefined,'ops-form');
   field(reply,'Message to business owner (no payment links)','message','textarea');
   submit(reply,'Reply to seller',async fd=>{
     const msg=String(fd.get('message')||'').trim();
     if(msg.length<2)throw Error('Write a reply before sending.');
     await request('ops_support_reply',{ticketId,message:msg,
       messageId:'a'+Date.now().toString()+Math.random().toString(36).slice(2,10)});
     message('Support reply sent. No billing or approval changed.','success');
     await load();
   });
   panel.append(reply,button('Open support inbox',()=>navigate('support')));
   root.append(panel);
 }
 function productsView(){
   root.append(el('p','Only submitted seller catalogues appear here. Approving products never bypasses ID/selfie checks or Paystack payment verification.','footnote'));
   root.append(table(['Shop','Products','Seller approval','Paystack','Action'],
     catalogueQueue.map(row=>[
       row.shopName+' · '+row.ownerEmail,row.productCount,tag(row.approvalStatus),
       tag(row.paidMembership?'verified Paystack':row.complimentaryAccess?'temporary complimentary access':row.paymentStatus),
       button('Review products',()=>choose(row))
     ])));
   if(!catalogueQueue.length)
     root.append(el('p','No product catalogue submissions are waiting for review.','footnote'));
   if(catalogueLimited)
     root.append(el('p','Showing the first 50 pending submissions. Ask Teyza operations for additional review pagination.','footnote'));
   const adPanel=card('Wholesale advertising review',
     'In-app supplier promotions go only to spaza shops that opt in. Wholesaler products do not appear publicly.');
   if(wholesaleAdError)adPanel.append(el('p','Campaigns could not be loaded: '+wholesaleAdError,'notice warning'));
   if(!wholesaleAdQueue.length&&!wholesaleAdError)adPanel.append(el('p','No new wholesaler campaigns.','footnote'));
   for(const ad of wholesaleAdQueue){
     const item=el('section',undefined,'ops-review-item');
     item.append(el('h4',ad.supplierName+' · '+ad.title),el('p',ad.message),
       el('p','Participating spaza targets: '+ad.targetCount));
     const form=el('form',undefined,'ops-form');
     choice(form,'Decision','decision',[['approved','Approve moderated offer'],['rejected','Reject offer']],'approved');
     field(form,'Review note','reason','textarea','',false);
     check(form,'I checked the content. It will be visible only to spaza shops that opted in.','confirmed');
     submit(form,'Save advertising decision',async fd=>{
       const decision=fd.get('decision'),reason=String(fd.get('reason')||'').trim();
       if(decision==='rejected'&&reason.length<12)throw Error('Explain the rejection.');
       await request('ops_wholesale_ad_review',{campaignId:ad.id,decision,reason,confirmed:true});
       await refresh();message('Wholesaler advertising decision saved.','success');
     });
     item.append(form);adPanel.append(item);
   }
   root.append(adPanel);
   const panel=card('Teyza Ads · Shopper home review',
     'A spaza or local-business ad needs separate content approval and verified one-time payment before the sponsored card is visible to shoppers.');
   if(shopperAdError)panel.append(el('p','Shopper ad queue unavailable: '+shopperAdError,'notice warning'));
   if(!shopperAdQueue.length&&!shopperAdError)panel.append(el('p','No shopper-facing ads awaiting review.','footnote'));
   for(const ad of shopperAdQueue){
     const item=el('section',undefined,'ops-review-item');
     item.append(el('h4',ad.shopName+' · '+ad.title),el('p',ad.message),
       el('p',ad.radiusKm+' km radius · R'+(ad.amountCents/100).toFixed(2)+' for 7 days · Not yet paid'));
     item.append(button(shopperAdPreview?.id===ad.id?'Hide ad creative':'Inspect ad creative',async()=>{
       if(shopperAdPreview?.id===ad.id){shopperAdPreview=null;show();return;}
       const preview=await request('ops_ads_preview',{advertisementId:ad.id});
       if(typeof preview.imageBase64!=='string'||!preview.imageBase64)throw Error('Ad creative missing');
       shopperAdPreview={id:ad.id,bytes:preview.imageBase64};show();
     }));
     if(shopperAdPreview?.id===ad.id){
       const img=el('img');img.alt='Creative submitted by '+ad.shopName;
       img.src='data:image/jpeg;base64,'+shopperAdPreview.bytes;
       img.style.cssText='display:block;max-width:100%;max-height:300px;object-fit:contain;margin:12px 0';
       item.append(img);
       const form=el('form',undefined,'ops-form');
       choice(form,'Decision','decision',[['approved','Approve creative'],['rejected','Reject creative']],'approved');
       field(form,'Review note (mandatory for rejection)','reason','textarea','',false);
       check(form,'I personally inspected the image and advertiser. Approval alone does not charge or publish this campaign.','confirmed');
       submit(form,'Save shopper ad decision',async fd=>{
         const decision=String(fd.get('decision')),reason=String(fd.get('reason')||'').trim();
         if(decision==='rejected'&&reason.length<12)throw Error('Explain the rejection in 12 or more characters.');
         await request('ops_ads_review',{advertisementId:ad.id,decision,reason,confirmed:true});
         shopperAdPreview=null;await refresh();
         message('Shopper ad moderated. Verified payment is still required for display.','success');
       });
       item.append(form);
     }else item.append(el('p','Inspect the uploaded image before taking an approval decision.','footnote'));
     panel.append(item);
   }
   root.append(panel);
   const publishPanel=card('Teyza Ads · Paid, awaiting publication',
     'The charge must be independently verified and the approved creative rechecked. The 7-day duration only starts when you publish the ad.');
   if(shopperAdActivationError)publishPanel.append(el('p',shopperAdActivationError,'notice warning'));
   if(!shopperAdActivationQueue.length&&!shopperAdActivationError)
     publishPanel.append(el('p','No verified paid ads awaiting publication.','footnote'));
   for(const ad of shopperAdActivationQueue){
     const item=el('section',undefined,'ops-review-item');
     item.append(el('h4',ad.shopName+' · '+ad.title),
       el('p',ad.message),
       el('p',ad.radiusKm+' km radius · R'+(ad.amountCents/100).toFixed(2)+' verified payment · 7 days AFTER publication'));
     item.append(button(shopperAdPreview?.id===ad.id?'Hide reviewed image':'Inspect reviewed image',async()=>{
       if(shopperAdPreview?.id===ad.id){shopperAdPreview=null;show();return;}
       const preview=await request('ops_ads_preview',{advertisementId:ad.id});
       if(typeof preview.imageBase64!=='string'||!preview.imageBase64)
         throw Error('Paid ad creative is missing');
       shopperAdPreview={id:ad.id,bytes:preview.imageBase64};show();
     }));
     if(shopperAdPreview?.id===ad.id){
       const img=el('img');img.alt='Approved ad from '+ad.shopName;
       img.src='data:image/jpeg;base64,'+shopperAdPreview.bytes;
       img.style.cssText='display:block;max-width:100%;max-height:300px;object-fit:contain;margin:12px 0';
       item.append(img);
       const form=el('form',undefined,'ops-form');
       check(form,'I rechecked the paid, approved creative and shop location. Publishing now starts the seven-day campaign.','confirmed');
       submit(form,'Publish paid ad · Start 7 days',async fd=>{
         if(!fd.get('confirmed'))throw Error('Confirm the final paid advertisement review.');
         await request('ops_ads_activate',{advertisementId:ad.id,confirmed:true});
         shopperAdPreview=null;await refresh();
         message('Verified paid ad published. Seven-day campaign started.','success');
       });
       item.append(form);
     }else item.append(el('p','Inspect the reviewed creative before publication.','footnote'));
     publishPanel.append(item);
   }
   root.append(publishPanel);
 }
 async function chooseUser(user){
  userSelected=user.uid;userDetail=null;
  userDetail=(await request('ops_user_detail',{userUid:user.uid}));
  if(view==='users'){
    show();
    const accountCard=root.querySelector('[data-user-detail]');
    accountCard?.setAttribute('tabindex','-1');
    accountCard?.scrollIntoView({block:'start',behavior:'instant'});
    accountCard?.focus({preventScroll:true});
  }
 }
 function userManagement(){
  root.append(el('p','Create shoppers or sellers using a private Firebase account setup email. Newly invited sellers still must verify their phone, upload documents and pass the normal administrator review. Administrator privileges are granted separately by the project owner.','footnote'));
  const create=card('Add a user','The user chooses their own password from an email link; Teyza never displays or stores it in this admin screen.'),
    form=el('form',undefined,'ops-form');
  field(form,'Full name','displayName','text');
  field(form,'Email address','email','email');
  choice(form,'User type','requestedRole',[['shopper','Shopper'],['seller','Seller (registration still required)']],'shopper');
  check(form,'I confirm this person requested a Teyza account and may receive an email invitation.','confirmed');
  submit(form,'Create account and send setup email',async fd=>{
    const address=String(fd.get('email')||'').trim();
    if(!confirm('Create a Teyza account and send a password-setup email to '+address+'?'))return;
    const reply=await request('ops_user_create',{
      displayName:fd.get('displayName'),email:address,
      requestedRole:fd.get('requestedRole'),confirmed:true
    });
    message(reply.inviteSent?
      'Account created. Firebase sent a password-setup email; the user must also verify their email.':
      'Account created, but Firebase could not send the setup email. Select this account and use Resend setup email.','success');
    await refresh();
  });
  create.append(form);root.append(create);
  const directory=card('Firebase users',usersNext?'More accounts available; load additional pages to search.':'Search the loaded accounts.'),
    search=el('input'),list=el('div');
  search.type='search';search.placeholder='Search email, name or UID';search.setAttribute('aria-label','Search loaded Firebase users');
  function draw(){
    const q=search.value.toLowerCase();
    list.replaceChildren(table(['Account','Email status','Access',''],users.filter(u=>
      [u.email,u.displayName,u.uid].join(' ').toLowerCase().includes(q)).map(u=>[
        (u.displayName||'Anonymous shopper')+' · '+(u.email||'No email')+' · '+u.uid,
        tag(u.verified?'Email verified':'Not verified'),
        tag(u.admin?'Administrator':u.disabled?'Suspended':'Active'),
        button('View user',()=>chooseUser(u))])));
  }
  search.oninput=draw;directory.append(search,list);draw();
  if(usersNext)directory.append(button('Load more users',async()=>{
    const page=await request('ops_users',{after:usersNext});
    users.push(...page.users.filter(u=>!users.some(existing=>existing.uid===u.uid)));
    usersNext=page.next;show();
  }));
  root.append(directory);
  if(!userDetail)return;
  const {user,seller}=userDetail,
    view=card(user.displayName||user.email||'Account',user.uid);
  view.dataset.userDetail=user.uid;
  view.append(button('← Back to users',()=>{userSelected=null;userDetail=null;show();root.querySelector('[aria-label="Search loaded Firebase users"]')?.focus();}));
  view.append(el('p',user.email||'No email linked'),
    el('p','Email: '+(user.verified?'verified':'not verified')+
      ' · Account: '+(user.disabled?'suspended':'active')+
      ' · Authentication: '+(user.providers.length?user.providers.join(', '):'email / anonymous')),
    el('p',seller?'Seller: '+seller.shopName+' · '+seller.category+' · Account approval: '+seller.approvalStatus:
      'Shopper / no registered seller profile'),
    el('p',user.invitationStatus?
      'Invitation: '+user.invitationStatus:'Account invitation not created through admin.'));
  if(seller){
    const identityReviewed=seller.verifiedOwner===true;
    const onboardingReady=seller.registrationReady===true;
    const membership=seller.membershipPaid?'Verified live Paystack membership':
      seller.complimentaryAccess?'Time-limited administrator access':'No verified product membership';
    view.append(el('p','Business verification: '+(seller.approvalStatus==='approved'?'Approved':'Pending verification')+
      ' · Registration: '+(onboardingReady?'Complete':'Incomplete')+
      ' · Selling: '+(seller.sellingUnlocked===true?'Enabled':'Membership or verification required')));
    view.append(el('p','Product membership: '+membership,'footnote'));
    if(seller.sellingUnlocked!==true)view.append(el('p',!identityReviewed?
      'This business still needs genuine identity and registration verification. Open the complete business account to see one checklist.':
      !onboardingReady?'The seller must finish onboarding, including verified mobile registration, before selling.':
      'Seller verification is complete. Products require a verified Paystack membership or a recorded administrator exception.',
      'notice warning'));
    view.append(button('Open complete business account',async()=>{
      await navigate('sellers');
      await choose(sellers.find(x=>x.sellerUid===user.uid)||{sellerUid:user.uid,shopName:seller.shopName||'Business'});
    }));
  }
  if(!user.admin){
    if(user.email)view.append(button('Send password setup email',async()=>{
      if(!confirm('Send a password reset/setup email to '+user.email+'?'))return;
      await request('ops_user_invite',{userUid:user.uid});
      message('Firebase sent the email. The user should check their inbox and complete verification.','success');
    }));
    view.append(button(user.disabled?'Reactivate user':'Suspend user',async()=>{
      if(!confirm((user.disabled?'Reactivate':'Suspend')+' '+(user.email||user.uid)+'?'+
        (user.disabled?'':' The user will lose access until reactivated.')))return;
      await request('ops_user_set_disabled',{userUid:user.uid,disabled:!user.disabled,confirmed:true});
      message(user.disabled?'Account reactivated.':'Account suspended and sessions revoked.','success');
      await refresh();
      if(users.some(u=>u.uid===user.uid))await chooseUser(users.find(u=>u.uid===user.uid));
    },user.disabled?'primary':'quiet'));
  }else view.append(el('p','Administrator accounts are protected. Only the project owner can grant or revoke administrator privileges.','notice warning'));
  root.append(view);
 }
 async function viewSellerEvidence(kind){
  if(!detail||!selected)return;
  const record=detail.documents?.[kind];
  if(!record?.available)throw Error('The current document is unavailable or expired. Ask the seller to submit a new copy.');
  const data={sellerUid:selected.sellerUid,
    ...(kind==='identity'?{evidenceId:record.evidenceId}:{submissionId:record.submissionId})};
  const response=await request(kind==='identity'?'seller_identity_read':'verification_read',data);
  clearMandatePhoto();
  mandatePhotoUrl=URL.createObjectURL(photoBlob(response.imageBase64));
  const photo=document.getElementById('largePhoto');
  photo.alt=kind==='identity'?'Private seller identity document':'Private owner selfie';
  photo.src=mandatePhotoUrl;
  document.getElementById('photoDialog').showModal();
 }
 function sellerDocuments(){
  const box=card('Verification documents','Current encrypted identity document and selfie. Only verified Teyza administrators can open these files; expired evidence must be resubmitted.');
  for(const [key,label] of [['identity','ID / passport / company registration'],['selfie','Owner verification selfie']]){
    const doc=detail.documents?.[key];
    const row=el('div',undefined,'ops-document-row');
    row.append(el('span',label+' · '+(!doc?'Not submitted':!doc.available?'Expired or unavailable':'Current')));
    if(doc?.available)row.append(button('View private document',()=>viewSellerEvidence(key)));
    else row.append(el('small','New evidence required.'));
    box.append(row);
  }
  box.append(button('Go to approval queue',()=>navigate('approvals')));
  root.append(box);
 }
 function printStatement(d){const w=window.open('','_blank');if(!w)throw Error('Allow popups to print the statement.');const doc=w.document;doc.title='Teyza seller statement';const style=doc.createElement('style');style.textContent='body{font:13px system-ui;padding:30px;color:#183c43}table{border-collapse:collapse;width:100%}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}h1{font-size:28px}@media print{button{display:none}}';doc.head.append(style);const body=doc.body;body.append(el('h1','Teyza · Seller statement'),el('p',d.seller.shopName+' · '+d.seller.sellerUid),el('p',d.seller.ownerEmail),el('p','Generated '+new Date().toLocaleString('en-ZA')+' · Currency ZAR'),table(['Date','Description','Month','Reference','Charge','Payment','Balance'],statementRows(d.entries)),el('p','Closing balance: '+money(d.entries.at(-1)?.balanceCents||0)),el('p','Subscription ledger. Not a bank statement or a VAT tax invoice.'));const b=el('button','Print / save PDF');b.onclick=()=>w.print();body.append(b);w.focus();}
 function support(){
   const intro=card('Seller and admin support chat','A private conversation with the original seller Firebase account. Customer conversations remain separate. This inbox is for account assistance, not for sending payment links or collecting passwords, OTPs or card details.');
   root.append(intro);
   const create=card('Log a received support request','Use this for email or phone requests. Internal notes are not visible to sellers.'),f=el('form',undefined,'ops-form');
   sellerPicker(f);field(f,'Subject','subject');field(f,'Request details','message','textarea');
   submit(f,'Create support case',async fd=>{await request('ops_support_create',Object.fromEntries(fd));await refresh();message('Support case created.','success');});
   create.append(f);root.append(create);
   for(const t of tickets){
     const liveChat=t.source==='seller_admin_chat';
     const c=card(liveChat?(t.shopName||'Seller')+' · Teyza Support':t.subject,
       t.ownerUid+' · '+new Date(t.createdAt).toLocaleString('en-ZA'));
     if(!liveChat)c.append(el('p',t.message));
     else c.append(el('p',t.lastMessage||'Seller has opened a support conversation.'));
     c.append(tag(t.status));
     if(liveChat){
       const thread=el('div',undefined,'ops-support-thread');
       let current=[];
       const paint=()=>{
         thread.replaceChildren();
         if(!current.length)thread.append(el('p','No messages yet.','footnote'));
         for(const m of current){
           const row=el('div',undefined,'ops-support-bubble');
           row.append(el('strong',m.sender==='admin'?'Teyza Support':'Seller'),
             el('p',m.text));
           thread.append(row);
         }
       };
       const load=async()=>{
         const r=await request('ops_support_thread',{ticketId:t.id});
         current=r.messages||[];paint();
       };
       c.append(button('Open conversation',async()=>{await load();}),thread);
       const reply=el('form',undefined,'ops-form');
       field(reply,'Reply to seller (no links or payment instructions)','message','textarea');
       submit(reply,'Send to seller',async fd=>{
         const text=String(fd.get('message')||'').trim();
         if(text.length<2)throw Error('Write a reply.');
         await request('ops_support_reply',{ticketId:t.id,message:text,
           messageId:'a'+Date.now().toString()+Math.random().toString(36).slice(2,10)});
         message('Support reply sent to this seller. No payment was created.','success');
         await load();
       });
       c.append(reply);
     }else{
       const notes=el('div');
       c.append(button('View internal notes',async()=>{
         const r=await request('ops_support_detail',{ticketId:t.id});
         notes.replaceChildren(...r.notes.map(n=>el('p',new Date(n.createdAt).toLocaleString('en-ZA')+' · '+n.note)));
         if(!r.notes.length)notes.append(el('p','No internal notes yet.'));
       }),notes);
       const form=el('form',undefined,'ops-form');
       choice(form,'Status','status',['open','in_progress','waiting_for_seller','resolved'].map(v=>[v,v.replaceAll('_',' ')]),t.status);
       choice(form,'Priority','priority',['normal','high','urgent'].map(v=>[v,v]),t.priority);
       field(form,'Internal note','note','textarea');
       submit(form,'Save case update',async fd=>{
         await request('ops_support_update',{ticketId:t.id,revision:t.revision,...Object.fromEntries(fd)});
         await refresh();message('Internal support note saved. No message sent.','success');
       });
       c.append(form);
     }
     root.append(c);
   }
   if(!tickets.length)root.append(el('p','No support conversations yet.','footnote'));
   if(moreTickets)root.append(button('Load more cases',async()=>{
     const r=await request('ops_support_list',{after:moreTickets});
     tickets.push(...r.tickets);moreTickets=r.next;show();
   }));
 }
 function financeView(){root.append(el('p','Finance decisions require a manual review. Approval in principle does not create a loan agreement or release funds.','notice warning'));for(const a of finance){const c=card('Stock finance · '+money(a.amountCents),a.ownerUid+' · '+new Date(a.createdAt).toLocaleDateString('en-ZA'));c.append(tag(a.status),el('p',a.purpose),el('p','Contact: '+a.phone));if(a.reviewNote)c.append(el('p','Review note: '+a.reviewNote));if(!['approved_in_principle','declined'].includes(a.status)){const f=el('form',undefined,'ops-form');choice(f,'Review outcome','status',[['under_review','Under review'],['more_information','Request more information'],['approved_in_principle','Approve in principle'],['declined','Decline']],a.status==='enquiry_received'?'under_review':a.status);field(f,'Approved amount (R) — only for approval','approved','text',String((a.amountCents||0)/100),false);field(f,'Review note / conditions','note','textarea');check(f,'I completed the manual review and checked the seller’s approval and supporting information.','reviewConfirmed');submit(f,'Save finance review',async fd=>{if(!confirm('Save this stock finance review outcome? No funds will be disbursed.'))return;await request('ops_finance_decide',{path:a.path,expectedStatus:a.status,status:fd.get('status'),approvedAmountCents:fd.get('status')==='approved_in_principle'?cents(fd.get('approved')):0,note:fd.get('note'),reviewConfirmed:true});await refresh();message('Finance review saved. Funds have not been disbursed.','success');});c.append(f);}else c.append(el('p','Reviewed outcome · '+money(a.approvedAmountCents||0)+' · Not disbursed','footnote'));root.append(c);}if(!finance.length)root.append(el('p','No stock finance requests loaded.','footnote'));if(moreFinance)root.append(button('Load more finance requests',async()=>{const r=await request('ops_finance_queue',{after:moreFinance});finance.push(...r.requests);moreFinance=r.next;show();}));}
 async function refreshMandates(){
   try{
     const answer=await request('ops_mandate_queue');
     if(!Array.isArray(answer.mandates))throw Error('The mandate inbox response was incomplete.');
     mandates=answer.mandates;mandatesLoaded=true;mandatesLimited=answer.limited===true;mandateError=null;
   }catch(e){
     if(e.stale||e.status===401||e.status===403)throw e;
     mandates=[];mandatesLoaded=false;mandatesLimited=false;
     mandateError=e.message||'The secure mandate service could not be reached.';
   }
 }
 async function refresh(){
   if(view==='field'){await fieldAdmin.refresh();show();return;}
   if(view==='users'){
     const page=await request('ops_users');users=page.users;usersNext=page.next;
     if(userSelected)userDetail=await request('ops_user_detail',{userUid:userSelected});
   }else if(view==='support'){
     const r=await request('ops_support_list');tickets=r.tickets;moreTickets=r.next;
   }else if(view==='finance'){
     const r=await request('ops_finance_queue');finance=r.requests;moreFinance=r.next;
   }else if(view==='products'){
     const r=await request('ops_catalogue_queue');catalogueQueue=r.submissions;catalogueLimited=r.limited;
     try{const q=await request('ops_wholesale_ads_queue');wholesaleAdQueue=q.campaigns||[];wholesaleAdError=null;}
     catch(e){if(e.stale||e.status===401||e.status===403)throw e;
       wholesaleAdQueue=[];wholesaleAdError=e.message||'Advertising review service unavailable';}
     try{const q=await request('ops_ads_queue');shopperAdQueue=q.ads||[];shopperAdError=null;}
     catch(e){if(e.stale||e.status===401||e.status===403)throw e;
       shopperAdQueue=[];shopperAdError=e.message||'Shopper ad review unavailable';}
     try{const q=await request('ops_ads_activation_queue');
       shopperAdActivationQueue=q.ads||[];shopperAdActivationError=null;}
     catch(e){if(e.stale||e.status===401||e.status===403)throw e;
       shopperAdActivationQueue=[];shopperAdActivationError=e.message||'Paid ads awaiting publication could not be loaded';}
   }else{
     // Keep the mandate inbox available even when the seller directory fails.
     if(view==='overview'||view==='billing')await refreshMandates();
     try{
       const r=await request('ops_sellers');
       if(!Array.isArray(r.sellers))throw Error('The seller directory returned an invalid response.');
       sellers=r.sellers;next=r.next;sellerSnapshotLoaded=true;
     }catch(e){
       if(e.stale||e.status===401||e.status===403)throw e;
       sellers=[];next=null;sellerSnapshotLoaded=false;
       if(view!=='overview'&&view!=='billing')throw e;
     }
     if(view==='billing'){
       try{
         const q=await request('ops_account_deletion_queue');
         closures=q.requests||[];closuresNext=q.nextAfter||null;
       }catch(e){
         if(e.stale||e.status===401||e.status===403)throw e;
         closures=[];closuresNext=null;
       }
     }
     if(selected)detail=await request('ops_seller_detail',{sellerUid:selected.sellerUid});
   }
   show();
 }
 async function navigate(v){
  if(!ready)return;
  fieldAdmin.hideSensitive();clearMandatePhoto();clearMandateDialogs();
  document.dispatchEvent(new Event('teyza-admin-view-change'));
  if(v!==view){selected=null;detail=null;accountTab='summary';userSelected=null;userDetail=null;}
  generation++;view=v;
  if(v==='approvals'){show();return;}
  // Do not render clickable forms while the previous view is loading.
  // All operations are guarded by a busy lock and early clicks would otherwise
  // silently be ignored until the first server response finishes.
  approvals.hidden=true;root.hidden=false;
  root.replaceChildren(el('p','Loading administrator workspace…','footnote'));
  await refresh();
}
 for(const b of navButtons)b.onclick=()=>safely(()=>navigate(b.dataset.adminView));
 document.getElementById('backToBusinessAccounts').onclick=()=>safely(()=>navigate('sellers'));
 return {clear,currentView:()=>view,navigate,async load(){ready=true;const stamp=generation;try{await refresh();}catch(e){if(!e.stale){onError(e);if(ready)show();}}finally{if(ready&&generation===stamp)enableNavigation(true);}},hideSensitive(){fieldAdmin.hideSensitive();clearMandatePhoto();clearMandateDialogs();generation++;selected=null;detail=null;root.replaceChildren();},show};
}
