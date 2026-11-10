import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/seller_selling.dart';
import 'package:teyza_shopper/seller_areas.dart';
import 'package:teyza_shopper/seller_tools.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'session_test.dart' as auth;

const savedShop=SellerShop('KwaMashu Fresh Market','spaza','KwaMashu, Durban','approved','active');
class SellerSession extends ShopperSession {
  SellerSession():super(store:auth.MemoryStore()){
    isReady=true;userId='seller1';idToken='seller-token';emailVerified=true;
  }
  @override Future<String> freshIdToken() async=>'seller-token';
}
class ShopRepo extends SellerFirestore {
  final Future<SellerShop?> Function()? read;
  const ShopRepo({required super.uid,required super.token,this.read});
  @override Future<SellerShop?> shop() async=>read!=null?await read!():savedShop;
  @override Future<List<SellerDraft>> drafts() async=>const [
    SellerDraft(id:'bread',name:'Fresh bread',category:'Bakery',priceCents:1500,stock:6)];
}
class ProductsUnavailableRepo extends ShopRepo {
  const ProductsUnavailableRepo({required super.uid,required super.token});
  @override Future<List<SellerDraft>> drafts() async=>throw StateError('Product list unavailable');
}
class SellerApi extends TeyzaMobileApi {
  SellerApi(super.session);
  final calls=<({String action,Map<String,dynamic> data})>[];
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
    calls.add((action:action,data:data));
    return switch(action){
      'seller_summary'=>{'publicationStatus':'active','approvalStatus':'approved','hasLocation':true,'sellingEnabled':true,'identityVerified':true,'settings':{},'credit':[],'photos':[]},
      'seller_mandate_status'=>{'required':false},'notification_list'=>{'unread':0,'notifications':[]},
      'order_list'=>{'orders':[]},'chat_list'=>{'scope':'owner','threads':[]},_=>{'ok':true}
    };
  }
}
class ActivatedSellerApi extends SellerApi {
  ActivatedSellerApi(super.session);
  bool membershipPaid=false;
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
    final result=await super.call(action,data);
    return action=='seller_summary'?
      {...result,'listingPaid':membershipPaid,'setupComplete':true}:result;
  }
}
class ComplimentarySellerApi extends SellerApi {
 ComplimentarySellerApi(super.session);
 @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
  final result=await super.call(action,data);
  if(action=='seller_summary')return {...result,'setupComplete':true,
    'complimentaryAccess':true,'listingPaid':false,'shopLive':true};
  if(action=='catalogue_sync')return {'publication':'live','publicCount':1};
  return result;
 }
}
class PendingSellerApi extends SellerApi {
 PendingSellerApi(super.session);
 @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
  if(action=='seller_summary')return {'approvalStatus':'pending','publicationStatus':'pending_review','settings':{},'credit':[],'photos':[]};
  return super.call(action,data);
 }
}
Future<void> capture(WidgetTester tester,GlobalKey key,String name) async {
  if(Platform.environment['TEYZA_CAPTURE_UI']!='1')return;
  await tester.runAsync(() async {
    final boundary=key.currentContext!.findRenderObject() as RenderRepaintBoundary;
    final image=await boundary.toImage(pixelRatio:2),data=await image.toByteData(format:ui.ImageByteFormat.png);
    final file=File('build/ui-preview/$name.png');await file.parent.create(recursive:true);
    await file.writeAsBytes(data!.buffer.asUint8List());image.dispose();
  });
}
void main(){
  testWidgets('Seller dashboard replaces shopping, products and customer tools work, logout restores shoppers',(tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
    await (FontLoader('PT Sans')..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf'))).load();
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final session=SellerSession()..useSellerWorkspace(),api=SellerApi(SellerSession());
    var publicReads=0;final boundary=GlobalKey();
    await tester.pumpWidget(MaterialApp(theme:ThemeData(useMaterial3:true,fontFamily:'PT Sans',
      colorScheme:ColorScheme.fromSeed(seedColor:green)),home:RepaintBoundary(key:boundary,child:ShopperHome(session:session,
      enableBackgroundServices:false,initialArea:areas.first,sellerMobileApi:api,
      sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token),
      catalogueLoader:() async{publicReads++;return [];},directoryLoader:(_,__,___) async=>[]))));
    await tester.pumpAndSettle();expect(find.byType(SellerNavigation),findsOneWidget);
    expect(find.text('Seller dashboard'),findsOneWidget);expect(find.text('Shops'),findsNothing);expect(find.text('Cart'),findsNothing);
    expect(find.byKey(const ValueKey('seller-add-product')),findsNothing);
    expect(find.byKey(const ValueKey('teyza-floating-chat')),findsOneWidget);
    expect(find.text('Upgrade to sell on Teyza'),findsNothing);
    expect(publicReads,0);
    await capture(tester,boundary,'seller-dashboard-28');
    await tester.tap(find.byKey(const ValueKey('seller-nav-1')));await tester.pumpAndSettle();
    expect(find.text('Fresh bread'),findsOneWidget);expect(find.text('R15.00'),findsOneWidget);
    expect(find.text('Add a custom product'),findsNothing);
    expect(find.textContaining('Product editing is unavailable until selling access is verified'),findsOneWidget);
    await capture(tester,boundary,'seller-products-28');
    await tester.tap(find.byKey(const ValueKey('seller-nav-2')));await tester.pumpAndSettle();
    expect(find.text('No orders yet'),findsOneWidget);expect(api.calls.last.action,'order_list');expect(api.calls.last.data,{'asOwner':true});
    await tester.tap(find.byKey(const ValueKey('seller-nav-3')));await tester.pumpAndSettle();
    expect(find.text('Your customers'),findsOneWidget);
    expect(find.textContaining('Open a registered shop'),findsNothing);
    expect(api.calls.last.action,'chat_list');expect(api.calls.last.data,{'asOwner':true});
    await tester.tap(find.byKey(const ValueKey('seller-nav-4')));await tester.pumpAndSettle();
    await tester.tap(find.text('Areas around me'));await tester.pumpAndSettle();
    expect(find.text('Grow your local reach'),findsOneWidget);expect(find.text('Use my location'),findsOneWidget);
    await tester.pageBack();await tester.pumpAndSettle();
    await tester.tap(find.text('Apply for stock finance'));await tester.pumpAndSettle();
    expect(find.text('Need help funding stock?'),findsOneWidget);expect(api.calls.where((c)=>c.action=='credit_enquiry'),isEmpty);
    await tester.pageBack();await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('seller-nav-0')));await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Sign out'));await tester.pumpAndSettle();
    expect(session.sellerWorkspace,isFalse);expect(find.byType(SellerNavigation),findsNothing);
    expect(find.text('Home'),findsOneWidget);expect(find.byKey(const ValueKey('nav-shop')),findsOneWidget);expect(find.text('Cart'),findsNothing);expect(publicReads,greaterThan(0));
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('Seller updates live inside Messages and shop options live in Edit shop profile',(tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final session=SellerSession()..useSellerWorkspace(),api=SellerApi(SellerSession());
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,
      enableBackgroundServices:false,initialArea:areas.first,sellerMobileApi:api,
      sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token),
      catalogueLoader:()async=>[],directoryLoader:(_,__,___)async=>[])));
    await tester.pumpAndSettle();
    expect(find.text('Notifications'),findsNothing);
    expect(find.text('Order alerts are available'),findsNothing);
    expect(find.byKey(const ValueKey('seller-delivery-toggle')),findsNothing);
    expect(find.byKey(const ValueKey('seller-card-toggle')),findsNothing);
    await tester.tap(find.byKey(const ValueKey('seller-nav-3')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-message-updates')),findsOneWidget);
    expect(find.text('Order & shop updates'),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('seller-nav-4')));
    await tester.pumpAndSettle();
    final edit=find.text('Edit shop profile');
    await tester.scrollUntilVisible(edit,220);
    await tester.tap(edit);
    await tester.pumpAndSettle();
    expect(find.text('Edit shop profile'),findsOneWidget);
    final cards=find.byKey(const ValueKey('seller-card-toggle'));
    await tester.ensureVisible(cards);await tester.pumpAndSettle();
    expect(cards,findsOneWidget);
    await tester.tap(cards);await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save shop options'));await tester.pumpAndSettle();
    await tester.tap(find.text('Save shop options'));await tester.pumpAndSettle();
    expect(api.calls.where((c)=>c.action=='update_services'),isNotEmpty);
    expect(api.calls.lastWhere((c)=>c.action=='update_services').data['cardPayments'],true);
    await tester.pageBack();await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('seller-nav-0')));await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-card-toggle')),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('Existing registered sellers enter the selling dashboard without a saved mode',(tester) async {
    SharedPreferences.setMockInitialValues({});final session=SellerSession(),api=SellerApi(SellerSession());
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,enableBackgroundServices:false,
      initialArea:areas.first,sellerMobileApi:api,sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token),
      catalogueLoader:() async=>[],directoryLoader:(_,__,___) async=>[])));
    await tester.pumpAndSettle();expect(session.sellerWorkspace,isTrue);expect(find.text('Seller dashboard'),findsOneWidget);
    expect(find.text('Shops'),findsNothing);expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('Approved complimentary seller can explicitly publish saved products without Paystack payment',(tester) async {
    SharedPreferences.setMockInitialValues({});
    final session=SellerSession()..useSellerWorkspace(),api=ComplimentarySellerApi(SellerSession());
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,
      enableBackgroundServices:false,initialArea:areas.first,
      sellerMobileApi:api,sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token),
      catalogueLoader:()async=>[],directoryLoader:(_,__,___)async=>[])));
    await tester.pumpAndSettle();
    final button=find.byKey(const ValueKey('seller-publish-saved-products'));
    expect(button,findsOneWidget);
    expect(find.textContaining('temporary selling access is separate from Paystack payment'),findsOneWidget);
    await tester.ensureVisible(button);await tester.pumpAndSettle();
    await tester.tap(button);await tester.pumpAndSettle();
    expect(api.calls.where((c)=>c.action=='catalogue_sync'),isNotEmpty);
    expect(api.calls.where((c)=>c.action=='billing_checkout'),isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('Free seller has one floating Chat with informational Upgrade Account, no purchase flow',(tester) async {
    SharedPreferences.setMockInitialValues({});
    final session=SellerSession()..useSellerWorkspace(),api=SellerApi(SellerSession());
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,enableBackgroundServices:false,
      initialArea:areas.first,sellerMobileApi:api,sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token),
      catalogueLoader:() async=>[],directoryLoader:(_,__,___) async=>[])));
    await tester.pumpAndSettle();
    expect(find.text('Start selling'),findsNothing);
    expect(find.text('Upgrade to sell on Teyza'),findsNothing);
    expect(find.byKey(const ValueKey('seller-add-product')),findsNothing);
    expect(find.byKey(const ValueKey('teyza-floating-chat')),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('teyza-floating-chat')));await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('support-upgrade-account')),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('support-upgrade-account')));await tester.pumpAndSettle();
    expect(find.text('Membership steps'),findsOneWidget);
    expect(api.calls.where((c)=>c.action=='billing_checkout'),isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('Seller automatically recognises externally verified Paystack membership on app resume',(tester) async {
    SharedPreferences.setMockInitialValues({});
    final session=SellerSession()..useSellerWorkspace();
    final api=ActivatedSellerApi(SellerSession());
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,
      enableBackgroundServices:false,initialArea:areas.first,
      sellerMobileApi:api,sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token),
      catalogueLoader:()async=>[],directoryLoader:(_,__,___)async=>[])));
    await tester.pumpAndSettle();
    expect(api.calls.where((call)=>call.action=='seller_summary'),isNotEmpty);
    api.membershipPaid=true; // Only a later authenticated server response can grant selling access.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump(const Duration(milliseconds:500));
    expect(find.textContaining('Premium account is active'),findsOneWidget);
    expect(api.calls.where((call)=>call.action=='billing_checkout'),isEmpty,
      reason:'App recognises paid access but cannot initiate Paystack subscription.');
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('Product-list error still leaves one support entry point without an upgrade duplicate',(tester) async {
    SharedPreferences.setMockInitialValues({});final session=SellerSession()..useSellerWorkspace(),api=SellerApi(SellerSession());
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,enableBackgroundServices:false,
      initialArea:areas.first,sellerMobileApi:api,sellerApiFactory:(uid,token)=>ProductsUnavailableRepo(uid:uid,token:token),
      catalogueLoader:() async=>[],directoryLoader:(_,__,___) async=>[])));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('teyza-floating-chat')),findsOneWidget);
    expect(find.text('Start selling'),findsNothing);
    expect(find.text('Upgrade to sell on Teyza'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('A pending seller sees benefits but cannot begin checkout',(tester) async {
    SharedPreferences.setMockInitialValues({});final session=SellerSession()..useSellerWorkspace(),api=PendingSellerApi(SellerSession());
    const pending=SellerShop('Market','spaza','Durban','pending','not_listed');
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,enableBackgroundServices:false,
      initialArea:areas.first,sellerMobileApi:api,sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token,read:()async=>pending),
      catalogueLoader:() async=>[],directoryLoader:(_,__,___) async=>[])));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-add-product')),findsNothing);
    expect(find.byKey(const ValueKey('teyza-floating-chat')),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('teyza-floating-chat')));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('support-upgrade-account')));await tester.pumpAndSettle();
    expect(find.text('Membership steps'),findsOneWidget);
    expect(api.calls.where((c)=>c.action=='billing_checkout'),isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('A delayed seller lookup cannot switch the app back after logout',(tester) async {
    SharedPreferences.setMockInitialValues({});final session=SellerSession();final result=Completer<SellerShop?>();
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,enableBackgroundServices:false,
      initialArea:areas.first,sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token,read:()=>result.future),
      catalogueLoader:() async=>[],directoryLoader:(_,__,___) async=>[])));
    await tester.pump();await session.signOut();result.complete(savedShop);await tester.pumpAndSettle();
    expect(session.sellerWorkspace,isFalse);expect(find.byType(SellerNavigation),findsNothing);expect(find.text('Home'),findsOneWidget);expect(find.byKey(const ValueKey('nav-shop')),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('Ending a seller session closes finance and returns to shopper navigation',(tester) async {
    SharedPreferences.setMockInitialValues({});final session=SellerSession()..useSellerWorkspace(),api=SellerApi(SellerSession());
    await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,enableBackgroundServices:false,
      initialArea:areas.first,sellerMobileApi:api,sellerApiFactory:(uid,token)=>ShopRepo(uid:uid,token:token),
      catalogueLoader:() async=>[],directoryLoader:(_,__,___) async=>[])));
    await tester.pumpAndSettle();await tester.tap(find.byKey(const ValueKey('seller-nav-4')));await tester.pumpAndSettle();
    await tester.tap(find.text('Apply for stock finance'));await tester.pumpAndSettle();expect(find.text('Need help funding stock?'),findsOneWidget);
    await session.signOut();await tester.pumpAndSettle();
    expect(find.text('Need help funding stock?'),findsNothing);expect(find.text('Home'),findsOneWidget);expect(find.byKey(const ValueKey('nav-shop')),findsOneWidget);
    expect(find.byType(SellerNavigation),findsNothing);expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('Seller navigation and actions fit a narrow screen with larger text',(tester) async {
    await tester.binding.setSurfaceSize(const Size(320,760));addTearDown(()=>tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home:MediaQuery(data:const MediaQueryData(size:Size(320,760),textScaler:TextScaler.linear(1.5)),
      child:Scaffold(body:SellerSellingDashboard(shopName:'Local shop',live:true,verified:true,productCount:12,
        onAdd:(){},onProducts:(){},onOrders:(){},onChat:(){},onFinance:(){},onAreas:(){},onBusiness:(){},onVerify:(){}),
        bottomNavigationBar:SellerNavigation(selected:0,onSelect:(_){})))));
    await tester.pumpAndSettle();expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  test('Nearby selling areas stay local and finance outcomes use the actual server status',(){
    final nearby=nearbySellingAreas(sellingAreas.first);
    expect(nearby.any((a)=>a.name=='KwaMashu'),isTrue);expect(nearby.any((a)=>a.city=='Cape Town'),isFalse);
    expect(sellerFinanceStatus('under_review'),'Under review');expect(sellerFinanceStatus('approved_in_principle'),'Approved in principle');
  });
}
