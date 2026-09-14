import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {collection,getDocs,query,where} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {auth,db} from "./firebase-config.js";
import {getBusinessContext,workspaceError} from "./business-context.js";
const body=document.querySelector('[data-customer-rows]');
const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'});
onAuthStateChanged(auth,async user=>{
 if(!user)return;
 try{
  const {businessId}=await getBusinessContext(user);if(!businessId)return;
  const orders=await getDocs(query(collection(db,'orders'),where('businessId','==',businessId)));
  const customers=new Map();
  orders.docs.forEach(doc=>{const order=doc.data();const id=order.customerId || order.customerEmail;if(!id)return;const customer=customers.get(id) || {id,count:0,total:0};customer.count++;const total=Number(order.total ?? order.totalAmount ?? 0);customer.total+=Number.isFinite(total)?total:0;customers.set(id,customer)});
  body.replaceChildren();
  if(!customers.size){body.innerHTML='<tr><td colspan="3"><div class="empty-state"><h3>No customers yet</h3><p>Customers will appear here when you record orders.</p><a class="button" href="orders.html">Create an order</a></div></td></tr>';return;}
  customers.forEach(customer=>{const row=document.createElement('tr');[customer.id,customer.count,money.format(customer.total)].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell)});body.appendChild(row)});
 }catch(error){const status=document.querySelector('[data-customer-status]');status.hidden=false;status.textContent=workspaceError(error,'load customers');body.innerHTML='<tr><td colspan="3">Customer activity is currently unavailable.</td></tr>';}
});
