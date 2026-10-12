function send(payload){
  try{
    return fetch("product_event.php",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      keepalive:true,
      credentials:"same-origin"
    }).catch(()=>{});
  }catch(_){return Promise.resolve()}
}
export function trackTeyzaProductEvent(businessId,productId,event="view"){
  if(!businessId||!productId)return Promise.resolve();
  return send({businessId,productId,event});
}
window.TeyzaProductAnalytics={track:trackTeyzaProductEvent};
