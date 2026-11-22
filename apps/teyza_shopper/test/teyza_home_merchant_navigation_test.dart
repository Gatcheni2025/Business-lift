import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/teyza_merchant_grid.dart';
import 'package:teyza_shopper/shopper_home.dart';

Shop _shop(String id,String name,String type) =>Shop.fromJson({
  'id':id,'name':name,'shopCategory':type,
  'latitude':-29.8587,'longitude':31.0218,
  'identityVerified':true,'pickupEnabled':true,
});

Future<void> _start(WidgetTester tester)async{
  await tester.pumpWidget(MaterialApp(home:ShopperHome(
    initialArea:areas.first,
    enableBackgroundServices:false,
    catalogueLoader:()async=>[
      _shop('spaza-home','Spaza Corner','spaza'),
      _shop('salon-home','Neighbourhood Salon','variety'),
      _shop('bulk-home','Wholesaler Test','wholesale')
    ],
    directoryLoader:(area,type,radius)async=>[]
  )));
  await tester.pump();
  await tester.pump(const Duration(seconds:1));
  await tester.pumpAndSettle();
}

void main(){
  testWidgets('Spaza tiles and local business tiles occupy separate category grids',
    (tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await _start(tester);
    final spaza=find.byKey(const ValueKey('teyza-spaza-grid'));
    final business=find.byKey(const ValueKey('teyza-businesses-grid'));
    expect(spaza,findsOneWidget);
    expect(find.descendant(of:spaza,matching:find.text('Spaza Corner')),findsOneWidget);
    expect(find.descendant(of:spaza,matching:find.text('Neighbourhood Salon')),findsNothing);
    expect(find.descendant(of:spaza,matching:find.text('Wholesaler Test')),findsNothing);
    // The home feed builds lower sections lazily. Scroll to the second
    // independent grid, not to an assumed immediately-mounted element.
    final home=find.byKey(const PageStorageKey<String>('shopper-home'));
    for(var attempt=0;attempt<12&&business.evaluate().isEmpty;attempt++){
      await tester.drag(home,const Offset(0,-160));
      await tester.pumpAndSettle();
    }
    expect(business,findsOneWidget);
    expect(find.descendant(of:business,matching:find.text('Neighbourhood Salon')),findsOneWidget);
    expect(find.descendant(of:business,matching:find.text('Spaza Corner')),findsNothing);
    expect(find.descendant(of:business,matching:find.text('Wholesaler Test')),findsNothing);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Merchant detail back arrow restores home instead of leaving application',
    (tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await _start(tester);
    final tile=find.byKey(const ValueKey('nearby-spaza-home'));
    await tester.ensureVisible(tile);
    await tester.tap(tile);await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('teyza-back')),findsOneWidget);
    expect(find.byKey(const ValueKey('seller-profile-spaza-home')),findsOneWidget);
    expect(find.byKey(const ValueKey('change-shop')),findsNothing);
    expect(find.byKey(const ValueKey('nav-account')),findsNothing);
    expect(find.byKey(const PageStorageKey<String>('shopper-home')),findsNothing);
    await tester.tap(find.byKey(const ValueKey('teyza-back')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('teyza-spaza-grid')),findsOneWidget);
    expect(find.byKey(const ValueKey('teyza-back')),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Account role choice consumes Back before leaving Account',
    (tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await _start(tester);
    await tester.tap(find.byKey(const ValueKey('nav-account')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue as Business Owner'));
    await tester.pumpAndSettle();
    expect(find.text('Business owner sign in'),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('teyza-back')));
    await tester.pumpAndSettle();
    expect(find.text('Continue as Business Owner'),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('teyza-back')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('teyza-spaza-grid')),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Community shop shelf swipes left and right without View all redirect',
    (tester)async{
    var opened=0,all=0;
    final items=List.generate(10,(i)=>TeyzaMerchantGridItem(
      id:'shop$i',name:'Neighbourhood merchant $i',
      subtitle:'Verified local shop',
      image:const Icon(Icons.storefront_rounded),
      onTap:()=>opened++));
    await tester.binding.setSurfaceSize(const Size(340,740));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:
      SingleChildScrollView(child:TeyzaMerchantGrid(
        categoryKey:'spaza',merchants:items,
        onViewAll:()=>all++,emptyLabel:'No shops')))));
    expect(find.byKey(const ValueKey('teyza-spaza-grid')),findsOneWidget);
    expect(find.byKey(const ValueKey('teyza-spaza-horizontal-shelf')),findsOneWidget);
    expect(find.byKey(const ValueKey('teyza-spaza-view-all')),findsNothing);
    final rail=find.byKey(const ValueKey('teyza-spaza-horizontal-shelf'));
    await tester.drag(rail,const Offset(-700,0));await tester.pumpAndSettle();
    await tester.drag(rail,const Offset(-700,0));await tester.pumpAndSettle();
    await tester.drag(rail,const Offset(-700,0));await tester.pumpAndSettle();
    final last=find.byKey(const ValueKey('nearby-shop9'));
    expect(last,findsOneWidget);
    await tester.tap(last);await tester.pumpAndSettle();
    expect(opened,1);
    expect(all,0);
    expect(tester.takeException(),isNull);
  });
}
