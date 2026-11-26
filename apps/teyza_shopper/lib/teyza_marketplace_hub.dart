import 'package:flutter/material.dart';
import 'shopper_design.dart';

/// Compact entry points into distinct public catalogues. Wholesale discovery
/// remains separate from the shopper's retail basket and permissions.
class TeyzaMarketplaceHub extends StatelessWidget {
  final ValueChanged<String> onDestination;
  const TeyzaMarketplaceHub({super.key, required this.onDestination});

  Widget destination(String type, String name, String subtitle, IconData icon,
          {required Color background}) =>
      Semantics(
        button: true,
        label: 'Explore $name',
        child: Material(
            color: background,
            borderRadius: BorderRadius.circular(18),
            child: InkWell(
              key: ValueKey('teyza-hub-$type'),
              borderRadius: BorderRadius.circular(18),
              onTap: () => onDestination(type),
              child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Icon(icon, color: TeyzaDesign.forest, size: 25),
                          const Spacer(),
                          const Icon(Icons.north_east_rounded,
                              color: TeyzaDesign.muted, size: 15),
                        ]),
                        const SizedBox(height: 11),
                        Text(name,
                            style: const TextStyle(
                                color: TeyzaDesign.ink,
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                height: 1.2)),
                        const SizedBox(height: 4),
                        Text(subtitle,
                            style: const TextStyle(
                                color: TeyzaDesign.muted,
                                fontSize: 11,
                                height: 1.3)),
                      ])),
            )),
      );

  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, constraints) {
        final columns = MediaQuery.textScalerOf(context).scale(14) > 22 ? 1 : 2;
        final width = (constraints.maxWidth - 10 * (columns - 1)) / columns;
        return Wrap(
            key: const ValueKey('teyza-marketplace-hub'),
            spacing: 10,
            runSpacing: 10,
            children: [
              SizedBox(
                  width: width,
                  child: destination('spaza', 'Shops',
                      'Spaza shops, groceries & essentials', Icons.storefront_outlined,
                      background: const Color(0xFFEEF0E7))),
              SizedBox(
                  width: width,
                  child: destination('businesses', 'Businesses',
                      'Manufacturers, sellers, food & services', Icons.business_center_outlined,
                      background: const Color(0xFFF2EDE4))),
            ]);
      });
}

/// Catalogue filters contain no stock claims; product listings come from the
/// public server catalogue, never a seller's private draft inventory.
class TeyzaHomeProductCategories extends StatelessWidget {
  final ValueChanged<String> onSelect;
  const TeyzaHomeProductCategories({super.key, required this.onSelect});
  static const categories = <(String, IconData)>[
    ('Fruit & Veg', Icons.eco_outlined),
    ('Dairy & Eggs', Icons.egg_outlined),
    ('Pantry', Icons.kitchen_outlined),
    ('Bakery', Icons.bakery_dining_outlined),
    ('Drinks', Icons.local_drink_outlined),
    ('Snacks', Icons.cookie_outlined),
    ('Household', Icons.cleaning_services_outlined),
    ('Personal Care', Icons.spa_outlined),
  ];

  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, constraints) {
        final columns = MediaQuery.textScalerOf(context).scale(12) > 18 ? 3 : 4;
        final width = (constraints.maxWidth - 8 * (columns - 1)) / columns;
        return Wrap(
            key: const ValueKey('teyza-product-category-grid'),
            spacing: 8,
            runSpacing: 16,
            children: [
              for (final item in categories)
                SizedBox(
                  width: width,
                  child: Semantics(
                      button: true,
                      label: 'Shop ${item.$1} products',
                      child: InkWell(
                        key: ValueKey('product-category-${item.$1}'),
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => onSelect(item.$1),
                        child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                      width: 55,
                                      height: 55,
                                      decoration: BoxDecoration(
                                          color: Colors.white,
                                          border: Border.all(
                                              color: TeyzaDesign.border),
                                          borderRadius:
                                              BorderRadius.circular(18)),
                                      child: Icon(item.$2,
                                          color: TeyzaDesign.forest, size: 26)),
                                  const SizedBox(height: 7),
                                  Text(item.$1,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                          color: TeyzaDesign.ink,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 11,
                                          height: 1.25)),
                                ])),
                      )),
                ),
            ]);
      });
}
