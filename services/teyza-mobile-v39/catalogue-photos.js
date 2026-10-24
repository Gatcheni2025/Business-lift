'use strict';
const path=require('node:path');
const sharp=require('sharp');
const catalogue=require('./catalogue');
const cache=new Map();
async function productPhoto(key){
  if(typeof key!=='string'||!Object.hasOwn(catalogue.data.photos,key))return null;
  if(cache.has(key))return cache.get(key);
  const frame=catalogue.data.photos[key],file=path.join(__dirname,'catalogue-images',frame.atlas);
  const meta=await sharp(file).metadata(),width=Math.floor(meta.width/4),height=Math.floor(meta.height/6);
  const bytes=await sharp(file).extract({left:frame.column*width,top:frame.row*height,width,height})
    .resize(384,384,{fit:'contain',background:'#ffffff'}).jpeg({quality:85}).toBuffer();
  cache.set(key,bytes);return bytes;
}
module.exports={productPhoto};
