import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:teyza_shopper/shopper_splash.dart';

void main() {
  testWidgets('shows branded preloader while nearby shops and images warm up',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(home:ShopperLaunchScreen()));
    // TEYZA is now vector artwork, not a plain text widget.
    expect(find.byType(SvgPicture), findsNWidgets(2));
    expect(find.text('Getting your local shops ready…'),findsOneWidget);
    expect(find.text('YOUR NEIGHBOURHOOD, YOUR MARKET'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
