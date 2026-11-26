import 'package:flutter/material.dart';
import 'business_categories.dart';

/// A listing is either an approved public Teyza seller or a third-party map
/// result. The parent controls opening it; map results never get seller rights.
class DiscoverBusiness {
  final String id, name, area, shopCategory, businessType, details;
  final List<String> placeTypes;
  final bool verified;
  final VoidCallback onOpen;

  const DiscoverBusiness({
    required this.id,
    required this.name,
    required this.area,
    required this.shopCategory,
    required this.onOpen,
    this.businessType = '',
    this.placeTypes = const [],
    this.details = '',
    this.verified = false,
  });

  String get group => teyzaDiscoveryGroup(
    shopCategory: shopCategory,
    businessType: businessType,
    placeTypes: placeTypes,
    name: name,
  );

  bool matches(String query, String category) {
    if (category != 'all' && category != group) return false;
    if (query.trim().isEmpty) return true;
    return [
      name, area, businessType, details, shopCategory,
      teyzaDiscoveryCategoryLabel(group), ...placeTypes,
    ].join(' ').toLowerCase().contains(query.trim().toLowerCase());
  }
}

/// Category-based discovery for all public shop categories. No product pricing,
/// merchant verification or live service availability is inferred from Places.
class TeyzaDiscoverBusinesses extends StatelessWidget {
  final List<DiscoverBusiness> businesses;
  final String? areaLabel;
  final String category, query;
  final bool loading;
  final VoidCallback? onChooseArea;
  final ValueChanged<String> onCategorySelected;
  final Future<void> Function()? onRefresh;

  const TeyzaDiscoverBusinesses({
    super.key,
    required this.businesses,
    required this.category,
    required this.query,
    required this.onCategorySelected,
    this.areaLabel,
    this.loading = false,
    this.onChooseArea,
    this.onRefresh,
  });

  IconData _icon(String group) => switch (group) {
    'spaza' => Icons.storefront_outlined,
    'food' => Icons.restaurant_outlined,
    'retail' => Icons.shopping_bag_outlined,
    'beauty' => Icons.spa_outlined,
    'home' => Icons.home_repair_service_outlined,
    'auto' => Icons.directions_car_outlined,
    'wholesale' => Icons.inventory_2_outlined,
    _ => Icons.handyman_outlined,
  };

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF202B35), green = Color(0xFF078E66);
    final results = businesses.where((b) => b.matches(query, category)).toList();
    final page = ListView(
      key: const PageStorageKey<String>('discover-businesses'),
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(15, 15, 15, 28),
      children: [
        const Text('Explore local businesses',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: ink)),
        const SizedBox(height: 5),
        Text(areaLabel == null
            ? 'Choose your area to see shops, food and services nearby.'
            : 'Shops, food, services and wholesalers near ' + areaLabel! + '.',
          style: const TextStyle(fontSize: 12, color: Color(0xFF63747A))),
        if (areaLabel == null && onChooseArea != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: OutlinedButton.icon(
              key: const ValueKey('discover-choose-area'),
              onPressed: onChooseArea,
              icon: const Icon(Icons.location_on_outlined),
              label: const Text('Choose an area'),
            )),
        const SizedBox(height: 14),
        Wrap(
          key: const ValueKey('discover-business-categories'),
          spacing: 7, runSpacing: 7,
          children: [
            for (final option in teyzaDiscoveryCategories)
              ChoiceChip(
                key: ValueKey('discover-business-category-' + option.id),
                avatar: Icon(_icon(option.id), size: 17,
                  color: category == option.id ? Colors.white : ink),
                label: Text(option.label),
                selected: category == option.id,
                showCheckmark: false,
                selectedColor: green,
                labelStyle: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700,
                  color: category == option.id ? Colors.white : ink),
                onSelected: (_) => onCategorySelected(option.id),
              ),
          ],
        ),
        const SizedBox(height: 15),
        Text(results.length.toString() +
            (results.length == 1 ? ' business' : ' businesses'),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: ink)),
        const SizedBox(height: 7),
        const Text(
          'Teyza Verified means an approved seller. Public map listings are independent businesses.',
          style: TextStyle(fontSize: 11, color: Color(0xFF63747A))),
        if (loading)
          const Padding(
            padding: EdgeInsets.all(22),
            child: Center(child: CircularProgressIndicator())),
        if (results.isEmpty && !loading)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Text(areaLabel == null
                ? 'Choose your area to discover businesses.'
                : 'No businesses match this category here yet. Try All businesses or another area.',
              style: const TextStyle(color: Color(0xFF63747A)))),
        for (final business in results)
          Padding(
            padding: const EdgeInsets.only(top: 9),
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(17),
              child: ListTile(
                key: ValueKey('discover-business-' + business.id),
                onTap: business.onOpen,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(17)),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 7),
                leading: CircleAvatar(
                  backgroundColor: const Color(0xFFE7F3EC),
                  child: Icon(_icon(business.group), color: green)),
                title: Text(business.name, maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800, color: ink)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 3),
                    Text(teyzaDiscoveryCategoryLabel(business.group) +
                        (business.area.isNotEmpty ? ' · ' + business.area : ''),
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 3),
                    Text(business.verified ? 'Teyza Verified' : 'Public map listing',
                      style: TextStyle(
                        color: business.verified ? green : const Color(0xFF63747A),
                        fontSize: 11, fontWeight: FontWeight.w700)),
                  ]),
                trailing: const Icon(Icons.chevron_right_rounded),
              ),
            ),
          ),
      ],
    );
    return onRefresh == null
        ? page
        : RefreshIndicator(onRefresh: onRefresh!, child: page);
  }
}
