import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";
import {hydrateBusiness,workspaceError} from "./business-context.js";
const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:0});
const set=(selector,value)=>document.querySelectorAll(selector).forEach(node=>node.textContent=value);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));
function showError(message){const node=document.querySelector('[data-dashboard-status]');if(!node)return;node.hidden=false;node.textContent=message;node.classList.add('error');}
async function load(user){
 const data=await apiFetch('api/dashboard.php');
 hydrateBusiness({businessId:user.uid,business:{businessName:data.business?.name||'Your business'}},user);
 set('[data-greeting-name]',user.displayName?.split(' ')[0]||'business owner');
 set('[data-hero-line]',data.business?.profileComplete?'Here’s what’s happening in your business. Pick up where you left off.':'Let’s get your business ready. Complete your profile, then add your first product.');
 const profileStep=document.querySelector('[data-setup-profile]');if(profileStep)profileStep.dataset.complete=String(Boolean(data.business?.profileComplete));
 set('[data-stat-revenue]',money.format(Number(data.metrics?.revenue||0)));
 set('[data-stat-orders]',Number(data.metrics?.orders||0));
 set('[data-stat-customers]',Number(data.metrics?.customers||0));
 set('[data-stat-products]',Number(data.metrics?.products||0));
 set('[data-opportunity-carts]',data.metrics?.pendingOrders?`${data.metrics.pendingOrders} orders need your attention.`:'You’re all caught up. No new or processing orders.');
 set('[data-opportunity-stock]',data.metrics?.lowStock?`${data.metrics.lowStock} products have low or no stock.`:(data.metrics?.products?'Stock levels look good.':'Add your first product to start tracking stock.'));
 const productStep=document.querySelector('[data-setup-product]');if(productStep)productStep.dataset.complete=String(Number(data.metrics?.products||0)>0);
 const body=document.querySelector('[data-recent-orders]');const orders=Array.isArray(data.orders?.recent)?data.orders.recent:[];
 if(body)body.innerHTML=orders.length?orders.map(order=>`<tr><td><strong>${escape(order.orderNumber||order.id)}</strong></td><td>${escape(order.customerName||order.customerId||'Customer')}</td><td><span class="pill">${escape(order.orderStatus||'New')}</span></td><td>${money.format(Number(order.total||0))}</td></tr>`).join(''):'<tr><td colspan="4"><div class="empty-state"><div class="empty-symbol">▤</div><h3>Your first order starts here</h3><p>Once you record an order, you’ll see its details and progress here.</p><a class="button" href="orders.html">Create an order</a></div></td></tr>';
}
onAuthStateChanged(auth,user=>{if(user)load(user).catch(error=>{console.error('Dashboard failed',error);showError(workspaceError(error,'load dashboard'));set('[data-opportunity-carts]','Order activity is unavailable.');set('[data-opportunity-stock]','Inventory is unavailable.');const body=document.querySelector('[data-recent-orders]');if(body)body.innerHTML='<tr><td colspan="4">Business activity is unavailable. Retry by reloading this page.</td></tr>';});});
