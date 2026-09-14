import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";
import {workspaceError} from "./business-context.js";

const body=document.querySelector('[data-customer-rows]');
const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'});

function render(customers){
  body.replaceChildren();
  if(!customers.length){body.innerHTML='<tr><td colspan="3"><div class="empty-state"><h3>No customers yet</h3><p>Customers will appear here when you record orders.</p><a class="button" href="orders.html">Create an order</a></div></td></tr>';return;}
  customers.forEach(customer=>{const row=document.createElement('tr');[customer.name||customer.id,customer.orders,money.format(Number(customer.total||0))].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell)});body.appendChild(row)});
}

onAuthStateChanged(auth,async user=>{
 if(!user)return;
 try{const result=await apiFetch('api/customers.php');render(Array.isArray(result.customers)?result.customers:[]);}
 catch(error){const status=document.querySelector('[data-customer-status]');if(status){status.hidden=false;status.textContent=workspaceError(error,'load customers');}body.innerHTML='<tr><td colspan="3">Customer activity is currently unavailable.</td></tr>';}
});
