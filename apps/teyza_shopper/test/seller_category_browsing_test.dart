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

  testWidgets('Seller circles use real approved shops and filter by business type',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await start(tester,[seller('spaza1','Corner Shop','spaza'),
      seller('retail1','Local Salon','variety'),seller('bulk1','Bulk Depot','wholesale'),
      Shop.fromJson({'id':'unverified','name':'Pending Shop','area':'Durban',
        'latitude':-29.8587,'longitude':31.0218,'identityVerified':false})]);
    expect(find.byKey(const ValueKey('seller-story-spaza1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-bulk1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-unverified')),findsNothing);
    await tester.ensureVisible(find.byKey(const ValueKey('business-filter-spaza')));
    await tester.tap(find.byKey(const ValueKey('business-filter-spaza')));await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-story-spaza1')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-story-retail1')),findsNothing);
    await tester.tap(find.byKey(const ValueKey('business-filter-all')));await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('all-nearby-sellers')));await tester.pumpAndSettle();
    expect(find.text('All nearby sellers'),findsOneWidget);
    expect(find.text('Corner Shop'),findsWidgets);
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
}
