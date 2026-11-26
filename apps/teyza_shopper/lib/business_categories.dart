/// Public business type choices. These labels never change the server's
/// three seller account classes, approval rules or selling permissions.
class TeyzaBusinessType {
  final String id, label, accountCategory, discoveryGroup, discoverySubcategory;
  const TeyzaBusinessType(this.id, this.label, this.accountCategory,
      this.discoveryGroup, this.discoverySubcategory);
}

const teyzaBusinessTypes = <TeyzaBusinessType>[
  // Everyday neighbourhood shops.
  TeyzaBusinessType('spaza_shop','Spaza shop','spaza','spaza','spaza_shop'),
  TeyzaBusinessType('tuck_shop','Tuck shop','spaza','spaza','spaza_shop'),
  TeyzaBusinessType('mini_market','Mini market','spaza','spaza','grocery'),
  TeyzaBusinessType('general_dealer','General dealer','spaza','spaza','general'),
  TeyzaBusinessType('small_grocery','Small grocery store','spaza','spaza','grocery'),
  TeyzaBusinessType('fruit_vegetables','Fruit & vegetable shop','spaza','spaza','fresh'),
  // Food businesses.
  TeyzaBusinessType('butchery','Butchery','spaza','food','bakery_butchery'),
  TeyzaBusinessType('bakery','Bakery','spaza','food','bakery_butchery'),
  TeyzaBusinessType('takeaway','Takeaway / food stall','spaza','food','fast_food'),
  TeyzaBusinessType('restaurant','Restaurant','spaza','food','restaurants'),
  TeyzaBusinessType('cafe','Café / coffee shop','spaza','food','cafes'),
  // Product sellers retain the existing physical-product seller account class.
  TeyzaBusinessType('clothing_shop','Clothing shop','spaza','retail','fashion'),
  TeyzaBusinessType('hardware_store','Hardware shop','spaza','retail','building_goods'),
  TeyzaBusinessType('cellphone_shop','Cellphone & accessories shop','spaza','retail','electronics'),
  TeyzaBusinessType('furniture_store','Furniture shop','spaza','retail','household'),
  TeyzaBusinessType('electronics_shop','Electronics & appliances','spaza','retail','electronics'),
  TeyzaBusinessType('beauty_products_shop','Beauty & personal care products','spaza','retail','beauty_goods'),
  TeyzaBusinessType('household_goods_shop','Household goods & décor','spaza','retail','household'),
  TeyzaBusinessType('sporting_goods_shop','Sports & outdoor goods','spaza','retail','sport'),
  TeyzaBusinessType('stationery_shop','Books, stationery & school supplies','spaza','retail','stationery'),
  TeyzaBusinessType('agricultural_products_shop','Agricultural supplies','spaza','retail','agricultural_goods'),
  TeyzaBusinessType('automotive_parts_shop','Motor parts & accessories','spaza','retail','auto_goods'),
  TeyzaBusinessType('building_supplies_shop','Building materials & supplies','spaza','retail','building_goods'),
  TeyzaBusinessType('food_products_shop','Speciality food & beverages','spaza','retail','food_goods'),
  TeyzaBusinessType('other_product_seller','Other product seller','spaza','retail','other_goods'),
  // Manufacturers use the existing business listing/enquiry account class.
  TeyzaBusinessType('manufacturing_food','Food & beverage manufacturer','retail','manufacturing','manufacturing_food'),
  TeyzaBusinessType('manufacturing_clothing','Clothing & textile manufacturer','retail','manufacturing','manufacturing_clothing'),
  TeyzaBusinessType('manufacturing_furniture','Furniture & wood manufacturer','retail','manufacturing','manufacturing_furniture'),
  TeyzaBusinessType('manufacturing_building_materials','Building materials manufacturer','retail','manufacturing','manufacturing_building_materials'),
  TeyzaBusinessType('manufacturing_metal','Metal, machinery & fabrication','retail','manufacturing','manufacturing_metal'),
  TeyzaBusinessType('manufacturing_packaging','Packaging & printing manufacturer','retail','manufacturing','manufacturing_packaging'),
  TeyzaBusinessType('manufacturing_household','Household & personal care manufacturer','retail','manufacturing','manufacturing_household'),
  TeyzaBusinessType('manufacturing_other','Other manufacturer','retail','manufacturing','manufacturing_other'),
  // Services, independent professionals and other businesses.
  TeyzaBusinessType('salon','Hair salon','retail','beauty','hair'),
  TeyzaBusinessType('barber','Barbershop','retail','beauty','hair'),
  TeyzaBusinessType('beauty_nails','Beauty & nail studio','retail','beauty','beauty_treatments'),
  TeyzaBusinessType('tailoring','Tailor / clothing alterations','retail','home','tailoring'),
  TeyzaBusinessType('laundry','Laundry & dry cleaning','retail','home','cleaning'),
  TeyzaBusinessType('upholstery','Upholstery business','retail','home','repairs'),
  TeyzaBusinessType('car_wash','Car wash','retail','auto','car_wash'),
  TeyzaBusinessType('mechanic','Vehicle repair / mechanic','retail','auto','vehicle_repair'),
  TeyzaBusinessType('tyre_repair','Tyre repair','retail','auto','tyres'),
  TeyzaBusinessType('phone_repair','Phone & electronics repair','retail','home','electronics_repair'),
  TeyzaBusinessType('printing','Printing / internet café','retail','professional','printing'),
  TeyzaBusinessType('cleaning','Cleaning services','retail','home','cleaning'),
  TeyzaBusinessType('plumber','Plumber','retail','home','trades'),
  TeyzaBusinessType('electrician','Electrician','retail','home','trades'),
  TeyzaBusinessType('building','Building & home maintenance','retail','home','trades'),
  TeyzaBusinessType('photography','Photography & events','retail','events','photography'),
  TeyzaBusinessType('catering','Catering services','retail','food','catering'),
  TeyzaBusinessType('professional_services','Professional & consulting services','retail','professional','consulting'),
  TeyzaBusinessType('financial_services','Accounting & financial services','retail','professional','finance'),
  TeyzaBusinessType('tech_services','IT & digital services','retail','professional','technology'),
  TeyzaBusinessType('logistics','Transport, courier & logistics','retail','logistics','transport'),
  TeyzaBusinessType('education_training','Education & training','retail','services','education'),
  TeyzaBusinessType('health_wellness','Health & wellness services','retail','services','health'),
  TeyzaBusinessType('agriculture','Farming & agricultural businesses','retail','services','agriculture'),
  TeyzaBusinessType('events','Events & entertainment','retail','events','event_services'),
  TeyzaBusinessType('accommodation','Accommodation & tourism','retail','services','tourism'),
  TeyzaBusinessType('other_services','Other small business / service','retail','services','other_services'),
  TeyzaBusinessType('wholesale_supplier','Wholesaler / bulk supplier','wholesale','wholesale','wholesale_supplier'),
];

TeyzaBusinessType? teyzaTypeFor(String? id) {
  for (final type in teyzaBusinessTypes) {
    if (type.id == id) return type;
  }
  return null;
}
String teyzaDefaultBusinessType(String category) => switch (category) {
  'spaza' => 'spaza_shop',
  'wholesale' => 'wholesale_supplier',
  _ => 'other_services',
};

/// Two destinations share one public taxonomy. Each category has a stable
/// identifier and optional product/industry/service specialities.
class TeyzaDiscoveryCategory {
  final String id, label;
  final List<TeyzaDiscoveryCategory> children;
  const TeyzaDiscoveryCategory(this.id, this.label, [this.children = const []]);
}

const teyzaDiscoveryCategories = <TeyzaDiscoveryCategory>[
  TeyzaDiscoveryCategory('all','All businesses'),
  TeyzaDiscoveryCategory('spaza','Spaza & grocery shops',[
    TeyzaDiscoveryCategory('spaza_shop','Spaza & tuck shops'),
    TeyzaDiscoveryCategory('grocery','Groceries & mini markets'),
    TeyzaDiscoveryCategory('general','General dealers'),
    TeyzaDiscoveryCategory('fresh','Fresh produce'),
  ]),
  TeyzaDiscoveryCategory('manufacturing','Manufacturers',[
    TeyzaDiscoveryCategory('manufacturing_food','Food & beverages'),
    TeyzaDiscoveryCategory('manufacturing_clothing','Clothing & textiles'),
    TeyzaDiscoveryCategory('manufacturing_furniture','Furniture & wood'),
    TeyzaDiscoveryCategory('manufacturing_building_materials','Building materials'),
    TeyzaDiscoveryCategory('manufacturing_metal','Metal & machinery'),
    TeyzaDiscoveryCategory('manufacturing_packaging','Packaging & printing'),
    TeyzaDiscoveryCategory('manufacturing_household','Household & personal care'),
    TeyzaDiscoveryCategory('manufacturing_other','Other manufacturing'),
  ]),
  TeyzaDiscoveryCategory('retail','Product sellers',[
    TeyzaDiscoveryCategory('fashion','Fashion & accessories'),
    TeyzaDiscoveryCategory('electronics','Electronics & appliances'),
    TeyzaDiscoveryCategory('household','Furniture, home & living'),
    TeyzaDiscoveryCategory('beauty_goods','Beauty & personal care products'),
    TeyzaDiscoveryCategory('building_goods','Hardware & building supplies'),
    TeyzaDiscoveryCategory('sport','Sports & outdoor'),
    TeyzaDiscoveryCategory('stationery','Books & stationery'),
    TeyzaDiscoveryCategory('agricultural_goods','Agricultural supplies'),
    TeyzaDiscoveryCategory('auto_goods','Motor parts & accessories'),
    TeyzaDiscoveryCategory('food_goods','Speciality food & beverages'),
    TeyzaDiscoveryCategory('other_goods','Other products'),
  ]),
  TeyzaDiscoveryCategory('food','Food & drinks',[
    TeyzaDiscoveryCategory('fast_food','Fast food & takeaways'),
    TeyzaDiscoveryCategory('restaurants','Restaurants'),
    TeyzaDiscoveryCategory('cafes','Cafés & coffee shops'),
    TeyzaDiscoveryCategory('bakery_butchery','Bakeries & butcheries'),
    TeyzaDiscoveryCategory('catering','Catering'),
  ]),
  TeyzaDiscoveryCategory('beauty','Beauty & wellness',[
    TeyzaDiscoveryCategory('hair','Salons & barbers'),
    TeyzaDiscoveryCategory('beauty_treatments','Beauty, nails & spa'),
  ]),
  TeyzaDiscoveryCategory('home','Home & repair services',[
    TeyzaDiscoveryCategory('trades','Construction, plumbing & electrical'),
    TeyzaDiscoveryCategory('cleaning','Cleaning & laundry'),
    TeyzaDiscoveryCategory('repairs','Furniture & general repairs'),
    TeyzaDiscoveryCategory('tailoring','Tailoring'),
    TeyzaDiscoveryCategory('electronics_repair','Phone & electronics repairs'),
  ]),
  TeyzaDiscoveryCategory('auto','Motor & car care',[
    TeyzaDiscoveryCategory('vehicle_repair','Mechanics & vehicle repair'),
    TeyzaDiscoveryCategory('car_wash','Car wash & detailing'),
    TeyzaDiscoveryCategory('tyres','Tyres & fitment'),
  ]),
  TeyzaDiscoveryCategory('professional','Professional & business services',[
    TeyzaDiscoveryCategory('consulting','Consulting & professional services'),
    TeyzaDiscoveryCategory('finance','Accounting & finance'),
    TeyzaDiscoveryCategory('technology','IT & digital services'),
    TeyzaDiscoveryCategory('printing','Printing & internet cafés'),
  ]),
  TeyzaDiscoveryCategory('logistics','Transport & logistics',[
    TeyzaDiscoveryCategory('transport','Transport, delivery & couriers'),
  ]),
  TeyzaDiscoveryCategory('events','Events & entertainment',[
    TeyzaDiscoveryCategory('photography','Photography & media'),
    TeyzaDiscoveryCategory('event_services','Events & entertainment'),
  ]),
  TeyzaDiscoveryCategory('services','Other businesses & services',[
    TeyzaDiscoveryCategory('education','Education & training'),
    TeyzaDiscoveryCategory('health','Health & wellness'),
    TeyzaDiscoveryCategory('agriculture','Farming & agriculture'),
    TeyzaDiscoveryCategory('tourism','Accommodation & tourism'),
    TeyzaDiscoveryCategory('other_services','Other services'),
  ]),
  TeyzaDiscoveryCategory('wholesale','Wholesalers & distributors',[
    TeyzaDiscoveryCategory('wholesale_supplier','Wholesale & bulk supply'),
  ]),
];

TeyzaDiscoveryCategory? teyzaDiscoveryCategoryFor(String id) {
  for (final category in teyzaDiscoveryCategories) {
    if (category.id == id) return category;
    for (final child in category.children) {
      if (child.id == id) return child;
    }
  }
  return null;
}
String teyzaDiscoveryCategoryLabel(String id) =>
    teyzaDiscoveryCategoryFor(id)?.label ?? 'Other businesses & services';

/// Use an explicit, registered business type first. Older generic listings
/// may use trusted place types or a conservative name match. Unclassified
/// businesses remain visible in Other; this does not determine permissions.
(String, String) teyzaDiscoveryClassification({
  required String shopCategory,
  String businessType = '',
  List<String> placeTypes = const [],
  String name = '',
}) {
  if (shopCategory == 'wholesale') return ('wholesale','wholesale_supplier');
  final registered = teyzaTypeFor(businessType.trim().toLowerCase());
  if (registered != null && registered.id != 'other_services') {
    return (registered.discoveryGroup, registered.discoverySubcategory);
  }
  final types = placeTypes.map((type) => type.toLowerCase()).toSet();
  final title = name.toLowerCase();
  bool type(Set<String> values) => types.any(values.contains);
  bool named(String pattern) => RegExp(pattern).hasMatch(title);

  if (type(const {'manufacturer','factory'}) ||
      named(r'\b(manufactur\w*|factory|fabricat\w*|industrial production)\b')) {
    if (named(r'\b(food|beverage|drink|dairy)\b')) return ('manufacturing','manufacturing_food');
    if (named(r'\b(clothing|textile|garment|apparel)\b')) return ('manufacturing','manufacturing_clothing');
    if (named(r'\b(furniture|wood|timber)\b')) return ('manufacturing','manufacturing_furniture');
    if (named(r'\b(concrete|brick|cement|building materials)\b')) return ('manufacturing','manufacturing_building_materials');
    if (named(r'\b(metal|steel|machinery|fabricat\w*)\b')) return ('manufacturing','manufacturing_metal');
    if (named(r'\b(packaging|carton|printing)\b')) return ('manufacturing','manufacturing_packaging');
    if (named(r'\b(cleaning|cosmetic\w*|household|soap)\b')) return ('manufacturing','manufacturing_household');
    return ('manufacturing','manufacturing_other');
  }
  // A spaza named "... Shop" must not be captured by generic retail.
  if (named(r'\b(spaza|tuck.?shop|corner.?shop|kiosk)\b')) return ('spaza','spaza_shop');
  if (type(const {'convenience_store','grocery_store','supermarket'}) ||
      named(r'\b(mini.?market|grocer\w*|superette|general.?dealer)\b')) {
    return ('spaza', named(r'general.?dealer') ? 'general' : 'grocery');
  }
  if (type(const {'fast_food_restaurant','fast_food','meal_takeaway','meal_delivery'}) ||
      named(r'\b(take.?away|fast.?food|pizza|burger|chicken|shisanyama|grill)\b')) return ('food','fast_food');
  if (type(const {'restaurant'}) || named(r'\b(restaurant|kitchen)\b')) return ('food','restaurants');
  if (type(const {'cafe','coffee_shop'}) || named(r'\b(cafe|coffee.?shop)\b')) return ('food','cafes');
  if (type(const {'bakery','butcher_shop'}) || named(r'\b(bakery|butchery)\b')) return ('food','bakery_butchery');
  if (named(r'\bcater\w*\b')) return ('food','catering');
  if (type(const {'hair_care','hair_salon','barber_shop'}) || named(r'\b(salon|barber|hairdress\w*)\b')) return ('beauty','hair');
  if (type(const {'beauty_salon','nail_salon','spa'}) || named(r'\b(beauty|nails?|spa)\b')) return ('beauty','beauty_treatments');
  if (type(const {'car_wash'}) || named(r'\bcar.?wash\b')) return ('auto','car_wash');
  if (type(const {'tire_shop','tyre_shop'}) || named(r'\b(tyre|tire)\b')) return ('auto','tyres');
  if (type(const {'car_repair','auto_repair','automotive_repair'}) || named(r'\b(mechanic|auto.?repair|vehicle.?repair)\b')) return ('auto','vehicle_repair');
  if (type(const {'plumber','electrician','handyman','carpenter'}) || named(r'\b(plumb\w*|electrician|handyman|carpent\w*|construction|builder)\b')) return ('home','trades');
  if (type(const {'laundry','dry_cleaner','cleaning_service'}) || named(r'\b(laundry|dry.?clean\w*|cleaning)\b')) return ('home','cleaning');
  if (named(r'\b(tailor\w*|alterations)\b')) return ('home','tailoring');
  if (type(const {'electronics_repair'}) || named(r'\b(phone.?repair|electronics.?repair)\b')) return ('home','electronics_repair');
  if (named(r'\b(upholster\w*|repair\w*)\b')) return ('home','repairs');
  if (type(const {'clothing_store','shoe_store'}) || named(r'\b(clothing|fashion|boutique|apparel|shoes)\b')) return ('retail','fashion');
  if (type(const {'electronics_store','mobile_phone_shop'}) || named(r'\b(electronics|appliances|cellphone)\b')) return ('retail','electronics');
  if (type(const {'hardware_store','home_improvement_store'}) || named(r'\b(hardware|building supplies)\b')) return ('retail','building_goods');
  if (type(const {'furniture_store','home_goods_store'}) || named(r'\b(furniture|homeware|decor)\b')) return ('retail','household');
  if (type(const {'beauty_shop','cosmetics_store'}) || named(r'\b(cosmetic\w*|beauty products)\b')) return ('retail','beauty_goods');
  if (type(const {'sporting_goods_store'}) || named(r'\b(sporting goods|outdoor supplies)\b')) return ('retail','sport');
  if (type(const {'book_store'}) || named(r'\b(stationery|bookstore|school supplies)\b')) return ('retail','stationery');
  if (type(const {'auto_parts_store'}) || named(r'\b(motor spares|auto parts|car parts)\b')) return ('retail','auto_goods');
  if (named(r'\b(agricultural supplies|farm supplies)\b')) return ('retail','agricultural_goods');
  if (type(const {'food_store'}) || named(r'\b(speciality foods|beverage shop)\b')) return ('retail','food_goods');
  if (type(const {'accounting','insurance_agency','bank'}) || named(r'\b(accountant|accounting|bookkeep\w*|financial services)\b')) return ('professional','finance');
  if (named(r'\b(software|it services|digital agency|computer services)\b')) return ('professional','technology');
  if (named(r'\b(printing|internet.?cafe)\b')) return ('professional','printing');
  if (type(const {'lawyer','real_estate_agency','consultant'}) || named(r'\b(consult\w*|attorney|lawyer|estate agent)\b')) return ('professional','consulting');
  if (type(const {'courier_service','moving_company'}) || named(r'\b(courier|logistics|transport|delivery services)\b')) return ('logistics','transport');
  if (type(const {'photographer'}) || named(r'\b(photograph\w*|videograph\w*)\b')) return ('events','photography');
  if (type(const {'event_venue'}) || named(r'\b(events?|entertainment)\b')) return ('events','event_services');
  if (type(const {'school','training_centre','university'}) || named(r'\b(training|tutor\w*|education)\b')) return ('services','education');
  if (type(const {'doctor','dentist','physiotherapist','medical_clinic','gym'}) || named(r'\b(clinic|wellness|fitness|health services)\b')) return ('services','health');
  if (type(const {'farm'}) || named(r'\b(farm|farming|agriculture)\b')) return ('services','agriculture');
  if (type(const {'lodging','hotel','guest_house'}) || named(r'\b(guesthouse|guest house|accommodation|tourism)\b')) return ('services','tourism');
  if (type(const {'shopping_mall','department_store','store'}) || named(r'\b(shop|retail|mall|trading)\b')) {
    return shopCategory == 'spaza' ? ('spaza','general') : ('retail','other_goods');
  }
  return shopCategory == 'spaza'
      ? ('spaza','general') : ('services','other_services');
}

String teyzaDiscoveryGroup({
  required String shopCategory,
  String businessType = '',
  List<String> placeTypes = const [],
  String name = '',
}) => teyzaDiscoveryClassification(
  shopCategory: shopCategory, businessType: businessType,
  placeTypes: placeTypes, name: name).$1;
