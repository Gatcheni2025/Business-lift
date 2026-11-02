import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_plan.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class _PlanApi extends TeyzaMobileApi {
  _PlanApi(super.session);
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> call(String action,
      [Map<String, dynamic> data = const {}]) async {
    calls.add(action);
    return {'ok': true, 'message': 'Plan preference saved'};
  }
}

void main() {
  testWidgets('7-day trial discloses duration, expiry and absence of bank mandate',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(420, 860));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final session = ShopperSession();
    final api = _PlanApi(session);
    await tester.pumpWidget(MaterialApp(
      home: SellerPlanPage(session: session, api: api),
    ));
    await tester.pumpAndSettle();

    for (final phrase in [
      'One trial per verified shop owner',
      'Approved shop appears in nearby results',
      'After seven days',
      'No automatic charge',
    ]) {
      await tester.scrollUntilVisible(
          find.textContaining(phrase), 200,
          scrollable: find.byType(Scrollable).first);
      expect(find.textContaining(phrase), findsOneWidget);
    }
    expect(api.calls, isEmpty,
        reason: 'Displaying plan benefits must not call billing or enrolment APIs');
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
  });
}
