import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:teyza_shopper/shopper_account.dart';
import 'package:teyza_shopper/shopper_delivery_profile.dart';
import 'package:teyza_shopper/shopper_design.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/shopper_payment_preference.dart';
import 'package:teyza_shopper/shopper_splash.dart';
import 'session_test.dart' show MemoryStore;
import 'shopper_launch_journey_test.dart' show JourneySession;

// Deliberately fictional merchants/profile; photos are Teyza's bundled catalogue
// assets. These fixtures are never compiled into the app or shown as live data.
Shop previewShop(String id, String name, String category) => Shop.fromJson({
      'id': id,
      'name': name,
      'area': 'KwaMashu',
      'city': 'Durban',
      'shopCategory': category,
      'latitude': -29.8587,
      'longitude': 31.0218,
      'pickupEnabled': true,
      'deliveryEnabled': true,
      'identityVerified': true,
      'products': [
        {
          'id': 'bread',
          'name': 'Fresh bread',
          'category': 'Bakery',
          'imageUrl': 'catalogue:white-bread',
          'priceCents': 1800,
          'stock': 15
        },
        {
          'id': 'milk',
          'name': 'Fresh milk',
          'category': 'Dairy & Eggs',
          'imageUrl': 'catalogue:milk',
          'priceCents': 2200,
          'stock': 8
        },
        {
          'id': 'eggs',
          'name': 'Eggs',
          'category': 'Dairy & Eggs',
          'imageUrl': 'catalogue:eggs',
          'priceCents': 3200,
          'stock': 12
        }
      ],
    });
const previewProfile = ShopperDeliveryProfile(
    address: '12 Example Road, KwaMashu, Durban',
    area: 'KwaMashu',
    city: 'Durban',
    displayName: 'Nomsa M.',
    email: 'nomsa@example.test',
    phone: '082 000 1234',
    latitude: -29.8587,
    longitude: 31.0218);

Future<void> captureShopper(
    WidgetTester tester, GlobalKey key, String name) async {
  if (Platform.environment['TEYZA_CAPTURE_UI'] != '1') return;
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject() as RenderRepaintBoundary;
    final img = await boundary.toImage(pixelRatio: 2);
    final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
    final file = File('build/ui-preview/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes!.buffer.asUint8List());
    img.dispose();
  });
}

void main() {
  testWidgets(
      'Shopper home account and startup previews are responsive and use honest states',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    if (Platform.environment['TEYZA_CAPTURE_UI'] == '1') {
      await (FontLoader('PT Sans')
            ..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
            ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf')))
          .load();
      await (FontLoader('MaterialIcons')
            ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
          .load();
      await tester.pumpAndSettle();
    }
    final guest = JourneySession(),
        shopper = JourneySession()..authenticate('preview-shopper');
    shopper.name = 'Nomsa M.';
    shopper.email = 'nomsa@example.test';
    final profiles = ShopperDeliveryProfileStore(vault: MemoryStore());
    final payments = ShopperPaymentPreferenceStore(vault: MemoryStore());
    await profiles.save(shopper.userId!, previewProfile);
    final shops = [
      previewShop('preview-grocer', 'Neighbourhood Grocer', 'spaza'),
      previewShop('preview-corner', 'Fresh Corner Market', 'spaza'),
      previewShop('preview-studio', 'The Local Studio', 'retail')
    ];
    Widget home({bool offline = false}) => ShopperHome(
        key: UniqueKey(),
        session: guest,
        initialArea: areas.first,
        enableBackgroundServices: false,
        shopperProfileStore: profiles,
        catalogueLoader: () async {
          if (offline) throw StateError('Offline fixture');
          return shops;
        },
        directoryLoader: (_, __, ___) async => []);
    Widget account() => Scaffold(
        appBar: AppBar(title: const Text('Account')),
        body: ShopperAccountPanel(
            session: shopper,
            savedProfile: previewProfile,
            deliveryStore: profiles,
            paymentStore: payments,
            onBrowse: () {},
            onOrders: () {},
            onMessages: () {},
            onChangeDeliveryAddress: () {}));
    Future<GlobalKey> render(Widget screen,
        {double width = 390, double scale = 1}) async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      await tester.binding.setSurfaceSize(Size(width, 844));
      final key = GlobalKey();
      await tester.pumpWidget(MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: TeyzaDesign.theme(),
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                  disableAnimations: true,
                  textScaler: TextScaler.linear(scale)),
              child: child!),
          home: RepaintBoundary(key: key, child: screen)));
      await tester.pumpAndSettle();
      if (Platform.environment['TEYZA_CAPTURE_UI'] == '1') {
        await tester.runAsync(() async => precacheImage(
            const AssetImage('assets/catalogue/fresh-pantry.png'),
            key.currentContext!));
        await tester.pumpAndSettle();
      }
      expect(tester.takeException(), isNull);
      return key;
    }

    var key = await render(home());
    await captureShopper(tester, key, 'shopper-home-modern-390');
    final products = find.text('Shop by category');
    await tester.scrollUntilVisible(products, 240,
        scrollable: find
            .descendant(
                of: find.byKey(const PageStorageKey<String>('shopper-home')),
                matching: find.byType(Scrollable))
            .first);
    await tester.pumpAndSettle();
    await captureShopper(tester, key, 'shopper-home-categories-390');
    expect(tester.takeException(), isNull);
    key = await render(account());
    await captureShopper(tester, key, 'shopper-account-modern-390');
    key = await render(const ShopperLaunchScreen());
    await captureShopper(tester, key, 'shopper-launch-modern-390');
    expect(tester.binding.hasScheduledFrame, isFalse,
        reason: 'Static startup has no repeating pulse');
    key = await render(home(offline: true));
    await captureShopper(tester, key, 'shopper-home-offline-390');
    expect(
        find.text('Live shops are temporarily unavailable.'), findsOneWidget);
    key = await render(account(), width: 320, scale: 1.8);
    await captureShopper(tester, key, 'shopper-account-modern-320-large-text');
    final scroll = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('Privacy & security'), 250,
        scrollable: scroll);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    key = await render(const ShopperLaunchScreen(), width: 320, scale: 1.8);
    await captureShopper(tester, key, 'shopper-launch-modern-320-large-text');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    guest.dispose();
    shopper.dispose();
  });
}
