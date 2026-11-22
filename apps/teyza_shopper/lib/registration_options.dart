import 'package:flutter/material.dart';

/// Registration preferences only. Existing account records decide access.
class TeyzaRegistrationOptions extends StatefulWidget {
  final void Function(String role, String? category) onSelected;
  const TeyzaRegistrationOptions({super.key, required this.onSelected});
  @override
  State<TeyzaRegistrationOptions> createState() => _RegistrationOptionsState();
}

class _RegistrationOptionsState extends State<TeyzaRegistrationOptions> {
  bool seller = false;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(seller ? 'What type of business do you own?' : 'How will you use Teyza?',
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
      const SizedBox(height: 16),
      if (!seller) ...[
        option('shopper', Icons.shopping_basket_outlined, 'Shopper',
          'Find nearby shops, browse products and place orders.',
          () => widget.onSelected('shopper', null)),
        option('seller', Icons.storefront_outlined, 'Seller',
          'Register your spaza shop, business or wholesale store.',
          () => setState(() => seller = true)),
      ] else ...[
        option('spaza', Icons.storefront_outlined, 'Spaza shop owner',
          'Sell everyday products to your local community.',
          () => widget.onSelected('seller', 'spaza')),
        option('retail', Icons.business_center_outlined, 'Business owner',
          'Showcase your business and the services you offer.',
          () => widget.onSelected('seller', 'retail')),
        option('wholesale', Icons.inventory_2_outlined, 'Wholesaler',
          'Connect with shops and manage wholesale supply.',
          () => widget.onSelected('seller', 'wholesale')),
        TextButton.icon(onPressed: () => setState(() => seller = false),
          icon: const Icon(Icons.arrow_back), label: const Text('Shopper or seller')),
      ],
    ]);

  Widget option(String id, IconData icon, String title, String description,
    VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        child: ListTile(key: ValueKey('registration-$id'),
          contentPadding: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          leading: CircleAvatar(backgroundColor: id == 'wholesale'
            ? const Color(0xFFFFEBD2) : const Color(0xFFE1F6EB),
            child: Icon(icon, color: const Color(0xFF078E66))),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text(description),
          trailing: const Icon(Icons.chevron_right, color: Color(0xFF3BB77E)),
          onTap: onTap)));
}
