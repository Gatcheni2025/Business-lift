'use strict';

// Production checkout is OFF unless both flags explicitly allow the exact
// Firebase Auth UID. This is not an email allowlist and cannot be overridden
// by a browser, URL query or admin support message.
const configured=()=>process.env.TEYZA_SELLER_PAYSTACK_ENABLED==='true';
const identities=()=>new Set(String(process.env.TEYZA_PAYSTACK_PILOT_UIDS||'')
  .split(',').map(v=>v.trim()).filter(v=>/^[A-Za-z0-9_-]{5,128}$/.test(v)));
const full=()=>process.env.TEYZA_PAYSTACK_FULL_ROLLOUT_APPROVED==='true' &&
  String(process.env.TEYZA_PAYSTACK_PILOT_UIDS||'').trim()==='*';
function allowed(uid){
 if(!configured()||typeof uid!=='string'||uid.length===0)return false;
 return full()||identities().has(uid);
}
const hasEligibleAudience=()=>configured()&&(full()||identities().size>0);
const mode=()=>!configured()?'disabled':full()?'full':identities().size>0?'pilot':'no_eligible_sellers';
module.exports={allowed,hasEligibleAudience,mode};
