import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,getWorkspaceOrders,createWorkspaceOrder,workspaceApi,workspaceError} from "./business-context.js";

const form=document.querySelector("[data-order-form]");
const statusNode=document.querySelector("[data-order-status]");
const tableBody=document.querySelector("[data-orders-table-body]");
const productSelect=form?.elements["productId"];
const cols={
  new:document.querySelector('[data-order-column="new"]'),
  processing:document.querySelector('[data-order-column="processing"]'),
  shipping:document.querySelector('[data-order-column="shipping"]'),
  completed:document.querySelector('[data-order-column="completed"]')
};
const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"});
const stateLabels={new:"Ready for collection",processing:"Collected",shipping:"In transit",completed:"Delivered"};
let user=null,currentOrders=[];

function status(message,tone="error"){
  if(!statusNode)return;
  statusNode.hidden=false;statusNode.textContent=message;statusNode.className="form-status "+tone;
}
function norm(value){
  const v=String(value||"new").toLowerCase();
  return ["processing","shipping","completed"].includes(v)?v:"new";
}
function esc(value){
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function fmtDate(value){
  if(!value)return "";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?"":d.toLocaleString("en-ZA",{dateStyle:"medium",timeStyle:"short"});
}
function deliveryAction(order){
  const state=norm(order.orderStatus);
  if(state==="new")return '<button type="button" class="button button-primary" data-order-advance data-order-id="'+esc(order.id)+'" data-next-status="processing">Mark collected</button>';
  if(state==="processing")return '<button type="button" class="button button-primary" data-order-advance data-order-id="'+esc(order.id)+'" data-next-status="shipping">Mark in transit</button>';
  if(state==="shipping")return '<button type="button" class="button button-primary" data-order-advance data-order-id="'+esc(order.id)+'" data-next-status="completed">Mark delivered</button>';
  return "";
}
function historyHtml(order){
  const history=Array.isArray(order.fulfilment?.history)?order.fulfilment.history:[];
  if(!history.length)return '<small>No delivery updates yet.</small>';
  return '<div class="delivery-history">'+history.slice(-4).map(item=>{
    const state=norm(item.to||item.status);
    return '<small>'+esc(stateLabels[state]||state)+(item.at?' · '+esc(fmtDate(item.at)):'')+'</small>';
  }).join("")+'</div>';
}
function card(order){
  const state=norm(order.orderStatus);
  const fulfilment=order.fulfilment||{};
  const provider=fulfilment.provider||order.deliveryProvider||"Not selected";
  const tracking=fulfilment.trackingNumber||"Not added";
  const destination=fulfilment.destinationAddress||order.deliveryAddress||"Delivery address not added";
  const pickup=fulfilment.pickupAddress||"Verified business collection address";
  return '<article class="delivery-order-card">'+
    '<div><strong>'+esc(order.orderNumber||"Order")+'</strong>'+
    '<span>'+esc(order.customerName||order.customerId||"Customer")+'</span>'+
    '<small>'+money.format(Number(order.total||0))+' · '+esc(String(order.paymentStatus||"pending").toUpperCase())+'</small>'+
    '<small><b>'+esc(stateLabels[state])+'</b></small>'+
    '<small>Provider: '+esc(provider)+'</small>'+
    '<small>Tracking: '+esc(tracking)+'</small>'+
    '<small>From: '+esc(pickup)+'</small>'+
    '<small>To: '+esc(destination)+'</small>'+
    historyHtml(order)+'</div>'+
    '<div>'+deliveryAction(order)+'</div>'+
  '</article>';
}

function render(orders,products){
  currentOrders=orders;
  if(productSelect)productSelect.innerHTML='<option value="">Select product</option>'+products.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' ('+money.format(Number(p.price||0))+')</option>').join("");

  if(tableBody)tableBody.innerHTML=orders.length?orders.map(o=>
    '<tr><td>'+esc(o.orderNumber||"Order")+'</td><td>'+esc(o.customerName||o.customerId||"-")+'</td><td>'+esc(stateLabels[norm(o.orderStatus)])+'</td><td>'+esc(String(o.paymentStatus||"pending").toUpperCase())+'</td><td>'+money.format(Number(o.total||0))+'</td></tr>'
  ).join(""):'<tr><td colspan="5">No orders yet.</td></tr>';

  for(const key of ["new","processing","shipping","completed"]){
    const list=orders.filter(o=>norm(o.orderStatus)===key).slice(0,20);
    if(cols[key])cols[key].innerHTML=list.length?list.map(card).join(""):'<article><strong>No '+esc(stateLabels[key].toLowerCase())+' orders</strong><span>Orders will appear here.</span></article>';
  }
}
async function load(){
  const data=await getWorkspaceOrders(user);
  render(data.orders||[],data.products||[]);
}

form?.addEventListener("submit",async event=>{
  event.preventDefault();
  const button=form.querySelector('[type="submit"]');
  const fd=new FormData(form);
  button.disabled=true;button.textContent="Creating…";
  try{
    await createWorkspaceOrder(user,Object.fromEntries(fd.entries()));
    status("Order created successfully.","success");
    form.reset();
    if(form.elements.quantity)form.elements.quantity.value=1;
    if(form.elements.shipping)form.elements.shipping.value=0;
    if(form.elements.tax)form.elements.tax.value=0;
    await load();
    location.hash="fulfilment";
  }catch(error){
    status(workspaceError(error,"create order"));
  }finally{
    button.disabled=false;button.textContent="Create order";
  }
});

document.querySelector("#fulfilment")?.addEventListener("click",async event=>{
  const button=event.target.closest("[data-order-advance]");
  if(!button||!user)return;
  const orderId=button.dataset.orderId,next=button.dataset.nextStatus;
  const labels={processing:"Marking collected…",shipping:"Marking in transit…",completed:"Marking delivered…"};
  const original=button.textContent;button.disabled=true;button.textContent=labels[next]||"Updating…";
  try{
    await workspaceApi(user,"order-status",{method:"POST",body:JSON.stringify({orderId,orderStatus:next})});
    await load();
  }catch(error){
    alert(workspaceError(error,"update delivery"));
    button.disabled=false;button.textContent=original;
  }
});

onAuthStateChanged(auth,async current=>{
  if(!current)return;
  user=current;
  try{
    const ctx=await getBusinessContext(current);
    document.querySelectorAll("[data-business-id]").forEach(node=>node.textContent=ctx.businessId||"");
    await load();
  }catch(error){
    status(workspaceError(error,"load orders"));
  }
});
