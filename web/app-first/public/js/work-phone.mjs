import {auth,ready} from './work-auth.mjs';
import {RecaptchaVerifier,signInWithPhoneNumber} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
let verifier=null,confirmation=null;
export function normalisePhone(value){let phone=value.trim().replace(/[\s()-]/g,'');if(/^0\d{9}$/.test(phone))phone='+27'+phone.slice(1);if(!/^\+27\d{9}$/.test(phone))throw Error('Enter a South African mobile number, such as 0712345678 or +27712345678.');return phone;}
export function clearPhone(){confirmation=null;verifier?.clear();verifier=null;}
export async function startPhone(value){const phone=normalisePhone(value);await ready;clearPhone();verifier=new RecaptchaVerifier(auth,'phoneRecaptcha',{size:'normal'});try{confirmation=await signInWithPhoneNumber(auth,phone,verifier);}catch(e){clearPhone();throw e;}}
export async function confirmPhone(value){if(!confirmation)throw Error('Request an SMS code first.');if(!/^\d{6}$/.test(value.trim()))throw Error('Enter the six-digit SMS code.');return confirmation.confirm(value.trim());}
