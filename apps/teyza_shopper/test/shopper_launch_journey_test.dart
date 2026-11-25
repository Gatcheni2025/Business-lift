import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:teyza_shopper/shopper_account.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_delivery_profile.dart';
import 'package:teyza_shopper/shopper_design.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/shopper_splash.dart';
import 'package:teyza_shopper/shop_orders.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'session_test.dart' show MemoryStore;

class JourneySession extends ShopperSession {
  JourneySession() : super(store: MemoryStore()) {
    isReady = true;
  }
  void authenticate(String uid, {bool anonymous = false}) {
    userId = uid;
    idToken = 'token-$uid';
    anonymousShopper = anonymous;
    isReady = true;
    isBusy = false;
    emailVerified = !anonymous;
    email = anonymous ? null : '$uid@example.test';
    name = 'Test shopper';
    notifyListeners();
  }

  @override
  Future<String> freshIdToken() async => idToken ?? '';
}

class JourneySellerRepo extends SellerFirestore {
  final SellerShop? result;
  final Future<SellerShop?>? pending;
  JourneySellerRepo(
      {required super.uid, required super.token, this.result, this.pending});
  @override
  Future<SellerShop?> shop() async => pending == null ? result : await pending;
}

class JourneyApi extends TeyzaMobileApi {
  JourneyApi(super.session);
  final calls = <String>[];
  @override
  Future<Map<String, dynamic>> call(String action,
      [Map<String, dynamic> data = const {}]) async {
    calls.add(action);
    if (action == 'shopper_profile_read')
      return {
        'profile': {'ownerUid': session.userId}
      };
    if (action == 'agent_profile') return {'profile': null};
    if (action == 'order_quote')
      return {
        'quote': {
          'quoteId': 'current-server-quote',
          'totalCents': 1800,
          'subtotalCents': 1800,
          'items': data['items'],
          'commerce': {
            'onlineOrdersReady': true,
            'onlinePaymentsReady': false,
            'shopperPaymentEligible': true
          }
        }
      };
    return {'ok': true, 'orders': [], 'notifications': [], 'threads': []};
  }
}

final journeyShop = Shop.fromJson({
  'id': 'journey-shop',
  'name': 'Test Neighbourhood Market',
  'shopCategory': 'spaza',
  'latitude': -29.8587,
  'longitude': 31.0218,
  'pickupEnabled': true,
  'identityVerified': true,
  'products': [
    {
      'id': 'bread',
      'name': 'Test Fresh Bread',
      'category': 'Bakery',
      'imageUrl': 'catalogue:bread',
      'priceCents': 1800,
      'stock': 12
    }
  ],
});
Future<void> startJourney(WidgetTester t, JourneySession session,
    {JourneyApi? api,
    List<Shop>? shops,
    Future<List<Shop>>? pendingCatalogue,
    Future<SellerShop?>? pendingAccount,
    SellerShop? seller,
    double width = 390,
    double textScale = 1}) async {
  SharedPreferences.setMockInitialValues({});
  await t.binding.setSurfaceSize(Size(width, 844));
  addTearDown(() => t.binding.setSurfaceSize(null));
  await t.pumpWidget(MaterialApp(
      theme: TeyzaDesign.theme(),
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
              disableAnimations: true,
              textScaler: TextScaler.linear(textScale)),
          child: child!),
      home: ShopperHome(
          session: session,
          enableBackgroundServices: false,
          initialArea: areas.first,
          shopperProfileStore:
              ShopperDeliveryProfileStore(vault: MemoryStore()),
          sellerMobileApi: api,
          sellerApiFactory: (uid, token) => JourneySellerRepo(
              uid: uid, token: token, result: seller, pending: pendingAccount),
          catalogueLoader: () async => pendingCatalogue == null
              ? (shops ?? [journeyShop])
              : await pendingCatalogue,
          directoryLoader: (_, __, ___) async => [])));
  await t.pump();
}

Future<void> addGuestBasket(WidgetTester t) async {
  await t.tap(find.byKey(const ValueKey('nav-shop')));
  await t.pumpAndSettle();
  final product = find.byKey(const ValueKey('shop-product-journey-shop-bread'));
  await t.ensureVisible(product);
  await t.tap(product);
  await t.pumpAndSettle();
  final add = find.byKey(const ValueKey('add-product-journey-shop-bread'));
  final profile =
      find.byKey(const PageStorageKey<String>('shop-profile-journey-shop'));
  await t.scrollUntilVisible(add, 220,
      scrollable: find
          .descendant(of: profile, matching: find.byType(Scrollable))
          .first);
  await t.ensureVisible(add);
  await t.pumpAndSettle();
  expect(t.widget<FilledButton>(add).onPressed, isNotNull,
      reason: 'A guest may add published stock before sign-in');
  await t.tap(add);
  await t.pumpAndSettle();
  await t.tap(find.byKey(const ValueKey('floating-cart')));
  await t.pumpAndSettle();
  expect(find.text('Your basket'), findsOneWidget);
  expect(find.text('Test Fresh Bread'), findsOneWidget);
}

Future<void> requestGuestCheckout(WidgetTester t) async {
  final checkout = find.byKey(const ValueKey('basket-checkout'));
  await t.ensureVisible(checkout);
  await t.tap(checkout);
  await t.pumpAndSettle();
  expect(find.text('Sign in to checkout'), findsOneWidget);
}

Future<void> finishJourney(WidgetTester t, JourneySession session) async {
  await t.pumpWidget(const SizedBox.shrink());
  await t.pumpAndSettle();
  session.dispose();
}

void main() {
  testWidgets(
      'Home paints before a stalled catalogue and remains navigable on timeout',
      (t) async {
    final session = JourneySession(), pending = Completer<List<Shop>>();
    await startJourney(t, session, pendingCatalogue: pending.future);
    await t.pump(const Duration(milliseconds: 50));
    expect(find.byType(ShopperLaunchScreen), findsNothing);
    expect(find.byKey(const PageStorageKey<String>('shopper-home')),
        findsOneWidget);
    expect(find.byKey(const ValueKey('nav-shop')), findsOneWidget);
    expect(find.byType(ShopperAccountPanel), findsNothing);
    expect(find.byType(ShopperDeliveryProfileSheet), findsNothing);
    await t.pump(const Duration(seconds: 16));
    expect(
        find.text('Live shops are temporarily unavailable.'), findsOneWidget);
    expect(find.text('Retry'), findsWidgets);
    await t.tap(find.byKey(const ValueKey('nav-shop')));
    await t.pump();
    expect(find.byType(ShopperAccountPanel), findsNothing);
    pending.complete([]);
    await finishJourney(t, session);
  });
  testWidgets(
      'Restored seller launches home while private account lookup is pending',
      (t) async {
    final session = JourneySession()
      ..authenticate('owner')
      ..useSellerWorkspace();
    final pending = Completer<SellerShop?>();
    await startJourney(t, session,
        api: JourneyApi(session), pendingAccount: pending.future);
    await t.pump(const Duration(milliseconds: 50));
    expect(session.sellerWorkspace, isFalse);
    expect(find.byKey(const ValueKey('nav-home')), findsOneWidget);
    expect(find.text('Loading your accounts…'), findsNothing);
    expect(find.text('Finish registration'), findsNothing);
    pending.complete(const SellerShop(
        'Test Salon', 'retail', 'Durban', 'approved', 'active'));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('nav-home')), findsOneWidget);
    expect(find.byKey(const ValueKey('teyza-mode-switch')), findsOneWidget);
    await finishJourney(t, session);
  });
  testWidgets(
      'Guest views shop and keeps basket after cancelling checkout sign-in',
      (t) async {
    final session = JourneySession();
    await startJourney(t, session);
    await t.pumpAndSettle();
    final shop = find.byKey(const ValueKey('nearby-journey-shop'));
    await t.scrollUntilVisible(shop, 180,
        scrollable: find
            .descendant(
                of: find.byKey(const PageStorageKey<String>('shopper-home')),
                matching: find.byType(Scrollable))
            .first);
    await t.pumpAndSettle();
    await t.ensureVisible(shop);
    await t.pumpAndSettle();
    await t.tap(shop);
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('seller-profile-journey-shop')),
        findsOneWidget);
    expect(session.userId, isNull);
    await t.tap(find.byKey(const ValueKey('teyza-back')));
    await t.pumpAndSettle();
    await addGuestBasket(t);
    expect(session.userId, isNull);
    await requestGuestCheckout(t);
    await t.tap(find.byKey(const ValueKey('teyza-back')));
    await t.pumpAndSettle();
    expect(find.text('Your basket'), findsOneWidget);
    expect(find.text('Test Fresh Bread'), findsOneWidget);
    expect(find.byType(ShopperCheckoutPage), findsNothing);
    await finishJourney(t, session);
  });
  for (final anonymous in [false, true]) {
    testWidgets(
        '${anonymous ? 'Anonymous UID upgrade' : 'Guest sign-in'} resumes checkout without basket loss or seller routing',
        (t) async {
      final session = JourneySession();
      if (anonymous) session.authenticate('guest-device', anonymous: true);
      final api = JourneyApi(session);
      await startJourney(t, session,
          api: api,
          seller: const SellerShop(
              'Same person’s shop', 'spaza', 'Durban', 'approved', 'active'));
      await t.pumpAndSettle();
      await addGuestBasket(t);
      await requestGuestCheckout(t);
      session.authenticate('signed-in-person');
      await t.pumpAndSettle();
      expect(find.byType(ShopperCheckoutPage), findsOneWidget);
      expect(
          t.widget<ShopperCheckoutPage>(find.byType(ShopperCheckoutPage)).items,
          [
            {
              'id': 'bread',
              'name': 'Test Fresh Bread',
              'quantity': 1,
              'priceCents': 1800
            }
          ]);
      expect(api.calls.where((c) => c == 'order_quote'), isNotEmpty);
      expect(api.calls.where((c) => c == 'order_request'), isEmpty);
      expect(session.sellerWorkspace, isFalse);
      expect(find.text('Select account'), findsNothing);
      await t.pageBack();
      await t.pumpAndSettle();
      expect(find.text('Your basket'), findsOneWidget);
      expect(find.text('Test Fresh Bread'), findsOneWidget);
      await finishJourney(t, session);
    });
  }
  testWidgets('Continue browsing cancels checkout intent and retains basket',
      (t) async {
    final session = JourneySession(), api = JourneyApi(JourneySession());
    await startJourney(t, session, api: api);
    await t.pumpAndSettle();
    await addGuestBasket(t);
    await requestGuestCheckout(t);
    await t.tap(find.byKey(const ValueKey('teyza-continue-browsing')));
    await t.pumpAndSettle();
    session.authenticate('new-shopper');
    await t.pumpAndSettle();
    expect(find.byType(ShopperCheckoutPage), findsNothing);
    expect(find.byKey(const ValueKey('floating-cart')), findsOneWidget);
    await finishJourney(t, session);
    api.session.dispose();
  });
  testWidgets('Private Orders signs in then returns to the requested list',
      (t) async {
    final session = JourneySession(), api = JourneyApi(JourneySession());
    await startJourney(t, session, api: api);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('nav-orders')));
    await t.pumpAndSettle();
    expect(find.text('Sign in to see your orders'), findsOneWidget);
    expect(find.byType(ShopOrdersPanel), findsNothing);
    session.authenticate('order-owner');
    await t.pumpAndSettle();
    expect(find.byType(ShopOrdersPanel), findsOneWidget);
    expect(find.text('Select account'), findsNothing);
    await finishJourney(t, session);
    api.session.dispose();
  });
  testWidgets('Home fits 320px at 1.8 text scale with reduced motion',
      (t) async {
    final session = JourneySession();
    await startJourney(t, session, width: 320, textScale: 1.8);
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    for (var step = 0; step < 9; step++) {
      await t.drag(find.byKey(const PageStorageKey<String>('shopper-home')),
          const Offset(0, -480));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
    }
    await finishJourney(t, session);
  });
}
