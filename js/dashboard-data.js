import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";
import {getBusinessContext,hydrateBusiness,workspaceError} from "./business-context.js";

const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:0});
const set=(selector,value)=>document.querySelectorAll(selector).forEach(node=>node.textContent=value);
function showError(message){const node=document.querySelector('[data-dashboard-status]');if(!node)return;node.hidden=false;node.textContent=message;node.classList.add('error');}

async function load(user){
  const context=await getBusinessContext(user);hydrateBusiness(context,user);
  set('[data-greeting-name]',context.userData.firstName || user.displayName?.split(' ')[0] || 'business owner');
  set('[data-hero-line]',context.business?.profileComplete?'Here’s what’s happening in your business. Pick up where you left off.':'Let’s get your business ready. Complete your profile, then add your first product.');
  const profileStep=document.querySelector('[data-setup-profile]');if(profileStep)profileStep.dataset.complete=String(!!context.business?.profileComplete);

  const productResult=await apiFetch('api/products.php');
  const products=Array.isArray(productResult.products)?productResult.products:[];
  set('[data-stat-products]',products.length);
  const productStep=document.querySelector('[data-setup-product]');if(productStep)productStep.dataset.complete=String(products.length>0);
  const low=products.filter(product=>Number(product.stock||0)<=5).length;
  set('[data-opportunity-stock]',low?`${low} products have low or no stock.`:products.length?'Stock levels look good.':'Add your first product to start tracking stock.');

  // Order storage is being moved to the PHP backend next. Do not query Firestore.
  set('[data-stat-revenue]',money.format(0));set('[data-stat-orders]','0');set('[data-stat-customers]','0');
  set('[data-opportunity-carts]','No PHP orders recorded yet.');
  const body=document.querySelector('[data-recent-orders]');
  if(body)body.innerHTML='<tr><td colspan="4"><div class="empty-state"><div class="empty-symbol">▤</div><h3>Your first order starts here</h3><p>Orders will appear here as the PHP order flow is connected.</p><a class="button" href="orders.html">Open orders</a></div></td></tr>';
}

onAuthStateChanged(auth,user=>{
  if(user)load(user).catch(error=>{console.error('Dashboard failed',error);showError(workspaceError(error));set('[data-opportunity-carts]','Order activity is unavailable.');set('[data-opportunity-stock]','Inventory is unavailable.');});
});
