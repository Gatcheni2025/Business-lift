// Teyza website debit-order mandate; NO collection or subscription purchase occurs here.
// Mandate details are submitted only to the authenticated Firebase backend, never to email.
const SERVICE_URL='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
const firebaseConfig={apiKey:'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U',
  authDomain:'business-lift-3c19c.firebaseapp.com',projectId:'business-lift-3c19c',
  appId:'1:983479810697:web:bd021d86bbe6d787db2458'};
const $=id=>document.getElementById(id);
export const mandateAmountCents=9900;
export const bankBranch=(banks,name)=>(banks.find(b=>b.name===name)||{}).branchCode||'';
export function nextFirstOfMonth(now=new Date()){
  const d=new Date(now.getFullYear(),now.getMonth()+1,1);
  return String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
}
export function canSignMandate({config,identity,consent,idConsent,account,bank,firstName,surname,holder,firstDate}){
  return config?.termsVersion&&identity?.evidenceId&&['id','passport'].includes(identity.kind)&&
    consent&&idConsent&&/^\d{6,20}$/.test(account||'')&&Boolean(bank)&&
    Boolean(String(firstName||'').trim())&&Boolean(String(surname||'').trim())&&
    Boolean(String(holder||'').trim())&&/^20\d{2}-\d{2}-\d{2}$/.test(firstDate||'');
}
async function start(){
  const mount=$('teyza-web-membership');if(!mount)return;
  let sdk,auth,profile=null,info=null,busy=false,currentUid=null;
  const status=(value,tone='')=>{const element=$('mandateStatus');element.textContent=value;mount.dataset.status=tone;};
  const hide=(id,show)=>{$(id).hidden=!show;};
  function terms(){
    const t=info?.termsTemplate||'';
    const day=($('mandateDate').value||'').split('-').at(-1);
    $('mandateTerms').textContent=t.replaceAll('{firstDate}',$('mandateDate').value||'your collection date')
      .replaceAll('{collectionDay}',day?String(Number(day)):'the selected day');
  }
  function render(){
    const signed=Boolean(auth?.currentUser);
    hide('mandateLogin',!signed);hide('mandateAccount',signed);
    hide('mandateWithdraw',signed&&Boolean(info?.mandate)&&info.mandate.status!=='withdrawn');
    $('mandateSign').disabled=busy||!signed||!info||!canSignMandate({
      config:info,identity:info.identity,consent:$('mandateConsent').checked,
      idConsent:$('mandateIdentityConsent').checked,bank:$('mandateBank').value,
      account:$('mandateAccountNumber').value,holder:$('mandateHolder').value,
      firstName:$('mandateFirst').value,surname:$('mandateSurname').value,
      firstDate:$('mandateDate').value});
  }
  async function api(action,data={}){
    const user=auth?.currentUser;if(!user)throw Error('Sign in with your registered seller account.');
    const token=await user.getIdToken();
    const r=await fetch(SERVICE_URL,{method:'POST',credentials:'omit',cache:'no-store',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({action,data})});
    const result=await r.json().catch(()=>({}));
    if(!r.ok||result.ok!==true)throw Error(result.error||'Could not contact Teyza. Try again.');
    return result;
  }
  async function load(){
    if(!auth?.currentUser||busy)return;
    busy=true;render();
    const original=auth.currentUser.uid;
    try{
      info=await api('seller_mandate_status');
      if(auth.currentUser?.uid!==original)return;
      const person=info.seller||{},prior=info.mandate||null;
      $('mandateEmail').textContent=person.email||auth.currentUser.email||'Your registered shop';
      $('mandateShop').textContent=person.shopName||'Registered shop';
      $('mandateAddress').textContent=person.shopAddress||'Shop address not yet saved';
      $('mandatePhone').value=person.phone||'';
      $('mandateFirst').value=person.firstName||'';
      $('mandateSurname').value=person.surname||'';
      $('mandateHolder').value=person.accountHolder||'';
      const select=$('mandateBank');select.replaceChildren(new Option('Select your bank',''));
      for(const bank of info.banks||[])select.add(new Option(bank.name,bank.name));
      $('mandateDate').value=nextFirstOfMonth();
      $('mandateDate').min=new Date().toISOString().slice(0,10);
      $('mandateDate').max=new Date(Date.now()+364*86400000).toISOString().slice(0,10);
      $('mandateConsent').checked=false;$('mandateIdentityConsent').checked=false;
      $('mandateAccountNumber').value='';$('mandateBranch').value='';
      $('mandateIdentity').textContent=info.identity?
        'Your existing '+info.identity.kind.toUpperCase()+' document is linked for reuse. No new photo needed.':
        'A current individual ID/passport is required. Complete identity verification in Teyza before submitting.';
      hide('mandateForm',!prior||['withdrawn','needs_correction'].includes(prior.status));
      hide('mandateSaved',Boolean(prior));
      if(prior){
        $('mandateSaved').textContent='Mandate '+prior.mandateId+' · '+prior.status.replaceAll('_',' ')+
          ' · '+prior.bankName+' ending '+prior.accountLast4+' · R99 monthly. No debit is active.';
        $('mandateExistingId').value=prior.mandateId;
      }else{$('mandateExistingId').value='';}
      terms();status(prior?'Signed mandate received. Collections are not active.':
        'Choose your bank, enter your bank account and confirm the monthly R99 mandate.');
    }catch(e){info=null;status(e.message||'Could not load your mandate.','error');}
    finally{busy=false;render();}
  }
  async function submit(ev){
    ev.preventDefault();
    if(busy||!info)return;
    const date=$('mandateDate').value,day=Number(date.split('-').at(-1));
    if(day<1||day>28){status('Select a first collection date on day 1–28 of the month.','error');return;}
    if(!canSignMandate({config:info,identity:info.identity,
      consent:$('mandateConsent').checked,idConsent:$('mandateIdentityConsent').checked,
      bank:$('mandateBank').value,account:$('mandateAccountNumber').value,
      holder:$('mandateHolder').value,firstName:$('mandateFirst').value,
      surname:$('mandateSurname').value,firstDate:date})){status('Complete the required information and consent.','error');return;}
    busy=true;render();status('Securely submitting your authorisation…');
    try{
      const requestId='mandate_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
      const response=await api('seller_mandate_submit',{
        requestId,expectedMandateId:$('mandateExistingId').value||null,
        amountCents:mandateAmountCents,termsVersion:info.termsVersion,
        firstDate:date,collectionDay:day,firstName:$('mandateFirst').value.trim(),
        surname:$('mandateSurname').value.trim(),phone:$('mandatePhone').value.trim(),
        documentKind:info.identity.kind,identityEvidenceId:info.identity.evidenceId,
        accountHolder:$('mandateHolder').value.trim(),bankName:$('mandateBank').value,
        branchCode:$('mandateBranch').value,accountNumber:$('mandateAccountNumber').value,
        accountType:$('mandateAccountType').value,identityConsent:true,consent:true
      });
      $('mandateAccountNumber').value='';status('Mandate '+response.mandate.mandateId+
        ' received by Teyza administration. No debit order has been collected or activated.','success');
      info.mandate=response.mandate;
      hide('mandateForm',false);hide('mandateSaved',true);
      $('mandateSaved').textContent='Mandate '+response.mandate.mandateId+
        ' · awaiting administrator and provider review · R99 per month';
    }catch(e){status(e.message||'Mandate could not be submitted.','error');}
    finally{busy=false;render();}
  }
  try{
    const [firebase,signIn]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js')]);
    sdk=signIn;auth=signIn.getAuth(firebase.getApps()[0]||firebase.initializeApp(firebaseConfig));
    await signIn.setPersistence(auth,signIn.browserSessionPersistence);
    signIn.onAuthStateChanged(auth,async user=>{
      currentUid=user?.uid||null;info=null;render();
      if(user)await load();else status('Sign in with your existing Teyza seller account.');
    });
    $('mandateEmailForm').onsubmit=async ev=>{
      ev.preventDefault();try{await sdk.signInWithEmailAndPassword(auth,
        $('mandateLoginEmail').value.trim(),$('mandateLoginPassword').value);}
      catch(e){status(e.message||'Sign-in failed.','error');}
      finally{$('mandateLoginPassword').value='';}
    };
    $('mandateGoogle').onclick=async()=>{try{await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}
      catch(e){status(e.message||'Google sign-in was unsuccessful.','error');}};
    $('mandateApple').onclick=async()=>{try{await sdk.signInWithPopup(auth,new sdk.OAuthProvider('apple.com'));}
      catch(e){status(e.message||'Apple sign-in was unsuccessful.','error');}};
    $('mandateLogout').onclick=()=>sdk.signOut(auth);
    $('mandateReload').onclick=load;
    $('mandateWithdraw').onclick=async()=>{
      if(busy||!info?.mandate||!confirm('Withdraw this pending mandate request? Existing collection-provider agreements require separate cancellation.'))return;
      busy=true;render();
      try{await api('seller_mandate_withdraw',{mandateId:info.mandate.mandateId});
        busy=false;await load();status('Your mandate request has been withdrawn. No debit has been initiated.','success');}
      catch(e){status(e.message||'Could not withdraw the mandate.','error');}
      finally{busy=false;render();}
    };
    $('mandateForm').onsubmit=submit;
    $('mandateBank').onchange=()=>{
      const bank=$('mandateBank').value;
      $('mandateBranch').value=bankBranch(info?.banks||[],bank);
      $('mandateBranch').readOnly=bank!=='Other';
      $('mandateConsent').checked=false;render();
    };
    for(const id of ['mandateAccountNumber','mandateHolder','mandateFirst','mandateSurname','mandateDate','mandateAccountType'])
      $(id).addEventListener('input',()=>{$('mandateConsent').checked=false;terms();render();});
    $('mandateConsent').onchange=render;
    $('mandateIdentityConsent').onchange=render;
  }catch(_){status('The secure seller sign-in could not load. Check your internet connection.','error');}
}
if(typeof document!=='undefined')start();
