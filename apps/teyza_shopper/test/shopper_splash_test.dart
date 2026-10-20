import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_splash.dart';

void main() {
  testWidgets('shows branded preloader while nearby shops and images warm up',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home:ShopperLaunchScreen()));
    expect(find.text('TEYZA'),findsOneWidget);
    expect(find.text('Getting your local shops ready…'),findsOneWidget);
    expect(find.byIcon(Icons.storefront_rounded),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
