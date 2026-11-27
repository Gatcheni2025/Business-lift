import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'shopper_design.dart';
import 'registration_options.dart';
import 'account_deletion_page.dart';
import 'seller_review.dart';
import 'chat_moderation_page.dart';
import 'shopper_delivery_profile.dart';
import 'shopper_payment_preference.dart';
import 'package:url_launcher/url_launcher.dart';

class ShopperAccountPanel extends StatefulWidget {
  final ShopperSession session;
  final VoidCallback? onOpenOwner;
  final VoidCallback? onShopperSignedIn, onAuthenticated;
  final VoidCallback? onMessages, onOrders, onBrowse, onChangeDeliveryAddress;
  final String? savedDeliveryAddress;
  final String? signInReason;
  final ShopperDeliveryProfile? savedProfile;
  final ShopperDeliveryProfileStore? deliveryStore;
  final ShopperPaymentPreferenceStore? paymentStore;
  const ShopperAccountPanel(
      {super.key,
      required this.session,
      this.onOpenOwner,
      this.onShopperSignedIn,
      this.onAuthenticated,
      this.onMessages,
      this.onOrders,
      this.onBrowse,
      this.onChangeDeliveryAddress,
      this.signInReason,
      this.savedDeliveryAddress,
      this.savedProfile,
      this.deliveryStore,
      this.paymentStore});
  @override
  State<ShopperAccountPanel> createState() => ShopperAccountPanelState();
}

class ShopperAccountPanelState extends State<ShopperAccountPanel> {
  /// Back leaves registration or the optional existing-email form.
  bool backToRoleChoice() {
    if (working ||
        (!registering && !showLegacyEmail) ||
        widget.session.idToken != null && !widget.session.anonymousShopper)
      return false;
    setState(() {
      audience = null;
      registering = false;
      showLegacyEmail = false;
      widget.session.requestedSellerCategory = null;
      widget.session.requestedBusinessType = null;
      widget.session.requestedRegistrationRole = null;
      status = null;
      failure = false;
    });
    return true;
  }

  final formKey = GlobalKey<FormState>();
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController();
  bool registering = false,
      working = false,
      hidden = true,
      showLegacyEmail = false;
  String? audience;
  String signInAudience =
      'shopper'; // Presentation only, never an auth permission.
  bool get ownerMode => registering && audience == 'seller';
  void registrationSelected(String role, String? category) {
    if (role == 'shopper') widget.session.requestedBusinessType = null;
    setState(() {
      audience = role;
      status = null;
      failure = false;
    });
    widget.session.requestedRegistrationRole = role;
    widget.session.requestedSellerCategory = category;
  }

  void completedSignIn() {
    if (!mounted ||
        widget.session.idToken == null ||
        widget.session.anonymousShopper) return;
    if (widget.onAuthenticated != null) {
      widget.onAuthenticated!();
      return;
    }
    // The app resolves existing account records before applying registration
    // preferences. This fallback also supports standalone account panels.
    if (ownerMode) {
      widget.onOpenOwner?.call();
    } else {
      widget.onShopperSignedIn?.call();
    }
  }

  String? status;
  bool failure = false;
  ShopperDeliveryProfile? loadedProfile;
  String paymentPreference = ShopperPaymentPreferenceStore.cash;
  String? loadedUid;
  late final ShopperDeliveryProfileStore _profiles =
      widget.deliveryStore ?? ShopperDeliveryProfileStore();
  late final ShopperPaymentPreferenceStore _payments =
      widget.paymentStore ?? ShopperPaymentPreferenceStore();
  ShopperDeliveryProfile? get shopperProfile =>
      widget.savedProfile ?? loadedProfile;
  String get displayName {
    final saved = shopperProfile?.displayName.trim() ?? '';
    if (saved.isNotEmpty) return saved;
    final firebase = widget.session.name?.trim() ?? '';
    return firebase.isNotEmpty ? firebase : 'Teyza shopper';
  }

  String get displayPhone {
    final saved = shopperProfile?.phone.trim() ?? '';
    return saved.isNotEmpty
        ? saved
        : (widget.session.phoneNumber ?? 'Not provided');
  }

  // Show a privacy-safe header number; the full saved phone stays available
  // in the account detail row for editing and verification.
  String get maskedHeaderPhone {
    final value = displayPhone;
    if (RegExp(r'\d').allMatches(value).length < 7) return value;
    return '${value.substring(0, 3)} *** ${value.substring(value.length - 4)}';
  }

  String get contactEmail {
    final saved = shopperProfile?.email.trim() ?? '';
    return saved.isNotEmpty ? saved : (widget.session.email ?? 'Not provided');
  }

  bool get contactEmailVerified =>
      widget.session.emailVerified &&
      widget.session.email?.toLowerCase() == contactEmail.toLowerCase();
  @override
  void initState() {
    super.initState();
    loadedUid = widget.session.userId;
    widget.session.addListener(_sessionChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) loadProfileAndPayment();
    });
  }

  void _sessionChanged() {
    final uid = widget.session.userId;
    if (loadedUid == uid) return;
    loadedUid = uid;
    loadedProfile = null;
    status = null;
    failure = false;
    paymentPreference = ShopperPaymentPreferenceStore.cash;
    if (mounted)
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) loadProfileAndPayment();
      });
  }

  Future<void> loadProfileAndPayment() async {
    final uid = widget.session.userId;
    if (uid == null) return;
    try {
      final profile = await _profiles.load(uid);
      final choice = await _payments.load(uid);
      if (!mounted || uid != widget.session.userId) return;
      setState(() {
        loadedProfile = profile;
        paymentPreference = choice;
      });
    } catch (_) {
      /* Use the parent shopper's saved profile if local vault unavailable. */
    }
  }

  Future<void> changePaymentMethod() async {
    final uid = widget.session.userId;
    if (uid == null) return;
    final selected = await showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        builder: (ctx) => SafeArea(
                child: SingleChildScrollView(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Padding(
                  padding: EdgeInsets.all(14),
                  child: Text('Preferred payment method',
                      style: TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w800))),
              ListTile(
                  leading: const Icon(Icons.payments_outlined),
                  title: const Text('Cash on delivery / collection'),
                  subtitle: const Text(
                      'Pay the seller directly when receiving or collecting goods'),
                  onTap: () =>
                      Navigator.pop(ctx, ShopperPaymentPreferenceStore.cash)),
              ListTile(
                  leading: const Icon(Icons.credit_card_outlined),
                  title: const Text('Card at the shop'),
                  subtitle: const Text(
                      'Available only for collection where the seller accepts cards'),
                  onTap: () => Navigator.pop(
                      ctx, ShopperPaymentPreferenceStore.cardAtShop)),
              ListTile(
                  leading: const Icon(Icons.credit_card_rounded),
                  title: const Text('Pay online by card'),
                  subtitle: const Text(
                      'When the seller enables online payments and is ready to receive them. Pay securely after the seller confirms.'),
                  onTap: () => Navigator.pop(
                      ctx, ShopperPaymentPreferenceStore.cardOnline)),
              const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                      'Your preference is checked against each seller’s options at checkout. Card details stay with the secure payment provider.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12))),
            ]))));
    if (selected == null || !mounted || uid != widget.session.userId) return;
    try {
      await _payments.save(uid, selected);
      if (mounted) setState(() => paymentPreference = selected);
    } catch (_) {
      if (mounted)
        setState(() {
          status = 'Could not save your preferred payment method. Try again.';
          failure = true;
        });
    }
  }

  Future<void> verifyWithProvider(bool apple) async {
    if (working || widget.session.userId == null) return;
    if (apple) {
      final allowed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
                  title: const Text('Verify with Apple'),
                  content: const Text(
                      'Your Apple ID will be securely linked to this existing Teyza account. Apple may provide a private relay email. Your saved contact email will remain unverified if it differs from that Apple address.'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Continue'))
                  ]));
      if (allowed != true || !mounted) return;
    }
    setState(() {
      working = true;
      status = null;
      failure = false;
    });
    final uid = widget.session.userId;
    try {
      if (apple) {
        await widget.session.verifyShopperWithApple();
      } else {
        await widget.session.verifyShopperWithGoogle();
      }
      if (!mounted || uid != widget.session.userId) return;
      setState(() {
        status = contactEmailVerified
            ? 'Your saved email is verified.'
            : 'Your Google/Apple account is linked. The saved contact email is not verified because it differs from the provider email. You can edit it using Saved delivery details.';
        failure = false;
      });
    } catch (e) {
      if (mounted)
        setState(() {
          status = authMessage(e);
          failure = true;
        });
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> openTerms() async {
    final url = Uri.parse('https://teyza.co.za/terms.html');
    try {
      if (!await launchUrl(url, mode: LaunchMode.externalApplication))
        throw StateError('Could not open terms');
    } catch (_) {
      if (mounted)
        setState(() {
          status = 'Terms could not be opened. Visit teyza.co.za/terms.html';
          failure = true;
        });
    }
  }

  @override
  void dispose() {
    widget.session.removeListener(_sessionChanged);
    email.dispose();
    password.dispose();
    name.dispose();
    super.dispose();
  }

  // Legacy email/password is supported for SIGN IN only. New shoppers and
  // sellers create Firebase accounts through social identity providers.
  Future<void> submit() async {
    if (registering) return;
    if (status != null || failure)
      setState(() {
        status = null;
        failure = false;
      });
    if (!formKey.currentState!.validate()) return;
    setState(() {
      working = true;
      status = null;
      failure = false;
    });
    try {
      await widget.session.signIn(email.text, password.text);
      password.clear();
      if (!mounted) return;
      setState(() {
        status = 'Welcome back to Teyza!';
        failure = false;
      });
      completedSignIn();
    } catch (error) {
      if (mounted)
        setState(() {
          status = authMessage(error);
          failure = true;
        });
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> googleLogin() async {
    setState(() {
      working = true;
      status = null;
      failure = false;
    });
    try {
      await widget.session.signInWithGoogle();
      if (mounted)
        setState(() {
          status =
              widget.session.idToken != null && !widget.session.anonymousShopper
                  ? 'Welcome to Teyza!'
                  : 'Google sign-in cancelled.';
          failure = false;
        });
      completedSignIn();
    } catch (e) {
      if (mounted)
        setState(() {
          status = authMessage(e);
          failure = true;
        });
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> appleLogin() async {
    setState(() {
      working = true;
      status = null;
      failure = false;
    });
    try {
      await widget.session.signInWithApple();
      if (!mounted) return;
      if (widget.session.idToken != null) {
        completedSignIn();
      } else {
        setState(() => status = 'Apple sign-in cancelled.');
      }
    } catch (error) {
      if (mounted)
        setState(() {
          status = authMessage(error);
          failure = true;
        });
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> facebookLogin() async {
    setState(() {
      working = true;
      status = null;
      failure = false;
    });
    try {
      await widget.session.signInWithFacebook();
      if (!mounted) return;
      if (widget.session.idToken != null && !widget.session.anonymousShopper) {
        completedSignIn();
      } else {
        setState(() => status = 'Facebook sign-in cancelled.');
      }
    } catch (error) {
      if (mounted)
        setState(() {
          status = authMessage(error);
          failure = true;
        });
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> reset() async {
    if (!email.text.contains('@')) {
      setState(() {
        status = 'Enter your email above first.';
        failure = true;
      });
      return;
    }
    setState(() {
      working = true;
      status = null;
    });
    try {
      await widget.session.resetPassword(email.text);
      if (mounted)
        setState(() {
          status =
              'If the email is registered, a password reset message will arrive shortly.';
          failure = false;
        });
    } catch (error) {
      if (mounted)
        setState(() {
          status = authMessage(error);
          failure = true;
        });
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<void> openSupport() async {
    try {
      final sent = await launchUrl(Uri.parse('mailto:support@teyza.co.za'),
          mode: LaunchMode.externalApplication);
      if (!sent) throw StateError('Email unavailable');
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:
                Text('Email support@teyza.co.za for account assistance.')));
    }
  }

  Widget _accountGroup(List<Widget> children, {Key? key}) => Material(
      key: key,
      color: Colors.white,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: TeyzaDesign.border)),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children));

  Widget _heading(String title) => Padding(
      padding: const EdgeInsets.fromLTRB(2, 25, 2, 11),
      child: Text(title,
          style: const TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w700,
              color: TeyzaDesign.ink)));

  bool get _largeAccountText => MediaQuery.textScalerOf(context).scale(16) > 22;

  Widget _shortcut(
      String label, String detail, IconData icon, VoidCallback? onTap) {
    final text =
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label,
          style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: TeyzaDesign.ink)),
      const SizedBox(height: 3),
      Text(detail,
          style: const TextStyle(fontSize: 12, color: TeyzaDesign.muted)),
    ]);
    return Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(18),
            child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                    border: Border.all(color: TeyzaDesign.border),
                    borderRadius: BorderRadius.circular(18)),
                child: _largeAccountText
                    ? Row(children: [
                        Icon(icon, color: TeyzaDesign.forest, size: 25),
                        const SizedBox(width: 16),
                        Expanded(child: text),
                      ])
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            Icon(icon, color: TeyzaDesign.forest, size: 25),
                            const SizedBox(height: 12),
                            text,
                          ]))));
  }

  Widget _signedInDashboard() =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('My Teyza account',
            style: TextStyle(
                color: TeyzaDesign.muted,
                fontSize: 13,
                fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        Container(
            key: const ValueKey('teyza-premium-account-dashboard'),
            padding: const EdgeInsets.all(21),
            decoration: BoxDecoration(
                gradient: TeyzaDesign.brandGradient,
                borderRadius: BorderRadius.circular(24)),
            child:
                Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    const Text('Good to see you,',
                        style:
                            TextStyle(color: Color(0xFFC5E3D2), fontSize: 14)),
                    const SizedBox(height: 5),
                    Text(displayName,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 25,
                            fontWeight: FontWeight.w700,
                            height: 1.12)),
                    const SizedBox(height: 10),
                    Text(maskedHeaderPhone,
                        style: const TextStyle(
                            color: Color(0xFFC5E3D2), fontSize: 12)),
                  ])),
              if (!_largeAccountText) ...[
                const SizedBox(width: 16),
                CircleAvatar(
                    radius: 28,
                    backgroundColor: const Color(0xFF285A48),
                    child: Icon(
                        widget.session.phoneVerified
                            ? Icons.verified_user_outlined
                            : Icons.person_outline_rounded,
                        color: TeyzaDesign.mint,
                        size: 29)),
              ],
            ])),
        const SizedBox(height: 14),
        if (_largeAccountText) ...[
          _shortcut('My orders', 'Track your shopping',
              Icons.shopping_bag_outlined, widget.onOrders),
          const SizedBox(height: 12),
          _shortcut('Messages', 'Talk to your sellers',
              Icons.chat_bubble_outline_rounded, widget.onMessages),
        ] else
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
                child: _shortcut('My orders', 'Track your shopping',
                    Icons.shopping_bag_outlined, widget.onOrders)),
            const SizedBox(width: 12),
            Expanded(
                child: _shortcut('Messages', 'Talk to your sellers',
                    Icons.chat_bubble_outline_rounded, widget.onMessages)),
          ]),
        _heading('Shopping essentials'),
        _accountGroup([
          ListTile(
              leading: const Icon(Icons.location_on_outlined),
              title: const Text('Saved delivery address'),
              subtitle: Text(shopperProfile?.address ??
                  widget.savedDeliveryAddress ??
                  'Add an address when you are ready'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: widget.onChangeDeliveryAddress),
          const Divider(),
          ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: const Text('Payment method'),
              subtitle:
                  Text(ShopperPaymentPreferenceStore.label(paymentPreference)),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: working ? null : changePaymentMethod),
          if (widget.onBrowse != null) ...[
            const Divider(),
            ListTile(
                leading: const Icon(Icons.storefront_outlined),
                title: const Text('Browse shops'),
                subtitle: const Text('Find your next local favourite'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: widget.onBrowse),
          ],
        ]),
        _heading('Your details'),
        _accountGroup(key: const ValueKey('teyza-premium-account-settings'), [
          ListTile(
              leading: const Icon(Icons.badge_outlined),
              title: const Text('Display name'),
              subtitle: Text(displayName),
              trailing: const Icon(Icons.edit_outlined),
              onTap: widget.onChangeDeliveryAddress),
          const Divider(),
          ListTile(
              leading: const Icon(Icons.phone_outlined),
              title: const Text('Phone number'),
              subtitle: Text(displayPhone),
              trailing: const Icon(Icons.edit_outlined),
              onTap: widget.onChangeDeliveryAddress),
          const Divider(),
          ListTile(
              leading: const Icon(Icons.email_outlined),
              title: const Text('Email'),
              subtitle: Text(contactEmail),
              trailing: const Icon(Icons.edit_outlined),
              onTap: widget.onChangeDeliveryAddress),
          if (contactEmail == 'Not provided')
            const ListTile(
                leading: Icon(Icons.info_outline, color: Color(0xFF078E66)),
                title: Text('Contact email is optional'),
                subtitle: Text(
                    'You can browse and order without adding a separate contact email. Online payment requires a verified sign-in email for your receipt.'))
          else
            ListTile(
              leading: Icon(
                  contactEmailVerified
                      ? Icons.verified_user
                      : Icons.mark_email_unread_outlined,
                  color: contactEmailVerified
                      ? const Color(0xFF078E66)
                      : Colors.orange),
              title: Text(contactEmailVerified
                  ? 'Email verified'
                  : 'Email not verified'),
              subtitle: Text(contactEmailVerified
                  ? 'This contact email matches your verified Teyza identity.'
                  : widget.session.emailVerified
                      ? 'Your signed-in identity is verified, but its email differs from your saved contact email.'
                      : 'Link Google or Apple to verify your identity, or confirm your email using a verification link.'),
            ),
          if (widget.session.emailVerified &&
              !contactEmailVerified &&
              widget.session.email != null)
            ListTile(
                leading: const Icon(Icons.account_circle_outlined),
                title: const Text('Verified sign-in email'),
                subtitle: Text(widget.session.email!)),
          if (widget.session.phoneVerified)
            ListTile(
                leading: const Icon(Icons.verified_outlined,
                    color: Color(0xFF078E66)),
                title: const Text('Mobile number verified'),
                subtitle: Text(widget.session.phoneNumber ?? '')),
          if (contactEmail != 'Not provided' && !contactEmailVerified) ...[
            if (widget.session.googleSignInAvailable &&
                !widget.session.googleProviderLinked)
              OutlinedButton.icon(
                  onPressed: working ? null : () => verifyWithProvider(false),
                  icon: const Icon(Icons.account_circle_outlined),
                  label: const Text('Verify with Google')),
            if (widget.session.appleSignInAvailable &&
                !widget.session.appleProviderLinked)
              OutlinedButton.icon(
                  onPressed: working ? null : () => verifyWithProvider(true),
                  icon: const Icon(Icons.apple),
                  label: const Text('Verify with Apple')),
            if (widget.session.email != null &&
                !widget.session.emailVerified) ...[
              FilledButton.icon(
                  onPressed: working
                      ? null
                      : () async {
                          setState(() {
                            working = true;
                            status = null;
                            failure = false;
                          });
                          try {
                            await widget.session.sendEmailVerification();
                            if (mounted)
                              setState(() {
                                status =
                                    'Verification link sent. Check your inbox, then tap Check verification.';
                                failure = false;
                              });
                          } catch (e) {
                            if (mounted)
                              setState(() {
                                status = authMessage(e);
                                failure = true;
                              });
                          } finally {
                            if (mounted) setState(() => working = false);
                          }
                        },
                  icon: const Icon(Icons.mark_email_read_outlined),
                  label: const Text('Send verification email')),
              TextButton.icon(
                  onPressed: working
                      ? null
                      : () async {
                          setState(() {
                            working = true;
                            status = null;
                            failure = false;
                          });
                          try {
                            await widget.session.refreshEmailStatus();
                            if (mounted)
                              setState(() {
                                status = widget.session.emailVerified
                                    ? 'Your email has been verified.'
                                    : 'Not verified yet. Open the email link first.';
                                failure = !widget.session.emailVerified;
                              });
                          } catch (error) {
                            if (mounted)
                              setState(() {
                                status = authMessage(error);
                                failure = true;
                              });
                          } finally {
                            if (mounted) setState(() => working = false);
                          }
                        },
                  icon: const Icon(Icons.refresh),
                  label: const Text('Check verification status')),
            ],
          ],
        ]),
        _heading('Help & account'),
        _accountGroup(key: const ValueKey('teyza-account-support-menu'), [
          ListTile(
              leading: const Icon(Icons.help_outline_rounded),
              title: const Text('Get help'),
              subtitle: const Text('Contact Teyza support'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: openSupport),
          const Divider(),
          ListTile(
              leading: const Icon(Icons.description_outlined),
              title: const Text('Terms of Service'),
              trailing: const Icon(Icons.open_in_new_outlined),
              onTap: openTerms),
          const Divider(),
          ListTile(
              leading: const Icon(Icons.security_outlined),
              title: const Text('Privacy & security'),
              subtitle: const Text('Manage and delete your account'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: working
                  ? null
                  : () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => TeyzaDeleteAccountPage(
                              session: widget.session)))),
          const Divider(),
          ListTile(
              leading: const Icon(Icons.logout_rounded),
              title: const Text('Log out'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: working ? null : widget.session.signOut),
        ]),
        if (widget.session.hasAdminClaim && widget.session.emailVerified) ...[
          const SizedBox(height: 14),
          OutlinedButton.icon(
              onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) =>
                          SellerReviewPage(session: widget.session))),
              icon: const Icon(Icons.admin_panel_settings_outlined),
              label: const Text('Seller review desk')),
          OutlinedButton.icon(
              onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) =>
                          ChatModerationPage(session: widget.session))),
              icon: const Icon(Icons.flag_outlined),
              label: const Text('Chat moderation reports')),
        ],
      ]);

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: widget.session,
      builder: (context, child) {
        final logged =
            widget.session.idToken != null && !widget.session.anonymousShopper;
        return ColoredBox(
            color: TeyzaDesign.ivory,
            child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 36),
                children: [
                  if (!logged)
                    Container(
                        alignment: Alignment.center,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Column(children: [
                          // The official wordmark replaces the generic account
                          // avatar rather than adding another tall header row.
                          const TeyzaWordmark(width: 148),
                          const SizedBox(height: 8),
                          Text(
                              registering
                                  ? 'New to Teyza'
                                  : widget.signInReason ?? 'Sign in to Teyza',
                              style: const TextStyle(
                                  fontSize: 26, fontWeight: FontWeight.w900)),
                          const SizedBox(height: 6),
                          Text(
                              registering
                                  ? 'Choose shopper or seller to get started.'
                                  : widget.signInReason != null
                                      ? 'Your basket stays here while you sign in.'
                                      : 'Save your details, track orders and talk to sellers.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Color(0xFF60746B))),
                        ])),
                  if (!logged && widget.onBrowse != null)
                    TextButton.icon(
                        key: const ValueKey('teyza-continue-browsing'),
                        onPressed: working ? null : widget.onBrowse,
                        icon: const Icon(Icons.arrow_back_rounded, size: 18),
                        label: const Text('Continue browsing')),
                  if (!widget.session.isReady)
                    const Center(child: CircularProgressIndicator())
                  else if (!logged && registering && audience == null) ...[
                    TeyzaRegistrationOptions(
                        onSelected: registrationSelected,
                        onBusinessTypeSelected: (type) =>
                            widget.session.requestedBusinessType = type),
                    TextButton(
                        onPressed: () => setState(() {
                              registering = false;
                              widget.session.requestedRegistrationRole = null;
                              widget.session.requestedSellerCategory = null;
                            }),
                        child: const Text('Already on Teyza? Sign in')),
                  ] else if (logged) ...[
                    _signedInDashboard(),
                  ] else ...[
                    if (registering)
                      Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                              onPressed: working
                                  ? null
                                  : () => setState(() {
                                        audience = null;
                                        widget.session.requestedSellerCategory =
                                            null;
                                        widget.session
                                            .requestedRegistrationRole = null;
                                        status = null;
                                      }),
                              icon: const Icon(Icons.arrow_back_rounded,
                                  size: 18),
                              label: const Text('Change registration type'))),
                    const SizedBox(height: 12),
                    Container(
                        key: const ValueKey('teyza-social-login-card'),
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(color: const Color(0xFFDFE9E8)),
                            boxShadow: const [
                              BoxShadow(
                                  color: Color(0x0D103C31),
                                  blurRadius: 16,
                                  offset: Offset(0, 7))
                            ]),
                        child: Form(
                            key: formKey,
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Container(
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                          color: ownerMode
                                              ? const Color(0xFFE8EEFC)
                                              : const Color(0xFFE1F6EB),
                                          borderRadius:
                                              BorderRadius.circular(14)),
                                      child: Row(children: [
                                        Icon(
                                            ownerMode
                                                ? Icons.storefront_outlined
                                                : Icons
                                                    .shopping_basket_outlined,
                                            color: ownerMode
                                                ? const Color(0xFF234DB9)
                                                : const Color(0xFF078E66)),
                                        const SizedBox(width: 10),
                                        Expanded(
                                            child: Text(
                                                registering
                                                    ? (ownerMode
                                                        ? 'Business owner registration'
                                                        : 'Shopper registration')
                                                    : signInAudience == 'seller'
                                                        ? 'Business owner sign-in'
                                                        : 'Shopper sign-in',
                                                style: TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    color: ownerMode
                                                        ? const Color(
                                                            0xFF234DB9)
                                                        : const Color(
                                                            0xFF078E66))))
                                      ])),
                                  if (!registering) ...[
                                    const SizedBox(height: 14),
                                    const Text('Continue as',
                                        style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                            color: Color(0xFF254D44))),
                                    const SizedBox(height: 8),
                                    Wrap(spacing: 9, runSpacing: 9, children: [
                                      ChoiceChip(
                                          key: const ValueKey(
                                              'teyza-login-shopper'),
                                          avatar: const Icon(
                                              Icons.shopping_basket_outlined,
                                              size: 18),
                                          label: const Text('Shopper'),
                                          selected: signInAudience == 'shopper',
                                          onSelected: working
                                              ? null
                                              : (_) => setState(() =>
                                                  signInAudience = 'shopper')),
                                      ChoiceChip(
                                          key: const ValueKey(
                                              'teyza-login-business-owner'),
                                          avatar: const Icon(
                                              Icons.storefront_outlined,
                                              size: 18),
                                          label: const Text('Business owner'),
                                          selected: signInAudience == 'seller',
                                          onSelected: working
                                              ? null
                                              : (_) => setState(() =>
                                                  signInAudience = 'seller')),
                                    ]),
                                    if (signInAudience == 'seller')
                                      const Padding(
                                          padding: EdgeInsets.only(top: 8),
                                          child: Text(
                                              'Spaza shops, mini markets, salons, small businesses, services and wholesalers. One secure sign-in; your approved accounts determine access.',
                                              style: TextStyle(
                                                  color: Color(0xFF56746B),
                                                  fontSize: 12,
                                                  height: 1.4))),
                                  ],
                                  const SizedBox(height: 12),
                                  const Text('Choose a secure sign-in method',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          color: Color(0xFF60746B))),
                                  if (!registering && showLegacyEmail) ...[
                                    TextFormField(
                                        controller: email,
                                        keyboardType:
                                            TextInputType.emailAddress,
                                        autofillHints: const [
                                          AutofillHints.email
                                        ],
                                        decoration: const InputDecoration(
                                            labelText: 'Email address',
                                            prefixIcon:
                                                Icon(Icons.email_outlined),
                                            border: OutlineInputBorder()),
                                        validator: (v) =>
                                            v == null || !v.trim().contains('@')
                                                ? 'Enter a valid email'
                                                : null),
                                    const SizedBox(height: 12),
                                    TextFormField(
                                        controller: password,
                                        obscureText: hidden,
                                        autofillHints: const [
                                          AutofillHints.password
                                        ],
                                        decoration: InputDecoration(
                                            labelText: 'Password',
                                            prefixIcon:
                                                const Icon(Icons.lock_outline),
                                            border: const OutlineInputBorder(),
                                            suffixIcon: IconButton(
                                                onPressed: () => setState(
                                                    () => hidden = !hidden),
                                                icon: Icon(hidden
                                                    ? Icons.visibility_outlined
                                                    : Icons
                                                        .visibility_off_outlined))),
                                        validator: (v) =>
                                            v == null || v.length < 6
                                                ? 'Use at least 6 characters'
                                                : null),
                                    const SizedBox(height: 18),
                                    SizedBox(
                                        width: double.infinity,
                                        child: FilledButton(
                                            onPressed: working ? null : submit,
                                            style: FilledButton.styleFrom(
                                                padding:
                                                    const EdgeInsets.all(16)),
                                            child: Text(working
                                                ? 'Please wait…'
                                                : 'Sign in'))),
                                    const SizedBox(height: 10),
                                    const Text(
                                        'Existing registered email accounts only.',
                                        style: TextStyle(
                                            fontSize: 12,
                                            color: Color(0xFF60746B))),
                                  ],
                                  if (widget.session.googleSignInAvailable) ...[
                                    const SizedBox(height: 12),
                                    SizedBox(
                                        width: double.infinity,
                                        child: OutlinedButton.icon(
                                            key: const ValueKey(
                                                'teyza-google-login'),
                                            style: OutlinedButton.styleFrom(
                                                backgroundColor: Colors.white,
                                                foregroundColor:
                                                    const Color(0xFF174EA6),
                                                side: const BorderSide(
                                                    color: Color(0xFFAAC4F8),
                                                    width: 1.5),
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        vertical: 16),
                                                shape: RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                            15))),
                                            onPressed:
                                                working ? null : googleLogin,
                                            icon: const Icon(
                                                Icons.g_mobiledata_rounded,
                                                size: 27),
                                            label: const Text(
                                                'Continue with Google',
                                                style: TextStyle(fontWeight: FontWeight.w800)))),
                                  ],
                                  if (widget.session.appleSignInAvailable) ...[
                                    const SizedBox(height: 12),
                                    SizedBox(
                                        width: double.infinity,
                                        child: FilledButton.icon(
                                            style: FilledButton.styleFrom(
                                                backgroundColor:
                                                    const Color(0xFF111827),
                                                foregroundColor: Colors.white,
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        vertical: 16),
                                                shape: RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                            15))),
                                            onPressed:
                                                working ? null : appleLogin,
                                            icon: const Icon(Icons.apple),
                                            label: const Text(
                                                'Continue with Apple'))),
                                  ],
                                  if (widget
                                      .session.facebookSignInAvailable) ...[
                                    const SizedBox(height: 12),
                                    SizedBox(
                                        width: double.infinity,
                                        child: FilledButton.icon(
                                            key: const ValueKey(
                                                'teyza-facebook-login'),
                                            style: FilledButton.styleFrom(
                                                backgroundColor:
                                                    const Color(0xFF1877F2),
                                                foregroundColor: Colors.white,
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        vertical: 16),
                                                shape: RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                            15))),
                                            onPressed:
                                                working ? null : facebookLogin,
                                            icon: const Icon(Icons.facebook),
                                            label: const Text(
                                                'Continue with Facebook',
                                                style: TextStyle(
                                                    fontWeight:
                                                        FontWeight.w800)))),
                                  ],
                                  const SizedBox(height: 7),
                                  if (registering)
                                    const Padding(
                                        padding: EdgeInsets.only(top: 12),
                                        child: Text(
                                            'Choose a provider above. Your name and phone can be saved after sign-in; a separate email confirmation is not required.',
                                            textAlign: TextAlign.center,
                                            style: TextStyle(
                                                color: Color(0xFF60746B),
                                                fontSize: 12))),
                                  const SizedBox(height: 12),
                                  Container(
                                      key: const ValueKey(
                                          'teyza-new-account-cta'),
                                      decoration: BoxDecoration(
                                          color: const Color(0xFFE5F7EF),
                                          borderRadius:
                                              BorderRadius.circular(17),
                                          border: Border.all(
                                              color: const Color(0xFFBAE7D0))),
                                      child: TextButton.icon(
                                          onPressed: working
                                              ? null
                                              : () => setState(() {
                                                    registering = !registering;
                                                    audience = null;
                                                    showLegacyEmail = false;
                                                    status = null;
                                                    widget.session
                                                            .requestedRegistrationRole =
                                                        null;
                                                    widget.session
                                                            .requestedSellerCategory =
                                                        null;
                                                    widget.session
                                                            .requestedBusinessType =
                                                        null;
                                                  }),
                                          icon: const Icon(
                                              Icons.person_add_alt_1_rounded,
                                              color: Color(0xFF078E66)),
                                          label: Text(
                                              registering
                                                  ? 'Already on Teyza? Sign in'
                                                  : 'New to Teyza? Get started for free',
                                              style: const TextStyle(
                                                  color: Color(0xFF087D5E),
                                                  fontWeight:
                                                      FontWeight.w800)))),
                                  if (ownerMode && registering)
                                    const Padding(
                                        padding: EdgeInsets.only(top: 8),
                                        child: Text(
                                            'After sign-in, complete your business type, identity checks and shop location.',
                                            textAlign: TextAlign.center,
                                            style: TextStyle(
                                                color: Color(0xFF60746B),
                                                fontSize: 12))),
                                  if (!registering)
                                    TextButton.icon(
                                        key: const ValueKey(
                                            'teyza-existing-email-toggle'),
                                        onPressed: working
                                            ? null
                                            : () => setState(() =>
                                                showLegacyEmail =
                                                    !showLegacyEmail),
                                        icon: Icon(
                                            showLegacyEmail
                                                ? Icons.expand_less
                                                : Icons.lock_outline,
                                            size: 17),
                                        label: Text(showLegacyEmail
                                            ? 'Hide existing email sign-in'
                                            : 'Already registered with email?')),
                                  if (!registering && showLegacyEmail)
                                    TextButton(
                                        onPressed: working ? null : reset,
                                        child: const Text('Forgot password?')),
                                ]))),
                  ],
                  // Successful sign-in clears prior provider errors. New account-setting
                  // failures must remain visible so the shopper can retry.
                  if (status != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Card(
                            color: failure
                                ? const Color(0xFFFFEDE8)
                                : const Color(0xFFE3F5EC),
                            child: Padding(
                                padding: const EdgeInsets.all(13),
                                child: Text(status!,
                                    style: TextStyle(
                                        color: failure
                                            ? Colors.red.shade900
                                            : const Color(0xFF087D5E)))))),
                  const SizedBox(height: 20),
                  const Text(
                      'Your account is private. Location is optional; '
                      'the app only uses it to find shops in your area.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF657B72), fontSize: 12))
                ]));
      });
}
