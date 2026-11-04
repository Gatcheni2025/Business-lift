import {createFieldAdmin} from '/js/teyza-field-admin.js?v=R319';
import {photoBlob} from '/js/teyza-app-admin-model.mjs?v=R319';
import {money,cents,statementRows} from '/js/teyza-operations-model.mjs?v=R319';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const titles={users:'Users & access',overview:'Your operations, at a glance.',sellers:'Every shop. One clear view.',products:'Product approvals',billing:'Verified Paystack payments',support:'A better support desk.',finance:'Stock finance review',field:'HR & field team'};
export function createOperations({api,onError}){
 const root=document.getElementById('operationsPanel'),approvals=document.getElementById('approvalView');
 let mandatePhotoUrl=null;
 function clearMandatePhoto(){if(mandatePhotoUrl){document.getElementById('largePhoto').removeAttribute('src');URL.revokeObjectURL(mandatePhotoUrl);mandatePhotoUrl=null;}}
 document.getElementById('photoDialog').addEventListener('close',clearMandatePhoto);
 let generation=0,ready=false,view='overview',sellers=[],next=null,selected=null,detail=null,
     users=[],usersNext=null,userSelected=null,userDetail=null,
     tickets=[],finance=[],catalogueQueue=[],catalogueLimited=false,
     moreFinance=null,moreTickets=null,busy=false;
 const message=(t,k='')=>{const box=document.getElementById('notice');box.textContent=t;box.className='notice '+k;box.hidden=false;};
 const fieldAdmin=createFieldAdmin({api:(action,data)=>request(action,data),onError,message});
 function clear(){fieldAdmin.clear();clearMandatePhoto();generation++;ready=false;sellers=[];next=null;selected=null;detail=null;users=[];usersNext=null;userSelected=null;userDetail=null;tickets=[];finance=[];catalogueQueue=[];catalogueLimited=false;moreFinance=null;moreTickets=null;busy=false;root.replaceChildren();}
 async function request(action,data={}){const stamp=generation;const reply=await api(action,data);if(!ready||stamp!==generation)throw Object.assign(Error('Session changed.'),{stale:true});return reply;}
 async function safely(fn){if(!ready||busy)return;busy=true;try{await fn();}catch(e){if(!e.stale)onError(e);}finally{busy=false;}}
 function button(text,fn,kind='quiet'){const b=el('button',text,'button '+kind);b.type='button';b.onclick=()=>safely(fn);return b;}
 function card(title,description){const c=el('section',undefined,'panel ops-card');c.append(el('h3',title));if(description)c.append(el('p',description,'footnote'));return c;}
 function field(form,label,name,type='text',value='',required=true){const l=el('label',label);const i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;i.name=name;i.required=required;i.value=value;if(type==='textarea'){i.rows=3;i.maxLength=2000;}l.append(i);form.append(l);return i;}
 function choice(form,label,name,options,value){const l=el('label',label),s=el('select');s.name=name;for(const [v,t] of options){const o=el('option',t);o.value=v;s.append(o);}s.value=value;l.append(s);form.append(l);return s;}
 function check(form,label,name){const l=el('label',undefined,'confirm-check'),i=el('input');i.type='checkbox';i.name=name;i.required=true;l.append(i,el('span',label));form.append(l);return i;}
 function submit(form,text,fn){const b=el('button',text,'button primary');b.type='submit';form.append(b);form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())safely(()=>fn(new FormData(form)));};}
 function table(headers,rows){const wrap=el('div',undefined,'table-wrap'),t=el('table'),head=el('thead'),h=el('tr'),body=el('tbody');for(const v of headers)h.append(el('th',v));head.append(h);for(const values of rows){const tr=el('tr');for(const v of values){const td=el('td');td.append(v instanceof Node?v:document.createTextNode(String(v??'')));tr.append(td);}body.append(tr);}if(!rows.length){const tr=el('tr'),td=el('td','No records to display.');td.colSpan=headers.length;tr.append(td);body.append(tr);}t.append(head,body);wrap.append(t);return wrap;}
 function tag(text){return el('span',String(text||'pending').replaceAll('_',' '),'status-pill');}
 function heading(){root.replaceChildren();const h=el('div',undefined,'workspace-title');const text=el('div');text.append(el('span','TEYZA OPERATIONS','eyebrow'),el('h2',titles[view]));h.append(text,button('Refresh',()=>refresh()));root.append(h);}
 function show(){for(const b of document.querySelectorAll('[data-admin-view]')){const active=b.dataset.adminView===view;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');}approvals.hidden=view!=='approvals';root.hidden=view==='approvals';if(view==='approvals')return;heading();if(!ready)return;
  if(view==='field')fieldAdmin.render(root);if(view==='users')userManagement();if(view==='overview')overview();if(view==='products')productsView();if(view==='sellers'||view==='billing')registry();if(view==='support')support();if(view==='finance')financeView();}
 function overview(){const stats=el('div',undefined,'metrics');for(const [label,n,note] of [['Seller records loaded',sellers.length,next?'More sellers available':'Current registry page'],['Awaiting approval',sellers.filter(s=>s.approvalStatus==='pending').length,'Among loaded sellers'],['Monthly subscription',money(9900),'Per enrolled seller / month']]){const c=el('article');c.append(el('span',label,'metric-label'),el('strong',String(n)),el('small',note));stats.append(c);}root.append(stats);const cards=el('div',undefined,'ops-grid');for(const [v,title,desc] of [['approvals','Build a trusted marketplace','Inspect current ID or company evidence and the owner selfie before approval.'],['users','Manage user accounts','Create shopper or seller accounts, send private setup emails and suspend accounts when needed.'],['products','Approve paid seller catalogues','Review submitted products after verification and Paystack membership confirmation.'],['billing','See verified Paystack payments','Review payment status, reconcile issued references and view historical statements.'],['support','Keep every request moving','Track open cases, priority and internal review notes.'],['finance','Review stock finance','Manually review enquiries and record approval in principle. No automatic disbursement.']]){const c=card(title,desc);c.append(button('Open workspace →',()=>navigate(v)));cards.append(c);}root.append(cards);root.append(el('p','Product-selling access follows verified Paystack membership and seller approval. No manual mandates or receipt activation.','notice warning'));}
 async function choose(s){if(view==='products')view='sellers';selected=s;detail=null;const loading=card('Opening seller account…',s.shopName);loading.setAttribute('role','status');root.replaceChildren(loading);loading.scrollIntoView({block:'start',behavior:'instant'});try{detail=await request('ops_seller_detail',{sellerUid:s.sellerUid});show();const account=root.querySelector('[data-seller-account]');account?.scrollIntoView({block:'start',behavior:'instant'});account?.focus({preventScroll:true});}catch(error){if(!error.stale){selected=null;show();root.scrollIntoView({block:'start',behavior:'instant'});}throw error;}}
 function sellerPicker(form){return choice(form,'Seller','sellerUid',sellers.map(s=>[s.sellerUid,s.shopName+' · '+s.sellerUid]),selected?.sellerUid||sellers[0]?.sellerUid);}
 function registry(){const c=card('Seller directory',next?'This is a page of seller records. Load more to extend search.':'Search the loaded seller records.');const input=el('input');input.type='search';input.placeholder='Search shop, phone or email';input.setAttribute('aria-label','Search loaded sellers');const list=el('div');const draw=()=>{const term=input.value.toLowerCase();list.replaceChildren(table(['Shop / owner','Status','Subscription',''],sellers.filter(s=>[s.shopName,s.ownerEmail,s.phone].join(' ').toLowerCase().includes(term)).map(s=>[s.shopName+' · '+s.ownerEmail,tag(s.approvalStatus),tag(s.subscription),button('Open account',()=>choose(s))])));};input.oninput=draw;c.append(input,list);draw();if(next)c.append(button('Load more sellers',async()=>{const r=await request('ops_sellers',{after:next});sellers=[...sellers,...r.sellers];next=r.next;show();}));if(!detail){root.append(c);root.append(el('p','Select a seller to view their account, subscription and statement.','footnote'));return;}
  const d=detail,account=card(d.seller.shopName,'Seller account · '+d.seller.sellerUid);account.dataset.sellerAccount=d.seller.sellerUid;account.tabIndex=-1;account.append(button('← Back to seller directory',async()=>{selected=null;detail=null;show();root.scrollIntoView({block:'start',behavior:'instant'});}));account.append(el('p',d.seller.ownerEmail+' · '+d.seller.phone),el('p',d.seller.address),tag(d.seller.approvalStatus));account.append(el('p','Verification: '+d.verification.status+' · Phone: '+(d.verification.phoneVerified?'verified':'not verified')));account.append(button('Open approval desk',()=>navigate('approvals')));root.append(account);sellerDocuments();
  // Seller ID approval is independent from Paystack purchase confirmation.
  const billing=card('Paystack membership',d.membershipPaid?'Seller membership verified by Paystack.':
    'No active verified Paystack membership. Shop review can be completed, but products remain disabled until payment is confirmed.');
  billing.append(tag(d.membershipPaid?'paid — products eligible':'not paid'));
  billing.append(el('p','Mode: '+(d.paystackMode==='live'?'Live Paystack':'Paystack TEST — not real money')));
  billing.append(el('p','Membership: '+(d.billing?.status||'not started')+
    ' · Plan: '+(d.seller.listingPlan||'free')+
    ' · Renewal: '+(d.billing?.renewalSetup||'not scheduled')));
  if(d.billing?.paidUntil)
    billing.append(el('p','Paid until: '+new Date(d.billing.paidUntil).toLocaleString('en-ZA')));
  billing.append(el('p','R49 introductory first month · R99 monthly renewal · R29 optional seven-day promotion. Seller checkout is separate from this administrator screen.','footnote'));
  if(d.paystackMode!=='live')
    billing.append(el('p','TEST MODE: a successful sandbox payment does not mean real funds were collected. Do not activate a live seller on test transactions.','notice warning'));
  root.append(billing);
  const payment=card('Payment references','Only references issued for this seller are eligible for confirmation. The server independently verifies payment with Paystack.');
  payment.append(table(['Reference','Type','Amount','Status','Action'],
    (d.payments||[]).map(row=>[
      row.reference,row.kind,money(row.amountCents),tag(row.status),
      row.status==='pending'&&row.reference.startsWith('TZM_')?
        button('Verify with Paystack',async()=>{
          await request('ops_paystack_confirm',{sellerUid:d.seller.sellerUid,reference:row.reference});
          await choose(selected);
          message('Paystack payment verified. Seller product eligibility has been refreshed.','success');
        }):''
    ])));
  if(!(d.payments||[]).length)
    payment.append(el('p','No Paystack checkout reference has been recorded for this seller. The seller must use a supported checkout channel.','footnote'));
  root.append(payment);
  const catalogue=card('Review seller products','An approved shop and current Paystack membership are both required before products can be published.');
  const submitted=d.catalogue?.products||[];
  catalogue.append(tag(d.catalogue?.status||'not submitted'));
  catalogue.append(el('p',submitted.length+' products submitted for review.'));
  catalogue.append(table(['Product','Category','Price','Stock'],submitted.map(p=>[
    p.name||p.id,p.category||'Other',money(p.priceCents||0),p.stock??'Not supplied'
  ])));
  if(d.catalogue?.status==='pending_review'){
    const blockers=[];
    if(d.seller.approvalStatus!=='approved'||d.verification.status!=='approved')
      blockers.push('seller identity/approval');
    if(!d.membershipPaid)blockers.push('verified Paystack membership');
    if(!d.verification.completed)blockers.push('completed seller onboarding');
    if(blockers.length)catalogue.append(el('p','Approval blocked: '+blockers.join(', ')+'.','notice warning'));
    const approve=button('Approve submitted product catalogue',async()=>{
      if(!confirm('Approve '+submitted.length+' submitted products for '+d.seller.shopName+'? This publishes the verified catalogue once the shop is eligible.'))return;
      await request('catalogue_review',{sellerUid:d.seller.sellerUid});
      await choose(selected);
      message('Catalogue reviewed and published. Paystack and shop eligibility remain enforced by the server.','success');
    },'primary');
    approve.disabled=!d.canApproveCatalogue||!submitted.length;
    catalogue.append(approve);
  }else catalogue.append(el('p','The seller must submit a product catalogue in their dashboard before an administrator can approve it.','footnote'));
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
       tag(row.paidMembership?'verified membership':row.paymentStatus),
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
  if(view==='users')show();
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
  view.append(el('p',user.email||'No email linked'),
    el('p','Email: '+(user.verified?'verified':'not verified')+
      ' · Account: '+(user.disabled?'suspended':'active')+
      ' · Authentication: '+(user.providers.length?user.providers.join(', '):'email / anonymous')),
    el('p',seller?'Seller: '+seller.shopName+' · '+seller.category+' · '+seller.approvalStatus:
      'Shopper / no registered seller profile'),
    el('p',user.invitationStatus?
      'Invitation: '+user.invitationStatus:'Account invitation not created through admin.'));
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
 async function refresh(){if(view==='field'){await fieldAdmin.refresh();show();return;}if(view==='users'){const page=await request('ops_users');users=page.users;usersNext=page.next;if(userSelected)userDetail=await request('ops_user_detail',{userUid:userSelected});}else if(view==='support'){const r=await request('ops_support_list');tickets=r.tickets;moreTickets=r.next;}else if(view==='finance'){const r=await request('ops_finance_queue');finance=r.requests;moreFinance=r.next;}else if(view==='products'){const r=await request('ops_catalogue_queue');catalogueQueue=r.submissions;catalogueLimited=r.limited;}else{const r=await request('ops_sellers');sellers=r.sellers;next=r.next;if(selected)detail=await request('ops_seller_detail',{sellerUid:selected.sellerUid});}show();}
 async function navigate(v){
  if(!ready)return;
  fieldAdmin.hideSensitive();clearMandatePhoto();
  document.dispatchEvent(new Event('teyza-admin-view-change'));
  generation++;view=v;
  if(v==='approvals'){show();return;}
  // Do not render clickable forms while the previous view is loading.
  // All operations are guarded by a busy lock and early clicks would otherwise
  // silently be ignored until the first server response finishes.
  approvals.hidden=true;root.hidden=false;
  root.replaceChildren(el('p','Loading administrator workspace…','footnote'));
  await refresh();
}
 for(const b of document.querySelectorAll('[data-admin-view]'))b.onclick=()=>safely(()=>navigate(b.dataset.adminView));
 return {clear,async load(){ready=true;try{await refresh();}catch(e){if(!e.stale)onError(e);}},hideSensitive(){fieldAdmin.hideSensitive();clearMandatePhoto();generation++;selected=null;detail=null;root.replaceChildren();},show};
}
