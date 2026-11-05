'use strict';
const D=require('./domain');
const data=require('./catalogue.json');
const templates=new Map(data.products.map(p=>[p.id,p]));
const prefix='catalog_';
const photoUrl=key=>'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile?cataloguePhoto='+encodeURIComponent(key)+'&v=1';
function templateFor(id){return typeof id==='string'&&id.startsWith(prefix)?templates.get(id.slice(prefix.length)):undefined;}
function selection(rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>30)D.fail(422,'Choose between 1 and 30 products at a time.');
  const seen=new Set();
  return rows.map(row=>{
    const p=templates.get(row?.templateId);
    if(!p||seen.has(p.id))D.fail(422,'Choose valid, different catalogue products.');
    seen.add(p.id);
    if(!Number.isInteger(row.priceCents)||row.priceCents<1||row.priceCents>99999900||
       !Number.isInteger(row.stockQty)||row.stockQty<0||row.stockQty>100000)
      D.fail(422,'Enter your shop price and stock quantity for each product.');
    return {id:prefix+p.id,ownerUid:null,name:p.name,category:p.category,description:'Pack size: '+p.unit,
      priceCents:row.priceCents,stockQty:row.stockQty,status:'draft'};
  });
}
function canonical(uid,entry){
  const p=entry.data,t=templateFor(entry.id);
  if(!t||p.ownerUid!==uid||p.status!=='draft'||p.name!==t.name||p.category!==t.category||
    !Number.isInteger(p.priceCents)||p.priceCents<1||p.priceCents>99999900||
    !Number.isInteger(p.stockQty)||p.stockQty<0||p.stockQty>100000)return null;
  return {id:entry.id,templateId:t.id,name:t.name,category:t.category,unit:t.unit,
    imageUrl:photoUrl(t.photo),priceCents:p.priceCents,stock:p.stockQty};
}
// Seller uploads are created by the server. Never publish a URL supplied in a
// draft; only accept the owner-bound storage record made by product_photo.
function uploadedPhoto(uid,id,record){
  if(record?.ownerUid!==uid||typeof record.objectPath!=='string'||
    !record.objectPath.startsWith(`teyza/product-photos/${uid}/${id}/`))return '';
  try{
    const url=new URL(record.url),marker='/o/';
    if(url.protocol!=='https:'||url.hostname!=='firebasestorage.googleapis.com'||
      !url.pathname.includes(marker)||decodeURIComponent(url.pathname.split(marker)[1])!==record.objectPath||
      url.searchParams.get('alt')!=='media'||!url.searchParams.get('token'))return '';
    return url.href;
  }catch(_){return '';}
}
function custom(uid,entry){
  const p=entry.data;
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(entry.id)||entry.id.startsWith(prefix)||
    p?.ownerUid!==uid||p.status!=='draft'||typeof p.name!=='string'||p.name.trim().length<2||p.name.length>120||
    typeof p.category!=='string'||!p.category.trim()||p.category.length>60||
    (p.description!==undefined&&(typeof p.description!=='string'||p.description.length>500))||
    !Number.isInteger(p.priceCents)||p.priceCents<1||p.priceCents>99999900||
    !Number.isInteger(p.stockQty)||p.stockQty<0||p.stockQty>100000)return null;
  return {id:entry.id,name:p.name.trim(),category:p.category.trim(),description:(p.description||'').trim(),
    priceCents:p.priceCents,stock:p.stockQty};
}
function range(uid,shop,entries,{enabled=true,removedProductId=null,photos=[]}={}){
  const draftMap=new Map(entries.map(p=>[p.id,p.data]));
  const legacyMap=new Map([...shop.legacyProducts||[],...shop.products||[]].filter(p=>p&&typeof p.id==='string'&&
    !p.id.startsWith(prefix)&&p.id!==removedProductId&&!draftMap.has(p.id)).map(p=>[p.id,p]));
  const legacy=[...legacyMap.values()];
  // Keep old pre-draft listings recoverable if access temporarily expires.
  if(!enabled)return {products:[],productHighlights:[],legacyProducts:legacy};
  const photoMap=new Map(photos.map(p=>[p.id,uploadedPhoto(uid,p.id,p.data)]));
  const reviewedPhotos=new Map([...Object.entries(shop.reviewedProductPhotos||{}),
    ...[...(shop.products||[]),...(shop.productHighlights||[])].filter(p=>p.customPhotoApproved===true).map(p=>[p.id,p.imageUrl])]);
  const selected=entries.map(entry=>canonical(uid,entry)||custom(uid,entry)).filter(Boolean).map(p=>{
    const photo=photoMap.get(p.id)||reviewedPhotos.get(p.id);
    return photo?{...p,imageUrl:photo,customPhotoApproved:true}:p;
  }).sort((a,b)=>a.id.localeCompare(b.id));
  // Preserve previously published legacy products without a draft. When a
  // draft exists it is authoritative, including invalid or deleted drafts.
  const all=[...legacy,...selected].filter(p=>p.id!==removedProductId);
  return {products:shop.catalogueEnabled===true||shop.sellingEnabled===true?all:[],
    productHighlights:all.map(({priceCents,stock,...p})=>({...p,inStock:stock>0})),legacyProducts:legacy};
}
module.exports={data,templates,prefix,photoUrl,templateFor,selection,canonical,custom,uploadedPhoto,range};
