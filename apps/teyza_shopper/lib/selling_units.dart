import 'product_catalogue.dart';

/// Portion names are descriptive, not measurements of weight or volume.
class TeyzaSellingUnit{
 final String id,label;
 const TeyzaSellingUnit(this.id,this.label);
}
const teyzaSellingUnits=<TeyzaSellingUnit>[
 TeyzaSellingUnit('original_pack','Original pack / labelled size'),
 TeyzaSellingUnit('piece','Each piece'),
 TeyzaSellingUnit('small_bag','Small bag (seller portion)'),
 TeyzaSellingUnit('medium_bag','Medium bag (seller portion)'),
 TeyzaSellingUnit('large_bag','Large bag (seller portion)'),
 TeyzaSellingUnit('cup','Cup (seller portion)'),
 TeyzaSellingUnit('half_cup','Half cup (seller portion)'),
 TeyzaSellingUnit('handful','Handful (seller portion)'),
 TeyzaSellingUnit('bunch','Bunch'),
 TeyzaSellingUnit('bundle','Bundle'),
 TeyzaSellingUnit('scoop','Scoop (seller portion)'),
 TeyzaSellingUnit('slice','Slice'),
 TeyzaSellingUnit('tray','Tray'),
 TeyzaSellingUnit('container','Container (seller portion)')
];
const teyzaLooseCategories={'Fruit & Veg','Pantry','Bakery','Meat','Dairy & Eggs'};
bool teyzaAllowsPortion(CatalogueProduct item)=>teyzaLooseCategories.contains(item.category);
String teyzaUnitLabel(String id){
 for(final unit in teyzaSellingUnits){if(unit.id==id)return unit.label;}
 return teyzaSellingUnits.first.label;
}
