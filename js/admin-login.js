import {
 onAuthStateChanged,
 signInWithEmailAndPassword,
 signInWithPopup,
 GoogleAuthProvider,
 sendPasswordResetEmail,
 signOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";

const form=document.querySelector("[data-admin-login-form]");
const emailInput=document.querySelector("#adminEmail");
const passwordInput=document.querySelector("#adminPassword");
const emailButton=document.querySelector("[data-email-login]");
const googleButton=document.querySelector("[data-google-login]");
const statusNode=document.querySelector("[data-login-status]");
let checkingExisting=true;

function status(message,type="error"){
 statusNode.hidden=false;
 statusNode.textContent=message;
 statusNode.className="status "+type;
}
function clearStatus(){statusNode.hidden=true;statusNode.textContent=""}
function friendly(error){
 const code=String(error?.code||"");
 if(code.includes("invalid-credential")||code.includes("wrong-password")||code.includes("user-not-found"))return "Email or password is incorrect.";
 if(code.includes("too-many-requests"))return "Too many attempts. Please wait and try again.";
 if(code.includes("popup-closed"))return "Google sign-in was cancelled.";
 if(code.includes("network-request-failed"))return "Network error. Check your connection and try again.";
 return error?.message||"Unable to sign in.";
}

async function verifyAdmin(user){
 const token=await user.getIdToken(true);
 const r=await fetch("api/workspace.php?action=admin-session",{
  headers:{Authorization:"Bearer "+token},
  cache:"no-store"
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.ok)throw new Error(d.error||"This account does not have Teyza administrator access.");
 return d.admin;
}

async function completeLogin(user){
 status("Checking administrator access…","info");
 try{
  await verifyAdmin(user);
  status("Admin access verified. Opening console…","success");
  location.replace("admin.html");
 }catch(error){
  await signOut(auth).catch(()=>{});
  status(error.message||"This account does not have Teyza administrator access.");
  throw error;
 }
}

form.addEventListener("submit",async e=>{
 e.preventDefault();clearStatus();
 const email=emailInput.value.trim(),password=passwordInput.value;
 if(!email||!password){status("Enter your admin email and password.");return}
 emailButton.disabled=true;emailButton.textContent="Signing in…";
 try{
  const result=await signInWithEmailAndPassword(auth,email,password);
  await completeLogin(result.user);
 }catch(error){
  if(!String(error?.message||"").includes("administrator access"))status(friendly(error));
 }finally{
  emailButton.disabled=false;emailButton.textContent="Sign in to Admin";
 }
});

googleButton.addEventListener("click",async()=>{
 clearStatus();googleButton.disabled=true;googleButton.textContent="Opening Google…";
 try{
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  const result=await signInWithPopup(auth,provider);
  await completeLogin(result.user);
 }catch(error){
  if(!String(error?.message||"").includes("administrator access"))status(friendly(error));
 }finally{
  googleButton.disabled=false;googleButton.innerHTML="<span>G</span>Continue with Google";
 }
});

document.querySelector("[data-forgot-password]").addEventListener("click",async()=>{
 const email=emailInput.value.trim();
 if(!email){status("Enter your admin email address first.","info");emailInput.focus();return}
 try{
  await sendPasswordResetEmail(auth,email);
  status("Password reset email sent. Check your inbox.","success");
 }catch(error){status(friendly(error))}
});

document.querySelector("[data-toggle-password]").addEventListener("click",e=>{
 const show=passwordInput.type==="password";
 passwordInput.type=show?"text":"password";
 e.currentTarget.textContent=show?"Hide":"Show";
});

const params=new URLSearchParams(location.search);
if(params.get("error"))status(params.get("error"));

onAuthStateChanged(auth,async current=>{
 if(!checkingExisting||!current)return;
 checkingExisting=false;
 try{
  await verifyAdmin(current);
  location.replace("admin.html");
 }catch(_){
  await signOut(auth).catch(()=>{});
 }
});
setTimeout(()=>{checkingExisting=false},1200);
