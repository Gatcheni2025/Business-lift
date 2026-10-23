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
      bottomNavigationBar:PremiumShopperNavigation(selectedIndex:0,cartCount:2,onSelect:visited.add))));
    for(final label in ['Home','Shops','Cart','Orders','Account']){
      await tester.tap(find.text(label));
    }
    expect(visited,[0,1,2,3,4]);
    expect(find.text('Sell'),findsNothing);
    expect(tester.takeException(),isNull);
  });
  testWidgets('Navigation fits a narrow screen with larger text',(tester) async {
    await tester.binding.setSurfaceSize(const Size(320,700));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home:MediaQuery(
      data:const MediaQueryData(size:Size(320,700),textScaler:TextScaler.linear(1.5)),
      child:Scaffold(bottomNavigationBar:PremiumShopperNavigation(
        selectedIndex:4,cartCount:101,onSelect:(_){})))));
    expect(find.text('99+'),findsOneWidget);
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
    final merchant=Shop.fromJson({'id':'test-store','name':'Corner Grocer','area':'Durban',
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
    await tester.tap(find.text('Home'));await tester.pumpAndSettle();
    await tester.tap(find.text('Shops'));await tester.pumpAndSettle();
    await tester.tap(find.text('Cart'));await tester.pumpAndSettle();
    expect(find.text('Items from Corner Grocer'),findsOneWidget);
    expect(find.text('Fresh bread'),findsOneWidget);
    expect(find.text('Unit R18.00'),findsOneWidget);
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
    await tester.tap(find.text('Shops'));await tester.pumpAndSettle();
    expect(find.text('Search wider'),findsOneWidget);expect(tester.takeException(),isNull);
    await capture('shops');
    await tester.tap(find.text('Account'));await tester.pumpAndSettle();
    expect(find.text('Continue as Shopper'),findsOneWidget);
    expect(find.text('Continue as Shop Owner'),findsOneWidget);
    expect(tester.takeException(),isNull);await capture('login-roles');
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
