import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_home.dart';

Shop seller(String id,String name,String type,{List<Map<String,dynamic>> products=const []})=>Shop.fromJson({
  'id':id,'name':name,'area':'Durban','latitude':-29.8587,'longitude':31.0218,
  'shopCategory':type,'identityVerified':true,'pickupEnabled':true,'products':products,
});

Future<void> start(WidgetTester tester,List<Shop> shops) async {
  await tester.pumpWidget(MaterialApp(home:ShopperHome(initialArea:areas.first,
    enableBackgroundServices:false,catalogueLoader:() async=>shops,
    directoryLoader:(area,type,radius) async=>[])));
  await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
}

void main(){
  test('Sixteen approved spaza products appear within the saved delivery radius, never outside it',(){
    final shop=Shop.fromJson({'id':'testSpaza','name':'Neighbourhood Spaza',
      'shopCategory':'spaza','latitude':-29.7402,'longitude':30.992,
      'products':[for(var n=0;n<16;n++){'id':'stock$n','name':'Product $n',
        'category':'General Goods','priceCents':1000+n,'stock':5,'inStock':true}]});
    const nearby=Area('KwaMashu','Durban',-29.7405,30.993);
    const distant=Area('Johannesburg','Johannesburg',-26.2041,28.0473);
    expect(shopMatchesArea(shop,nearby,radiusKm:22),isTrue);
    expect(shopMatchesArea(shop,distant,radiusKm:22),isFalse);
    expect(discoverShopProducts([shop],type:'spaza',limit:18),hasLength(16));
    expect(shop.rangeProducts.every((p)=>p.priceCents>0&&p.inStock),isTrue);
  });
  test('Product categories keep older names searchable',(){
    expect(teyzaProductCategory('Fresh'),'Fruit & Veg');
    expect(teyzaProductCategory('Dairy'),'Dairy & Eggs');
    expect(teyzaProductCategory('Baby Care'),'Baby Care');
  });

  testWidgets('Seller circles distinguish Teyza-verified and publicly listed sellers by business type',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await start(tester,[seller('spaza1','Corner Shop','spaza'),
      seller('retail1','Local Salon','variety'),seller('bulk1','Bulk Depot','wholesale'),
      Shop.fromJson({'id':'unverified','name':'Pending Shop','area':'Durban',
        'latitude':-29.8587,'longitude':31.0218,'identityVerified':false})]);
    expect(find.byKey(const ValueKey('seller-story-spaza1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsNothing);
    expect(find.byKey(const ValueKey('seller-story-bulk1')),findsNothing);
    expect(find.byKey(const ValueKey('seller-story-unverified')),findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('business-filter-spaza')));
    await tester.tap(find.byKey(const ValueKey('business-filter-spaza')));await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-story-spaza1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsNothing);
    await tester.ensureVisible(find.byKey(const ValueKey('business-filter-all')));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('business-filter-all')));await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsNothing);
    await tester.ensureVisible(find.byKey(const ValueKey('business-filter-variety')));
    await tester.tap(find.byKey(const ValueKey('business-filter-variety')));await tester.pumpAndSettle();
    expect(find.text('Local Businesses'),findsWidgets);
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-spaza1')),findsNothing);
    await tester.tap(find.byKey(const ValueKey('all-nearby-sellers')));await tester.pumpAndSettle();
    expect(find.text('All nearby sellers'),findsOneWidget);
    expect(find.text('Corner Shop'),findsWidgets);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Spaza Shops and Everyday essentials categories appear in the shopper home',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await start(tester,[seller('shop1','Community Spaza','spaza',products:[
      {'id':'apples','name':'Fresh apples','category':'Fruit & Veg','priceCents':1400,'stock':4},
      {'id':'milk','name':'Fresh milk','category':'Dairy','priceCents':2000,'stock':4},
    ])]);
    expect(find.text('Spaza Shops'),findsOneWidget);
    final scroll=find.byType(ListView).first;
    for(var attempt=0;attempt<12&&find.text('Shop by category').evaluate().isEmpty;attempt++){
      await tester.drag(scroll,const Offset(0,-170));
      await tester.pumpAndSettle();
    }
    expect(find.text('Everyday essentials'),findsOneWidget);
    expect(find.text('Shop by category'),findsOneWidget);
    final fruit=find.byKey(const ValueKey('product-category-Fruit & Veg'));
    for(var attempt=0;attempt<10&&fruit.evaluate().isEmpty;attempt++){
      await tester.drag(scroll,const Offset(0,-110));
      await tester.pumpAndSettle();
    }
    expect(fruit,findsOneWidget);
    await tester.ensureVisible(fruit);await tester.pumpAndSettle();
    await tester.tap(fruit);await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('shop-product-shop1-apples')),findsOneWidget);
    expect(find.byKey(const ValueKey('shop-product-shop1-milk')),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Product category opens matching nearby products and seller profile',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await start(tester,[seller('shop1','Corner Market','spaza',products:[
      {'id':'apple','name':'Fresh apples','category':'Fruit & Veg','priceCents':1400,'stock':4},
      {'id':'milk','name':'Fresh milk','category':'Dairy','priceCents':2000,'stock':4},
    ])]);
    final fruit=find.byKey(const ValueKey('product-category-Fruit & Veg'));
    final scroll=find.byType(ListView).first;
    for(var attempt=0;attempt<12&&fruit.evaluate().isEmpty;attempt++){
      await tester.drag(scroll,const Offset(0,-170));
      await tester.pumpAndSettle();
    }
    expect(fruit,findsOneWidget);
    await tester.ensureVisible(fruit);await tester.pumpAndSettle();
    await tester.tap(fruit);await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('shop-product-shop1-apple')),findsOneWidget);
    expect(find.byKey(const ValueKey('shop-product-shop1-milk')),findsNothing);
    await tester.tap(find.byKey(const ValueKey('shop-product-shop1-apple')));await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-profile-shop1')),findsOneWidget);
    expect(find.text('Teyza Verified'),findsWidgets);
    expect(find.text('Followers'),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Local businesses appear separately without leaking services into grocery price cards',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await start(tester,[
      seller('corner','Corner Spaza','spaza',products:[
        {'id':'bread','name':'White bread','category':'Bakery','priceCents':1800,'stock':3}]),
      Shop.fromJson({'id':'salon','name':'Durban Salon','shopCategory':'retail',
        'latitude':-29.8587,'longitude':31.0218,'identityVerified':true,
        'serviceHighlights':[{'id':'hair','name':'Hair treatment','type':'Beauty & hair'}],
        'products':[{'id':'legacy','name':'Legacy salon product','priceCents':1000,'stock':3}]}),
      seller('bulk','Wholesale Depot','wholesale',products:[
        {'id':'wholesale','name':'Private bulk price','category':'Wholesale','priceCents':9900,'stock':4}]),
    ]);
    final home=find.byKey(const PageStorageKey<String>('shopper-home'));
    final local=find.text('Local Businesses');
    for(var n=0;n<18&&local.evaluate().isEmpty;n++){
      await tester.drag(home,const Offset(0,-180));await tester.pumpAndSettle();
    }
    expect(local,findsWidgets);
    expect(find.byKey(const ValueKey('essential-product-salon-legacy')),findsNothing);
    expect(find.byKey(const ValueKey('essential-product-bulk-wholesale')),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  test('Wholesaler rows always render only a listing even if a malformed public response includes supplier prices',(){
    final supplier=Shop.fromJson({'id':'bulk1','name':'Wholesale Outlet',
      'shopCategory':'wholesale','products':[{'id':'secret','name':'Private wholesale price',
        'category':'Wholesale','priceCents':110000,'stock':12}],
      'productHighlights':[{'id':'secret','name':'Secret supplier stock','inStock':true}]});
    expect(supplier.products,isEmpty);
    expect(supplier.rangeProducts,isEmpty);
    expect(discoverShopProducts([supplier],type:'wholesale'),isEmpty);
  });
  testWidgets('An approved local business shows service type and enquiry rather than grocery checkout',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await start(tester,[Shop.fromJson({'id':'salon','name':'Local Salon','shopCategory':'retail',
      'latitude':-29.8587,'longitude':31.0218,'identityVerified':true,
      'serviceHighlights':[{'id':'braid','name':'Braiding','type':'Beauty & hair',
        'description':'Hair styling'}],
      'products':[{'id':'cream','name':'Hair cream','priceCents':2500,'stock':3}]})]);
    await tester.ensureVisible(find.byKey(const ValueKey('business-filter-variety')));
    await tester.tap(find.byKey(const ValueKey('business-filter-variety')));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('seller-story-salon')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-profile-salon')),findsOneWidget);
    final profile=find.byKey(const PageStorageKey<String>('shop-profile-salon'));
    final service=find.text('Braiding');
    for(var n=0;n<14&&service.evaluate().isEmpty;n++){
      await tester.drag(profile,const Offset(0,-220));
      await tester.pumpAndSettle();
    }
    expect(service,findsWidgets);
    expect(find.text('R25.00'),findsNothing);
    expect(find.text('Hair cream'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  test('Shopper parsing keeps business service listings and spaza product baskets separate',(){
    final business=Shop.fromJson({'id':'salon','name':'Local Salon','shopCategory':'retail',
      'products':[{'id':'soap','name':'Salon soap','priceCents':2000,'stock':4}],
      'serviceHighlights':[{'id':'hair','name':'Styling','type':'Beauty & hair'}]});
    final spaza=Shop.fromJson({'id':'corner','name':'Corner Shop','shopCategory':'spaza',
      'products':[{'id':'bread','name':'Shop bread','priceCents':1400,'stock':4}]});
    expect(business.products,isEmpty);
    expect(business.serviceHighlights.single['name'],'Styling');
    expect(discoverShopProducts([business,spaza],type:'spaza'),hasLength(1));
    expect(discoverShopProducts([business,spaza],type:'spaza').single.shop.id,'corner');
  });

}
