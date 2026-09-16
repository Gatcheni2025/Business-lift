import {getBusinessContext, workspaceError} from "./business-context.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";

const form = document.querySelector("[data-order-form]");
const statusNode = document.querySelector("[data-order-status]");
const businessIdNode = document.querySelector("[data-business-id]");
const tableBody = document.querySelector("[data-orders-table-body]");
const productSelect = form ? form.elements["productId"] : null;
const newColumn = document.querySelector('[data-order-column="new"]');
const processingColumn = document.querySelector('[data-order-column="processing"]');
const shippingColumn = document.querySelector('[data-order-column="shipping"]');
const money = new Intl.NumberFormat("en-ZA", {style:"currency",currency:"ZAR",maximumFractionDigits:2});
let activeBusinessId = "";
let productsById = new Map();

function showStatus(message, tone="error") {
  if (!statusNode) return;
  statusNode.hidden = false;
  statusNode.textContent = message;
  statusNode.className = "form-status " + tone;
}
function normaliseOrderStatus(status) {
  const value = String(status || "new").toLowerCase();
  return ["processing","shipping","completed","cancelled"].includes(value) ? value : "new";
}
function emptyColumnMessage(label){return `<article><strong>No ${label} orders</strong><span>New orders will appear here.</span></article>`;}
function renderKanban(orders){
  const byStatus={new:[],processing:[],shipping:[]};
  orders.forEach(order=>{const status=normaliseOrderStatus(order.orderStatus);if(byStatus[status])byStatus[status].push(order);});
  const render=list=>list.slice(0,5).map(order=>`<article><strong>${order.orderNumber||order.id}</strong><span>${String(order.paymentStatus||"pending").toUpperCase()} - ${money.format(Number(order.total||0))}</span></article>`).join("");
  if(newColumn)newColumn.innerHTML=render(byStatus.new)||emptyColumnMessage("new");
  if(processingColumn)processingColumn.innerHTML=render(byStatus.processing)||emptyColumnMessage("processing");
  if(shippingColumn)shippingColumn.innerHTML=render(byStatus.shipping)||emptyColumnMessage("shipping");
}
function renderTable(orders){
  if(!tableBody)return;
  if(!orders.length){tableBody.innerHTML='<tr><td colspan="5">No orders yet. Create your first order above.</td></tr>';return;}
  tableBody.innerHTML=orders.map(order=>{const status=normaliseOrderStatus(order.orderStatus);return `<tr><td>${order.orderNumber||order.id}</td><td>${order.customerId||"-"}</td><td>${status.charAt(0).toUpperCase()+status.slice(1)}</td><td>${String(order.paymentStatus||"pending").toUpperCase()}</td><td>${money.format(Number(order.total||0))}</td></tr>`;}).join("");
}
function renderProducts(products){
  productsById=new Map(products.map(product=>[product.id,product]));
  if(!(productSelect instanceof HTMLSelectElement))return;
  const options=['<option value="">Select product</option>'];
  products.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))).forEach(product=>options.push(`<option value="${product.id}">${product.name} (${money.format(Number(product.price||0))}) · ${Number(product.stock||0)} in stock</option>`));
  productSelect.innerHTML=options.join("");
  if(!products.length)showStatus("Add a product to your catalog before creating an order.","info");
}
async function refresh(){
  const [productData,orderData]=await Promise.all([apiFetch("api/products.php"),apiFetch("api/orders.php")]);
  renderProducts(Array.isArray(productData.products)?productData.products:[]);
  const orders=Array.isArray(orderData.orders)?orderData.orders:[];
  renderTable(orders);renderKanban(orders);
}
async function loadBusiness(user){
  const context=await getBusinessContext(user);activeBusinessId=context.businessId;
  if(!activeBusinessId)throw new Error("No business profile yet.");
  if(businessIdNode)businessIdNode.textContent=activeBusinessId;
  await refresh();
}
if(form){
 form.addEventListener("submit",async event=>{
  event.preventDefault();const submitButton=form.querySelector('button[type="submit"]');if(!(submitButton instanceof HTMLButtonElement))return;
  const formData=new FormData(form);const productId=String(formData.get("productId")||"");const customerId=String(formData.get("customerId")||"").trim();const quantity=Number(formData.get("quantity")||0);const shipping=Number(formData.get("shipping")||0);const tax=Number(formData.get("tax")||0);
  if(!productsById.has(productId)){showStatus("Select a valid product before creating an order.");return;}
  if(!customerId){showStatus("Customer ID is required.");return;}
  if(!Number.isInteger(quantity)||quantity<=0){showStatus("Quantity must be a valid whole number.");return;}
  submitButton.disabled=true;submitButton.textContent="Creating...";
  try{
   await apiFetch("api/orders.php",{method:"POST",body:JSON.stringify({productId,customerId,quantity,shipping,tax,paymentStatus:String(formData.get("paymentStatus")||"pending"),orderStatus:String(formData.get("orderStatus")||"new")})});
   showStatus("Order created successfully.","success");form.reset();form.elements["quantity"].value="1";form.elements["shipping"].value="0";form.elements["tax"].value="0";form.elements["paymentStatus"].value="pending";form.elements["orderStatus"].value="new";await refresh();
  }catch(error){console.error("Create order failed",error);showStatus(error.message||"Unable to create order.");}
  finally{submitButton.disabled=false;submitButton.textContent="Create order";}
 });
}
onAuthStateChanged(auth,user=>{if(!user)return;loadBusiness(user).catch(error=>{console.error("Order load failed",error);showStatus(workspaceError(error,"load orders"));if(tableBody)tableBody.innerHTML='<tr><td colspan="5">Unable to load orders.</td></tr>';});});
