import 'dart:convert';
import 'dart:async';
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
import 'shopper_chat.dart';
import 'shopper_splash.dart';

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
  final bool sponsored;
  const Shop(this.id, this.name, this.area, this.photo, this.phone,
    this.pickup, this.delivery, this.products,
    {this.latitude, this.longitude,this.shopCategory='spaza',
    this.acceptsCard,this.cashback,this.sponsored=false});
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
        ?(x['services'] as Map)['cashback'] as bool:null,
    sponsored:x['sponsored']==true);
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
      .where((s) => s.id.isNotEmpty && s.name.isNotEmpty).toList();
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
class _ShopperHomeState extends State<ShopperHome> with WidgetsBindingObserver {
  Area? area;
  String locationName = 'Choose your area';
  String? locationWarning;
  bool geolocating = false;
  List<Shop> live = [];
  String? catalogueError;
  bool loading = true;
  bool _launchReady=false;
  bool _usingGps=false;
  String _currentLocationDetail='';
  bool showAllShops=false;
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
  int unreadChats=0;
  Timer? chatWatch;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    chatWatch=Timer.periodic(const Duration(minutes:1),(_)=>refreshUnread());
    refreshUnread();
    _prepareLaunch();
    session.restore();
  }
  Future<void> _prepareLaunch() async {
    // Catalogue and area discovery start together. Never trap people forever
    // on a splash screen when mobile data or location services are slow.
    try {
      await Future.wait<void>([load(),_restoreSavedArea()])
        .timeout(const Duration(seconds:11));
    } catch (_) {/* Continue with clear offline/permission states. */}
    if(!mounted)return;
    final urls=<String>[
      ...live.where((s)=>s.photo.startsWith('https://')).take(3)
        .map((s)=>s.photo),
      ...online.where((s)=>s.origin=='google_places' &&
        s.photoRef!=null && s.photoRef!.isNotEmpty).take(3)
        .map((s)=>Uri.https('teyza.co.za','/api/shopper-place-photo.php',
          {'ref':s.photoRef!}).toString()),
      for(final name in ['bread','milk','eggs'])
        photos+name+'.webp',
    ];
    try {
      await Future.wait<void>(urls.map((url) async {
        try {
          await precacheImage(NetworkImage(url),context)
            .timeout(const Duration(seconds:3));
        } catch (_) {/* Individual photos may be unavailable. */}
      })).timeout(const Duration(seconds:4));
    } catch (_) {/* Placeholders remain visible for slow photo providers. */}
    await Future<void>.delayed(const Duration(milliseconds:380));
    if(mounted)setState(()=>_launchReady=true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    chatWatch?.cancel();
    session.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if(state==AppLifecycleState.resumed) {
      refreshUnread();
      // Don't clear a shop/cart when returning from Google Maps.
      if(area==null) _restoreSavedArea();
    }
  }

  Future<void> refreshUnread() async {
    try {
      final unread=await ShopperChatApi.unreadTotal();
      if(mounted)setState(()=>unreadChats=unread);
    }catch(_){/* Unread service unavailable; do not block shopping. */}
  }

  Future<void> _restoreSavedArea() async {
    // Never require the shopper to tap refresh after reopening the app.
    // Recheck permission at startup, respecting Android privacy settings.
    final prefs=await SharedPreferences.getInstance();
    final saved=prefs.getString('teyza_selected_area');
    final permission=await Geolocator.checkPermission();
    if (!mounted)return;
    // A shopper's explicit suburb selection takes precedence over GPS.
    if(saved!=null&&saved!='gps') {
      for(final entry in areas) {
        if(entry.label==saved) {
          await chooseArea(entry,persist:false);
          return;
        }
      }
    }
    if(permission==LocationPermission.always ||
       permission==LocationPermission.whileInUse) {
      await useLocation(askPermission:false);
      if(area!=null)return;
    }
    if(permission==LocationPermission.denied &&
       !(prefs.getBool('teyza_gps_initial_prompt_done')??false)) {
      await prefs.setBool('teyza_gps_initial_prompt_done',true);
      if(mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if(mounted)useLocation(askPermission:true);
        });
      }
    }
  }

  Future<void> setDiscoveryType(String type) async {
    if(type!='spaza'&&type!='variety')return;
    if(discoveryType==type)return;
    setState(() {
      discoveryType=type;
      showAllShops=false;
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
      if(area==null) {
        if(mounted)setState(() {loadingOnline=false;online=[];});
        return;
      }
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
        _usingGps=true;
        _currentLocationDetail=placeName+(city.isNotEmpty && city!=placeName?', '+city:'');
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
      _usingGps=false;
      _currentLocationDetail='';
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
    filtered.sort((a,b) {
      if(a.sponsored!=b.sponsored)return a.sponsored?-1:1;
      return (distance(a)??double.infinity).compareTo(distance(b)??double.infinity);
    });
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
        const Text('Catalogue not yet available',style:TextStyle(
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
    showAllShops=true;
    search = '';
    category = 'All';
    tab = 0;
  });

  void selectDirectory(OnlineShop shop)=>setState((){
    directorySelected=shop;selected=null;showAllShops=true;search='';tab=0;cart.clear();
  });

  Widget photo(String url,{double size=92, IconData icon=Icons.storefront_outlined}) =>
    Container(width:size,height:size,clipBehavior:Clip.antiAlias,
      decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(15)),
      child:url.isEmpty ? Icon(icon,size:size*.48,color:aqua) :
        Image.network(url,fit:BoxFit.contain,
          loadingBuilder:(context,child,progress)=>progress==null?child:
            Center(child:Icon(icon,color:const Color(0xFF91CABA),size:size*.42)),
          errorBuilder:(_,error,stack)=>Icon(icon,color:aqua,size:size*.42)));

  Shop? get nearestRegisteredSpaza {
    if(area==null)return null;
    final options=nearbyReal.where((s)=>s.shopCategory=='spaza' &&
      s.latitude!=null && s.longitude!=null).toList();
    options.sort((a,b)=>(distance(a)??double.infinity)
      .compareTo(distance(b)??double.infinity));
    return options.isEmpty?null:options.first;
  }

  OnlineShop? get nearestDirectorySpaza {
    if(area==null||discoveryType!='spaza')return null;
    final options=online.where((s)=>s.shopCategory=='spaza' &&
      s.lat!=null && s.lng!=null).toList();
    options.sort((a,b)=>km(area!.lat,area!.lng,a.lat!,a.lng!)
      .compareTo(km(area!.lat,area!.lng,b.lat!,b.lng!)));
    return options.isEmpty?null:options.first;
  }

  Widget _shopMode(String label,String description,IconData icon,
      String type,Color activeColor) {
    final active=discoveryType==type;
    return Expanded(child:Material(
      color:active?activeColor:const Color(0xFFF1F5F3),
      borderRadius:BorderRadius.circular(18),
      child:InkWell(borderRadius:BorderRadius.circular(18),
        onTap:()=>setDiscoveryType(type),
        child:Container(height:89,padding:const EdgeInsets.all(12),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Icon(icon,color:active?Colors.white:deep,size:24),
            const Spacer(),
            Text(label,maxLines:1,overflow:TextOverflow.ellipsis,
              style:TextStyle(fontSize:13,fontWeight:FontWeight.w900,
                color:active?Colors.white:ink)),
            Text(description,maxLines:1,overflow:TextOverflow.ellipsis,
              style:TextStyle(fontSize:10,
                color:active?Colors.white70:muted))
          ])))));
  }

  Widget nearestShopCard() {
    final merchant=nearestRegisteredSpaza, directory=nearestDirectorySpaza;
    final dMerchant=merchant==null?double.infinity:(distance(merchant)??double.infinity);
    final dDirectory=directory==null?double.infinity:
      km(area!.lat,area!.lng,directory.lat!,directory.lng!);
    final useMerchant=merchant!=null && dMerchant<=dDirectory;
    final chosenName=useMerchant?merchant.name:directory?.name;
    final chosenDistance=useMerchant?dMerchant:dDirectory;
    final hasShop=chosenName!=null;
    final subtitle=hasShop?'Approx. '+chosenDistance.toStringAsFixed(1)+' km away':
      area==null?'Allow location or choose an area to find shops':
      discoveryType=='variety'?'Switch to Spaza Shops to discover nearby spazas':
        'Looking for nearby spazas around '+locationName;
    return Material(
      color:const Color(0xFFF1F8F4),borderRadius:BorderRadius.circular(18),
      child:InkWell(borderRadius:BorderRadius.circular(18),
        onTap:hasShop?(){
          if(useMerchant)openShop(merchant);
          else selectDirectory(directory!);
        }:areaSheet,
        child:Padding(padding:const EdgeInsets.all(13),child:Row(children:[
          Container(width:46,height:46,decoration:BoxDecoration(
            color:const Color(0xFFD7EDE2),borderRadius:BorderRadius.circular(14)),
            child:const Icon(Icons.place_rounded,color:green,size:26)),
          const SizedBox(width:12),
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('NEAREST SPAZA SHOP',style:TextStyle(color:green,
              fontWeight:FontWeight.w900,letterSpacing:.7,fontSize:10)),
            const SizedBox(height:3),
            Text(chosenName??'Find a shop near me',maxLines:1,
              overflow:TextOverflow.ellipsis,
              style:const TextStyle(color:deep,fontWeight:FontWeight.w900,fontSize:16)),
            const SizedBox(height:3),
            Text(subtitle,maxLines:2,overflow:TextOverflow.ellipsis,
              style:const TextStyle(color:muted,fontSize:11))
          ])),
          const Icon(Icons.chevron_right_rounded,color:green)
        ]))));
  }

  Widget locationHeader() => Container(
    padding:const EdgeInsets.fromLTRB(16,14,16,14),
    decoration:const BoxDecoration(color:Colors.white,
      borderRadius:BorderRadius.vertical(bottom:Radius.circular(24))),
    child:Column(children:[
      Row(children:[
        _shopMode('SPAZA SHOPS','Your local favourites',
          Icons.storefront_rounded,'spaza',const Color(0xFF087F63)),
        const SizedBox(width:10),
        _shopMode('OTHER RETAIL','Stores & wholesale',
          Icons.store_mall_directory_rounded,'variety',deep),
      ]),
      const SizedBox(height:13),
      nearestShopCard(),
      const SizedBox(height:11),
      InkWell(onTap:areaSheet,borderRadius:BorderRadius.circular(12),
        child:Padding(padding:const EdgeInsets.symmetric(vertical:4,horizontal:2),
          child:Row(children:[
            const Icon(Icons.my_location_rounded,size:17,color:green),
            const SizedBox(width:7),
            Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(_usingGps?'YOUR CURRENT LOCATION':'YOUR SHOPPING AREA',
                style:const TextStyle(fontSize:9,fontWeight:FontWeight.w900,
                  letterSpacing:.7,color:muted)),
              Text(_usingGps?_currentLocationDetail:locationName,maxLines:1,
                overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontSize:12,color:ink,fontWeight:FontWeight.w700))
            ])),
            if(geolocating)const SizedBox(width:15,height:15,
              child:CircularProgressIndicator(strokeWidth:2)),
            const Icon(Icons.keyboard_arrow_down_rounded,color:deep)
          ]))),
      if(selected==null && directorySelected==null)...[
        const SizedBox(height:12),
        TextField(key:ValueKey(discoveryType),
          onChanged:(value)=>setState(()=>search=value),
          decoration:InputDecoration(hintText:discoveryType=='spaza'?
              'Search spaza shops and groceries':'Search retailers, malls and products',
            hintStyle:const TextStyle(fontSize:13,color:muted),
            filled:true,fillColor:const Color(0xFFF3F6F4),
            prefixIcon:const Icon(Icons.search_rounded,color:green),
            contentPadding:const EdgeInsets.symmetric(vertical:12),
            border:OutlineInputBorder(borderRadius:BorderRadius.circular(15),
              borderSide:BorderSide.none)))
      ]
    ]));

  void openBasket(){
    Navigator.of(context).push(MaterialPageRoute(builder:(routeContext)=>
      StatefulBuilder(builder:(routeContext,refresh)=>Scaffold(
        appBar:AppBar(title:const Text('Your basket'),
          backgroundColor:deep,foregroundColor:Colors.white),
        body:basketPage(refresh:()=>refresh((){}))))));
  }

  void openInbox(){
    Navigator.of(context).push(MaterialPageRoute(builder:(_)=>
      ShopperChatPage(session:session)));
  }

  @override
  Widget build(BuildContext context) {
    if(!_launchReady)return const ShopperLaunchScreen();
    return Scaffold(
      appBar:AppBar(
        backgroundColor:deep,foregroundColor:Colors.white,toolbarHeight:63,
        titleSpacing:16,
        title:Row(children:[
          Container(width:37,height:37,alignment:Alignment.center,
            decoration:BoxDecoration(color:green,
              borderRadius:BorderRadius.circular(13)),
            child:const Text('T',style:TextStyle(color:Colors.white,
              fontWeight:FontWeight.w900,fontSize:26))),
          const SizedBox(width:10),
          const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('TEYZA',style:TextStyle(letterSpacing:2,
              fontWeight:FontWeight.w900,fontSize:22)),
            Text('SHOP LOCAL. LIVE BETTER.',style:TextStyle(
              color:Color(0xFFACDACB),letterSpacing:.6,fontSize:9))
          ])
        ]),
        actions:[
          IconButton(tooltip:'Messages',onPressed:openInbox,
            icon:Badge(isLabelVisible:unreadChats>0,
              label:Text(unreadChats>99?'99+':unreadChats.toString()),
              child:const Icon(Icons.chat_bubble_outline_rounded))),
          IconButton(tooltip:'Your basket',onPressed:openBasket,
            icon:Badge(isLabelVisible:count>0,label:Text(count.toString()),
              child:const Icon(Icons.shopping_bag_outlined))),
          const SizedBox(width:3)
        ]),
      body:tab==3?ShopperAccountPanel(session:session):
        tab==1?servicesPage():tab==2?deliveryPage():
        Column(children:[locationHeader(),Expanded(child:
          selected!=null?shopPage(selected!):
          directorySelected!=null?directoryPage(directorySelected!):
          showAllShops?allShopsPage():homePage())]),
      bottomNavigationBar:NavigationBar(
        height:72,backgroundColor:Colors.white,
        indicatorColor:const Color(0xFFDAF3E8),
        selectedIndex:tab,onDestinationSelected:(index){
          setState(()=>tab=index);
        },
        destinations:const [
          NavigationDestination(icon:Icon(Icons.storefront_outlined),
            selectedIcon:Icon(Icons.storefront_rounded,color:green),label:'Shop'),
          NavigationDestination(icon:Icon(Icons.grid_view_outlined),
            selectedIcon:Icon(Icons.grid_view_rounded,color:green),label:'Services'),
          NavigationDestination(icon:Icon(Icons.local_shipping_outlined),
            selectedIcon:Icon(Icons.local_shipping_rounded,color:green),label:'Delivery'),
          NavigationDestination(icon:Icon(Icons.person_outline_rounded),
            selectedIcon:Icon(Icons.person_rounded,color:green),label:'Profile')
        ]));
  }

  Widget section(String title,{String? subtitle,Widget? action})=> Padding(
    padding:const EdgeInsets.fromLTRB(0,15,0,12), child:Row(children:[
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:const TextStyle(fontWeight:FontWeight.w900,fontSize:21,color:ink)),
        if(subtitle!=null) Text(subtitle,style:const TextStyle(color:muted,fontSize:11))])),
      if(action!=null)action]));

  Widget categoryPicker()=>Wrap(spacing:8,runSpacing:6,children:[
    ChoiceChip(label:const Text('Spaza Shops'),selected:discoveryType=='spaza',
      onSelected:(_)=>setDiscoveryType('spaza')),
    ChoiceChip(label:const Text('Other Retail'),selected:discoveryType=='variety',
      onSelected:(_)=>setDiscoveryType('variety')),
  ]);

  Widget homePage()=>RefreshIndicator(
    onRefresh:() async {
      await Future.wait<void>([load(),reloadOnline()]);
    },
    child:ListView(padding:const EdgeInsets.fromLTRB(16,7,16,28),children:[
      if(locationWarning!=null)Card(color:const Color(0xFFFFF2DE),
        child:Padding(padding:const EdgeInsets.all(12),child:Text(locationWarning!))),
      if(catalogueError!=null)Padding(padding:const EdgeInsets.only(bottom:7),
        child:Text(catalogueError!,style:const TextStyle(color:muted,fontSize:11))),
      section(discoveryType=='spaza'?'Shop your favourite aisles':'Explore other retail',
        subtitle:discoveryType=='spaza'?'Everyday essentials, closer to home':
          'Variety stores, malls, wholesalers and more',
        action:TextButton(onPressed:()=>setState(()=>showAllShops=true),
          child:const Text('Explore all'))),
      if(discoveryType=='spaza')...[
        Wrap(spacing:7,runSpacing:7,children:[
          'All','Bakery','Dairy','Pantry','Drinks','Snacks','Fresh','Household'
        ].map((c)=>ChoiceChip(label:Text(c),selected:category==c,
          onSelected:(_)=>setState(()=>category=c),
          selectedColor:const Color(0xFFCDF0E1),
          backgroundColor:Colors.white,
          side:const BorderSide(color:Color(0xFFE0ECE6)))).toList()),
        const SizedBox(height:12),
        if(featured.isNotEmpty)productShelf(featured)else essentialsShelf(),
      ],
      const SizedBox(height:4),
      section(discoveryType=='spaza'?'Spaza shops near you':'Other retail near you',
        subtitle:area==null?'Choose your area to find nearby shops':
          'Local shops around '+locationName,
        action:TextButton(onPressed:()=>setState(()=>showAllShops=true),
          child:const Text('See all'))),
      if(displayedOnline.isNotEmpty)
        SizedBox(height:138,child:ListView(scrollDirection:Axis.horizontal,
          children:displayedOnline.take(12).map(directoryCircle).toList()))
      else if(displayShops.isNotEmpty)
        SizedBox(height:138,child:ListView(scrollDirection:Axis.horizontal,
          children:displayShops.take(10).map(quickShop).toList()))
      else if(loadingOnline)const SizedBox(height:106,
        child:Center(child:CircularProgressIndicator()))
      else InkWell(onTap:areaSheet,child:empty('Find nearby shops',
        'Use your current location or select a shopping area.')),
      const SizedBox(height:9),
      Material(color:deep,borderRadius:BorderRadius.circular(20),
        child:InkWell(borderRadius:BorderRadius.circular(20),
          onTap:()=>setState(()=>tab=1),
          child:Padding(padding:const EdgeInsets.all(18),
            child:Row(children:[
              const Icon(Icons.room_service_rounded,color:Color(0xFF79E5C5),size:34),
              const SizedBox(width:14),
              const Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,
                children:[
                  Text('Services offered',style:TextStyle(color:Colors.white,
                    fontWeight:FontWeight.w900,fontSize:18)),
                  SizedBox(height:4),
                  Text('Delivery, collection, card payments and cashback',
                    maxLines:2,style:TextStyle(color:Color(0xFFCFE9DE),fontSize:12))
                ])),
              const Icon(Icons.arrow_forward_rounded,color:Colors.white)
            ])))),
      section('Shops selling on Teyza',
        subtitle:'Verified participating sellers and published product listings',
        action:TextButton(onPressed:()=>setState(()=>showAllShops=true),
          child:const Text('View shops'))),
      if(loading)const Center(child:Padding(padding:EdgeInsets.all(13),
        child:CircularProgressIndicator())),
      ...displayShops.take(4).map(shopTile),
      if(displayShops.isEmpty)
        empty('More shops joining Teyza',
          'Local directory listings are shown separately. Only participating shops publish products and services.'),
      section(discoveryType=='spaza'?'More neighbourhood shops':'More retailers to explore',
        subtitle:'Public shop listings · confirm products with the owner'),
      if(loadingOnline)const Padding(padding:EdgeInsets.all(12),
        child:Center(child:CircularProgressIndicator())),
      if(onlineWarning!=null)Text(onlineWarning!,
        style:const TextStyle(color:muted,fontSize:12)),
      ...displayedOnline.take(6).map(onlineTile),
      if(displayedOnline.isEmpty&&!loadingOnline)
        const Text('No public shop listings loaded yet. Select another area or refresh.',
          style:TextStyle(color:muted,fontSize:12)),
      Card(color:const Color(0xFFE5F4ED),elevation:0,
        child:ListTile(
          leading:const Icon(Icons.add_business_outlined,color:green),
          title:const Text('Own a shop? Join Teyza',style:TextStyle(
            fontWeight:FontWeight.w800,fontSize:13)),
          subtitle:const Text('Spaza owners receive priority application review.'),
          trailing:const Icon(Icons.open_in_new_rounded,size:18),
          onTap:() async {
            await launchUrl(Uri.parse('https://teyza.co.za/?auth=register'),
              mode:LaunchMode.externalApplication);
          })),
      const SizedBox(height:9),
      if(online.any((shop)=>shop.origin=='google_places'))
        const Text('Google Maps · Business information supplied by Google.',
          style:TextStyle(color:muted,fontSize:10))
      else
        const Text('Public shop data · © OpenStreetMap contributors (ODbL).',
          style:TextStyle(color:muted,fontSize:10))
    ]));

  List<Shop> get _deliverySellers =>
    nearbyReal.where((shop)=>shop.delivery).toList();
  void _serviceShops(String title,List<Shop> sellers){
    if(sellers.isEmpty)return;
    showModalBottomSheet<void>(context:context,showDragHandle:true,
      backgroundColor:pale,isScrollControlled:true,
      builder:(sheetContext)=>SafeArea(child:ConstrainedBox(
        constraints:BoxConstraints(maxHeight:
          MediaQuery.sizeOf(sheetContext).height*.7),
        child:Column(mainAxisSize:MainAxisSize.min,children:[
          Padding(padding:const EdgeInsets.fromLTRB(18,4,18,12),
            child:Text(title,style:const TextStyle(fontSize:21,
              color:ink,fontWeight:FontWeight.w900))),
          Flexible(child:ListView(shrinkWrap:true,children:sellers.map((shop)=>
            ListTile(leading:photo(shop.photo,size:51),title:Text(shop.name),
              subtitle:Text(shop.area),
              trailing:const Icon(Icons.arrow_forward_ios_rounded,size:15),
              onTap:(){
                Navigator.of(sheetContext).pop();
                openShop(shop);
              })).toList())),
          const SizedBox(height:14)
        ]))));
  }
  Widget _serviceCard(String label,String description,IconData icon,
      List<Shop> shops,{Color accent=green})=>Padding(
        padding:const EdgeInsets.only(bottom:11),
        child:Material(color:Colors.white,borderRadius:BorderRadius.circular(18),
          child:InkWell(borderRadius:BorderRadius.circular(18),
            onTap:shops.isEmpty?null:()=>_serviceShops(label,shops),
            child:Padding(padding:const EdgeInsets.all(15),child:Row(children:[
              Container(width:49,height:49,
                decoration:BoxDecoration(color:const Color(0xFFE5F6EE),
                  borderRadius:BorderRadius.circular(16)),
                child:Icon(icon,size:26,color:accent)),
              const SizedBox(width:14),
              Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text(label,style:const TextStyle(fontWeight:FontWeight.w900,
                  color:ink,fontSize:16)),
                const SizedBox(height:4),
                Text(description,style:const TextStyle(color:muted,fontSize:12))
              ])),
              Column(children:[
                Text(shops.isEmpty?'—':shops.length.toString(),
                  style:const TextStyle(color:green,fontSize:19,
                    fontWeight:FontWeight.w900)),
                const Text('shops',style:TextStyle(color:muted,fontSize:10))
              ]),
              const SizedBox(width:4),
              const Icon(Icons.chevron_right_rounded,color:muted)
            ])))));
  Widget servicesPage()=>ListView(
    padding:const EdgeInsets.fromLTRB(16,18,16,28),children:[
      const Text('Services offered',style:TextStyle(color:ink,
        fontSize:26,fontWeight:FontWeight.w900)),
      const SizedBox(height:6),
      const Text('Explore services confirmed by shops registered on Teyza. '
        'Directory-only businesses have not verified their services.',
        style:TextStyle(color:muted,fontSize:13)),
      const SizedBox(height:18),
      _serviceCard('Home delivery',
        'Shops that say they can deliver to customers',
        Icons.local_shipping_rounded,_deliverySellers),
      _serviceCard('Click & collect',
        'Order enquiries and collection at the shop',
        Icons.shopping_bag_rounded,
        nearbyReal.where((s)=>s.pickup).toList()),
      _serviceCard('Card payments',
        'Merchants who have confirmed card acceptance',
        Icons.credit_card_rounded,
        nearbyReal.where((s)=>s.acceptsCard==true).toList()),
      _serviceCard('Cashback',
        'Merchants who have confirmed cashback availability',
        Icons.account_balance_wallet_rounded,
        nearbyReal.where((s)=>s.cashback==true).toList()),
      const SizedBox(height:12),
      Material(color:const Color(0xFFE0F2EA),
        borderRadius:BorderRadius.circular(17),
        child:ListTile(
          onTap:areaSheet,
          leading:const Icon(Icons.place_rounded,color:green),
          title:const Text('Services in your area',
            style:TextStyle(fontWeight:FontWeight.w800)),
          subtitle:Text(area==null?'Choose your location':locationName),
          trailing:const Icon(Icons.keyboard_arrow_right_rounded)))
    ]);

  Widget deliveryPage()=>ListView(
    padding:const EdgeInsets.fromLTRB(16,18,16,28),children:[
      const Text('Delivery services',style:TextStyle(
        fontSize:26,fontWeight:FontWeight.w900,color:ink)),
      const SizedBox(height:6),
      const Text('Find a participating shop offering delivery, check its '
        'listed products, and ask the shop to confirm an order.',
        style:TextStyle(color:muted,fontSize:13)),
      const SizedBox(height:18),
      Container(padding:const EdgeInsets.all(20),
        decoration:BoxDecoration(
          gradient:const LinearGradient(colors:[
            Color(0xFF0B6E59),Color(0xFF063E37)]),
          borderRadius:BorderRadius.circular(22)),
        child:Row(children:[
          const Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,
            children:[
              Text('LOCAL DELIVERY',style:TextStyle(color:Color(0xFFAEF0D7),
                fontSize:11,fontWeight:FontWeight.w900,letterSpacing:1.1)),
              SizedBox(height:7),
              Text('Your neighbourhood, delivered.',
                style:TextStyle(color:Colors.white,fontSize:23,
                  fontWeight:FontWeight.w900,height:1.1)),
              SizedBox(height:12),
              Text('Delivery availability and fees are confirmed by each shop.',
                style:TextStyle(color:Color(0xFFD6F3E7),fontSize:12))
            ])),
          const Icon(Icons.delivery_dining_rounded,
            color:Colors.white,size:78)
        ])),
      section('Shops offering delivery',
        subtitle:area==null?'Set your location to see nearby merchants':
          'Participating shops around '+locationName,
        action:TextButton(onPressed:areaSheet,child:const Text('Change area'))),
      if(_deliverySellers.isEmpty)
        empty('No confirmed delivery shops nearby',
          'You can still browse Spaza Shops and Other Retail. More delivery partners are joining.')
      else ..._deliverySellers.map(shopTile),
      const SizedBox(height:12),
      Material(color:Colors.white,borderRadius:BorderRadius.circular(16),
        child:const Padding(padding:EdgeInsets.all(16),
          child:Row(children:[
            Icon(Icons.info_outline_rounded,color:green),
            SizedBox(width:12),
            Expanded(child:Text('Teyza currently helps you find and contact shops. '
              'Delivery estimates and payment must be confirmed with the merchant.',
              style:TextStyle(color:muted,fontSize:12)))
          ])))
    ]);

  Widget directoryCircle(OnlineShop s)=>InkWell(onTap:()=>selectDirectory(s),
    child:SizedBox(width:112,child:Column(children:[
      onlinePhoto(s,width:82,height:82),
      const SizedBox(height:7),
      Text(s.name,maxLines:2,textAlign:TextAlign.center,
        overflow:TextOverflow.ellipsis,
        style:const TextStyle(fontSize:12,fontWeight:FontWeight.w700)),

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
              fit:BoxFit.contain,
              loadingBuilder:(context,child,progress)=>progress==null?child:
                const Icon(Icons.shopping_bag_outlined,color:Color(0xFF91CABA),size:44),
              errorBuilder:(_,err,stack)=>
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
          Row(children:[
            Expanded(child:Text(s.name,style:const TextStyle(fontSize:16,fontWeight:FontWeight.w900))),
            if(s.sponsored)const Text('Sponsored',style:TextStyle(color:green,fontSize:11))
          ]),
          Text(s.area,maxLines:2,overflow:TextOverflow.ellipsis,
            style:const TextStyle(color:muted,fontSize:11)),
          const SizedBox(height:7),
          Text((s.products.isEmpty?'Shop listed on Teyza':s.products.length.toString()+' products')+
            (distance(s)!=null?' · '+distance(s)!.toStringAsFixed(1)+' km':''),
            style:const TextStyle(color:green,fontSize:12,fontWeight:FontWeight.bold))
        ])),
        const Icon(Icons.chevron_right,color:green)
      ]))));


  Widget allShopsPage()=>ListView(
    padding:const EdgeInsets.all(16),children:[
      TextButton.icon(onPressed:()=>setState(()=>showAllShops=false),
        icon:const Icon(Icons.arrow_back_rounded),
        label:const Text('Back to shopping')),
      categoryPicker(),
      section(discoveryType=='spaza'?'SPAZA SHOPS NEAR YOU':'VARIETY & WHOLESALE NEAR YOU',
        subtitle:'Discover real shops in your chosen area'),
      if(loadingOnline)const Center(child:CircularProgressIndicator()),
      if(onlineWarning!=null)Text(onlineWarning!,style:const TextStyle(color:muted)),
      ...displayedOnline.map(onlineTile),
      if(displayedOnline.isEmpty&&!loadingOnline)
        empty('No online listings nearby','Try GPS or choose another area.'),
      section('SHOPS ON TEYZA',
        subtitle:'Merchant-published stock, pricing and availability'),
      ...displayShops.map(shopTile),
      if(displayShops.isEmpty)empty('More shops joining Teyza',
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
        final destination=shop.lat!=null&&shop.lng!=null
          ?shop.lat.toString()+','+shop.lng.toString()
          :shop.name+' '+(shop.address.isNotEmpty?shop.address:shop.area);
        final uri=Uri.https('www.google.com','/maps/dir/',
          {'api':'1','destination':destination});
        await launchUrl(uri,mode:LaunchMode.externalApplication);
      },icon:const Icon(Icons.directions_outlined),
        label:const Text('Directions to shop')),
      const SizedBox(height:8),
      OutlinedButton.icon(onPressed:()=>setState(()=>tab=4),
        icon:Icon(session.emailVerified?Icons.verified_user_outlined:
          Icons.mark_email_read_outlined),
        label:Text(session.emailVerified?'View verified shopper account':
          'Verify my shopper account')),
      const Padding(padding:EdgeInsets.only(top:9,bottom:6),
        child:Text('Messaging is available when the shop registers with Teyza.',
          style:TextStyle(fontSize:12,color:muted))),
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
    if(ShopperChatApi.isTeyzaShop(shop.id))
      Padding(padding:const EdgeInsets.only(top:12),child:SizedBox(
        width:double.infinity,child:FilledButton.icon(
          icon:const Icon(Icons.chat_bubble_outline),
          label:const Text('Chat with this shop'),onPressed:(){
            if(session.idToken==null||!session.emailVerified) {
              setState(()=>tab=3);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content:Text('Sign in and verify your account to chat with this shop.')));
              return;
            }
            Navigator.of(context).push(MaterialPageRoute(builder:(_)=>ShopperChatPage(
              session:session,initialShop:ShopperConversation(shop.id,shop.name))));
          }))),
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
    if(shop.products.isEmpty)
      empty('Shop details available', 'This shop has not published a priced catalogue yet. You can contact the merchant once chat is enabled.'),
    if(shop.products.isNotEmpty) section('Available products',
      subtitle:'Merchant-published prices and stock'),
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

  Widget basketPage({VoidCallback? refresh})=>ListView(padding:const EdgeInsets.all(20),children:[
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
          IconButton(onPressed:(){quantity(p,-1);refresh?.call();},
            icon:const Icon(Icons.remove_circle_outline)),
          Text((cart[p.id]??0).toString()),
          IconButton(onPressed:(){quantity(p,1);refresh?.call();},
            icon:const Icon(Icons.add_circle_outline))
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
            ChoiceChip(label:const Text('Other Retail'),
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
                  child:Text('SHOPS ON TEYZA',style:TextStyle(
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

                  ])),
                ...filteredOnline.map((shop)=>Card(color:Colors.white,
                  child:ListTile(
                    contentPadding:const EdgeInsets.symmetric(horizontal:12,vertical:4),
                    leading:_shopThumb(shop),
                    title:Text(shop.name,style:const TextStyle(fontWeight:FontWeight.w800)),
                    subtitle:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                      Text(shop.address.isNotEmpty?shop.address:shop.area,
                        maxLines:2,overflow:TextOverflow.ellipsis),
                      Text('Nearby shop'+_distanceLabel(_distance(shop.lat,shop.lng)),
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
