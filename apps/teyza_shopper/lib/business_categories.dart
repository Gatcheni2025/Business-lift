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


/// Shopper-facing discovery groups. Account categories and permissions stay
/// unchanged: this only determines where an already-public listing appears.
class TeyzaDiscoveryCategory {
  final String id, label;
  const TeyzaDiscoveryCategory(this.id, this.label);
}

const teyzaDiscoveryCategories = <TeyzaDiscoveryCategory>[
  TeyzaDiscoveryCategory('all', 'All businesses'),
  TeyzaDiscoveryCategory('spaza', 'Spaza & groceries'),
  TeyzaDiscoveryCategory('food', 'Fast food & food'),
  TeyzaDiscoveryCategory('retail', 'Shops & retail'),
  TeyzaDiscoveryCategory('beauty', 'Beauty & wellness'),
  TeyzaDiscoveryCategory('home', 'Home & repairs'),
  TeyzaDiscoveryCategory('auto', 'Motor & car care'),
  TeyzaDiscoveryCategory('services', 'Other services'),
  TeyzaDiscoveryCategory('wholesale', 'Wholesalers'),
];

String teyzaDiscoveryCategoryLabel(String id) {
  for (final category in teyzaDiscoveryCategories) {
    if (category.id == id) return category.label;
  }
  return 'Other services';
}

/// Prefer a seller's registered public business type, then map providers'
/// standard place types. Older approved listings have no businessType; a
/// conservative name match can improve their category without excluding them.
String teyzaDiscoveryGroup({
  required String shopCategory,
  String businessType = '',
  List<String> placeTypes = const [],
  String name = '',
}) {
  const registered = <String, String>{
    'spaza_shop': 'spaza', 'tuck_shop': 'spaza',
    'mini_market': 'spaza', 'general_dealer': 'spaza',
    'small_grocery': 'spaza', 'fruit_vegetables': 'spaza',
    'butchery': 'food', 'bakery': 'food', 'takeaway': 'food',
    'clothing_shop': 'retail', 'hardware_store': 'retail',
    'cellphone_shop': 'retail', 'furniture_store': 'retail',
    'salon': 'beauty', 'barber': 'beauty', 'beauty_nails': 'beauty',
    'tailoring': 'home', 'laundry': 'home', 'upholstery': 'home',
    'cleaning': 'home', 'plumber': 'home', 'electrician': 'home',
    'building': 'home', 'phone_repair': 'home',
    'car_wash': 'auto', 'mechanic': 'auto', 'tyre_repair': 'auto',
    'printing': 'services', 'photography': 'services',
    'other_services': 'services', 'wholesale_supplier': 'wholesale',
  };
  final publishedType = registered[businessType.trim().toLowerCase()];
  if (publishedType != null) return publishedType;
  if (shopCategory == 'wholesale') return 'wholesale';

  final types = placeTypes.map((type) => type.toLowerCase()).toSet();
  final title = name.toLowerCase();
  bool isType(Set<String> values) => types.any(values.contains);

  if (isType(const {
        'fast_food_restaurant', 'fast_food', 'restaurant', 'meal_takeaway',
        'meal_delivery', 'cafe', 'coffee_shop', 'bakery', 'food',
        'food_store', 'butcher_shop',
      }) ||
      RegExp(r'\b(takeaway|take.?away|fast.?food|restaurant|pizza|burger|'
              r'chicken|shisanyama|grill|kitchen|bakery|butchery|cafe)\b')
          .hasMatch(title)) return 'food';
  if (isType(const {
        'beauty_salon', 'hair_care', 'hair_salon', 'barber_shop',
        'nail_salon', 'spa', 'beauty_shop',
      }) ||
      RegExp(r'\b(salon|barber|beauty|nails?|hairdress|spa)\b')
          .hasMatch(title)) return 'beauty';
  if (isType(const {
        'car_wash', 'car_repair', 'auto_repair', 'automotive_repair',
        'tire_shop', 'tyre_shop', 'car_dealer',
      }) ||
      RegExp(r'\b(car.?wash|mechanic|tyre|tire|motor|auto.?repair)\b')
          .hasMatch(title)) return 'auto';
  if (isType(const {
        'plumber', 'electrician', 'laundry', 'dry_cleaner',
        'cleaning_service', 'home_improvement_store', 'handyman',
        'electronics_repair', 'carpenter',
      }) ||
      RegExp(r'\b(plumb|electrician|laundry|dry.?clean|cleaning|'
              r'upholster|tailor|repair|handyman|carpenter)\b')
          .hasMatch(title)) return 'home';
  if (isType(const {
        'clothing_store', 'hardware_store', 'furniture_store',
        'home_goods_store', 'department_store', 'shopping_mall',
        'store', 'electronics_store', 'mobile_phone_shop',
      }) ||
      RegExp(r'\b(clothing|hardware|furniture|fashion|boutique|'
              r'shop|retail|mall)\b').hasMatch(title)) return 'retail';
  if (isType(const {'convenience_store', 'grocery_store', 'supermarket'}) ||
      RegExp(r'\b(spaza|tuck.?shop|mini.?market|grocer|'
              r'general.?dealer|superette)\b').hasMatch(title)) {
    return 'spaza';
  }
  return shopCategory == 'spaza' ? 'spaza' : 'services';
}
