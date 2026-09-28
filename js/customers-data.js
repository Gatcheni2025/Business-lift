import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getWorkspaceOrders,workspaceError} from "./business-context.js";

const body=document.querySelector("[data-customer-rows]");
const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"});
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

async function chatCount(user){
  try{
    const token=await user.getIdToken();
    const url=new URL("api/chat.php",location.href);url.searchParams.set("mode","seller-inbox");
    const response=await fetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    return response.ok&&data.ok?(data.threads||[]).length:0;
  }catch(_){return 0}
}

onAuthStateChanged(auth,async user=>{
  if(!user)return;
  try{
    const [data,chats]=await Promise.all([getWorkspaceOrders(user),chatCount(user)]);
    const orders=data.orders||[],customers=new Map();
    orders.forEach(order=>{
      const id=order.customerName||order.customerId||order.customerEmail;
      if(!id)return;
      const row=customers.get(id)||{id,count:0,total:0};
      row.count++;row.total+=Number(order.total||0);customers.set(id,row);
    });
    document.querySelectorAll("[data-client-count]").forEach(node=>node.textContent=customers.size.toLocaleString("en-ZA"));
    document.querySelectorAll("[data-chat-count]").forEach(node=>node.textContent=Number(chats).toLocaleString("en-ZA"));
    document.querySelectorAll("[data-client-orders]").forEach(node=>node.textContent=orders.length.toLocaleString("en-ZA"));

    body.innerHTML=customers.size?[...customers.values()].sort((a,b)=>b.total-a.total).map(item=>
      '<tr><td><strong>'+escapeHtml(item.id)+'</strong></td><td>'+item.count+'</td><td>'+money.format(item.total)+'</td></tr>'
    ).join(""):'<tr><td colspan="3"><div class="empty-state"><h3>No clients yet</h3><p>Clients appear automatically from your Teyza orders. New buyer messages are available from Live chat.</p><a class="button" href="products.html#new-product">＋ Sell something</a></div></td></tr>';
  }catch(error){
    const status=document.querySelector("[data-customer-status]");
    if(status){status.hidden=false;status.textContent=workspaceError(error,"load customers")}
    body.innerHTML='<tr><td colspan="3">Customer activity is unavailable.</td></tr>';
  }
});
