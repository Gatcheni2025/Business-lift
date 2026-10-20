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
  final bool pickup, delivery;
  final double? latitude, longitude;
  final List<Product> products;
  final String shopCategory;
  final bool? acceptsCard, cashback;
  const Shop(this.id, this.name, this.area, this.photo, this.phone,
    this.pickup, this.delivery, this.products,
    {this.latitude, this.longitude,this.shopCategory='spaza',
    this.acceptsCard,this.cashback});
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
    longitude: (x['longitude'] as num?)?.toDouble(),
    shopCategory:x['shopCategory']=='variety'?'variety':'spaza',
    acceptsCard:x['services'] is Map &&
      (x['services'] as Map)['cardPayments'] is bool
        ?(x['services'] as Map)['cardPayments'] as bool:null,
    cashback:x['services'] is Map &&
      (x['services'] as Map)['cashback'] is bool
        ?(x['services'] as Map)['cashback'] as bool:null);
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
  OnlineShop? directorySelected;
  String search = '';
  String category = 'All';
  int tab = 0;
  final cart = <String, int>{};
  final session = ShopperSession();
  List<OnlineShop> online = [];
  String? onlineWarning;
  bool loadingOnline = false;
  String discoveryType='spaza';
  int _onlineRequestSerial=0;

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
    if(selectedName=='gps') {
      await _restoreGrantedLocation();
      if(area==null)await reloadOnline();
      return;
    }
    await reloadOnline();
    if(selectedName==null) {
      final permission=await Geolocator.checkPermission();
      final alreadyAsked=prefs.getBool('teyza_gps_initial_prompt_done')??false;
      if(permission==LocationPermission.always ||
         permission==LocationPermission.whileInUse) {
        await useLocation(askPermission:false);
      } else if(!alreadyAsked && permission==LocationPermission.denied) {
        await prefs.setBool('teyza_gps_initial_prompt_done',true);
        if(mounted) WidgetsBinding.instance.addPostFrameCallback((_) {
          if(mounted) useLocation(askPermission:true);
        });
      }
    }
  }

  Future<void> setDiscoveryType(String type) async {
    if(type!='spaza'&&type!='variety')return;
    if(discoveryType==type)return;
    setState(() {
      discoveryType=type;
      online=[];
      directorySelected=null;
      search='';
    });
    await reloadOnline();
  }

  Future<void> reloadOnline() async {
    if (!mounted) return;
    setState(() { loadingOnline=true; onlineWarning=null; });
    try {
      final requestSerial=++_onlineRequestSerial;
      final chosenType=discoveryType;
      final places=await findOnlineShops(area:area?.label??'',
        latitude:area?.lat,longitude:area?.lng,category:chosenType);
      if(requestSerial!=_onlineRequestSerial)return;
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
        directorySelected = null;
        search='';
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

  Future<void> chooseArea(Area choice,{bool persist=true}) async {
    setState(() {
      area = choice;
      locationName = choice.label;
      locationWarning = null;
      selected = null;
      directorySelected = null;
      search = '';
      cart.clear();
      tab = 0;
    });
    if (persist) {
      final prefs=await SharedPreferences.getInstance();
      await prefs.setString('teyza_selected_area',choice.label);
    }
    await reloadOnline();
  }
  Future<void> areaSheet() async {
    await showModalBottomSheet<void>(
      context:context, showDragHandle:true, isScrollControlled:true,
      useSafeArea:true, backgroundColor:pale,
      builder:(sheetContext)=>FractionallySizedBox(
        heightFactor:.91,
        child:_NearbySpazaPicker(
          initialArea:area, initialOnline:online, initialMerchants:nearbyReal,
          initialType:discoveryType,
          initialError:onlineWarning, initialLoading:loadingOnline,
          onLocate:() async {
            await useLocation();
            return (area:area, places:online, merchants:nearbyReal,
              error:locationWarning??onlineWarning,category:discoveryType);
          },
          onChooseArea:(choice) async {
            await chooseArea(choice);
            return (area:area, places:online, merchants:nearbyReal,
              error:onlineWarning,category:discoveryType);
          },
          onChooseCategory:(value) async {
            await setDiscoveryType(value);
            return (area:area, places:online, merchants:nearbyReal,
              error:onlineWarning,category:discoveryType);
          },
          onRefresh:() async {
            await reloadOnline();
            return (area:area, places:online, merchants:nearbyReal,
              error:onlineWarning,category:discoveryType);
          },
          onOpenOnline:(shop) {
            Navigator.of(sheetContext).pop();
            selectDirectory(shop);
          },
          onOpenMerchant:(shop) {
            Navigator.of(sheetContext).pop();
            openShop(shop);
          },
        )));
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

  List<OnlineShop> get displayedOnline {
    final q=search.toLowerCase().trim();
    final places=online.where((place)=>q.isEmpty ||
      (place.name+' '+place.area+' '+place.address).toLowerCase().contains(q)).toList();
    if(area!=null) {
      double d(OnlineShop p)=>p.lat==null||p.lng==null?double.infinity:
        km(area!.lat,area!.lng,p.lat!,p.lng!);
      places.sort((a,b)=>d(a).compareTo(d(b)));
    }
    return places;
  }

  Widget onlineProviderLabel(OnlineShop shop) =>
    shop.origin=='google_places'
      ?const Text('Google Maps',style:TextStyle(
          fontSize:12,color:Color(0xFF5E5E5E),fontWeight:FontWeight.w400))
      :Text(shop.origin=='openstreetmap'?'OpenStreetMap · Public listing':
        'Public directory listing',style:const TextStyle(color:muted,fontSize:12));


  Widget onlinePhoto(OnlineShop shop,{double width=86,double height=86}) {
    final ref=shop.photoRef;
    final placeholder=Container(width:width,height:height,
      alignment:Alignment.center,color:const Color(0xFFE4F3EA),
      child:Icon(shop.shopCategory=='variety'?Icons.store_mall_directory_outlined:
        Icons.storefront_outlined,color:green,size:width*.42));
    if(shop.origin!='google_places'||ref==null||ref.isEmpty)return
      ClipRRect(borderRadius:BorderRadius.circular(14),child:placeholder);
    final url=Uri.https('teyza.co.za','/api/shopper-place-photo.php',{'ref':ref}).toString();
    return ClipRRect(borderRadius:BorderRadius.circular(14),
      child:Image.network(url,width:width,height:height,fit:BoxFit.cover,
        errorBuilder:(_,__,___)=>placeholder,
        loadingBuilder:(context,child,progress)=>progress==null?child:placeholder));
  }

  Widget _serviceRow(IconData icon,String label,bool? available)=>Container(
    padding:const EdgeInsets.symmetric(horizontal:12,vertical:10),
    margin:const EdgeInsets.only(bottom:7),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(12)),
    child:Row(children:[
      Icon(icon,color:green,size:22),const SizedBox(width:12),
      Expanded(child:Text(label,style:const TextStyle(fontWeight:FontWeight.w700))),
      Flexible(child:Text(available==true?'Available':
        available==false?'Not offered':'Not confirmed',
        textAlign:TextAlign.end,style:TextStyle(fontSize:11,
          color:available==true?green:muted)))
    ]));

  Widget onlineServices(OnlineShop shop)=>Column(
    crossAxisAlignment:CrossAxisAlignment.start,children:[
      section('Shop services',subtitle:'Ask the owner to confirm these options'),
      _serviceRow(Icons.credit_card_outlined,'Pay by card',null),
      _serviceRow(Icons.account_balance_wallet_outlined,'Cashback',null),
      _serviceRow(Icons.local_shipping_outlined,'Delivery',null),
      _serviceRow(Icons.shopping_bag_outlined,'Collection',null),
    ]);

  Widget merchantServices(Shop shop)=>Column(
    crossAxisAlignment:CrossAxisAlignment.start,children:[
      section('Shop services',subtitle:'Information published by the merchant'),
      _serviceRow(Icons.credit_card_outlined,'Pay by card',shop.acceptsCard),
      _serviceRow(Icons.account_balance_wallet_outlined,'Cashback',shop.cashback),
      _serviceRow(Icons.local_shipping_outlined,'Delivery',shop.delivery),
      _serviceRow(Icons.shopping_bag_outlined,'Collection',shop.pickup),
    ]);

  Widget onlineTile(OnlineShop place)=>Card(color:Colors.white,elevation:0,
    margin:const EdgeInsets.only(bottom:9),
    child:ListTile(onTap:()=>selectDirectory(place),
      leading:onlinePhoto(place,width:66,height:68),
      title:Text(place.name,style:const TextStyle(fontWeight:FontWeight.w800)),
      subtitle:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(place.address.isNotEmpty?place.address:place.area,
          maxLines:2,overflow:TextOverflow.ellipsis),
        onlineProviderLabel(place),
        const Text('Shop stock not connected',style:TextStyle(
          fontSize:11,color:muted)),
      ]),
      isThreeLine:true,
      trailing:const Icon(Icons.chevron_right,color:green,size:20)));

  List<Shop> get displayShops {
    final q=search.toLowerCase().trim();
    return nearbyReal.where((shop)=>(shop.shopCategory==discoveryType)&&
      (q.isEmpty ||
      (shop.name+' '+shop.area+' '+shop.products.map((p)=>p.name).join(' '))
        .toLowerCase().contains(q))).toList();
  }
  List<Product> get featured {
    final result=<Product>[];
    final seen=<String>{};
    for(final shop in nearbyReal.where((s)=>s.shopCategory==discoveryType)) {
      for(final p in shop.products) {
        if(seen.add(p.id) && (category=='All'||p.category==category) &&
          (search.isEmpty||p.name.toLowerCase().contains(search.toLowerCase()))) {
          result.add(p);
          if(result.length>=18)return result;
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
    directorySelected = null;
    search = '';
    category = 'All';
    tab = 1;
  });

  void selectDirectory(OnlineShop shop)=>setState((){
    directorySelected=shop;selected=null;search='';tab=1;cart.clear();
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
      Column(children:[locationHeader(),Expanded(child:tab==1?
        (selected!=null?shopPage(selected!):
         directorySelected!=null?directoryPage(directorySelected!):allShopsPage())
        :homePage())]),
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

  Widget categoryPicker()=>Wrap(spacing:8,runSpacing:6,children:[
    ChoiceChip(label:const Text('Spaza Shops'),selected:discoveryType=='spaza',
      onSelected:(_)=>setDiscoveryType('spaza')),
    ChoiceChip(label:const Text('Variety & Wholesale'),selected:discoveryType=='variety',
      onSelected:(_)=>setDiscoveryType('variety')),
  ]);

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
      categoryPicker(),
      section(discoveryType=='spaza'?'REAL SPAZA SHOPS':'VARIETY & WHOLESALE',
        subtitle:discoveryType=='spaza'?'Find local spazas near you':
          'Discover China Malls, China Marts and variety retailers',
        action:TextButton(onPressed:()=>setState(()=>tab=1),child:const Text('View all'))),
      if(displayedOnline.isNotEmpty)
        SizedBox(height:135,child:ListView(scrollDirection:Axis.horizontal,
          children:displayedOnline.take(12).map(directoryCircle).toList()))
      else if(displayShops.isNotEmpty)
        SizedBox(height:135,child:ListView(scrollDirection:Axis.horizontal,
          children:displayShops.take(9).map(quickShop).toList()))
      else if(loadingOnline)const Padding(padding:EdgeInsets.all(18),
        child:Center(child:CircularProgressIndicator())),
      section(discoveryType=='spaza'?'SPAZAS FOUND ONLINE':'VARIETY STORES FOUND ONLINE',
        subtitle:'Named local shops · tap to see shop details',
        action:TextButton(onPressed:reloadOnline,child:const Text('Find shops'))),
      if(loadingOnline)const Padding(padding:EdgeInsets.all(15),
        child:Center(child:CircularProgressIndicator())),
      if(onlineWarning!=null)Text(onlineWarning!,
        style:const TextStyle(color:muted,fontSize:12)),
      ...displayedOnline.take(4).map(onlineTile),
      if(displayedOnline.isEmpty && !loadingOnline)
        const Text('Select your area or refresh to find public shop listings.',
          style:TextStyle(color:muted,fontSize:12)),
      Card(color:const Color(0xFFE5F4ED),
        child:ListTile(leading:const Icon(Icons.add_business_outlined,color:green),
          title:const Text('Own a shop? Register with Teyza',
            style:TextStyle(fontSize:13,fontWeight:FontWeight.bold)),
          subtitle:const Text('Claim your shop and publish actual product prices.'),
          trailing:const Icon(Icons.open_in_new,size:17),
          onTap:() async {
            final uri=Uri.parse('https://teyza.co.za/?auth=register');
            await launchUrl(uri,mode:LaunchMode.externalApplication);
          })),
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
              child:const Text('FIND YOUR LOCAL SPAZA',style:TextStyle(
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
      section('GROCERIES & ESSENTIALS',
        subtitle:featured.isEmpty?'Browse common grocery categories':
          'Available products and prices from participating shops'),
      if(featured.isEmpty)essentialsShelf()else productShelf(featured),
      section('TEYZA SHOPS WITH LIVE PRODUCTS',subtitle:area==null?
        'Choose an area to see local listings':'Sorted by approximate distance where available',
        action:TextButton(onPressed:()=>setState(()=>tab=1),child:const Text('View all'))),
      if(loading)const Center(child:Padding(padding:EdgeInsets.all(15),child:CircularProgressIndicator())),
      if(displayShops.isEmpty)empty('More shop catalogues coming soon',
        'Real shops are listed above. Owners can claim their store and publish confirmed products.'),
      ...displayShops.take(5).map((s)=>shopTile(s)),
      section(discoveryType=='spaza'?'MORE NEIGHBOURHOOD SPAZAS':'MORE VARIETY & WHOLESALE',
        subtitle:'Found online · product catalogues not connected yet'),
      ...displayedOnline.skip(4).take(14).map(onlineTile),
      if(online.any((x)=>x.origin=='google_places'))
        const Padding(padding:EdgeInsets.only(top:8,bottom:10),
          child:Text('Google Maps',style:TextStyle(fontSize:12,color:Color(0xFF5E5E5E))))
      else const Padding(padding:EdgeInsets.only(top:8,bottom:10),
        child:Text('Public business listings · Map data © OpenStreetMap contributors (ODbL).',
          style:TextStyle(fontSize:11,color:muted)))
    ]));

  Widget directoryCircle(OnlineShop s)=>InkWell(onTap:()=>selectDirectory(s),
    child:SizedBox(width:112,child:Column(children:[
      onlinePhoto(s,width:82,height:82),
      const SizedBox(height:7),
      Text(s.name,maxLines:2,textAlign:TextAlign.center,
        overflow:TextOverflow.ellipsis,
        style:const TextStyle(fontSize:12,fontWeight:FontWeight.w700)),
      if(s.origin=='google_places')const Text('Google Maps',
        style:TextStyle(fontSize:12,color:Color(0xFF5E5E5E))),
    ])));

  Widget essentialsShelf(){
    const items=<(String,String,String)>[
      ('Bread','bread','Bakery'),('Milk','milk','Dairy'),
      ('Eggs','eggs','Dairy'),('Rice','rice','Pantry'),
      ('Maize meal','maize','Pantry'),('Cooking oil','oil','Pantry'),
      ('Snacks','snacks','Snacks'),('Cleaning','soap','Household')
    ];
    return SizedBox(height:164,child:ListView(scrollDirection:Axis.horizontal,
      children:items.where((x)=>category=='All'||x.$3==category).map((x)=>
        Container(width:126,margin:const EdgeInsets.only(right:9),
          padding:const EdgeInsets.all(10),
          decoration:BoxDecoration(color:Colors.white,
            borderRadius:BorderRadius.circular(15)),
          child:Column(children:[
            Expanded(child:Image.network(photos+x.$2+'.webp',
              fit:BoxFit.contain,errorBuilder:(_,err,stack)=>
                const Icon(Icons.shopping_bag_outlined,color:green,size:44))),
            const SizedBox(height:5),
            Text(x.$1,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:12)),
            const Text('Shop category',style:TextStyle(color:muted,fontSize:10))
          ]))).toList()));
  }

  Widget quickShop(Shop s)=>InkWell(onTap:()=>openShop(s),child:SizedBox(width:111,
    child:Column(children:[
      Stack(children:[Container(width:83,height:83,decoration:BoxDecoration(
        shape:BoxShape.circle,color:const Color(0xFFD1EEDB)),
        child:ClipOval(child:photo(s.photo,size:83,icon:Icons.store))),
]),
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
          const Text('Shop-listed price',
            style:const TextStyle(color:muted,fontSize:10))
        ]))).toList()));
  }
  Widget shopTile(Shop s)=>Card(color:Colors.white,elevation:0,
    margin:const EdgeInsets.only(bottom:11),child:InkWell(onTap:()=>openShop(s),
      child:Padding(padding:const EdgeInsets.all(13),child:Row(children:[
        photo(s.photo,size:84),
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


  Widget allShopsPage()=>ListView(
    padding:const EdgeInsets.all(16),children:[
      categoryPicker(),
      section(discoveryType=='spaza'?'SPAZA SHOPS NEAR YOU':'VARIETY & WHOLESALE NEAR YOU',
        subtitle:'Nearby businesses from Google Maps or public directories'),
      if(loadingOnline)const Center(child:CircularProgressIndicator()),
      if(onlineWarning!=null)Text(onlineWarning!,style:const TextStyle(color:muted)),
      ...displayedOnline.map(onlineTile),
      if(displayedOnline.isEmpty&&!loadingOnline)
        empty('No online listings nearby','Try GPS or choose another area.'),
      section('SHOPS SELLING ON TEYZA',
        subtitle:'Merchant-published stock, pricing and availability'),
      ...displayShops.map(shopTile),
      if(displayShops.isEmpty)empty('Shops joining soon',
        'Shop owners can claim their listing and connect a real product catalogue.')
    ]);

  Widget directoryPage(OnlineShop shop)=>ListView(
    padding:const EdgeInsets.all(18),children:[
      TextButton.icon(onPressed:()=>setState(()=>directorySelected=null),
        icon:const Icon(Icons.arrow_back),label:const Text('Browse all shops')),
      const SizedBox(height:10),
      SizedBox(width:double.infinity,height:210,
        child:onlinePhoto(shop,width:420,height:210)),
      if(shop.photoRef!=null)...[
        const SizedBox(height:6),
        const Text('Photo · Google Maps',style:TextStyle(color:muted,fontSize:11)),
        for(final credit in shop.photoAttributions)
          TextButton.icon(onPressed:() async {
            final url=Uri.tryParse(credit['url']??'');
            if(url!=null&&url.scheme=='https') {
              await launchUrl(url,mode:LaunchMode.externalApplication);
            }
          },icon:const Icon(Icons.open_in_new,size:14),
            label:Text('Photo by '+(credit['name']??''))),
      ],
      const SizedBox(height:16),
      Text(shop.name,style:const TextStyle(
        fontSize:25,fontWeight:FontWeight.w900,color:ink)),
      const SizedBox(height:6),
      Text(shop.address.isNotEmpty?shop.address:shop.area,
        style:const TextStyle(fontSize:14,color:muted)),
      const SizedBox(height:8),
      onlineProviderLabel(shop),
      for(final credit in shop.providerAttributions)
        Align(alignment:Alignment.centerLeft,
          child:TextButton.icon(onPressed:() async {
            final source=Uri.tryParse(credit['url']??'');
            if(source!=null && source.scheme=='https') {
              await launchUrl(source,mode:LaunchMode.externalApplication);
            }
          },icon:const Icon(Icons.open_in_new,size:14),
          label:Text('Data: ${credit['name']??''}'))),
      const SizedBox(height:14),
      Container(padding:const EdgeInsets.all(14),
        decoration:BoxDecoration(color:const Color(0xFFEAF5EF),
          borderRadius:BorderRadius.circular(13)),
        child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('LOCAL SHOP · NOT YET ON TEYZA',style:TextStyle(
            fontWeight:FontWeight.w900,fontSize:11,color:green)),
          SizedBox(height:5),
          Text('This shop has been found online. Products, prices, current opening '
            'hours and trading status still need confirmation by its owner.',
            style:TextStyle(fontSize:12,color:ink))
        ])),
      const SizedBox(height:14),
      FilledButton.icon(onPressed:() async {
        final uri=Uri.tryParse(shop.source);
        if(uri!=null&&uri.scheme=='https') {
          await launchUrl(uri,mode:LaunchMode.externalApplication);
        }
      },icon:const Icon(Icons.directions_outlined),
        label:Text(shop.origin=='google_places'?
          'View on Google Maps':'View location and public listing')),
      const SizedBox(height:8),
      OutlinedButton.icon(onPressed:()=>setState(()=>tab=3),
        icon:Icon(session.emailVerified?Icons.verified_user_outlined:
          Icons.mark_email_read_outlined),
        label:Text(session.emailVerified?'View verified shopper account':
          'Verify my shopper account')),
      onlineServices(shop),
      section('SHOP ITEMS'),
      empty('Shop stock not connected yet',
        'This real spaza has not published its products to Teyza. '
        'Explore everyday groceries below while more shop owners register.'),
      essentialsShelf(),
      const SizedBox(height:15),
      OutlinedButton.icon(onPressed:() async {
        await launchUrl(Uri.parse('https://teyza.co.za/?auth=register'),
          mode:LaunchMode.externalApplication);
      },icon:const Icon(Icons.add_business_outlined),
        label:const Text('Own this shop? Claim your listing')),
      const SizedBox(height:13),
      const Text('Online directory listing only. No verified stock or checkout '
        'is available for this shop yet.',
        textAlign:TextAlign.center,
        style:TextStyle(color:muted,fontSize:11))
    ]);

  Widget shopPage(Shop shop)=>ListView(padding:const EdgeInsets.all(16),children:[
    TextButton.icon(onPressed:()=>setState(()=>selected=null),
      icon:const Icon(Icons.arrow_back),label:const Text('All shops')),
    Row(children:[photo(shop.photo,size:82),const SizedBox(width:12),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(shop.name,style:const TextStyle(fontSize:22,fontWeight:FontWeight.w900)),
        Text(shop.area,style:const TextStyle(color:muted,fontSize:12)),

        if(distance(shop)!=null)Text(distance(shop)!.toStringAsFixed(1)+' km away (approx.)',
          style:const TextStyle(color:green,fontSize:11))
      ]))]),
    merchantServices(shop),
    OutlinedButton.icon(onPressed:() async {
      final destination=shop.latitude!=null && shop.longitude!=null
        ?shop.latitude.toString()+','+shop.longitude.toString()
        :shop.name+' '+shop.area;
      final url=Uri.https('www.google.com','/maps/dir/',
        {'api':'1','destination':destination});
      await launchUrl(url,mode:LaunchMode.externalApplication);
    },icon:const Icon(Icons.directions_outlined),
       label:const Text('Directions (approximate shop location)')),
    section('Available products',subtitle:'Merchant-published prices and stock'),
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
            Text(p.stock.toString()+' in stock',
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
    if(shop==null||shop.phone.isEmpty||basketItems.isEmpty)return;
    await session.refreshEmailStatus();
    if(session.idToken==null||!session.emailVerified) {
      if(!mounted)return;
      setState(()=>tab=3);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Please verify your shopper email before requesting an order.')));
      return;
    }
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
      FilledButton(onPressed: selected!.phone.isEmpty?null:sendWhatsApp,
        child:const Text('Ask shop to confirm via WhatsApp')),
      if(selected!.phone.isEmpty)
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
      title:Text('Real spaza listings'),
      subtitle:Text('Online-listed shops show real names but no unconfirmed stock. '
        'Only registered merchants can publish actual inventory and prices.'))),
    const Card(child:ListTile(leading:Icon(Icons.lock_outline),
      title:Text('Location privacy'),
      subtitle:Text('GPS is optional. Approximate coordinates are used to look up '
        'online shops when you choose location discovery.'))),
    const Card(child:ListTile(leading:Icon(Icons.payment_outlined),
      title:Text('No online payment yet'),
      subtitle:Text('Contact real shops directly if they enable order enquiries.'))),
    const Text('Shop owners publish verified stock at teyza.co.za.',
      textAlign:TextAlign.center,style:TextStyle(color:muted,fontSize:12)),
  ]);
}


typedef _NearbyPickerResult = ({
  Area? area,
  List<OnlineShop> places,
  List<Shop> merchants,
  String? error,
  String category,
});

/// Shows real nearby shops right inside "Where are you shopping?".
class _NearbySpazaPicker extends StatefulWidget {
  final Area? initialArea;
  final List<OnlineShop> initialOnline;
  final List<Shop> initialMerchants;
  final String? initialError;
  final bool initialLoading;
  final String initialType;
  final Future<_NearbyPickerResult> Function() onLocate, onRefresh;
  final Future<_NearbyPickerResult> Function(String) onChooseCategory;
  final Future<_NearbyPickerResult> Function(Area) onChooseArea;
  final ValueChanged<OnlineShop> onOpenOnline;
  final ValueChanged<Shop> onOpenMerchant;
  const _NearbySpazaPicker({
    required this.initialArea, required this.initialOnline,
    required this.initialMerchants, required this.initialError,
    required this.initialLoading, required this.initialType,
    required this.onChooseCategory, required this.onLocate,
    required this.onChooseArea, required this.onRefresh,
    required this.onOpenOnline, required this.onOpenMerchant
  });
  @override
  State<_NearbySpazaPicker> createState()=>_NearbySpazaPickerState();
}

class _NearbySpazaPickerState extends State<_NearbySpazaPicker> {
  Area? current;
  List<OnlineShop> found=[];
  List<Shop> selling=[];
  String? error;
  String query='';
  bool busy=false;
  bool showAreas=false;
  String currentType='spaza';

  @override
  void initState() {
    super.initState();
    current=widget.initialArea;
    currentType=widget.initialType;
    found=widget.initialOnline;
    selling=widget.initialMerchants;
    error=widget.initialError;
    if(current!=null && (widget.initialLoading || found.isEmpty)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if(mounted) _perform(widget.onRefresh);
      });
    }
  }

  Future<void> _perform(Future<_NearbyPickerResult> Function() request) async {
    if(busy)return;
    setState(() {busy=true;error=null;});
    try {
      final updated=await request();
      if(!mounted)return;
      setState(() {
        current=updated.area;
        currentType=updated.category;
        found=updated.places;
        selling=updated.merchants;
        error=updated.error;
        showAreas=false;
      });
    } catch (_) {
      if(mounted)setState(() => error='Unable to find nearby shops. Try another area.');
    } finally {
      if(mounted)setState(()=>busy=false);
    }
  }

  Widget _shopThumb(OnlineShop shop) {
    final missing=const CircleAvatar(radius:29,
      backgroundColor:Color(0xFFE4F3EA),
      child:Icon(Icons.storefront_outlined,color:green));
    final ref=shop.photoRef;
    if(shop.origin!='google_places'||ref==null||ref.isEmpty)return missing;
    final src=Uri.https('teyza.co.za','/api/shopper-place-photo.php',
      {'ref':ref}).toString();
    return ClipRRect(borderRadius:BorderRadius.circular(12),
      child:Image.network(src,width:62,height:62,fit:BoxFit.cover,
        errorBuilder:(_,__,___)=>missing));
  }

  double? _distance(double? lat,double? lng) {
    if(current==null||lat==null||lng==null)return null;
    return km(current!.lat,current!.lng,lat,lng);
  }
  String _distanceLabel(double? value) {
    if(value==null)return '';
    return ' · '+value.toStringAsFixed(1)+' km away';
  }

  @override
  Widget build(BuildContext context) {
    final term=query.trim().toLowerCase();
    final filteredOnline=found.where((shop)=>term.isEmpty||
      (shop.name+' '+shop.area+' '+shop.address).toLowerCase().contains(term))
      .toList()
      ..sort((a,b)=> (_distance(a.lat,a.lng)??double.infinity)
        .compareTo(_distance(b.lat,b.lng)??double.infinity));
    final filteredMerchants=selling.where((shop)=>term.isEmpty||
      (shop.name+' '+shop.area).toLowerCase().contains(term))
      .where((shop)=>shop.shopCategory==currentType)
      .toList()
      ..sort((a,b)=>(_distance(a.latitude,a.longitude)??double.infinity)
        .compareTo(_distance(b.latitude,b.longitude)??double.infinity));
    final googleResults=filteredOnline.any((shop)=>shop.origin=='google_places');

    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Padding(padding:const EdgeInsets.fromLTRB(20,2,20,12),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Where are you shopping?',style:TextStyle(
            fontSize:25,fontWeight:FontWeight.w900,color:ink)),
          const SizedBox(height:4),
          Text(current==null?'Find a nearby spaza shop by location or suburb.':
            (currentType=='spaza'?'Spaza shops near ':'Variety and wholesale shops near ')+current!.label,
            style:const TextStyle(color:muted,fontSize:13)),
          const SizedBox(height:11),
          Wrap(spacing:8,runSpacing:7,children:[
            ChoiceChip(label:const Text('Spaza Shops'),
              selected:currentType=='spaza',onSelected:busy?null:
                (_) => _perform(()=>widget.onChooseCategory('spaza'))),
            ChoiceChip(label:const Text('Variety & Wholesale'),
              selected:currentType=='variety',onSelected:busy?null:
                (_) => _perform(()=>widget.onChooseCategory('variety'))),
          ]),
          const SizedBox(height:10),
          SizedBox(width:double.infinity,child:FilledButton.icon(
            onPressed:busy?null:()=>_perform(widget.onLocate),
            icon:const Icon(Icons.my_location),
            label:Text(current==null?'Find shops near me':'Update my GPS location'),
          )),
          const SizedBox(height:8),
          OutlinedButton.icon(
            onPressed:busy?null:()=>setState(()=>showAreas=!showAreas),
            icon:const Icon(Icons.location_city_outlined),
            label:Text(current==null?'Choose suburb instead':
              'Change area: '+current!.label)),
          if(showAreas)Container(
            margin:const EdgeInsets.only(top:8),
            height:170,
            decoration:BoxDecoration(color:Colors.white,
              borderRadius:BorderRadius.circular(13)),
            child:ListView(children:areas.map((a)=>ListTile(
              dense:true,leading:const Icon(Icons.place_outlined,color:green),
              title:Text(a.label),subtitle:Text(a.city),
              onTap:busy?null:()=>_perform(()=>widget.onChooseArea(a))
            )).toList())),
          if(current!=null)...[
            const SizedBox(height:9),
            TextField(onChanged:(v)=>setState(()=>query=v),
              decoration:InputDecoration(hintText:'Search nearby shops',
                prefixIcon:const Icon(Icons.search),isDense:true,
                filled:true,fillColor:Colors.white,
                border:OutlineInputBorder(borderRadius:BorderRadius.circular(14),
                  borderSide:BorderSide.none))),
          ],
        ])),
      Expanded(child:busy
        ?const Center(child:Column(mainAxisSize:MainAxisSize.min,children:[
            CircularProgressIndicator(),
            SizedBox(height:12),
            Text('Finding spaza shops in your area...',style:TextStyle(color:muted)),
          ]))
        :current==null
          ?const Center(child:Padding(padding:EdgeInsets.all(22),child:
              Column(mainAxisSize:MainAxisSize.min,children:[
                Icon(Icons.storefront_outlined,size:52,color:green),
                SizedBox(height:12),
                Text('See shops around you',style:TextStyle(
                  fontSize:21,fontWeight:FontWeight.w900,color:ink)),
                SizedBox(height:6),
                Text('Use GPS or select a suburb to find real spaza shops.',
                  textAlign:TextAlign.center,style:TextStyle(color:muted)),
              ])))
          :ListView(padding:const EdgeInsets.fromLTRB(16,0,16,24),children:[
              if(error!=null)Card(color:const Color(0xFFFFF2E6),
                child:Padding(padding:const EdgeInsets.all(12),
                  child:Text(error!,style:const TextStyle(color:ink)))),
              if(filteredMerchants.isNotEmpty)...[
                const Padding(padding:EdgeInsets.only(top:12,bottom:8),
                  child:Text('SHOPS SELLING ON TEYZA',style:TextStyle(
                    fontSize:13,color:green,fontWeight:FontWeight.w900))),
                ...filteredMerchants.map((shop)=>Card(color:Colors.white,
                  child:ListTile(
                    leading:const CircleAvatar(backgroundColor:Color(0xFFE4F3EA),
                      child:Icon(Icons.verified_outlined,color:green)),
                    title:Text(shop.name,style:const TextStyle(fontWeight:FontWeight.w800)),
                    subtitle:Text(shop.area+_distanceLabel(
                      _distance(shop.latitude,shop.longitude))+'\n'+
                      shop.products.length.toString()+' available products',maxLines:3),
                    isThreeLine:true,
                    trailing:const Icon(Icons.arrow_forward_ios,color:green,size:17),
                    onTap:()=>widget.onOpenMerchant(shop)))),
              ],
              if(filteredOnline.isNotEmpty)...[
                Padding(padding:const EdgeInsets.only(top:12,bottom:7),
                  child:Row(children:[
                    Expanded(child:Text(currentType=='spaza'?
                      'OTHER NEARBY SPAZA SHOPS':'VARIETY MALLS & WHOLESALE',
                      style:TextStyle(fontSize:13,fontWeight:FontWeight.w900,color:ink))),
                    if(googleResults)const Text('Google Maps',
                      style:TextStyle(fontSize:12,color:Color(0xFF5E5E5E))),
                  ])),
                ...filteredOnline.map((shop)=>Card(color:Colors.white,
                  child:ListTile(
                    contentPadding:const EdgeInsets.symmetric(horizontal:12,vertical:4),
                    leading:_shopThumb(shop),
                    title:Text(shop.name,style:const TextStyle(fontWeight:FontWeight.w800)),
                    subtitle:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                      Text(shop.address.isNotEmpty?shop.address:shop.area,
                        maxLines:2,overflow:TextOverflow.ellipsis),
                      Text((shop.origin=='google_places'?'Google Maps listing':'Public directory')+
                        _distanceLabel(_distance(shop.lat,shop.lng)),
                        style:const TextStyle(fontSize:11,color:muted)),
                      const Text('Shop products not yet connected',
                        style:TextStyle(fontSize:11,color:muted)),
                    ]),
                    trailing:const Icon(Icons.chevron_right,color:green),
                    onTap:()=>widget.onOpenOnline(shop)))),
              ],
              if(filteredMerchants.isEmpty&&filteredOnline.isEmpty)
                Padding(padding:const EdgeInsets.symmetric(vertical:30,horizontal:12),
                  child:Column(children:[
                    const Icon(Icons.search_off,size:47,color:green),
                    const SizedBox(height:10),
                    Text(term.isNotEmpty?'No matching shop found':
                      'No nearby shops found right now',
                      textAlign:TextAlign.center,style:const TextStyle(
                        fontWeight:FontWeight.bold,fontSize:17)),
                    const SizedBox(height:8),
                    const Text('Try refreshing, using GPS, or selecting another suburb.',
                      textAlign:TextAlign.center,style:TextStyle(color:muted)),
                  ])),
              if(found.isNotEmpty && !googleResults)
                const Padding(padding:EdgeInsets.only(top:12),
                  child:Text('Public directory information may be incomplete. '
                    '© OpenStreetMap contributors (ODbL) for OpenStreetMap results.',
                    style:TextStyle(color:muted,fontSize:11))),
            ])),
      Padding(padding:const EdgeInsets.fromLTRB(18,3,18,13),
        child:Row(children:[
          const Expanded(child:Text(
            'Shop locations are approximate. Prices and stock appear only for registered Teyza shops.',
            style:TextStyle(fontSize:11,color:muted))),
          IconButton(tooltip:'Refresh nearby shops',
            onPressed:busy||current==null?null:()=>_perform(widget.onRefresh),
            icon:const Icon(Icons.refresh,color:green))
        ]))
    ]);
  }
}
