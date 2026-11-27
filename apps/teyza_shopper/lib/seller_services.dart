import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'seller_commerce.dart';
import 'shopper_design.dart';

class SellerServiceControls extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final Map<String, dynamic> settings, commerce;
  final bool enabled;
  final VoidCallback? onSaved, onPaymentHelp;
  final String saveAction, saveLabel;
  const SellerServiceControls(
      {super.key,
      required this.session,
      required this.settings,
      this.commerce = const {},
      this.api,
      this.enabled = true,
      this.onSaved,
      this.onPaymentHelp,
      this.saveAction = 'update_services',
      this.saveLabel = 'Save shop options'});
  @override
  State<SellerServiceControls> createState() => _ServiceControlsState();
}

class _ServiceControlsState extends State<SellerServiceControls> {
  late final String? uid;
  final fee = TextEditingController(),
      radius = TextEditingController(),
      notes = TextEditingController();
  bool delivery = false,
      pickup = false,
      cards = false,
      messages = true,
      cashback = false;
  bool onlineOrders = true,
      onlinePayments = false,
      working = false,
      dirty = false;
  int discount = 0;
  String? error;
  Map<String, dynamic> checkedCommerce = {};
  bool get enabled =>
      widget.enabled && !working && uid == widget.session.userId;
  bool get onPaymentHelpAvailable =>
      widget.onPaymentHelp != null &&
      !dirty &&
      onlinePayments &&
      !readiness.onlinePaymentsReady;
  bool get supported =>
      checkedCommerce['onlineOrdersReason'] != 'category_not_supported';
  SellerCommerceStatus get readiness => SellerCommerceStatus(settings: {
        'onlineOrdersEnabled': onlineOrders,
        'onlinePaymentsEnabled': onlinePayments,
        'pickupEnabled': pickup,
        'deliveryEnabled': delivery
      }, commerce: dirty ? const {} : checkedCommerce);

  @override
  void initState() {
    super.initState();
    uid = widget.session.userId;
    read(widget.settings, widget.commerce);
    widget.session.addListener(accountChanged);
  }

  @override
  void didUpdateWidget(covariant SellerServiceControls oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!dirty && !working) read(widget.settings, widget.commerce);
  }

  void read(Map<String, dynamic> settings, Map<String, dynamic> commerce) {
    delivery = settings['deliveryEnabled'] == true;
    pickup = settings['pickupEnabled'] == true;
    cards = settings['cardPayments'] == true;
    messages = settings['liveChatEnabled'] != false;
    cashback = settings['cashback'] == true;
    onlineOrders = settings['onlineOrdersEnabled'] != false;
    onlinePayments = settings['onlinePaymentsEnabled'] == true;
    discount = settings['cashDiscountPercent'] == 10 ? 10 : 0;
    fee.text =
        ((settings['deliveryFeeCents'] as num? ?? 0) / 100).toStringAsFixed(2);
    final distance = (settings['deliveryRadiusKm'] as num? ?? 0).toInt();
    radius.text = (distance > 0 ? distance : 5).toString();
    notes.text = settings['deliveryNotes']?.toString() ?? '';
    checkedCommerce = Map<String, dynamic>.from(commerce);
  }

  void accountChanged() {
    if (mounted && uid != widget.session.userId) {
      fee.clear();
      radius.clear();
      notes.clear();
      setState(() {
        delivery = false;
        pickup = false;
        cards = false;
        messages = false;
        cashback = false;
        onlineOrders = false;
        onlinePayments = false;
        discount = 0;
        dirty = false;
        checkedCommerce = {};
        error = 'Your account changed. Reopen your shop dashboard.';
      });
    }
  }

  @override
  void dispose() {
    widget.session.removeListener(accountChanged);
    fee.dispose();
    radius.dispose();
    notes.dispose();
    super.dispose();
  }

  void edit(VoidCallback change) => setState(() {
        change();
        dirty = true;
        error = null;
      });

  Future<void> save() async {
    if (!enabled) return;
    if (notes.text.trim().length > 300) {
      setState(() => error = 'Keep delivery instructions within 300 characters.');
      return;
    }
    final text = fee.text.trim().replaceAll(',', '.');
    final amount = double.tryParse(text),
        distance = int.tryParse(radius.text.trim());
    if (delivery &&
        (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(text) ||
            amount == null ||
            !amount.isFinite ||
            amount < 0 ||
            amount > 1000 ||
            distance == null ||
            distance < 1 ||
            distance > 100)) {
      setState(() => error =
          'Enter a delivery fee from R0 to R1,000 and a radius from 1 to 100 km.');
      return;
    }
    setState(() {
      working = true;
      error = null;
    });
    try {
      final data = <String, dynamic>{
        'onlineOrdersEnabled': onlineOrders,
        'onlinePaymentsEnabled': onlinePayments,
        'pickupEnabled': pickup,
        'deliveryEnabled': delivery,
        'deliveryFeeCents': delivery ? ((amount ?? 0) * 100).round() : 0,
        'deliveryRadiusKm': delivery ? distance : 0,
        'deliveryNotes': notes.text.trim(),
        'cardPayments': cards,
        'cashback': cashback,
        'liveChatEnabled': messages,
        'cashDiscountPercent': discount,
        'cardPaymentFeePercent': 0,
      };
      final result = await (widget.api ?? TeyzaMobileApi(widget.session))
          .call(widget.saveAction, data);
      if (!mounted || uid != widget.session.userId) return;
      setState(() {
        dirty = false;
        read(
            result['settings'] is Map
                ? Map<String, dynamic>.from(result['settings'] as Map)
                : data,
            result['commerce'] is Map
                ? Map<String, dynamic>.from(result['commerce'] as Map)
                : {});
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Shop services saved.')));
      widget.onSaved?.call();
    } catch (e) {
      if (mounted && uid == widget.session.userId)
        setState(() => error = mobileError(e));
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _section(Icons.shopping_bag_outlined, 'Online shopping',
            'Choose how customers order and pay for physical goods.', [
          if (!supported)
            const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text(
                    'Online product checkout is for eligible shops selling physical goods. Use the service enquiries or wholesale tools for this account.',
                    style: TextStyle(color: TeyzaDesign.muted, height: 1.5))),
          _toggle(
              key: const ValueKey('seller-online-orders-toggle'),
              title: 'Accept online orders',
              detail:
                  'Let shoppers send an order. You confirm stock and availability.',
              value: onlineOrders,
              onChanged: enabled && supported
                  ? (value) => edit(() => onlineOrders = value)
                  : null),
          const Divider(height: 22, color: TeyzaDesign.border),
          _toggle(
              key: const ValueKey('seller-online-payments-toggle'),
              title: 'Accept online payments',
              detail:
                  'Secure card or bank checkout after you confirm the order. A verified payout account is required.',
              value: onlinePayments,
              onChanged: enabled && supported
                  ? (value) => edit(() => onlinePayments = value)
                  : null),
          const SizedBox(height: 16),
          Container(
              key: const ValueKey('seller-payment-readiness'),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                  color: TeyzaDesign.ivory,
                  borderRadius: BorderRadius.circular(14)),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                              readiness.onlinePaymentsReady
                                  ? Icons.verified_outlined
                                  : Icons.info_outline,
                              color: TeyzaDesign.forest,
                              size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                              child: Text(
                                  dirty
                                      ? 'Save to check availability'
                                      : readiness.paymentLabel,
                                  style: const TextStyle(
                                      color: TeyzaDesign.ink,
                                      fontWeight: FontWeight.w700))),
                        ]),
                    const SizedBox(height: 8),
                    Text(
                        dirty
                            ? 'Your changes are not saved yet. We will check order and payment readiness after saving.'
                            : readiness.paymentDetail,
                        style: const TextStyle(
                            color: TeyzaDesign.muted,
                            fontSize: 12,
                            height: 1.5)),
                    if (!dirty && !readiness.onlineOrdersReady)
                      Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(readiness.orderDetail,
                              style: const TextStyle(
                                  color: TeyzaDesign.muted,
                                  fontSize: 12,
                                  height: 1.5))),
                    if (onPaymentHelpAvailable) ...[
                      const SizedBox(height: 10),
                      TextButton.icon(
                          key: const ValueKey('seller-payment-support'),
                          onPressed: enabled ? widget.onPaymentHelp : null,
                          icon:
                              const Icon(Icons.support_agent_rounded, size: 19),
                          label: const Text('Contact Teyza support')),
                    ],
                  ])),
          const SizedBox(height: 12),
          const Text(
              'These options are for shopper orders. Your business membership is separate. Turning a switch on does not verify your payout beneficiary.',
              style: TextStyle(
                  color: TeyzaDesign.muted, fontSize: 11, height: 1.5)),
        ]),
        const SizedBox(height: 18),
        _section(Icons.local_shipping_outlined, 'Collection & delivery',
            'Choose at least one way for shoppers to receive an order.', [
          _toggle(
              key: const ValueKey('seller-pickup-toggle'),
              title: 'Offer collection',
              detail: 'Shoppers collect their confirmed order from your shop.',
              value: pickup,
              onChanged:
                  enabled ? (value) => edit(() => pickup = value) : null),
          const Divider(height: 22, color: TeyzaDesign.border),
          _toggle(
              key: const ValueKey('seller-delivery-toggle'),
              title: 'Offer delivery',
              detail: 'Set a clear fee and the distance you can deliver.',
              value: delivery,
              onChanged:
                  enabled ? (value) => edit(() => delivery = value) : null),
          if (delivery) ...[
            const SizedBox(height: 16),
            TextField(
                key: const ValueKey('seller-delivery-fee'),
                controller: fee,
                enabled: enabled,
                onChanged: (_) => edit(() {}),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                    labelText: 'Delivery fee',
                    prefixText: 'R ',
                    helperText: 'R0 means free delivery.',
                    border: OutlineInputBorder())),
            const SizedBox(height: 18),
            TextField(
                key: const ValueKey('seller-delivery-radius'),
                controller: radius,
                enabled: enabled,
                onChanged: (_) => edit(() {}),
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Delivery radius (km)',
                    border: OutlineInputBorder())),
            const SizedBox(height: 18),
            TextField(
                key: const ValueKey('seller-delivery-notes'),
                controller: notes,
                enabled: enabled,
                onChanged: (_) => edit(() {}),
                maxLines: 3,
                maxLength: 300,
                decoration: const InputDecoration(
                    labelText: 'Delivery areas or instructions',
                    hintText: 'Optional details for your shoppers',
                    border: OutlineInputBorder())),
          ],
        ]),
        const SizedBox(height: 18),
        _section(Icons.storefront_outlined, 'Delivery, cards & messages',
            'In-person payment options and ways to stay in touch.', [
          _toggle(
              key: const ValueKey('seller-card-toggle'),
              title: 'Accept cards at the shop',
              detail:
                  'For your own card terminal. This does not enable online checkout. No extra card charge.',
              value: cards,
              onChanged: enabled ? (value) => edit(() => cards = value) : null),
          const SizedBox(height: 18),
          InputDecorator(
              decoration: const InputDecoration(
                  labelText: 'Optional cash discount',
                  border: OutlineInputBorder()),
              child: DropdownButtonHideUnderline(
                  child: DropdownButton<int>(
                      key: const ValueKey('seller-cash-discount'),
                      value: discount,
                      isExpanded: true,
                      items: const [
                        DropdownMenuItem(value: 0, child: Text('No discount')),
                        DropdownMenuItem(
                            value: 10, child: Text('10% off items for cash'))
                      ],
                      onChanged: enabled
                          ? (value) => edit(() => discount = value ?? 0)
                          : null))),
          const Padding(
              padding: EdgeInsets.only(top: 8, bottom: 16),
              child: Text(
                  'A cash discount reduces item prices for cash customers. The delivery fee stays the same.',
                  style: TextStyle(
                      color: TeyzaDesign.muted, fontSize: 11, height: 1.5))),
          _toggle(
              key: const ValueKey('seller-cashback-toggle'),
              title: 'Cash back',
              detail: 'Subject to cash available at your shop.',
              value: cashback,
              onChanged:
                  enabled ? (value) => edit(() => cashback = value) : null),
          const Divider(height: 22, color: TeyzaDesign.border),
          _toggle(
              key: const ValueKey('seller-messaging-toggle'),
              title: 'Live chat / messaging',
              detail: 'Let shoppers message your shop.',
              value: messages,
              onChanged:
                  enabled ? (value) => edit(() => messages = value) : null),
        ]),
        const SizedBox(height: 20),
        if (error != null)
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Semantics(
                  liveRegion: true,
                  child: Text(error!,
                      style: const TextStyle(
                          color: Color(0xFF9A3412), height: 1.5)))),
        FilledButton(
            onPressed: enabled && dirty ? save : null,
            style: FilledButton.styleFrom(minimumSize: const Size(0, 50)),
            child: Text(working ? 'Saving…' : widget.saveLabel)),
        if (dirty)
          const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text('You have unsaved changes.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: TeyzaDesign.muted))),
      ]);

  Widget _section(
          IconData icon, String title, String detail, List<Widget> children) =>
      Material(
          color: Colors.white,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: TeyzaDesign.border)),
          child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(icon, color: TeyzaDesign.forest, size: 24),
                          const SizedBox(width: 10),
                          Expanded(
                              child: Text(title,
                                  style: const TextStyle(
                                      color: TeyzaDesign.ink,
                                      fontSize: 19,
                                      fontWeight: FontWeight.w700)))
                        ]),
                    const SizedBox(height: 8),
                    Text(detail,
                        style: const TextStyle(
                            color: TeyzaDesign.muted,
                            fontSize: 12,
                            height: 1.5)),
                    const SizedBox(height: 20),
                    ...children,
                  ])));

  Widget _toggle(
          {required Key key,
          required String title,
          required String detail,
          required bool value,
          required ValueChanged<bool>? onChanged}) =>
      SwitchListTile(
          key: key,
          contentPadding: EdgeInsets.zero,
          dense: false,
          title: Text(title,
              style: const TextStyle(
                  color: TeyzaDesign.ink,
                  fontSize: 15,
                  fontWeight: FontWeight.w700)),
          subtitle: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(detail,
                  style: const TextStyle(
                      color: TeyzaDesign.muted, fontSize: 12, height: 1.45))),
          value: value,
          onChanged: onChanged);
}
