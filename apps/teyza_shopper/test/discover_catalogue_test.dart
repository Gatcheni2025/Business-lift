import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/discover_catalogue.dart';
import 'package:teyza_shopper/product_catalogue.dart';
import 'package:teyza_shopper/shopper_discovery.dart';
import 'package:teyza_shopper/shopper_home.dart';

const bread = CatalogueProduct(id: 'guide-bread', name: 'White bread · 700 g',
  category: 'Bakery', unit: '700 g', photo: 'white-bread', keywords: 'loaf sliced');
const milk = CatalogueProduct(id: 'guide-milk', name: 'Full cream milk · 1 L',
  category: 'Dairy & Eggs', unit: '1 L', photo: 'milk', keywords: 'fresh dairy');

void main() {
  testWidgets('Discover starts with photographic categories and opens a reference product guide', (t) async {
    CatalogueProduct? enquiry;
    final key = GlobalKey<DiscoverCataloguePageState>();
    await t.pumpWidget(MaterialApp(home: Scaffold(body: DiscoverCataloguePage(
      key: key, loader: () async => [bread, milk], onEnquire: (p) => enquiry = p))));
    await t.pumpAndSettle();
    expect(find.byKey(const PageStorageKey('discover-categories')), findsOneWidget);
    expect(find.text('Nearby shops'), findsNothing);
    expect(find.text(bread.name), findsNothing);
    await t.tap(find.byKey(const ValueKey('discover-category-Bakery')));
    await t.pumpAndSettle();
    expect(find.text(bread.name), findsOneWidget);
    expect(find.text(milk.name), findsNothing);
    expect(find.textContaining('Ask a shop to confirm availability'), findsOneWidget);
    expect(find.text('Buy'), findsNothing);
    expect(enquiry, isNull);
    await t.tap(find.byKey(const ValueKey('discover-product-guide-bread')));
    expect(enquiry, same(bread));
    expect(key.currentState!.backToCategories(), true);
    await t.pumpAndSettle();
    expect(find.byKey(const PageStorageKey('discover-categories')), findsOneWidget);
    expect(key.currentState!.backToCategories(), false);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Search finds guide products by their keywords and clearing returns to categories', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: DiscoverCataloguePage(
      loader: () async => [bread, milk], onEnquire: (_) {}))));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('discover-search')), 'fresh dairy');
    await t.pumpAndSettle();
    expect(find.text(milk.name), findsOneWidget);
    expect(find.text(bread.name), findsNothing);
    await t.tap(find.byTooltip('Clear search'));
    await t.pumpAndSettle();
    expect(find.byKey(const PageStorageKey('discover-categories')), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('discover-search')), 'missing product');
    await t.pumpAndSettle();
    expect(find.textContaining('No guide products match'), findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Catalogue loading failures offer retry without claiming shops have no stock', (t) async {
    var reads = 0;
    await t.pumpWidget(MaterialApp(home: Scaffold(body: DiscoverCataloguePage(
      loader: () async { if (reads++ == 0) throw StateError('Asset unavailable'); return [bread]; },
      onEnquire: (_) {}))));
    await t.pumpAndSettle();
    expect(find.text('Try again'), findsOneWidget);
    await t.tap(find.text('Try again'));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('discover-category-Bakery')), findsOneWidget);
    expect(reads, 2);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Long categories remain usable on a narrow screen with large text', (t) async {
    await t.binding.setSurfaceSize(const Size(320, 740));
    addTearDown(() => t.binding.setSurfaceSize(null));
    const tea = CatalogueProduct(id: 'tea', name: 'Black tea · 20 bags',
      category: 'Tea & Coffee', unit: '20 bags', photo: 'tea');
    await t.pumpWidget(MaterialApp(home: MediaQuery(
      data: const MediaQueryData(size: Size(320, 740), textScaler: TextScaler.linear(1.8)),
      child: Scaffold(body: DiscoverCataloguePage(loader: () async => [tea], onEnquire: (_) {})))));
    await t.pumpAndSettle();
    expect(find.text('Coffee, Tea & Hot Drinks'), findsOneWidget);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Discover replaces the duplicate shop directory and prepares a product enquiry to a Google-listed shop', (t) async {
    await t.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => t.binding.setSurfaceSize(null));
    Uri? launched;
    final place = OnlineShop.fromJson({'id': 'google-test', 'name': 'Community Spaza',
      'placeId': 'place-1', 'origin': 'google_places', 'shopCategory': 'spaza',
      'categorizationVerified': true, 'phone': '+27712345678',
      'latitude': areas.first.lat, 'longitude': areas.first.lng});
    await t.pumpWidget(MaterialApp(home: ShopperHome(initialArea: areas.first,
      enableBackgroundServices: false, catalogueLoader: () async => [],
      directoryLoader: (_, type, __) async => type == 'spaza' ? [place] : [],
      externalLauncher: (uri) async { launched = uri; return true; })));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('nav-shops')), findsNothing);
    await t.tap(find.byKey(const ValueKey('nav-discover')));
    await t.pumpAndSettle();
    expect(find.byKey(const PageStorageKey('discover-categories')), findsOneWidget);
    expect(find.text('Nearby shops'), findsNothing);
    await t.tap(find.byKey(const ValueKey('discover-category-Bakery')));
    await t.pumpAndSettle();
    final firstBread = (await ProductCatalogue.load()).firstWhere((p) => p.category == 'Bakery');
    final product = find.byKey(ValueKey('discover-product-${firstBread.id}'));
    await t.ensureVisible(product);
    await t.tap(product);
    await t.pumpAndSettle();
    expect(find.text('Google Maps · enquire about availability'), findsOneWidget);
    expect(launched, isNull);
    await t.tap(find.byKey(const ValueKey('discover-enquiry-google-test')));
    await t.pumpAndSettle();
    expect(launched?.host, 'wa.me');
    expect(launched?.path, '/27712345678');
    expect(launched?.queryParameters['text'], contains(firstBread.name));
    expect(launched?.queryParameters['text'], contains('confirm the brand, pack size and price'));
    await t.tap(find.byKey(const ValueKey('teyza-back')));
    await t.pumpAndSettle();
    expect(find.byKey(const PageStorageKey('discover-categories')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('nav-home')));
    await t.pumpAndSettle();
    expect(find.byKey(const PageStorageKey<String>('shopper-home')), findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());
  });
}
