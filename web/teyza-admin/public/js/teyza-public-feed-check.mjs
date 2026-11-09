// Read the exact anonymous shopper directory entry for one seller UID.
// Never infer live visibility from the private Firestore product count.
import {serviceUrl} from './teyza-app-admin-model.mjs?v=R331-network';

const validUid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{2,128}$/.test(value);
const shopperProduct=product=>product&&typeof product.id==='string'&&product.id.length>0&&
  typeof product.name==='string'&&product.name.trim().length>0&&
  Number.isInteger(product.priceCents)&&product.priceCents>0&&
  Number.isInteger(product.stock)&&product.stock>=0;

export async function inspectSellerPublicFeed(sellerUid,{fetcher=fetch}={}){
  if(!validUid(sellerUid))throw Error('Select a valid seller UID.');
  // A strict prefix sorts just ahead of the requested UID, so only nearby
  // pages are examined. Do not scan or download the whole national directory.
  let after=sellerUid.slice(0,-1);
  for(let page=0;page<8;page++){
    const url=new URL(serviceUrl);
    url.searchParams.set('publicShops','1');
    url.searchParams.set('after',after);
    const response=await fetcher(url.toString(),{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw Error('Live shopper directory is unavailable. Do not treat stored products as published.');
    const body=await response.json();
    if(body?.ok!==true||!Array.isArray(body.entries))
      throw Error('Unexpected live shopper directory response. No publication was confirmed.');
    const seller=body.entries.find(row=>row?.id===sellerUid&&row?.sellerUid===sellerUid);
    if(seller){
      const products=Array.isArray(seller.products)?seller.products:[];
      const highlights=Array.isArray(seller.productHighlights)?seller.productHighlights:[];
      const visible=products.filter(shopperProduct);
      return {found:true,sellerUid,publicProductCount:products.length,
        shopperProductCount:visible.length,inStockProductCount:visible.filter(p=>p.stock>0&&p.inStock!==false).length,
        highlightCount:highlights.length,
        latitude:typeof seller.latitude==='number'?seller.latitude:null,
        longitude:typeof seller.longitude==='number'?seller.longitude:null};
    }
    if(body.next==null||body.next==='')return {found:false,sellerUid,publicProductCount:0,shopperProductCount:0,inStockProductCount:0,highlightCount:0};
    if(typeof body.next!=='string'||body.next<=after)
      throw Error('Live directory cursor did not advance. No publication was confirmed.');
    if(body.next>sellerUid)return {found:false,sellerUid,publicProductCount:0,shopperProductCount:0,inStockProductCount:0,highlightCount:0};
    after=body.next;
  }
  throw Error('Live directory check was incomplete. No publication was confirmed.');
}
