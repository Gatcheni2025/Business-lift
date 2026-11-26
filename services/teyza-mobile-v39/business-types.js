'use strict';
// Subcategories improve discoverability but never replace the three protected
// seller account classes or confer listing, selling, or wholesale privileges.
const categories={
  "spaza": [
    "spaza_shop",
    "tuck_shop",
    "mini_market",
    "general_dealer",
    "small_grocery",
    "fruit_vegetables",
    "butchery",
    "bakery",
    "takeaway",
    "restaurant",
    "cafe",
    "clothing_shop",
    "hardware_store",
    "cellphone_shop",
    "furniture_store",
    "electronics_shop",
    "beauty_products_shop",
    "household_goods_shop",
    "sporting_goods_shop",
    "stationery_shop",
    "agricultural_products_shop",
    "automotive_parts_shop",
    "building_supplies_shop",
    "food_products_shop",
    "other_product_seller"
  ],
  "retail": [
    "manufacturing_food",
    "manufacturing_clothing",
    "manufacturing_furniture",
    "manufacturing_building_materials",
    "manufacturing_metal",
    "manufacturing_packaging",
    "manufacturing_household",
    "manufacturing_other",
    "salon",
    "barber",
    "beauty_nails",
    "tailoring",
    "laundry",
    "upholstery",
    "car_wash",
    "mechanic",
    "tyre_repair",
    "phone_repair",
    "printing",
    "cleaning",
    "plumber",
    "electrician",
    "building",
    "photography",
    "catering",
    "professional_services",
    "financial_services",
    "tech_services",
    "logistics",
    "education_training",
    "health_wellness",
    "agriculture",
    "events",
    "accommodation",
    "other_services"
  ],
  "wholesale": [
    "wholesale_supplier"
  ]
};
const defaults={spaza:'spaza_shop',retail:'other_services',wholesale:'wholesale_supplier'};
function valid(category,type){
 return typeof category==='string'&&typeof type==='string'&&
  (categories[category]||[]).includes(type);
}
function selected(category,type){
 const value=type===undefined||type===null?defaults[category]:type;
 if(!valid(category,value)){
  const err=new Error('Select a valid business type for this seller category.');
  err.status=422;throw err;
 }
 return value;
}
module.exports={categories,defaults,valid,selected};
