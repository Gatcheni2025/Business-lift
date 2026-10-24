'use strict';
// Remove the expiry index field too, so already-cleaned records cannot fill the
// next limited retention query and leave later private evidence behind.
function expiredIdentity(current,expired,now,remove){
 if(!current||current.evidenceId!==expired.evidenceId||!Number.isFinite(current.expiresAt)||current.expiresAt>now)return null;
 return {objectPath:remove,detailsEncrypted:remove,expiresAt:remove,photoRemovedAt:now};
}
module.exports={expiredIdentity};
