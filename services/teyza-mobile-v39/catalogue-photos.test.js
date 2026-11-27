'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const sharp=require('sharp'),{productPhoto}=require('./catalogue-photos'),catalogue=require('./catalogue');
test('Every catalogue photo renders as a non-blank square JPEG without a network image source',async()=>{
  for(const key of Object.keys(catalogue.data.photos)){
    const bytes=await productPhoto(key),meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
    assert.equal(meta.format,'jpeg');assert.equal(meta.width,384);assert.equal(meta.height,384);
    assert(stats.channels.some(c=>c.stdev>5),key+' must contain a product, not a blank card');
    assert.strictEqual(await productPhoto(key),bytes);
  }
});
test('Photo requests cannot access arbitrary files, URLs or prototype properties',async()=>{
  for(const key of ['__proto__','constructor','../index.js','https://example.test/x',null,['milk']])assert.equal(await productPhoto(key),null);
});
