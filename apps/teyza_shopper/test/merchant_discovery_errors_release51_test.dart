import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_home.dart';

void main(){
  testWidgets('A failed public directory shows a retry instead of claiming no shops exist',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(420,980));
      addTearDown(()=>tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(MaterialApp(home:ShopperHome(
        initialArea:areas.first, enableBackgroundServices:false,
        catalogueLoader:()async=>throw StateError('Public directory unavailable'),
        directoryLoader:(area,category,radius)async=>
          throw StateError('Places discovery unavailable')
      )));
      await tester.pump();
      await tester.pump(const Duration(milliseconds:600));
      await tester.pumpAndSettle();
      final home=find.byKey(const PageStorageKey<String>('shopper-home'));
      expect(home,findsOneWidget);
      expect(find.byKey(const ValueKey('teyza-approved-merchant-load-error')),
        findsOneWidget);
      expect(find.byKey(const ValueKey('teyza-places-load-error')),
        findsOneWidget);
      expect(find.byKey(const ValueKey('teyza-businesses-load-error')),
        findsOneWidget);
      expect(find.text('Approved Teyza shops could not load'),findsOneWidget);
      expect(find.text('Nearby public shops could not load'),findsOneWidget);
      expect(find.text('Nearby businesses could not load'),findsOneWidget);
      expect(tester.takeException(),isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
}
