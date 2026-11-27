import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shop_orders.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_design.dart';
import 'package:teyza_shopper/shopper_payment_preference.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class PaymentMemoryStore implements SessionStore {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

class PaymentSession extends ShopperSession {
  PaymentSession({bool verified = true}) : super(store: PaymentMemoryStore()) {
    userId = 'buyer1';
    idToken = 'fixture-token';
    email = 'shopper@example.test';
    emailVerified = verified;
    phoneVerified = true;
    isReady = true;
  }
  @override
  Future<String> freshIdToken() async => 'fixture-token';
  @override
  bool get googleSignInAvailable => true;
  @override
  bool get googleSignInConfigured => true;
  @override
  bool get appleSignInAvailable => false;
  @override
  Future<void> verifyShopperWithGoogle() async {
    emailVerified = true;
    notifyListeners();
  }

  void switchAccount() {
    userId = 'other-user';
    notifyListeners();
  }
}

class PaymentApi extends TeyzaMobileApi {
  PaymentApi(super.session, {this.ready = true, this.cards = false});
  bool ready, cards;
  String verifyStatus = 'checkout_pending';
  Completer<void>? checkoutGate;
  Completer<Map<String, dynamic>>? verifyGate;
  Map<String, dynamic>? submitted;
  final calls = <({String action, Map<String, dynamic> data})>[];
  final order = <String, dynamic>{
    'id': 'order1',
    'shopName': 'KwaMashu Fresh Market',
    'status': 'confirmed',
    'mode': 'collection',
    'paymentMethod': 'card_online',
    'paymentStatus': 'arrange_with_shop',
    'subtotalCents': 6500,
    'totalCents': 6500,
    'items': [
      {
        'id': 'bread',
        'name': 'Fresh brown bread',
        'quantity': 2,
        'priceCents': 1800
      },
      {
        'id': 'milk',
        'name': 'Full cream milk · 2 L',
        'quantity': 1,
        'priceCents': 2900
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> call(String action,
      [Map<String, dynamic> data = const {}]) async {
    calls.add((action: action, data: data));
    if (action == 'order_quote') {
      return {
        'quote': {
          'quoteId': 'server-${data['mode']}-${data['paymentMethod']}',
          'items': order['items'],
          'subtotalCents': 6500,
          'deliveryFeeCents': data['mode'] == 'delivery' ? 1500 : 0,
          'totalCents': data['mode'] == 'delivery' ? 8000 : 6500,
          'cardPayments': cards,
          'cardFeeCents': 0,
          'commerce': {
            'onlineOrdersReady': true,
            'onlinePaymentsReady': ready,
            'onlinePaymentsEnabled': true,
            'onlinePaymentsReason': ready ? 'ready' : 'settlement_pending',
            'shopperPaymentEligible': session.emailVerified,
            'shopperPaymentReason':
                session.emailVerified ? 'ready' : 'shopper_email_required',
          },
        }
      };
    }
    if (action == 'order_request') {
      submitted = Map.of(data);
      return {'id': 'order1', 'status': 'requested'};
    }
    if (action == 'order_list') {
      return {
        'orders': session.userId == 'buyer1' ? [Map.of(order)] : []
      };
    }
    if (action == 'order_paystack_checkout') {
      if (checkoutGate != null) await checkoutGate!.future;
      order.addAll({
        'paymentReference': 'TZO-0123456789abcdef0123456789',
        'paymentStatus': 'checkout_pending',
        'paymentCheckoutReady': true,
        'paymentEnvironment': 'live'
      });
      return {
        'reference': 'TZO-0123456789abcdef0123456789',
        'checkoutUrl': 'https://checkout.paystack.com/fixture',
        'paymentEnvironment': 'live',
        'amountCents': 6500
      };
    }
    if (action == 'order_paystack_verify') {
      if (verifyGate != null) return verifyGate!.future;
      order['paymentStatus'] = verifyStatus;
      if (verifyStatus == 'paid') order['paymentMethod'] = 'paystack';
      return {'verified': verifyStatus == 'paid', 'status': verifyStatus};
    }
    return {'ok': true};
  }
}

Future<void> makeVisible(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    tester
        .state<ScrollableState>(find.byType(Scrollable).first)
        .position
        .jumpTo(0);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(finder, 200,
        scrollable: find.byType(Scrollable).first);
  } else {
    await tester.ensureVisible(finder);
  }
  await tester.pumpAndSettle();
}

Future<void> visibleTap(WidgetTester tester, Finder finder) async {
  await makeVisible(tester, finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Widget checkout(PaymentSession session, PaymentApi api,
        {bool acceptsCard = false,
        double textScale = 1,
        ShopperPaymentPreferenceStore? preferences}) =>
    MaterialApp(
        debugShowCheckedModeBanner:false,
        theme: TeyzaDesign.theme(),
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(textScale)),
            child: child!),
        home: ShopperCheckoutPage(
            session: session,
            api: api,
            shopId: 'seller1',
            shopName: 'KwaMashu Fresh Market',
            delivery: true,
            collection: true,
            acceptsCard: acceptsCard,
            onlinePaymentsEnabled: true,
            // The current server quote, not a stale listing, decides readiness.
            onlinePaymentsReady: false,
            savedPhone: '0712345678',
            savedDeliveryAddress: '12 Main Road, KwaMashu, Durban',
            paymentPreferenceStore: preferences ??
                ShopperPaymentPreferenceStore(vault: PaymentMemoryStore()),
            items:
                List<Map<String, dynamic>>.from(api.order['items'] as List)));

Future<void> capture(WidgetTester tester, GlobalKey key, String name) async {
  if (Platform.environment['TEYZA_CAPTURE_UI'] != '1') return;
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject() as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('build/ui-preview/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  testWidgets(
      'Online payment is offered from the live quote independently of card-at-shop acceptance',
      (tester) async {
    final session = PaymentSession(), api = PaymentApi(PaymentSession());
    await tester.pumpWidget(checkout(session, api));
    await tester.pumpAndSettle();
    expect(find.text('Pay online'), findsOneWidget);
    expect(find.text('Card at the shop'), findsNothing);
    await visibleTap(tester, find.text('Pay online'));
    expect(api.calls.last.data['paymentMethod'], 'card_online');
    expect(
        api.calls.any((c) => c.action == 'order_paystack_checkout'), isFalse);
    await visibleTap(tester, find.text('Send order request'));
    expect(api.submitted!['paymentMethod'], 'card_online');
    expect(api.submitted!['items'], [
      {'id': 'bread', 'quantity': 2},
      {'id': 'milk', 'quantity': 1}
    ]);
    expect(api.submitted!.containsKey('totalCents'), isFalse);
    expect(api.submitted!['expectedQuoteId'], 'server-collection-card_online');
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets(
      'Unverified settlement keeps cash usable and does not advertise a working online button',
      (tester) async {
    final session = PaymentSession(),
        api = PaymentApi(PaymentSession(), ready: false, cards: true);
    await tester.pumpWidget(checkout(session, api, acceptsCard: true));
    await tester.pumpAndSettle();
    expect(find.text('Pay online'), findsNothing);
    expect(find.textContaining('payment setup is verified'), findsOneWidget);
    expect(find.text('Cash'), findsOneWidget);
    expect(find.text('Card at the shop'), findsOneWidget);
    await visibleTap(tester, find.text('Send order request'));
    expect(api.submitted!['paymentMethod'], 'cash');
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets(
      'Email verification links the same shopper, retains basket and unlocks online payment only after rechecking',
      (tester) async {
    final session = PaymentSession(verified: false),
        api = PaymentApi(PaymentSession(verified: false));
    // Real API and widget must observe the same identity during linking.
    final linkedApi = PaymentApi(session);
    await tester.pumpWidget(checkout(session, linkedApi));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<ChoiceChip>(
                find.byKey(const ValueKey('checkout-pay-online')))
            .onSelected,
        isNull);
    expect(find.textContaining('Verify an email'), findsOneWidget);
    await visibleTap(tester, find.text('Verify with Google'));
    expect(session.userId, 'buyer1');
    await makeVisible(
        tester, find.byKey(const ValueKey('checkout-pay-online')));
    expect(
        tester
            .widget<ChoiceChip>(
                find.byKey(const ValueKey('checkout-pay-online')))
            .onSelected,
        isNotNull);
    await makeVisible(tester, find.text('0712345678'));
    expect(find.text('0712345678'), findsOneWidget);
    expect(linkedApi.calls.any((c) => c.action == 'order_request'), isFalse);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets(
      'A saved online preference cannot bypass current settlement readiness',
      (tester) async {
    final session = PaymentSession(),
        api = PaymentApi(PaymentSession(), ready: false);
    final preferences =
        ShopperPaymentPreferenceStore(vault: PaymentMemoryStore());
    await preferences.save('buyer1', ShopperPaymentPreferenceStore.cardOnline);
    await tester.pumpWidget(checkout(session, api, preferences: preferences));
    await tester.pumpAndSettle();
    expect(
        api.calls
            .where((c) => c.action == 'order_quote')
            .every((c) => c.data['paymentMethod'] == 'cash'),
        isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets(
      'Orders returning from checkout stay unpaid until server verification succeeds',
      (tester) async {
    final session = PaymentSession(), api = PaymentApi(PaymentSession());
    final opened = <Uri>[];
    await tester.pumpWidget(MaterialApp(
        theme: TeyzaDesign.theme(),
        home: Scaffold(
            body: ShopOrdersPanel(
                session: session,
                api: api,
                openCheckout: (uri) async {
                  opened.add(uri);
                  return true;
                }))));
    await tester.pumpAndSettle();
    await visibleTap(tester, find.text('Pay with Paystack'));
    expect(opened.single.host, 'checkout.paystack.com');
    expect(find.textContaining('Your order is paid'), findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(
        api.calls.where((c) => c.action == 'order_paystack_verify').length, 1);
    expect(api.order['paymentStatus'], 'checkout_pending');
    expect(find.textContaining('Your order is paid'), findsNothing);
    api.verifyStatus = 'paid';
    await visibleTap(tester, find.text('Check Paystack payment'));
    expect(find.textContaining('Your order is paid'), findsOneWidget);
    expect(find.text('Resume secure payment'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets(
      'A failed payment can resume its existing reference without marking the order paid',
      (tester) async {
    final session = PaymentSession(), api = PaymentApi(PaymentSession());
    api.order.addAll({
      'paymentStatus': 'payment_failed',
      'paymentReference': 'TZO-0123456789abcdef0123456789',
      'paymentCheckoutReady': true
    });
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ShopOrdersPanel(
                session: session, api: api, openCheckout: (_) async => true))));
    await tester.pumpAndSettle();
    expect(find.text('Pay with Paystack'), findsNothing);
    await visibleTap(tester, find.text('Resume secure payment'));
    expect(
        api.calls
            .where((c) => c.action == 'order_paystack_checkout')
            .single
            .data,
        {'orderId': 'order1'});
    expect(find.textContaining('Your order is paid'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets('Repeated taps cannot issue concurrent checkout requests',
      (tester) async {
    final session = PaymentSession(),
        api = PaymentApi(PaymentSession())..checkoutGate = Completer<void>();
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ShopOrdersPanel(
                session: session, api: api, openCheckout: (_) async => true))));
    await tester.pumpAndSettle();
    final button = find.widgetWithText(FilledButton, 'Pay with Paystack');
    await tester.ensureVisible(button);
    await tester.pumpAndSettle();
    await tester.tap(button);
    await tester.pump();
    expect(tester.widget<FilledButton>(button).onPressed, isNull);
    expect(api.calls.where((c) => c.action == 'order_paystack_checkout').length,
        1);
    api.checkoutGate!.complete();
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });

  testWidgets(
      'Account switching discards late payment results and another shopper’s orders',
      (tester) async {
    final session = PaymentSession(),
        api = PaymentApi(session)
          ..verifyGate = Completer<Map<String, dynamic>>();
    api.order.addAll({
      'paymentStatus': 'checkout_pending',
      'paymentReference': 'TZO-0123456789abcdef0123456789'
    });
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: ShopOrdersPanel(session: session, api: api))));
    await tester.pumpAndSettle();
    final button = find.text('Check Paystack payment');
    await tester.ensureVisible(button);
    await tester.pumpAndSettle();
    await tester.tap(button);
    await tester.pump();
    session.switchAccount();
    await tester.pumpAndSettle();
    api.verifyGate!.complete({'verified': true, 'status': 'paid'});
    await tester.pumpAndSettle();
    expect(find.text('KwaMashu Fresh Market'), findsNothing);
    expect(find.textContaining('confirmed this order was paid'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
  });

  testWidgets(
      'A narrow checkout remains usable with large text and has a modern visual preview',
      (tester) async {
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
    }
    final session = PaymentSession(), api = PaymentApi(PaymentSession());
    final key = GlobalKey();
    await tester
        .pumpWidget(RepaintBoundary(key: key, child: checkout(session, api)));
    await tester.pumpAndSettle();
    await capture(tester, key, 'shopper-secure-checkout-modern');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.binding.setSurfaceSize(const Size(360, 800));
    await tester.pumpWidget(checkout(session, api, textScale: 1.8));
    await tester.pumpAndSettle();
    await makeVisible(tester, find.text('Send order request'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    api.session.dispose();
  });
}
