import {createFieldAdmin} from '/js/teyza-field-admin.js?v=R323';
import {photoBlob} from '/js/teyza-app-admin-model.mjs?v=R323';
import {downloadMandateRequestPdf} from '/js/teyza-mandate-pdf.mjs';
import {money,cents,statementRows} from '/js/teyza-operations-model.mjs?v=R323';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const titles={users:'Users & access',overview:'Your operations, at a glance.',sellers:'Sellers and access exceptions',products:'Product activity',billing:'Debit-order mandate review',support:'A better support desk.',finance:'Stock finance review',field:'HR & field team'};
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
 let generation=0,ready=false,view='overview',sellers=[],next=null,selected=null,detail=null,sellerSnapshotLoaded=false,
     users=[],usersNext=null,userSelected=null,userDetail=null,
      tickets=[],finance=[],catalogueQueue=[],catalogueLimited=false,closures=[],closuresNext=null,mandates=[],mandatesLoaded=false,mandatesLimited=false,
     moreFinance=null,moreTickets=null,busy=false,mandateError=null;
 const message=(t,k='')=>{const box=document.getElementById('notice');box.textContent=t;box.className='notice '+k;box.hidden=false;};
 const fieldAdmin=createFieldAdmin({api:(action,data)=>request(action,data),onError,message});
 function clear(){fieldAdmin.clear();clearMandatePhoto();clearMandateDialogs();generation++;ready=false;view='overview';sellers=[];next=null;selected=null;detail=null;sellerSnapshotLoaded=false;users=[];usersNext=null;userSelected=null;userDetail=null;tickets=[];finance=[];catalogueQueue=[];catalogueLimited=false;closures=[];closuresNext=null;mandates=[];mandatesLoaded=false;mandatesLimited=false;mandateError=null;moreFinance=null;moreTickets=null;busy=false;enableNavigation(false);root.replaceChildren();}
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
  stat('Debit-order requests',mandatesLoaded?mandates.length:'—',mandatesLoaded?(mandatesLimited?'First 50 received requests':'Loaded requests · not a payment count'):'Mandate inbox unavailable — open to retry','billing','tone-sand');
  root.append(stats);

  const grid=el('div',undefined,'overview-grid');
  const desk=el('section',undefined,'panel overview-panel overview-desk');
  const deskHead=el('div',undefined,'overview-panel-heading');
  const deskTitle=el('div');deskTitle.append(el('h3','Your review desk'),el('p','Pick up where your team needs you.'));
  deskHead.append(deskTitle,el('span','QUICK ACTIONS','overview-kicker'));desk.append(deskHead);
  const actions=el('div',undefined,'overview-actions');
  for(const [target,label,desc,number] of [
   ['approvals','Verify seller registrations','Review identity documents and selfies.',review.loaded?String(review.count)+' loaded':'Open queue'],
   ['billing','Review debit-order mandates','Inspect R99 consent and prepare provider review.',mandatesLoaded?String(mandates.length)+' loaded':'Open inbox'],
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
 async function choose(s){if(view==='products')view='sellers';selected=s;detail=null;const loading=card('Opening seller account…',s.shopName);loading.setAttribute('role','status');root.replaceChildren(loading);loading.scrollIntoView({block:'start',behavior:'instant'});try{detail=await request('ops_seller_detail',{sellerUid:s.sellerUid});show();const account=root.querySelector('[data-seller-account]');account?.scrollIntoView({block:'start',behavior:'instant'});account?.focus({preventScroll:true});}catch(error){if(!error.stale){selected=null;show();root.scrollIntoView({block:'start',behavior:'instant'});}throw error;}}
 function sellerPicker(form){return choice(form,'Seller','sellerUid',sellers.map(s=>[s.sellerUid,s.shopName+' · '+s.sellerUid]),selected?.sellerUid||sellers[0]?.sellerUid);}
 function registry(){if(view==='billing')mandateQueue();const c=card('Seller directory',next?'This is a page of seller records. Load more to extend search.':'Search the loaded seller records.');const input=el('input');input.type='search';input.placeholder='Search shop, phone or email';input.setAttribute('aria-label','Search loaded sellers');const list=el('div');const draw=()=>{const term=input.value.toLowerCase();list.replaceChildren(table(['Shop / owner','Status','Subscription',''],sellers.filter(s=>[s.shopName,s.ownerEmail,s.phone].join(' ').toLowerCase().includes(term)).map(s=>[[s.shopName,s.ownerEmail].filter(Boolean).join(' · '),tag(s.approvalStatus),tag(s.subscription),button('Open account',()=>choose(s))])));};input.oninput=draw;c.append(input,list);draw();if(next)c.append(button('Load more sellers',async()=>{const r=await request('ops_sellers',{after:next});sellers=[...sellers,...r.sellers];next=r.next;show();}));if(!detail){root.append(c);if(view==='billing')closureReview();root.append(el('p','Select a seller to view their account, mandates and historical statement.','footnote'));return;}

 function mandateQueue(){
   const box=card('R99 monthly mandates — admin inbox',
     'These are preliminary consent requests. Obtain a Netcash-accepted signed paper or approved eMandate before submitting a debit batch.');
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
   const download=button('Download confidential PDF for Netcash review',async()=>{
     if(!confirm('This PDF contains full bank and identity details. Save and transmit only through an approved secure Netcash channel. It is NOT bank-authenticated. Continue?'))return;
     const exportData=await request('ops_mandate_export',{
       sellerUid:exportedSellerUid,mandateId:exportedId});
     downloadMandateRequestPdf(exportData);
     message('Confidential mandate request downloaded. Obtain the provider-approved mandate and bank authentication before collecting.','success');
   },'primary');
   content.append(download,el('p','Includes seller consent, shop address, bank details and R99 dates. It is NOT a Netcash-approved signed mandate; a checkbox alone is insufficient.','footnote'));
   const close=el('button','Close and clear details','button primary');
   close.type='button';close.onclick=()=>dialog.close();
   content.append(close);dialog.append(content);
   dialog.addEventListener('close',()=>{dialog.replaceChildren();dialog.remove();});
   document.body.append(dialog);dialog.showModal();
 }
 function mandateReview(m){
   const box=card('Debit-order mandate · R99/month',
     'Admin review of seller consent. A checkbox/PDF alone is not a Netcash-approved debit mandate. Obtain acceptable authority before collections.');
   box.append(tag(m.status),el('p',m.bankName+' · account ending '+m.accountLast4+
     ' · branch '+m.branchCode),
     el('p','Shop address: '+(m.shopAddress||'—')),
     el('p','First date: '+m.firstDate+' · recurring day '+m.collectionDay),
     el('p',m.status==='submitted_to_netcash'?'Netcash: submitted manually; bank acceptance and debit unverified':'Netcash: manual submission available after admin review; no debit initiated'),
     button('View complete private mandate (audited)',()=>inspectMandate(m)));
   if(['pending_provider_authentication','needs_correction','reviewed_pending_provider'].includes(m.status)){
     const form=el('form',undefined,'ops-form');
     choice(form,'Mandate review outcome','decision',[
       ['reviewed_pending_provider','Reviewed — awaiting collection provider'],
       ['needs_correction','Needs corrected details']
     ],'reviewed_pending_provider');
     field(form,'Reason / review note','reason','textarea');
     const optional=el('label',undefined,'confirm-check'),grantBox=el('input');
     grantBox.type='checkbox';grantBox.name='provisionalSelling';
     optional.append(grantBox,el('span','Also approve 30 days of temporary Start Selling access after a successful mandate review. This is an audited complimentary grant, not a Netcash collection or paid subscription.'));
     form.append(optional);
     check(form,'I understand this review does not activate a debit order or confirm a payment.','confirmed');
     submit(form,'Save mandate review',async fd=>{
       const decision=String(fd.get('decision')||''),reason=String(fd.get('reason')||'').trim();
       const grant=fd.get('provisionalSelling')==='on';
       if(grant&&(decision!=='reviewed_pending_provider'||detail?.seller?.approvalStatus!=='approved'))
         throw Error('Approve the seller and select Reviewed before granting provisional selling access.');
       if(grant&&reason.length<15)throw Error('Explain the provisional selling grant in at least 15 characters.');
       if(!confirm(grant?
         'Review the mandate and grant 30 days of complimentary Start Selling access? No debit or paid membership will be recorded.':
         'Save this mandate review? No debit order or paid membership will be activated.'))return;
       await request('ops_mandate_review',{sellerUid:selected.sellerUid,mandateId:m.mandateId,
         decision,reason,confirmed:true});
       if(grant){
         try{
           await request('ops_complimentary_access',{sellerUid:selected.sellerUid,days:30,reason,confirmed:true});
         }catch(error){
           // The review was saved; the grant was not. Keep the existing
           // separate grant action visible for a retry and explain the gap.
           await refresh();
           throw Error('Mandate review saved, but selling access was not granted: '+error.message);
         }
       }
       await refresh();
       message(grant?'Mandate reviewed. 30 days of temporary selling access granted; no payment recorded.':
         'Mandate review saved. Collection remains inactive.','success');
     });
     box.append(form);
   }
   if(m.status==='reviewed_pending_provider'){
     const send=card('Record manual Netcash portal submission',
       'Download the private consent PDF above, obtain a Netcash-acceptable signed paper/electronic mandate through the provider-approved process, and record the provider portal receipt here. A Netcash API is not required for this manual handoff.');
     const form=el('form',undefined,'ops-form');
     field(form,'Netcash submission or receipt reference','providerReference','text');
     field(form,'Submission method / date and internal note','note','textarea');
     check(form,'I obtained and submitted a Netcash-acceptable signed or approved eMandate, not just the Teyza consent PDF. I understand this is NOT a collected debit or paid seller access.','confirmed');
     submit(form,'Record manual submission',async fd=>{
       const reference=String(fd.get('providerReference')||'').trim();
       if(!confirm('Confirm a Netcash-acceptable signed mandate was submitted through the authorised provider portal? The Teyza consent PDF alone is insufficient; no payment is marked received.'))return;
       const answer=await request('ops_mandate_record_netcash_submission',{
         sellerUid:selected.sellerUid,mandateId:m.mandateId,providerReference:reference,
         note:String(fd.get('note')||'').trim(),confirmed:true});
       const result=await request('ops_mandate_queue');mandates=result.mandates||[];
       detail=null;selected=null;message(answer.recorded?'Netcash portal submission recorded. Await bank validation and confirmed collection.':'No change.','success');show();
     });
     send.append(form);box.append(send);
   }
   if(m.status==='submitted_to_netcash'){
     box.append(el('p','Submitted to Netcash manually. This is a record of transfer, not an authenticated mandate or a payment receipt. Paid access remains inactive.','notice warning'));
   }
   if(['reviewed_pending_provider','submitted_to_netcash'].includes(m.status)&&
      detail?.seller?.approvalStatus==='approved'&&!detail.membershipPaid&&!detail.complimentaryAccess){
     const grant=el('form',undefined,'ops-form');
     grant.append(el('h4','Approve provisional selling access'));
     grant.append(el('p','Admin may grant 30 days of audited complimentary product access while Netcash authentication and the first R99 debit remain pending. This does not mean the membership is paid.','footnote'));
     field(grant,'Reason for provisional access (audited)','reason','textarea');
     check(grant,'I have reviewed the seller and mandate. I understand this is 30 days of complimentary access, not a confirmed debit or permanent upgrade.','confirmed');
     submit(grant,'Approve selling access for 30 days',async fd=>{
       const reason=String(fd.get('reason')||'').trim();
       if(reason.length<15)throw Error('Enter a meaningful reason of at least 15 characters.');
       if(!confirm('Grant 30 days of temporary product access? This does not record or initiate a payment.'))return;
       await request('ops_complimentary_access',{sellerUid:selected.sellerUid,days:30,reason,confirmed:true});
       message('30-day provisional selling access approved and audited. Netcash collection is still pending.','success');
       await choose(selected);
     });
     box.append(grant);
   }
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
  const d=detail,account=card(d.seller.shopName,'Seller account · '+d.seller.sellerUid);account.dataset.sellerAccount=d.seller.sellerUid;account.tabIndex=-1;account.append(button('← Back to seller directory',async()=>{selected=null;detail=null;show();root.scrollIntoView({block:'start',behavior:'instant'});}));account.append(el('p',d.seller.ownerEmail+' · '+d.seller.phone),el('p',d.seller.address),tag(d.seller.approvalStatus));account.append(el('p','Verification: '+d.verification.status+' · Phone: '+(d.verification.phoneVerified?'verified':'not verified')));account.append(button('Open approval desk',()=>navigate('approvals')));root.append(account);sellerDocuments();
  // Seller ID approval is independent from Paystack purchase confirmation.
  const billing=card('Legacy Paystack membership',d.membershipPaid?'Seller membership verified by Paystack.':
    'No active verified Paystack membership. Shop review can be completed, but products remain disabled until payment is confirmed.');
  billing.append(tag(d.membershipPaid?'Paystack paid':d.complimentaryAccess?'Complimentary temporary access':'Not paid'));
  billing.append(el('p','Mode: '+(d.paystackMode==='live'?'Live Paystack':'Paystack TEST — not real money')));
  billing.append(el('p','Membership: '+(d.billing?.status||'not started')+
    ' · Plan: '+(d.seller.listingPlan||'free')+
    ' · Renewal: '+(d.billing?.renewalSetup||'not scheduled')));
  if(d.billing?.paidUntil)
    billing.append(el('p','Paid until: '+new Date(d.billing.paidUntil).toLocaleString('en-ZA')));
  if(d.complimentaryAccess){
    billing.append(el('p','Complimentary access ends: '+new Date(d.complimentaryUntil).toLocaleString('en-ZA')+' · Reason: '+(d.complimentaryReason||'')));
    billing.append(button('Revoke complimentary access',async()=>{
      const reason=prompt('Enter a reason for revoking temporary access (at least 15 characters):');
      if(!reason||reason.trim().length<15)throw Error('A revocation reason of at least 15 characters is required.');
      if(!confirm('Revoke this complimentary grant now? This does not refund any real payment.'))return;
      await request('ops_complimentary_revoke',{sellerUid:d.seller.sellerUid,
        reason:reason.trim(),confirmed:true});
      message('Temporary access revoked and audited. Public product eligibility updated.','success');
      await choose(selected);
    }));
  }
  billing.append(el('p','Existing Paystack memberships are displayed only for reconciliation and cancellation. New sellers must complete R99 debit-order mandate requests and provider bank authentication.','footnote'));
  if(d.paystackMode!=='live')
    billing.append(el('p','TEST MODE: a successful sandbox payment does not mean real funds were collected. Do not activate a live seller on test transactions.','notice warning'));
  if(d.seller.approvalStatus==='approved'&&!d.membershipPaid&&!d.complimentaryAccess){
    const exception=el('form',undefined,'ops-form');
    choice(exception,'Temporary complimentary access','days',[[7,'7 days'],[14,'14 days'],[30,'30 days']],7);
    field(exception,'Reason for exception (audited)','reason','textarea');
    const confirmText=check(exception,'This is a time-limited complimentary grant, not a Paystack payment.','confirmed');
    submit(exception,'Grant temporary access',async fd=>{
      const reason=String(fd.get('reason')||'').trim();
      if(reason.length<15)throw Error('Enter a reason of at least 15 characters.');
      if(!confirm('Grant complimentary product-selling eligibility without recording any payment? Seller identity and shop verification remain mandatory.'))return;
      await request('ops_complimentary_access',{sellerUid:d.seller.sellerUid,
        days:Number(fd.get('days')),reason,confirmed:true});
      message('Complimentary membership granted with an audit record and expiry. No payment was recorded.','success');
      await choose(selected);
    });
    billing.append(exception);
  }
  root.append(billing);
  const sellerMandate=mandates.find(m=>m.sellerUid===d.seller.sellerUid);
  if(sellerMandate)mandateReview(sellerMandate);
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
  const catalogue=card('Seller products','Products publish automatically when registration is approved and subscription or temporary access is active.');
  const submitted=d.catalogue?.products||[];
  catalogue.append(tag(d.catalogue?.status||'not submitted'));
  catalogue.append(el('p',submitted.length+' products in the current listing.'));
  catalogue.append(table(['Product','Category','Price','Stock'],submitted.map(p=>[
    p.name||p.id,p.category||'Other',money(p.priceCents||0),p.stock??'Not supplied'
  ])));
  if(!d.canApproveCatalogue)catalogue.append(el('p','Products remain private until seller verification and subscription access are complete.','notice warning'));
  root.append(catalogue);
  const statement=card('Historical seller statement','Existing manual invoices and receipts are kept for audit only. They no longer enable product selling.');
  statement.append(button('Print historical statement',()=>printStatement(d)));
  statement.append(table(['Date','Description','Period','Reference','Charge','Payment','Balance'],
    d.entries.map(e=>statementRows([e])[0])));
  root.append(statement);
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
    view.append(el('p','Owner verification: '+(seller.verificationStatus||'not submitted')+
      ' · Onboarding: '+(onboardingReady?'complete':'incomplete')+
      ' · Product selling: '+(seller.sellingUnlocked===true?'enabled':'locked')));
    view.append(el('p','Product membership: '+membership,'footnote'));
    if(seller.sellingUnlocked!==true)view.append(el('p',!identityReviewed?
      'Account approval alone does not complete seller verification. Open the approval desk to check the current ID and selfie.':
      !onboardingReady?'The seller must finish onboarding, including verified mobile registration, before selling.':
      'Seller verification is complete. Products require a verified Paystack membership or a recorded administrator exception.',
      'notice warning'));
    view.append(button('Open seller verification',()=>navigate('approvals')));
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
 function support(){const create=card('Log a received support request','Use this for a request received by email or another support channel. Notes saved here are internal; this screen does not send emails.'),f=el('form',undefined,'ops-form');sellerPicker(f);field(f,'Subject','subject');field(f,'Request details','message','textarea');submit(f,'Create support case',async fd=>{await request('ops_support_create',Object.fromEntries(fd));await refresh();message('Support case created.','success');});create.append(f);root.append(create);for(const t of tickets){const c=card(t.subject,t.ownerUid+' · '+new Date(t.createdAt).toLocaleString('en-ZA'));c.append(el('p',t.message),tag(t.status));const notes=el('div');c.append(button('View internal notes',async()=>{const r=await request('ops_support_detail',{ticketId:t.id});notes.replaceChildren(...r.notes.map(n=>el('p',new Date(n.createdAt).toLocaleString('en-ZA')+' · '+n.note)));if(!r.notes.length)notes.append(el('p','No internal notes yet.'));}),notes);const form=el('form',undefined,'ops-form');choice(form,'Status','status',['open','in_progress','waiting_for_seller','resolved'].map(v=>[v,v.replaceAll('_',' ')]),t.status);choice(form,'Priority','priority',['normal','high','urgent'].map(v=>[v,v]),t.priority);field(form,'Internal note','note','textarea');submit(form,'Save case update',async fd=>{await request('ops_support_update',{ticketId:t.id,revision:t.revision,...Object.fromEntries(fd)});await refresh();message('Support update saved. No email was sent.','success');});c.append(form);root.append(c);}if(!tickets.length)root.append(el('p','No support cases loaded.','footnote'));if(moreTickets)root.append(button('Load more cases',async()=>{const r=await request('ops_support_list',{after:moreTickets});tickets.push(...r.tickets);moreTickets=r.next;show();}));}
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
  if(v!==view){selected=null;detail=null;userSelected=null;userDetail=null;}
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
 return {clear,currentView:()=>view,navigate,async load(){ready=true;const stamp=generation;try{await refresh();}catch(e){if(!e.stale){onError(e);if(ready)show();}}finally{if(ready&&generation===stamp)enableNavigation(true);}},hideSensitive(){fieldAdmin.hideSensitive();clearMandatePhoto();clearMandateDialogs();generation++;selected=null;detail=null;root.replaceChildren();},show};
}
