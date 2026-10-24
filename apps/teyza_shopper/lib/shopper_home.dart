import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'shopper_auth.dart';
import 'shopper_account.dart';
import 'seller_workspace.dart';
import 'shopper_discovery.dart';
import 'firebase_public_directory.dart';
import 'shopper_chat.dart';
import 'shopper_splash.dart';
import 'premium_navigation.dart';
import 'teyza_mobile_api.dart';
import 'shop_orders.dart';
import 'product_catalogue.dart';

const ink = Color(0xFF0B1C2C);
const deep = Color(0xFF010F1C);
const green = Color(0xFF3BB77E);
const aqua = Color(0xFFB8EDD3);
const pale = Color(0xFFFAFBFA);
const muted = Color(0xFF6C7880);
const catalogUrl = 'https://teyza.co.za/api/shopper-catalog.php';
const photos = 'https://teyza.co.za/assets/catalog-real/';
String rand(int cents) => 'R' + (cents / 100).toStringAsFixed(2);

class Product {
  final String id, name, category, picture;
  final int priceCents, stock;
  final bool inStock;
  const Product(this.id, this.name, this.category, this.picture, this.priceCents, this.stock,{this.inStock=true});
  factory Product.fromJson(Map<String, dynamic> x) => Product(
    (x['id'] ?? '').toString(), (x['name'] ?? '').toString(),
    (x['category'] ?? 'Other').toString(), (x['imageUrl'] ?? '').toString(),
    (x['priceCents'] as num?)?.toInt() ?? 0, (x['stock'] as num?)?.toInt() ?? 0,
    inStock:x.containsKey('inStock')?x['inStock']==true:x.containsKey('stock')?((x['stock'] as num?)??0)>0:
      ((x['priceCents'] as num?)??0)<=0);
}
class Shop {
  final String id, name, area, photo, phone;
  final bool pickup, delivery;
  final double? latitude, longitude;
  final List<Product> products;
  final List<Product> highlights;
  final String shopCategory;
  final bool? acceptsCard, cashback;
  final bool sponsored;
  final List<TradingDay> hours;
  final int deliveryFeeCents;
  List<Product> get rangeProducts=>{
    for(final p in highlights)p.id:p,for(final p in products)p.id:p
  }.values.toList();
  const Shop(this.id, this.name, this.area, this.photo, this.phone,
    this.pickup, this.delivery, this.products,
    {this.latitude, this.longitude,this.shopCategory='spaza',
    this.acceptsCard,this.cashback,this.sponsored=false,this.hours=const [],this.deliveryFeeCents=0,this.highlights=const []});
  factory Shop.fromJson(Map<String, dynamic> x) => Shop(
    (x['id'] ?? '').toString(), (x['name'] ?? '').toString(),
    (x['area'] ?? '').toString(), (x['photoUrl'] ?? '').toString(),
    (x['whatsappPhone'] ?? '').toString(), x['pickupEnabled'] == true,
    x['deliveryEnabled'] == true,
    ((x['products'] as List?) ?? []).whereType<Map>()
      .map((p) => Product.fromJson(Map<String, dynamic>.from(p)))
      .where((p) => p.id.isNotEmpty && p.name.isNotEmpty &&
        p.priceCents > 0 && p.stock >= 0).toList(),
    latitude: (x['latitude'] as num?)?.toDouble(),
    longitude: (x['longitude'] as num?)?.toDouble(),
    shopCategory:x['shopCategory']=='variety'?'variety':'spaza',
    acceptsCard:x['services'] is Map &&
      (x['services'] as Map)['cardPayments'] is bool
        ?(x['services'] as Map)['cardPayments'] as bool:null,
    cashback:x['services'] is Map &&
      (x['services'] as Map)['cashback'] is bool
        ?(x['services'] as Map)['cashback'] as bool:null,
    sponsored:x['sponsored']==true,hours:mobileRows(x['hours']).map(TradingDay.fromJson).toList(),
    deliveryFeeCents:(x['deliveryFeeCents'] as num?)?.toInt()??0,
    highlights:mobileRows(x['productHighlights']).map(Product.fromJson).where((p)=>p.id.isNotEmpty&&p.name.isNotEmpty).toList());
}
class ShopProduct {
  final Shop shop;final Product product;
  const ShopProduct(this.shop,this.product);
}
List<ShopProduct> discoverShopProducts(Iterable<Shop> shops,{String type='spaza',String category='All',String query='',int limit=18}){
  final result=<ShopProduct>[];
  final seen=<String>{};
  for(final shop in shops.where((s)=>s.shopCategory==type)){
    for(final p in shop.rangeProducts){
      if(p.inStock&&seen.add('${shop.id}/${p.id}')&&(category=='All'||p.category==category)&&
        (query.trim().isEmpty||p.name.toLowerCase().contains(query.trim().toLowerCase()))){
        result.add(ShopProduct(shop,p));if(result.length>=limit)return result;
      }
    }
  }
  return result;
}
Future<List<Shop>> fetchCatalogue({http.Client? client}) async {
  // Only administrator-published, approved and activated public shops.
  // Firebase Hosting does not execute the legacy PHP catalogue endpoint.
  final rows=await fetchTeyzaPublicDirectory(client:client);
  return rows.map(Shop.fromJson).toList();
}

/// A nearby shop can have both an approved Teyza catalogue and a map listing.
class NearbyListing {
  final Shop? merchant;
  final OnlineShop? directory;
  const NearbyListing({this.merchant,this.directory});
  String get name=>merchant?.name??directory!.name;
  double? get lat=>merchant?.latitude??directory?.lat;
  double? get lng=>merchant?.longitude??directory?.lng;
  bool get hasPhoto=>(merchant?.photo.isNotEmpty??false)||(directory?.hasPhoto??false);
}
List<NearbyListing> mergeNearbyListings(List<Shop> merchants,List<OnlineShop> directory,{Area? area}) {
  final entries=merchants.map((s)=>NearbyListing(merchant:s)).toList();
  String normal(String value)=>value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'),'');
  for(final shop in directory){
    final match=entries.indexWhere((entry)=>entry.merchant!=null&&
      normal(entry.name)==normal(shop.name)&&entry.lat!=null&&entry.lng!=null&&
      shop.lat!=null&&shop.lng!=null&&km(entry.lat!,entry.lng!,shop.lat!,shop.lng!)<.15);
    if(match>=0){entries[match]=NearbyListing(merchant:entries[match].merchant,directory:shop);}
    else{entries.add(NearbyListing(directory:shop));}
  }
  double d(NearbyListing s)=>area==null||s.lat==null||s.lng==null?double.infinity:
    km(area.lat,area.lng,s.lat!,s.lng!);
  entries.sort((a,b){
    final delta=d(a).compareTo(d(b));
    if(delta!=0)return delta;
    if(a.hasPhoto!=b.hasPhoto)return a.hasPhoto?-1:1;
    if((a.merchant!=null)!=(b.merchant!=null))return a.merchant!=null?-1:1;
    return a.name.compareTo(b.name);
  });
  return entries;
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
    theme: ThemeData(useMaterial3:true, scaffoldBackgroundColor:pale,
      fontFamily:'PT Sans',
      colorScheme:ColorScheme.fromSeed(seedColor:green,surface:Colors.white),
      textTheme:const TextTheme(
        titleLarge:TextStyle(color:ink,fontSize:21,fontWeight:FontWeight.w800),
        titleMedium:TextStyle(color:ink,fontSize:16,fontWeight:FontWeight.w800),
        bodyMedium:TextStyle(color:ink,fontSize:14)),
      appBarTheme:const AppBarTheme(backgroundColor:deep,
        foregroundColor:Colors.white,elevation:0),
      filledButtonTheme:FilledButtonThemeData(style:FilledButton.styleFrom(
        backgroundColor:green,foregroundColor:Colors.white,
        padding:const EdgeInsets.symmetric(horizontal:20,vertical:13),
        shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(16))))),
    home: const ShopperHome());
}
class ShopperHome extends StatefulWidget {
  final Future<List<Shop>> Function()? catalogueLoader;
  final Future<List<OnlineShop>> Function(Area,String,int)? directoryLoader;
  final Area? initialArea;
  final bool enableBackgroundServices;
  const ShopperHome({super.key,this.catalogueLoader,this.directoryLoader,
    this.initialArea,this.enableBackgroundServices=true});
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
  Shop? basketShop;
  OnlineShop? directorySelected;
  String search = '';
  String category = 'All';
  String shopProductSearch='';
  int tab = 0;
  final cart = <String, int>{};
  final session = ShopperSession();
  List<OnlineShop> online = [];
  String? onlineWarning;
  bool loadingOnline = false;
  String discoveryType='spaza';
  bool widerSearch=false;
  int get searchRadiusKm=>discoveryType=='variety'?(widerSearch?50:40):(widerSearch?40:22);
  int _onlineRequestSerial=0;
  int unreadChats=0;
  Timer? chatWatch;
  Timer? catalogueWatch;
  int _catalogueRequest=0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if(widget.enableBackgroundServices){
      chatWatch=Timer.periodic(const Duration(minutes:1),(_)=>refreshUnread());
      refreshUnread();
      session.restore();
      startCatalogueWatch();
    }else{session.isReady=true;}
    _prepareLaunch();
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
      ...online.map((s)=>s.displayPhotoUrl).whereType<String>().take(3),
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
    catalogueWatch?.cancel();
    session.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if(!widget.enableBackgroundServices)return;
    if(state==AppLifecycleState.resumed) {
      refreshUnread();
      load(silent:true);startCatalogueWatch();
      // Don't clear a shop/cart when returning from Google Maps.
      if(area==null) _restoreSavedArea();
    }else{catalogueWatch?.cancel();catalogueWatch=null;}
  }
  void startCatalogueWatch(){
    catalogueWatch?.cancel();catalogueWatch=Timer.periodic(const Duration(seconds:30),(_){
      if(!loading)load(silent:true);
    });
  }

  Future<void> refreshUnread() async {
    try {
      final unread=await ShopperChatApi.unreadTotal(session);
      if(mounted)setState(()=>unreadChats=unread);
    }catch(_){/* Unread service unavailable; do not block shopping. */}
  }

  Future<void> _restoreSavedArea() async {
    if(widget.initialArea!=null){
      await chooseArea(widget.initialArea!,persist:false);
      return;
    }
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
      widerSearch=false;
      showAllShops=false;
      online=[];
      directorySelected=null;
      search='';
    });
    await reloadOnline();
  }

  Future<void> reloadOnline() async {
    if (!mounted) return;
    final requestSerial=++_onlineRequestSerial;
    setState(() { loadingOnline=true; onlineWarning=null; });
    try {
      if(area==null) {
        if(mounted)setState(() {loadingOnline=false;online=[];});
        return;
      }
      final chosenType=discoveryType;
      final places=widget.directoryLoader!=null
        ?await widget.directoryLoader!(area!,chosenType,searchRadiusKm)
        :await findOnlineShops(area:area?.label??'',
          latitude:area?.lat,longitude:area?.lng,category:chosenType,radiusKm:searchRadiusKm);
      if(requestSerial!=_onlineRequestSerial)return;
      if (!mounted) return;
      setState(() { online=places;loadingOnline=false; });
    } catch (_) {
      if (!mounted || requestSerial!=_onlineRequestSerial) return;
      setState(() {
        loadingOnline=false;
        onlineWarning='Online shop search is temporarily unavailable. Try again shortly.';
      });
    }
  }


  Future<void> load({bool silent=false}) async {
    if(!mounted)return;
    final request=++_catalogueRequest;
    setState(() { if(!silent)loading = true; catalogueError = null; });
    try {
      final next = widget.catalogueLoader!=null?await widget.catalogueLoader!():await fetchCatalogue();
      if (!mounted||request!=_catalogueRequest) return;
      var basketChanged=false;
      setState(() {
        live = next; loading = false;
        if(selected!=null){final matches=next.where((s)=>s.id==selected!.id);selected=matches.isEmpty?null:matches.first;}
        if(basketShop!=null){
          final matches=next.where((s)=>s.id==basketShop!.id);
          final current=matches.isEmpty?null:matches.first;
          for(final id in cart.keys.toList()){
            final updated=current?.products.where((p)=>p.id==id).toList()??<Product>[];
            final previous=basketShop!.products.where((p)=>p.id==id).toList();
            if(updated.isEmpty||!updated.first.inStock||updated.first.stock==0){cart.remove(id);basketChanged=true;}
            else{
              if((cart[id]??0)>updated.first.stock){cart[id]=updated.first.stock;basketChanged=true;}
              if(previous.isNotEmpty&&previous.first.priceCents!=updated.first.priceCents)basketChanged=true;
            }
          }
          basketShop=current;
        }
      });
      if(basketChanged)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Your basket was updated to the shop’s current prices and availability.')));
    } catch (_) {
      if (!mounted||request!=_catalogueRequest) return;
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
      widerSearch=false;
      selected = null;
      directorySelected = null;
      search = '';
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
      if (d != null) return d <= 35;
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
    final placeholder=SizedBox(width:width,height:height,
      child:SvgPicture.asset('assets/illustrations/shop-front.svg',
        width:width,height:height,fit:BoxFit.cover));
    final src=shop.displayPhotoUrl;
    return ClipRRect(borderRadius:BorderRadius.circular(17),
      child:src==null?placeholder:Image.network(src,width:width,height:height,
        fit:BoxFit.cover,gaplessPlayback:true,
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
    shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(20)),
    margin:const EdgeInsets.only(bottom:10),
    child:InkWell(borderRadius:BorderRadius.circular(20),
      onTap:()=>selectDirectory(place),
      child:Padding(padding:const EdgeInsets.all(11),child:Row(children:[
        onlinePhoto(place,width:94,height:91),
        const SizedBox(width:13),
        Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(place.name,maxLines:1,overflow:TextOverflow.ellipsis,
            style:const TextStyle(fontSize:15,fontWeight:FontWeight.w900,color:ink)),
          const SizedBox(height:4),
          if(place.rating!=null)Padding(padding:const EdgeInsets.only(bottom:4),
            child:shopFacts(place)),
          Text(place.address.isNotEmpty?place.address:place.area,maxLines:2,
            overflow:TextOverflow.ellipsis,
            style:const TextStyle(fontSize:11,color:muted)),
          const SizedBox(height:7),
          Row(children:[
            const Icon(Icons.place_outlined,color:green,size:14),
            const SizedBox(width:3),
            Text(area!=null&&place.lat!=null&&place.lng!=null
              ? km(area!.lat,area!.lng,place.lat!,place.lng!).toStringAsFixed(1)+' km away'
              : 'Public map listing',
              style:const TextStyle(fontSize:11,color:green,fontWeight:FontWeight.w700))
          ]),
          if(place.hasPhoto && place.photoAttributions.isNotEmpty)
            Text('Photo: '+(place.photoAttributions.first['name']??'Google contributor'),
              maxLines:1,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontSize:10,color:muted))
        ])),
        const Icon(Icons.chevron_right_rounded,color:green,size:23)
      ]))));

  List<Shop> get displayShops {
    final q=search.toLowerCase().trim();
    return nearbyReal.where((shop)=>(shop.shopCategory==discoveryType)&&
      (q.isEmpty ||
      (shop.name+' '+shop.area+' '+shop.rangeProducts.map((p)=>p.name).join(' '))
        .toLowerCase().contains(q))).toList();
  }
  List<ShopProduct> get featured {
    return discoverShopProducts(nearbyReal,type:discoveryType,category:category,query:search);
  }
  List<Product> get basketItems => basketShop?.products.where((p) =>
    (cart[p.id] ?? 0)>0).toList() ?? [];
  int get count => cart.values.fold(0, (a,b)=>a+b);
  int get total => basketItems.fold(0,(v,p)=>v+p.priceCents*(cart[p.id]??0));
  Future<void> quantity(Product p,int delta) async {
    final source=selected?.products.contains(p)==true?selected:basketShop;
    if(source==null)return;
    if(delta>0&&basketShop?.id!=source.id&&cart.isNotEmpty){
      final replace=await showDialog<bool>(context:context,builder:(dialogContext)=>AlertDialog(
        title:const Text('Start a new basket?'),
        content:Text('Your basket has items from '+basketShop!.name+
          '. Start a new basket with '+source.name+'?'),
        actions:[TextButton(onPressed:()=>Navigator.pop(dialogContext,false),child:const Text('Keep basket')),
          FilledButton(onPressed:()=>Navigator.pop(dialogContext,true),child:const Text('Start new basket'))]));
      if(replace!=true||!mounted)return;
    }
    if(!mounted)return;
    setState((){
      if(delta>0){if(basketShop?.id!=source.id)cart.clear();basketShop=source;}
      final next=(cart[p.id]??0)+delta;
      if(next<=0)cart.remove(p.id);
      else if(next<=p.stock)cart[p.id]=next;
    });
  }
  void openShop(Shop shop) => setState(() {
    shopProductSearch='';
    selected = shop;
    directorySelected = null;
    showAllShops=true;
    search = '';
    category = 'All';
    tab = tab==1?1:0;
  });

  void selectDirectory(OnlineShop shop)=>setState((){
    directorySelected=shop;selected=null;showAllShops=true;search='';tab=tab==1?1:0;
  });

  Widget photo(String url,{double size=92,IconData icon=Icons.storefront_outlined}) {
    final catalogueKey=cataloguePhotoKey(url);
    if(catalogueKey!=null)return ClipRRect(borderRadius:BorderRadius.circular(14),
      child:ColoredBox(color:Colors.white,child:CataloguePhoto(photoKey:catalogueKey,size:size)));
    final isProduct=icon==Icons.shopping_bag||icon==Icons.shopping_bag_outlined;
    final placeholder=SvgPicture.asset(
      isProduct?'assets/illustrations/grocery-basket.svg':
        'assets/illustrations/shop-front.svg',
      width:size,height:size,fit:BoxFit.cover);
    return Container(width:size,height:size,clipBehavior:Clip.antiAlias,
      decoration:BoxDecoration(color:const Color(0xFFF1F6F3),
        borderRadius:BorderRadius.circular(17)),
      child:url.startsWith('https://')?Image.network(url,
        width:size,height:size,fit:isProduct?BoxFit.contain:BoxFit.cover,
        errorBuilder:(_,__,___)=>placeholder,
        loadingBuilder:(context,child,progress)=>progress==null?child:placeholder)
        :placeholder);
  }
  
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
      color:active?const Color(0xFFE3F7EB):const Color(0xFFF6F7F7),
      borderRadius:BorderRadius.circular(18),
      child:InkWell(
        borderRadius:BorderRadius.circular(18),
        onTap:()=>setDiscoveryType(type),
        child:Container(height:38,padding:const EdgeInsets.symmetric(horizontal:12),
          alignment:Alignment.center,child:Row(mainAxisAlignment:MainAxisAlignment.center,
            children:[
              Icon(icon,color:active?green:muted,size:17),
              const SizedBox(width:6),
              Flexible(child:Text(label,maxLines:1,overflow:TextOverflow.ellipsis,
                style:TextStyle(fontSize:11,fontWeight:FontWeight.w800,
                  color:active?deep:muted)))
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


  Widget locationHeader()=>Container(color:Colors.white,
    padding:const EdgeInsets.fromLTRB(16,2,16,10),
    child:Column(children:[
      if(selected==null&&directorySelected==null)...[
        TextField(key:ValueKey(discoveryType),
          onChanged:(value)=>setState(()=>search=value),
          decoration:InputDecoration(
            hintText:discoveryType=='spaza'?'Search for products, shops…':'Search malls, wholesalers, shops…',
            hintStyle:const TextStyle(color:muted,fontSize:12),
            filled:true,fillColor:const Color(0xFFF7F8F7),
            prefixIcon:const Icon(Icons.search_rounded,color:ink,size:21),
            contentPadding:const EdgeInsets.symmetric(vertical:11),
            border:OutlineInputBorder(borderRadius:BorderRadius.circular(18),
              borderSide:const BorderSide(color:Color(0xFFEDF0EE))),
            enabledBorder:OutlineInputBorder(borderRadius:BorderRadius.circular(18),
              borderSide:const BorderSide(color:Color(0xFFEDF0EE))))),
        const SizedBox(height:8),
        Row(children:[
          _shopMode('SPAZA SHOPS','Discover local shops',Icons.storefront_rounded,'spaza',green),
          const SizedBox(width:8),
          _shopMode('OTHER RETAIL','China Mall & wholesalers',Icons.store_mall_directory_rounded,'variety',deep)
        ])
      ]
    ]));


  void openBasket()=>navigateToTab(2);
  void openInbox(){
    if(session.idToken==null||!session.emailVerified){
      navigateToTab(4);ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Sign in and verify your email to open Live chat.')));return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder:(_)=>
      ShopperChatPage(session:session)));
  }
  Future<void> openOwnerWorkspace() async {
    await Navigator.of(context).push(MaterialPageRoute(builder:(routeContext)=>
      SellerWorkspacePage(session:session,openLogin:(){
        Navigator.of(routeContext).pop();
        if(mounted)setState(()=>tab=4);
      })));
    if(mounted)await load(silent:true);
  }
  void navigateToTab(int index){
    setState(() {
      tab=index;
      if(index==0){selected=null;directorySelected=null;showAllShops=false;}
      if(index==1){selected=null;directorySelected=null;showAllShops=true;}
    });
  }
  Widget premiumNavigation()=>PremiumShopperNavigation(
    selectedIndex:tab,cartCount:count,onSelect:navigateToTab);

  @override
  Widget build(BuildContext context) {
    if(!_launchReady)return const ShopperLaunchScreen();
    return Scaffold(
      appBar:AppBar(backgroundColor:Colors.white,foregroundColor:ink,
        elevation:0,toolbarHeight:56,titleSpacing:14,
        title:Row(children:[
          Semantics(label:'Teyza',child:SvgPicture.asset(
            'assets/brand/teyza-sprout-wordmark.svg',width:98,height:36,fit:BoxFit.contain)),
          const SizedBox(width:14),
          Expanded(child:InkWell(onTap:areaSheet,borderRadius:BorderRadius.circular(12),
            child:Padding(padding:const EdgeInsets.symmetric(vertical:9),child:Row(children:[
              const Icon(Icons.location_on_outlined,color:ink,size:19),
              const SizedBox(width:5),
              Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                const Text('Shopping near',style:TextStyle(color:muted,fontSize:10)),
                Text(_usingGps?_currentLocationDetail:locationName,maxLines:1,
                  overflow:TextOverflow.ellipsis,
                  style:const TextStyle(color:ink,fontSize:12,fontWeight:FontWeight.w700))
              ])),
              if(geolocating)const SizedBox(width:12,height:12,child:CircularProgressIndicator(strokeWidth:2))
              else const Icon(Icons.keyboard_arrow_down_rounded,size:16,color:muted)
            ]))))
        ]),
        actions:[
          IconButton(tooltip:'Messages',onPressed:openInbox,
            icon:Badge(isLabelVisible:unreadChats>0,
              label:Text(unreadChats>99?'99+':unreadChats.toString()),
              child:const Icon(Icons.notifications_none_rounded,size:25))),
          const SizedBox(width:3)
        ]),
      body:tab==4?ShopperAccountPanel(session:session,
          onOpenOwner:openOwnerWorkspace,onShopperSignedIn:()=>navigateToTab(0),
          onMessages:openInbox,onOrders:()=>navigateToTab(3),onBrowse:()=>navigateToTab(1)):
        tab==3?ShopOrdersPanel(session:session,onLogin:()=>navigateToTab(4)):
        tab==2?basketPage():
        Column(children:[locationHeader(),Expanded(child:
          selected!=null?shopPage(selected!):
          directorySelected!=null?directoryPage(directorySelected!):
          tab==1||showAllShops?allShopsPage():homePage())]),
      bottomNavigationBar:premiumNavigation(),
    );
  }


  Widget groceryAisles()=>SizedBox(height:70,child:Row(
    mainAxisAlignment:MainAxisAlignment.spaceBetween,
    children:<(String,String,IconData)>[
      ('All','All',Icons.grid_view_rounded),('Veg & Fruit','Fresh',Icons.eco_outlined),
      ('Meat','Meat',Icons.kebab_dining_outlined),('Pantry','Pantry',Icons.kitchen_outlined),
      ('Drinks','Drinks',Icons.local_drink_outlined)
    ].map((item)=>Expanded(child:InkWell(
      onTap:()=>setState(()=>category=item.$2),borderRadius:BorderRadius.circular(14),
      child:Column(mainAxisAlignment:MainAxisAlignment.center,children:[
        Container(width:42,height:42,decoration:BoxDecoration(shape:BoxShape.circle,
          color:category==item.$2?green:const Color(0xFFF0F4F1),
          border:Border.all(color:category==item.$2?green:const Color(0xFFE8EEEA))),
          child:Icon(item.$3,color:category==item.$2?Colors.white:green,size:21)),
        const SizedBox(height:5),
        Text(item.$1,maxLines:1,style:TextStyle(fontSize:10,color:ink,
          fontWeight:category==item.$2?FontWeight.w700:FontWeight.w400))
      ])))).toList()));

  Widget premiumGroceryHero()=>Container(
    margin:const EdgeInsets.only(bottom:3,top:7),
    decoration:BoxDecoration(color:const Color(0xFFEDE9E0),borderRadius:BorderRadius.circular(21)),
    clipBehavior:Clip.antiAlias,
    child:Row(children:[
      Expanded(child:Padding(padding:const EdgeInsets.fromLTRB(16,14,0,14),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(discoveryType=='spaza'?'Fresh groceries\nfrom your local\nspaza shops':'More choice.\nCloser to home.',
            style:const TextStyle(color:deep,fontSize:21,fontWeight:FontWeight.w700,height:1.1)),
          const SizedBox(height:7),
          const Text('Good food. Stronger communities.',
            style:TextStyle(color:Color(0xFF566660),fontSize:10,height:1.3)),
          const SizedBox(height:10),
          FilledButton(onPressed:()=>navigateToTab(1),
            style:FilledButton.styleFrom(minimumSize:Size.zero,
              padding:const EdgeInsets.symmetric(horizontal:14,vertical:9),
              textStyle:const TextStyle(fontFamily:'PT Sans',fontWeight:FontWeight.w700,fontSize:11)),
            child:const Row(mainAxisSize:MainAxisSize.min,children:[
              Text('Explore shops'),SizedBox(width:7),Icon(Icons.arrow_forward_rounded,size:15)]))
        ]))),
      SizedBox(width:128,height:154,child:Image.asset('assets/images/grocery-basket.png',fit:BoxFit.contain))
    ]));

  List<NearbyListing> get nearbyListings=>mergeNearbyListings(displayShops,displayedOnline,area:area);
  Widget shopFacts(OnlineShop shop)=>Row(children:[
    if(shop.rating!=null)...[
      const Icon(Icons.star_rounded,color:Color(0xFFF3B929),size:13),
      const SizedBox(width:3),
      Flexible(child:Text(shop.rating!.toStringAsFixed(1)+
        (shop.ratingCount!=null?' ('+shop.ratingCount.toString()+')':''),
        overflow:TextOverflow.ellipsis,style:const TextStyle(color:ink,fontSize:10)))
    ],
    if(shop.openNow!=null)...[
      const SizedBox(width:7),
      Container(padding:const EdgeInsets.symmetric(horizontal:5,vertical:2),
        decoration:BoxDecoration(color:shop.openNow!?const Color(0xFFE2F8EB):const Color(0xFFF3F3F3),
          borderRadius:BorderRadius.circular(7)),
        child:Text(shop.openNow!?'Open now':'Closed',style:TextStyle(fontSize:9,
          color:shop.openNow!?const Color(0xFF168A54):muted)))
    ]
  ]);
  Widget nearbyCard(NearbyListing entry){
    final merchant=entry.merchant,directory=entry.directory;
    final d=area==null||entry.lat==null||entry.lng==null?null:km(area!.lat,area!.lng,entry.lat!,entry.lng!);
    return InkWell(key:ValueKey('nearby-'+(merchant?.id??directory!.id)),
      onTap:(){if(merchant!=null)openShop(merchant);else selectDirectory(directory!);},
      borderRadius:BorderRadius.circular(18),
      child:Container(width:176,margin:const EdgeInsets.only(right:11,bottom:6),
        decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),
          border:Border.all(color:const Color(0xFFEBEFEC))),clipBehavior:Clip.antiAlias,
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          SizedBox(width:176,height:102,child:merchant?.photo.isNotEmpty==true
            ?photo(merchant!.photo,size:176):directory!=null?onlinePhoto(directory,width:176,height:102)
            :photo('',size:176)),
          Padding(padding:const EdgeInsets.fromLTRB(9,8,9,7),child:Column(
            crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(entry.name,maxLines:1,overflow:TextOverflow.ellipsis,
                style:const TextStyle(color:ink,fontSize:12,fontWeight:FontWeight.w700)),
              const SizedBox(height:4),
              if(directory!=null&&(directory.rating!=null||directory.openNow!=null))shopFacts(directory),
              const SizedBox(height:3),
              Text((d==null?'Nearby':d.toStringAsFixed(1)+' km')+
                (merchant!=null?' · On Teyza':directory?.origin=='google_places'?' · Google Maps':' · OpenStreetMap'),
                maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(color:muted,fontSize:10)),
              if(directory?.photoAttributions.isNotEmpty==true)
                Text('Photo: '+(directory!.photoAttributions.first['name']??''),maxLines:1,
                  overflow:TextOverflow.ellipsis,style:const TextStyle(color:muted,fontSize:9))
            ]))
        ])));
  }

  Widget section(String title,{String? subtitle,Widget? action})=> Padding(
    padding:const EdgeInsets.fromLTRB(0,20,0,12), child:Row(children:[
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:const TextStyle(fontWeight:FontWeight.w900,fontSize:19,color:ink)),
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
    child:ListView(key:const PageStorageKey<String>('shopper-home'),
      padding:const EdgeInsets.fromLTRB(16,7,16,28),children:[
      if(locationWarning!=null)Card(color:const Color(0xFFFFF2DE),
        child:Padding(padding:const EdgeInsets.all(12),child:Text(locationWarning!))),
      if(catalogueError!=null)Padding(padding:const EdgeInsets.only(bottom:7),
        child:Text(catalogueError!,style:const TextStyle(color:muted,fontSize:11))),
      if(discoveryType=='spaza')groceryAisles(),
      premiumGroceryHero(),
      const SizedBox(height:4),
      section('Nearby shops',
        subtitle:area==null?'Choose your area to find nearby shops':
          'Local shops around '+locationName,
        action:TextButton(onPressed:()=>setState(()=>showAllShops=true),
          child:const Text('See all'))),
      if(displayedOnline.isNotEmpty||displayShops.isNotEmpty)
        SizedBox(height:213,child:ListView(scrollDirection:Axis.horizontal,
          children:nearbyListings.take(30).map(nearbyCard).toList()))
      else if(loadingOnline)const SizedBox(height:106,
        child:Center(child:CircularProgressIndicator()))
      else InkWell(onTap:areaSheet,child:empty('Find nearby shops',
        'Use your current location or select a shopping area.')),
      const SizedBox(height:9),
      section(discoveryType=='spaza'?(featured.isNotEmpty?'Popular items':'Everyday essentials'):'Explore other retail',
        subtitle:discoveryType=='spaza'?'Everyday essentials, closer to home':
          'Variety stores, malls, wholesalers and more',
        action:TextButton(onPressed:()=>setState(()=>showAllShops=true),
          child:const Text('Explore all'))),
      if(featured.isNotEmpty)productShelf(featured)else if(discoveryType=='spaza')essentialsShelf(),
      Material(color:deep,borderRadius:BorderRadius.circular(20),
        child:InkWell(borderRadius:BorderRadius.circular(20),
          onTap:()=>Navigator.of(context).push(MaterialPageRoute(
            builder:(_)=>Scaffold(
              appBar:AppBar(title:const Text('Shop services')),
              body:servicesPage()))),
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
      ...displayShops.take(8).map(shopTile),
      if(displayShops.isEmpty)
        empty('More shops joining Teyza',
          'Local directory listings are shown separately. Only participating shops publish products and services.'),
      section(discoveryType=='spaza'?'More neighbourhood shops':'More retailers to explore',
        subtitle:'Public shop listings · confirm products with the owner'),
      if(loadingOnline)const Padding(padding:EdgeInsets.all(12),
        child:Center(child:CircularProgressIndicator())),
      if(onlineWarning!=null)Text(onlineWarning!,
        style:const TextStyle(color:muted,fontSize:12)),
      ...displayedOnline.take(18).map(onlineTile),
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
    borderRadius:BorderRadius.circular(20),
    child:Container(width:194,margin:const EdgeInsets.only(right:12,bottom:8),
      padding:const EdgeInsets.all(9),
      decoration:BoxDecoration(color:Colors.white,
        borderRadius:BorderRadius.circular(20),
        boxShadow:const [BoxShadow(color:Color(0x0A010F1C),
          offset:Offset(0,4),blurRadius:11)]),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        onlinePhoto(s,width:176,height:109),
        const SizedBox(height:7),
        Text(s.name,maxLines:1,overflow:TextOverflow.ellipsis,
          style:const TextStyle(color:ink,fontSize:13,fontWeight:FontWeight.w900)),
        const SizedBox(height:4),
        Row(children:[
          const Icon(Icons.location_on_outlined,color:green,size:13),
          Expanded(child:Text(area!=null&&s.lat!=null&&s.lng!=null
            ?km(area!.lat,area!.lng,s.lat!,s.lng!).toStringAsFixed(1)+' km away'
            :'Nearby shop',maxLines:1,overflow:TextOverflow.ellipsis,
              style:const TextStyle(color:muted,fontSize:11))),
          Text(s.origin=='google_places'?'Google Maps':'OpenStreetMap',
            style:const TextStyle(fontSize:9,color:muted))
        ]),
        if(s.hasPhoto && s.photoAttributions.isNotEmpty)
          Text('Photo: '+(s.photoAttributions.first['name']??'Google contributor'),
            maxLines:1,overflow:TextOverflow.ellipsis,
            style:const TextStyle(fontSize:9,color:muted))
      ])));

  Widget essentialsShelf(){
    const items=<(String,String,String)>[
      ('Bread','bread','Bakery'),('Milk','milk','Dairy'),
      ('Eggs','eggs','Dairy'),('Rice','rice','Pantry'),
      ('Maize meal','maize','Pantry'),('Cooking oil','oil','Pantry'),
      ('Snacks','snacks','Snacks'),('Cleaning','soap','Household')
    ];
    final matching=items.where((x)=>category=='All'||x.$3==category).toList();
    if(matching.isEmpty)return empty('Find '+category.toLowerCase()+' nearby',
      'Open a participating shop to view its published products.');
    return SizedBox(height:178,child:ListView(scrollDirection:Axis.horizontal,
      children:matching.map((x)=>
        Container(width:132,margin:const EdgeInsets.only(right:11),
          padding:const EdgeInsets.all(10),
          decoration:BoxDecoration(color:Colors.white,
            borderRadius:BorderRadius.circular(20),
            boxShadow:const [BoxShadow(color:Color(0x0A010F1C),
              blurRadius:9,offset:Offset(0,3))]),
          child:Column(children:[
            Expanded(child:Image.asset(
              'assets/images/essentials/'+x.$2+'.webp',fit:BoxFit.contain,
              semanticLabel:x.$1+' category photograph')),
            const SizedBox(height:5),
            Text(x.$1,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:12)),
            const Text('Shop category',style:TextStyle(color:muted,fontSize:10))
          ]))).toList()));
  }

  Widget quickShop(Shop s)=>InkWell(onTap:()=>openShop(s),
    borderRadius:BorderRadius.circular(20),
    child:Container(width:194,margin:const EdgeInsets.only(right:12,bottom:8),
      padding:const EdgeInsets.all(9),
      decoration:BoxDecoration(color:Colors.white,
        borderRadius:BorderRadius.circular(20),
        boxShadow:const [BoxShadow(color:Color(0x0A010F1C),
          offset:Offset(0,4),blurRadius:11)]),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        SizedBox(height:109,width:176,
          child:photo(s.photo,size:176,icon:Icons.store)),
        const SizedBox(height:7),
        Text(s.name,maxLines:1,overflow:TextOverflow.ellipsis,
          style:const TextStyle(fontSize:13,fontWeight:FontWeight.w900,color:ink)),
        const SizedBox(height:4),
        Text(s.rangeProducts.isEmpty?'Registered Teyza shop':
          s.rangeProducts.length.toString()+' shop products',
          style:const TextStyle(fontSize:10,color:green,fontWeight:FontWeight.w700))
      ])));

  Widget productShelf(List<ShopProduct> items) {
    if(items.isEmpty)return empty('No products to display','Choose another category or area.');
    return SizedBox(height:248,child:ListView(scrollDirection:Axis.horizontal,
      children:items.take(18).map((entry){
        final p=entry.product;
        return Container(width:166,margin:const EdgeInsets.only(right:10),child:Material(
          color:Colors.white,borderRadius:BorderRadius.circular(18),child:InkWell(
            borderRadius:BorderRadius.circular(18),onTap:()=>openShop(entry.shop),
            child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Center(child:photo(p.picture,size:104,icon:Icons.shopping_bag)),
              const SizedBox(height:8),Text(p.name,maxLines:2,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontSize:12,fontWeight:FontWeight.w800)),
              Text(entry.shop.name,maxLines:1,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontSize:11,color:green,fontWeight:FontWeight.w700)),
              const Spacer(),Text(p.priceCents>0?rand(p.priceCents):'Ask shop for price',
                style:TextStyle(fontSize:p.priceCents>0?17:13,fontWeight:FontWeight.w800,color:ink)),
              const SizedBox(height:4),const Text('View this shop →',style:TextStyle(color:muted,fontSize:10))
            ])))));
      }).toList()));
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
          Text((s.rangeProducts.isEmpty?'Shop listed on Teyza':s.rangeProducts.length.toString()+' products')+
            (distance(s)!=null?' · '+distance(s)!.toStringAsFixed(1)+' km':''),
            style:const TextStyle(color:green,fontSize:12,fontWeight:FontWeight.bold))
        ])),
        const Icon(Icons.chevron_right,color:green)
      ]))));


  Widget allShopsPage()=>RefreshIndicator(onRefresh:reloadOnline,
    child:ListView.builder(key:PageStorageKey<String>('shopper-shops-'+discoveryType),
      padding:const EdgeInsets.all(16),
      itemCount:nearbyListings.length+1,itemBuilder:(context,index){
        if(index==0)return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          section(discoveryType=='spaza'?'Nearby spaza shops':'Other retail nearby',
            subtitle:nearbyListings.length.toString()+' shops · within '+searchRadiusKm.toString()+' km'),
          Row(children:[
            Expanded(child:Text('Around '+locationName,style:const TextStyle(color:muted,fontSize:12))),
            TextButton.icon(onPressed:loadingOnline||area==null?null:() async {
              setState(()=>widerSearch=!widerSearch);await reloadOnline();
            },icon:const Icon(Icons.radar_rounded,size:17),
              label:Text(widerSearch?'Search closer':'Search wider'))
          ]),
          if(loadingOnline)const Padding(padding:EdgeInsets.all(14),child:Center(child:CircularProgressIndicator())),
          if(onlineWarning!=null)Text(onlineWarning!,style:const TextStyle(color:muted)),
          if(nearbyListings.isEmpty&&!loadingOnline)empty('Find your neighbourhood shops',
            'Choose an area or search wider to discover more shops.'),
          const SizedBox(height:8)
        ]);
        final entry=nearbyListings[index-1];
        return entry.merchant!=null?shopTile(entry.merchant!):onlineTile(entry.directory!);
      }));

  Widget directoryPage(OnlineShop shop)=>ListView(
    padding:const EdgeInsets.all(18),children:[
      TextButton.icon(onPressed:()=>setState(()=>directorySelected=null),
        icon:const Icon(Icons.arrow_back),label:const Text('Browse all shops')),
      const SizedBox(height:10),
      SizedBox(width:double.infinity,height:210,
        child:onlinePhoto(shop,width:420,height:210)),
      if(shop.hasPhoto)...[
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
      if(shop.rating!=null||shop.openNow!=null)Padding(
        padding:const EdgeInsets.only(bottom:10),child:shopFacts(shop)),
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
          Text('This shop has been found on public maps. Confirm products, prices '
            'and services with its owner before visiting.',
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

  void chatWithShop(Shop shop,{String? message}){
    if(session.idToken==null||!session.emailVerified){
      navigateToTab(4);ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Sign in and verify your account to chat with this shop.')));return;
    }
    Navigator.push(context,MaterialPageRoute(builder:(_)=>ShopperChatPage(session:session,
      initialShop:ShopperConversation(shop.id,shop.name),initialMessage:message)));
  }

  Widget shopPage(Shop shop)=>RefreshIndicator(onRefresh:()=>load(silent:true),child:ListView(physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.all(16),children:[
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
          label:const Text('Live chat with this shop'),onPressed:()=>chatWithShop(shop)))),
    Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(shopHoursLabel(shop.hours),
      style:const TextStyle(color:green,fontWeight:FontWeight.w700))),
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
    if(shop.rangeProducts.isEmpty)
      empty('Products coming soon', 'Ask this shop about its range in Live chat.'),
    if(shop.rangeProducts.isNotEmpty)...[
      section(shop.products.isEmpty?'Sold here':'Available products',subtitle:'Selected by '+shop.name),
      Padding(padding:const EdgeInsets.only(bottom:12),child:TextField(key:ValueKey('search-${shop.id}'),
        onChanged:(value)=>setState(()=>shopProductSearch=value),
        decoration:const InputDecoration(hintText:'Search this shop’s products',prefixIcon:Icon(Icons.search),border:OutlineInputBorder()))),
      if(shop.rangeProducts.any((p)=>cataloguePhotoKey(p.picture)!=null))
        const Padding(padding:EdgeInsets.only(bottom:12),child:Text('Reference photos show product types. Brands and packaging may differ.',
          style:TextStyle(fontSize:11,color:muted))),
      shopRangeGrid(shop)
    ]
  ]));
  Widget shopRangeGrid(Shop shop)=>LayoutBuilder(builder:(context,c){
    final products=shop.rangeProducts.where((p)=>p.name.toLowerCase().contains(shopProductSearch.toLowerCase().trim())).toList();
    if(products.isEmpty)return const Padding(padding:EdgeInsets.all(18),child:Text('This shop has no matching products. Try another search.'));
    final large=MediaQuery.textScalerOf(context).scale(14)>18;
    return GridView.builder(shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),itemCount:products.length,
      gridDelegate:SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:large?1:c.maxWidth>680?4:2,
        mainAxisSpacing:12,crossAxisSpacing:12,mainAxisExtent:290+(MediaQuery.textScalerOf(context).scale(14)-14)*6),
      itemBuilder:(context,index){
        final p=products[index];
        final canOrder=p.priceCents>0&&p.stock>0&&p.inStock;
        final added=basketShop?.id==shop.id?(cart[p.id]??0):0;
        return Material(color:Colors.white,borderRadius:BorderRadius.circular(20),child:Padding(
          padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Expanded(child:Center(child:photo(p.picture,size:116,icon:Icons.shopping_bag_outlined))),
            const SizedBox(height:8),Text(p.name,maxLines:2,overflow:TextOverflow.ellipsis,
              style:const TextStyle(fontWeight:FontWeight.w800,fontSize:13)),
            const SizedBox(height:5),Text(p.priceCents>0?rand(p.priceCents):'Ask shop for price',
              style:TextStyle(fontSize:p.priceCents>0?17:13,color:ink,fontWeight:FontWeight.w800)),
            Text(!p.inStock?'Out of stock':p.priceCents>0?'${p.stock} in stock':'Ask about availability',
              style:TextStyle(color:p.inStock?muted:Colors.deepOrange,fontSize:11)),
            const SizedBox(height:6),SizedBox(width:double.infinity,child:FilledButton(
              onPressed:canOrder?()=>quantity(p,1):()=>chatWithShop(shop,message:'Hi, is '+p.name+' available?'),
              style:FilledButton.styleFrom(padding:const EdgeInsets.symmetric(horizontal:5,vertical:7)),
              child:Text(canOrder?(added==0?'+ Add':'Add more ($added)'):'Ask this shop',maxLines:1,
                style:const TextStyle(fontSize:12))))
          ])));
      });
  });
  Widget empty(String title,String message)=>Card(color:Colors.white,
    child:Padding(padding:const EdgeInsets.all(22),child:Column(children:[
      const Icon(Icons.storefront_outlined,color:green,size:40),
      Text(title,style:const TextStyle(fontWeight:FontWeight.bold,fontSize:18)),
      Text(message,style:const TextStyle(color:muted),textAlign:TextAlign.center)
    ])));

  Future<void> requestOrder() async {
    final shop=basketShop;if(shop==null||basketItems.isEmpty)return;
    if(session.idToken==null||!session.emailVerified){
      navigateToTab(4);ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Sign in and verify your email to send an order request.')));return;
    }
    final done=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>ShopperCheckoutPage(
      session:session,shopId:shop.id,shopName:shop.name,delivery:shop.delivery,collection:shop.pickup,
      deliveryFeeCents:shop.deliveryFeeCents,items:basketItems.map((p)=>{
        'id':p.id,'name':p.name,'quantity':cart[p.id]??0,'priceCents':p.priceCents}).toList())));
    if(done==true&&mounted){setState((){cart.clear();basketShop=null;});navigateToTab(3);}
  }

  Widget basketPage({VoidCallback? refresh})=>ListView(
    padding:const EdgeInsets.fromLTRB(17,22,17,30),children:[
      const Text('Your basket',style:TextStyle(
        fontSize:25,color:ink,fontWeight:FontWeight.w900)),
      const SizedBox(height:5),
      Text(basketShop==null?'Discover a participating shop to get started':
        'Items from '+basketShop!.name,
        style:const TextStyle(color:muted,fontSize:13)),
      const SizedBox(height:16),
      if(basketShop==null||basketItems.isEmpty)
        Container(padding:const EdgeInsets.all(24),
          decoration:BoxDecoration(color:Colors.white,
            borderRadius:BorderRadius.circular(22)),
          child:Column(children:[
            SvgPicture.asset('assets/illustrations/grocery-basket.svg',
              width:190,height:150,fit:BoxFit.contain),
            const SizedBox(height:14),
            const Text('Your basket is empty',style:TextStyle(
              color:ink,fontSize:18,fontWeight:FontWeight.w800)),
            const SizedBox(height:5),
            const Text('Select a participating Teyza shop and add items.',
              textAlign:TextAlign.center,
              style:TextStyle(color:muted,fontSize:12))
          ]))
      else ...[
        ...basketItems.map((p)=>Container(
          margin:const EdgeInsets.only(bottom:11),
          padding:const EdgeInsets.all(11),
          decoration:BoxDecoration(color:Colors.white,
            borderRadius:BorderRadius.circular(20),
            boxShadow:const [BoxShadow(color:Color(0x0B010F1C),
              blurRadius:10,offset:Offset(0,3))]),
          child:Row(children:[
            photo(p.picture,size:77,icon:Icons.shopping_bag),
            const SizedBox(width:12),
            Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(p.name,maxLines:2,overflow:TextOverflow.ellipsis,
                style:const TextStyle(color:ink,fontSize:14,
                  fontWeight:FontWeight.w800)),
              const SizedBox(height:4),
              Text('Unit '+rand(p.priceCents),
                style:const TextStyle(color:muted,fontSize:11)),
              const SizedBox(height:7),
              Text(rand(p.priceCents*(cart[p.id]??0)),
                style:const TextStyle(color:deep,fontSize:15,
                  fontWeight:FontWeight.w900))
            ])),
            Container(decoration:BoxDecoration(
              color:const Color(0xFFF4F8F6),
              borderRadius:BorderRadius.circular(16)),
              child:Row(mainAxisSize:MainAxisSize.min,children:[
                IconButton(tooltip:'Remove one '+p.name,
                  onPressed:(){quantity(p,-1);refresh?.call();},
                  icon:const Icon(Icons.remove_rounded,color:ink,size:16),
                  constraints:const BoxConstraints(minHeight:35,minWidth:34),
                  padding:EdgeInsets.zero),
                Text((cart[p.id]??0).toString(),
                  style:const TextStyle(color:ink,fontSize:13,
                    fontWeight:FontWeight.w800)),
                IconButton(tooltip:'Add one '+p.name,
                  onPressed:(cart[p.id]??0)>=p.stock?null:(){
                    quantity(p,1);refresh?.call();
                  },
                  icon:const Icon(Icons.add_rounded,color:green,size:16),
                  constraints:const BoxConstraints(minHeight:35,minWidth:34),
                  padding:EdgeInsets.zero)
              ]))
          ]))),
        const SizedBox(height:7),
        Container(
          padding:const EdgeInsets.all(18),
          decoration:BoxDecoration(color:Colors.white,
            borderRadius:BorderRadius.circular(20)),
          child:Column(children:[
            const Row(children:[
              Expanded(child:Text('Order summary',
                style:TextStyle(fontSize:17,color:ink,fontWeight:FontWeight.w900)))
            ]),
            const SizedBox(height:14),
            Row(children:[
              const Text('Item subtotal',style:TextStyle(color:muted)),
              const Spacer(),
              Text(rand(total),style:const TextStyle(
                color:ink,fontWeight:FontWeight.w800))
            ]),
            const SizedBox(height:10),
            const Row(children:[
              Expanded(child:Text('Delivery or collection',
                style:TextStyle(color:muted))),
              Text('Confirm with shop',style:TextStyle(
                color:muted,fontSize:12))
            ]),
            const Divider(height:27),
            Row(children:[
              const Expanded(child:Text('Estimated total',
                style:TextStyle(color:ink,fontSize:16,fontWeight:FontWeight.w900))),
              const SizedBox(width:12),
              Flexible(child:FittedBox(fit:BoxFit.scaleDown,alignment:Alignment.centerRight,
                child:Text(rand(total),style:const TextStyle(
                  color:deep,fontSize:23,fontWeight:FontWeight.w900))))
            ])
          ])),
        const SizedBox(height:15),
        SizedBox(width:double.infinity,child:FilledButton.icon(
          onPressed:(!basketShop!.pickup&&!basketShop!.delivery)?null:requestOrder,
          icon:const Icon(Icons.chat_bubble_outline_rounded,size:19),
          label:const Text('Choose delivery or collection'))),
        if(!basketShop!.pickup&&!basketShop!.delivery)
          const Padding(padding:EdgeInsets.only(top:12),
            child:Text('This shop has not enabled delivery or collection yet. Ask the shop in Live chat.',
              textAlign:TextAlign.center,
              style:TextStyle(color:muted,fontSize:12))),
        const SizedBox(height:13),
        const Text('Prices and stock must be confirmed by the shop. '
          'No payment is taken inside Teyza Shopper.',
          textAlign:TextAlign.center,
          style:TextStyle(color:muted,fontSize:12,height:1.4))
      ]
    ]);
  Widget infoPage()=>ListView(padding:const EdgeInsets.all(22),children:[
    const Icon(Icons.storefront_rounded,size:66,color:green),
    const SizedBox(height:12),
    const Text('TEYZA Shopper',style:TextStyle(
      fontWeight:FontWeight.w900,fontSize:28),textAlign:TextAlign.center),
    const SizedBox(height:10),
    const Text('Discover spaza shops in your area and shop their listed groceries.',
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
    final placeholder=SvgPicture.asset('assets/illustrations/shop-front.svg',
      width:62,height:62,fit:BoxFit.cover);
    final src=shop.displayPhotoUrl;
    return ClipRRect(borderRadius:BorderRadius.circular(15),
      child:src==null?placeholder:Image.network(src,width:62,height:62,
        fit:BoxFit.cover,errorBuilder:(_,__,___)=>placeholder));
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
