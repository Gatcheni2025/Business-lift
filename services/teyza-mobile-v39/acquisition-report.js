'use strict';
// All report facts are derived on the server. Never infer delivery from a click,
// approval from a download, or revenue from an unpaid/complimentary entitlement.
const D=require('./domain'),P=require('./publication'),G=require('./acquisition-geography');
const {isDisplayed}=require('./shopper-ads');
const onboarding=require('./onboarding'),fronts=require('./shop-front');
const categories=['spaza','retail','food','salon','service','wholesale','manufacturer','other'];
const queueKeys=['new_contact','ready_to_contact','permission_needed','field_visit','awaiting_response','registration_help','pending_approval','advertising_opportunity','seller_opportunity','follow_up_due','geography_review','history_review','message_review','blocked','contactable','contacted','responded','downloaded','registered','approved','paid_seller','active_advertiser','paying'];
const funnelKeys=['discovered','contactable','readyToContact','contacted','staffConfirmedContact','providerAccepted','responded','downloads','registered','awaitingApproval','approved','paidSellers','activeAdvertisers','activePaidCampaigns','payingBusinesses','sellingAccessNotPaid','advertisingInterest','sellingInterest'];
const norm=v=>String(v||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const timestamp=(value,now)=>Number.isSafeInteger(value)&&value>0&&value<=now?value:null;
const earliest=values=>values.filter(Boolean).reduce((a,b)=>a===null?b:Math.min(a,b),null);
const latest=values=>values.filter(Boolean).reduce((a,b)=>a===null?b:Math.max(a,b),null);
const blockedStage=p=>['not_interested','closed'].includes(p.stage);
const hasContact=p=>Boolean(p.phone||p.email);
// Bounded pages, never silently truncate historical evidence or a seller's
// campaigns. Unusually large individual ledgers require review rather than a
// misleading count. Queries use document-ID cursors, not offsets.
async function allRows(query,get,{limit=10000}={}){
 let cursor=null,rows=[];
 do{
  let q=query().orderBy('__name__').limit(101);if(cursor)q=q.startAfter(cursor);
  const result=await get(q),page=result.docs.slice(0,100);
  rows.push(...page);
  cursor=result.docs.length>100?page.at(-1).id:null;
  if(rows.length>limit||cursor&&rows.length>=limit)D.fail(503,'A historical ledger exceeds the safe reporting bound. Review it before displaying complete counts.');
 }while(cursor);
 return rows;
}
async function history(p,events,now){
 const actual=[timestamp(p.contactedAt,now)],whatsapp=[timestamp(p.lastWhatsAppContactAt,now)],accepted=[];
 const email=p.emailHistory?.invitation;
 if(email?.status==='staff_confirmed_in_zoho_sent')actual.push(timestamp(email.sentAt,now));
 for(const ch of ['email','whatsapp']){
  const log=p.outbound?.[ch+'_invitation'];
  if(log?.status==='accepted')accepted.push(timestamp(log.acceptedAt??log.updatedAt,now));
 }
 // Legacy records did not materialize actual contact timestamps. The full
 // relevant ledger is read (not the latest 25 events displayed in a record).
 if(p.historyVersion!==1){
  for(const e of await events()){
   if(e.type==='contact'&&['phone','email','whatsapp'].includes(e.channel)){
    actual.push(timestamp(e.createdAt,now));if(e.channel==='whatsapp')whatsapp.push(timestamp(e.createdAt,now));
   }
   if(e.type==='email_sent'&&e.kind==='invitation'&&e.status==='staff_confirmed_in_zoho_sent')actual.push(timestamp(e.sentAt,now));
   if(e.type==='message_accepted'&&e.kind==='invitation'&&['email','whatsapp'].includes(e.channel))accepted.push(timestamp(e.acceptedAt??e.createdAt,now));
  }
 }
 const contactedAt=earliest(actual),lastWhatsAppContactAt=latest(whatsapp),providerAcceptedAt=earliest(accepted);
 const invitationRequested=Boolean(p.outbound?.email_invitation||p.outbound?.whatsapp_invitation||p.emailHistory?.invitation);
 const historyNeedsReview=(!contactedAt&&!providerAcceptedAt)&&(invitationRequested||['interested','registration_started'].includes(p.stage));
 return {contactedAt,lastWhatsAppContactAt,providerAcceptedAt,invitationRequested,historyNeedsReview,
  outreachState:contactedAt?'staff_confirmed':providerAcceptedAt?'provider_accepted':historyNeedsReview?'review_required':'not_recorded'};
}
function priorOutreach(p){
 return Boolean(p.contactedAt||p.providerAcceptedAt||p.invitationRequested||p.historyNeedsReview||p.response||p.downloadConfirmedAt||p.sellerUid||p.seller||p.stage&&p.stage!=='identified');
}
function verifiedAd(ad,id,payment,ownerUid,now){
 return ad?.ownerUid===ownerUid&&isDisplayed(ad,now)&&typeof ad.paymentReference==='string'&&ad.paymentReference&&
  payment?.ownerUid===ownerUid&&payment.advertisementId===id&&payment.status==='paid'&&payment.environment==='live'&&
  payment.currency==='ZAR'&&payment.amountCents===ad.amountCents&&timestamp(payment.verifiedAt,now)!==null&&
  typeof payment.transactionId==='string'&&payment.transactionId.length>0&&payment.reversed!==true&&payment.refunded!==true;
}
async function sellerSignals({id,account,shop,billing,read,ads,now}){
 const [setup,verification,identity,front,location]=await Promise.all(['teyzaSellerOnboarding/','teyzaMobileVerification/','teyzaSellerIdentity/','teyzaShopFrontPhotos/','teyzaShopLocations/'].map(path=>read(path+id)));
 const state=P.state(id,account,setup||{},verification,shop,billing,now);
 const listed=shop?.sellerUid===id&&shop.status==='active'&&shop.approvalStatus==='approved'&&shop.identityVerified===true;
 const approved=state.approved===true;
 const approvalSubmitted=account.approvalStatus==='pending'&&verification?.status==='pending_review'&&
  onboarding.current(verification,id,()=>now)&&onboarding.current(identity,id,()=>now)&&
  (setup?.requiredVersion!==2||(state.ready&&onboarding.submittedCurrent(setup,identity,verification,setup.verifiedPhone)&&fronts.valid(front,id)&&Boolean(P.locationFor(id,account,location,null,now))));
 // This mirrors the submitted document review queue. The actual review still
 // verifies current Firebase Auth, identity/phone/location and reviewer access.
 const paidMembership=approved&&P.entitled(id,account,billing,now);
 const sellingAccess=approved&&P.eligible(id,account,billing,now);
 let activePaidCampaigns=0,advertisingReview=0,unpaidCampaigns=0;
 if(approved&&['spaza','retail'].includes(account.category)){
  const campaigns=await ads(id);
  const canAdvertise=state.live&&listed&&Boolean(P.locationFor(id,account,location,shop,now));
  for(const s of campaigns){
   const ad=s.data();if(ad.ownerUid!==id)continue;
   if(['pending_review','approved_unpaid'].includes(ad.status))unpaidCampaigns++;
   if(ad.status!=='active'||!Number.isFinite(ad.startsAt)||!Number.isFinite(ad.endsAt)||ad.startsAt>now||ad.endsAt<=now)continue;
   const reference=ad.paymentReference;
   const payment=typeof reference==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(reference)?await read('teyzaAdPayments/'+reference):null;
   if(canAdvertise&&verifiedAd(ad,s.id,payment,id,now))activePaidCampaigns++;
   else advertisingReview++;
  }
 }
 return {approved,listed,approvalSubmitted:Boolean(approvalSubmitted),paidMembership,sellingAccess,
  activePaidCampaigns,activePaidAdvertising:activePaidCampaigns>0,unpaidCampaigns,advertisingReview};
}
function parseFilters(value={}){
 if(value===null||typeof value!=='object'||Array.isArray(value))D.fail(422,'Choose valid report filters.');
 const province=D.text(value.province??'','province',40,false),category=D.text(value.category??'','business type',30,false),queue=D.text(value.queue??'','work queue',40,false);
 if(province&&!G.provinces.includes(province)||category&&!categories.includes(category)||queue&&!queueKeys.includes(queue))D.fail(422,'Choose a valid province, business type or work queue.');
 const municipality=D.text(value.municipality??'','municipality',100,false),township=D.text(value.township??'','township',120,false);
 const municipalityCode=D.text(value.municipalityCode??'','municipality code',12,false),localityId=D.text(value.localityId??'','official locality',30,false);
 if(municipalityCode&&(!G.provinceFor(municipalityCode)||province&&G.provinceFor(municipalityCode)!==province))D.fail(422,'Municipality does not match the selected province.');
 if(localityId){const ids=G.parseLocalityId(localityId);if(province&&G.provinceFor(ids.municipalityCode)!==province||municipalityCode&&ids.municipalityCode!==municipalityCode)D.fail(422,'Official locality does not match the selected geography.');}
 const search=D.text(value.search??'','business search',120,false);
 const assignedTo=D.text(value.assignedTo??'','assigned reviewer UID',128,false);if(assignedTo)D.id(assignedTo);
 return {province,category,queue,municipality,township,municipalityCode,localityId,search,assignedTo};
}
function matches(p,f){
 const geo=G.projectedGeography(p);
 if(f.assignedTo&&p.assignedTo!==f.assignedTo)return false;
 if(f.province&&geo.province!==f.province||f.category&&p.category!==f.category||f.municipalityCode&&geo.municipalityCode!==f.municipalityCode||f.localityId&&geo.localityId!==f.localityId)return false;
 if(f.municipality&&![geo.municipality,geo.municipalityCode].some(v=>norm(v)===norm(f.municipality)))return false;
 if(f.township&&![geo.township,p.area,geo.localityId].some(v=>norm(v)===norm(f.township)))return false;
 const hay=[p.name,p.city,p.area,p.address,geo.province,geo.municipality,geo.township,p.category].map(norm).join(' ');
 return !f.search||norm(f.search).split(' ').every(term=>hay.includes(term));
}
function classify(p,now){
 const open=!p.optedOut&&!blockedStage(p)&&p.response!=='declined';
 const registered=Boolean(p.seller&&p.seller.status!=='review_required'),approved=registered&&p.seller.approved===true;
 const confirmed=Boolean(p.contactedAt),accepted=Boolean(p.providerAcceptedAt),contacted=confirmed||accepted;
 const newContact=open&&hasContact(p)&&!priorOutreach(p);
 const permitted=Boolean(p.email&&p.permissions?.email?.granted===true||p.phone&&p.permissions?.whatsapp?.granted===true||p.phone&&p.phoneKind!=='whatsapp_only'&&p.permissions?.phone?.granted===true);
 // SAST has no DST. The daily queue includes work scheduled for later today.
 const tomorrow=(Math.floor((now+7200000)/86400000)+1)*86400000-7200000;
 const due=Boolean(p.nextFollowUpAt&&p.nextFollowUpAt<tomorrow);
 const ready=newContact&&permitted&&(!p.nextFollowUpAt||due);
 const paidSeller=approved&&p.seller.paidMembership===true,paidAd=approved&&p.seller.activePaidAdvertising===true;
 const pending=registered&&!approved&&p.seller.approvalSubmitted===true;
 const interested=p.commercialInterest?.kind;
 const queues={
  new_contact:newContact,ready_to_contact:ready,permission_needed:newContact&&!permitted,
  field_visit:open&&!hasContact(p)&&!registered&&!contacted&&!p.response&&!p.downloadConfirmedAt,
  awaiting_response:open&&contacted&&!p.response&&!registered&&!p.downloadConfirmedAt,
  registration_help:Boolean(open&&(!registered&&(p.downloadConfirmedAt||['interested','needs_help'].includes(p.response)||p.stage==='registration_started')||registered&&!approved&&!pending&&['pending','needs_changes'].includes(p.seller.status))),
  pending_approval:pending,advertising_opportunity:open&&approved&&!paidAd&&interested!=='not_now',
  seller_opportunity:open&&approved&&!paidSeller&&interested!=='not_now',
  follow_up_due:open&&due,geography_review:p.geographyNeedsReview===true,history_review:p.historyNeedsReview===true,
  message_review:Object.values(p.outbound||{}).some(j=>['review_required','cancelled'].includes(j?.status)||['queued','sending'].includes(j?.status)&&now-(j.updatedAt||0)>600000)||(p.seller?.advertisingReview||0)>0,
  blocked:p.optedOut===true,contactable:!p.optedOut&&hasContact(p),contacted,responded:Boolean(p.response),downloaded:Boolean(p.downloadConfirmedAt),registered,approved,paid_seller:paidSeller,active_advertiser:paidAd,paying:paidSeller||paidAd
 };
 return {funnel:{discovered:1,contactable:Number(!p.optedOut&&hasContact(p)),readyToContact:Number(ready),contacted:Number(contacted),staffConfirmedContact:Number(confirmed),providerAccepted:Number(accepted),responded:Number(Boolean(p.response)),downloads:Number(Boolean(p.downloadConfirmedAt)),registered:Number(registered),awaitingApproval:Number(pending),approved:Number(approved),paidSellers:Number(paidSeller),activeAdvertisers:Number(paidAd),activePaidCampaigns:paidAd?p.seller.activePaidCampaigns:0,payingBusinesses:Number(paidSeller||paidAd),sellingAccessNotPaid:Number(approved&&p.seller.sellingAccess===true&&!paidSeller),advertisingInterest:Number(approved&&['advertising','both'].includes(interested)),sellingInterest:Number(approved&&['selling','both'].includes(interested))},queues};
}
function emptyCounts(){return {funnel:Object.fromEntries(funnelKeys.map(k=>[k,0])),queues:Object.fromEntries(queueKeys.map(k=>[k,0]))};}
function addCounts(counts,facts){for(const key of funnelKeys)counts.funnel[key]+=facts.funnel[key]||0;for(const key of queueKeys)counts.queues[key]+=Number(Boolean(facts.queues[key]));}
module.exports={categories,queueKeys,funnelKeys,allRows,history,priorOutreach,verifiedAd,sellerSignals,parseFilters,matches,classify,emptyCounts,addCounts};
