'use strict';
// A Firebase Auth email is a login identifier, never a licence to transfer
// Firestore business approval, payouts, documents or billing between UIDs.
const normalizedEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
async function visibleDirectory(sellers,getAuthUserByEmail){
  const groups=new Map();
  const singles=[];
  for(const seller of sellers){
    const email=normalizedEmail(seller.ownerEmail);
    if(!email){singles.push(seller);continue;}
    const group=groups.get(email)||[];
    group.push(seller);groups.set(email,group);
  }
  const result=[...singles];
  for(const [email,group] of groups){
    if(group.length===1){result.push(group[0]);continue;}
    let auth=null;
    try{auth=await getAuthUserByEmail(email);}catch(_){
      // An Auth API outage cannot justify transferring approval or funds.
      auth=null;
    }
    const matches=group.filter(s=>s.sellerUid===auth?.uid);
    if(matches.length===1){
      // Preserve orphaned records in Firestore for secure audit/repair, but
      // display only the account owned by the one verified Auth UID.
      result.push(matches[0]);
    }else{
      result.push({
        sellerUid:null,ownerEmail:email,shopName:'Account ownership conflict',
        approvalStatus:'identity_conflict',subscription:'blocked',
        accountConflict:true,
        conflictingSellerUids:group.map(s=>s.sellerUid).sort()
      });
    }
  }
  const originalOrder=new Map(sellers.map((s,i)=>[s.sellerUid,i]));
  result.sort((a,b)=>{
    const pos=x=>x.accountConflict?
      Math.min(...x.conflictingSellerUids.map(uid=>originalOrder.get(uid)??Infinity)):
      originalOrder.get(x.sellerUid)??Infinity;
    return pos(a)-pos(b);
  });
  return result;
}
module.exports={normalizedEmail,visibleDirectory};
