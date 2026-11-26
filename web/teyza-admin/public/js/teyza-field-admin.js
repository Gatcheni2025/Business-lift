// Teyza HR & field team — authenticated admin operations, no public evidence URLs.
const el=(tag,text,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const provinces=['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'];
const label=s=>String(s||'pending').replaceAll('_',' ');
function btn(text,click,cls='quiet'){const b=el('button',text,'button '+cls);b.type='button';b.onclick=click;return b;}
function card(title,description){const section=el('section',undefined,'panel ops-card');section.append(el('h3',title));if(description)section.append(el('p',description,'footnote'));return section;}
function pdfOrImage(doc){if(!doc||!['application/pdf','image/png','image/jpeg'].includes(doc.mime)||typeof doc.base64!=='string')throw Error('Document format is unavailable.');const binary=atob(doc.base64);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new Blob([bytes],{type:doc.mime});}
export function createFieldAdmin({api,onError,message}){
 let active=false,tab='applications',profiles=[],visits=[],nextProfiles=null,nextVisits=null,filter='',province='all',selectedProfile=null,selectedVisit=null,rewardVisit=null,privateData=null,opened=new Set(),seenPhotos=new Set(),busy=false,urls=[];
 const safe=fn=>async()=>{if(busy||!active)return;busy=true;try{await fn();}catch(e){onError(e);}finally{busy=false;}};
 function forget(){for(const url of urls)URL.revokeObjectURL(url);urls=[];privateData=null;opened.clear();seenPhotos.clear();const dialog=document.getElementById('fieldEvidenceDialog');if(dialog?.open)dialog.close();}
 function clear(){active=false;forget();profiles=[];visits=[];nextProfiles=null;nextVisits=null;selectedProfile=null;selectedVisit=null;rewardVisit=null;filter='';}
 function attach(documentObject,title){const d=document.getElementById('fieldEvidenceDialog'),frame=document.getElementById('fieldEvidenceBody');const blob=pdfOrImage(documentObject),url=URL.createObjectURL(blob);urls.push(url);frame.replaceChildren(el('h3',title));const download=el('a','Download for private HR review','button quiet');download.href=url;download.download=String(documentObject.name||'document.pdf').replace(/[^a-zA-Z0-9._-]/g,'_');frame.append(download);if(blob.type==='application/pdf'){const view=el('iframe');view.src=url;view.title=title;view.className='field-document-viewer';frame.append(view);}else{const img=el('img');img.src=url;img.alt=title;img.className='field-image-viewer';frame.append(img);}d.showModal();}
 async function refresh(){active=true;forget();const [p,v]=await Promise.all([api('agent_admin_profiles'),api('agent_admin_visits')]);if(!active)return;profiles=p.profiles||[];nextProfiles=p.next||null;visits=v.visits||[];nextVisits=v.next||null;selectedProfile=null;selectedVisit=null;rewardVisit=null;}
 async function more(kind){const isProfile=kind==='profiles',next=isProfile?nextProfiles:nextVisits;if(!next)return;const r=await api(isProfile?'agent_admin_profiles':'agent_admin_visits',{after:next});if(isProfile){profiles.push(...r.profiles);nextProfiles=r.next||null;}else{visits.push(...r.visits);nextVisits=r.next||null;}}
 function filteredProfiles(){const t=filter.toLocaleLowerCase();return profiles.filter(p=>(province==='all'||p.province===province)&&[p.name,p.phone,p.email,p.area,p.province].join(' ').toLocaleLowerCase().includes(t));}
 function top(root){const heading=el('div',undefined,'field-admin-intro');heading.append(el('div',undefined,'eyebrow'));heading.firstChild.textContent='HR & FIELD OPERATIONS';heading.append(el('h3','People, applications and neighbourhood coverage'),el('p','Review applicants, manage field areas, track shop signups and approve completed visits. Agent recruitment is separate from seller verification.'));const login=el('a','Open agent sign-in ↗','button quiet');login.href='/work.html';login.target='_blank';login.rel='noopener noreferrer';heading.append(login);root.append(heading);
 const metrics=el('div',undefined,'field-admin-metrics');for(const [name,n] of [['Applications loaded',profiles.length],['Awaiting approval',profiles.filter(p=>p.status==='pending').length],['Approved agents',profiles.filter(p=>p.status==='approved').length],['Visits loaded',visits.length],['Owner-linked visits',visits.filter(v=>v.ownerConfirmed).length]]){const tile=el('div',undefined,'field-stat');tile.append(el('small',name),el('strong',n));metrics.append(tile);}root.append(metrics);
 const tabs=el('nav',undefined,'field-admin-tabs');tabs.setAttribute('aria-label','HR and field management');for(const [key,title] of [['applications','Applications'],['agents','Team directory'],['areas','Area management'],['signups','Shop signups'],['visits','Work reviews'],['rewards','R90 rewards'],['communications','Communications'],['recruitment','Recruitment coverage']]){const b=btn(title,()=>{forget();rewardVisit=null;tab=key;render(root);});b.classList.toggle('active',tab===key);b.setAttribute('aria-current',tab===key?'page':'false');tabs.append(b);}root.append(tabs);
 }
 function queryBar(root){const bar=el('div',undefined,'field-query');const search=el('input');search.type='search';search.placeholder='Search person, phone, town or province';search.setAttribute('aria-label','Filter field-team records');search.value=filter;search.oninput=()=>{filter=search.value;render(root);const field=root.querySelector('.field-query input');field?.focus();field?.setSelectionRange(filter.length,filter.length);};const selection=el('select');selection.setAttribute('aria-label','Filter by province');for(const [value,name] of [['all','All provinces'],...provinces.map(p=>[p,p])]){const option=el('option',name);option.value=value;selection.append(option);}selection.value=province;selection.onchange=()=>{province=selection.value;render(root);};bar.append(search,selection);root.append(bar);}
 async function uploadFile(file,kind){
  const max=kind==='CV'?5000000:3000000,accepted=kind==='CV'?['application/pdf']:['application/pdf','image/jpeg','image/png'];
  if(!(file instanceof File)||file.size<50||file.size>max||!accepted.includes(file.type))throw Error('Choose a '+(kind==='CV'?'PDF CV under 5 MB':'PDF, JPG or PNG ID document under 3 MB')+'.');
  return await new Promise((resolve,reject)=>{
   const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read the selected '+kind+' document.'));
   reader.onload=()=>resolve({name:file.name,mime:file.type,base64:String(reader.result).split(',')[1]});
   reader.readAsDataURL(file);
  });
 }
 function uploadExistingForm(root,p){
  const f=el('form',undefined,'ops-form field-upload-form');
  f.append(el('h4','Add missing documents for '+p.name),el('p','Use genuine documents supplied or authorised by the applicant. Saving will not change their account status.','footnote'));
  function labelled(title,node){const l=el('label');l.append(el('span',title),node);f.append(l);return node;}
  const type=el('select');type.required=true;
  for(const [value,title] of [['','Select document type'],['sa_id','South African ID'],['passport','Passport']]){const o=el('option',title);o.value=value;type.append(o);}
  labelled('Identity document type',type);
  const identityNumber=el('input');identityNumber.type='text';identityNumber.maxLength=35;identityNumber.minLength=5;identityNumber.required=true;identityNumber.autocomplete='off';identityNumber.placeholder='Number printed on ID or passport';
  labelled('ID or passport number',identityNumber);
  const idFile=el('input');idFile.type='file';idFile.required=true;idFile.accept='.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
  labelled('ID / passport scan — PDF, JPG or PNG (max 3 MB)',idFile);
  const cvFile=el('input');cvFile.type='file';cvFile.required=true;cvFile.accept='.pdf,application/pdf';
  labelled('Applicant CV — PDF (max 5 MB)',cvFile);
  const fileDetails=el('p','Choose the applicant’s genuine ID/passport and CV. Files are encrypted on the server.','field-file-details');
  fileDetails.setAttribute('aria-live','polite');f.append(fileDetails);
  function describeFile(file){return file?file.name+' ('+(file.size/1024/1024).toFixed(2)+' MB)':'not selected';}
  const updateFileDetails=()=>{fileDetails.textContent='ID: '+describeFile(idFile.files[0])+' · CV: '+describeFile(cvFile.files[0]);};
  idFile.addEventListener('change',updateFileDetails);cvFile.addEventListener('change',updateFileDetails);
  const consent=el('label',undefined,'confirm-check'),check=el('input');
  check.type='checkbox';check.required=true;consent.append(check,el('span','I confirm these files were supplied by the applicant or collected with their permission for Teyza HR review.'));f.append(consent);
  const feedback=el('p',undefined,'field-upload-feedback');feedback.hidden=true;feedback.setAttribute('role','alert');f.append(feedback);
  const save=el('button','Save private documents','button primary');save.type='submit';f.append(save);
  let submitting=false;
  f.addEventListener('submit',async event=>{
   event.preventDefault();if(submitting)return;
   feedback.hidden=true;feedback.textContent='';
   if(!f.reportValidity())return;
   submitting=true;save.disabled=true;save.textContent='Encrypting and saving documents…';
   try{
    const files=await Promise.all([uploadFile(idFile.files[0],'ID'),uploadFile(cvFile.files[0],'CV')]);
    const result=await api('agent_admin_application_upload',{agentUid:p.uid,revision:p.revision,identityType:type.value,identityNumber:identityNumber.value.trim(),
     identityFile:files[0],cvFile:files[1],applicantPermissionConfirmed:check.checked});
    if(result.saved!==true)throw Error('The server did not confirm that these documents were saved. Please check the agent profile before retrying.');
    feedback.className='field-upload-feedback success';feedback.textContent='Documents saved successfully. Refreshing this agent’s record…';feedback.hidden=false;
    try{
     await refresh();render(root);
     const matching=[...root.querySelectorAll('[data-field-agent-uid]')].find(x=>x.dataset.fieldAgentUid===p.uid);
     if(matching){const status=el('p','ID/passport and CV saved securely. Open them to complete the review.','field-upload-feedback success');status.setAttribute('role','status');matching.prepend(status);matching.scrollIntoView({behavior:'smooth',block:'center'});}
     message('Recruitment documents saved securely. Open the ID and CV to review before approving.','success');
    }catch(error){
     feedback.textContent='Documents were saved, but the list could not refresh. Reopen HR & field team to check the agent record before uploading again.';
     feedback.scrollIntoView({block:'center'});
    }
   }catch(error){
    const status=Number(error?.status||0);
    const advice=status===401||status===403?' Your five-minute administrator review session may have expired. Sign in again and retry.':
     status===404?' The upload endpoint is not available on the deployed backend. Deploy the updated teyzaMobile function first.':
     status===413?' Reduce both PDFs to the stated file sizes and try again.':
     status===409?' The agent record may have changed or may already have documents. Refresh HR before retrying.':
     status===503?' Secure document storage may be unavailable. Check the Teyza Firebase backend and storage configuration.':'';
    feedback.className='field-upload-feedback error';
    feedback.textContent='Documents were not confirmed saved: '+(error?.message||'Unable to upload the files.')+advice;
    feedback.hidden=false;feedback.scrollIntoView({behavior:'smooth',block:'center'});
   }finally{
    submitting=false;save.disabled=false;save.textContent='Save private documents';
   }
  });
  return f;
 }
 function actionsForAgent(root,p){const c=card(p.name||'New applicant',[p.area,p.province,p.email,p.phone,p.address].filter(Boolean).join(' · '));c.dataset.fieldAgentUid=p.uid;c.append(el('p','Status: '+label(p.status)+' · Recruitment documents: '+(p.hasDocuments?'Submitted':'Missing'),'footnote'));
 c.append(el('p','Agent sign-in: '+(p.email||'Phone authentication')+' · Account ID ending '+String(p.uid||'').slice(-8),'footnote'));
 if(p.status==='pending')c.append(el('p','Approval unlocks the Work map for this exact Firebase account only. Open both current documents before approving; the agent then clicks Check approval on work.html.','footnote'));

 if(p.reviewNote)c.append(el('p','Review note: '+p.reviewNote,'footnote'));
  if(!p.hasDocuments){
   const open=btn('Upload ID / passport & CV',()=>{if(c.querySelector('.field-upload-form'))return;c.append(uploadExistingForm(root,p));open.disabled=true;open.setAttribute('aria-expanded','true');},'quiet');
   open.setAttribute('aria-expanded','false');c.append(open);
  }
 if(p.hasDocuments){c.append(btn('Open ID/passport and CV',safe(async()=>{const r=await api('agent_admin_application_evidence',{agentUid:p.uid});forget();privateData=r;selectedProfile=p;opened.clear();render(root);message('Private recruitment documents opened for review.','success');}),'quiet'));}
 if(selectedProfile?.uid===p.uid&&privateData){const row=el('div',undefined,'field-doc-buttons');row.append(el('p','Document type: '+label(privateData.identityType)+' · Number: '+privateData.identityNumber));row.append(btn('View ID / passport',()=>{opened.add('identity');attach(privateData.identityFile,'Private ID / passport · '+p.name);}),btn('View CV',()=>{opened.add('cv');attach(privateData.cvFile,'Private CV · '+p.name);}));c.append(row);}
 if(['pending','rejected','suspended'].includes(p.status)){for(const [status,text] of [['approved','Approve applicant'],['rejected','Reject'],['suspended','Suspend']]){c.append(btn(text,safe(async()=>{if(status==='approved'&&(!privateData||selectedProfile?.uid!==p.uid||opened.size!==2))throw Error('Open the current ID/passport and CV before approving.');if(status==='approved'&&!window.confirm('Approve this exact agent account ('+String(p.uid).slice(-8)+') for Teyza Work access? Confirm the ID/passport and CV were inspected.'))return;const note=window.prompt('HR review note / next steps:') ;if(note===null)return;if(status!=='approved'&&!note.trim())throw Error('Provide a reason for the applicant.');await api('agent_admin_profile_decide',{agentUid:p.uid,revision:p.revision,status,note});await refresh();render(root);message(status==='approved'?'Agent approved for Teyza Work. Ask them to sign in with the same account and select Check approval.':'HR application decision saved.','success');}),status==='approved'?'primary':'quiet'));}}
 if(p.status==='approved')c.append(btn('Suspend agent',safe(async()=>{const note=window.prompt('Reason for suspension:');if(!note?.trim())return;await api('agent_admin_profile_decide',{agentUid:p.uid,revision:p.revision,status:'suspended',note});await refresh();render(root);message('Agent suspended.','success');}),'danger'));
 root.append(c);
 }
 function applications(root){queryBar(root);const rows=filteredProfiles().filter(p=>tab==='applications'||p.status==='approved');rows.sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending'));if(!rows.length)root.append(el('p','No matching agent records on the loaded pages.','footnote'));for(const p of rows)actionsForAgent(root,p);if(nextProfiles)root.append(btn('Load more applications',safe(async()=>{await more('profiles');render(root);}))); }
 function areas(root){queryBar(root);const filtered=filteredProfiles();const areas=new Map();for(const p of filtered){const key=(p.province||'Unknown')+' · '+(p.area||'Unassigned');const row=areas.get(key)||{total:0,approved:0,pending:0};row.total++;if(p.status==='approved')row.approved++;if(p.status==='pending')row.pending++;areas.set(key,row);}const table=card('Coverage by province and town','Counts reflect loaded records; use Load more for additional agents.');for(const [name,s] of [...areas].sort((a,b)=>a[0].localeCompare(b[0]))){const line=el('div',undefined,'field-area-row');line.append(el('strong',name),el('span',s.approved+' active · '+s.pending+' awaiting · '+s.total+' total'));table.append(line);}if(!areas.size)table.append(el('p','No area assignments in the current results.'));root.append(table);
 const approved=filtered.filter(p=>p.status==='approved');for(const p of approved){const c=card('Assign '+p.name,'Current area: '+p.area+' · '+p.province),f=el('form',undefined,'ops-form');const l=el('label','Province'),select=el('select');for(const name of provinces){const o=el('option',name);o.value=name;select.append(o);}select.value=p.province;l.append(select);const a=el('label','Town / operating area'),inp=el('input');inp.type='text';inp.value=p.area||'';inp.required=true;inp.maxLength=120;a.append(inp);f.append(l,a);f.append(btn('Save area assignment',()=>{f.requestSubmit();},'primary'));f.onsubmit=e=>{e.preventDefault();safe(async()=>{await api('agent_admin_area_assign',{agentUid:p.uid,revision:p.revision,province:select.value,area:inp.value.trim()});await refresh();render(root);message('Area assignment updated.','success');})();};c.append(f);root.append(c);}
 if(nextProfiles)root.append(btn('Load more agents',safe(async()=>{await more('profiles');render(root);})));
 }
 function signups(root){const c=card('Shop signups attributed to field visits','Owner-linked visits are not necessarily approved shops. Review work and seller registration separately.');const rows=visits.filter(v=>v.ownerConfirmed);if(!rows.length)c.append(el('p','No owner-linked visits among the loaded records.'));for(const v of rows){const line=el('div',undefined,'field-area-row');line.append(el('strong',v.shopName+' · '+v.area),el('span','Agent '+v.agentUid+' · Shop '+label(v.progress?.sellerApproval)));c.append(line);}root.append(c);if(nextVisits)root.append(btn('Load more signup records',safe(async()=>{await more('visits');render(root);}))); }
 function visitsView(root){const c=card('Shop visits & work approvals','Review photo evidence before approving submitted work. Seller approval remains in Seller verification.');for(const v of visits){const row=el('div',undefined,'field-visit');row.append(el('strong',v.shopName),el('span',v.area+' · '+v.province+' · Agent '+v.agentUid+' · '+label(v.status)));row.append(btn('Review visit',safe(async()=>{forget();selectedVisit=v;render(root);})));c.append(row);}if(!visits.length)c.append(el('p','No field visits on the loaded page.'));root.append(c);
 if(selectedVisit){const v=selectedVisit,detail=card('Review: '+v.shopName,v.address);detail.append(el('p','Owner confirmed: '+(v.ownerConfirmed?'Yes':'Not yet')+' · Seller: '+label(v.progress?.sellerApproval)));if(v.location){const a=el('a','View reported location on Google Maps','button quiet');a.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(v.location.latitude+','+v.location.longitude);a.target='_blank';a.rel='noopener noreferrer';detail.append(a);}
 for(const kind of ['shop','selfie'])detail.append(btn('Open '+kind+' photo',safe(async()=>{const r=await api('agent_admin_photo',{visitId:v.id,kind});seenPhotos.add(kind);attach({base64:r.imageBase64,mime:'image/jpeg',name:kind+'.jpg'},kind+' · '+v.shopName);})));
 if(v.status==='submitted'){const note=el('textarea');note.rows=3;note.maxLength=500;note.placeholder='HR work review note';note.setAttribute('aria-label','Work review note');detail.append(note);for(const [status,labelText] of [['approved','Approve work'],['needs_changes','Request changes'],['rejected','Reject work']])detail.append(btn(labelText,safe(async()=>{if(status==='approved'&&seenPhotos.size!==2)throw Error('Open both current shop photos first.');await api('agent_admin_visit_decide',{visitId:v.id,revision:v.revision,status,note:note.value,reviewConfirmed:seenPhotos.size===2});await refresh();render(root);message('Field visit review saved.','success');}),status==='approved'?'primary':'quiet'));}
 root.append(detail);}
 if(nextVisits)root.append(btn('Load more visits',safe(async()=>{await more('visits');render(root);})));
 }
 function rewardView(root){
  const list=card('R90 registration rewards','Review each owner-linked registration. Eligibility is checked against the current server records, not the loaded visit count. Approved rewards are awaiting payment, not paid.');
  const rows=visits.filter(v=>v.ownerConfirmed);
  for(const v of rows){
   const row=el('div',undefined,'field-visit');
   row.append(el('strong',v.shopName+' · '+v.area),el('span','Agent '+v.agentUid+' · Work '+label(v.status)+' · Seller '+label(v.progress?.sellerApproval)),
    btn('Review R90 reward',()=>{forget();rewardVisit=v;render(root);}));
   list.append(row);
  }
  if(!rows.length)list.append(el('p','No owner-linked registrations on the loaded page.'));
  root.append(list);
  if(nextVisits)root.append(btn('Load more reward candidates',safe(async()=>{await more('visits');render(root);})));
  if(!rewardVisit)return;
  const v=rewardVisit,panel=card('Reward review: '+v.shopName,'R90 per qualifying new verified business · Agent '+v.agentUid);
  panel.classList.add('field-reward-panel');
  const result=el('div',undefined,'field-reward-result');result.setAttribute('aria-live','polite');
  result.append(el('p','Check current eligibility before recording a reward.','footnote'));
  const check=btn('Check reward eligibility',safe(async()=>{
   check.disabled=true;result.replaceChildren(el('p','Checking current records…','footnote'));
   try{
    const r=await api('agent_admin_reward_status',{visitId:v.id});
    if(!active||!panel.isConnected)return;
    if(r.amountCents!==9000||r.currency!=='ZAR'||!['eligible','ineligible','already_rewarded','approved_pending_payment'].includes(r.state))
     throw Error('Reward status is unavailable. The matching backend update is required.');
    result.replaceChildren(el('strong',r.state==='eligible'?'Eligible — R90.00':r.state==='approved_pending_payment'?'R90.00 approved — awaiting payment':r.state==='already_rewarded'?'Reward already recorded':'Not eligible yet'),el('p',r.reason||'','footnote'));
    if(r.state!=='eligible')return;
    const consent=el('label',undefined,'confirm-check'),box=el('input');box.type='checkbox';
    consent.append(box,el('span','I confirm this qualifying registration may be credited once. This records a reward only; it does not transfer money.'));
    const approve=btn('Approve R90 reward',safe(async()=>{
     if(!box.checked||!active||!panel.isConnected)return;
     approve.disabled=true;check.disabled=true;box.disabled=true;
     try{
      const saved=await api('agent_admin_reward_approve',{visitId:v.id});
      if(!active||!panel.isConnected)return;
      if(saved.approved!==true||saved.amountCents!==9000||saved.status!=='approved_pending_payment')
       throw Error('Reward approval could not be verified. Check the latest status before retrying.');
      result.replaceChildren(el('strong','R90.00 approved — awaiting payment'),el('p','Recorded in the reward ledger. No payment has been sent.','footnote'));
      message('Registration reward approved. No payment has been sent.','success');
     }catch(error){
      if(panel.isConnected)result.replaceChildren(el('p','Approval not verified. Check the latest eligibility before retrying.','footnote'));
      throw error;
     }finally{if(panel.isConnected)check.disabled=false;}
    }),'primary');
    approve.disabled=true;box.onchange=()=>{approve.disabled=!box.checked;};
    result.append(consent,approve);
   }catch(error){
    if(panel.isConnected)result.replaceChildren(el('p','Could not verify eligibility. Check again when the service is available.','footnote'));
    throw error;
   }finally{if(panel.isConnected)check.disabled=false;}
  }));
  panel.append(check,result);root.append(panel);
 }

 function communicationsView(root){
  const panel=card('Agent communications','Welcome email delivery from the real Zoho outbox. Sent means Zoho accepted the message; it does not prove inbox delivery. Counts cover the loaded page, not the whole country.');
  const controls=el('div',undefined,'field-query'),filter=el('select'),summary=el('p','Loading email records…','footnote'),rows=el('div'),footer=el('div');
  const stateNames={sent:'Sent to Zoho',queued:'Queued',preparing:'Preparing',sending:'Sending',retry:'Retry scheduled',blocked_email:'Verified email required',review_required:'Manual review required',cancelled:'Cancelled',before_cutoff:'Before rollout cutoff',not_eligible:'Not eligible',not_queued:'Awaiting scan',automation_paused:'Automation paused',configuration_required:'Configuration required'};
  const stateText=s=>stateNames[s]||'Status unavailable';
  const opt=el('option','All email statuses');opt.value='all';filter.append(opt);
  for(const [key,name] of Object.entries(stateNames)){const o=el('option',name);o.value=key;filter.append(o);}
  filter.setAttribute('aria-label','Filter welcome email status');
  let result=null,cursor=null,requesting=false;
  const stamp=v=>Number.isSafeInteger(v)?new Date(v).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}):'Not recorded';
  function showRows(){
   if(!panel.isConnected||!result)return;
   summary.textContent='Automation: '+(result.settings.state==='enabled'?'enabled':result.settings.state==='paused'?'paused':'configuration required')+' · Rollout from '+stamp(result.settings.startAt)+' SAST · '+result.rows.length+' applicants on this page';
   const metrics=el('div',undefined,'field-admin-metrics');
   for(const [key,name] of [['sent','Zoho accepted'],['blocked_email','Email verification needed'],['review_required','Manual review'],['before_cutoff','Before cutoff']]){
    const m=el('div',undefined,'field-stat');m.append(el('small',name),el('strong',result.counts[key]||0));metrics.append(m);
   }
   rows.replaceChildren(metrics);
   const selected=result.rows.filter(r=>filter.value==='all'||r.state===filter.value);
   if(!selected.length)rows.append(el('p','No matching email records on this page.','footnote'));
   for(const r of selected){
    const row=el('div',undefined,'field-visit');row.append(el('strong',r.name||'Applicant'),el('span',[r.area,r.province,label(r.applicationStatus)].filter(Boolean).join(' · ')),el('strong',stateText(r.state)));
    if(r.sentAt)row.append(el('span','Accepted '+stamp(r.sentAt)+' SAST'));
    if(r.updatedAt&&!r.sentAt)row.append(el('span','Updated '+stamp(r.updatedAt)+' SAST'));
    if(r.reason)row.append(el('span',r.reason,'footnote'));
    if(r.state==='review_required')row.append(el('p','Check Zoho Sent before any manual resend. Uncertain sends are not retried automatically.','footnote'));
    if(r.state==='before_cutoff')row.append(el('p','Outside the approved rollout. Reconcile prior welcome emails before widening the cutoff.','footnote'));
    if(r.canRecheck){
     const check=el('input');check.type='checkbox';const consent=el('label',undefined,'confirm-check');consent.append(check,el('span','Applicant has been asked to verify their email.'));
     const b=btn('Recheck verified email',async()=>{
      if(!check.checked||requesting||!panel.isConnected)return;
      requesting=true;b.disabled=true;
      try{await api('agent_admin_communications_recheck',{agentUid:r.uid,updatedAt:r.updatedAt,confirmed:true});if(panel.isConnected){message('Email recheck scheduled. Nothing sent yet.','success');}}
      catch(e){if(panel.isConnected)onError(e);}
      finally{requesting=false;if(panel.isConnected)await load(cursor);}
     });
     b.disabled=true;check.onchange=()=>{b.disabled=!check.checked;};row.append(consent,b);
    }
    rows.append(row);
   }
   footer.replaceChildren();
   if(cursor)footer.append(btn('First page',()=>load(null)));
   if(result.next)footer.append(btn('Next page',()=>load(result.next)));
  }
  async function load(after=null){
   if(requesting||!panel.isConnected)return;requesting=true;
   summary.textContent='Loading email records…';rows.replaceChildren();footer.replaceChildren();result=null;
   try{
    const data=await api('agent_admin_communications',after?{after}:{});
    if(!active||!panel.isConnected)return;
    if(data.schema!==1||!Array.isArray(data.rows)||!data.settings||!data.counts)throw Error('The Agent Communications backend is not available. Deploy its matching update first.');
    result=data;cursor=after;showRows();
   }catch(e){if(panel.isConnected){summary.textContent='Email records could not be loaded. Refresh or sign in again.';onError(e);}}
   finally{requesting=false;}
  }
  filter.onchange=showRows;controls.append(filter,btn('Refresh communications',()=>load(cursor)));
  const zoho=el('a','Open Zoho Workplace ↗','button quiet');zoho.href='https://workplace.zoho.com/';zoho.target='_blank';zoho.rel='noopener noreferrer';controls.append(zoho);
  panel.append(controls,summary,rows,footer);
  const reply=card('Business benefits reply','Copy this approved product explanation into an individual applicant reply in Zoho. Confirm the recipient in Zoho. This does not send mail.');
  const draft=el('textarea');draft.value="Thank you for your question. Teyza helps local businesses become easier to discover and connect with customers and participating suppliers. Business registration and verification are free. Eligible approved profiles can appear in local discovery. Depending on membership and available services, sellers can manage catalogues, prices, stock, customer messages, eligible orders, collection or delivery options; eligible wholesalers can connect with approved trade buyers. Paid selling features are optional; check current terms at https://teyza.co.za/seller-subscriptions.html. There are no guaranteed sales, discounts, funding or orders. Learn more: https://teyza.co.za/for-shop-owners.html. Your role is to demonstrate these benefits and help owners register using their own accounts. R90 applies only to qualifying verified new businesses. Kind regards, Teyza Field Agent Support Team.";draft.readOnly=true;draft.rows=8;draft.setAttribute('aria-label','Business benefits reply text');reply.append(draft);
  const copy=btn('Copy reply',async()=>{draft.focus();draft.select();try{await navigator.clipboard.writeText(draft.value);message('Reply copied. Send it from Zoho after checking the recipient.','success');}catch{message('Reply selected. Use Ctrl+C to copy.','info');}});
  const learn=el('a','Business owner information ↗','button quiet');learn.href='/for-shop-owners.html';learn.target='_blank';learn.rel='noopener noreferrer';reply.append(copy,learn);
  root.append(panel,reply);void load();
 }


 function recruitmentView(root){
  const intro=card('Recruitment and neighbourhood coverage','Compare self-reported operating areas, actual visit areas and optional campaign labels. All applicants remain eligible for review regardless of campaign source or area. This is operational coverage, not an employment targeting filter.');
  intro.append(el('p','Counts use loaded application and visit pages only. Load more to expand coverage. A recorded visit is not proof of current activity; an approved agent is not necessarily working. Campaign tags are unverified, not proof that an advert caused an application.','footnote'));
  const refreshButton=btn('Refresh coverage',safe(async()=>{await refresh();render(root);}));
  intro.append(refreshButton);
  if(nextProfiles)intro.append(btn('Load more applicants',safe(async()=>{await more('profiles');render(root);})));
  if(nextVisits)intro.append(btn('Load more coverage visits',safe(async()=>{await more('visits');render(root);})));
  root.append(intro);
  const sourceNames={meta_johannesburg:'Meta — Johannesburg',meta_durban:'Meta — Durban',meta_cape_town:'Meta — Cape Town'};
  const sourceFor=p=>Object.hasOwn(sourceNames,p?.recruitmentSource)?p.recruitmentSource:'unattributed';
  const agents=new Map(profiles.map(p=>[p.uid,p]));
  const withVisit=new Set(visits.map(v=>v.agentUid));
  const sourceCounts=new Map([...Object.keys(sourceNames),'unattributed'].map(k=>[k,{total:0,pending:0,approved:0,working:0,rewards:0}]));
  const areas=new Map(),areaKey=(province,area)=>[String(province||'Unknown province').trim(),String(area||'Unassigned').trim().replace(/\s+/g,' ')].join(' · ');
  const areaRow=(province,area)=>{
   const title=areaKey(province,area),key=title.toLocaleLowerCase();
   if(!areas.has(key))areas.set(key,{title,total:0,pending:0,approved:0,working:0,visits:0,linked:0,rewards:0});
   return areas.get(key);
  };
  for(const p of agents.values()){
   const group=sourceCounts.get(sourceFor(p)),area=areaRow(p.province,p.area);
   for(const row of [group,area]){
    row.total++;if(p.status==='pending')row.pending++;
    if(p.status==='approved'){row.approved++;if(withVisit.has(p.uid))row.working++;}
   }
  }
  let unmatched=0;
  for(const v of new Map(visits.map(v=>[v.id,v])).values()){
   const area=areaRow(v.province,v.area);area.visits++;
   if(v.ownerConfirmed)area.linked++;
   if(v.registrationRewardApproved===true){
    area.rewards++;
    const p=agents.get(v.agentUid);
    if(p)sourceCounts.get(sourceFor(p)).rewards++;else unmatched++;
   }
  }
  const sourcePanel=card('Applications by recruitment source','Unattributed includes direct, legacy, app or untagged applications. A shared tagged link can retain its label. No cost-per-application calculation until spend and application dates are reconciled.');
  for(const [key,row] of sourceCounts){
   const line=el('div',undefined,'field-area-row');
   line.append(el('strong',sourceNames[key]||'Unattributed'),el('span',row.total+' applications · '+row.approved+' approved · '+row.working+' approved with a recorded visit · '+row.rewards+' R90 approvals awaiting payment'));
   sourcePanel.append(line);
  }
  if(unmatched)sourcePanel.append(el('p',unmatched+' approved reward visits are not attributed because the associated agent profiles are not loaded.','footnote'));
  root.append(sourcePanel);
  const areaPanel=card('Township and neighbourhood work areas','Applicants are grouped by their current chosen or assigned area; visits and reward approvals by the recorded visit area. Different spellings or aliases may appear separately. Owner-linked visits are not necessarily verified new businesses.');
  for(const row of [...areas.values()].sort((a,b)=>a.title.localeCompare(b.title))){
   const line=el('div',undefined,'field-area-row');
   line.append(el('strong',row.title),el('span',row.total+' applicants · '+row.approved+' approved · '+row.working+' approved with a recorded visit · '+row.visits+' visits · '+row.linked+' owner-linked visits · '+row.rewards+' R90 approvals awaiting payment'));
   areaPanel.append(line);
  }
  if(!areas.size)areaPanel.append(el('p','No loaded area records.','footnote'));
  root.append(areaPanel);
 }

 function render(root){active=true;forgetIfChanged();root.replaceChildren();top(root);if(tab==='applications'||tab==='agents')applications(root);else if(tab==='areas')areas(root);else if(tab==='signups')signups(root);else if(tab==='rewards')rewardView(root);else if(tab==='communications')communicationsView(root);else if(tab==='recruitment')recruitmentView(root);else visitsView(root);ensureDialog();}
 function forgetIfChanged(){/* Private evidence persists only while this HR view is active. */}
 function ensureDialog(){if(document.getElementById('fieldEvidenceDialog'))return;const d=el('dialog');d.id='fieldEvidenceDialog';d.className='field-evidence-dialog';const close=btn('Close',()=>d.close());close.className='button quiet';const body=el('div');body.id='fieldEvidenceBody';d.append(close,body);d.addEventListener('close',()=>{body.replaceChildren();for(const url of urls)URL.revokeObjectURL(url);urls=[];});document.body.append(d);}
 return {refresh,render,clear,hideSensitive:forget};
}
