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
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-bulk1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-unverified')),findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('business-filter-spaza')));
    await tester.tap(find.byKey(const ValueKey('business-filter-spaza')));await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-story-spaza1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsNothing);
    await tester.ensureVisible(find.byKey(const ValueKey('business-filter-all')));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('business-filter-all')));await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsOneWidget);
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

  testWidgets('Local business products display by their own categories below local businesses, never wholesale prices',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await start(tester,[
      seller('corner','Corner Spaza','spaza',products:[
        {'id':'bread','name':'White bread','category':'Bakery','priceCents':1800,'stock':3}]),
      seller('salon','Durban Salon','variety',products:[
        {'id':'hair','name':'Hair treatment','category':'Hair & Beauty','priceCents':6500,'stock':8},
        {'id':'cream','name':'Hair cream','category':'Hair & Beauty','priceCents':2000,'stock':4}]),
      seller('bulk','Wholesale Depot','wholesale',products:[
        {'id':'wholesale','name':'Private bulk price','category':'Wholesale','priceCents':9900,'stock':4}]),
    ]);
    final item=find.byKey(const ValueKey('essential-product-salon-hair'));
    final home=find.byKey(const PageStorageKey<String>('shopper-home'));
    for(var attempt=0;attempt<25&&item.evaluate().isEmpty;attempt++){
      await tester.drag(home,const Offset(0,-180));
      await tester.pumpAndSettle();
    }
    expect(item,findsOneWidget);
    expect(find.text('Hair & Beauty'),findsWidgets);
    expect(find.byKey(const ValueKey('essential-product-bulk-wholesale')),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('Shop filters products by the selected business type',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await start(tester,[
      seller('corner','Corner Shop','spaza',products:[
        {'id':'bread','name':'Shop bread','category':'Bakery','priceCents':1400,'stock':4}]),
      seller('salon','Local Salon','variety',products:[
        {'id':'soap','name':'Salon soap','category':'Personal Care','priceCents':2000,'stock':4}]),
    ]);
    await tester.tap(find.byKey(const ValueKey('nav-shop')));await tester.pumpAndSettle();
    final local=find.byKey(const ValueKey('business-filter-variety'));
    await tester.ensureVisible(local);await tester.pumpAndSettle();
    await tester.tap(local);await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('shop-product-salon-soap')),findsOneWidget);
    expect(find.byKey(const ValueKey('shop-product-corner-bread')),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
