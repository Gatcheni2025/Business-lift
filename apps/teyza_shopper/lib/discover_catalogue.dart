import 'package:flutter/material.dart';
import 'product_catalogue.dart';
import 'discover_businesses.dart';

String discoverCategoryLabel(String category) => switch (category) {
  'Baby Care' => 'Baby',
  'Personal Care' => 'Beauty & Personal Care',
  'Drinks' => 'Beverages, Juices & Cordials',
  'Tea & Coffee' => 'Coffee, Tea & Hot Drinks',
  'Household' => 'Cleaning & Household',
  'Meat' => 'Meat & Chilled Foods',
  'General Goods' => 'Everyday Essentials',
  _ => category,
};

/// A reference catalogue. A category or product never asserts shop inventory.
class DiscoverCataloguePage extends StatefulWidget {
  final Future<List<CatalogueProduct>> Function()? loader;
  final ValueChanged<CatalogueProduct> onEnquire;
  final List<DiscoverBusiness>? businesses;
  final String? areaLabel;
  final VoidCallback? onChooseArea;
  final Future<void> Function()? onRefreshBusinesses;
  final bool loadingBusinesses;
  final String initialSection, initialGroup, initialSubcategory;
  final void Function(String, String, String)? onDiscoveryChanged;
  const DiscoverCataloguePage({
    super.key, this.loader, required this.onEnquire,
    this.businesses, this.areaLabel, this.onChooseArea,
    this.onRefreshBusinesses, this.loadingBusinesses = false,
    this.initialSection = 'shops', this.initialGroup = 'all',
    this.initialSubcategory = 'all', this.onDiscoveryChanged,
  });
  @override
  State<DiscoverCataloguePage> createState() => DiscoverCataloguePageState();
}

class DiscoverCataloguePageState extends State<DiscoverCataloguePage> {
  static const ink = Color(0xFF202B35), green = Color(0xFF078E66);
  final search = TextEditingController();
  List<CatalogueProduct> products = [];
  String? selectedCategory, error;
  bool loading = true;
  late String section, businessCategory, businessSubcategory;
  bool get browsingDirectory => section != 'products';
  bool get browsingShops => section == 'shops';

  @override
  void initState() {
    super.initState();
    section = widget.businesses == null ? 'products' : widget.initialSection;
    businessCategory = section == 'shops' ? 'spaza' : widget.initialGroup;
    businessSubcategory = widget.initialSubcategory;
    load();
  }

  void reportDiscovery() =>
    widget.onDiscoveryChanged?.call(section, businessCategory, businessSubcategory);

  void switchView(String next) {
    if (section == next) return;
    setState(() {
      section = next;
      selectedCategory = null;
      businessCategory = next == 'shops' ? 'spaza' : 'all';
      businessSubcategory = 'all';
      search.clear();
    });
    reportDiscovery();
  }

  void selectBusinessGroup(String value) {
    setState(() {
      businessCategory = value;
      businessSubcategory = 'all';
    });
    reportDiscovery();
  }

  void selectBusinessSubcategory(String value) {
    setState(() => businessSubcategory = value);
    reportDiscovery();
  }
  @override
  void dispose() { search.dispose(); super.dispose(); }

  Future<void> load() async {
    setState(() { loading = true; error = null; });
    try {
      final result = await (widget.loader ?? ProductCatalogue.load)();
      if (mounted) setState(() => products = result);
    } catch (_) {
      if (mounted) setState(() => error = 'The product guide could not be opened. Please try again.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  bool backToCategories() {
    if (browsingDirectory) {
      if (businessSubcategory == 'all' &&
          (browsingShops || businessCategory == 'all') &&
          search.text.isEmpty) return false;
      setState(() {
        if (search.text.isNotEmpty) {
          search.clear();
        } else if (businessSubcategory != 'all') {
          businessSubcategory = 'all';
        } else if (!browsingShops) {
          businessCategory = 'all';
        }
      });
      reportDiscovery();
    } else {
      if (selectedCategory == null && search.text.isEmpty) return false;
      setState(() { selectedCategory = null; search.clear(); });
    }
    FocusScope.of(context).unfocus();
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final query = search.text.trim();
    final categories = products.map((p) => p.category).toSet().toList()
      ..sort((a, b) => discoverCategoryLabel(a).compareTo(discoverCategoryLabel(b)));
    final items = products.where((p) => p.matches(query, selectedCategory ?? 'All')).toList();
    final showCategories = selectedCategory == null && query.isEmpty;
    return ColoredBox(color: const Color(0xFFEEF1F5), child: Column(children: [
      Container(color: ink, padding: const EdgeInsets.fromLTRB(16, 20, 16, 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Discover', style: TextStyle(fontSize: 29,
            fontWeight: FontWeight.w900, color: Colors.white)),
          const SizedBox(height: 5),
          Text(widget.businesses != null
              ? 'Find local businesses, fast food, services and products'
              : 'Explore everyday essentials',
            style: const TextStyle(color: Color(0xFFCED9E0), fontSize: 13)),
          if (widget.businesses != null) ...[
            const SizedBox(height: 13),
            Wrap(spacing: 9, runSpacing: 7, children: [
              ChoiceChip(
                key: const ValueKey('discover-shops-tab'),
                label: const Text('Shops'),
                selected: section != 'businesses',
                onSelected: (_) => switchView('shops')),
              ChoiceChip(
                key: const ValueKey('discover-businesses-tab'),
                label: const Text('Businesses'),
                selected: section == 'businesses',
                onSelected: (_) => switchView('businesses')),
            ]),
          ],
          if (widget.businesses != null && section != 'businesses') ...[
            const SizedBox(height: 6),
            Wrap(spacing: 8, children: [
              TextButton(onPressed: () => switchView('shops'),
                key: const ValueKey('discover-nearby-shops-tab'),
                child: Text('Nearby shops', style: TextStyle(
                  color: browsingShops ? Colors.white : const Color(0xFFCED9E0),
                  fontWeight: browsingShops ? FontWeight.w800 : FontWeight.w400))),
              TextButton(onPressed: () => switchView('products'),
                key: const ValueKey('discover-products-tab'),
                child: Text('Products', style: TextStyle(
                  color: section == 'products' ? Colors.white : const Color(0xFFCED9E0),
                  fontWeight: section == 'products' ? FontWeight.w800 : FontWeight.w400))),
            ]),
          ],
          const SizedBox(height: 14),
          TextField(key: const ValueKey('discover-search'), controller: search,
            onChanged: (_) => setState(() {}),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: browsingDirectory
                ? (browsingShops ? 'Search nearby shops' : 'Search businesses, products and services')
                : 'Search products and brands',
              prefixIcon: const Icon(Icons.search, color: ink),
              suffixIcon: query.isEmpty ? null : IconButton(tooltip: 'Clear search',
                onPressed: () => setState(search.clear), icon: const Icon(Icons.close)),
              filled: true, fillColor: const Color(0xFFF7F8FB),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(17),
                borderSide: BorderSide.none))),
        ])),
      Expanded(child: browsingDirectory
        ? TeyzaDiscoverBusinesses(
            businesses: widget.businesses ?? const <DiscoverBusiness>[],
            areaLabel: widget.areaLabel,
            query: query,
            category: businessCategory,
            subcategory: businessSubcategory,
            shopsOnly: browsingShops,
            loading: widget.loadingBusinesses,
            onChooseArea: widget.onChooseArea,
            onRefresh: widget.onRefreshBusinesses,
            onCategorySelected: selectBusinessGroup,
            onSubcategorySelected: selectBusinessSubcategory)
        : loading
        ? const Center(child: CircularProgressIndicator())
        : error != null
          ? Center(child: Padding(padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text(error!, textAlign: TextAlign.center), const SizedBox(height: 12),
                FilledButton(onPressed: load, child: const Text('Try again')),
              ])))
          : showCategories
            ? ListView.separated(key: const PageStorageKey('discover-categories'),
                padding: const EdgeInsets.fromLTRB(15, 15, 15, 26),
                itemCount: categories.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final category = categories[index];
                  final sample = products.firstWhere((p) => p.category == category);
                  return Material(color: Colors.white, borderRadius: BorderRadius.circular(20),
                    child: ListTile(key: ValueKey('discover-category-$category'),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 10),
                      leading: CataloguePhoto(photoKey: sample.photo, size: 48),
                      title: Text(discoverCategoryLabel(category),
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: ink)),
                      trailing: const Icon(Icons.chevron_right, size: 29, color: ink),
                      onTap: () => setState(() => selectedCategory = category)));
                })
            : ListView.builder(key: PageStorageKey('discover-products-${selectedCategory ?? 'search'}'),
                padding: const EdgeInsets.fromLTRB(15, 10, 15, 26),
                itemCount: items.length + 1,
                itemBuilder: (context, index) {
                  if (index == 0) return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    TextButton.icon(onPressed: backToCategories,
                      icon: const Icon(Icons.arrow_back), label: const Text('All categories')),
                    Text(selectedCategory == null ? 'Product guide' : discoverCategoryLabel(selectedCategory!),
                      style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w900, color: ink)),
                    const SizedBox(height: 7),
                    const Text('Reference photos and product types. Ask a shop to confirm availability, brand and price.',
                      style: TextStyle(fontSize: 13, color: Color(0xFF63747A), height: 1.4)),
                    const SizedBox(height: 14),
                    if (items.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 24),
                      child: Text('No guide products match your search. Try another name or category.')),
                  ]);
                  final product = items[index - 1];
                  return Padding(padding: const EdgeInsets.only(bottom: 11),
                    child: Material(color: Colors.white, borderRadius: BorderRadius.circular(20),
                      child: InkWell(key: ValueKey('discover-product-${product.id}'),
                        borderRadius: BorderRadius.circular(20),
                        onTap: () => widget.onEnquire(product),
                        child: Padding(padding: const EdgeInsets.all(14), child: Row(children: [
                          CataloguePhoto(photoKey: product.photo, size: 65),
                          const SizedBox(width: 14),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(product.name, style: const TextStyle(fontSize: 16,
                              fontWeight: FontWeight.w800, color: ink)),
                            const SizedBox(height: 7),
                            const Text('Ask a shop', style: TextStyle(color: green,
                              fontWeight: FontWeight.w800, fontSize: 13)),
                          ])),
                          const SizedBox(width: 5), const Icon(Icons.chevron_right, color: green),
                        ])))));
                })),
    ]));
  }
}
