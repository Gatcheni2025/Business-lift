import 'package:flutter/material.dart';
import 'business_categories.dart';

/// A public listing is either an approved Teyza seller or a third-party map
/// result. Discovery never grants selling or wholesale account permissions.
class DiscoverBusiness {
  final String id, name, area, shopCategory, businessType, details, origin;
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
    this.origin = '',
    this.verified = false,
  });

  (String, String) get classification => teyzaDiscoveryClassification(
    shopCategory: shopCategory, businessType: businessType,
    placeTypes: placeTypes, name: name,
  );
  String get group => classification.$1;
  String get subcategory => classification.$2;

  bool matches(String query, String category, [String speciality = 'all']) {
    if (category != 'all' && category != group) return false;
    if (speciality != 'all' && speciality != subcategory) return false;
    if (query.trim().isEmpty) return true;
    final searchable = [
      name, area, details, shopCategory, businessType,
      teyzaTypeFor(businessType)?.label ?? '',
      teyzaDiscoveryCategoryLabel(group),
      teyzaDiscoveryCategoryLabel(subcategory),
      ...placeTypes,
    ].join(' ').toLowerCase().replaceAll('_', ' ');
    return query.trim().toLowerCase().split(RegExp(r'\s+'))
      .every(searchable.contains);
  }
}

/// Shared category icons for the Home, Discover and registration journeys.
IconData teyzaDiscoveryIcon(String group) => switch (group) {
  'spaza' => Icons.storefront_outlined,
  'manufacturing' => Icons.factory_outlined,
  'retail' => Icons.shopping_bag_outlined,
  'food' => Icons.restaurant_outlined,
  'beauty' => Icons.spa_outlined,
  'home' => Icons.home_repair_service_outlined,
  'auto' => Icons.directions_car_outlined,
  'professional' => Icons.business_center_outlined,
  'logistics' => Icons.local_shipping_outlined,
  'events' => Icons.event_outlined,
  'wholesale' => Icons.inventory_2_outlined,
  'all' => Icons.apps_rounded,
  _ => Icons.handyman_outlined,
};

/// Two separate directories with a consistent group → speciality taxonomy.
/// Keep the category controls in the scrollable header, and lazily build
/// public listing rows rather than eagerly laying out every business.
class TeyzaDiscoverBusinesses extends StatelessWidget {
  final List<DiscoverBusiness> businesses;
  final String? areaLabel;
  final String category, subcategory, query;
  final bool shopsOnly, loading;
  final VoidCallback? onChooseArea;
  final ValueChanged<String> onCategorySelected, onSubcategorySelected;
  final Future<void> Function()? onRefresh;

  const TeyzaDiscoverBusinesses({
    super.key, required this.businesses, required this.category,
    required this.subcategory, required this.query, required this.shopsOnly,
    required this.onCategorySelected, required this.onSubcategorySelected,
    this.areaLabel, this.loading = false, this.onChooseArea, this.onRefresh,
  });

  static const ink = Color(0xFF202B35), green = Color(0xFF078E66);

  Widget _chip(String id, String label, bool selected, VoidCallback select) =>
      ChoiceChip(
        key: ValueKey('discover-business-subcategory-' + id),
        label: Text(label),
        selected: selected, showCheckmark: false, selectedColor: green,
        labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
          color: selected ? Colors.white : ink),
        onSelected: (_) => select(),
      );

  @override
  Widget build(BuildContext context) {
    final available = businesses.where((b) =>
      shopsOnly ? b.group == 'spaza' : b.group != 'spaza');
    final group = shopsOnly ? 'spaza' : category;
    final results = available.where((b) =>
      b.matches(query, group, subcategory)).toList();
    final selected = teyzaDiscoveryCategoryFor(group);
    final atBusinessRoot = !shopsOnly && group == 'all';
    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(shopsOnly ? 'Shop in your community' : 'Explore businesses',
          style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w900, color: ink)),
        const SizedBox(height: 5),
        Text(areaLabel == null
            ? 'Choose your area to discover nearby listings.'
            : (shopsOnly ? 'Spaza shops and groceries near ' :
              'Manufacturers, sellers and services near ') + areaLabel! + '.',
          style: const TextStyle(fontSize: 12, color: Color(0xFF63747A))),
        if (onChooseArea != null)
          Align(alignment: Alignment.centerLeft, child: TextButton.icon(
            key: const ValueKey('discover-choose-area'),
            onPressed: onChooseArea,
            icon: const Icon(Icons.location_on_outlined),
            label: Text(areaLabel == null ? 'Choose an area' : 'Change area'))),
        const SizedBox(height: 12),
        if (atBusinessRoot)
          LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth > 620;
              final columns = wide ? 3 : 2;
              final width = (constraints.maxWidth - 9 * (columns - 1)) / columns;
              return Wrap(
                key: const ValueKey('discover-business-categories'),
                spacing: 9, runSpacing: 9,
                children: [
                  for (final option in teyzaDiscoveryCategories)
                    if (option.id != 'all' && option.id != 'spaza')
                      SizedBox(width: width, child: Material(
                        color: Colors.white, borderRadius: BorderRadius.circular(14),
                        child: InkWell(
                          key: ValueKey('discover-business-category-' + option.id),
                          borderRadius: BorderRadius.circular(14),
                          onTap: () => onCategorySelected(option.id),
                          child: Padding(padding: const EdgeInsets.all(11),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(teyzaDiscoveryIcon(option.id), color: green, size: 25),
                                const SizedBox(height: 8),
                                Text(option.label, style: const TextStyle(
                                  fontSize: 13, fontWeight: FontWeight.w800, color: ink)),
                                const SizedBox(height: 4),
                                Text(option.children.take(2).map((c) => c.label).join(' · '),
                                  maxLines: 2, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 10, color: Color(0xFF63747A))),
                              ])),
                        ),
                      )),
                ],
              );
            })
        else ...[
          if (!shopsOnly)
            Align(alignment: Alignment.centerLeft, child: TextButton.icon(
              key: const ValueKey('discover-business-category-all'),
              onPressed: () => onCategorySelected('all'),
              icon: const Icon(Icons.arrow_back),
              label: const Text('All business categories'))),
          Text(selected?.label ?? 'Categories', style: const TextStyle(
            fontSize: 18, fontWeight: FontWeight.w900, color: ink)),
          const SizedBox(height: 9),
          Wrap(
            key: const ValueKey('discover-business-categories'),
            spacing: 7, runSpacing: 7,
            children: [
              _chip('all', 'All', subcategory == 'all',
                () => onSubcategorySelected('all')),
              for (final option in selected?.children ?? const <TeyzaDiscoveryCategory>[])
                _chip(option.id, option.label, subcategory == option.id,
                  () => onSubcategorySelected(option.id)),
            ],
          ),
        ],
        const SizedBox(height: 18),
        Text(atBusinessRoot ? 'All nearby businesses' :
          (shopsOnly ? 'Nearby shops' : selected?.label ?? 'Businesses'),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: ink)),
        const SizedBox(height: 5),
        Text(results.length.toString() + (results.length == 1 ? ' listing' : ' listings'),
          style: const TextStyle(fontSize: 12, color: Color(0xFF63747A))),
        const SizedBox(height: 6),
        const Text('Teyza Verified means an approved seller. Public map listings are independent.',
          style: TextStyle(fontSize: 11, color: Color(0xFF63747A))),
        if (loading)
          const Padding(padding: EdgeInsets.all(20),
            child: Center(child: CircularProgressIndicator())),
        if (results.isEmpty && !loading)
          Padding(padding: const EdgeInsets.symmetric(vertical: 20),
            child: Text(areaLabel == null ? 'Choose an area to discover local listings.' :
              'No matching listings here yet. Try another category, search or area.',
              style: const TextStyle(color: Color(0xFF63747A)))),
      ],
    );
    final page = ListView.builder(
      key: PageStorageKey<String>(shopsOnly ? 'discover-shops' :
        'discover-businesses-' + group),
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(15, 15, 15, 28),
      itemCount: results.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) return header;
        final business = results[index - 1];
        return Padding(
          padding: const EdgeInsets.only(top: 9),
          child: Material(
            color: Colors.white, borderRadius: BorderRadius.circular(17),
            child: ListTile(
              key: ValueKey('discover-business-' + business.id),
              onTap: business.onOpen,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              leading: CircleAvatar(
                backgroundColor: const Color(0xFFE7F3EC),
                child: Icon(teyzaDiscoveryIcon(business.group), color: green)),
              title: Text(business.name, maxLines: 2, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w800, color: ink)),
              subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const SizedBox(height: 3),
                Text(teyzaDiscoveryCategoryLabel(business.subcategory) +
                    (business.area.isNotEmpty ? ' · ' + business.area : ''),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 3),
                Text(business.verified ? 'Teyza Verified' :
                  business.origin == 'google_places' ? 'Google Maps · Public map listing' :
                  business.origin == 'openstreetmap' ? 'OpenStreetMap · Public map listing' :
                  'Public directory listing',
                  style: TextStyle(color: business.verified ? green :
                    const Color(0xFF63747A), fontSize: 11, fontWeight: FontWeight.w700)),
              ]),
              trailing: const Icon(Icons.chevron_right_rounded),
            ),
          ),
        );
      },
    );
    return onRefresh == null ? page : RefreshIndicator(onRefresh: onRefresh!, child: page);
  }
}
