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
import 'shopper_delivery_profile.dart';
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
import 'seller_push.dart';
import 'seller_notifications.dart';
import 'seller_firestore.dart';
import 'shop_directions.dart';

const ink = Color(0xFF0B1C2C);
const deep = Color(0xFF010F1C);
const green = Color(0xFF3BB77E);
const aqua = Color(0xFFB8EDD3);
const pale = Color(0xFFFAFBFA);
const muted = Color(0xFF6C7880);
const catalogUrl = 'https://teyza.co.za/api/shopper-catalog.php';
const photos = 'https://teyza.co.za/assets/catalog-real/';
String rand(int cents) => 'R' + (cents / 100).toStringAsFixed(2);

// Shopper, wholesaler and local-business journeys use separate actions.
String teyzaBrowseLabel(String type) => type=='wholesale'?'Browse wholesalers':
  type=='variety'?'Browse local businesses':'Browse all shops';
String teyzaCategoryHeading(String type) => type=='wholesale'?'Nearby wholesalers':
  type=='variety'?'Local Businesses':'Nearby shops';
String teyzaListingAction(String type) => type=='spaza'?'Buy here':'More';

// Older listings used shorter category names. Keep them discoverable beside
// the current catalogue categories without relabelling the seller's product.
String teyzaProductCategory(String value) {
  final key=value.trim().toLowerCase();
  if(['fresh','veg & fruit','fruit & veg','fruit and vegetables'].contains(key))return 'Fruit & Veg';
  if(['dairy','dairy & eggs'].contains(key))return 'Dairy & Eggs';
  return value.trim();
}

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
  final String address,city,googlePlaceId;
  final bool pickup, delivery;
  final double? latitude, longitude;
  final List<Product> products;
  final List<Product> highlights;
  final String shopCategory;
  final bool? acceptsCard, cashback;
  final bool sponsored,identityVerified;
  final bool liveChat;
  final double? rating;
  final int ratingCount;
  final List<TradingDay> hours;
  final int deliveryFeeCents;
  final int cashDiscountPercent;
  List<Product> get rangeProducts=>{
    for(final p in highlights)p.id:p,for(final p in products)p.id:p
  }.values.toList();
  const Shop(this.id, this.name, this.area, this.photo, this.phone,
    this.pickup, this.delivery, this.products,
    {this.latitude, this.longitude,this.shopCategory='spaza',this.address='',this.city='',this.googlePlaceId='',
    this.acceptsCard,this.cashback,this.sponsored=false,this.identityVerified=false,this.liveChat=true,this.rating,this.ratingCount=0,this.hours=const [],this.deliveryFeeCents=0,this.cashDiscountPercent=0,this.highlights=const []});
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
    address:(x['address']??'').toString(),city:(x['city']??'').toString(),googlePlaceId:(x['googlePlaceId']??'').toString(),
    shopCategory:x['shopCategory']=='wholesale'?'wholesale':['variety','retail'].contains(x['shopCategory'])?'variety':'spaza',
    acceptsCard:x['services'] is Map &&
      (x['services'] as Map)['cardPayments'] is bool
        ?(x['services'] as Map)['cardPayments'] as bool:null,
    cashback:x['services'] is Map &&
      (x['services'] as Map)['cashback'] is bool
        ?(x['services'] as Map)['cashback'] as bool:null,
    liveChat:x['services'] is! Map || (x['services'] as Map)['liveChat']!=false,
    rating:(x['rating'] as num?)?.toDouble(),ratingCount:(x['ratingCount'] as num?)?.toInt()??0,
    identityVerified:x['identityVerified']==true,sponsored:x['sponsored']==true,hours:mobileRows(x['hours']).map(TradingDay.fromJson).toList(),
    deliveryFeeCents:(x['deliveryFeeCents'] as num?)?.toInt()??0,
    cashDiscountPercent:x['services'] is Map&&(x['services'] as Map)['cashDiscountPercent']==10?10:0,
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
      if(p.inStock&&seen.add('${shop.id}/${p.id}')&&(category=='All'||teyzaProductCategory(p.category)==category)&&
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
      ((shop.origin=='google_places'&&shop.placeId.isNotEmpty&&entry.merchant!.googlePlaceId==shop.placeId)||
      (normal(entry.name)==normal(shop.name)&&entry.lat!=null&&entry.lng!=null&&
      shop.lat!=null&&shop.lng!=null&&km(entry.lat!,entry.lng!,shop.lat!,shop.lng!)<.15)));
    if(match>=0){entries[match]=NearbyListing(merchant:entries[match].merchant,directory:shop);}
    else{entries.add(NearbyListing(directory:shop));}
  }
  double d(NearbyListing s)=>area==null||s.lat==null||s.lng==null?double.infinity:
    km(area.lat,area.lng,s.lat!,s.lng!);
  entries.sort((a,b){
    // Sponsored shops are promoted only within the selected local area.
    // Never rank a distant shop ahead of locally relevant options.
    final aLocal=d(a)<=35,bLocal=d(b)<=35;
    if(aLocal!=bLocal)return aLocal?-1:1;
    if(aLocal&&bLocal){
      final aFeatured=a.merchant?.sponsored==true,bFeatured=b.merchant?.sponsored==true;
      if(aFeatured!=bFeatured)return aFeatured?-1:1;
    }
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
String _areaWords(String value)=>value.toLowerCase().replaceAll(RegExp(r'ethekwini(?: metropolitan municipality| municipality)?'),'durban')
  .replaceAll(RegExp(r'city of tshwane|tshwane'),'pretoria').replaceAll(RegExp(r'[^a-z0-9]+'),' ').trim();
bool shopMatchesArea(Shop shop,Area? area,{bool allRegistered=false,double radiusKm=35}){
  if(allRegistered||area==null)return true;
  final lat=shop.latitude,lng=shop.longitude;
  if(lat!=null&&lng!=null&&lat.isFinite&&lng.isFinite&&lat.abs()<=90&&lng.abs()<=180&&!(lat==0&&lng==0))
    return km(area.lat,area.lng,lat,lng)<=radiusKm;
  final city=_areaWords(shop.city).replaceFirst(RegExp(r'^city of '),'');
  final targetCity=_areaWords(area.city).replaceFirst(RegExp(r'^city of '),'');
  if(city.isNotEmpty&&targetCity.isNotEmpty&&city!=targetCity&&city!=_areaWords(area.label))return false;
  final words=' ${_areaWords('${shop.area} ${shop.city} ${shop.address}')} ';
  return [area.label,area.city].where((s)=>s.trim().isNotEmpty).any((s)=>words.contains(' ${_areaWords(s)} '))||
    (city.isNotEmpty&&targetCity.isNotEmpty&&city==targetCity);
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
  final ShopperSession? session;
  final ShopperDeliveryProfileStore? shopperProfileStore;
  final SellerFirestore Function(String uid,String token)? sellerApiFactory;
  final TeyzaMobileApi? sellerMobileApi;
  final Future<bool> Function(Uri)? externalLauncher;
  const ShopperHome({super.key,this.catalogueLoader,this.directoryLoader,
    this.initialArea,this.enableBackgroundServices=true,this.session,this.shopperProfileStore,
    this.sellerApiFactory,this.sellerMobileApi,this.externalLauncher});
  @override
  State<ShopperHome> createState() => _ShopperHomeState();
}
class _ShopperHomeState extends State<ShopperHome> with WidgetsBindingObserver {
  Area? area;
  ShopperDeliveryProfile? deliveryProfile;
  ShopperDeviceDeliveryLocation? rememberedLocation;
  late final deliveryProfileStore=widget.shopperProfileStore??ShopperDeliveryProfileStore();
  int _deliveryProfileRequest=0;
  bool _deliverySheetOpen=false;
  String? deliveryProfileWarning;
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
  bool showAllSellers=false;
  Shop? selected;
  Shop? basketShop;
  OnlineShop? directorySelected;
  String? selectedDirectoryPhone;
  int _directoryContactRequest=0;
  String search = '';
  String category = 'All';
  String shopProductSearch='';
  String productTabSearch='';
  final productTabController=TextEditingController();
  int tab = 0;
  final cart = <String, int>{};
  late final session = widget.session??ShopperSession();
  String? _observedUid,_checkedSellerUid;
  bool _wasSeller=false;
  String? _sellerInitialTarget;
  String? _pendingClaimPlaceId;
  int _sellerEntry=0;
  Future<void>? _workspaceResolution;
  SellerPush? sellerPush;
  StreamSubscription<void>? shopperMessageAlerts;
  List<OnlineShop> online = [];
  // Independent home preview: not limited to the currently selected shop tab.
  List<OnlineShop> otherBusinesses = [];
  bool loadingOtherBusinesses = false;
  String? otherBusinessesWarning;
  int _otherBusinessRequestSerial = 0;
  String? onlineWarning;
  bool loadingOnline = false;
  String discoveryType='spaza';
  String sellerFilter='all';
  bool widerSearch=false;
  int get searchRadiusKm=>discoveryType=='wholesale'?(widerSearch?50:40):discoveryType=='variety'?(widerSearch?50:40):(widerSearch?40:22);
  int _onlineRequestSerial=0;
  int unreadChats=0;
  Timer? chatWatch;
  Timer? catalogueWatch;
  int _catalogueRequest=0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    session.addListener(workspaceChanged);
    Future<void>? restoring;
    if(widget.enableBackgroundServices){
      sellerPush=SellerPush(session)..onOpen=(target){
        if(!mounted)return;
        if(session.sellerWorkspace){openOwnerWorkspace(notification:true,target:target);return;}
        if(target=='chat'){openInbox();return;}
        if(target=='orders'){navigateToTab(3);return;}
        openBellNotifications();
      };
      shopperMessageAlerts=sellerPush!.updates.stream.listen((_){
        if(mounted)unawaited(refreshUnread());
      });
      chatWatch=Timer.periodic(const Duration(seconds:25),(_)=>refreshUnread());
      refreshUnread();
      restoring=session.restore();
      startCatalogueWatch();
    }else{session.isReady=true;}
    workspaceChanged();
    _prepareLaunch(restoring);
  }
  void workspaceChanged(){
    if(!mounted)return;
    final uid=session.userId,seller=session.sellerWorkspace;
    final previousUid=_observedUid;
    if(uid!=_observedUid){
      // Prevent a delayed restore from the previous user reopening the sheet.
      ++_deliveryProfileRequest;
      final deletedAccount=previousUid!=null&&uid==null&&
        session.forgetDeviceLocationOnSignOut;
      final priorProfile=deliveryProfile;
      if(deletedAccount){
        // Account deletion is not logout. Erase the installation's location.
        rememberedLocation=null;area=null;locationName='Choose your area';
        unawaited(deliveryProfileStore.clearDeviceLocation()
          .catchError((Object _){/* Profile clearing is retried by deletion page. */}));
      }else if(previousUid!=null&&uid==null&&priorProfile!=null){
        // Ordinary logout retains only the delivery destination, not contact.
        rememberedLocation=ShopperDeviceDeliveryLocation.fromProfile(priorProfile);
        unawaited(deliveryProfileStore.saveDeviceLocation(priorProfile)
          .catchError((Object _){/* Keep the in-memory location on logout. */}));
      }
      if(uid!=null||deletedAccount)session.forgetDeviceLocationOnSignOut=false;
      _observedUid=uid;_checkedSellerUid=null;
      _workspaceResolution=null;
      _sellerInitialTarget=null;if(previousUid!=null)_pendingClaimPlaceId=null;
      if(previousUid!=null||seller){cart.clear();basketShop=null;}
      selected=null;directorySelected=null;tab=0;unreadChats=0;
      // Keep the guest profile during automatic guest→Firebase session
      // activation. Never carry it from one signed-in UID to another.
      if(previousUid!=null||seller)deliveryProfile=null;
      if(_launchReady&&!seller&&!deletedAccount&&widget.initialArea==null){
        WidgetsBinding.instance.addPostFrameCallback((_){
          if(mounted)unawaited(restoreDeliveryProfile());
        });
      }
      if(uid==null&&previousUid!=null)WidgetsBinding.instance.addPostFrameCallback((_){
        if(mounted&&session.userId==null)Navigator.of(context).popUntil((route)=>route.isFirst);
      });
    }
    if(seller!=_wasSeller){
      _wasSeller=seller;
      if(seller){cart.clear();basketShop=null;selected=null;directorySelected=null;
        catalogueWatch?.cancel();catalogueWatch=null;_onlineRequestSerial++;}
      else{
        _launchReady=true;
        if(widget.enableBackgroundServices)startCatalogueWatch();
        unawaited(load(silent:true));
        if(widget.enableBackgroundServices||widget.initialArea!=null)unawaited(_restoreSavedArea());
      }
    }
    setState((){});
    if(uid!=null&&!seller&&session.isReady&&!session.isBusy&&_checkedSellerUid!=uid&&
      (widget.enableBackgroundServices||widget.sellerApiFactory!=null)){
      _checkedSellerUid=uid;_workspaceResolution=resolveSellerWorkspace(uid);
    }
  }
  Future<void> resolveSellerWorkspace(String uid) async {
    try{
      final token=await session.freshIdToken();
      if(!mounted||session.userId!=uid||session.idToken==null)return;
      final account=await (widget.sellerApiFactory?.call(uid,token)??SellerFirestore(uid:uid,token:token)).shop();
      if(mounted&&session.userId==uid&&session.idToken!=null&&account?.hasRegisteredCategory==true)session.useSellerWorkspace();
    }catch(_){/* A selected seller workspace remains available for retry during outages. */}
  }
  Future<void> _prepareLaunch([Future<void>? restoring]) async {
    try{await restoring?.timeout(const Duration(seconds:12));}catch(_){/* Authentication retries independently. */}
    try{await _workspaceResolution?.timeout(const Duration(seconds:8));}catch(_){/* Owner login remains available if the account cannot be checked. */}
    if(!mounted)return;
    if(session.sellerWorkspace){setState(()=>_launchReady=true);return;}
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
    if(mounted)setState(()=>_launchReady=true);
    if(widget.initialArea==null)unawaited(restoreDeliveryProfile());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    chatWatch?.cancel();
    catalogueWatch?.cancel();
    shopperMessageAlerts?.cancel();
    sellerPush?.dispose();
    productTabController.dispose();
    session.removeListener(workspaceChanged);
    if(widget.session==null)session.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if(!widget.enableBackgroundServices)return;
    if(session.sellerWorkspace)return;
    if(state==AppLifecycleState.resumed) {
      refreshUnread();
      load(silent:true);startCatalogueWatch();
      // Don't clear a shop/cart when returning from Google Maps.
      if(area==null) _restoreSavedArea();
    }else{catalogueWatch?.cancel();catalogueWatch=null;}
  }
  void startCatalogueWatch(){
    catalogueWatch?.cancel();if(session.sellerWorkspace)return;
    catalogueWatch=Timer.periodic(const Duration(seconds:30),(_){
      if(!loading&&!session.sellerWorkspace)load(silent:true);
    });
  }

  Future<void> refreshUnread() async {
    if(session.sellerWorkspace)return;
    try {
      final unread=await ShopperChatApi.unreadTotal(session);
      if(mounted)setState(()=>unreadChats=unread);
    }catch(_){/* Unread service unavailable; do not block shopping. */}
  }

  Future<void> restoreDeliveryProfile()async{
    if(!mounted||session.sellerWorkspace||widget.initialArea!=null)return;
    final uid=session.userId,request=++_deliveryProfileRequest;
    ShopperDeliveryProfile? saved;
    ShopperDeviceDeliveryLocation? deviceLocation=rememberedLocation;
    try{
      // Signed-in profiles are private to their Firebase UID. A logged-out
      // device only restores the last confirmed *location*, never contact data.
      if(uid!=null){
        saved=await deliveryProfileStore.load(uid);
        if(saved==null&&session.anonymousShopper)
          saved=await deliveryProfileStore.load(null);
      }
      deviceLocation=await deliveryProfileStore.loadDeviceLocation()??deviceLocation;
      if(uid==null&&deviceLocation==null){
        // Legacy guest profiles may predate the split-location store.
        // Migrate the address only, then remove cached guest contact details.
        final legacy=await deliveryProfileStore.load(null);
        if(legacy!=null){
          final location=ShopperDeviceDeliveryLocation.fromProfile(legacy);
          if(location.isValid){
            deviceLocation=location;
            await deliveryProfileStore.saveDeviceLocation(legacy);
            await deliveryProfileStore.clear(null);
          }
        }
      }
    }catch(_){/* Keep the current confirmed device location if storage fails. */}
    if(uid!=null&&session.idToken!=null){
      try{
        final result=await TeyzaMobileApi(session).call('shopper_profile_read');
        if(result['profile'] is Map){
          saved=ShopperDeliveryProfile.fromJson(result['profile'] as Map);
          await deliveryProfileStore.save(uid,saved);
        }else if(saved!=null){
          // The identity is valid but the server profile was not synced yet.
          await TeyzaMobileApi(session).call('shopper_profile_save',saved.toJson());
          await deliveryProfileStore.save(uid,saved);
          await deliveryProfileStore.clear(null);
        }
      }catch(_){/* local copy works while offline */}
    }
    if(!mounted||request!=_deliveryProfileRequest||session.userId!=uid||session.sellerWorkspace)return;
    if(saved!=null&&saved.address.trim().isNotEmpty){
      deliveryProfile=saved;
      rememberedLocation=ShopperDeviceDeliveryLocation.fromProfile(saved);
      try{await deliveryProfileStore.saveDeviceLocation(saved);}
      catch(_){/* Use the confirmed local location while storage is unavailable. */}
      if(!mounted||request!=_deliveryProfileRequest||session.userId!=uid)return;
      await chooseArea(Area(saved.area.isNotEmpty?saved.area:saved.city,
        saved.city.isNotEmpty?saved.city:saved.area,
        saved.latitude,saved.longitude),persist:false);
      if(mounted&&request==_deliveryProfileRequest)setState((){
        locationName=saved!.address;_usingGps=false;locationWarning=null;
      });
    }else if(deviceLocation?.isValid==true){
      // After logout do not trigger first-time address onboarding again.
      // The saved shopper's name, email and phone are not reattached.
      rememberedLocation=deviceLocation;
      deliveryProfile=null;
      await chooseArea(Area(deviceLocation!.area.isNotEmpty?deviceLocation.area:deviceLocation.city,
        deviceLocation.city.isNotEmpty?deviceLocation.city:deviceLocation.area,
        deviceLocation.latitude,deviceLocation.longitude),persist:false);
      if(mounted&&request==_deliveryProfileRequest)setState((){
        locationName=deviceLocation!.address;_usingGps=false;locationWarning=null;
      });
    }else if(_launchReady) {
      WidgetsBinding.instance.addPostFrameCallback((_){
        if(mounted&&request==_deliveryProfileRequest&&deliveryProfile==null&&
            !_deliverySheetOpen)unawaited(promptDeliveryProfile());
      });
    }
  }
  Future<void> promptDeliveryProfile()async{
    if(!mounted||session.sellerWorkspace||_deliverySheetOpen)return;
    _deliverySheetOpen=true;
    final uid=session.userId;
    try{
      final profile=await showModalBottomSheet<ShopperDeliveryProfile>(
        context:context,isScrollControlled:true,useSafeArea:true,
        backgroundColor:Colors.white,showDragHandle:true,
        builder:(_)=>ShopperDeliveryProfileSheet(session:session,initial:deliveryProfile));
      if(profile==null||!mounted||uid!=session.userId)return;
      // Browsing only needs a locally stored location, not a registered account.
      rememberedLocation=ShopperDeviceDeliveryLocation.fromProfile(profile);
      try{await deliveryProfileStore.saveDeviceLocation(profile);}
      catch(_){if(mounted)setState(()=>deliveryProfileWarning='Could not save this address on this phone.');}
      if(uid!=null&&!session.anonymousShopper){
        await deliveryProfileStore.save(uid,profile);
        if(profile.displayName.trim().isNotEmpty&&profile.phone.trim().isNotEmpty){
          try{await TeyzaMobileApi(session).call('shopper_profile_save',profile.toJson());}
          catch(_){if(mounted)setState(()=>deliveryProfileWarning='Address saved on this phone. Account sync will retry.');}
        }
      }
      if(!mounted||uid!=session.userId)return;
      deliveryProfile=profile;
      ++_deliveryProfileRequest;
      await chooseArea(Area(profile.area.isNotEmpty?profile.area:profile.city,
        profile.city.isNotEmpty?profile.city:profile.area,
        profile.latitude,profile.longitude),persist:false);
      if(mounted)setState((){locationName=profile.address;_usingGps=false;locationWarning=null;});
    }finally{_deliverySheetOpen=false;}
  }

  Future<void> _restoreSavedArea() async {
    if(session.sellerWorkspace)return;
    if(widget.initialArea!=null){
      await chooseArea(widget.initialArea!,persist:false);
    }
    // On a real device, first ask for the saved delivery street address.
    // GPS is optional: never override a previously saved delivery destination
    // with the device's current position when reopening the app.
  }

  Future<void> setDiscoveryType(String type) async {
    if(type!='spaza'&&type!='variety'&&type!='wholesale')return;
    if(discoveryType==type){if(mounted)setState(()=>sellerFilter=type);return;}
    setState(() {
      discoveryType=type;
      sellerFilter=type;
      widerSearch=false;
      showAllShops=false;
      online=[];
      directorySelected=null;
      search='';category='All';
    });
    await reloadOnline();
  }

  Future<void> selectSellerFilter(String type) async {
    if(type=='all'){
      if(discoveryType!='spaza')await setDiscoveryType('spaza');
      if(mounted)setState(()=>sellerFilter='all');
    }else{
      await setDiscoveryType(type);
    }
  }

  Future<void> reloadOtherBusinesses() async {
    if(!mounted||session.sellerWorkspace)return;
    final currentArea=area;
    final serial=++_otherBusinessRequestSerial;
    if(currentArea==null){
      setState((){otherBusinesses=[];loadingOtherBusinesses=false;
        otherBusinessesWarning=null;});
      return;
    }
    setState((){otherBusinesses=[];loadingOtherBusinesses=true;
      otherBusinessesWarning=null;});
    try{
      final businesses=widget.directoryLoader!=null
        ?await widget.directoryLoader!(currentArea,'variety',40)
        :await findOnlineShops(area:currentArea.label,
          latitude:currentArea.lat,longitude:currentArea.lng,
          category:'variety',radiusKm:40);
      if(!mounted||serial!=_otherBusinessRequestSerial)return;
      setState((){
        otherBusinesses=businesses.where((place)=>
          teyzaMatchesShopCategory(place,'variety')).toList();
        loadingOtherBusinesses=false;
      });
    }catch(_){
      if(!mounted||serial!=_otherBusinessRequestSerial)return;
      setState((){loadingOtherBusinesses=false;
        otherBusinessesWarning='Local businesses are temporarily unavailable.';});
    }
  }

  Future<void> reloadOnline() async {
    if(session.sellerWorkspace)return;
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
    if(!mounted||session.sellerWorkspace)return;
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
          basketShop=cart.isEmpty?null:current;
        }
      });
      if(basketChanged)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Your basket was updated to the shop’s current prices and availability.')));
    } catch (_) {
      if (!mounted||request!=_catalogueRequest) return;
      setState(() { loading = false; catalogueError = 'Live shops are temporarily unavailable.'; });
    }
  }

  Future<void> useLocation({bool askPermission = true}) async {
    if(session.sellerWorkspace)return;
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
      await Future.wait<void>([reloadOnline(),reloadOtherBusinesses()]);
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
    await Future.wait<void>([reloadOnline(),reloadOtherBusinesses()]);
  }
  Future<void> areaSheet() async {
    if(widget.initialArea==null){await promptDeliveryProfile();return;}
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
    final filtered = live.where((shop)=>shopMatchesArea(shop,area,radiusKm:searchRadiusKm.toDouble())).toList();
    filtered.sort((a,b) {
      if(a.sponsored!=b.sponsored)return a.sponsored?-1:1;
      return (distance(a)??double.infinity).compareTo(distance(b)??double.infinity);
    });
    return filtered;
  }
  List<Shop> get nearbySellers {
    if(area==null)return [];
    final q=search.trim().toLowerCase();
    return nearbyReal.where((shop)=>
      (sellerFilter=='all'||shop.shopCategory==sellerFilter)&&
      (q.isEmpty||(shop.name+' '+shop.area).toLowerCase().contains(q))).toList();
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

  Widget _serviceRow(IconData icon,String label,bool? available,{String? detail})=>Container(
    padding:const EdgeInsets.symmetric(horizontal:12,vertical:10),
    margin:const EdgeInsets.only(bottom:7),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(12)),
    child:Row(children:[
      Icon(icon,color:green,size:22),const SizedBox(width:12),
      Expanded(child:Text(label,style:const TextStyle(fontWeight:FontWeight.w700))),
      Flexible(child:Text(available==true?(detail??'Available'):
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
      _serviceRow(Icons.credit_card_outlined,'Card at the shop',shop.acceptsCard,detail:'No extra charge'),
      _serviceRow(Icons.account_balance_wallet_outlined,'Cashback',shop.cashback),
      _serviceRow(Icons.local_shipping_outlined,'Delivery',shop.delivery,detail:shop.deliveryFeeCents==0?'Free delivery':money(shop.deliveryFeeCents)),
      if(shop.cashDiscountPercent==10)_serviceRow(Icons.savings_outlined,'Cash discount',true,detail:'10% off items'),
      _serviceRow(Icons.shopping_bag_outlined,'Collection',shop.pickup),
      _serviceRow(Icons.chat_bubble_outline,'Live chat',shop.liveChat),
    ]);

  Widget merchantTrust(Shop shop)=>Wrap(spacing:8,runSpacing:4,children:[
    if(shop.sponsored)const Chip(avatar:Icon(Icons.campaign_rounded,color:Color(0xFF7E5000),size:17),label:Text('Promoted · 7 days')),
    if(shop.identityVerified)const Chip(avatar:Icon(Icons.verified,color:green,size:17),label:Text('Teyza Verified')),
    Chip(avatar:const Icon(Icons.star_rounded,color:Color(0xFFB57800),size:18),
      label:Text(shop.ratingCount>0&&shop.rating!=null
        ?'${shop.rating!.toStringAsFixed(1)} (${shop.ratingCount}) · Teyza orders':'No ratings yet')),
  ]);

  Future<void> contactListing({Shop? merchant,OnlineShop? directory}) async {
    final linked=merchant??(directory==null?null:verifiedMerchantFor(directory));
    // Verified Teyza owners can receive in-app messages. Public map entries
    // are discovery-only and must never pretend to support Teyza chat.
    if(linked!=null&&linked.identityVerified&&linked.liveChat&&
      ShopperChatApi.isTeyzaShop(linked.id)){
      chatWithShop(linked);
      return;
    }
    var number=linked?.phone??directory?.phone??'';
    if(number.isEmpty&&directory!=null&&directory.origin=='google_places'&&
      directory.placeId.isNotEmpty){
      // Google Places details fetch is performed only when Contact is tapped.
      number=await teyzaBusinessContact(directory.placeId);
    }
    if(!mounted)return;
    if(number.isNotEmpty){
      await contactBusiness(number);
      return;
    }
    if(linked!=null)openShop(linked);
    else if(directory!=null)selectDirectory(directory);
    if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content:Text('No public phone number is available. View the business details or directions.')));
  }

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
          const SizedBox(height:8),
          FilledButton(onPressed:()=>selectDirectory(place),
            child:Text(teyzaListingAction(place.shopCategory))),
          if(place.phone.isNotEmpty)TextButton.icon(onPressed:()=>contactBusiness(place.phone),
            icon:const Icon(Icons.phone_outlined,size:15),label:Text('Call '+place.phone)),
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
  List<ShopProduct> get allPublishedProducts => [
    for(final shop in nearbyReal)
      if(sellerFilter=='all'||shop.shopCategory==sellerFilter)
        for(final p in shop.rangeProducts)
          if(p.priceCents>0)ShopProduct(shop,p)
  ];
  List<ShopProduct> get featured {
    return discoverShopProducts(nearbyReal,type:discoveryType,category:category,query:search);
  }
  List<Product> get basketItems => basketShop?.products.where((p) =>
    (cart[p.id] ?? 0)>0).toList() ?? [];
  int get count => cart.values.fold(0, (a,b)=>a+b);
  int get total => basketItems.fold(0,(v,p)=>v+p.priceCents*(cart[p.id]??0));
  bool canAddFromShop(Shop shop,Product product)=>
    (shop.pickup||shop.delivery)&&shop.products.any((p)=>p.id==product.id&&
      p.priceCents>0&&p.stock>0&&p.inStock);
  Future<void> quantityForShop(Shop source,Product product,int delta) async {
    if(delta<0&&basketShop?.id!=source.id)return;
    if(delta>0&&!canAddFromShop(source,product))return;
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
    // The catalogue can refresh while the confirmation dialog is open.
    final matches=live.where((shop)=>shop.id==source.id).toList();
    if(matches.isEmpty)return;
    final current=matches.first;
    if(delta>0&&!canAddFromShop(current,product)){
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('This item is no longer available from that shop.')));
      return;
    }
    final products=current.products.where((p)=>p.id==product.id).toList();
    if(products.isEmpty)return;
    final currentProduct=products.first;
    setState((){
      if(delta>0){if(basketShop?.id!=current.id)cart.clear();basketShop=current;}
      final next=(cart[currentProduct.id]??0)+delta;
      if(next<=0)cart.remove(currentProduct.id);
      else if(next<=currentProduct.stock)cart[currentProduct.id]=next;
      if(cart.isEmpty)basketShop=null;
    });
  }
  void openShop(Shop shop) {
    final changed=discoveryType!=shop.shopCategory;
    setState((){
      shopProductSearch='';selected=shop;directorySelected=null;
      showAllShops=true;showAllSellers=false;search='';category='All';
      discoveryType=shop.shopCategory;tab=1;
      if(changed)online=[];
    });
    if(changed)unawaited(reloadOnline());
  }

  void selectDirectory(OnlineShop shop){
    final request=++_directoryContactRequest;
    final changed=discoveryType!=shop.shopCategory;
    setState((){
      directorySelected=shop;selected=null;showAllShops=true;showAllSellers=false;search='';
      discoveryType=shop.shopCategory;tab=0;
      selectedDirectoryPhone=shop.phone;
      if(changed)online=[];
    });
    if(changed)unawaited(reloadOnline());
    if(shop.origin=='google_places'&&shop.placeId.isNotEmpty){
      teyzaBusinessContact(shop.placeId).then((phone){
        if(mounted&&request==_directoryContactRequest&&directorySelected?.id==shop.id)
          setState(()=>selectedDirectoryPhone=phone);
      });
    }
  }

  void backToCategory(String type){
    final changed=discoveryType!=type;
    setState((){
      directorySelected=null;selected=null;selectedDirectoryPhone=null;
      tab=0;showAllShops=true;showAllSellers=false;search='';discoveryType=type;sellerFilter=type;
      if(changed)online=[];
    });
    if(changed)unawaited(reloadOnline());
  }

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
            hintText:discoveryType=='spaza'?'Search for products, shops…':discoveryType=='wholesale'?'Find wholesalers and cash & carry…':'Search salons, furniture, plumbers, businesses…',
            hintStyle:const TextStyle(color:muted,fontSize:12),
            filled:true,fillColor:const Color(0xFFF7F8F7),
            prefixIcon:const Icon(Icons.search_rounded,color:ink,size:21),
            contentPadding:const EdgeInsets.symmetric(vertical:11),
            border:OutlineInputBorder(borderRadius:BorderRadius.circular(18),
              borderSide:const BorderSide(color:Color(0xFFEDF0EE))),
            enabledBorder:OutlineInputBorder(borderRadius:BorderRadius.circular(18),
              borderSide:const BorderSide(color:Color(0xFFEDF0EE))))),
      ]
    ]));


  void openBasket()=>navigateToTab(2);
  Future<void> openBellNotifications() async{
    // The inbox does not require a manually enabled phone-alert setting.
    if(session.idToken==null){
      try{await session.ensureShoppingIdentity();}
      catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Unable to open alerts: '+authMessage(e))));return;}
    }
    if(!mounted)return;
    Navigator.of(context).push(MaterialPageRoute(builder:(_)=>SellerNotificationsPage(
      session:session,asShopper:true,onOpen:(target){
        if(target=='chat')openInbox();
        else if(target=='orders')navigateToTab(3);
      })));
  }
  void openInbox(){
    if(session.idToken==null||session.anonymousShopper){
      navigateToTab(4);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Sign in or register to use chat. Your delivery address stays saved.')));return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder:(_)=>
      ShopperChatPage(session:session)));
  }
  Future<void> openOwnerWorkspace({bool notification=false,String? target}) async {
    if(session.idToken==null){navigateToTab(4);return;}
    _sellerInitialTarget=notification?(target??'notifications'):null;
    if(notification)_sellerEntry++;
    session.useSellerWorkspace();
  }
  Future<void> claimDirectoryListing(OnlineShop listing) async {
    _pendingClaimPlaceId=listing.origin=='google_places'&&listing.placeId.isNotEmpty?listing.placeId:null;
    if(session.idToken==null){navigateToTab(4);ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content:Text('Sign in or register as a shop owner to claim your business on Teyza.')));return;}
    await openOwnerWorkspace();
  }
  void browseNearby()=>setState((){
    tab=0;selected=null;directorySelected=null;showAllShops=true;showAllSellers=false;
  });
  void navigateToTab(int index){
    setState(() {
      if(index==5){
        tab=0;selected=null;directorySelected=null;showAllShops=true;showAllSellers=false;search='';
        return;
      }
      tab=index;
      if(index==0){selected=null;directorySelected=null;showAllShops=false;showAllSellers=false;}
      if(index==1){selected=null;directorySelected=null;showAllShops=false;
        showAllSellers=false;category='All';productTabSearch='';productTabController.clear();}
    });
  }
  void findEssential(String name){
    setState((){
      tab=1;selected=null;directorySelected=null;showAllShops=false;showAllSellers=false;category='All';
      productTabSearch=name;productTabController.text=name;
    });
  }
  Widget premiumNavigation()=>PremiumShopperNavigation(
    selectedIndex:tab==0&&showAllShops?5:tab,onSelect:navigateToTab);
  Widget floatingCart()=>Padding(padding:const EdgeInsets.fromLTRB(18,0,18,4),
    child:Material(color:deep,elevation:8,shadowColor:const Color(0x33010F1C),
      borderRadius:BorderRadius.circular(22),child:InkWell(
        key:const ValueKey('floating-cart'),onTap:openBasket,
        borderRadius:BorderRadius.circular(22),
        child:Padding(padding:const EdgeInsets.symmetric(horizontal:16,vertical:11),
          child:Row(children:[
            const Icon(Icons.shopping_cart_outlined,color:Colors.white,size:21),
            const SizedBox(width:10),
            Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,
              mainAxisSize:MainAxisSize.min,children:[
                const Text('View cart',style:TextStyle(color:Colors.white,fontWeight:FontWeight.w800)),
                Text(basketShop?.name??'',maxLines:1,overflow:TextOverflow.ellipsis,
                  style:const TextStyle(color:Color(0xFFB8D8D0),fontSize:11))
              ])),
            const SizedBox(width:8),
            Flexible(child:FittedBox(fit:BoxFit.scaleDown,child:Text(
              '$count ${count==1?'item':'items'} · ${rand(total)}',
              style:const TextStyle(color:Colors.white,fontSize:12,fontWeight:FontWeight.w700)))),
            const SizedBox(width:5),
            const Icon(Icons.chevron_right,color:Colors.white)
          ])))));

  @override
  Widget build(BuildContext context) {
    if(session.sellerWorkspace)return SellerWorkspacePage(key:ValueKey('seller-${session.userId}-$_sellerEntry'),
      session:session,sellerMode:true,apiFactory:widget.sellerApiFactory,mobileApi:widget.sellerMobileApi,
      initialTarget:_sellerInitialTarget,initialClaimPlaceId:_pendingClaimPlaceId,
      openLogin:(){if(mounted)setState(()=>tab=0);});
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
          IconButton(tooltip:'Notifications',onPressed:openBellNotifications,
            icon:Badge(isLabelVisible:unreadChats>0,
              label:Text(unreadChats>99?'99+':unreadChats.toString()),
              child:const Icon(Icons.notifications_none_rounded,size:25))),
          const SizedBox(width:3)
        ]),
      body:tab==4?ShopperAccountPanel(session:session,
          onOpenOwner:openOwnerWorkspace,onShopperSignedIn:()=>navigateToTab(0),
          onMessages:openInbox,onOrders:()=>navigateToTab(3),onBrowse:browseNearby,
          savedDeliveryAddress:deliveryProfile?.address,savedProfile:deliveryProfile,
          onChangeDeliveryAddress:promptDeliveryProfile):
        tab==3?ShopOrdersPanel(session:session,onLogin:()=>navigateToTab(4)):
        tab==2?basketPage():
        tab==1?(selected!=null?Column(children:[
          Container(color:Colors.white,padding:const EdgeInsets.fromLTRB(16,10,16,10),
            child:Row(children:[
              Expanded(child:Text(selected!.name,maxLines:1,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontSize:18,fontWeight:FontWeight.w900,color:ink))),
              const SizedBox(width:8),
              OutlinedButton.icon(key:const ValueKey('change-shop'),
                onPressed:changeShop,icon:const Icon(Icons.swap_horiz,size:17),
                label:const Text('Change shop')),
            ])),
          Expanded(child:shopPage(selected!)),
        ]):shopProductsPage()):
        Column(children:[locationHeader(),Expanded(child:
          selected!=null?Column(children:[
            Container(color:Colors.white,padding:const EdgeInsets.symmetric(horizontal:16,vertical:8),
              child:Row(children:[Expanded(child:Text(selected!.name,maxLines:1,overflow:TextOverflow.ellipsis)),
                OutlinedButton(onPressed:changeShop,child:const Text('Change shop'))])),
            Expanded(child:shopPage(selected!))]):
          directorySelected!=null?directoryPage(directorySelected!):
          showAllSellers?allSellersPage():showAllShops?allShopsPage():homePage())]),
      bottomNavigationBar:Column(mainAxisSize:MainAxisSize.min,children:[
        if(count>0&&tab!=2)floatingCart(),
        premiumNavigation(),
      ]),
    );
  }


  Widget shopProductsPage(){
    final query=productTabSearch.trim().toLowerCase();
    final products=allPublishedProducts.where((entry)=>
      (category=='All'||teyzaProductCategory(entry.product.category)==category)&&
      (query.isEmpty||(entry.product.name+' '+entry.product.category+' '+entry.shop.name)
        .toLowerCase().contains(query))).toList();
    return RefreshIndicator(onRefresh:()=>load(),child:ListView.builder(
      key:const PageStorageKey<String>('teyza-shop-product-catalogue'),
      physics:const AlwaysScrollableScrollPhysics(),
      padding:const EdgeInsets.fromLTRB(16,16,16,28),
      itemCount:products.length+1,
      itemBuilder:(context,index){
        if(index==0)return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Shop',style:TextStyle(fontSize:27,fontWeight:FontWeight.w900,color:ink)),
          const SizedBox(height:5),
          const Text('Products published by participating Teyza shops.',
            style:TextStyle(color:muted,fontSize:12)),
          const SizedBox(height:14),businessFilters(),
          const SizedBox(height:14),
          TextField(controller:productTabController,
            onChanged:(value)=>setState(()=>productTabSearch=value),
            decoration:const InputDecoration(prefixIcon:Icon(Icons.search),
              hintText:'Search products and shops',border:OutlineInputBorder())),
          const SizedBox(height:14),
          const Text('Shop by category',style:TextStyle(fontSize:16,fontWeight:FontWeight.w800,color:ink)),
          const SizedBox(height:8),groceryAisles(openProducts:false),
          const SizedBox(height:12),
          if(products.isEmpty)...[
            empty('No matching products','Try another product or browse nearby shops.'),
            Center(child:TextButton(onPressed:browseNearby,child:const Text('Browse nearby shops'))),
          ],
        ]);
        final entry=products[index-1];
        return Card(color:Colors.white,elevation:0,margin:const EdgeInsets.only(bottom:10),
          child:InkWell(key:ValueKey('shop-product-${entry.shop.id}-${entry.product.id}'),
            onTap:()=>openShop(entry.shop),borderRadius:BorderRadius.circular(12),
            child:Padding(padding:const EdgeInsets.all(12),child:Row(children:[
            photo(entry.product.picture,size:82,icon:Icons.shopping_bag_outlined),
            const SizedBox(width:12),
            Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(entry.product.name,maxLines:2,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontWeight:FontWeight.w800,color:ink)),
              const SizedBox(height:4),
              Text(entry.shop.name,style:const TextStyle(color:muted,fontSize:12)),
              if(entry.shop.identityVerified)
                const Text('Teyza Verified',style:TextStyle(color:green,fontSize:11,
                  fontWeight:FontWeight.bold)),
              Text(rand(entry.product.priceCents),
                style:const TextStyle(color:ink,fontSize:17,fontWeight:FontWeight.w800)),
              if(!entry.product.inStock||entry.product.stock==0)
                const Text('Out of stock',style:TextStyle(color:Colors.deepOrange,fontSize:11))
            ])),
            const SizedBox(width:5),
            FilledButton(onPressed:()=>openShop(entry.shop),child:const Text('Buy')),
          ]))));
      }));
  }

  Widget groceryAisles({bool openProducts=true}) {
    const items=<(String,IconData)>[
      ('All',Icons.grid_view_rounded),('Fruit & Veg',Icons.eco_outlined),
      ('Meat',Icons.kebab_dining_outlined),('Pantry',Icons.kitchen_outlined),
      ('Drinks',Icons.local_drink_outlined),('Dairy & Eggs',Icons.egg_outlined),
      ('Bakery',Icons.bakery_dining_outlined),('Baby Care',Icons.child_care_outlined),
      ('Household',Icons.cleaning_services_outlined),('Snacks',Icons.cookie_outlined),
      ('Personal Care',Icons.spa_outlined),('Stationery',Icons.edit_outlined),
      ('Pet Care',Icons.pets_outlined),('Tea & Coffee',Icons.coffee_outlined),
      ('General Goods',Icons.shopping_bag_outlined)
    ];
    final height=58.0+MediaQuery.textScalerOf(context).scale(30);
    return SizedBox(height:height,child:ListView.builder(
      key:const PageStorageKey<String>('product-categories'),scrollDirection:Axis.horizontal,
      itemCount:items.length,itemBuilder:(context,index){
        final item=items[index],active=category==item.$1;
        return Semantics(button:true,selected:active,label:'${item.$1} products',
          child:InkWell(key:ValueKey('product-category-${item.$1}'),
            onTap:()=>setState((){
              category=item.$1;
              if(openProducts){tab=1;selected=null;directorySelected=null;
                showAllShops=false;showAllSellers=false;productTabSearch='';productTabController.clear();}
            }),borderRadius:BorderRadius.circular(14),
            child:SizedBox(width:76,child:Column(children:[
              Container(width:42,height:42,decoration:BoxDecoration(shape:BoxShape.circle,
                color:active?green:const Color(0xFFF0F4F1),
                border:Border.all(color:active?green:const Color(0xFFE8EEEA))),
                child:Icon(item.$2,color:active?Colors.white:green,size:21)),
              const SizedBox(height:5),
              Text(item.$1,maxLines:2,textAlign:TextAlign.center,overflow:TextOverflow.ellipsis,
                style:TextStyle(fontSize:10,color:ink,fontWeight:active?FontWeight.w700:FontWeight.w400))
            ]))));
      }));
  }

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
          FilledButton(onPressed:browseNearby,
            style:FilledButton.styleFrom(minimumSize:Size.zero,
              padding:const EdgeInsets.symmetric(horizontal:14,vertical:9),
              textStyle:const TextStyle(fontFamily:'PT Sans',fontWeight:FontWeight.w700,fontSize:11)),
            child:const Row(mainAxisSize:MainAxisSize.min,children:[
              Text('Explore shops'),SizedBox(width:7),Icon(Icons.arrow_forward_rounded,size:15)]))
        ]))),
      SizedBox(width:128,height:154,child:Image.asset('assets/images/grocery-basket.png',fit:BoxFit.contain))
    ]));

  List<NearbyListing> get nearbyListings=>mergeNearbyListings(displayShops,displayedOnline,area:area);
  List<NearbyListing> get nearbyOtherBusinesses {
    if(area==null)return [];
    final verified=live.where((shop)=>shop.shopCategory=='variety'&&
      shopMatchesArea(shop,area,radiusKm:40.0)).toList();
    final publicResults=discoveryType=='variety'&&online.isNotEmpty
      ?online:otherBusinesses;
    return mergeNearbyListings(verified,publicResults,area:area);
  }
  Shop? verifiedMerchantFor(OnlineShop publicPlace){
    String normalized(String value)=>value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'),'');
    for(final merchant in live){
      if(merchant.identityVerified&&publicPlace.origin=='google_places'&&publicPlace.placeId.isNotEmpty&&merchant.googlePlaceId==publicPlace.placeId)return merchant;
      if(!merchant.identityVerified||normalized(merchant.name)!=normalized(publicPlace.name))continue;
      // Verified listings with no pin can still match the shop address/city.
      if(merchant.latitude!=null&&merchant.longitude!=null&&publicPlace.lat!=null&&publicPlace.lng!=null){
        if(km(merchant.latitude!,merchant.longitude!,publicPlace.lat!,publicPlace.lng!)<.5)return merchant;
      }else{
        final address=normalized(merchant.address),placeAddress=normalized(publicPlace.address);
        if(address.length>=8&&placeAddress.contains(address))return merchant;
      }
    }
    return null;
  }
  Future<void> contactBusiness(String rawPhone)async{
    final digits=rawPhone.replaceAll(RegExp(r'[^0-9+]'),'');
    if(digits.isEmpty)return;
    try{
      final uri=Uri(scheme:'tel',path:digits);
      final opened=await (widget.externalLauncher?.call(uri)??
        launchUrl(uri,mode:LaunchMode.externalApplication));
      if(!opened)throw StateError('Dialler unavailable');
    }catch(_){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Unable to open the phone dialler.')));
    }
  }

  // A verified Teyza business supports native in-app chat when enabled.
  // A public directory listing is not an in-app chat account. Offer a
  // WhatsApp handoff only if it has a public phone number.
  Future<void> chatWithDirectory(OnlineShop shop)async{
    final linked=verifiedMerchantFor(shop);
    if(linked!=null&&linked.identityVerified&&linked.liveChat&&
      ShopperChatApi.isTeyzaShop(linked.id)){
      chatWithShop(linked);return;
    }
    var digits=(selectedDirectoryPhone??shop.phone).replaceAll(RegExp(r'[^0-9]'),'');
    if(digits.startsWith('0')&&digits.length==10)digits='27'+digits.substring(1);
    if(digits.length<10||digits.length>15){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('This business has not enabled Teyza chat or a public messaging number.')));
      return;
    }
    final uri=Uri.https('wa.me','/$digits',{
      'text':'Hello, I found ${shop.name} on Teyza. Can I ask about your services?'
    });
    try{
      final opened=await (widget.externalLauncher?.call(uri)??
        launchUrl(uri,mode:LaunchMode.externalApplication));
      if(!opened)throw StateError('WhatsApp unavailable');
    }catch(_){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Could not open WhatsApp. This number may not support messaging.')));
    }
  }

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
              if(merchant?.sponsored==true)
                const Padding(padding:EdgeInsets.only(bottom:3),
                  child:Text('FEATURED IN YOUR AREA',style:TextStyle(fontSize:9,
                    color:Color(0xFF08794E),fontWeight:FontWeight.w800))),
              Text(entry.name,maxLines:1,overflow:TextOverflow.ellipsis,
                style:const TextStyle(color:ink,fontSize:12,fontWeight:FontWeight.w700)),
              const SizedBox(height:4),
              if(merchant?.identityVerified==true)
                const Text('✓ Teyza Verified',style:TextStyle(fontSize:10,
                  color:green,fontWeight:FontWeight.w800)),
              if(directory!=null&&(directory.rating!=null||directory.openNow!=null))
                shopFacts(directory),
              const SizedBox(height:3),
              Text(d==null?'Nearby':d.toStringAsFixed(1)+' km away',
                maxLines:1,overflow:TextOverflow.ellipsis,
                style:const TextStyle(color:muted,fontSize:10)),
              Padding(padding:const EdgeInsets.only(top:7),
                child:SizedBox(width:double.infinity,child:FilledButton(
                  onPressed:()=>merchant!=null?openShop(merchant):selectDirectory(directory!),
                  child:Text(teyzaListingAction(merchant?.shopCategory??directory?.shopCategory??'spaza'))))),
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
    ChoiceChip(label:const Text('Wholesalers'),selected:discoveryType=='wholesale',
      onSelected:(_)=>setDiscoveryType('wholesale')),
    ChoiceChip(label:const Text('Local Businesses'),selected:discoveryType=='variety',
      onSelected:(_)=>setDiscoveryType('variety')),
  ]);

  Widget businessFilters()=>SingleChildScrollView(
    key:const PageStorageKey<String>('business-types'),scrollDirection:Axis.horizontal,
    child:Row(children:[
      for(final option in const <(String,String)>[
        ('all','All'),('spaza','Spaza shops'),('wholesale','Wholesalers'),('variety','Local businesses')
      ])Padding(padding:const EdgeInsets.only(right:8),child:ChoiceChip(
        key:ValueKey('business-filter-${option.$1}'),label:Text(option.$2),
        selected:sellerFilter==option.$1,showCheckmark:false,
        selectedColor:deep,backgroundColor:Colors.white,
        labelStyle:TextStyle(color:sellerFilter==option.$1?Colors.white:ink,
          fontWeight:FontWeight.w700,fontSize:12),
        side:BorderSide(color:sellerFilter==option.$1?deep:const Color(0xFFE5ECE7)),
        onSelected:(_)=>selectSellerFilter(option.$1)))
    ]));

  // Public directory listings may appear in yellow; only verified Teyza
  // merchants show green. Never use private or unapproved seller records here.
  List<NearbyListing> get nearbySellerEntries {
    if(area==null)return [];
    final query=search.trim().toLowerCase();
    final mapListings=displayedOnline.where((s)=>
      (sellerFilter=='all'||s.shopCategory==sellerFilter)&&
      s.lat!=null&&s.lng!=null&&
      km(area!.lat,area!.lng,s.lat!,s.lng!)<=searchRadiusKm&&
      (query.isEmpty||(s.name+' '+s.area+' '+s.address).toLowerCase().contains(query))
    ).toList();
    return mergeNearbyListings(nearbySellers,mapListings,area:area).take(35).toList();
  }
  Widget sellerStories(){
    final sellers=nearbySellerEntries;
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      section('Sellers near you',subtitle:'Green: Teyza verified · yellow: not Teyza verified',
        action:sellers.isEmpty?null:TextButton(key:const ValueKey('all-nearby-sellers'),
          onPressed:()=>setState(()=>showAllSellers=true),child:const Text('View all'))),
      if(sellers.isEmpty)
        Padding(padding:const EdgeInsets.only(bottom:12),child:Text(
          area==null?'Choose your area to discover nearby sellers.':
            loading?'Finding sellers nearby…':'No listed sellers in this category nearby yet.',
          style:const TextStyle(color:muted,fontSize:12)))
      else SizedBox(height:76+MediaQuery.textScalerOf(context).scale(33),
        child:ListView.builder(key:const PageStorageKey<String>('nearby-seller-stories'),
          scrollDirection:Axis.horizontal,itemCount:sellers.length,itemBuilder:(context,index){
            final entry=sellers[index],merchant=entry.merchant,directory=entry.directory;
            final verified=merchant?.identityVerified==true;
            final key=merchant?.id??directory!.id;
            return Semantics(button:true,label:'Open ${entry.name} · ${verified?'Teyza verified':'Not Teyza verified'}',
              child:InkWell(key:ValueKey('seller-story-$key'),
                onTap:()=>merchant!=null?openShop(merchant):selectDirectory(directory!),
                borderRadius:BorderRadius.circular(18),
                child:SizedBox(width:86,child:Column(children:[
                  Container(padding:const EdgeInsets.all(3),decoration:BoxDecoration(shape:BoxShape.circle,
                    border:Border.all(color:verified?green:const Color(0xFFE7B31F),width:3)),
                    child:ClipOval(child:merchant!=null?
                      photo(merchant.photo,size:58):onlinePhoto(directory!,width:58,height:58))),
                  const SizedBox(height:5),
                  Text(entry.name,maxLines:2,textAlign:TextAlign.center,overflow:TextOverflow.ellipsis,
                    style:const TextStyle(color:ink,fontSize:11,fontWeight:FontWeight.w700))
                ]))));
          }))
    ]);
  }

  Widget allSellersPage(){
    final sellers=nearbySellerEntries;
    return RefreshIndicator(onRefresh:()=>load(),child:ListView.builder(
      key:const PageStorageKey<String>('all-nearby-sellers-page'),
      physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.all(16),
      itemCount:sellers.length+1,itemBuilder:(context,index){
        if(index==0)return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          businessFilters(),
          section('All nearby sellers',subtitle:'Teyza verified and public directory listings around '+locationName),
          if(sellers.isEmpty)empty('No sellers in this category yet',
            'Choose another business type or shopping area.')
        ]);
        return nearbyListingTile(sellers[index-1]);
      }));
  }

  Widget homePage()=>RefreshIndicator(
    onRefresh:() async {
      await Future.wait<void>([load(),reloadOnline(),reloadOtherBusinesses()]);
    },
    child:ListView(key:const PageStorageKey<String>('shopper-home'),
      padding:const EdgeInsets.fromLTRB(16,7,16,28),children:[
      if(locationWarning!=null)Card(color:const Color(0xFFFFF2DE),
        child:Padding(padding:const EdgeInsets.all(12),child:Text(locationWarning!))),
      if(deliveryProfileWarning!=null)Card(color:const Color(0xFFFFF2DE),
        child:Padding(padding:const EdgeInsets.all(12),
          child:Text(deliveryProfileWarning!))),
      if(deliveryProfile==null&&rememberedLocation==null&&widget.initialArea==null)
        Card(child:ListTile(leading:const Icon(Icons.place_outlined,color:green),
          title:const Text('Add your delivery address'),
          subtitle:const Text('Enter your delivery address to see local shops. No registration needed.'),
          onTap:promptDeliveryProfile)),
      if(catalogueError!=null)Padding(padding:const EdgeInsets.only(bottom:7),
        child:Text(catalogueError!,style:const TextStyle(color:muted,fontSize:11))),
      businessFilters(),sellerStories(),
      if(discoveryType=='spaza')groceryAisles(),
      premiumGroceryHero(),
      const SizedBox(height:4),
      section(teyzaCategoryHeading(discoveryType),
         subtitle:area==null?'Choose your area to find nearby shops':
          'Local shops around '+locationName,
        action:TextButton(onPressed:()=>setState(()=>showAllShops=true),
          child:const Text('See all'))),
      if(displayedOnline.isNotEmpty||displayShops.isNotEmpty)
        SizedBox(height:282,child:ListView(key:const PageStorageKey<String>('home-nearby-shops'),scrollDirection:Axis.horizontal,
          children:nearbyListings.take(30).map(nearbyCard).toList()))
      else if(loadingOnline)const SizedBox(height:106,
        child:Center(child:CircularProgressIndicator()))
      else InkWell(onTap:areaSheet,child:empty('Find nearby shops',
        'Use your current location or select a shopping area.')),
      const SizedBox(height:9),
      section(discoveryType=='spaza'?'Everyday essentials':discoveryType=='wholesale'?'Wholesale suppliers':'Explore local businesses',
        subtitle:discoveryType=='spaza'?'Everyday essentials, closer to home':
          discoveryType=='wholesale'?'Google-linked wholesalers · buying requires verified Teyza supplier':'Salons, upholstery, furniture, plumbers and local businesses',
        action:TextButton(onPressed:discoveryType=='spaza'?()=>navigateToTab(1):
          ()=>setState(()=>showAllShops=true),
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
      if(discoveryType=='wholesale')Card(color:const Color(0xFFE5F4ED),child:ListTile(
        leading:const Icon(Icons.inventory_2_outlined,color:green),
        title:const Text('Spaza shop owner? Buy stock at wholesale prices',
          style:TextStyle(fontWeight:FontWeight.w800)),
        subtitle:const Text('Open your seller dashboard and choose Buy from wholesalers to order from verified suppliers. Map listings are discovery-only.'),
        trailing:const Icon(Icons.chevron_right),
        onTap:()=>openOwnerWorkspace())),
      // Nearby shops merges public listings with verified Teyza sellers.
      if(onlineWarning!=null)Text(onlineWarning!,
        style:const TextStyle(color:muted,fontSize:12)),
      // Show local businesses on the home page without requiring a
      // category switch, directly below Services offered and above Join Teyza.
      section('Local Businesses',
        subtitle:'Salons, furniture, upholstery, plumbers and local services',
        action:TextButton(onPressed:() async {
          await setDiscoveryType('variety');
          if(mounted)setState(()=>showAllShops=true);
        },child:const Text('Explore'))),
      if(nearbyOtherBusinesses.isNotEmpty)
        SizedBox(height:282,child:ListView(key:const PageStorageKey<String>('home-local-businesses'),scrollDirection:Axis.horizontal,
          children:nearbyOtherBusinesses.take(12).map(nearbyCard).toList()))
      else if(loadingOtherBusinesses)
        const SizedBox(height:105,child:Center(child:CircularProgressIndicator()))
      else Padding(padding:const EdgeInsets.fromLTRB(4,4,4,10),
        child:Text(area==null?'Add your delivery address to find local businesses nearby.':
          otherBusinessesWarning??'No local businesses found nearby. Try another area.',
          style:const TextStyle(color:muted,fontSize:12))),
      Card(color:const Color(0xFFE5F4ED),elevation:0,
        child:ListTile(
          leading:const Icon(Icons.add_business_outlined,color:green),
          title:const Text('Own a shop? Join Teyza',style:TextStyle(
            fontWeight:FontWeight.w800,fontSize:13)),
          subtitle:const Text('Spaza owners receive priority application review.'),
          trailing:const Icon(Icons.open_in_new_rounded,size:18),
          onTap:()=>openOwnerWorkspace())),
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
      ('Bread','bread','Bakery'),('Milk','milk','Dairy & Eggs'),
      ('Eggs','eggs','Dairy & Eggs'),('Rice','rice','Pantry'),
      ('Maize meal','maize','Pantry'),('Cooking oil','oil','Pantry'),
      ('Snacks','snacks','Snacks'),('Cleaning','soap','Household')
    ];
    final matching=items.where((x)=>category=='All'||x.$3==category).toList();
    if(matching.isEmpty)return empty('Find '+category.toLowerCase()+' nearby',
      'Open a participating shop to view its published products.');
    return SizedBox(height:178,child:ListView(key:const PageStorageKey<String>('home-essential-categories'),scrollDirection:Axis.horizontal,
      children:matching.map((x)=>
        Container(width:132,margin:const EdgeInsets.only(right:11),
          child:Material(color:Colors.white,borderRadius:BorderRadius.circular(20),
          child:InkWell(key:ValueKey('essential-${x.$2}'),onTap:()=>findEssential(x.$1),
          borderRadius:BorderRadius.circular(20),
          child:Padding(padding:const EdgeInsets.all(10),child:Column(children:[
            Expanded(child:Image.asset(
              'assets/images/essentials/'+x.$2+'.webp',fit:BoxFit.contain,
              semanticLabel:x.$1+' category photograph')),
            const SizedBox(height:5),
            Text(x.$1,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:12)),
            Row(mainAxisAlignment:MainAxisAlignment.center,children:[
              const Flexible(child:Text('Find in a shop',maxLines:1,
                style:TextStyle(color:green,fontSize:10,fontWeight:FontWeight.w700))),
              IconButton(key:ValueKey('find-essential-${x.$2}'),
                tooltip:'Find ${x.$1} in a shop',onPressed:()=>findEssential(x.$1),
                constraints:const BoxConstraints(minWidth:32,minHeight:32),
                padding:EdgeInsets.zero,icon:const Icon(Icons.add_circle_outline,color:green,size:20))
            ])
          ])))))).toList()));
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
    return SizedBox(height:240+MediaQuery.textScalerOf(context).scale(40),
      child:ListView(key:const PageStorageKey<String>('home-featured-products'),scrollDirection:Axis.horizontal,
      children:items.take(18).map((entry){
        final p=entry.product;
        final added=basketShop?.id==entry.shop.id?(cart[p.id]??0):0;
        final canAdd=canAddFromShop(entry.shop,p)&&added<p.stock;
        return Container(width:166,margin:const EdgeInsets.only(right:10),child:Material(
          color:Colors.white,borderRadius:BorderRadius.circular(18),child:InkWell(
            key:ValueKey('essential-product-${entry.shop.id}-${p.id}'),
            borderRadius:BorderRadius.circular(18),onTap:()=>openShop(entry.shop),
            child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Center(child:photo(p.picture,size:104,icon:Icons.shopping_bag)),
              const SizedBox(height:8),Text(p.name,maxLines:2,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontSize:12,fontWeight:FontWeight.w800)),
              Text(entry.shop.name,maxLines:1,overflow:TextOverflow.ellipsis,
                style:const TextStyle(fontSize:11,color:green,fontWeight:FontWeight.w700)),
              const Spacer(),Row(children:[
                Expanded(child:Text(p.priceCents>0?rand(p.priceCents):'Ask shop for price',
                  style:TextStyle(fontSize:p.priceCents>0?17:12,fontWeight:FontWeight.w800,color:ink))),
                IconButton(key:ValueKey('add-essential-${entry.shop.id}-${p.id}'),
                  tooltip:'Add ${p.name} from ${entry.shop.name} to cart',
                  onPressed:canAdd?()=>quantityForShop(entry.shop,p,1):null,
                  constraints:const BoxConstraints(minWidth:36,minHeight:36),padding:EdgeInsets.zero,
                  icon:Icon(Icons.add_circle,color:canAdd?green:muted,size:28))
              ]),
              const Text('View this shop →',style:TextStyle(color:muted,fontSize:10))
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
          merchantTrust(s),
          const SizedBox(height:7),
          Text((s.rangeProducts.isEmpty?'Products coming soon':s.rangeProducts.length.toString()+' products')+
            (distance(s)!=null?' · '+distance(s)!.toStringAsFixed(1)+' km':''),
            style:const TextStyle(color:green,fontSize:12,fontWeight:FontWeight.bold))
        ])),
        const Icon(Icons.chevron_right,color:green)
      ]))));


  Widget nearbyListingTile(NearbyListing entry){
    final seller=entry.merchant,publicPlace=entry.directory;
    final sellerImage=seller?.photo??'';
    final dist=area==null||entry.lat==null||entry.lng==null?null:
      km(area!.lat,area!.lng,entry.lat!,entry.lng!);
    final subtitle=seller?.address.isNotEmpty==true?seller!.address:
      publicPlace?.address.isNotEmpty==true?publicPlace!.address:
      seller?.area??publicPlace?.area??'';
    return Card(color:Colors.white,elevation:0,
      margin:const EdgeInsets.only(bottom:11),
      child:Padding(padding:const EdgeInsets.all(12),child:Column(
        crossAxisAlignment:CrossAxisAlignment.start,children:[
          InkWell(onTap:()=>seller!=null?openShop(seller):selectDirectory(publicPlace!),
            borderRadius:BorderRadius.circular(14),
            child:Row(children:[
              sellerImage.isNotEmpty?photo(sellerImage,size:84):
                publicPlace!=null?onlinePhoto(publicPlace,width:84,height:84):
                photo('',size:84),
              const SizedBox(width:12),
              Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text(entry.name,maxLines:2,overflow:TextOverflow.ellipsis,
                  style:const TextStyle(color:ink,fontWeight:FontWeight.w800,fontSize:15)),
                const SizedBox(height:4),
                Text(subtitle,maxLines:2,overflow:TextOverflow.ellipsis,
                  style:const TextStyle(color:muted,fontSize:11)),
                if(seller?.identityVerified==true)
                  const Text('✓ Teyza Verified',
                    style:TextStyle(color:green,fontSize:11,fontWeight:FontWeight.w800)),
                if(publicPlace?.openNow!=null)shopFacts(publicPlace!),
                if(dist!=null)Text(dist.toStringAsFixed(1)+' km away',
                  style:const TextStyle(color:muted,fontSize:11))
              ])),
              const Icon(Icons.chevron_right_rounded,color:green)
            ])),
          const SizedBox(height:10),
          SizedBox(width:double.infinity,child:FilledButton.icon(
            onPressed:()=>seller!=null?openShop(seller):selectDirectory(publicPlace!),
            icon:Icon((seller?.shopCategory??publicPlace?.shopCategory)=='spaza'
              ?Icons.shopping_bag_outlined:Icons.info_outline,size:17),
            label:Text(teyzaListingAction(seller?.shopCategory??publicPlace?.shopCategory??'spaza')))),
          if(publicPlace?.origin=='google_places')
            const Text('Google Maps',style:TextStyle(color:muted,fontSize:10)),
        ])));
  }

  Widget allShopsPage()=>RefreshIndicator(onRefresh:reloadOnline,
    child:ListView.builder(key:PageStorageKey<String>('shopper-shops-'+discoveryType),
      padding:const EdgeInsets.all(16),
      itemCount:nearbyListings.length+1,itemBuilder:(context,index){
        if(index==0)return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          businessFilters(),
          section(teyzaCategoryHeading(discoveryType),
             subtitle:nearbyListings.length.toString()+' listings · '+
               (discoveryType=='spaza'?'Spaza Shops':discoveryType=='wholesale'?'Wholesalers':'Local Businesses')),
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
        return nearbyListingTile(entry);
      }));

  Widget directoryPage(OnlineShop shop)=>ListView(
    padding:const EdgeInsets.all(18),children:[
      TextButton.icon(onPressed:()=>backToCategory(shop.shopCategory),
        icon:const Icon(Icons.arrow_back),
        label:Text(teyzaBrowseLabel(shop.shopCategory))),
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
      if(shop.shopCategory=='variety')...[
         section('Local Business details',
           subtitle:'Information supplied by the public business directory'),
         Card(color:Colors.white,child:Column(children:[
           ListTile(leading:const Icon(Icons.business_outlined,color:green),
             title:const Text('Business category'),
             subtitle:Text(shop.types.isEmpty?'Local business':
               shop.types.first.replaceAll('_',' '))),
           ListTile(leading:const Icon(Icons.place_outlined,color:green),
             title:const Text('Address'),
             subtitle:Text(shop.address.isNotEmpty?shop.address:shop.area)),
           if(shop.websiteUrl.startsWith('https://'))
             ListTile(leading:const Icon(Icons.language_outlined,color:green),
               title:const Text('Website'),
               subtitle:Text(shop.websiteUrl,maxLines:1,overflow:TextOverflow.ellipsis),
               onTap:()async{
                 final uri=Uri.tryParse(shop.websiteUrl);
                 if(uri!=null&&uri.scheme=='https'){
                   await (widget.externalLauncher?.call(uri)??
                     launchUrl(uri,mode:LaunchMode.externalApplication));
                 }
               }),
         ])),
         const SizedBox(height:12),
         Wrap(spacing:10,runSpacing:9,children:[
           FilledButton.icon(onPressed:()=>chatWithDirectory(shop),
             icon:const Icon(Icons.chat_bubble_outline),
             label:const Text('Chat')),
           OutlinedButton.icon(
             onPressed:(selectedDirectoryPhone??shop.phone).isNotEmpty
               ?()=>contactBusiness(selectedDirectoryPhone??shop.phone):null,
             icon:const Icon(Icons.phone_outlined),label:const Text('Call')),
         ]),
         const Padding(padding:EdgeInsets.only(top:8,bottom:6),
           child:Text('Verified Teyza businesses use in-app chat. Public listings may open WhatsApp if the business phone supports messaging.',
             style:TextStyle(fontSize:12,color:muted))),
       ]else...[
         if((selectedDirectoryPhone??shop.phone).isNotEmpty)
           TextButton.icon(
             onPressed:()=>contactBusiness(selectedDirectoryPhone??shop.phone),
             icon:const Icon(Icons.call_outlined),
             label:Text('Call '+(selectedDirectoryPhone??shop.phone))),
         if(shop.shopCategory=='spaza'&&verifiedMerchantFor(shop)==null)
           const Padding(padding:EdgeInsets.symmetric(vertical:8),
             child:Text('Products can only be ordered from verified participating Teyza shops.',
               style:TextStyle(color:muted,fontSize:12))),
       ],
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
      FilledButton.icon(
         onPressed:()=>openDirections(name:shop.name,address:shop.address,area:shop.area,
           latitude:shop.lat,longitude:shop.lng),
         icon:const Icon(Icons.directions_outlined),
         label:Text(shop.shopCategory=='variety'?'Directions to business':
           shop.shopCategory=='wholesale'?'Directions to wholesaler':'Directions to shop')),
       const SizedBox(height:8),
       if(shop.shopCategory=='spaza')onlineServices(shop),
       if(shop.shopCategory=='spaza'&&verifiedMerchantFor(shop)!=null)
         section('SHOP ITEMS'),
       if(shop.shopCategory=='spaza'&&verifiedMerchantFor(shop)!=null)
         FilledButton.icon(onPressed:()=>openShop(verifiedMerchantFor(shop)!),
           icon:const Icon(Icons.shopping_bag_outlined),
           label:const Text('View products and prices')),
       if(shop.shopCategory=='wholesale')
         const Text('Wholesale ordering requires an approved Teyza supplier connection.',
           style:TextStyle(color:muted,fontSize:12)),
      const SizedBox(height:15),
      if(verifiedMerchantFor(shop)==null)OutlinedButton.icon(onPressed:()=>claimDirectoryListing(shop),
        icon:const Icon(Icons.add_business_outlined),
        label:Text(shop.origin=='google_places'&&shop.placeId.isNotEmpty?'Own this shop? Claim it on Teyza':'Register your business on Teyza')),
      const SizedBox(height:13),
      const Text('Public listings do not imply a Teyza partnership. Ordering requires a verified participating merchant.',
        textAlign:TextAlign.center,
        style:TextStyle(color:muted,fontSize:11))
    ]);

  void chatWithShop(Shop shop,{String? message}){
    if(session.idToken==null||session.anonymousShopper){
      navigateToTab(4);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Sign in or register to contact this seller.')));return;
    }
    Navigator.push(context,MaterialPageRoute(builder:(_)=>ShopperChatPage(session:session,
      initialShop:ShopperConversation(shop.id,shop.name),initialMessage:message)));
  }
  Future<void> openDirections({required String name,String address='',String area='',double? latitude,double? longitude}) async {
    final uri=shopDirectionsUri(name:name,address:address,area:area,latitude:latitude,longitude:longitude);
    try{if(uri==null)throw StateError('Address unavailable');
      final opened=await (widget.externalLauncher?.call(uri)??launchUrl(uri,mode:LaunchMode.externalApplication));
      if(!opened)throw StateError('Maps unavailable');
    }catch(_){if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Could not open directions. Check your Maps app or connection and try again.')));}
  }

  Future<void> changeShop()async{
    final choices=live.where((s)=>s.identityVerified).toList()
      ..sort((a,b)=>a.name.compareTo(b.name));
    if(choices.isEmpty){setState(()=>selected=null);return;}
    final chosen=await showModalBottomSheet<Shop>(context:context,isScrollControlled:true,
      builder:(context)=>SafeArea(child:ListView(shrinkWrap:true,children:[
        const Padding(padding:EdgeInsets.all(18),child:Text('Change shop',
          style:TextStyle(fontSize:23,fontWeight:FontWeight.w900))),
        for(final s in choices)ListTile(
          title:Text(s.name),subtitle:Text(s.area),
          trailing:const Icon(Icons.chevron_right),
          onTap:()=>Navigator.of(context).pop(s)),
      ])));
    if(chosen!=null&&mounted)openShop(chosen);
  }
  Widget shopPage(Shop shop)=>RefreshIndicator(onRefresh:()=>load(silent:true),child:ListView(key:PageStorageKey<String>('shop-profile-${shop.id}'),physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.all(16),children:[
    TextButton.icon(onPressed:()=>backToCategory(shop.shopCategory),
      icon:const Icon(Icons.arrow_back),
      label:Text(teyzaBrowseLabel(shop.shopCategory))),
    ClipRRect(borderRadius:BorderRadius.circular(24),child:SizedBox(
      width:double.infinity,height:180,child:Stack(fit:StackFit.expand,children:[
        photo(shop.photo,size:420),
        const DecoratedBox(decoration:BoxDecoration(gradient:LinearGradient(
          begin:Alignment.topCenter,end:Alignment.bottomCenter,
          colors:[Colors.transparent,Color(0x99010F1C)]))),
        Positioned(left:16,bottom:14,child:Text(
          shop.shopCategory=='wholesale'?'WHOLESALER':shop.shopCategory=='variety'?'LOCAL BUSINESS':'SPAZA SHOP',
          style:const TextStyle(color:Colors.white,fontSize:11,fontWeight:FontWeight.w900,letterSpacing:1)))
      ]))),
    Container(key:ValueKey('seller-profile-${shop.id}'),margin:const EdgeInsets.only(top:10),
      padding:const EdgeInsets.all(18),decoration:BoxDecoration(color:Colors.white,
        borderRadius:BorderRadius.circular(22),border:Border.all(color:const Color(0xFFE9EFEB))),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(shop.name,style:const TextStyle(fontSize:22,fontWeight:FontWeight.w900,color:ink)),
        const SizedBox(height:4),
        Text(shop.address.isNotEmpty?shop.address:shop.area,style:const TextStyle(color:muted,fontSize:12)),
        if(distance(shop)!=null)Padding(padding:const EdgeInsets.only(top:4),
          child:Text(distance(shop)!.toStringAsFixed(1)+' km away (approx.)',
            style:const TextStyle(color:green,fontSize:11,fontWeight:FontWeight.w700))),
        const SizedBox(height:8),merchantTrust(shop),
        const SizedBox(height:8),Text(shopHoursLabel(shop.hours),
          style:const TextStyle(color:green,fontWeight:FontWeight.w700,fontSize:12)),
        const SizedBox(height:13),Wrap(spacing:8,runSpacing:8,children:[
          if(shop.liveChat&&ShopperChatApi.isTeyzaShop(shop.id))
            FilledButton.icon(icon:const Icon(Icons.chat_bubble_outline),
              label:const Text('Message shop'),onPressed:()=>chatWithShop(shop)),
          OutlinedButton.icon(onPressed:()=>openDirections(name:shop.name,address:shop.address,
            area:shop.area,latitude:shop.latitude,longitude:shop.longitude),
            icon:const Icon(Icons.directions_outlined),label:const Text('Directions to shop')),
          if(shop.phone.isNotEmpty)OutlinedButton.icon(onPressed:()=>contactBusiness(shop.phone),
            icon:const Icon(Icons.phone_outlined),label:const Text('Call'))
        ])
      ])),
    if(shop.shopCategory=='spaza')merchantServices(shop),
    if(shop.rangeProducts.isEmpty)
      empty('Products coming soon', shop.liveChat&&ShopperChatApi.isTeyzaShop(shop.id)?
        'Message this shop to ask about its range.':'Check back for this shop’s products.'),
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
        final canOrder=canAddFromShop(shop,p);
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
              onPressed:canOrder?()=>quantityForShop(shop,p,1):shop.liveChat?()=>chatWithShop(shop,message:'Hi, is '+p.name+' available?'):null,
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
    if(session.idToken==null||session.anonymousShopper){
      navigateToTab(4);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Sign in or register before checkout. Your address stays saved.')));return;
    }
    final done=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>ShopperCheckoutPage(
      session:session,shopId:shop.id,shopName:shop.name,delivery:shop.delivery,collection:shop.pickup,
      deliveryFeeCents:shop.deliveryFeeCents,acceptsCard:shop.acceptsCard==true,
      savedDeliveryAddress:deliveryProfile?.address??rememberedLocation?.address??'',
      savedPhone:deliveryProfile?.phone??session.phoneNumber??'',
      cashDiscountPercent:shop.cashDiscountPercent,items:basketItems.map((p)=>{
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
                  onPressed:(){quantityForShop(basketShop!,p,-1);refresh?.call();},
                  icon:const Icon(Icons.remove_rounded,color:ink,size:16),
                  constraints:const BoxConstraints(minHeight:35,minWidth:34),
                  padding:EdgeInsets.zero),
                Text((cart[p.id]??0).toString(),
                  style:const TextStyle(color:ink,fontSize:13,
                    fontWeight:FontWeight.w800)),
                IconButton(tooltip:'Add one '+p.name,
                  onPressed:(cart[p.id]??0)>=p.stock?null:(){
                    quantityForShop(basketShop!,p,1);refresh?.call();
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
            Row(children:[
              const Expanded(child:Text('Fulfilment options',
                style:TextStyle(color:muted))),
              Text(basketShop!.delivery&&basketShop!.pickup?'Delivery or collection':
                basketShop!.delivery?'Delivery available':
                basketShop!.pickup?'Order to collect':'Not enabled',
                style:const TextStyle(color:muted,fontSize:12)),
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
          label:Text(basketShop!.delivery&&basketShop!.pickup?'Choose delivery or collection':
            basketShop!.delivery?'Order for delivery':'Order to collect'))),
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
    final filteredOnline=found.where((shop)=>shop.shopCategory==currentType&&
      (term.isEmpty||(shop.name+' '+shop.area+' '+shop.address).toLowerCase().contains(term)))
      .toList()
      ..sort((a,b)=> (_distance(a.lat,a.lng)??double.infinity)
        .compareTo(_distance(b.lat,b.lng)??double.infinity));
    final filteredMerchants=selling.where((shop)=>term.isEmpty||
      (shop.name+' '+shop.area).toLowerCase().contains(term))
      .where((shop)=>shop.shopCategory==currentType)
      .toList()
      ..sort((a,b)=>(_distance(a.latitude,a.longitude)??double.infinity)
        .compareTo(_distance(b.latitude,b.longitude)??double.infinity));
    final combined=mergeNearbyListings(filteredMerchants,filteredOnline,area:current);
    final googleResults=filteredOnline.any((shop)=>shop.origin=='google_places');

    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Padding(padding:const EdgeInsets.fromLTRB(20,2,20,12),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Where are you shopping?',style:TextStyle(
            fontSize:25,fontWeight:FontWeight.w900,color:ink)),
          const SizedBox(height:4),
          Text(current==null?'Find a nearby spaza shop by location or suburb.':
            (currentType=='spaza'?'Spaza shops near ':currentType=='wholesale'?'Wholesalers near ':'Local Businesses near ')+current!.label,
            style:const TextStyle(color:muted,fontSize:13)),
          const SizedBox(height:11),
          Wrap(spacing:8,runSpacing:7,children:[
            ChoiceChip(label:const Text('Spaza Shops'),
              selected:currentType=='spaza',onSelected:busy?null:
                (_) => _perform(()=>widget.onChooseCategory('spaza'))),
            ChoiceChip(label:const Text('Wholesalers'),
              selected:currentType=='wholesale',onSelected:busy?null:
                (_) => _perform(()=>widget.onChooseCategory('wholesale'))),
            ChoiceChip(label:const Text('Local Businesses'),
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
              const Padding(padding:EdgeInsets.only(top:12,bottom:8),
                child:Text('NEARBY LISTINGS',style:TextStyle(fontSize:13,
                  color:ink,fontWeight:FontWeight.w900))),
              for(final entry in combined)Card(color:Colors.white,
                child:ListTile(
                  contentPadding:const EdgeInsets.symmetric(horizontal:12,vertical:5),
                  leading:entry.merchant?.photo.startsWith('https://')==true?
                    ClipRRect(borderRadius:BorderRadius.circular(12),
                      child:Image.network(entry.merchant!.photo,width:62,height:62,
                        fit:BoxFit.cover,errorBuilder:(_,__,___)=>const Icon(Icons.storefront_outlined,color:green))):
                    entry.directory!=null?_shopThumb(entry.directory!):
                    const Icon(Icons.storefront_outlined,color:green),
                  title:Text(entry.name,style:const TextStyle(fontWeight:FontWeight.w800)),
                  subtitle:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                    Text(entry.merchant?.address.isNotEmpty==true?entry.merchant!.address:
                      entry.directory?.address.isNotEmpty==true?entry.directory!.address:
                      entry.merchant?.area??entry.directory?.area??'',
                      maxLines:2,overflow:TextOverflow.ellipsis),
                    Text('Nearby shop'+_distanceLabel(_distance(entry.lat,entry.lng)),
                      style:const TextStyle(fontSize:11,color:muted)),
                    if(entry.merchant?.identityVerified==true)
                      const Text('✓ Teyza Verified',style:TextStyle(color:green,
                        fontSize:11,fontWeight:FontWeight.w800)),
                  ]),
                  trailing:const Icon(Icons.chevron_right,color:green),
                  onTap:()=>entry.merchant!=null?
                    widget.onOpenMerchant(entry.merchant!):
                    widget.onOpenOnline(entry.directory!))),
              if(combined.isEmpty)
                Padding(padding:const EdgeInsets.symmetric(vertical:30,horizontal:12),
                  child:Column(children:[
                    const Icon(Icons.search_off,size:47,color:green),
                    const SizedBox(height:10),
                    Text(term.isNotEmpty?'No matching shop found':
                      'No nearby listings found right now',
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
