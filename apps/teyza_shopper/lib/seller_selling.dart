import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'seller_commerce.dart';
import 'shopper_design.dart';

const _forest = TeyzaDesign.forest;
const _ink = TeyzaDesign.ink;
const _muted = TeyzaDesign.muted;
const _mint = TeyzaDesign.mint;
const _border = TeyzaDesign.border;

class SellerNavigation extends StatelessWidget {
  final int selected;
  final String accountType;
  final ValueChanged<int> onSelect;
  const SellerNavigation(
      {super.key,
      required this.selected,
      required this.onSelect,
      this.accountType = 'spaza'});

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: _border))),
        child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 6, 4, 3),
              child: Row(children: [
                for (final (index, label, icon) in [
                  (0, 'Dashboard', Icons.space_dashboard_outlined),
                  (
                    1,
                    accountType == 'retail'
                        ? 'Services'
                        : accountType == 'wholesale'
                            ? 'Advertise'
                            : 'Products',
                    accountType == 'retail'
                        ? Icons.design_services_outlined
                        : accountType == 'wholesale'
                            ? Icons.campaign_outlined
                            : Icons.inventory_2_outlined
                  ),
                  (
                    2,
                    accountType == 'retail'
                        ? 'Enquiries'
                        : accountType == 'wholesale'
                            ? 'Partners'
                            : 'Orders',
                    Icons.receipt_long_outlined
                  ),
                  (3, 'Chat', Icons.chat_bubble_outline_rounded),
                  (4, 'Business', Icons.tune_rounded),
                ])
                  Expanded(
                      child: Semantics(
                          button: true,
                          selected: selected == index,
                          label: 'Seller $label',
                          child: InkWell(
                            key: ValueKey('seller-nav-$index'),
                            borderRadius: BorderRadius.circular(16),
                            onTap: () => onSelect(index),
                            child: Padding(
                                padding: const EdgeInsets.symmetric(
                                    vertical: 5, horizontal: 2),
                                child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      AnimatedContainer(
                                          duration:
                                              const Duration(milliseconds: 160),
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 13, vertical: 6),
                                          decoration: BoxDecoration(
                                              color: selected == index
                                                  ? const Color(0xFFDDF5E9)
                                                  : Colors.transparent,
                                              borderRadius:
                                                  BorderRadius.circular(14)),
                                          child: Icon(icon,
                                              color: selected == index
                                                  ? _forest
                                                  : _muted,
                                              size: 23)),
                                      const SizedBox(height: 3),
                                      Text(label,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: selected == index
                                                  ? FontWeight.w700
                                                  : FontWeight.w500,
                                              color: selected == index
                                                  ? _forest
                                                  : _muted)),
                                    ])),
                          ))),
              ]),
            )),
      );
}

class SellerSellingDashboard extends StatelessWidget {
  final String shopName, accountType, coverUrl;
  final bool live, verified, premiumAccount, hasProductAccess;
  final String? publicationStatus;
  final bool hasLocation;
  final VoidCallback? onLocation;
  final Uint8List? shopPhoto;
  final bool photoLoading;
  final VoidCallback? onPhoto,
      onShop,
      onEditProfile,
      onAds,
      onServices,
      onMembership;
  final int unread;
  final int? productCount, publicProductCount;
  final VoidCallback? onAdd;
  final VoidCallback onProducts,
      onOrders,
      onChat,
      onFinance,
      onAreas,
      onBusiness,
      onVerify;
  final Map<String, dynamic> settings, commerce;

  const SellerSellingDashboard(
      {super.key,
      required this.shopName,
      this.accountType = 'spaza',
      required this.live,
      required this.verified,
      required this.productCount,
      this.publicProductCount,
      required this.onAdd,
      required this.onProducts,
      required this.onOrders,
      required this.onChat,
      required this.onFinance,
      required this.onAreas,
      required this.onBusiness,
      required this.onVerify,
      this.publicationStatus,
      this.hasLocation = true,
      this.onLocation,
      this.shopPhoto,
      this.photoLoading = false,
      this.onPhoto,
      this.onShop,
      this.onEditProfile,
      this.onAds,
      this.onServices,
      this.onMembership,
      this.premiumAccount = false,
      this.hasProductAccess = false,
      this.unread = 0,
      this.coverUrl = '',
      this.settings = const {},
      this.commerce = const {}});

  bool get approvedLive =>
      live &&
      verified &&
      (publicationStatus == null || publicationStatus == 'active');
  bool get awaitingApproval =>
      publicationStatus == 'pending_review' ||
      ((live || publicationStatus == 'active') && !verified);
  bool get isShop => accountType == 'spaza';
  SellerCommerceStatus get selling {
    final checked = Map<String, dynamic>.from(commerce);
    if (checked.containsKey('onlineOrdersReady') &&
        (!approvedLive || !hasProductAccess)) {
      final reason = !verified
          ? 'seller_approval_pending'
          : !approvedLive
              ? 'shop_not_active'
              : 'selling_access_inactive';
      checked.addAll({
        'onlineOrdersReady': false,
        'onlinePaymentsReady': false,
        'onlineOrdersReason': reason,
        'onlinePaymentsReason': reason
      });
    }
    return SellerCommerceStatus(settings: settings, commerce: checked);
  }

  String get statusLabel => approvedLive
      ? 'Shop is live'
      : awaitingApproval
          ? 'Awaiting approval'
          : publicationStatus == 'suspended'
              ? 'Listing is paused'
              : 'Shop setup needed';
  String get categoryLabel => accountType == 'retail'
      ? 'Local business'
      : accountType == 'wholesale'
          ? 'Wholesale partner'
          : 'Your neighbourhood shop';
  VoidCallback get settingsAction => onServices ?? onEditProfile ?? onBusiness;

  ({
    String title,
    String detail,
    String action,
    IconData icon,
    VoidCallback tap
  }) get nextStep {
    if (awaitingApproval)
      return (
        title: 'Your setup is with Teyza',
        detail:
            'Your shop becomes visible to shoppers after Teyza approves it. Check your review for any information we still need.',
        action: 'View review status',
        icon: Icons.fact_check_outlined,
        tap: onVerify
      );
    if (!approvedLive)
      return (
        title: publicationStatus == 'suspended'
            ? 'Your listing needs attention'
            : 'Let’s finish your business setup',
        detail:
            'Complete the required registration and verification steps to get your business ready for review.',
        action: publicationStatus == 'suspended'
            ? 'View listing review'
            : 'Continue setup',
        icon: Icons.verified_user_outlined,
        tap: onVerify
      );
    if (!hasLocation)
      return (
        title: 'Help shoppers find your shop',
        detail:
            'Save your shop pin and suburb so nearby shoppers can find the right place.',
        action: 'Add shop location',
        icon: Icons.location_on_outlined,
        tap: onLocation ?? onBusiness
      );
    if (!hasProductAccess)
      return (
        title: 'Your listing is live. Review selling access.',
        detail:
            'Your free listing stays visible. Product publishing and order tools need active business selling access.',
        action: 'About business membership',
        icon: Icons.workspace_premium_outlined,
        tap: onMembership ?? onBusiness
      );
    if (isShop && productCount == null)
      return (
        title: 'Let’s refresh your products',
        detail:
            'The product list could not be checked. Open Products to retry before accepting new orders.',
        action: 'Check products',
        icon: Icons.sync_rounded,
        tap: onProducts
      );
    if (isShop && productCount == 0)
      return (
        title: 'Add your first products',
        detail:
            'Choose the items you sell, then add your prices and stock. This gives shoppers something to order.',
        action: 'Manage my products',
        icon: Icons.inventory_2_outlined,
        tap: onAdd ?? onProducts
      );
    if (isShop && publicProductCount == 0)
      return (
        title: 'Publish your saved products',
        detail:
            'Your products are saved, but none are visible to shoppers yet. Open Products to review and publish your listing.',
        action: 'Review product listing',
        icon: Icons.storefront_outlined,
        tap: onProducts
      );
    if (isShop && !selling.onlineOrdersReady)
      return (
        title: 'Choose how shoppers order',
        detail: selling.orderDetail,
        action: 'Set up online shopping',
        icon: Icons.shopping_bag_outlined,
        tap: settingsAction
      );
    if (isShop && selling.onlinePaymentsEnabled && !selling.onlinePaymentsReady)
      return (
        title: 'Finish your payment setup',
        detail: selling.paymentDetail,
        action: 'View payment setup',
        icon: Icons.account_balance_outlined,
        tap: settingsAction
      );
    if (isShop && publicProductCount == null)
      return (
        title: 'Check your product listing',
        detail:
            'Your saved products are available, but their public listing could not be checked. Open Products to refresh the publication status.',
        action: 'Check published products',
        icon: Icons.sync_rounded,
        tap: onProducts
      );
    return (
      title: isShop
          ? 'Ready for your next order'
          : 'Make your business easy to discover',
      detail: isShop
          ? 'Check new requests, confirm availability and keep shoppers updated as you prepare their order.'
          : accountType == 'retail'
              ? 'Keep your services current and respond to customer enquiries.'
              : 'Manage your offers and respond to requests from local spaza partners.',
      action: isShop
          ? 'View customer orders'
          : accountType == 'retail'
              ? 'Manage my services'
              : 'Manage wholesale advertising',
      icon: isShop ? Icons.receipt_long_outlined : Icons.storefront_outlined,
      tap: isShop ? onOrders : onProducts
    );
  }

  @override
  Widget build(BuildContext context) {
    final next = nextStep;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 96),
      children: [
        _hero(context),
        const SizedBox(height: 20),
        _heading('Your next step', 'A little progress. A stronger business.'),
        const SizedBox(height: 10),
        _panel(
            key: const ValueKey('seller-next-step'),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _icon(next.icon),
                    const SizedBox(width: 13),
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text(next.title,
                              style: const TextStyle(
                                  fontSize: 19,
                                  height: 1.2,
                                  fontWeight: FontWeight.w700,
                                  color: _ink)),
                          const SizedBox(height: 7),
                          Text(next.detail,
                              style: const TextStyle(
                                  fontSize: 13, height: 1.5, color: _muted)),
                        ])),
                  ]),
                  const SizedBox(height: 17),
                  FilledButton.icon(
                      onPressed: next.tap,
                      style: FilledButton.styleFrom(
                          backgroundColor: _forest,
                          foregroundColor: Colors.white,
                          minimumSize: const Size(0, 48),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 13),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(13))),
                      icon: const Icon(Icons.arrow_forward_rounded, size: 19),
                      label: Text(next.action,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontWeight: FontWeight.w700))),
                ])),
        if (!hasLocation && next.title != 'Help shoppers find your shop') ...[
          const SizedBox(height: 12),
          _actionRow(Icons.location_on_outlined, 'Help shoppers find your shop',
              'Save your shop pin and suburb.', onLocation ?? onBusiness),
        ],
        const SizedBox(height: 24),
        _heading('Today in your business', 'Your tools, all in one place.'),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (context, constraints) {
          final single = constraints.maxWidth < 330 ||
              MediaQuery.textScalerOf(context).scale(14) > 18;
          final width =
              single ? constraints.maxWidth : (constraints.maxWidth - 12) / 2;
          final actions = <({
            String title,
            String detail,
            IconData icon,
            VoidCallback tap,
            Key? key
          })>[
            (
              title: accountType == 'retail'
                  ? 'My services'
                  : accountType == 'wholesale'
                      ? 'Spaza advertising'
                      : 'My products',
              detail: isShop
                  ? productCount == null
                      ? 'Product list unavailable'
                      : '$productCount saved ${productCount == 1 ? 'product' : 'products'}'
                  : accountType == 'retail'
                      ? 'Images, details & availability'
                      : 'Offers for local partners',
              icon: isShop
                  ? Icons.inventory_2_outlined
                  : accountType == 'retail'
                      ? Icons.design_services_outlined
                      : Icons.campaign_outlined,
              tap: onProducts,
              key:
                  hasProductAccess ? const ValueKey('seller-add-product') : null
            ),
            (
              title: accountType == 'retail'
                  ? 'Service enquiries'
                  : accountType == 'wholesale'
                      ? 'Spaza partnerships'
                      : 'Customer orders',
              detail: accountType == 'retail'
                  ? 'Respond to new enquiries'
                  : accountType == 'wholesale'
                      ? 'Manage your connections'
                      : 'Confirm, prepare & fulfil',
              icon: Icons.receipt_long_outlined,
              tap: onOrders,
              key: null
            ),
            (
              title: 'Customer chat',
              detail: 'Keep your customers updated',
              icon: Icons.chat_bubble_outline_rounded,
              tap: onChat,
              key: null
            ),
            (
              title: 'My business',
              detail: 'Profile, hours & preferences',
              icon: Icons.tune_rounded,
              tap: onBusiness,
              key: null
            ),
          ];
          return Wrap(spacing: 12, runSpacing: 12, children: [
            for (final action in actions)
              SizedBox(
                  width: width,
                  child: _quickAction(
                      action.title, action.detail, action.icon, action.tap,
                      compact: single, key: action.key)),
          ]);
        }),
        const SizedBox(height: 24),
        _heading(
            'Store readiness', 'Know what is ready and what needs attention.'),
        const SizedBox(height: 12),
        _panel(
            child: Column(children: [
          _readiness(
              'Registration & approval',
              verified
                  ? 'Owner verified'
                  : awaitingApproval
                      ? 'Review in progress'
                      : 'Verification needed',
              verified,
              onVerify),
          const Divider(height: 24, color: _border),
          _readiness(
              'Shop location',
              hasLocation ? 'Location saved' : 'Add your location',
              hasLocation,
              onLocation ?? onBusiness),
          if (isShop) ...[
            const Divider(height: 24, color: _border),
            _readiness(
                'Product range',
                publicProductCount == null
                    ? 'Public listing not checked'
                    : publicProductCount == 0
                        ? 'No products published yet'
                        : '$publicProductCount products published',
                publicProductCount != null && publicProductCount! > 0,
                onProducts),
            const Divider(height: 24, color: _border),
            _readiness(
                'Collection or delivery',
                !selling.known
                    ? 'Settings need a refresh'
                    : selling.fulfilmentReady
                        ? settings['pickupEnabled'] == true &&
                                settings['deliveryEnabled'] == true
                            ? 'Collection and delivery selected'
                            : settings['pickupEnabled'] == true
                                ? 'Collection selected'
                                : 'Delivery selected'
                        : 'Choose how you fulfil orders',
                selling.known && selling.fulfilmentReady,
                settingsAction),
          ],
        ])),
        if (isShop) ...[
          const SizedBox(height: 24),
          _heading('Online shopping', 'You choose how your shop sells.'),
          const SizedBox(height: 12),
          _panel(
              key: const ValueKey('seller-commerce-readiness'),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _readiness('Online orders', selling.orderLabel,
                        selling.onlineOrdersReady, settingsAction),
                    const Divider(height: 24, color: _border),
                    _readiness('Shopper online payments', selling.paymentLabel,
                        selling.onlinePaymentsReady, settingsAction),
                    const SizedBox(height: 12),
                    Text(selling.paymentDetail,
                        style: const TextStyle(
                            fontSize: 12, height: 1.5, color: _muted)),
                    const SizedBox(height: 14),
                    OutlinedButton.icon(
                        key: const ValueKey('seller-online-shopping-settings'),
                        onPressed: settingsAction,
                        icon: const Icon(Icons.tune_rounded, size: 19),
                        label: const Text('Online shopping settings')),
                    const SizedBox(height: 8),
                    const Text(
                        'Shopper payments are for physical orders. They are separate from your business membership.',
                        style: TextStyle(
                            fontSize: 11, height: 1.5, color: _muted)),
                  ])),
        ],
        const SizedBox(height: 24),
        _panel(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.workspace_premium_outlined,
                color: _forest, size: 22),
            const SizedBox(width: 9),
            Expanded(
                child: Text(
                    premiumAccount
                        ? 'Premium account'
                        : hasProductAccess
                            ? 'Temporary selling access'
                            : 'Business membership',
                    style: const TextStyle(
                        fontSize: 16,
                        color: _ink,
                        fontWeight: FontWeight.w700)))
          ]),
          const SizedBox(height: 9),
          Text(
              premiumAccount
                  ? 'Your verified membership enables selling tools.'
                  : hasProductAccess
                      ? 'Temporary selling access is active. This is not a paid subscription.'
                      : 'Your shop registration is free. Selling tools need a verified entitlement.',
              style: const TextStyle(color: _muted, fontSize: 12, height: 1.5)),
          if (onMembership != null)
            TextButton(
                onPressed: onMembership,
                child: const Text('About business membership')),
        ])),
        const SizedBox(height: 16),
        _panel(
            padding: EdgeInsets.zero,
            child: ExpansionTile(
              tilePadding:
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
              childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 14),
              shape: const Border(),
              collapsedShape: const Border(),
              title: const Text('More business tools',
                  style: TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 16, color: _ink)),
              subtitle: const Text('Grow, restock and manage your profile',
                  style: TextStyle(fontSize: 12, color: _muted)),
              children: [
                if (onShop != null)
                  _actionRow(Icons.shopping_bag_outlined, 'Shop',
                      'Order stock from your wholesale partners', onShop!,
                      key: const ValueKey('seller-shop-wholesale'),
                      outlined: false),
                if (onAds != null)
                  _actionRow(Icons.campaign_outlined, 'Teyza Ads',
                      'Review local advertising options', onAds!,
                      outlined: false),
                _actionRow(Icons.account_balance_outlined, 'Stock finance',
                    'Apply for a funding review', onFinance,
                    outlined: false),
                _actionRow(Icons.near_me_outlined, 'Areas around me',
                    'Plan your local deliveries', onAreas,
                    outlined: false),
                if (onEditProfile != null)
                  _actionRow(Icons.edit_outlined, 'Edit shop profile',
                      'Contact details and shop options', onEditProfile!,
                      outlined: false),
              ],
            )),
      ],
    );
  }

  Widget _hero(BuildContext context) => Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
          color: _forest, borderRadius: BorderRadius.circular(24)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Expanded(
              child: Text('TEYZA  /  YOUR BUSINESS',
                  style: TextStyle(
                      color: Color(0xFFABE6CD),
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.6))),
          if (onPhoto != null ||
              shopPhoto != null ||
              coverUrl.startsWith('https://'))
            Tooltip(
                message:
                    shopPhoto == null ? 'Add shop photo' : 'Change shop photo',
                child: InkWell(
                    onTap: onPhoto,
                    borderRadius: BorderRadius.circular(13),
                    child: ClipRRect(
                        borderRadius: BorderRadius.circular(13),
                        child: SizedBox(
                            width: 48,
                            height: 48,
                            child: accountType == 'retail' &&
                                    coverUrl.startsWith('https://')
                                ? Image.network(coverUrl,
                                    key:
                                        const ValueKey('business-public-cover'),
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, error, stack) =>
                                        _photoFallback())
                                : shopPhoto != null
                                    ? Image.memory(shopPhoto!,
                                        key:
                                            const ValueKey('seller-shop-photo'),
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, error, stack) =>
                                            _photoFallback())
                                    : _photoFallback())))),
        ]),
        const SizedBox(height: 15),
        Text(shopName,
            style: const TextStyle(
                color: Colors.white,
                fontSize: 28,
                height: 1.12,
                fontWeight: FontWeight.w700,
                letterSpacing: -.4)),
        const SizedBox(height: 8),
        Text(categoryLabel,
            style: const TextStyle(color: Color(0xFFBDD9CD), fontSize: 13)),
        const SizedBox(height: 20),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _pill(statusLabel,
              approvedLive ? Icons.check_circle_outline : Icons.info_outline),
          if (unread > 0)
            InkWell(
                onTap: onChat,
                borderRadius: BorderRadius.circular(30),
                child: _pill(
                    '$unread unread ${unread == 1 ? 'update' : 'updates'}',
                    Icons.notifications_none_rounded)),
        ]),
      ]));

  Widget _photoFallback() => Container(
      color: const Color(0xFF24594D),
      child: Icon(
          photoLoading ? Icons.photo_outlined : Icons.add_a_photo_outlined,
          size: 22,
          color: _mint));

  Widget _heading(String title, String subtitle) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                letterSpacing: -.3,
                color: _ink)),
        const SizedBox(height: 4),
        Text(subtitle,
            style: const TextStyle(fontSize: 12, color: _muted, height: 1.4)),
      ]);

  Widget _panel(
          {required Widget child,
          Key? key,
          EdgeInsets padding = const EdgeInsets.all(18)}) =>
      Material(
          key: key,
          color: Colors.white,
          shape: RoundedRectangleBorder(
              side: const BorderSide(color: _border),
              borderRadius: BorderRadius.circular(20)),
          child: Padding(padding: padding, child: child));

  Widget _icon(IconData icon) => Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
          color: const Color(0xFFEDF6EF),
          borderRadius: BorderRadius.circular(13)),
      child: Icon(icon, size: 23, color: _forest));

  Widget _pill(String text, IconData icon) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
          color: const Color(0xFF24594D),
          borderRadius: BorderRadius.circular(30)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, color: _mint, size: 16),
        const SizedBox(width: 7),
        Flexible(
            child: Text(text,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)))
      ]));

  Widget _quickAction(
          String title, String detail, IconData icon, VoidCallback tap,
          {required bool compact, Key? key}) =>
      Material(
          key: key,
          color: Colors.white,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: const BorderSide(color: _border)),
          child: InkWell(
              onTap: tap,
              borderRadius: BorderRadius.circular(18),
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: compact
                      ? Row(children: [
                          _icon(icon),
                          const SizedBox(width: 13),
                          Expanded(child: _actionText(title, detail)),
                          const Icon(Icons.chevron_right_rounded,
                              color: _muted, size: 20),
                        ])
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                              Row(children: [
                                _icon(icon),
                                const Spacer(),
                                const Icon(Icons.north_east_rounded,
                                    color: _muted, size: 17)
                              ]),
                              const SizedBox(height: 15),
                              _actionText(title, detail),
                            ]))));

  Widget _actionText(String title, String detail) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title,
            style: const TextStyle(
                fontSize: 15,
                height: 1.2,
                fontWeight: FontWeight.w700,
                color: _ink)),
        const SizedBox(height: 5),
        Text(detail,
            style: const TextStyle(fontSize: 11, height: 1.4, color: _muted)),
      ]);

  Widget _readiness(
          String title, String detail, bool ready, VoidCallback tap) =>
      InkWell(
          onTap: tap,
          borderRadius: BorderRadius.circular(10),
          child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                Icon(
                    ready
                        ? Icons.check_circle_rounded
                        : Icons.radio_button_unchecked_rounded,
                    color: ready ? _forest : const Color(0xFF99A99E),
                    size: 21),
                const SizedBox(width: 12),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(title,
                          style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: _ink)),
                      const SizedBox(height: 4),
                      Text(detail,
                          style: const TextStyle(
                              fontSize: 12, color: _muted, height: 1.35)),
                    ])),
                const SizedBox(width: 5),
                const Icon(Icons.chevron_right_rounded,
                    size: 18, color: _muted),
              ])));

  Widget _actionRow(
          IconData icon, String title, String detail, VoidCallback tap,
          {Key? key, bool outlined = true}) =>
      Material(
          key: key,
          color: Colors.white,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(17),
              side: outlined
                  ? const BorderSide(color: _border)
                  : BorderSide.none),
          child: ListTile(
              contentPadding: EdgeInsets.symmetric(
                  horizontal: outlined ? 16 : 0, vertical: 5),
              leading: Icon(icon, size: 22, color: _forest),
              title: Text(title,
                  style: const TextStyle(
                      fontSize: 14, color: _ink, fontWeight: FontWeight.w700)),
              subtitle: Text(detail,
                  style: const TextStyle(
                      fontSize: 12, color: _muted, height: 1.4)),
              trailing: const Icon(Icons.chevron_right_rounded,
                  color: _muted, size: 20),
              onTap: tap));
}
