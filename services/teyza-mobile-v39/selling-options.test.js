'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const catalogue=require('./catalogue'),types=require('./business-types'),units=require('./selling-units');
test('All 31 business subtypes belong to exactly one existing authorised seller account class',()=>{
 const values=Object.values(types.categories).flat();
 assert.equal(values.length,31);
 assert.equal(new Set(values).size,31);
 for(const [category,ids] of Object.entries(types.categories)){
  for(const type of ids){
   assert(types.valid(category,type));
   for(const other of Object.keys(types.categories).filter(other=>other!==category))
    assert(!types.valid(other,type));
  }
 }
 assert.equal(types.selected('spaza'), 'spaza_shop');
 assert.equal(types.selected('wholesale'), 'wholesale_supplier');
 assert.throws(()=>types.selected('retail','wholesale_supplier'),{status:422});
});
test('Seller-defined portions never claim unmeasured kilograms or gram conversions',()=>{
 const p=catalogue.selection([{templateId:'tomatoes-500-g',priceCents:1500,
  stockQty:8,saleUnit:'small_bag'}])[0];
 assert.equal(p.saleUnit,'small_bag');
 assert.match(p.description,/not a measured weight/);
 const published=catalogue.canonical('seller1',{id:p.id,data:{...p,ownerUid:'seller1'}});
 assert.equal(published.name,'Tomatoes · Small bag (seller portion)');
 assert.equal(published.unit,'Small bag (seller portion)');
 assert.equal(published.priceCents,1500);
 assert.equal(published.stock,8);
 assert(!published.name.includes('500 g'));
 assert(!published.unit.includes('kg'));
 const prepared=catalogue.selection([{templateId:'tomatoes-500-g',priceCents:1500,stockQty:8}])[0];
 const standard=catalogue.canonical('seller1',{id:prepared.id,data:{...prepared,ownerUid:'seller1'}});
 assert.equal(standard.name,'Tomatoes · 500 g');
 assert.equal(standard.unit,'500 g');
});
test('Unauthorized and misleading custom portion data fail closed',()=>{
 assert.throws(()=>catalogue.selection([{templateId:'toilet-paper-4-rolls',
  priceCents:2200,stockQty:3,saleUnit:'small_bag'}]),{status:422});
 assert.throws(()=>catalogue.selection([{templateId:'tomatoes-500-g',
  priceCents:2200,stockQty:3,saleUnit:'500g'}]),{status:422});
 const p=catalogue.selection([{templateId:'tomatoes-500-g',priceCents:1200,
  stockQty:3,saleUnit:'cup'}])[0];
 assert.equal(catalogue.canonical('seller1',{id:p.id,
   data:{...p,ownerUid:'another-seller'}}),null);
 assert.equal(catalogue.canonical('seller1',{id:p.id,
   data:{...p,ownerUid:'seller1',saleUnit:'fake_weight'}}),null);
 assert.equal(units.labels['original_pack'],'Original pack / labelled unit');
});
