import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:teyza_shopper/shopper_splash.dart';

void main() {
  testWidgets('Branded launch remains static when reduced motion is requested',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: MediaQuery(
            data: MediaQueryData(disableAnimations: true),
            child: ShopperLaunchScreen())));
    await tester.pumpAndSettle();
    expect(find.byType(SvgPicture), findsNWidgets(2));
    expect(find.text('Opening your neighbourhood…'), findsOneWidget);
    expect(find.text('Good things, close to home.'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.binding.hasScheduledFrame, isFalse,
        reason: 'Launch branding must not leave a repeating pulse or spinner');
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
