const API_BASE=location.hostname.endsWith(".vercel.app")?"/backend":"api";
const params=new URLSearchParams(location.search);
const reference=params.get("reference")||params.get("trxref")||"";

const icon=document.querySelector("[data-result-icon]");
const title=document.querySelector("[data-result-title]");
const copy=document.querySelector("[data-result-copy]");
const orderBox=document.querySelector("[data-result-order]");

const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"});

function setState(state,message,detail=""){
  icon.className="payment-result-icon "+state;
  icon.innerHTML=state==="success"?"✓":state==="failed"?"!":'<span class="checkout-spinner"></span>';
  title.textContent=message;
  copy.textContent=detail;
}

async function verify(){
  if(!reference){
    setState("failed","Payment reference missing","Return to Teyza Store and try the checkout again.");
    return;
  }

  try{
    const url=new URL(`${API_BASE}/paystack-verify.php`,location.origin);
    url.searchParams.set("reference",reference);

    const response=await fetch(url,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));

    if(!response.ok||!data.ok){
      throw new Error(data.error||"Payment could not be confirmed.");
    }

    const order=data.order||{};

    if(data.paymentStatus==="paid"){
      setState("success","Payment confirmed","Your order has been sent to the seller for fulfilment.");
    }else if(data.paymentStatus==="pending"){
      setState("pending","Payment is still processing","Teyza has not yet received final confirmation from Paystack. You can refresh this page shortly.");
    }else{
      setState("failed","Payment was not completed","No successful payment was confirmed for this order.");
    }

    orderBox.hidden=false;
    document.querySelector("[data-result-order-number]").textContent=order.orderNumber||"—";
    document.querySelector("[data-result-seller]").textContent=order.sellerName||"Teyza seller";
    document.querySelector("[data-result-total]").textContent=money.format(Number(order.total||0));
    document.querySelector("[data-result-payment]").textContent=String(data.paymentStatus||"pending").toUpperCase();
  }catch(error){
    setState("failed","We could not confirm the payment",error.message);
  }
}

verify();
