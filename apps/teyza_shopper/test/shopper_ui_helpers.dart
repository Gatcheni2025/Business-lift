import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Scroll the actual home feed, including its lazily built horizontal shelves,
/// until the requested control can receive a tap above the bottom navigation.
Future<void> revealShopperHome(WidgetTester tester,Finder target) async {
  final home=find.byKey(const PageStorageKey<String>('shopper-home'));
  final scroll=find.descendant(of:home,matching:find.byType(Scrollable)).first;
  for(var i=0;i<20&&target.hitTestable().evaluate().isEmpty;i++){
    await tester.drag(scroll,const Offset(0,-150));
    await tester.pumpAndSettle();
  }
  expect(target.hitTestable(),findsOneWidget,reason:'The home control must be reachable');
}
