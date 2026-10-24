import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/product_catalogue.dart';
import 'package:teyza_shopper/seller_product_picker.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class CatalogueOwner extends ShopperSession {
  CatalogueOwner(){isReady=true;emailVerified=true;userId='owner1';idToken='owner-token';}
  @override Future<String> freshIdToken() async=>'owner-token';
}
void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  test('The full offline catalogue has distinct products, valid photos and searchable pack sizes',() async{
    final rows=await ProductCatalogue.load();
    expect(rows,hasLength(184));expect(rows.map((p)=>p.id).toSet(),hasLength(184));
    expect(rows.map((p)=>p.photo).toSet(),hasLength(48));
    expect(rows.where((p)=>p.matches('pap','Pantry')),isNotEmpty);
    final source=jsonDecode(await rootBundle.loadString('assets/catalogue/product-catalogue.json')) as Map;
    expect((source['photos'] as Map).keys.toList(),cataloguePhotoKeys);
    expect(cataloguePhotoKey(catalogueImageUrl('milk')),'milk');
    expect(cataloguePhotoKey('https://untrusted.test/x?cataloguePhoto=milk'),isNull);
  });
  test('Discovery keeps seller identity when shops sell the same template and never invents unselected items',(){
    final a=Shop.fromJson({'id':'a','name':'Shop A','productHighlights':[
      {'id':'catalog_milk-2-l','name':'Milk · 2 L','inStock':true,'imageUrl':catalogueImageUrl('milk')}], 'products':[]});
    final b=Shop.fromJson({'id':'b','name':'Shop B','products':[
      {'id':'catalog_milk-2-l','name':'Milk · 2 L','stock':4,'priceCents':3200},
      {'id':'sold-out','name':'Bread','stock':0,'priceCents':1800}]});
    final rows=discoverShopProducts([a,b]);
    expect(rows,hasLength(2));expect(rows.map((p)=>p.shop.id),['a','b']);
    expect(rows.first.product.priceCents,0);expect(rows.last.product.priceCents,3200);
    expect(a.rangeProducts.any((p)=>p.name.contains('Rice')),false);
    expect(b.rangeProducts.last.inStock,false);
  });
  testWidgets('Seller selects a real product and must enter price and stock before saving',(tester) async{
    await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
    final session=CatalogueOwner();var calls=0;Map<String,dynamic>? saved;
    final client=MockClient((request) async{
      calls++;expect(request.headers['Authorization'],'Bearer owner-token');
      final payload=jsonDecode(request.body) as Map;
      expect(payload['action'],'catalogue_add');
      final row=(payload['data']['products'] as List).single as Map;
      expect(row['templateId'],'white-bread-700-g');expect(row['priceCents'],1899);expect(row['stockQty'],5);
      expect(payload['data']['ownerUid'],isNull);
      return http.Response(jsonEncode({'ok':true,'publication':'live','addedIds':['catalog_white-bread-700-g']}),200);
    });
    await tester.pumpWidget(MaterialApp(home:Builder(builder:(context)=>Scaffold(body:FilledButton(
      onPressed:() async{saved=await Navigator.push<Map<String,dynamic>>(context,MaterialPageRoute(builder:(_)=>SellerProductPickerPage(
        session:session,existingIds:{},api:TeyzaMobileApi(session,client:client))));},child:const Text('Open products'))))));
    await tester.tap(find.text('Open products'));await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first,'White bread');await tester.pumpAndSettle();
    await tester.tap(find.text('White bread · 700 g'));await tester.pumpAndSettle();
    await tester.tap(find.text('Review 1 selected'));await tester.pumpAndSettle();
    await tester.tap(find.text('Add 1 to my shop'));await tester.pumpAndSettle();expect(calls,0);
    await tester.enterText(find.byType(TextField).at(0),'18.99');await tester.enterText(find.byType(TextField).at(1),'5');
    await tester.tap(find.text('Add 1 to my shop'));await tester.pumpAndSettle();
    expect(calls,1);expect(saved?['publication'],'live');expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();client.close();
  });
  testWidgets('Already selected shop products cannot be added twice',(tester) async{
    final session=CatalogueOwner();
    await tester.pumpWidget(MaterialApp(home:SellerProductPickerPage(session:session,existingIds:{'catalog_white-bread-700-g'})));
    await tester.pumpAndSettle();await tester.enterText(find.byType(TextField).first,'White bread');await tester.pumpAndSettle();
    await tester.tap(find.text('White bread · 700 g'));await tester.pumpAndSettle();
    expect(find.text('Review 0 selected'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('Picker remains usable on a narrow display with larger text',(tester) async{
    await tester.binding.setSurfaceSize(const Size(320,700));addTearDown(()=>tester.binding.setSurfaceSize(null));
    final session=CatalogueOwner();
    await tester.pumpWidget(MaterialApp(home:MediaQuery(data:const MediaQueryData(size:Size(320,700),textScaler:TextScaler.linear(1.5)),
      child:SellerProductPickerPage(session:session,existingIds:{}))));
    await tester.pumpAndSettle();await tester.enterText(find.byType(TextField).first,'Milk');await tester.pumpAndSettle();
    expect(find.text('Full cream milk · 500 ml'),findsOneWidget);expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('Photographic catalogue and shop-specific shopper range render for review',(tester) async{
    await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
    await (FontLoader('PT Sans')..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf'))).load();
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final session=CatalogueOwner(),boundary=GlobalKey();
    ThemeData theme()=>ThemeData(useMaterial3:true,fontFamily:'PT Sans',colorScheme:ColorScheme.fromSeed(seedColor:green));
    Future<void> capture(String name) async{
      if(Platform.environment['TEYZA_CAPTURE_UI']!='1')return;
      await tester.runAsync(() async{
        final render=boundary.currentContext!.findRenderObject() as RenderRepaintBoundary;
        final picture=await render.toImage(pixelRatio:2),bytes=await picture.toByteData(format:ui.ImageByteFormat.png);
        final file=File('build/ui-preview/$name.png');await file.parent.create(recursive:true);
        await file.writeAsBytes(bytes!.buffer.asUint8List());picture.dispose();
      });
    }
    await tester.pumpWidget(MaterialApp(theme:theme(),home:RepaintBoundary(key:boundary,
      child:SellerProductPickerPage(session:session,existingIds:{}))));await tester.pumpAndSettle();
    await tester.runAsync(()=>precacheImage(const AssetImage('assets/catalogue/fresh-pantry.png'),tester.element(find.byType(SellerProductPickerPage))));
    await tester.pumpAndSettle();expect(tester.takeException(),isNull);await capture('seller-product-catalogue');
    final products=(await ProductCatalogue.load()).where((p)=>['white-bread-700-g','milk-2-l','rice-1-kg','eggs-6-pack'].contains(p.id)).toList();
    final shop=Shop.fromJson({'id':'photo-shop','name':'KwaMashu Fresh Market','area':'Durban','latitude':-29.8587,'longitude':31.0218,
      'productHighlights':products.map((p)=>{'id':p.draftId,'name':p.name,'category':p.category,'inStock':true,'imageUrl':catalogueImageUrl(p.photo)}).toList()});
    await tester.pumpWidget(MaterialApp(theme:theme(),home:RepaintBoundary(key:boundary,child:ShopperHome(
      initialArea:areas.first,enableBackgroundServices:false,catalogueLoader:() async=>[shop],directoryLoader:(a,t,r) async=>[]))));
    await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
    final card=find.byKey(const ValueKey('nearby-photo-shop'));
    await tester.scrollUntilVisible(card,180,scrollable:find.byType(Scrollable).first);await tester.tap(card);await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first,const Offset(0,-400));await tester.pumpAndSettle();
    expect(find.text('White bread · 700 g'),findsOneWidget);expect(find.text('R0.00'),findsNothing);
    expect(tester.takeException(),isNull);await capture('shopper-selected-range');
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
}
