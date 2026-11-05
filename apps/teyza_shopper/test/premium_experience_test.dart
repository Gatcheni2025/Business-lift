import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/premium_navigation.dart';
import 'package:teyza_shopper/shopper_account.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/shopper_discovery.dart';

class FakeSession extends ShopperSession {
  FakeSession(){isReady=true;}
  @override Future<void> signIn(String email,String password) async {
    idToken='test-session';this.email=email;notifyListeners();
  }
}
void main(){
  test('Nearby results merge both sources and retain all unique branches',(){
    final merchant=Shop.fromJson({'id':'seller','name':'Corner Grocer',
      'latitude':-29.8587,'longitude':31.0218});
    final directory=List.generate(36,(i)=>OnlineShop.fromJson({
      'id':'google-'+i.toString(),'name':i==0?'Corner Grocer':'Neighbourhood Shop '+i.toString(),
      'latitude':-29.8587+i*.001,'longitude':31.0218,
      'origin':'google_places','shopCategory':'spaza','categorizationVerified':true
    }));
    final merged=mergeNearbyListings([merchant],directory,area:areas.first);
    expect(merged,hasLength(36));
    expect(merged.first.merchant,same(merchant));
    expect(merged.first.directory,same(directory.first));
  });
  testWidgets('All five shopper destinations navigate and Sell is absent',(tester) async {
    final visited=<int>[];
    await tester.pumpWidget(MaterialApp(home:Scaffold(
      bottomNavigationBar:PremiumShopperNavigation(selectedIndex:0,onSelect:visited.add))));
    for(final label in ['home','shops','shop','orders','account']){
      await tester.tap(find.byKey(ValueKey('nav-'+label)));
    }
    expect(visited,[0,5,1,3,4]);
    expect(find.text('Sell'),findsNothing);
    expect(tester.takeException(),isNull);
  });
  testWidgets('Shop tab remains available when no products exist',(tester)async{
    await tester.pumpWidget(MaterialApp(home:Scaffold(
      bottomNavigationBar:PremiumShopperNavigation(selectedIndex:0,onSelect:(_){}))));
    expect(find.byKey(const ValueKey('nav-shop')),findsOneWidget);
    expect(find.text('Home'),findsOneWidget);
    expect(find.text('Cart'),findsNothing);
    expect(tester.takeException(),isNull);
  });
  testWidgets('Navigation fits a narrow screen with larger text',(tester) async {
    await tester.binding.setSurfaceSize(const Size(320,700));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home:MediaQuery(
      data:const MediaQueryData(size:Size(320,700),textScaler:TextScaler.linear(1.5)),
      child:Scaffold(bottomNavigationBar:PremiumShopperNavigation(
        selectedIndex:4,onSelect:(_){})))));
    expect(find.byKey(const ValueKey('nav-shop')),findsOneWidget);
    expect(tester.takeException(),isNull);
  });
  for(final role in ['Shopper','Shop Owner']){
    testWidgets(role+' login routes to the selected experience',(tester) async {
      final session=FakeSession();
      var openedOwner=false,openedShopper=false;
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(
        session:session,onOpenOwner:()=>openedOwner=true,onShopperSignedIn:()=>openedShopper=true))));
      await tester.tap(find.text('Continue as '+role));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).at(0),'shop@example.test');
      await tester.enterText(find.byType(TextFormField).at(1),'password123');
      final button=find.text(role=='Shop Owner'?'Sign in as shop owner':'Sign in as shopper');
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(openedOwner,role=='Shop Owner');expect(openedShopper,role=='Shopper');
      expect(tester.takeException(),isNull);
      await tester.pumpWidget(const SizedBox.shrink());session.dispose();
    });
  }
  testWidgets('Cart survives Home and Shops navigation',(tester) async {
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    var merchant=Shop.fromJson({'id':'test-store','name':'Corner Grocer','area':'Durban','pickupEnabled':true,
      'latitude':-29.8587,'longitude':31.0218,'products':[
        {'id':'bread','name':'Fresh bread','priceCents':1800,'stock':10}
      ]});
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:() async=>[merchant],
      directoryLoader:(area,type,radius) async=>[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    final store=find.byKey(const ValueKey('nearby-test-store'));
    await tester.scrollUntilVisible(store,180,scrollable:find.byType(Scrollable).first);
    await tester.tap(store);await tester.pumpAndSettle();
    final add=find.text('+ Add');
    // The product grid is intentionally non-scrollable inside the shop list.
    // Use the shopper's outer-list gesture until the actual button can be hit.
    for(var attempts=0;attempts<12&&add.hitTestable().evaluate().isEmpty;attempts++){
      await tester.drag(find.byType(ListView).first,const Offset(0,-220));
      await tester.pumpAndSettle();
    }
    expect(add.hitTestable(),findsOneWidget);
    await tester.tap(add.hitTestable());
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-home')));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-shop')));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('floating-cart')));await tester.pumpAndSettle();
    expect(find.text('Items from Corner Grocer'),findsOneWidget);
    expect(find.text('Fresh bread'),findsOneWidget);
    expect(find.text('Unit R18.00'),findsOneWidget);
    merchant=Shop.fromJson({'id':'test-store','name':'Corner Grocer','area':'Durban','pickupEnabled':true,
      'latitude':-29.8587,'longitude':31.0218,'products':[
        {'id':'bread','name':'Fresh bread','priceCents':1900,'stock':8}
      ]});
    await tester.tap(find.byKey(const ValueKey('nav-home')));await tester.pumpAndSettle();
    final refreshed=tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator).first).show();
    await tester.pumpAndSettle();await refreshed;
    await tester.tap(find.byKey(const ValueKey('floating-cart')));await tester.pumpAndSettle();
    expect(find.text('Unit R19.00'),findsOneWidget);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('Premium screens render with offline fixtures without overflow',(tester) async {
    // UI fixtures are never bundled as actual merchant records or product stock.
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final fonts=FontLoader('PT Sans')..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf'));
    await fonts.load();
    final icons=FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    final boundary=GlobalKey();
    await tester.pumpWidget(MaterialApp(theme:ThemeData(fontFamily:'PT Sans',useMaterial3:true,
      scaffoldBackgroundColor:pale,colorScheme:ColorScheme.fromSeed(seedColor:green)),
      home:RepaintBoundary(key:boundary,child:ShopperHome(initialArea:areas.first,
        enableBackgroundServices:false,catalogueLoader:() async=>[],
        directoryLoader:(area,type,radius) async=>List.generate(12,(i)=>OnlineShop.fromJson({
          'id':'preview-'+i.toString(),'name':i==0?'Neighbourhood Market':'Corner Grocer '+(i+1).toString(),
          'latitude':-29.8587+i*.002,'longitude':31.0218,'origin':'google_places',
          'shopCategory':type,'categorizationVerified':true,'rating':4.7,
          'ratingCount':23,'openNow':true
        }))))));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    await tester.runAsync(()=>precacheImage(const AssetImage('assets/images/grocery-basket.png'),
      tester.element(find.byType(ShopperHome))));
    await tester.pumpAndSettle();
    expect(find.text('Nearby shops'),findsOneWidget);expect(tester.takeException(),isNull);
    Future<void> capture(String name) async {
      if(Platform.environment['TEYZA_CAPTURE_UI']!='1')return;
      await tester.runAsync(() async {
        final render=boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        final picture=await render.toImage(pixelRatio:2);
        final bytes=await picture.toByteData(format:ui.ImageByteFormat.png);
        final output=File('build/ui-preview/'+name+'.png');
        await output.parent.create(recursive:true);
        await output.writeAsBytes(bytes!.buffer.asUint8List());picture.dispose();
      });
    }
    await capture('home');
    await tester.runAsync(()=>Future.wait([
      'bread','milk','eggs','rice','maize','oil','snacks','soap'
    ].map((item)=>precacheImage(AssetImage('assets/images/essentials/'+item+'.webp'),
      tester.element(find.byType(ShopperHome))))));
    for(var attempts=0;attempts<8&&find.text('Bread').hitTestable().evaluate().isEmpty;attempts++){
      await tester.drag(find.byType(ListView).first,const Offset(0,-200));
      await tester.pumpAndSettle();
    }
    expect(find.text('Bread').hitTestable(),findsOneWidget);
    expect(tester.takeException(),isNull);
    await capture('essentials');
    // After scrolling down to Bread, the lazily-built See all control is
    // above the viewport. Scroll home to the top before opening nearby shops.
    for(var attempt=0;attempt<8&&find.text('See all').evaluate().isEmpty;attempt++){
      await tester.drag(find.byType(ListView).first,const Offset(0,600));
      await tester.pumpAndSettle();
    }
    expect(find.text('See all'),findsOneWidget);
    await tester.tap(find.text('See all'));await tester.pumpAndSettle();
    expect(find.text('Search wider'),findsOneWidget);expect(tester.takeException(),isNull);
    await capture('shops');
    await tester.tap(find.text('Account'));await tester.pumpAndSettle();
    expect(find.text('Continue as Shopper'),findsOneWidget);
    expect(find.text('Continue as Shop Owner'),findsOneWidget);
    expect(tester.takeException(),isNull);await capture('login-roles');
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('Local Businesses appear on home even when Spaza Shops is selected',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final requested=<String>[];
    final salon=OnlineShop.fromJson({
      'id':'local-salon','name':'Durban Hair Studio','shopCategory':'variety',
      'latitude':-29.8587,'longitude':31.0218,'origin':'openstreetmap',
      'categorizationVerified':true,
    });
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>[],
      directoryLoader:(area,type,radius)async{
        requested.add(type);
        return type=='variety'?[salon]:<OnlineShop>[];
      })));
    await tester.pump();await tester.pump(const Duration(seconds:1));
    await tester.pumpAndSettle();
    expect(requested,contains('spaza'));
    expect(requested,contains('variety'),
      reason:'Local Businesses must load independently of the current category');
    // The home body is vertically lazy: scroll the viewport first instead
    // of asking scrollUntilVisible to resolve an as-yet-unbuilt widget.
    final homeScroll=find.byType(ListView).first;
    for(var n=0;n<15&&find.text('Local Businesses').evaluate().isEmpty;n++){
      await tester.drag(homeScroll,const Offset(0,-200));
      await tester.pumpAndSettle();
    }
    expect(find.text('Local Businesses'),findsOneWidget);
    await tester.ensureVisible(find.text('Local Businesses'));
    await tester.pumpAndSettle();
    // The nested horizontal cards may not be built until they enter view.
    for(var n=0;n<6&&find.text('Durban Hair Studio').evaluate().isEmpty;n++){
      await tester.drag(homeScroll,const Offset(0,-145));
      await tester.pumpAndSettle();
    }
    expect(find.text('Durban Hair Studio'),findsOneWidget);
    final salonCard=find.byKey(const ValueKey('nearby-local-salon'));
    expect(find.descendant(of:salonCard,matching:find.text('More')),findsOneWidget);
    expect(find.text('Buy here'),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('Public shop offers Buy here without an ordering error',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final directory=OnlineShop.fromJson({
      'id':'google-public-shop','name':'Neighbourhood Grocer','shopCategory':'spaza',
      'latitude':-29.8587,'longitude':31.0218,'origin':'openstreetmap',
      'openNow':true,'categorizationVerified':true
    });
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>[],
      directoryLoader:(area,type,radius)async=>type=='spaza'?[directory]:[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    expect(find.text('Ordering not available'),findsNothing);
    final card=find.byKey(const ValueKey('nearby-google-public-shop'));
    await tester.ensureVisible(card);await tester.pumpAndSettle();
    final buy=find.descendant(of:card,matching:find.text('Buy here'));
    await tester.tap(buy);await tester.pumpAndSettle();
    expect(find.text('Browse all shops'),findsOneWidget,
      reason:'Buy here opens shop details without inventing products or checkout');
    expect(find.text('Ordering not available'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  test('Discovery labels distinguish spaza, wholesalers and local businesses',(){
    expect(teyzaListingAction('spaza'),'Buy here');
    expect(teyzaListingAction('wholesale'),'More');
    expect(teyzaListingAction('variety'),'More');
    expect(teyzaBrowseLabel('spaza'),'Browse all shops');
    expect(teyzaBrowseLabel('wholesale'),'Browse wholesalers');
    expect(teyzaBrowseLabel('variety'),'Browse local businesses');
    expect(teyzaCategoryHeading('variety'),'Local Businesses');
  });

  testWidgets('Local business More opens details, Chat, Call and correct back list',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final launches=<Uri>[];
    final salon=OnlineShop.fromJson({
      'id':'salon-biz','name':'Local Hair Studio','shopCategory':'variety',
      'latitude':-29.8587,'longitude':31.0218,
      'origin':'openstreetmap','phone':'0315661165',
      'address':'Main Road, Durban','types':['hair_care'],
      'websiteUrl':'https://example.com/studio',
    });
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>[],
      externalLauncher:(uri)async{launches.add(uri);return true;},
      directoryLoader:(area,type,radius)async=>type=='variety'?[salon]:[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));
    await tester.pumpAndSettle();
    final homeScroll=find.byType(ListView).first;
    final salonCard=find.byKey(const ValueKey('nearby-salon-biz'));
    for(var i=0;i<18&&salonCard.evaluate().isEmpty;i++){
      await tester.drag(homeScroll,const Offset(0,-180));
      await tester.pumpAndSettle();
    }
    expect(salonCard,findsOneWidget);
    await tester.ensureVisible(salonCard);await tester.pumpAndSettle();
    await tester.tap(find.descendant(of:salonCard,matching:find.text('More')));
    await tester.pumpAndSettle();
    expect(find.text('Browse local businesses'),findsOneWidget);
    expect(find.text('Local Business details'),findsOneWidget);
    expect(find.text('Business category'),findsOneWidget);
    expect(find.text('Main Road, Durban'),findsWidgets);
    // Chat and Call are below the photo and business facts on a 390px phone.
    // Scroll the lazily built details list before asserting or tapping them.
    final detailsScroll=find.byType(ListView).first;
    for(var i=0;i<10&&find.widgetWithText(FilledButton,'Chat').evaluate().isEmpty;i++){
      await tester.drag(detailsScroll,const Offset(0,-150));
      await tester.pumpAndSettle();
    }
    expect(find.widgetWithText(FilledButton,'Chat'),findsOneWidget);
    expect(find.widgetWithText(OutlinedButton,'Call'),findsOneWidget);
    await tester.ensureVisible(find.widgetWithText(FilledButton,'Chat'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton,'Chat'));
    await tester.pumpAndSettle();
    expect(launches.last.host,'wa.me');
    expect(launches.last.path,'/27315661165');
    await tester.tap(find.widgetWithText(OutlinedButton,'Call'));
    await tester.pumpAndSettle();
    expect(launches.last.scheme,'tel');
    for(var i=0;i<10&&find.text('Browse local businesses').evaluate().isEmpty;i++){
      await tester.drag(detailsScroll,const Offset(0,240));
      await tester.pumpAndSettle();
    }
    expect(find.text('Browse local businesses'),findsOneWidget);
    await tester.ensureVisible(find.text('Browse local businesses'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Browse local businesses'));
    await tester.pumpAndSettle();
    expect(find.text('Local Businesses'),findsWidgets);
    expect(find.text('Browse all shops'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Approved Teyza shop opens even without priced products',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final shop=Shop.fromJson({'id':'approved-no-prices','name':'Verified Spaza',
      'area':'Durban','latitude':-29.8587,'longitude':31.0218,
      'identityVerified':true,'products':[],'productHighlights':[]});
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>[shop],
      directoryLoader:(area,type,radius)async=>[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    final card=find.byKey(const ValueKey('nearby-approved-no-prices'));
    await tester.ensureVisible(card);await tester.pumpAndSettle();
    await tester.tap(card);await tester.pumpAndSettle();
    expect(find.text('Verified Spaza'),findsWidgets);
    await tester.scrollUntilVisible(find.text('Products coming soon'),200,
      scrollable:find.byType(Scrollable).last);
    expect(find.text('Products coming soon'),findsOneWidget);
    expect(find.text('Ordering not available'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('Shop tab shows all published products and explains an empty catalogue',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    var shops=[Shop.fromJson({'id':'shop-1','name':'Corner Spaza','area':'Durban',
      'latitude':-29.8587,'longitude':31.0218,'identityVerified':true,
      'products':[{'id':'milk-1','name':'Fresh Milk 1L','priceCents':2500,'stock':3}]}),
      Shop.fromJson({'id':'shop-2','name':'Highway Shop','area':'Pinetown',
      'latitude':-29.8145,'longitude':30.8597,
      'products':[{'id':'soap-2','name':'Laundry Soap','priceCents':1600,'stock':7}]})];
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>shops,
      directoryLoader:(area,type,radius)async=>[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-shop')));await tester.pumpAndSettle();
    expect(find.text('Fresh Milk 1L'),findsOneWidget);
    expect(find.text('Laundry Soap'),findsOneWidget);
    expect(find.text('R25.00'),findsOneWidget);
    shops=[];
    final refresh=tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator).first).show();
    await tester.pumpAndSettle();await refresh;
    expect(find.byKey(const ValueKey('nav-shop')),findsOneWidget);
    expect(find.text('No matching products'),findsOneWidget);
    expect(find.text('Home'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('An essential opens its shop and its plus adds the real product to the cart',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final shop=Shop.fromJson({'id':'corner','name':'Corner Spaza','area':'Durban',
      'latitude':-29.8587,'longitude':31.0218,'pickupEnabled':true,
      'products':[{'id':'milk','name':'Fresh Milk 1L','priceCents':2500,'stock':3}]});
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>[shop],
      directoryLoader:(area,type,radius)async=>[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    final card=find.byKey(const ValueKey('essential-product-corner-milk'));
    await tester.scrollUntilVisible(card,200,scrollable:find.byType(Scrollable).first);
    await tester.tap(card);await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('change-shop')),findsOneWidget);
    expect(find.text('Corner Spaza'),findsWidgets);
    await tester.tap(find.byKey(const ValueKey('nav-home')));await tester.pumpAndSettle();
    final add=find.byKey(const ValueKey('add-essential-corner-milk'));
    await tester.ensureVisible(add);await tester.pumpAndSettle();
    await tester.tap(add);await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('floating-cart')),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('floating-cart')));await tester.pumpAndSettle();
    expect(find.text('Items from Corner Spaza'),findsOneWidget);
    expect(find.text('Fresh Milk 1L'),findsOneWidget);
    expect(find.text('Unit R25.00'),findsOneWidget);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Adding an item from another shop asks before replacing the basket',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final shops=[
      Shop.fromJson({'id':'one','name':'One Spaza','area':'Durban','pickupEnabled':true,
        'latitude':-29.8587,'longitude':31.0218,
        'products':[{'id':'bread','name':'Fresh Bread','priceCents':1800,'stock':4}]}),
      Shop.fromJson({'id':'two','name':'Two Spaza','area':'Durban','pickupEnabled':true,
        'latitude':-29.8588,'longitude':31.0218,
        'products':[{'id':'milk','name':'Fresh Milk','priceCents':2500,'stock':3}]})
    ];
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>shops,
      directoryLoader:(area,type,radius)async=>[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    final first=find.byKey(const ValueKey('add-essential-one-bread'));
    await tester.scrollUntilVisible(first,200,scrollable:find.byType(Scrollable).first);
    await tester.tap(first);await tester.pumpAndSettle();
    final second=find.byKey(const ValueKey('add-essential-two-milk'));
    await tester.ensureVisible(second);await tester.pumpAndSettle();
    await tester.tap(second);await tester.pumpAndSettle();
    expect(find.text('Start a new basket?'),findsOneWidget);
    await tester.tap(find.text('Keep basket'));await tester.pumpAndSettle();
    expect(find.text('One Spaza'),findsWidgets);
    await tester.tap(second);await tester.pumpAndSettle();
    await tester.tap(find.text('Start new basket'));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('floating-cart')));await tester.pumpAndSettle();
    expect(find.text('Items from Two Spaza'),findsOneWidget);
    expect(find.text('Fresh Milk'),findsOneWidget);
    expect(find.text('Fresh Bread'),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('A category without a real product searches rather than inventing cart stock',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>[],
      directoryLoader:(area,type,radius)async=>[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    final add=find.byKey(const ValueKey('find-essential-milk'));
    await tester.scrollUntilVisible(add,200,scrollable:find.byType(Scrollable).first);
    await tester.tap(add);await tester.pumpAndSettle();
    expect(find.text('No matching products'),findsOneWidget);
    expect(find.byKey(const ValueKey('floating-cart')),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  test('Approved nearby shop with matching city stays discoverable without map coordinates',(){
    final merchant=Shop.fromJson({'id':'approved-shop','name':'Approved Teyza Shop',
      'area':'Main Road','city':'Durban','identityVerified':true});
    expect(shopMatchesArea(merchant,areas.first),true);
    expect(mergeNearbyListings([merchant],[],area:areas.first).single.merchant?.id,'approved-shop');
  });
  testWidgets('Buy selects only that seller products and Change shop switches catalogues',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final shops=[
      Shop.fromJson({'id':'s1','name':'One Spaza','area':'Durban','identityVerified':true,
        'products':[{'id':'a','name':'Bread Buns','priceCents':1200,'stock':4}]}),
      Shop.fromJson({'id':'s2','name':'Second Spaza','area':'Durban','identityVerified':true,
        'products':[{'id':'b','name':'Fresh Eggs','priceCents':3000,'stock':4}]}),
    ];
    await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
      enableBackgroundServices:false,catalogueLoader:()async=>shops,
      directoryLoader:(area,type,radius)async=>[])));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-shop')));await tester.pumpAndSettle();
    final firstBuy=find.widgetWithText(FilledButton,'Buy').first;
    await tester.tap(firstBuy);await tester.pumpAndSettle();
    expect(find.text('Change shop'),findsOneWidget);
    for(var n=0;n<8&&find.text('Bread Buns').evaluate().isEmpty;n++){
      await tester.drag(find.byType(ListView).first,const Offset(0,-220));
      await tester.pumpAndSettle();
    }
    expect(find.text('Bread Buns'),findsOneWidget);
    expect(find.text('Fresh Eggs'),findsNothing);
    await tester.tap(find.text('Change shop'));await tester.pumpAndSettle();
    await tester.tap(find.text('Second Spaza').last);await tester.pumpAndSettle();
    for(var n=0;n<8&&find.text('Fresh Eggs').evaluate().isEmpty;n++){
      await tester.drag(find.byType(ListView).first,const Offset(0,-220));
      await tester.pumpAndSettle();
    }
    expect(find.text('Fresh Eggs'),findsOneWidget);
    expect(find.text('Bread Buns'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

}
