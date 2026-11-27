'use strict';
// Sellers without weighing scales price each consistent, clearly described
// physical portion. These labels NEVER assert grams/kilograms or conversions.
const labels=Object.freeze({
 original_pack:'Original pack / labelled unit',
 piece:'Each piece',
 small_bag:'Small bag (seller portion)',
 medium_bag:'Medium bag (seller portion)',
 large_bag:'Large bag (seller portion)',
 cup:'Cup (seller portion)',
 half_cup:'Half cup (seller portion)',
 handful:'Handful (seller portion)',
 bunch:'Bunch',
 bundle:'Bundle',
 scoop:'Scoop (seller portion)',
 slice:'Slice',
 tray:'Tray',
 container:'Container (seller portion)'
});
const allowedCategories=new Set(['Fruit & Veg','Pantry','Bakery','Meat','Dairy & Eggs']);
function valid(category,key){
 return typeof key==='string'&&Object.hasOwn(labels,key)&&
   (key==='original_pack'||allowedCategories.has(category));
}
function unitFor(template,key){
 return key==='original_pack'?template.unit:labels[key];
}
function nameFor(template,key){
 return key==='original_pack'?template.name:
  template.name.split(' · ')[0]+' · '+labels[key];
}
module.exports={labels,allowedCategories,valid,unitFor,nameFor};
