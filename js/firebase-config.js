import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {firebaseConfig} from "./firebase-settings.js";
const app=getApps()[0]||initializeApp(firebaseConfig); export const auth=getAuth(app); export const db=getFirestore(app);
function applyTeyzaBranding(){
 document.title=document.title.replace(/Business Expose|Business Expo|Business Lift/gi,'Teyza'); if(!document.body)return;
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){if(node.nodeValue)node.nodeValue=node.nodeValue.replace(/Business Expose|Business Expo|Business Lift/g,'Teyza').replace(/YOUR BUSINESS WORKSPACE/g,'SELL • CONNECT • GROW');}
 document.querySelectorAll('.brand-mark').forEach(mark=>{if(mark.textContent.trim()==='BE'||mark.textContent.trim()==='BL')mark.textContent='T';});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyTeyzaBranding);else applyTeyzaBranding();
export {app};
