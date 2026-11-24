/// Public business-type choices, mapped to the three existing, server-
/// authorised seller account categories. A label never grants extra access.
class TeyzaBusinessType {
  final String id,label,accountCategory;
  const TeyzaBusinessType(this.id,this.label,this.accountCategory);
}
const teyzaBusinessTypes=<TeyzaBusinessType>[
  TeyzaBusinessType('spaza_shop','Spaza shop','spaza'),
  TeyzaBusinessType('tuck_shop','Tuck shop','spaza'),
  TeyzaBusinessType('mini_market','Mini market','spaza'),
  TeyzaBusinessType('general_dealer','General dealer','spaza'),
  TeyzaBusinessType('small_grocery','Small grocery store','spaza'),
  TeyzaBusinessType('fruit_vegetables','Fruit & vegetable shop','spaza'),
  TeyzaBusinessType('butchery','Butchery','spaza'),
  TeyzaBusinessType('bakery','Bakery','spaza'),
  TeyzaBusinessType('takeaway','Takeaway / food stall','spaza'),
  TeyzaBusinessType('clothing_shop','Clothing shop','spaza'),
  TeyzaBusinessType('hardware_store','Hardware shop','spaza'),
  TeyzaBusinessType('cellphone_shop','Cellphone & accessories shop','spaza'),
  TeyzaBusinessType('furniture_store','Furniture shop','spaza'),
  TeyzaBusinessType('salon','Hair salon','retail'),
  TeyzaBusinessType('barber','Barbershop','retail'),
  TeyzaBusinessType('beauty_nails','Beauty & nail studio','retail'),
  TeyzaBusinessType('tailoring','Tailor / clothing alterations','retail'),
  TeyzaBusinessType('laundry','Laundry & dry cleaning','retail'),
  TeyzaBusinessType('upholstery','Upholstery business','retail'),
  TeyzaBusinessType('car_wash','Car wash','retail'),
  TeyzaBusinessType('mechanic','Vehicle repair / mechanic','retail'),
  TeyzaBusinessType('tyre_repair','Tyre repair','retail'),
  TeyzaBusinessType('phone_repair','Phone & electronics repair','retail'),
  TeyzaBusinessType('printing','Printing / internet café','retail'),
  TeyzaBusinessType('cleaning','Cleaning services','retail'),
  TeyzaBusinessType('plumber','Plumber','retail'),
  TeyzaBusinessType('electrician','Electrician','retail'),
  TeyzaBusinessType('building','Building & home maintenance','retail'),
  TeyzaBusinessType('photography','Photography & events','retail'),
  TeyzaBusinessType('other_services','Other small business / service','retail'),
  TeyzaBusinessType('wholesale_supplier','Wholesaler / bulk supplier','wholesale'),
];
TeyzaBusinessType? teyzaTypeFor(String? id){
 for(final type in teyzaBusinessTypes){if(type.id==id)return type;}
 return null;
}
String teyzaDefaultBusinessType(String category)=>switch(category){
  'spaza'=>'spaza_shop','wholesale'=>'wholesale_supplier',_=>'other_services'
};
