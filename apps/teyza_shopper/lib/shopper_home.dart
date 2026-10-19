import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'shopper_auth.dart';
import 'shopper_account.dart';
import 'shopper_discovery.dart';

const ink = Color(0xFF182831);
const deep = Color(0xFF16332F);
const green = Color(0xFF079B76);
const aqua = Color(0xFF45B0B1);
const pale = Color(0xFFF1F5F7);
const muted = Color(0xFF6A7C82);
const catalogUrl = 'https://teyza.co.za/api/shopper-catalog.php';
const photos = 'https://teyza.co.za/assets/catalog-real/';
String rand(int cents) => 'R' + (cents / 100).toStringAsFixed(2);

class Product {
  final String id, name, category, picture;
  final int priceCents, stock;
  const Product(this.id, this.name, this.category, this.picture, this.priceCents, this.stock);
  factory Product.fromJson(Map<String, dynamic> x) => Product(
    (x['id'] ?? '').toString(), (x['name'] ?? '').toString(),
    (x['category'] ?? 'Other').toString(), (x['imageUrl'] ?? '').toString(),
    (x['priceCents'] as num?)?.toInt() ?? 0, (x['stock'] as num?)?.toInt() ?? 0);
}
class Shop {
  final String id, name, area, photo, phone;
  final bool pickup, delivery, demo;
  final double? latitude, longitude;
  final List<Product> products;
  const Shop(this.id, this.name, this.area, this.photo, this.phone,
    this.pickup, this.delivery, this.products,
    {this.demo = false, this.latitude, this.longitude});
  factory Shop.fromJson(Map<String, dynamic> x) => Shop(
    (x['id'] ?? '').toString(), (x['name'] ?? '').toString(),
    (x['area'] ?? '').toString(), (x['photoUrl'] ?? '').toString(),
    (x['whatsappPhone'] ?? '').toString(), x['pickupEnabled'] == true,
    x['deliveryEnabled'] == true,
    ((x['products'] as List?) ?? []).whereType<Map>()
      .map((p) => Product.fromJson(Map<String, dynamic>.from(p)))
      .where((p) => p.id.isNotEmpty && p.name.isNotEmpty &&
        p.priceCents > 0 && p.stock > 0).toList(),
    latitude: (x['latitude'] as num?)?.toDouble(),
    longitude: (x['longitude'] as num?)?.toDouble());
}
Future<List<Shop>> fetchCatalogue({http.Client? client}) async {
  final remote = client ?? http.Client();
  try {
    final res = await remote.get(Uri.parse(catalogUrl),
      headers: const {'Accept': 'application/json'}).timeout(const Duration(seconds: 12));
    if (res.statusCode != 200) throw Exception('HTTP ' + res.statusCode.toString());
    final data = jsonDecode(utf8.decode(res.bodyBytes));
    if (data is! Map || data['ok'] != true || data['shops'] is! List) {
      throw const FormatException('Invalid public shop catalogue.');
    }
    return (data['shops'] as List).whereType<Map>()
      .map((s) => Shop.fromJson(Map<String, dynamic>.from(s)))
      .where((s) => s.id.isNotEmpty && s.name.isNotEmpty && s.products.isNotEmpty).toList();
  } finally {
    if (client == null) remote.close();
  }
}
class Area {
  final String label, city;
  final double lat, lng;
  const Area(this.label, this.city, this.lat, this.lng);
}
const areas = <Area>[
  Area('Durban', 'Durban', -29.8587, 31.0218),
  Area('Umlazi', 'Durban', -29.9733, 30.8789),
  Area('KwaMashu', 'Durban', -29.7402, 30.9920),
  Area('Pinetown', 'Durban', -29.8145, 30.8597),
  Area('Umhlanga', 'Durban', -29.7248, 31.0826),
  Area('Johannesburg', 'Johannesburg', -26.2041, 28.0473),
  Area('Soweto', 'Johannesburg', -26.2678, 27.8585),
  Area('Pretoria', 'Pretoria', -25.7479, 28.2293),
  Area('Cape Town', 'Cape Town', -33.9249, 18.4241),
];
double km(double latA, double lngA, double latB, double lngB) {
  const radius = 6371.0;
  final a = (latB - latA) * math.pi / 180;
  final b = (lngB - lngA) * math.pi / 180;
  final v = math.pow(math.sin(a / 2), 2) +
    math.cos(latA * math.pi / 180) * math.cos(latB * math.pi / 180) *
    math.pow(math.sin(b / 2), 2);
  return radius * 2 * math.atan2(math.sqrt(v.toDouble()), math.sqrt(1 - v.toDouble()));
}
Product sample(String key, String title, int cents, String category, String photoKey) =>
  Product('demo-' + key, title, category, photos + photoKey + '.webp', cents, 100);
List<Product> demoProducts(String prefix) => [
  sample(prefix + '-bread', 'Fresh bread 700g', 1899, 'Bakery', 'bread'),
  sample(prefix + '-milk', 'Full cream milk 1L', 2299, 'Dairy', 'milk'),
  sample(prefix + '-eggs', 'Large eggs 6 pack', 2699, 'Dairy', 'eggs'),
  sample(prefix + '-rice', 'White rice 2kg', 4999, 'Pantry', 'rice'),
  sample(prefix + '-maize', 'Maize meal 2.5kg', 4299, 'Pantry', 'maize'),
  sample(prefix + '-sugar', 'White sugar 1kg', 2999, 'Pantry', 'sugar'),
  sample(prefix + '-oil', 'Cooking oil 750ml', 3899, 'Pantry', 'oil'),
  sample(prefix + '-cool', 'Cold drink 2L', 2499, 'Drinks', 'drinks'),
  sample(prefix + '-snack', 'Potato crisps 120g', 1799, 'Snacks', 'snacks'),
  sample(prefix + '-veg', 'Fresh vegetables', 2499, 'Fresh', 'produce'),
  sample(prefix + '-flour', 'Cake flour 1kg', 2299, 'Pantry', 'flour'),
  sample(prefix + '-water', 'Bottled water 1.5L', 1499, 'Drinks', 'water'),
  sample(prefix + '-tea', 'Tea 26 bags', 2999, 'Drinks', 'tea'),
  sample(prefix + '-toilet', 'Toilet paper 2 pack', 2699, 'Household', 'paper'),
];
Shop demoShop(String id, String name, String area, double lat, double lng) =>
  Shop('demo-' + id, name, area, '', '', true, true, demoProducts(id),
    demo: true, latitude: lat, longitude: lng);
final sampleShops = <Shop>[
  demoShop('durban', 'Teyza Sample Spaza', 'Durban CBD · Sample only', -29.8587, 31.0218),
  demoShop('umlazi', 'Township Corner Demo', 'Umlazi · Sample only', -29.9733, 30.8789),
  demoShop('kwamashu', 'Neighbourhood Grocer Demo', 'KwaMashu · Sample only', -29.7402, 30.9920),
  demoShop('pinetown', 'Everyday Essentials Demo', 'Pinetown · Sample only', -29.8145, 30.8597),
  demoShop('umhlanga', 'Local Market Demo', 'Umhlanga · Sample only', -29.7248, 31.0826),
  demoShop('jhb', 'Metro Spaza Demo', 'Johannesburg · Sample only', -26.2041, 28.0473),
  demoShop('soweto', 'Neighbourhood Basket Demo', 'Soweto · Sample only', -26.2678, 27.8585),
  demoShop('pta', 'Corner Market Demo', 'Pretoria · Sample only', -25.7479, 28.2293),
  demoShop('cpt', 'Cape Grocer Demo', 'Cape Town · Sample only', -33.9249, 18.4241),
];

void main() => runApp(const TeyzaShopper());
class TeyzaShopper extends StatelessWidget {
  const TeyzaShopper({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Teyza Shopper', debugShowCheckedModeBanner: false,
    theme: ThemeData(useMaterial3: true, scaffoldBackgroundColor: pale,
      colorScheme: ColorScheme.fromSeed(seedColor: green),
      appBarTheme: const AppBarTheme(backgroundColor: ink, foregroundColor: Colors.white),
      filledButtonTheme: FilledButtonThemeData(style:
        FilledButton.styleFrom(backgroundColor: green, foregroundColor: Colors.white))),
    home: const ShopperHome());
}
class ShopperHome extends StatefulWidget {
  const ShopperHome({super.key});
  @override
  State<ShopperHome> createState() => _ShopperHomeState();
}
class _ShopperHomeState extends State<ShopperHome> {
  Area? area;
  String locationName = 'Choose your area';
  String? locationWarning;
  bool geolocating = false;
  List<Shop> live = [];
  String? catalogueError;
  bool loading = true;
  Shop? selected;
  String search = '';
  String category = 'All';
  int tab = 0;
  final cart = <String, int>{};
  final session = ShopperSession();
  List<OnlineShop> online = [];
  String? onlineWarning;
  bool loadingOnline = false;

  @override
  void initState() {
    super.initState();
    load();
    _restoreSavedArea();
    session.restore();
  }
  @override
  void dispose() { session.dispose(); super.dispose(); }

  Future<void> _restoreSavedArea() async {
    final prefs = await SharedPreferences.getInstance();
    final selectedName=prefs.getString('teyza_selected_area');
    if (!mounted) return;
    if (selectedName != null && selectedName != 'gps') {
      for (final a in areas) {
        if (a.label==selectedName) { chooseArea(a,persist:false); return; }
      }
    }
    if (selectedName=='gps') {
      await _restoreGrantedLocation();
    } else {
      await reloadOnline();
    }
  }

  Future<void> reloadOnline() async {
    if (!mounted) return;
    setState(() { loadingOnline=true; onlineWarning=null; });
    try {
      final places=await findOnlineShops(area:area?.label??'',
        latitude:area?.lat,longitude:area?.lng);
      if (!mounted) return;
      setState(() { online=places;loadingOnline=false; });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        loadingOnline=false;
        onlineWarning='Online shop search is temporarily unavailable. Try again shortly.';
      });
    }
  }


  Future<void> load() async {
    setState(() { loading = true; catalogueError = null; });
    try {
      final next = await fetchCatalogue();
      if (!mounted) return;
      setState(() { live = next; loading = false; });
    } catch (_) {
      if (!mounted) return;
      setState(() { loading = false; catalogueError = 'Live shops are temporarily unavailable.'; });
    }
  }

  Future<void> _restoreGrantedLocation() async {
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.always ||
          permission == LocationPermission.whileInUse) {
        await useLocation(askPermission: false);
      }
    } catch (_) { /* Manual location remains available. */ }
  }

  Future<void> useLocation({bool askPermission = true}) async {
    setState(() { geolocating = true; locationWarning = null; });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const FormatException('Location is turned off. Enable GPS or choose your area.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied && askPermission) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw const FormatException('Location permission not granted. Choose your area manually.');
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 15)));
      // GPS distances are exact for this position. Names are approximate and
      // are never sent to a third-party reverse-geocoding provider.
      Area? nearbyName;
      var shortestKm = 30.0;
      for (final candidate in areas) {
        final d = km(position.latitude, position.longitude,
          candidate.lat, candidate.lng);
        if (d < shortestKm) {
          shortestKm = d;
          nearbyName = candidate;
        }
      }
      var placeName = nearbyName?.label ?? 'My current area';
      var city = nearbyName?.city ?? '';
      // Android's geocoder provides suburb/locality when available.
      // Manual area selection remains available if it is inaccurate.
      try {
        final marks=await placemarkFromCoordinates(position.latitude,position.longitude);
        if (marks.isNotEmpty) {
          final mark=marks.first;
          final neighbourhood=(mark.subLocality?.trim().isNotEmpty==true
            ?mark.subLocality:mark.locality);
          if (neighbourhood != null && neighbourhood.trim().isNotEmpty) {
            placeName=neighbourhood.trim();
          }
          city=mark.locality?.trim()??city;
        }
      } catch (_) { /* Fall back to approximate built-in area names. */ }
      if (!mounted) return;
      setState(() {
        area = Area(placeName, city, position.latitude, position.longitude);
        locationName = placeName;
        selected = null;
        cart.clear();
      });
      final prefs=await SharedPreferences.getInstance();
      await prefs.setString('teyza_selected_area','gps');
      await reloadOnline();
    } catch (e) {
      if (!mounted) return;
      setState(() { locationWarning = e is FormatException ? e.message : 'Could not find your area. Choose it manually.'; });
    } finally {
      if (mounted) setState(() => geolocating = false);
    }
  }

  void chooseArea(Area choice,{bool persist=true}) {
    setState(() {
      area = choice;
      locationName = choice.label;
      locationWarning = null;
      selected = null;
      search = '';
      cart.clear();
      tab = 0;
    });
    if (persist) {
      SharedPreferences.getInstance().then((prefs)=>
        prefs.setString('teyza_selected_area',choice.label));
    }
    reloadOnline();
  }
  Future<void> areaSheet() async {
    await showModalBottomSheet<void>(context: context, showDragHandle: true,
      isScrollControlled: true, builder: (modal) => SafeArea(
        child: Padding(padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Where are you shopping?', style: TextStyle(fontSize: 23,
              fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            const Text('Your area helps us show the nearest participating spaza shops.',
              style: TextStyle(color: muted)),
            const SizedBox(height: 14),
            FilledButton.icon(onPressed: () {
              Navigator.pop(modal);
              useLocation();
            }, icon: const Icon(Icons.my_location), label: const Text('Use my current location')),
            const SizedBox(height: 12),
            const Text('Or choose an area', style: TextStyle(fontWeight: FontWeight.bold)),
            SizedBox(height: 310, child: ListView(children: areas.map((a) =>
              ListTile(leading: const Icon(Icons.location_on_outlined, color: green),
                title: Text(a.label), subtitle: Text(a.city),
                onTap: () { chooseArea(a); Navigator.pop(modal); })).toList()))
          ]))));
  }

  double? distance(Shop shop) {
    if (area == null || shop.latitude == null || shop.longitude == null) return null;
    return km(area!.lat, area!.lng, shop.latitude!, shop.longitude!);
  }
  List<Shop> get nearbyReal {
    final filtered = live.where((shop) {
      if (area == null) return true;
      final d = distance(shop);
      if (d != null) return d <= 25;
      final text = (shop.area + ' ' + shop.name).toLowerCase();
      return text.contains(area!.label.toLowerCase()) ||
          (area!.city.isNotEmpty && text.contains(area!.city.toLowerCase()));
    }).toList();
    filtered.sort((a,b) => (distance(a) ?? double.infinity)
      .compareTo(distance(b) ?? double.infinity));
    return filtered;
  }
  List<Shop> get demos {
    final filtered = sampleShops.where((shop) =>
      area == null || (distance(shop) ?? double.infinity) <= 30).toList();
    filtered.sort((a,b) => (distance(a) ?? double.infinity)
      .compareTo(distance(b) ?? double.infinity));
    return filtered.isEmpty && area == null ? sampleShops.take(4).toList() : filtered;
  }
  List<OnlineShop> get displayedOnline {
    final q=search.toLowerCase().trim();
    final candidates=online.where((s) =>
      q.isEmpty || (s.name+' '+s.area+' '+s.address).toLowerCase().contains(q)).toList();
    if (area!=null) {
      candidates.sort((a,b) {
        double d(OnlineShop s)=>s.lat==null || s.lng==null
          ? double.infinity : km(area!.lat,area!.lng,s.lat!,s.lng!);
        return d(a).compareTo(d(b));
      });
    }
    return candidates;
  }

  Future<void> showOnlineShop(OnlineShop place) async {
    await showModalBottomSheet<void>(
      context:context,isScrollControlled:true,showDragHandle:true,
      builder:(sheet)=>SafeArea(child:Padding(
        padding:const EdgeInsets.all(22),
        child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          const Text('FOUND ONLINE · NOT ON TEYZA',style:TextStyle(
            fontSize:11,color:green,fontWeight:FontWeight.w900,letterSpacing:1.2)),
          const SizedBox(height:10),
          Text(place.name,style:const TextStyle(fontSize:24,fontWeight:FontWeight.w900)),
          const SizedBox(height:5),
          Text(place.address.isEmpty?place.area:place.address,style:const TextStyle(color:muted)),
          const SizedBox(height:14),
          const Text('This business appears in a public online directory. Teyza has not confirmed its current trading status, products, opening times or prices.'),
          const SizedBox(height:15),
          FilledButton.icon(onPressed:() async {
            final uri=Uri.tryParse(place.source);
            if(uri!=null && uri.scheme=='https') await launchUrl(uri,
              mode:LaunchMode.externalApplication);
          },icon:const Icon(Icons.map_outlined),label:const Text('Open source / directions')),
          const SizedBox(height:9),
          OutlinedButton.icon(onPressed:() async {
            final uri=Uri.tryParse(place.claimUrl);
            if(uri!=null && uri.scheme=='https') await launchUrl(uri,
              mode:LaunchMode.externalApplication);
          },icon:const Icon(Icons.store_outlined),label:const Text('Own this shop? Claim it')),
          const SizedBox(height:8),
          if(place.origin=='openstreetmap')
            const Text('Map data © OpenStreetMap contributors (ODbL).',
              textAlign:TextAlign.center,style:TextStyle(color:muted,fontSize:11))
        ]))));
  }

  Widget onlineTile(OnlineShop place)=>Card(color:Colors.white,elevation:0,
    margin:const EdgeInsets.only(bottom:9),
    child:ListTile(onTap:()=>showOnlineShop(place),
      leading:const CircleAvatar(backgroundColor:Color(0xFFE0F4EC),
        child:Icon(Icons.place_outlined,color:green)),
      title:Text(place.name,style:const TextStyle(fontWeight:FontWeight.w800)),
      subtitle:Text((place.address.isNotEmpty?place.address:place.area)+
        '\nOnline listing · Stock not connected',maxLines:3),
      isThreeLine:true,
      trailing:const Icon(Icons.open_in_new,color:green,size:20)));

  List<Shop> get displayShops {
    final real = nearbyReal;
    final examples = demos;
    if (search.isEmpty) return [...real, ...examples];
    final q = search.toLowerCase();
    return [...real,...examples].where((s) =>
      (s.name + ' ' + s.area + ' ' + s.products.map((p) => p.name).join(' '))
        .toLowerCase().contains(q)).toList();
  }
  List<Product> get featured {
    final candidates = [...nearbyReal, ...demos];
    final result = <Product>[];
    final seen = <String>{};
    for (final shop in candidates) {
      for (final p in shop.products) {
        if (seen.add(p.name) && (category == 'All' || p.category == category) &&
            (search.isEmpty || p.name.toLowerCase().contains(search.toLowerCase()))) {
          result.add(p);
          if (result.length >= 18) return result;
        }
      }
    }
    return result;
  }
  List<Product> get basketItems => selected?.products.where((p) =>
    (cart[p.id] ?? 0)>0).toList() ?? [];
  int get count => cart.values.fold(0, (a,b)=>a+b);
  int get total => basketItems.fold(0,(v,p)=>v+p.priceCents*(cart[p.id]??0));
  void quantity(Product p, int delta) => setState(() {
    final next = (cart[p.id]??0)+delta;
    if (next<=0) cart.remove(p.id);
    else if (next<=p.stock) cart[p.id]=next;
  });
  void openShop(Shop shop) => setState(() {
    if (selected?.id != shop.id) cart.clear();
    selected = shop;
    search = '';
    category = 'All';
    tab = 1;
  });

  Widget photo(String url,{double size=92, IconData icon=Icons.storefront_outlined}) =>
    Container(width:size,height:size,clipBehavior:Clip.antiAlias,
      decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(15)),
      child:url.isEmpty ? Icon(icon,size:size*.48,color:aqua) :
        Image.network(url,fit:BoxFit.contain,
          errorBuilder:(_,error,stack)=>Icon(icon,color:aqua,size:size*.42)));

  Widget locationHeader() => Container(color: ink, padding: const EdgeInsets.fromLTRB(18, 8, 18, 18),
    child: Column(children: [
      Row(children: [
        Expanded(child: InkWell(onTap: areaSheet, child: Row(children: [
          const Icon(Icons.location_on_outlined,color:aqua,size:23),
          const SizedBox(width: 5),
          Flexible(child:Text(locationName,maxLines:1,overflow:TextOverflow.ellipsis,
            style:const TextStyle(color:Colors.white,fontWeight:FontWeight.bold,fontSize:15))),
          const Icon(Icons.keyboard_arrow_down,color:Colors.white,size:20)
        ]))),
        if (geolocating) const SizedBox(width:18,height:18,child:CircularProgressIndicator(
          color:aqua,strokeWidth:2)),
        const SizedBox(width: 10),
        chip('Shop local',Icons.storefront_rounded),
        const SizedBox(width:8),
        chip('Collect / Deliver',Icons.local_shipping_outlined)
      ]),
      const SizedBox(height:15),
      TextField(onChanged:(v)=>setState(()=>search=v),style:const TextStyle(color:ink),
        decoration:InputDecoration(hintText:'Search groceries, shops and essentials',
          filled:true,fillColor:Colors.white,
          prefixIcon:const Icon(Icons.search,color:muted),suffixIcon:const Icon(Icons.tune,color:muted),
          contentPadding:const EdgeInsets.symmetric(vertical:13),
          enabledBorder:OutlineInputBorder(borderRadius:BorderRadius.circular(16),borderSide:BorderSide.none),
          focusedBorder:OutlineInputBorder(borderRadius:BorderRadius.circular(16),borderSide:const BorderSide(color:aqua,width:2))))
    ]));

  Widget chip(String text,IconData icon)=>Container(
    padding:const EdgeInsets.symmetric(horizontal:9,vertical:8),
    decoration:BoxDecoration(border:Border.all(color:aqua,width:1),borderRadius:BorderRadius.circular(30)),
    child:Row(children:[Icon(icon,color:aqua,size:17),const SizedBox(width:5),
      Text(text,style:const TextStyle(color:Colors.white,fontWeight:FontWeight.w700,fontSize:10))]));

  @override
  Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(toolbarHeight:54,title:Row(children:[
      Container(width:35,height:35,alignment:Alignment.center,
        decoration:BoxDecoration(color:green,borderRadius:BorderRadius.circular(9)),
        child:const Text('T',style:TextStyle(fontWeight:FontWeight.w900,
          fontSize:24,fontStyle:FontStyle.italic,color:Colors.white))),
      const SizedBox(width:9),
      const Text('TEYZA',style:TextStyle(fontWeight:FontWeight.w900,letterSpacing:2.2,fontSize:23)),
      const SizedBox(width:7),
      const Text('SHOPPER',style:TextStyle(fontSize:11,letterSpacing:1.4,color:aqua))]),
      actions:[IconButton(tooltip:'Find my area',onPressed:areaSheet,
        icon:const Icon(Icons.my_location_outlined)),
        IconButton(tooltip:'Refresh shops',onPressed:load,icon:const Icon(Icons.refresh))]),
    body:tab==3?ShopperAccountPanel(session:session):tab==2?basketPage():
      Column(children:[locationHeader(),Expanded(child:tab==1 && selected!=null?
        shopPage(selected!):homePage())]),
    bottomNavigationBar:NavigationBar(height:75,backgroundColor:Colors.white,
      selectedIndex:tab,onDestinationSelected:(v)=>setState(()=>tab=v),
      destinations:[
        const NavigationDestination(icon:Icon(Icons.home_outlined),selectedIcon:Icon(Icons.home,color:green),label:'Home'),
        const NavigationDestination(icon:Icon(Icons.storefront_outlined),selectedIcon:Icon(Icons.storefront,color:green),label:'Shops'),
        NavigationDestination(icon:Badge(isLabelVisible:count>0,label:Text(count.toString()),
          child:const Icon(Icons.shopping_basket_outlined)),label:'Basket'),
        const NavigationDestination(icon:Icon(Icons.person_outline),label:'Account')]));

  Widget section(String title,{String? subtitle,Widget? action})=> Padding(
    padding:const EdgeInsets.fromLTRB(0,15,0,12), child:Row(children:[
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:const TextStyle(fontWeight:FontWeight.w900,fontSize:21,color:ink)),
        if(subtitle!=null) Text(subtitle,style:const TextStyle(color:muted,fontSize:11))])),
      if(action!=null)action]));

  Widget homePage()=>RefreshIndicator(onRefresh:load,child:ListView(
    padding:const EdgeInsets.fromLTRB(16,15,16,22),children:[
      if(locationWarning!=null) Card(color:const Color(0xFFFFF1D9),
        child:Padding(padding:const EdgeInsets.all(12),child:Text(locationWarning!))),
      if(area==null) Material(color:const Color(0xFFDAF1EB),borderRadius:BorderRadius.circular(15),
        child:ListTile(onTap:areaSheet,leading:const Icon(Icons.my_location,color:green),
          title:const Text('Choose your area',style:TextStyle(fontWeight:FontWeight.bold)),
          subtitle:const Text('Find shops close to you with GPS or pick a suburb'),
          trailing:const Icon(Icons.chevron_right))),
      if(catalogueError!=null) Padding(padding:const EdgeInsets.only(top:8),
        child:Text('Real-shop connection: '+catalogueError!,
          style:const TextStyle(color:muted,fontSize:11))),
      section('QUICK SHOPS',subtitle:'Choose a spaza shop to see its products',
        action:TextButton(onPressed:()=>setState(()=>tab=1),child:const Text('View all'))),
      SizedBox(height:135,child:ListView(scrollDirection:Axis.horizontal,
        children:displayShops.take(9).map((s)=>quickShop(s)).toList())),
      const SizedBox(height:15),
      Container(height:155,padding:const EdgeInsets.all(21),decoration:BoxDecoration(
        borderRadius:BorderRadius.circular(21),
        gradient:const LinearGradient(colors:[Color(0xFF074D47),Color(0xFF2AB69B)])),
        child:Row(children:[
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('TEYZA LOCAL MARKETS',style:TextStyle(
              color:Color(0xFFBFECE5),fontSize:11,letterSpacing:1.5,fontWeight:FontWeight.w900)),
            const SizedBox(height:8),
            const Text('Groceries around\nyour neighbourhood',
              style:TextStyle(color:Colors.white,fontSize:23,fontWeight:FontWeight.w900,height:1.1)),
            const SizedBox(height:12),
            Container(padding:const EdgeInsets.symmetric(horizontal:10,vertical:5),
              decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(6)),
              child:const Text('EXAMPLE PRICES · DEMO',style:TextStyle(
                fontSize:10,fontWeight:FontWeight.w900,color:green)))
          ])),
          const Icon(Icons.shopping_basket_rounded,color:Colors.white,size:77)
        ])),
      section('Shop by category'),
      Wrap(spacing:7,runSpacing:8,
        children:['All','Bakery','Dairy','Pantry','Drinks','Snacks','Fresh','Household']
          .map((c)=>ChoiceChip(label:Text(c),selected:category==c,
            onSelected:(_)=>setState(()=>category=c),
            selectedColor:const Color(0xFFC6EDE0),backgroundColor:Colors.white,
            side:const BorderSide(color:Color(0xFFE1EAE6)))).toList()),
      section('EVERYDAY ESSENTIALS',subtitle:'Real shop prices when connected · other prices are examples'),
      productShelf(featured),
      section('SPAZA SHOPS NEAR YOU',subtitle:area==null?
        'Choose an area to see local listings':'Sorted by approximate distance where available',
        action:TextButton(onPressed:()=>setState(()=>tab=1),child:const Text('View all'))),
      if(loading)const Center(child:Padding(padding:EdgeInsets.all(15),child:CircularProgressIndicator())),
      if(displayShops.isEmpty)empty('No shops found','Try another area or refresh the catalogue.'),
      ...displayShops.take(5).map((s)=>shopTile(s)),
      section('FOUND ONLINE NEAR YOU',
        subtitle:'Public directory listings · Not yet registered with Teyza',
        action:TextButton(onPressed:reloadOnline,child:const Text('Refresh'))),
      if(loadingOnline)const Center(child:Padding(padding:EdgeInsets.all(16),
        child:CircularProgressIndicator())),
      if(onlineWarning!=null)Text(onlineWarning!,
        style:const TextStyle(color:muted,fontSize:12)),
      ...displayedOnline.take(12).map(onlineTile),
      if(displayedOnline.isEmpty && !loadingOnline)
        empty('No online listings found','Try another suburb or refresh the area search.'),
      const Padding(padding:EdgeInsets.only(top:8,bottom:10),child:
        Text('Online business data may be incomplete. Confirm details with the shop. '
          '© OpenStreetMap contributors (ODbL).',
          style:TextStyle(fontSize:10,color:muted)))
    ]));

  Widget quickShop(Shop s)=>InkWell(onTap:()=>openShop(s),child:SizedBox(width:111,
    child:Column(children:[
      Stack(children:[Container(width:83,height:83,decoration:BoxDecoration(
        shape:BoxShape.circle,color:s.demo?const Color(0xFFB4E2DA):const Color(0xFFD1EEDB)),
        child:ClipOval(child:photo(s.photo,size:83,icon:Icons.store))),
        if(s.demo)Positioned(bottom:0,right:0,child:Container(
          color:const Color(0xFFFCDF9F),padding:const EdgeInsets.all(3),
          child:const Text('DEMO',style:TextStyle(fontSize:8,fontWeight:FontWeight.bold))))]),
      const SizedBox(height:8),
      Text(s.name,maxLines:2,textAlign:TextAlign.center,overflow:TextOverflow.ellipsis,
        style:const TextStyle(fontSize:12,fontWeight:FontWeight.w700,color:ink))
    ])));

  Widget productShelf(List<Product> items) {
    if(items.isEmpty)return empty('No groceries to display','Choose another category or area.');
    return SizedBox(height:218,child:ListView(scrollDirection:Axis.horizontal,
      children:items.take(12).map((p)=>Container(width:155,margin:const EdgeInsets.only(right:10),
        padding:const EdgeInsets.all(11),decoration:BoxDecoration(color:Colors.white,
          borderRadius:BorderRadius.circular(17)),child:Column(
            crossAxisAlignment:CrossAxisAlignment.start,children:[
          SizedBox(height:111,width:150,child:photo(p.picture,size:110,icon:Icons.shopping_bag)),
          const SizedBox(height:8),
          Text(p.name,maxLines:1,overflow:TextOverflow.ellipsis,
            style:const TextStyle(fontSize:12,fontWeight:FontWeight.w800)),
          Text(rand(p.priceCents),style:const TextStyle(fontSize:17,
            fontWeight:FontWeight.w900,color:ink)),
          Text(p.id.startsWith('demo-')?'Example price':'Shop-listed price',
            style:const TextStyle(color:muted,fontSize:10))
        ]))).toList()));
  }
  Widget shopTile(Shop s)=>Card(color:Colors.white,elevation:0,
    margin:const EdgeInsets.only(bottom:11),child:InkWell(onTap:()=>openShop(s),
      child:Padding(padding:const EdgeInsets.all(13),child:Row(children:[
        Stack(children:[photo(s.photo,size:84),
          if(s.demo)Positioned(left:0,bottom:0,child:Container(
            padding:const EdgeInsets.symmetric(horizontal:5,vertical:3),
            color:const Color(0xFFFFDF9E),child:const Text('DEMO',style:TextStyle(fontSize:9,
              fontWeight:FontWeight.bold))))]),
        const SizedBox(width:12),
        Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(s.name,style:const TextStyle(fontSize:16,fontWeight:FontWeight.w900)),
          Text(s.area,maxLines:2,overflow:TextOverflow.ellipsis,
            style:const TextStyle(color:muted,fontSize:11)),
          const SizedBox(height:7),
          Text(s.products.length.toString()+' products'+(distance(s)!=null ?
            ' · '+distance(s)!.toStringAsFixed(1)+' km':''),
            style:const TextStyle(color:green,fontSize:12,fontWeight:FontWeight.bold))
        ])),
        const Icon(Icons.chevron_right,color:green)
      ]))));

  Widget shopPage(Shop shop)=>ListView(padding:const EdgeInsets.all(16),children:[
    TextButton.icon(onPressed:()=>setState(()=>selected=null),
      icon:const Icon(Icons.arrow_back),label:const Text('All spaza shops')),
    Row(children:[photo(shop.photo,size:82),const SizedBox(width:12),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(shop.name,style:const TextStyle(fontSize:22,fontWeight:FontWeight.w900)),
        Text(shop.area,style:const TextStyle(color:muted,fontSize:12)),
        if(shop.demo)const Text('DEMO SHOP · Not a trading business',
          style:TextStyle(fontSize:10,fontWeight:FontWeight.bold,color:Color(0xFFB56C00))),
        if(distance(shop)!=null)Text(distance(shop)!.toStringAsFixed(1)+' km away (approx.)',
          style:const TextStyle(color:green,fontSize:11))
      ]))]),
    section('Available products',subtitle:shop.demo?
      'Sample prices only · Cannot place real orders':'Shop-supplied price and stock'),
    LayoutBuilder(builder:(context,c)=>GridView.builder(
      shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),
      itemCount:shop.products.length,
      gridDelegate:SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount:c.maxWidth>680?4:2,mainAxisSpacing:10,crossAxisSpacing:10,
        childAspectRatio:.7),
      itemBuilder:(context,i){
        final p=shop.products[i];
        return Container(padding:const EdgeInsets.all(10),
          decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(16)),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Expanded(child:Center(child:photo(p.picture,size:136,icon:Icons.shopping_bag_outlined))),
            const SizedBox(height:6),
            Text(p.name,maxLines:1,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontWeight:FontWeight.w800,fontSize:12)),
            Text(rand(p.priceCents),style:const TextStyle(
              fontSize:17,color:ink,fontWeight:FontWeight.w900)),
            Text(shop.demo?'Example price':p.stock.toString()+' in stock',
              style:const TextStyle(color:muted,fontSize:10)),
            SizedBox(width:double.infinity,child:FilledButton(
              onPressed:()=>quantity(p,1),
              style:FilledButton.styleFrom(padding:const EdgeInsets.all(5),
                visualDensity:VisualDensity.compact),
              child:Text((cart[p.id]??0)==0?'+ Add':'Add more ('+(cart[p.id]??0).toString()+')',
                maxLines:1,style:const TextStyle(fontSize:12))))
          ]));
      }))
  ]);
  Widget empty(String title,String message)=>Card(color:Colors.white,
    child:Padding(padding:const EdgeInsets.all(22),child:Column(children:[
      const Icon(Icons.storefront_outlined,color:green,size:40),
      Text(title,style:const TextStyle(fontWeight:FontWeight.bold,fontSize:18)),
      Text(message,style:const TextStyle(color:muted),textAlign:TextAlign.center)
    ])));

  Future<void> sendWhatsApp() async {
    final shop=selected;
    if(shop==null||shop.demo||shop.phone.isEmpty||basketItems.isEmpty)return;
    final lines=basketItems.map((p)=>'- '+p.name+' ×'+(cart[p.id]??0).toString()+
      ' '+rand(p.priceCents*(cart[p.id]??0))).join('\n');
    final message='Hi '+shop.name+', I found your shop on Teyza. Please confirm:\n'+
      lines+'\nEstimated subtotal: '+rand(total)+
      '\nPlease confirm stock, total and collection/delivery. No payment has been made.';
    final uri=Uri.parse('https://wa.me/'+shop.phone+
      '?text='+Uri.encodeComponent(message));
    final launched=await launchUrl(uri,mode:LaunchMode.externalApplication);
    if(!launched&&mounted)ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content:Text('Could not open WhatsApp.')));
  }

  Widget basketPage()=>ListView(padding:const EdgeInsets.all(20),children:[
    const Text('MY BASKET',style:TextStyle(fontSize:26,fontWeight:FontWeight.w900)),
    const SizedBox(height:8),
    if(selected==null||basketItems.isEmpty)
      empty('Your basket is empty','Choose a spaza shop and add some groceries.')
    else ...[
      Text(selected!.name,style:const TextStyle(fontSize:17,fontWeight:FontWeight.bold)),
      const SizedBox(height:8),
      if(selected!.demo)const Card(color:Color(0xFFFFF1CE),
        child:ListTile(leading:Icon(Icons.info_outline),title:Text('Demo basket only'),
          subtitle:Text('These are sample products and prices. No real order can be sent.'))),
      ...basketItems.map((p)=>Card(color:Colors.white,child:ListTile(
        leading:photo(p.picture,size:55,icon:Icons.shopping_bag),
        title:Text(p.name),
        subtitle:Text(rand(p.priceCents*(cart[p.id]??0))),
        trailing:Wrap(crossAxisAlignment:WrapCrossAlignment.center,spacing:2,children:[
          IconButton(onPressed:()=>quantity(p,-1),icon:const Icon(Icons.remove_circle_outline)),
          Text((cart[p.id]??0).toString()),
          IconButton(onPressed:()=>quantity(p,1),icon:const Icon(Icons.add_circle_outline))
        ])))),
      const SizedBox(height:15),
      Text('Estimated total: '+rand(total),style:const TextStyle(
        fontSize:24,fontWeight:FontWeight.w900)),
      const SizedBox(height:13),
      FilledButton(onPressed: selected!.demo||selected!.phone.isEmpty?null:sendWhatsApp,
        child:const Text('Ask shop to confirm via WhatsApp')),
      if(!selected!.demo && selected!.phone.isEmpty)
        const Text('The shop has not enabled ordering yet.',textAlign:TextAlign.center),
      const SizedBox(height:9),
      const Text('No payment is taken inside Teyza Shopper.',
        style:TextStyle(color:muted,fontSize:12))
    ]
  ]);
  Widget infoPage()=>ListView(padding:const EdgeInsets.all(22),children:[
    const Icon(Icons.storefront_rounded,size:66,color:green),
    const SizedBox(height:12),
    const Text('TEYZA Shopper',style:TextStyle(
      fontWeight:FontWeight.w900,fontSize:28),textAlign:TextAlign.center),
    const SizedBox(height:10),
    const Text('Discover spaza shops near your selected area and shop their listed groceries.',
      textAlign:TextAlign.center),
    const SizedBox(height:18),
    Card(child:ListTile(leading:const Icon(Icons.location_on_outlined),
      title:Text(locationName),subtitle:const Text('Change shopping area'),
      onTap:areaSheet)),
    const Card(child:ListTile(leading:Icon(Icons.verified_outlined),
      title:Text('Real shops and demos are separate'),
      subtitle:Text('Demo listings and prices are for design testing only.'))),
    const Card(child:ListTile(leading:Icon(Icons.lock_outline),
      title:Text('Location privacy'),
      subtitle:Text('GPS is optional and used on this device to sort shops.'))),
    const Card(child:ListTile(leading:Icon(Icons.payment_outlined),
      title:Text('No online payment yet'),
      subtitle:Text('Contact real shops directly if they enable order enquiries.'))),
    const Text('Shop owners publish verified stock at teyza.co.za.',
      textAlign:TextAlign.center,style:TextStyle(color:muted,fontSize:12)),
  ]);
}
