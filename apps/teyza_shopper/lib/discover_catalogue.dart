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
  const DiscoverCataloguePage({
    super.key, this.loader, required this.onEnquire,
    this.businesses, this.areaLabel, this.onChooseArea,
    this.onRefreshBusinesses, this.loadingBusinesses = false,
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
  late bool browsingBusinesses;
  String businessCategory = 'all';

  @override
  void initState() {
    super.initState();
    browsingBusinesses = widget.businesses != null;
    load();
  }

  void switchView(bool businesses) {
    if (browsingBusinesses == businesses) return;
    setState(() {
      browsingBusinesses = businesses;
      selectedCategory = null;
      businessCategory = 'all';
      search.clear();
    });
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
    if (browsingBusinesses) {
      if (businessCategory == 'all' && search.text.isEmpty) return false;
      setState(() { businessCategory = 'all'; search.clear(); });
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
                key: const ValueKey('discover-businesses-tab'),
                label: const Text('Businesses & services'),
                selected: browsingBusinesses,
                onSelected: (_) => switchView(true)),
              ChoiceChip(
                key: const ValueKey('discover-products-tab'),
                label: const Text('Products'),
                selected: !browsingBusinesses,
                onSelected: (_) => switchView(false)),
            ]),
          ],
          const SizedBox(height: 17),
          TextField(key: const ValueKey('discover-search'), controller: search,
            onChanged: (_) => setState(() {}),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: browsingBusinesses
                ? 'Search businesses and services'
                : 'Search products and brands',
              prefixIcon: const Icon(Icons.search, color: ink),
              suffixIcon: query.isEmpty ? null : IconButton(tooltip: 'Clear search',
                onPressed: () => setState(search.clear), icon: const Icon(Icons.close)),
              filled: true, fillColor: const Color(0xFFF7F8FB),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(17),
                borderSide: BorderSide.none))),
        ])),
      Expanded(child: browsingBusinesses
        ? TeyzaDiscoverBusinesses(
            businesses: widget.businesses ?? const <DiscoverBusiness>[],
            areaLabel: widget.areaLabel,
            query: query,
            category: businessCategory,
            loading: widget.loadingBusinesses,
            onChooseArea: widget.onChooseArea,
            onRefresh: widget.onRefreshBusinesses,
            onCategorySelected: (value) =>
                setState(() => businessCategory = value))
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
