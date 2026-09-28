import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getWorkspaceSummary,workspaceError} from "./business-context.js";

const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR",maximumFractionDigits:0});
const fullMoney=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"});
const set=(selector,value)=>document.querySelectorAll(selector).forEach(node=>node.textContent=value);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const totalOf=order=>Number(order.total??order.totalAmount??order.grandTotal??0)||0;

onAuthStateChanged(auth,async user=>{
  if(!user)return;
  try{
    const summary=await getWorkspaceSummary(user);
    const orders=summary.orders||[];
    const settings=summary.settings||{};
    const banking=settings.banking||{};
    const paid=orders.filter(order=>String(order.paymentStatus||"pending").toLowerCase()==="paid");
    const pending=orders.filter(order=>String(order.paymentStatus||"pending").toLowerCase()!=="paid");
    set("[data-bank-paid]",money.format(paid.reduce((sum,order)=>sum+totalOf(order),0)));
    set("[data-bank-pending]",money.format(pending.reduce((sum,order)=>sum+totalOf(order),0)));
    set("[data-bank-total]",money.format(orders.reduce((sum,order)=>sum+totalOf(order),0)));
    set("[data-bank-name]",banking.bankName||settings.paymentPreferences?.otherGateway||"Not set");
    set("[data-bank-holder]",banking.accountHolder||"—");
    const last4=banking.accountNumberLast4||String(banking.accountNumber||"").slice(-4);
    set("[data-bank-account]",last4?"•••• "+last4:"—");
    set("[data-bank-branch]",banking.branchCode||"—");

    const body=document.querySelector("[data-bank-transactions]");
    if(body){
      body.innerHTML=orders.length?orders.slice(0,12).map(order=>{
        const status=String(order.paymentStatus||"pending").toUpperCase();
        return '<tr><td><strong>'+escapeHtml(order.orderNumber||order.id||"Order")+'</strong></td><td>'+escapeHtml(order.customerName||order.customerId||"Customer")+'</td><td><span class="pill">'+escapeHtml(status)+'</span></td><td>'+fullMoney.format(totalOf(order))+'</td></tr>';
      }).join(""):'<tr><td colspan="4"><div class="empty-state"><h3>No transactions yet</h3><p>Sales will appear here when your first Teyza order is recorded.</p><a class="button" href="products.html#new-product">＋ Sell something</a></div></td></tr>';
    }
  }catch(error){
    console.error("Banking screen failed",error);
    const status=document.querySelector("[data-workspace-status]");
    if(status){status.hidden=false;status.textContent=workspaceError(error,"load banking");status.classList.add("error");}
  }
});
