// Publicly advertised example prices checked 28 September 2026. They are
// guide prices, not live quotes; the seller chooses the customer-facing fee.
export const methods=[
  {code:"paxi_standard",mode:"courier",name:"PAXI store to store · 7–9 days",provider:"PAXI",guide:59.95,detail:"Standard bag up to 5 kg; customer collects at a PAXI point.",source:"https://www.paxi.co.za/paxi-for-you"},
  {code:"paxi_express",mode:"courier",name:"PAXI store to store · 3–5 days",provider:"PAXI",guide:109.95,detail:"Standard bag up to 5 kg; customer collects at a PAXI point.",source:"https://www.paxi.co.za/paxi-for-you"},
  {code:"postnet_prepaid",mode:"courier",name:"PostNet to PostNet · 2–3 days",provider:"PostNet",guide:99,detail:"Prepaid flyer bag up to 2 kg; customer collects at PostNet.",source:"https://www.postnet.co.za/domestic-postnet2postnet-prepaid"},
  {code:"aramex_store_door",mode:"courier",name:"Aramex store to door",provider:"Aramex",guide:89.99,detail:"Single sleeve dropped at a participating store; extra charges may apply.",source:"https://aramex.co.za/store-to-door/"},
  {code:"courier_quote",mode:"courier",name:"Other door to door courier",provider:"Other courier",guide:null,detail:"Get a quote based on destination, parcel size and weight.",source:"https://thecourierguy.co.za/ship-now/"},
  {code:"own_driver",mode:"own_driver",name:"My own local driver",provider:"Own driver",guide:null,detail:"Set a fee based on your delivery area and costs."},
  {code:"pickup",mode:"pickup",name:"Customer collects from my business",provider:"Customer pickup",guide:0,detail:"Collection takes place at your verified business address."},
  {code:"digital",mode:"digital",name:"Digital product or service",provider:"Digital / service",guide:0,detail:"No physical delivery is required."}
];
export const methodByCode=code=>methods.find(method=>method.code===code)||methods[0];
export function methodFromSaved(data={}){
  if(!data.fulfilmentMode&&!data.serviceCode)return methods[0];
  return methods.find(method=>method.code===data.serviceCode)||methods.find(method=>method.mode===data.fulfilmentMode&&method.provider===data.courierPreference)||
    (data.fulfilmentMode==="courier"?methods[4]:methods.find(method=>method.mode===data.fulfilmentMode))||methods[0];
}
