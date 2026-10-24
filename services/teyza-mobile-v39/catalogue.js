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
function range(uid,shop,entries,{enabled=true,removedProductId=null}={}){
  const draftMap=new Map(entries.map(p=>[p.id,p.data]));
  const keep=p=>p&&typeof p.id==='string'&&!p.id.startsWith(prefix)&&p.id!==removedProductId;
  const customProducts=(shop.products||[]).filter(keep).map(p=>{
    const draft=draftMap.get(p.id);
    return draft?.ownerUid===uid&&draft.status==='draft'&&Number.isInteger(draft.stockQty)?{...p,stock:draft.stockQty}:p;
  });
  const customHighlightMap=new Map((shop.productHighlights||[]).filter(keep).map(p=>[p.id,p]));
  for(const p of customProducts)if(!customHighlightMap.has(p.id))customHighlightMap.set(p.id,{
    id:p.id,name:p.name,category:p.category||'Other',imageUrl:p.imageUrl||'',inStock:p.stock>0});
  const customHighlights=[...customHighlightMap.values()].map(p=>{
    const draft=draftMap.get(p.id);
    return draft?.ownerUid===uid&&draft.status==='draft'&&Number.isInteger(draft.stockQty)?{...p,inStock:draft.stockQty>0}:p;
  });
  const reviewedPhotos=new Map([...(shop.products||[]),...(shop.productHighlights||[])].filter(p=>p.customPhotoApproved===true).map(p=>[p.id,p.imageUrl]));
  const selected=enabled?entries.map(p=>canonical(uid,p)).filter(Boolean).map(p=>reviewedPhotos.has(p.id)?
    {...p,imageUrl:reviewedPhotos.get(p.id),customPhotoApproved:true}:p).sort((a,b)=>a.id.localeCompare(b.id)):[];
  return {products:shop.catalogueEnabled===true?[...customProducts,...selected]:[],
    productHighlights:[...customHighlights,...selected.map(({priceCents,stock,...p})=>({...p,inStock:stock>0}))]};
}
module.exports={data,templates,prefix,photoUrl,templateFor,selection,canonical,range};
