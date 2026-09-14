import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {collection,getDocs,query,where} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {auth,db} from "./firebase-config.js";
import {getBusinessContext,hydrateBusiness,workspaceError} from "./business-context.js";
const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:0});
const set=(selector,value)=>document.querySelectorAll(selector).forEach(node=>node.textContent=value);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const totalOf=order=>{const amount=Number(order.total ?? order.totalAmount ?? order.grandTotal ?? 0);return Number.isFinite(amount)?amount:0;};
function showError(message){const node=document.querySelector('[data-dashboard-status]');node.hidden=false;node.textContent=message;node.classList.add('error');}
async function load(user){
 const context=await getBusinessContext(user);
 if(!context.businessId)return;
 hydrateBusiness(context,user);
 set('[data-greeting-name]',context.userData.firstName || user.displayName?.split(' ')[0] || 'business owner');
 set('[data-hero-line]',context.business.profileComplete?'Here’s what’s happening in your business. Pick up where you left off.':'Let’s get your business ready. Complete your profile, then add your first product.');
 document.querySelector('[data-setup-profile]').dataset.complete=String(!!context.business.profileComplete);
 const [orderResult,productResult]=await Promise.allSettled([
  getDocs(query(collection(db,'orders'),where('businessId','==',context.businessId))),
  getDocs(query(collection(db,'products'),where('businessId','==',context.businessId)))
 ]);
 if(orderResult.status==='fulfilled'){
  const orders=orderResult.value.docs.map(doc=>({id:doc.id,...doc.data()}));
  set('[data-stat-revenue]',money.format(orders.reduce((sum,order)=>sum+totalOf(order),0)));
  set('[data-stat-orders]',orders.length);
  set('[data-stat-customers]',new Set(orders.map(order=>order.customerId || order.customerEmail).filter(Boolean)).size);
  const pending=orders.filter(order=>['new','processing'].includes(String(order.orderStatus || order.status || 'new').toLowerCase())).length;
  set('[data-opportunity-carts]',pending?`${pending} orders need your attention.`:'You’re all caught up. No new or processing orders.');
  const body=document.querySelector('[data-recent-orders]');
  const time=order=>order.createdAt?.toMillis?.() || Number(order.createdAt?.seconds || 0)*1000;
  orders.sort((a,b)=>time(b)-time(a));
  body.innerHTML=orders.length?orders.slice(0,5).map(order=>`<tr><td><strong>${escape(order.orderNumber || order.id)}</strong></td><td>${escape(order.customerName || order.customerId || 'Customer')}</td><td><span class="pill">${escape(order.orderStatus || order.status || 'New')}</span></td><td>${money.format(totalOf(order))}</td></tr>`).join(''):'<tr><td colspan="4"><div class="empty-state"><div class="empty-symbol">▤</div><h3>Your first order starts here</h3><p>Once you record an order, you’ll see its details and progress here.</p><a class="button" href="orders.html">Create an order</a></div></td></tr>';
 }else{
  set('[data-opportunity-carts]','Order activity is unavailable.');
  document.querySelector('[data-recent-orders]').innerHTML='<tr><td colspan="4">Orders could not be loaded. Reload this page to try again.</td></tr>';
  showError(workspaceError(orderResult.reason,'load orders'));
 }
 if(productResult.status==='fulfilled'){
  const products=productResult.value.docs.map(doc=>doc.data());
  set('[data-stat-products]',products.length);
  document.querySelector('[data-setup-product]').dataset.complete=String(products.length>0);
  const low=products.filter(product=>Number(product.stock || 0)<=5).length;
  set('[data-opportunity-stock]',low?`${low} products have low or no stock.`:products.length?'Stock levels look good.':'Add your first product to start tracking stock.');
 }else{set('[data-opportunity-stock]','Inventory is unavailable.');showError(workspaceError(productResult.reason,'load products'));}
}
onAuthStateChanged(auth,user=>{
 if(user)load(user).catch(error=>{
  console.error('Dashboard failed',error);showError(workspaceError(error));
  set('[data-opportunity-carts]','Order activity is unavailable.');set('[data-opportunity-stock]','Inventory is unavailable.');
  document.querySelector('[data-recent-orders]').innerHTML='<tr><td colspan="4">Business activity is unavailable. Retry by reloading this page.</td></tr>';
 });
});
