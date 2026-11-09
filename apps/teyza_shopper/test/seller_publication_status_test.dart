import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_selling.dart';

Widget dashboard({required int publicCount}) => MaterialApp(
  home: Scaffold(
    body: SellerSellingDashboard(
      shopName: 'Test Spaza',
      live: true,
      verified: true,
      publicationStatus: 'active',
      productCount: 16,
      publicProductCount: publicCount,
      onAdd: () {},
      onProducts: () {},
      onOrders: () {},
      onChat: () {},
      onFinance: () {},
      onAreas: () {},
      onBusiness: () {},
      onVerify: () {},
    ),
  ),
);

void main() {
  testWidgets('A live shop with private drafts and zero published products warns its owner', (tester) async {
    await tester.pumpWidget(dashboard(publicCount: 0));
    expect(find.byKey(const ValueKey('seller-public-product-count')), findsOneWidget);
    expect(find.byKey(const ValueKey('seller-stock-not-published')), findsOneWidget);
    expect(find.text('Shop is live'), findsOneWidget);
  });

  testWidgets('A shop with sixteen published products shows the count without the warning', (tester) async {
    await tester.pumpWidget(dashboard(publicCount: 16));
    expect(find.text('16 products in your public-shop record'), findsOneWidget);
    expect(find.byKey(const ValueKey('seller-stock-not-published')), findsNothing);
  });
}
