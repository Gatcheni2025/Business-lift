'use strict';
const crypto=require('node:crypto');
function key(value){const bytes=Buffer.from(value||'','base64');if(bytes.length!==32)throw new Error('VERIFICATION_KEY_NOT_CONFIGURED');return bytes;}
function encrypt(bytes,secret){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(secret),iv);
  const data=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([Buffer.from('TYZ1'),iv,cipher.getAuthTag(),data]);}
function decrypt(bytes,secret){if(bytes.subarray(0,4).toString()!=='TYZ1')throw new Error('INVALID_SELFIE_FORMAT');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(secret),bytes.subarray(4,16));decipher.setAuthTag(bytes.subarray(16,32));
  return Buffer.concat([decipher.update(bytes.subarray(32)),decipher.final()]);}
module.exports={encrypt,decrypt};
