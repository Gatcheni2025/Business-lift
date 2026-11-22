'use strict';
const validUid=uid=>typeof uid==='string'&&/^[A-Za-z0-9_-]{6,128}$/.test(uid);
function createWelcomeRollout({getMode=()=> 'pilot',getPilotUid=()=>'',getPilotStartAt=()=>0,getStartedAt=()=>0}={}){
 function allowsSeller(uid){
  return validUid(uid)&&(getMode()==='general'||getMode()==='pilot'&&uid===getPilotUid());
 }
 function approvalStatus(entry){
  if(!allowsSeller(entry.sellerUid))return 'excluded';
  const start=Number(getMode()==='general'?getStartedAt():getPilotStartAt());
  if(!Number.isSafeInteger(start)||start<=0||!Number.isSafeInteger(entry.createdAt))return 'excluded';
  if(entry.createdAt<start)return getMode()==='general'?'historical':'excluded';
  return 'eligible';
 }
 return {allowsSeller,approvalStatus};
}
module.exports={createWelcomeRollout,validUid};
