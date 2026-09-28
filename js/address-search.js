// Photon uses OpenStreetMap data. The public endpoint is suitable for modest traffic;
// operators can point this at their own Photon instance as usage grows.
const endpoint=(globalThis.TEYZA_GEOCODER_ENDPOINT||"https://photon.komoot.io").replace(/\/$/,"");
const countryCodes={"South Africa":"ZA",Namibia:"NA",Botswana:"BW",Zimbabwe:"ZW"};

export function placeFromFeature(feature){
  const p=feature?.properties||{},coords=feature?.geometry?.coordinates||[];
  const lat=Number(coords[1]),lng=Number(coords[0]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  const street=[p.housenumber,p.street].filter(Boolean).join(" ");
  const parts=[street||p.name,p.district||p.locality,p.city||p.county,p.state,p.postcode,p.country].filter(Boolean);
  const address=[...new Set(parts)].join(", ");
  return address?{address,lat,lng}:null;
}
async function results(path,signal){
  const response=await fetch(endpoint+path,{signal,headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("Address suggestions are unavailable. Try your current location or the map pin.");
  const data=await response.json();
  return (data.features||[]).map(placeFromFeature).filter(Boolean);
}
export function suggestAddresses(query,country="South Africa",signal){
  const params=new URLSearchParams({q:query.trim(),limit:"5",lang:"en"});
  params.set("countrycode",countryCodes[country]||"ZA");
  return results("/api?"+params,signal);
}
export async function addressAt(lat,lng,signal){
  const params=new URLSearchParams({lat:String(lat),lon:String(lng),limit:"1",lang:"en"});
  try{const place=(await results("/reverse?"+params,signal))[0];if(place)return place;}catch(error){if(error.name==="AbortError")throw error;}
  // One explicit reverse lookup is allowed by the public Nominatim service;
  // address autocomplete never calls it.
  const fallback=new URLSearchParams({format:"jsonv2",lat:String(lat),lon:String(lng)});
  const response=await fetch("https://nominatim.openstreetmap.org/reverse?"+fallback,{signal,headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("No address was found at this pin. Search for a nearby street address.");
  const data=await response.json();
  return data.display_name?{address:data.display_name,lat,lng}:null;
}
