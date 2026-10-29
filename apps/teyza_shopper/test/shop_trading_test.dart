import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:teyza_shopper/seller_services.dart';
import 'package:teyza_shopper/seller_workspace.dart';
import 'package:teyza_shopper/seller_push.dart';
import 'package:teyza_shopper/shop_directions.dart';
import 'package:teyza_shopper/shop_orders.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'seller_experience_test.dart' as fixtures;
import 'seller_mode_test.dart' as mode;

Future<void> loadTradingFonts() async {
 await (FontLoader('PT Sans')..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
   ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf'))).load();
 await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
}
ThemeData tradingTheme()=>ThemeData(useMaterial3:true,fontFamily:'PT Sans',scaffoldBackgroundColor:pale,
 colorScheme:ColorScheme.fromSeed(seedColor:green,surface:Colors.white));

class TradingApi extends TeyzaMobileApi {
  TradingApi(super.session);
  final calls=<({String action,Map<String,dynamic> data})>[];
  Uint8List? photo;
  Completer<Map<String,dynamic>>? photoReply,firstQuote;
  List<Map<String,dynamic>> notices=[];
  Map<String,dynamic>? saved;
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
    calls.add((action:action,data:data));
    if(action=='seller_summary')return {'settings':{'pickupEnabled':true,'deliveryEnabled':false,'cardPayments':true,'liveChatEnabled':true},
      'publicationStatus':'active','approvalStatus':'approved','sellingEnabled':true,'identityVerified':true,'hasLocation':true,
      if((photo!=null||photoReply!=null)&&session.userId!='another')'shopFront':{'photoId':'front1'}};
    if(action=='shop_front_read')return photoReply!=null?photoReply!.future:{'shopFront':{'photoId':'front1','imageBase64':base64Encode(photo!)}};
    if(action=='seller_mandate_status')return {'required':false};
    if(action=='notification_list')return {'unread':notices.length,'notifications':notices};
    if(action=='order_list')return {'orders':[]};
    if(action=='update_services'){saved=data;return {'saved':true,'settings':data};}
    if(action=='order_quote'){
      if(firstQuote!=null&&calls.where((c)=>c.action=='order_quote').length==1)return firstQuote!.future;
      final delivery=data['mode']=='delivery',cash=data['paymentMethod']=='cash';
      return {'quote':{'quoteId':'${data['mode']}-${data['paymentMethod']}',
        'items':[{'id':'bread','name':'Bread','quantity':2,'priceCents':1750}],
        'subtotalCents':3500,'deliveryFeeCents':delivery?1500:0,'cashDiscountCents':cash?350:0,'cardFeeCents':0,
        'totalCents':3500+(delivery?1500:0)-(cash?350:0),'cardPayments':true,'offeredCashDiscountPercent':10}};
    }
    return {'ok':true};
  }
}
void main(){
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 testWidgets('Seller quick controls save delivery price, card acceptance, messages and an optional cash discount',(tester) async {
  await loadTradingFonts();final boundary=GlobalKey();
  final session=fixtures.Session(),api=TradingApi(fixtures.Session());
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(theme:tradingTheme(),home:RepaintBoundary(key:boundary,child:Scaffold(body:ListView(children:[SellerServiceControls(session:session,api:api,
    settings:const {'deliveryEnabled':false,'cardPayments':false,'liveChatEnabled':true})])))));
  await fixtures.visibleTap(tester,find.byKey(const ValueKey('seller-delivery-toggle')));
  await tester.enterText(find.byKey(const ValueKey('seller-delivery-fee')),'15.00');
  await tester.enterText(find.byKey(const ValueKey('seller-delivery-radius')),'3');tester.testTextInput.hide();
  await fixtures.visibleTap(tester,find.byKey(const ValueKey('seller-card-toggle')));
  await fixtures.visibleTap(tester,find.byKey(const ValueKey('seller-cash-discount')));
  await fixtures.visibleTap(tester,find.text('10% off items for cash').last);
  await fixtures.visibleTap(tester,find.byKey(const ValueKey('seller-messaging-toggle')));
  await tester.ensureVisible(find.text('Delivery, cards & messages'));await tester.pumpAndSettle();
  await mode.capture(tester,boundary,'seller-shop-service-options');
  await fixtures.visibleTap(tester,find.text('Save shop options'));
  expect(api.saved,{'deliveryEnabled':true,'deliveryFeeCents':1500,'deliveryRadiusKm':3,'cardPayments':true,
    'liveChatEnabled':false,'cashDiscountPercent':10,'cardPaymentFeePercent':0});
  expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Account switches clear unsaved service values and disable saving',(tester) async {
  final session=fixtures.Session(),api=TradingApi(fixtures.Session());
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:ListView(children:[SellerServiceControls(session:session,api:api,
    settings:const {'deliveryEnabled':true,'deliveryFeeCents':1500,'deliveryRadiusKm':3})]))));
  await tester.enterText(find.byKey(const ValueKey('seller-delivery-fee')),'27');session.switchAccount();await tester.pumpAndSettle();
  final button=find.widgetWithText(FilledButton,'Save shop options');await tester.ensureVisible(button);
  expect(tester.widget<FilledButton>(button).onPressed,isNull);expect(api.saved,isNull);
  expect(find.text('27'),findsNothing);await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('The seller dashboard displays the saved shop photo and a new order opens Orders',(tester) async {
  await loadTradingFonts();
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  final session=fixtures.Session(),api=TradingApi(fixtures.Session());
  api.photo=(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();
  final boundary=GlobalKey();
  await tester.pumpWidget(MaterialApp(theme:tradingTheme(),home:RepaintBoundary(key:boundary,child:SellerWorkspacePage(session:session,openLogin:(){},sellerMode:true,
    apiFactory:(uid,token)=>mode.ShopRepo(uid:uid,token:token),mobileApi:api))));
  await tester.pumpAndSettle();expect(find.byKey(const ValueKey('seller-shop-photo')),findsOneWidget);
  await tester.runAsync(()=>precacheImage(MemoryImage(api.photo!),tester.element(find.byKey(const ValueKey('seller-shop-photo')))));
  await tester.pumpAndSettle();
  expect(api.calls.where((c)=>c.action=='shop_front_read').length,1);
  await mode.capture(tester,boundary,'seller-photo-service-dashboard');
  api.notices=[{'id':'order-notice','title':'New order request','target':'orders','category':'orders','read':false}];
  SellerPush(session).updates.add(null);await tester.pumpAndSettle();expect(find.text('New order request'),findsOneWidget);
  await fixtures.visibleTap(tester,find.text('View orders'));expect(find.byType(ShopOrdersPanel),findsOneWidget);
  expect(api.calls.any((c)=>c.action=='order_list'&&c.data['asOwner']==true),isTrue);
  expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('A late shop photo cannot appear after changing accounts',(tester) async {
  final session=fixtures.Session(),api=TradingApi(session)..photoReply=Completer<Map<String,dynamic>>();
  await tester.pumpWidget(MaterialApp(home:SellerWorkspacePage(session:session,openLogin:(){},sellerMode:true,
    apiFactory:(uid,token)=>mode.ShopRepo(uid:uid,token:token),mobileApi:api)));
  await tester.pump();await tester.pump(const Duration(milliseconds:100));
  session.switchAccount();await tester.pump();
  final bytes=(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();
  api.photoReply!.complete({'shopFront':{'photoId':'front1','imageBase64':base64Encode(bytes)}});await tester.pumpAndSettle();
  expect(find.byKey(const ValueKey('seller-shop-photo')),findsNothing);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 test('Directions use a valid saved pin, then a full address; an unset pin never routes to zero/zero',(){
  expect(shopDirectionsUri(name:'Shop',address:'12 Main Road, Durban',latitude:-29.74,longitude:30.99)!.queryParameters['destination'],'-29.74,30.99');
  expect(shopDirectionsUri(name:'Shop',address:'12 Main Road, Durban',area:'KwaMashu',latitude:0,longitude:0)!.queryParameters['destination'],'12 Main Road, Durban');
  expect(shopDirectionsUri(name:'Shop',area:'KwaMashu')!.queryParameters['destination'],'Shop, KwaMashu');
  expect(shopDirectionsUri(name:''),isNull);
 });
 testWidgets('A shopper opens directions directly from the shop page without signing in',(tester) async {
  await loadTradingFonts();final boundary=GlobalKey();
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  final session=ShopperSession()..isReady=true;Uri? opened;
  final shop=Shop.fromJson({'id':'shop-direction','name':'Direction Shop','area':'Durban','address':'12 Main Road, Durban',
    'latitude':-29.8587,'longitude':31.0218,'identityVerified':true,'pickupEnabled':true});
  await tester.pumpWidget(MaterialApp(theme:tradingTheme(),home:RepaintBoundary(key:boundary,child:ShopperHome(session:session,enableBackgroundServices:false,initialArea:areas.first,
    catalogueLoader:() async=>[shop],directoryLoader:(_,__,___) async=>[],externalLauncher:(uri) async{opened=uri;return true;}))));
  await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
  final card=find.byKey(const ValueKey('nearby-shop-direction'));
  await tester.scrollUntilVisible(card,180,scrollable:find.byType(Scrollable).first);await fixtures.visibleTap(tester,card);
  await fixtures.visibleTap(tester,find.text('Directions to shop'));
  await mode.capture(tester,boundary,'shopper-directions-and-messages');
  expect(opened!.path,'/maps/dir/');expect(opened!.queryParameters['destination'],'-29.8587,31.0218');
  expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Checkout shows delivery and cash discount separately and card payments have no surcharge',(tester) async {
  final session=fixtures.Session(),api=TradingApi(fixtures.Session());
  await tester.pumpWidget(MaterialApp(home:ShopperCheckoutPage(session:session,api:api,shopId:'shop1',shopName:'Corner Shop',
    delivery:true,collection:true,acceptsCard:true,items:const [{'id':'bread','name':'Bread','quantity':2,'priceCents':1}])));
  await tester.pumpAndSettle();expect(find.text('Total: R31.50'),findsOneWidget);
  await fixtures.visibleTap(tester,find.text('Delivery'));await tester.pumpAndSettle();
  expect(find.text('Delivery fee: R15.00'),findsOneWidget);expect(find.text('Total: R46.50'),findsOneWidget);
  await fixtures.visibleTap(tester,find.text('Collect'));await fixtures.visibleTap(tester,find.text('Card at the shop'));
  expect(find.text('Total: R35.00'),findsOneWidget);expect(find.text('Extra card charge: R0.00'),findsOneWidget);
  expect(find.textContaining('cash discount on items'),findsNothing);
  expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('A late collection quote cannot replace a newer delivery total',(tester) async {
  final session=fixtures.Session(),api=TradingApi(fixtures.Session())..firstQuote=Completer<Map<String,dynamic>>();
  await tester.pumpWidget(MaterialApp(home:ShopperCheckoutPage(session:session,api:api,shopId:'shop1',shopName:'Shop',delivery:true,collection:true,
    items:const [{'id':'bread','name':'Bread','quantity':2,'priceCents':1}])));
  await tester.pump();await tester.tap(find.text('Delivery'));await tester.pumpAndSettle();
  await tester.scrollUntilVisible(find.text('Total: R46.50'),160,scrollable:find.byType(Scrollable).first);
  expect(find.text('Total: R46.50'),findsOneWidget);
  api.firstQuote!.complete({'quote':{'quoteId':'old','totalCents':1,'items':[]}});await tester.pumpAndSettle();
  expect(find.text('Total: R46.50'),findsOneWidget);expect(find.text('Total: R0.01'),findsNothing);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 test('Phone notification taps open the correct seller destination and reject another owner',(){
  final session=fixtures.Session(),push=SellerPush(fixtures.Session());String? target;push.onOpen=(value)=>target=value;
  push.open(const RemoteMessage(data:{'ownerUid':'someone-else','target':'orders'}));expect(target,isNull);
  push.open(const RemoteMessage(data:{'ownerUid':'owner','target':'orders'}));expect(target,'orders');
  push.open(const RemoteMessage(data:{'ownerUid':'owner','target':'unknown'}));expect(target,'notifications');
  push.dispose();push.session.dispose();session.dispose();
 });
}
