import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_commerce.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/seller_services.dart';
import 'package:teyza_shopper/seller_selling.dart';
import 'package:teyza_shopper/seller_workspace.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_design.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class ModernOwner extends ShopperSession {
  ModernOwner() {
    userId = 'business-preview';
    idToken = 'offline-token';
    emailVerified = true;
    isReady = true;
  }
  @override
  Future<String> freshIdToken() async => 'offline-token';
  void changeAccount() {
    userId = 'different-owner';
    notifyListeners();
  }
}

const configuredSettings = <String, dynamic>{
  'onlineOrdersEnabled': true,
  'onlinePaymentsEnabled': true,
  'pickupEnabled': true,
  'deliveryEnabled': false,
  'cardPayments': false,
  'deliveryFeeCents': 0,
  'deliveryRadiusKm': 5,
  'liveChatEnabled': true,
};
const payoutPending = <String, dynamic>{
  'onlineOrdersEnabled': true,
  'onlinePaymentsEnabled': true,
  'onlineOrdersReady': true,
  'onlinePaymentsReady': false,
  'onlineOrdersReason': 'ready',
  'onlinePaymentsReason': 'settlement_pending',
  'paymentEnvironment': 'live',
  'settlementVerified': false,
};

class ModernRepo extends SellerFirestore {
  const ModernRepo({required super.uid, required super.token});
  @override
  Future<SellerShop?> shop() async => const SellerShop('KwaMashu Fresh Market',
      'spaza', 'KwaMashu, Durban', 'approved', 'active');
  @override
  Future<List<SellerDraft>> drafts() async => const [
        SellerDraft(
            id: 'bread',
            name: 'Fresh bread',
            category: 'Bakery',
            priceCents: 1500,
            stock: 6),
        SellerDraft(
            id: 'milk',
            name: 'Full cream milk',
            category: 'Dairy',
            priceCents: 2200,
            stock: 8),
        SellerDraft(
            id: 'eggs',
            name: 'Large eggs',
            category: 'Dairy',
            priceCents: 3800,
            stock: 4),
      ];
}

class ModernApi extends TeyzaMobileApi {
  ModernApi(super.session);
  final calls = <({String action, Map<String, dynamic> data})>[];
  Map<String, dynamic>? saved;
  Completer<Map<String, dynamic>>? saveReply;
  bool failSummary = false;
  @override
  Future<Map<String, dynamic>> call(String action,
      [Map<String, dynamic> data = const {}]) async {
    calls.add((action: action, data: data));
    if (action == 'seller_summary') {
      if (failSummary) throw StateError('Offline');
      return {
        'settings': configuredSettings,
        'commerce': payoutPending,
        'publicationStatus': 'active',
        'approvalStatus': 'approved',
        'hasLocation': true,
        'shopLive': true,
        'identityVerified': true,
        'sellingEnabled': true,
        'listingPaid': true,
        'publicProductCount': 3,
        'setupComplete': true,
        'verification': {'status': 'approved'}
      };
    }
    if (action == 'notification_list')
      return {'notifications': [], 'unread': 0};
    if (action == 'update_services' || action == 'save_services') {
      saved = Map.from(data);
      if (saveReply != null) return saveReply!.future;
      return {
        'settings': data,
        'commerce': {
          ...payoutPending,
          'onlineOrdersEnabled': data['onlineOrdersEnabled'],
          'onlinePaymentsEnabled': data['onlinePaymentsEnabled']
        }
      };
    }
    return {'ok': true};
  }
}

Future<void> visibleTap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> previewFonts(WidgetTester tester) async {
  if (Platform.environment['TEYZA_CAPTURE_UI'] != '1') return;
  await (FontLoader('PT Sans')
        ..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
        ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf')))
      .load();
  await (FontLoader('MaterialIcons')
        ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
      .load();
  await tester.pumpAndSettle();
}

Future<void> capture(WidgetTester tester, GlobalKey key, String name) async {
  if (Platform.environment['TEYZA_CAPTURE_UI'] != '1') return;
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject() as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('build/ui-preview/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

Widget dashboard(
        {Map<String, dynamic> commerce = payoutPending,
        bool verified = true,
        String publicationStatus = 'active',
        int? savedProductCount = 3,
        int? publicProductCount = 3,
        VoidCallback? productsTap,
        VoidCallback? settingsTap}) =>
    SellerSellingDashboard(
        shopName: 'KwaMashu Fresh Market',
        live: true,
        verified: verified,
        publicationStatus: publicationStatus,
        productCount: savedProductCount,
        publicProductCount: publicProductCount,
        hasProductAccess: true,
        premiumAccount: true,
        settings: configuredSettings,
        commerce: commerce,
        onAdd: () {},
        onProducts: productsTap ?? () {},
        onOrders: () {},
        onChat: () {},
        onFinance: () {},
        onAreas: () {},
        onBusiness: () {},
        onVerify: () {},
        onServices: settingsTap ?? () {});

void main() {
  test(
      'Online payment readiness requires a live verified settlement and enabled orders',
      () {
    final ready = {
      ...payoutPending,
      'onlinePaymentsReady': true,
      'onlinePaymentsReason': 'ready',
      'settlementVerified': true
    };
    expect(
        SellerCommerceStatus(settings: configuredSettings, commerce: ready)
            .onlinePaymentsReady,
        isTrue);
    for (final change in <Map<String, dynamic>>[
      {'settlementVerified': false},
      {'paymentEnvironment': 'test'},
      {'paymentEnvironment': 'unconfigured'},
      {'onlineOrdersReady': false},
      {'onlinePaymentsReady': false},
    ]) {
      expect(
          SellerCommerceStatus(
              settings: configuredSettings,
              commerce: {...ready, ...change}).onlinePaymentsReady,
          isFalse);
    }
    expect(
        SellerCommerceStatus(
                settings: {'onlinePaymentsEnabled': false}, commerce: ready)
            .onlinePaymentsReady,
        isFalse);
    expect(
        const SellerCommerceStatus(settings: configuredSettings)
            .onlinePaymentsReady,
        isFalse);
    expect(
        const SellerCommerceStatus(settings: configuredSettings).paymentLabel,
        'Status not verified');
  });

  testWidgets(
      'Payment preferences save separately from in-person cards and never approve settlement',
      (tester) async {
    final session = ModernOwner(), api = ModernApi(ModernOwner());
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(
        theme: TeyzaDesign.theme(),
        home: Scaffold(
            body: ListView(children: [
          SellerServiceControls(
              session: session,
              api: api,
              settings: {
                ...configuredSettings,
                'onlineOrdersEnabled': false,
                'onlinePaymentsEnabled': false
              },
              commerce: payoutPending),
        ]))));
    await visibleTap(
        tester, find.byKey(const ValueKey('seller-online-orders-toggle')));
    await visibleTap(
        tester, find.byKey(const ValueKey('seller-online-payments-toggle')));
    expect(find.text('Save to check availability'), findsOneWidget);
    await visibleTap(tester, find.text('Save shop options'));
    expect(api.saved!['onlineOrdersEnabled'], isTrue);
    expect(api.saved!['onlinePaymentsEnabled'], isTrue);
    expect(api.saved!['cardPayments'], isFalse);
    expect(api.saved!.containsKey('settlementVerified'), isFalse);
    expect(api.saved!.containsKey('approvalStatus'), isFalse);
    await tester
        .ensureVisible(find.byKey(const ValueKey('seller-payment-readiness')));
    await tester.pumpAndSettle();
    expect(find.text('Payment setup needed'), findsOneWidget);
    expect(find.textContaining('verify your payout beneficiary'),
        findsAtLeastNWidgets(1));
    expect(find.text('Online payments ready'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets(
      'An account switch clears preferences and ignores a late save response',
      (tester) async {
    final session = ModernOwner(),
        api = ModernApi(ModernOwner())
          ..saveReply = Completer<Map<String, dynamic>>();
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ListView(children: [
      SellerServiceControls(
          session: session,
          api: api,
          settings: configuredSettings,
          commerce: payoutPending),
    ]))));
    await visibleTap(
        tester, find.byKey(const ValueKey('seller-online-payments-toggle')));
    await tester.ensureVisible(find.text('Save shop options'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save shop options'));
    await tester.pump();
    session.changeAccount();
    await tester.pump();
    api.saveReply!.complete({
      'settings': configuredSettings,
      'commerce': {
        ...payoutPending,
        'settlementVerified': true,
        'onlinePaymentsReady': true
      }
    });
    await tester.pumpAndSettle();
    expect(find.text('Shop services saved.'), findsNothing);
    expect(find.text('Online payments ready'), findsNothing);
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Save shop options'))
            .onPressed,
        isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets(
      'Dashboard prioritises pending registration over active stale listing flags',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        theme: TeyzaDesign.theme(),
        home: Scaffold(body: dashboard(verified: false))));
    expect(find.text('Awaiting approval'), findsOneWidget);
    expect(find.text('Your setup is with Teyza'), findsOneWidget);
    expect(find.text('Shop is live'), findsNothing);
    expect(find.text('Ready for your next order'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('Saved drafts never stand in for verified public inventory', (tester) async {
    final ready = {...payoutPending, 'onlinePaymentsReady': true,
      'onlinePaymentsReason': 'ready', 'settlementVerified': true};
    var productsOpened = false;
    for (final (saved, published, title) in <(int, int?, String)>[
      (3, 0, 'Publish your saved products'),
      (0, 0, 'Add your first products'),
      (3, null, 'Check your product listing'),
      (3, 3, 'Ready for your next order'),
    ]) {
      await tester.pumpWidget(MaterialApp(theme: TeyzaDesign.theme(),
        home: Scaffold(body: dashboard(commerce: ready, savedProductCount: saved,
          publicProductCount: published, productsTap: () => productsOpened = true))));
      await tester.pumpAndSettle();
      expect(find.text(title), findsOneWidget);
      if (published == 0 && saved > 0) {
        await visibleTap(tester, find.text('Review product listing'));
        expect(productsOpened, isTrue);
      }
      if (published == null || published == 0) {
        expect(find.text('Ready for your next order'), findsNothing);
      }
      expect(tester.takeException(), isNull);
    }
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
      'Business dashboard shows a real payment next step and opens shopping settings',
      (tester) async {
    await previewFonts(tester);
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final session = ModernOwner(), api = ModernApi(ModernOwner());
    final boundary = GlobalKey();
    await tester.pumpWidget(RepaintBoundary(
        key: boundary,
        child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: TeyzaDesign.theme(),
            home: SellerWorkspacePage(
                session: session,
                openLogin: () {},
                sellerMode: true,
                mobileApi: api,
                apiFactory: (uid, token) =>
                    ModernRepo(uid: uid, token: token)))));
    await tester.pumpAndSettle();
    expect(find.text('Finish your payment setup'), findsOneWidget);
    expect(find.text('Shop is live'), findsOneWidget);
    await capture(tester, boundary, 'business-dashboard-modern');
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('seller-commerce-readiness')), 300,
        scrollable: find.byType(Scrollable).first);
    await tester
        .ensureVisible(find.byKey(const ValueKey('seller-commerce-readiness')));
    await tester.pumpAndSettle();
    expect(find.text('Online payments ready'), findsNothing);
    expect(find.text('Payment setup needed'), findsOneWidget);
    await capture(tester, boundary, 'business-online-readiness');
    await visibleTap(
        tester, find.byKey(const ValueKey('seller-online-shopping-settings')));
    expect(find.byKey(const ValueKey('seller-online-orders-toggle')),
        findsOneWidget);
    expect(find.byKey(const ValueKey('seller-online-payments-toggle')),
        findsOneWidget);
    await capture(tester, boundary, 'business-online-shopping-settings');
    expect(
        find.byKey(const ValueKey('seller-payment-support')), findsOneWidget);
    await visibleTap(
        tester, find.byKey(const ValueKey('seller-payment-support')));
    expect(find.text('Chat with Teyza Support'), findsOneWidget);
    expect(api.calls.where((call) => call.action == 'seller_support_message'), isEmpty);
    expect(api.calls.where((call) => call.action == 'ops_order_subaccount'),
        isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    session.dispose();
    api.session.dispose();
  });

  for (final scale in [1.0, 1.5, 2.0]) {
    testWidgets('Business tools remain readable at 320px and text scale $scale',
        (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 760));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final session = ModernOwner(), api = ModernApi(ModernOwner());
      await tester.pumpWidget(MaterialApp(
          theme: TeyzaDesign.theme(),
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home: Scaffold(
              body: dashboard(),
              bottomNavigationBar:
                  SellerNavigation(selected: 0, onSelect: (_) {}))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(find.text('More business tools'), 260,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(MaterialApp(
          theme: TeyzaDesign.theme(),
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home: Scaffold(
              body: ListView(children: [
            SellerServiceControls(
                session: session,
                api: api,
                settings: {...configuredSettings, 'deliveryEnabled': true},
                commerce: payoutPending)
          ]))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Save shop options'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      session.dispose();
      api.session.dispose();
    });
  }
}
