const API_BASE=location.hostname.endsWith(".vercel.app")?"/backend":"api";
const params=new URLSearchParams(location.search);
const seller=params.get("seller")||"";
const productId=params.get("product")||"";

const loading=document.querySelector("[data-checkout-loading]");
const content=document.querySelector("[data-checkout-content]");
const form=document.querySelector("[data-checkout-form]");
const errorNode=document.querySelector("[data-checkout-error]");
const payButton=document.querySelector("[data-pay-button]");

let product=null;
let quantity=1;

const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"});

function showError(message){
  errorNode.hidden=false;
  errorNode.textContent=message;
}

function clearError(){
  errorNode.hidden=true;
  errorNode.textContent="";
}

function updateSummary(){
  if(!product)return;

  const subtotal=Number(product.price||0)*quantity;
  const delivery=Number(product.delivery?.fee||0);
  const total=subtotal+delivery;

  document.querySelector("[data-quantity]").textContent=quantity;
  document.querySelector("[data-subtotal]").textContent=money.format(subtotal);
  document.querySelector("[data-delivery]").textContent=delivery?money.format(delivery):"Free";
  document.querySelector("[data-total]").textContent=money.format(total);
  document.querySelector("[data-pay-label]").textContent=`Pay ${money.format(total)}`;
}

function renderProduct(){
  document.querySelector("[data-product-name]").textContent=product.name;
  document.querySelector("[data-seller-name]").textContent=product.seller?.businessName||"Teyza seller";

  const image=document.querySelector("[data-product-image]");
  if(product.images?.[0]){
    image.style.backgroundImage=`url("${product.images[0]}")`;
  }

  const mode=String(product.delivery?.mode||"courier");
  const provider=product.delivery?.provider||"";
  const deliveryCopy=document.querySelector("[data-delivery-copy]");
  const deliveryFields=document.querySelector("[data-delivery-fields]");
  const deliveryLabel=document.querySelector("[data-delivery-label]");

  if(mode==="pickup"){
    deliveryCopy.textContent="Collection / pickup from the seller.";
    deliveryFields.hidden=true;
    deliveryLabel.textContent="Pickup";
  }else if(mode==="digital"){
    deliveryCopy.textContent="Digital fulfilment. No physical delivery required.";
    deliveryFields.hidden=true;
    deliveryLabel.textContent="Delivery";
  }else{
    deliveryCopy.textContent=provider?`Delivery via ${provider}.`:"Seller delivery applies.";
    deliveryFields.hidden=false;
    deliveryLabel.textContent="Delivery";
  }

  updateSummary();
}

async function loadProduct(){
  if(!seller||!productId){
    loading.innerHTML="<strong>This checkout link is incomplete.</strong>";
    return;
  }

  try{
    const url=new URL(`${API_BASE}/storefront.php`,location.origin);
    url.searchParams.set("action","product");
    url.searchParams.set("seller",seller);
    url.searchParams.set("product",productId);

    const response=await fetch(url,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));

    if(!response.ok||!data.ok){
      throw new Error(data.error||"This product is not available.");
    }

    product=data.product;
    loading.hidden=true;
    content.hidden=false;
    renderProduct();
  }catch(error){
    loading.innerHTML=`<strong>${error.message}</strong>`;
  }
}

document.querySelector("[data-qty-down]").addEventListener("click",()=>{
  quantity=Math.max(1,quantity-1);
  updateSummary();
});

document.querySelector("[data-qty-up]").addEventListener("click",()=>{
  quantity=Math.min(Number(product?.stock||1),quantity+1);
  updateSummary();
});

form.addEventListener("submit",async event=>{
  event.preventDefault();
  clearError();

  if(!product)return;

  const data=new FormData(form);
  const mode=String(product.delivery?.mode||"courier");

  const buyer={
    name:String(data.get("name")||"").trim(),
    email:String(data.get("email")||"").trim(),
    phone:String(data.get("phone")||"").trim(),
    address:String(data.get("address")||"").trim(),
    city:String(data.get("city")||"").trim(),
    province:String(data.get("province")||"").trim(),
    postalCode:String(data.get("postalCode")||"").trim(),
    note:String(data.get("note")||"").trim()
  };

  if(!buyer.name){
    showError("Enter your full name.");
    return;
  }

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email)){
    showError("Enter a valid email address.");
    return;
  }

  if(buyer.phone.replace(/\D/g,"").length<9){
    showError("Enter a valid mobile number.");
    return;
  }

  if(!["pickup","digital"].includes(mode)){
    if(!buyer.address||!buyer.city||!buyer.province){
      showError("Complete your delivery address.");
      return;
    }
  }

  if(!data.get("terms")){
    showError("Confirm your order details before continuing.");
    return;
  }

  payButton.disabled=true;
  payButton.innerHTML='<span class="checkout-spinner"></span><span>Preparing secure payment…</span>';

  try{
    const response=await fetch(`${API_BASE}/paystack-initialize.php`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        seller,
        productId,
        quantity,
        buyer
      })
    });

    const result=await response.json().catch(()=>({}));

    if(!response.ok||!result.ok){
      throw new Error(result.error||"Unable to start payment.");
    }

    location.href=result.authorizationUrl;
  }catch(error){
    showError(error.message);
    payButton.disabled=false;
    payButton.innerHTML='<span data-pay-label>Pay securely</span><span aria-hidden="true">→</span>';
    updateSummary();
  }
});

loadProduct();
