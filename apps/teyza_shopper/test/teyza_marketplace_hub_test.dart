import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/teyza_marketplace_hub.dart';

void main() {
  testWidgets('Teyza marketplace presents Shops and Businesses as the two main destinations',
      (tester) async {
    final selected=<String>[];
    await tester.pumpWidget(MaterialApp(home:Scaffold(
      body:SingleChildScrollView(child:TeyzaMarketplaceHub(
        onDestination:selected.add)))));
    expect(find.text('Shops'),findsOneWidget);
    expect(find.text('Businesses'),findsOneWidget);
    expect(find.byKey(const ValueKey('teyza-hub-wholesale')),findsNothing);
    expect(find.byKey(const ValueKey('teyza-hub-products')),findsNothing);
    await tester.tap(find.byKey(const ValueKey('teyza-hub-spaza')));
    expect(selected.single,'spaza');
    await tester.tap(find.byKey(const ValueKey('teyza-hub-businesses')));
    expect(selected.last,'businesses');

  });

  testWidgets('Every product category opens its named catalogue filter',
      (tester) async {
    String? chosen;
    await tester.pumpWidget(MaterialApp(home:Scaffold(
      body:SingleChildScrollView(child:TeyzaHomeProductCategories(
        onSelect:(s)=>chosen=s)))));
    expect(TeyzaHomeProductCategories.categories.length,8);
    expect(find.text('Fruit & Veg'),findsOneWidget);
    expect(find.text('Household'),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('product-category-Household')));
    expect(chosen,'Household');
    await tester.tap(find.byKey(const ValueKey('product-category-Fruit & Veg')));
    expect(chosen,'Fruit & Veg');
  });

  testWidgets('Teyza category grid remains readable on compact screens',
      (tester) async {
    tester.view.physicalSize=const Size(360,740);
    tester.view.devicePixelRatio=1.0;
    addTearDown((){
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(MaterialApp(home:Scaffold(
      body:SingleChildScrollView(child:Column(children:[
        TeyzaMarketplaceHub(onDestination:(_){ }),
        TeyzaHomeProductCategories(onSelect:(_){ })
      ])))));
    await tester.pumpAndSettle();
    expect(tester.takeException(),isNull);
    expect(find.byKey(const ValueKey('teyza-marketplace-hub')),findsOneWidget);
    expect(find.byKey(const ValueKey('teyza-product-category-grid')),findsOneWidget);
  });
}
