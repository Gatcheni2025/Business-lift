import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";

onAuthStateChanged(auth,async user=>{
  if(!user)return;
  if(new URLSearchParams(location.search).get("classic")==="1")return;
  try {
    const token=await user.getIdToken();
    const response=await fetch("api/workspace.php?action=context",{
      headers:{"Authorization":"Bearer "+token},cache:"no-store"
    });
    if(!response.ok)return;
    const data=await response.json();
    if(data?.ok && (data?.shopperCategory||data?.business?.shopperCategory)==="variety"){
      location.replace("retail-dashboard.html");
    }
  }catch(error){
    console.warn("Seller category check unavailable; keeping existing dashboard",error);
  }
});
