import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,getWorkspaceSummary,hydrateBusiness,workspaceError} from "./business-context.js";
const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:0});
const set=(s,v)=>document.querySelectorAll(s).forEach(n=>n.textContent=v);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const totalOf=o=>Number(o.total??o.totalAmount??o.grandTotal??0)||0;
function showError(message){const n=document.querySelector('[data-dashboard-status]');if(n){n.hidden=false;n.textContent=message;n.classList.add('error');}}
async function load(user){
 const [context,summary]=await Promise.all([getBusinessContext(user),getWorkspaceSummary(user)]); hydrateBusiness(context,user);
 const business=summary.business||context.business||{}; const orders=summary.orders||[]; const products=summary.products||[];
 set('[data-greeting-name]',summary.firstName||context.userData?.firstName||user.displayName?.split(' ')[0]||'seller');
 set('[data-hero-line]',business.profileComplete?'Here’s what is happening across your Teyza workspace.':'Start by adding what you sell, then connect the channels you want to reach.');
 const profile=document.querySelector('[data-setup-profile]'); if(profile) profile.dataset.complete=String(!!business.profileComplete);
 set('[data-stat-revenue]',money.format(orders.reduce((s,o)=>s+totalOf(o),0))); set('[data-stat-orders]',orders.length);
 set('[data-stat-customers]',new Set(orders.map(o=>o.customerId||o.customerEmail).filter(Boolean)).size); set('[data-stat-products]',products.length);
 const pending=orders.filter(o=>['new','processing'].includes(String(o.orderStatus||o.status||'new').toLowerCase())).length;
 set('[data-opportunity-carts]',pending?`${pending} orders need your attention.`:'You are all caught up.');
 const low=products.filter(p=>Number(p.stock||0)<=5).length; set('[data-opportunity-stock]',low?`${low} products have low or no stock.`:products.length?'Stock levels look good.':'Add your first product to start selling.');
 const productStep=document.querySelector('[data-setup-product]'); if(productStep) productStep.dataset.complete=String(products.length>0);
 const body=document.querySelector('[data-recent-orders]'); if(body) body.innerHTML=orders.length?orders.slice(0,5).map(o=>`<tr><td><strong>${escape(o.orderNumber||o.id||'Order')}</strong></td><td>${escape(o.customerName||'Customer')}</td><td><span class="pill">${escape(o.orderStatus||o.status||'New')}</span></td><td>${money.format(totalOf(o))}</td></tr>`).join(''):'<tr><td colspan="4"><div class="empty-state"><div class="empty-symbol">▤</div><h3>Your first Teyza order will appear here</h3><p>Add a product and start selling to begin.</p></div></td></tr>';
}
onAuthStateChanged(auth,user=>{if(user)load(user).catch(e=>{console.error(e);showError(workspaceError(e));});});
