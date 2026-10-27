'use strict';
const crypto=require('node:crypto'),D=require('./domain'),{recentAdmin}=require('./seller-experience');
const actions=new Set(['ops_sellers','ops_seller_detail','ops_invoice','ops_payment','ops_payment_reverse','ops_finance_queue','ops_finance_decide','ops_support_list','ops_support_create','ops_support_update','ops_support_detail','seller_billing_statement','seller_support_create','seller_support_list']);
const PRICE=9900;
const row=s=>({id:s.id,...s.data()});
function period(value){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value||''))D.fail(422,'Choose a billing month in YYYY-MM format.');return value;}
function amount(value){if(!Number.isSafeInteger(value)||value<=0||value>50000000)D.fail(422,'Enter a valid amount in cents.');return value;}
function statement(entries){let balance=0;return entries.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).map(e=>({...e,balanceCents:balance+=(e.debitCents||0)-(e.creditCents||0)}));}
function financePath(value){if(!/^teyzaCreditEnquiries\/[A-Za-z0-9_-]{1,128}\/requests\/[A-Za-z0-9_-]{1,128}$/.test(value||''))D.fail(422,'Choose a valid stock finance request.');return value;}
function createOperations({db,clock=Date.now,rate}){
 const doc=p=>db.doc(p),read=async p=>{const s=await doc(p).get();return s.exists?s.data():null;};
 const owner=async uid=>D.seller(await read('teyzaSellerAccounts/'+uid),uid);
 function audit(tx,auth,action,target,details){tx.set(doc('teyzaOperationsAudit/'+crypto.randomUUID()),{actorUid:auth.uid,action,target,details,createdAt:clock()});}
 async function ledger(uid){const rows=await db.collection('teyzaBilling/'+uid+'/entries').orderBy('createdAt','desc').limit(501).get();if(rows.docs.length>500)D.fail(422,'This account needs an archived statement export before it can be displayed in full.');return {entries:statement(rows.docs.map(row)),truncated:false};}
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid),self=action.startsWith('seller_');
  if(self){if(!auth.email_verified&&!auth.phone_number)D.fail(403,'Verify your email or phone first.');await owner(uid);}
  else recentAdmin(auth,clock);
  await rate(uid,'operations',60,60000);
  if(action==='ops_sellers'){
   let q=db.collection('teyzaSellerAccounts').orderBy('__name__').limit(31);if(data.after)q=q.startAfter(D.id(data.after));
   const result=await q.get(),rows=result.docs.slice(0,30);const billing=await Promise.all(rows.map(s=>read('teyzaBilling/'+s.id)));
   return {sellers:rows.map((s,i)=>{const a=s.data();return {sellerUid:s.id,shopName:a.shopName||'',ownerEmail:a.ownerEmail||'',phone:a.phone||'',address:a.address||'',category:a.category||'',approvalStatus:a.approvalStatus||'pending',subscription:billing[i]?.status||'not_started'};}),next:result.docs.length>30?rows.at(-1).id:null};
  }
  if(action==='ops_seller_detail'||action==='seller_billing_statement'){
   const target=self?uid:D.id(data.sellerUid),account=await owner(target);
   const [billing,books,setup,verification]=await Promise.all([read('teyzaBilling/'+target),ledger(target),read('teyzaSellerOnboarding/'+target),read('teyzaMobileVerification/'+target)]);
   const mandate=require('./mandate').publicMandate(await read('teyzaSellerMandates/'+target));
   return {mandate,seller:{sellerUid:target,shopName:account.shopName,ownerEmail:account.ownerEmail||'',phone:account.phone||'',address:account.address||'',approvalStatus:account.approvalStatus},billing:billing||{status:'not_started',monthlyCents:PRICE},...books,verification:{status:verification?.status||'not_submitted',phoneVerified:!!setup?.verifiedPhone,completed:!!setup?.completedAt}};
  }
  if(action==='ops_invoice'){
   const target=D.id(data.sellerUid),month=period(data.period),consent=D.text(data.consentReference,'seller subscription consent reference',180);
   if(data.consentConfirmed!==true)D.fail(422,'Confirm the seller agreed to the R99 monthly subscription.');
   if(target===uid)D.fail(403,'Another administrator must manage your subscription.');
   return db.runTransaction(async tx=>{
    const account=await tx.get(doc('teyzaSellerAccounts/'+target)),ref=doc('teyzaBilling/'+target+'/entries/invoice_'+month),old=await tx.get(ref);
    const seller=D.seller(account.exists?account.data():null,target);if(seller.approvalStatus!=='approved')D.fail(409,'Approve the seller before invoicing a subscription.');
    if(old.exists)return {invoiceId:ref.id,alreadyCreated:true};
    tx.set(ref,{ownerUid:target,kind:'subscription_invoice',period:month,description:'Teyza monthly subscription — '+month,debitCents:PRICE,creditCents:0,paidCents:0,createdAt:clock(),createdBy:uid,consentReference:consent});
    tx.set(doc('teyzaBilling/'+target),{ownerUid:target,status:'invoiced',monthlyCents:PRICE,currency:'ZAR',latestPeriod:month,consentReference:consent,collectionMethod:'manual_receipt',updatedAt:clock()},{merge:true});
    audit(tx,auth,action,target,{period:month,amountCents:PRICE});return {invoiceId:ref.id,amountCents:PRICE};
   });
  }
  if(action==='ops_payment'){
   const target=D.id(data.sellerUid),month=period(data.period),cents=amount(data.amountCents),reference=D.text(data.reference,'verified bank or payment-provider receipt reference',180);
   if(data.receiptVerified!==true)D.fail(422,'Verify the payment receipt before recording it.');if(target===uid)D.fail(403,'Another administrator must record your payment.');
   const key=crypto.createHash('sha256').update(reference.trim().toUpperCase()).digest('hex');
   return db.runTransaction(async tx=>{
    const invoiceRef=doc('teyzaBilling/'+target+'/entries/invoice_'+month),receiptRef=doc('teyzaPaymentReceipts/'+key);
    const billingRef=doc('teyzaBilling/'+target);
    const [invoice,receipt,billing]=await Promise.all([tx.get(invoiceRef),tx.get(receiptRef),tx.get(billingRef)]);
    if(receipt.exists){const old=receipt.data();if(old.ownerUid===target&&old.period===month&&old.amountCents===cents&&!old.reversed)return {recorded:true,alreadyRecorded:true};D.fail(409,'That receipt reference has already been used.');}
    if(!invoice.exists||invoice.data().ownerUid!==target||invoice.data().kind!=='subscription_invoice')D.fail(409,'Create this month’s subscription invoice first.');
    const bill=invoice.data();if(cents>bill.debitCents-(bill.paidCents||0))D.fail(409,'Payment exceeds the invoice balance.');
    tx.set(doc('teyzaBilling/'+target+'/entries/payment_'+key),{ownerUid:target,kind:'payment',period:month,description:'Verified subscription payment',debitCents:0,creditCents:cents,reference,createdAt:clock(),createdBy:uid});
    tx.set(receiptRef,{ownerUid:target,period:month,amountCents:cents,reference,reversed:false,createdAt:clock()});
    tx.update(invoiceRef,{paidCents:(bill.paidCents||0)+cents});
    tx.set(billingRef,{lastPaymentAt:clock(),updatedAt:clock(),...(billing.exists&&billing.data().latestPeriod===month?{status:(bill.paidCents||0)+cents===bill.debitCents?'paid':'part_paid'}:{})},{merge:true});
    audit(tx,auth,action,target,{period:month,amountCents:cents,receiptId:key});return {recorded:true};
   });
  }
  if(action==='ops_payment_reverse'){
   const target=D.id(data.sellerUid),paymentId=D.id(data.paymentId),reason=D.text(data.reason,'correction reason',400);
   if(target===uid)D.fail(403,'Another administrator must correct your payment.');if(!/^payment_[a-f0-9]{64}$/.test(paymentId))D.fail(422,'Choose a payment entry.');
   return db.runTransaction(async tx=>{
    const ref=doc('teyzaBilling/'+target+'/entries/'+paymentId),payment=await tx.get(ref);if(!payment.exists||payment.data().ownerUid!==target)D.fail(404,'Payment not found.');
    const p=payment.data(),receiptRef=doc('teyzaPaymentReceipts/'+paymentId.slice(8)),receipt=await tx.get(receiptRef),invoiceRef=doc('teyzaBilling/'+target+'/entries/invoice_'+period(p.period)),invoice=await tx.get(invoiceRef);
    if(!receipt.exists||receipt.data().reversed)D.fail(409,'Payment is already corrected or its receipt is missing.');
    if(!invoice.exists||(invoice.data().paidCents||0)<p.creditCents)D.fail(409,'Invoice needs reconciliation before correction.');
    tx.set(doc('teyzaBilling/'+target+'/entries/reversal_'+paymentId),{ownerUid:target,kind:'payment_correction',period:p.period,description:reason,debitCents:p.creditCents,creditCents:0,createdAt:clock(),createdBy:uid});
    tx.set(doc('teyzaBilling/'+target),{status:'needs_reconciliation',updatedAt:clock()},{merge:true});tx.update(ref,{reversed:true});tx.update(receiptRef,{reversed:true});tx.update(invoiceRef,{paidCents:invoice.data().paidCents-p.creditCents});audit(tx,auth,action,target,{paymentId,reason});return {corrected:true};
   });
  }
  if(action==='ops_finance_queue'){
   let q=db.collectionGroup('requests').orderBy('__name__').limit(51);if(data.after){if(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/requests\/[A-Za-z0-9_-]+$/.test(data.after))D.fail(422,'Invalid finance queue cursor.');q=q.startAfter(data.after);}
   const found=await q.get(),page=found.docs.slice(0,50);
   return {requests:page.filter(s=>/^teyzaCreditEnquiries\/[^/]+\/requests\/[^/]+$/.test(s.ref.path)&&s.data().ownerUid===s.ref.path.split('/')[1]).map(s=>({id:s.id,path:s.ref.path,...s.data()})),next:found.docs.length>50?page.at(-1).ref.path:null};
  }
  if(action==='ops_finance_decide'){
   const path=financePath(data.path),target=path.split('/')[1],note=D.text(data.note,'finance review note',500),status=data.status;
   if(target===uid)D.fail(403,'Another administrator must review your application.');
   if(!['under_review','more_information','approved_in_principle','declined'].includes(status))D.fail(422,'Choose a finance review outcome.');
   if(data.expectedStatus===undefined)D.fail(422,'Refresh the application before reviewing.');
   const approved=status==='approved_in_principle'?amount(data.approvedAmountCents):0;
   if(status==='approved_in_principle'&&data.reviewConfirmed!==true)D.fail(422,'Confirm the manual stock finance review.');
   return db.runTransaction(async tx=>{
    const ref=doc(path),snap=await tx.get(ref),account=await tx.get(doc('teyzaSellerAccounts/'+target));
    if(!snap.exists||snap.data().ownerUid!==target)D.fail(404,'Finance request not found.');const old=snap.data();
    if(old.status!==data.expectedStatus)D.fail(409,'Another reviewer changed this request. Refresh before continuing.');
    if(['approved_in_principle','declined'].includes(old.status))D.fail(409,'This application already has a final review outcome.');
    if(approved&&(!account.exists||account.data().approvalStatus!=='approved'||old.consent!==true||approved>old.amountCents))D.fail(409,'Approval requires an approved seller, consent and an amount within the request.');
    tx.update(ref,{status,reviewNote:note,approvedAmountCents:approved,reviewedBy:uid,reviewedAt:clock(),disbursementStatus:'not_disbursed'});
    audit(tx,auth,action,target,{applicationId:snap.id,status,approvedAmountCents:approved,note});return {status,disbursementStatus:'not_disbursed'};
   });
  }
  if(action==='ops_support_list'||action==='seller_support_list'){
   let q=db.collection('teyzaSupportTickets');if(self)q=q.where('ownerUid','==',uid);else q=q.orderBy('__name__');
   q=q.limit(51);if(!self&&data.after)q=q.startAfter(D.id(data.after));const result=await q.get(),page=result.docs.slice(0,50);return {tickets:page.map(row),next:!self&&result.docs.length>50?page.at(-1).id:null};
  }
  if(action==='ops_support_create'||action==='seller_support_create'){
   const target=self?uid:D.id(data.sellerUid);await owner(target);await rate(uid,'support-create',10,3600000);
   const subject=D.text(data.subject,'support subject',140),message=D.text(data.message,'support description',2000),ref=db.collection('teyzaSupportTickets').doc();
   await ref.set({ownerUid:target,subject,message,status:'open',priority:'normal',revision:0,createdBy:uid,createdAt:clock(),updatedAt:clock(),source:self?'seller_app':'admin_received_request'});return {ticketId:ref.id};
  }
  if(action==='ops_support_detail'){
   const id=D.id(data.ticketId),ticket=await read('teyzaSupportTickets/'+id);if(!ticket)D.fail(404,'Ticket not found.');
   const notes=await db.collection('teyzaSupportTickets/'+id+'/internalNotes').orderBy('createdAt','desc').limit(50).get();return {ticket:{id,...ticket},notes:notes.docs.map(row)};
  }
  if(action==='ops_support_update'){
   const id=D.id(data.ticketId),note=D.text(data.note,'internal support note',2000);if(!['open','in_progress','waiting_for_seller','resolved'].includes(data.status))D.fail(422,'Choose a support status.');
   if(!['normal','high','urgent'].includes(data.priority))D.fail(422,'Choose a priority.');
   return db.runTransaction(async tx=>{
    const ref=doc('teyzaSupportTickets/'+id),snap=await tx.get(ref);if(!snap.exists)D.fail(404,'Ticket not found.');if(snap.data().revision!==data.revision)D.fail(409,'This ticket changed. Refresh before saving.');
    tx.update(ref,{status:data.status,priority:data.priority,revision:data.revision+1,updatedAt:clock(),assignedTo:uid});
    tx.set(ref.collection('internalNotes').doc(),{note,authorUid:uid,createdAt:clock()});audit(tx,auth,action,snap.data().ownerUid,{ticketId:id,status:data.status});return {saved:true};
   });
  }
  D.fail(400,'Unknown operations action.');
 }
 return {execute};
}
module.exports={createOperations,actions,PRICE,period,amount,statement,financePath};
