/// Seller preferences are separate from the server's checkout readiness.
/// A toggle can never approve a seller or verify a settlement account.
class SellerCommerceStatus {
  final Map<String, dynamic> settings;
  final Map<String, dynamic> commerce;
  const SellerCommerceStatus(
      {this.settings = const {}, this.commerce = const {}});

  bool get known => commerce.containsKey('onlineOrdersReady');
  bool get onlineOrdersEnabled => settings['onlineOrdersEnabled'] is bool
      ? settings['onlineOrdersEnabled'] == true
      : commerce['onlineOrdersEnabled'] != false;
  bool get onlinePaymentsEnabled => settings['onlinePaymentsEnabled'] is bool
      ? settings['onlinePaymentsEnabled'] == true
      : commerce['onlinePaymentsEnabled'] == true;
  bool get onlineOrdersReady =>
      onlineOrdersEnabled && commerce['onlineOrdersReady'] == true;
  bool get settlementVerified => commerce['settlementVerified'] == true;
  String get environment =>
      commerce['paymentEnvironment']?.toString() ?? 'unconfigured';
  bool get onlinePaymentsReady =>
      onlineOrdersReady &&
      onlinePaymentsEnabled &&
      commerce['onlinePaymentsReady'] == true &&
      settlementVerified &&
      environment == 'live';
  bool get fulfilmentReady =>
      settings['pickupEnabled'] == true || settings['deliveryEnabled'] == true;

  String get orderLabel => !known
      ? 'Status not verified'
      : onlineOrdersReady
          ? 'Accepting online orders'
          : !onlineOrdersEnabled
              ? 'Online orders switched off'
              : 'Order setup needed';
  String get paymentLabel => !known
      ? 'Status not verified'
      : onlinePaymentsReady
          ? 'Online payments ready'
          : !onlinePaymentsEnabled
              ? 'Online payments switched off'
              : environment == 'test'
                  ? 'Test mode · no live payments'
                  : 'Payment setup needed';

  String get orderDetail => !known
      ? 'Refresh your shop settings to check whether shoppers can order.'
      : describe(commerce['onlineOrdersReason']?.toString(), payments: false);
  String get paymentDetail => !known
      ? 'Live payment readiness has not been verified. Saving a preference does not activate payments.'
      : onlinePaymentsReady
          ? 'Shoppers can pay through secure checkout after you confirm their order.'
          : describe(commerce['onlinePaymentsReason']?.toString(),
              payments: true);

  static String describe(String? reason, {required bool payments}) =>
      switch (reason) {
        'seller_approval_pending' =>
          'Teyza must approve your business registration first.',
        'shop_setup_incomplete' =>
          'Complete your business registration and required verification.',
        'shop_not_active' =>
          'Your shop listing needs to be active. Check its review status.',
        'selling_access_inactive' =>
          'Your business needs active selling access. Review your membership status.',
        'category_not_supported' =>
          'Online product checkout is for eligible shops selling physical goods. Use the service enquiries or wholesale tools for this account.',
        'online_orders_disabled' =>
          'Turn on online orders when you are ready to receive requests.',
        'fulfilment_unavailable' =>
          'Choose collection or delivery so shoppers can receive their order.',
        'online_payments_disabled' =>
          'Choose online payments to request secure card and bank checkout for your shoppers.',
        'provider_not_configured' =>
          'Teyza needs to finish the payment provider setup before live checkout is available.',
        'test_mode' =>
          'Payments are in test mode. Live shopper payments are not available.',
        'settlement_pending' =>
          'Teyza must verify your payout beneficiary before you can receive online payments.',
        'ready' => payments
            ? 'Live payment readiness needs a current, verified payout connection.'
            : 'Shoppers can send orders for you to confirm and fulfil.',
        _ => payments
            ? 'Payment readiness is not confirmed. Ask Teyza support to check your payout setup.'
            : 'Check your shop settings and review status before accepting orders.',
      };
}
