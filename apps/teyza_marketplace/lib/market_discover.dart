import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'market_brand.dart';

typedef MarketAdd = void Function(String id, Map<String, dynamic> data);

/// A native interpretation of the uploaded TEYZA 2026 shopping homepage.
class MarketDiscoverScreen extends StatefulWidget {
  final MarketAdd onAddProduct;
  const MarketDiscoverScreen({super.key, required this.onAddProduct});
  @override
  State<MarketDiscoverScreen> createState() => _MarketDiscoverScreenState();
}

class _MarketDiscoverScreenState extends State<MarketDiscoverScreen> {
  final search = TextEditingController();
  String category = 'All', type = 'all';
  static const cats = [
    _Category('All', 'Explore all', Icons.apps_rounded, Color(0xFFE0F2EC)),
    _Category('groceries', 'Spaza shops', Icons.storefront_outlined, Color(0xFFE5F5EF)),
    _Category('food', 'Food & snacks', Icons.lunch_dining_outlined, Color(0xFFFFE8E1)),
    _Category('household', 'Home', Icons.home_outlined, Color(0xFFEEE8FB)),
    _Category('beauty', 'Beauty', Icons.spa_outlined, Color(0xFFFFE8F2)),
    _Category('fashion', 'Fashion', Icons.checkroom_outlined, Color(0xFFE9EDFC)),
    _Category('electronics', 'Tech', Icons.devices_outlined, Color(0xFFE6F3FD)),
    _Category('services', 'Services', Icons.handyman_outlined, Color(0xFFFFF0D8)),
    _Category('other', 'More', Icons.shopping_bag_outlined, Color(0xFFE7F0F3)),
  ];
  @override
  void dispose() { search.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
    stream: FirebaseFirestore.instance.collection('teyzaMarketplaceListings')
      .where('status', isEqualTo: 'active').limit(80).snapshots(),
    builder: (context, snapshot) {
      final items = snapshot.data?.docs.map((d) => _Item(d.id, d.data())).toList() ?? [];
      final term = search.text.trim().toLowerCase();
      final filtered = items.where((i) =>
        (category == 'All' || i.category == category) &&
        (type == 'all' || i.kind == type) &&
        (term.isEmpty || i.name.toLowerCase().contains(term) ||
          i.shopName.toLowerCase().contains(term) ||
          i.description.toLowerCase().contains(term))).toList();
      final shops = <String, String>{};
      for (final i in items) { shops[i.shopId] = i.shopName; }
      return CustomScrollView(slivers: [
        SliverToBoxAdapter(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start, children: [
          _hero(),
          Padding(padding: const EdgeInsets.fromLTRB(16, 10, 16, 12), child: TextField(
            controller: search, onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Search groceries, shops, products, services…',
              hintStyle: const TextStyle(fontSize: 13, color: TeyzaBrand.muted),
              prefixIcon: const Icon(Icons.search, color: TeyzaBrand.deepGreen),
              suffixIcon: search.text.isEmpty ? null : IconButton(
                icon: const Icon(Icons.close), tooltip: 'Clear search',
                onPressed: () => setState(search.clear)),
              fillColor: Colors.white, filled: true,
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: TeyzaBrand.border)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: TeyzaBrand.green)),
            ),
          )),
          _tabs(),
          TeyzaSectionTitle(eyebrow: 'QUICK SHOPS', title: 'What are you looking for?',
            actionLabel: 'See all', onAction: () => setState(() {category='All';type='all';search.clear();})),
          SizedBox(height: 113, child: ListView.separated(
            scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 17),
            itemCount: cats.length, separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (ctx, n) => _categoryCard(cats[n]))),
          if (shops.isNotEmpty) ...[
            const TeyzaSectionTitle(eyebrow: 'DISCOVER INDEPENDENT SELLERS', title: 'Shop small. Shop local.'),
            SizedBox(height: 94, child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal, itemCount: shops.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (ctx, n) => _shopCard(shops.values.elementAt(n)))),
          ],
          Container(margin: const EdgeInsets.fromLTRB(16, 20, 16, 4),
            padding: const EdgeInsets.all(17),
            decoration: BoxDecoration(color: const Color(0xFFFFEEE9),
              borderRadius: BorderRadius.circular(18)),
            child: const Row(children: [
              Icon(Icons.local_shipping_outlined, size: 34, color: TeyzaBrand.coral),
              SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Delivery or collection', style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w900)),
                Text('Each shop chooses its own fulfilment options and fees.',
                  style: TextStyle(fontSize: 11, color: TeyzaBrand.muted)),
              ])),
            ])),
          TeyzaSectionTitle(eyebrow: 'DISCOVER LOCAL', title: 'Products & services',
            actionLabel: filtered.length.toString() + ' items', onAction: () {}),
          if (snapshot.hasError)
            _state(Icons.wifi_off_rounded, 'Unable to load catalogue',
                'Check your connection and Firebase project setup.')
          else if (snapshot.connectionState == ConnectionState.waiting)
            const Padding(padding: EdgeInsets.all(25), child: Center(
              child: CircularProgressIndicator()))
          else if (filtered.isEmpty)
            _state(Icons.store_mall_directory_outlined, 'No listings yet',
              items.isEmpty
                ? 'Verified shops will appear when they publish real stock.'
                : 'Try a different category or search term.'),
        ])),
        if (!snapshot.hasError && filtered.isNotEmpty)
          SliverPadding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 30),
            sliver: SliverLayoutBuilder(builder: (ctx, c) => SliverGrid(
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: c.crossAxisExtent >= 850 ? 4 :
                  c.crossAxisExtent >= 550 ? 3 : 2,
                childAspectRatio: c.crossAxisExtent < 410 ? .61 : .71,
                mainAxisSpacing: 12, crossAxisSpacing: 12),
              delegate: SliverChildBuilderDelegate((ctx, index) =>
                _listingCard(filtered[index]), childCount: filtered.length)))),
      ]);
    },
  );

  Widget _hero() => Container(
    margin: const EdgeInsets.fromLTRB(16, 14, 16, 0),
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      gradient: const LinearGradient(colors: [TeyzaBrand.dark, Color(0xFF20524C)]),
      borderRadius: BorderRadius.circular(24)),
    child: Stack(children: [
      Positioned(right: -75, top: -66, child: Container(width: 240, height: 240,
        decoration: BoxDecoration(shape: BoxShape.circle,
          border: Border.all(color: const Color(0x443CE1AA), width: 45)))),
      Padding(padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.bolt_rounded, size: 17, color: TeyzaBrand.coral),
            SizedBox(width: 7),
            Text('EVERYONE CAN SELL.', style: TextStyle(
              fontSize: 10, letterSpacing: 1.6,
              color: Color(0xFFB5ECDD), fontWeight: FontWeight.w900)),
          ]),
          const SizedBox(height: 14),
          const Text('Big finds.\nLocal stores.', style: TextStyle(
            fontSize: 34, fontWeight: FontWeight.w900, height: 1.02,
            letterSpacing: -1, color: Colors.white)),
          const SizedBox(height: 10),
          const Text('Shop spaza favourites, discover small businesses and local services.',
            style: TextStyle(fontSize: 13, height: 1.4, color: Color(0xFFDFEBE9))),
          const SizedBox(height: 17),
          Container(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(color: TeyzaBrand.coral,
              borderRadius: BorderRadius.circular(30)),
            child: const Text('SHOP LOCAL  ↗', style: TextStyle(
              color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900))),
        ])),
    ]),
  );

  Widget _tabs() => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: Row(children: [
      _tab('all', 'Shop all', Icons.apps_rounded),
      const SizedBox(width: 7),
      _tab('product', 'Products', Icons.shopping_bag_outlined),
      const SizedBox(width: 7),
      _tab('service', 'Services', Icons.handyman_outlined),
    ]),
  );
  Widget _tab(String key, String text, IconData icon) {
    final active = type == key;
    return Expanded(child: InkWell(
      onTap: () => setState(() { type = key; category = 'All'; }),
      borderRadius: BorderRadius.circular(100),
      child: Container(padding: const EdgeInsets.symmetric(vertical: 11),
        decoration: BoxDecoration(
          color: active ? TeyzaBrand.deepGreen : Colors.white,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: active ? TeyzaBrand.deepGreen : TeyzaBrand.border)),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, size: 15, color: active ? Colors.white : TeyzaBrand.ink),
          const SizedBox(width: 5),
          Flexible(child: Text(text, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800,
              color: active ? Colors.white : TeyzaBrand.ink))),
        ]),
      ),
    ));
  }

  Widget _categoryCard(_Category cat) => InkWell(
    onTap: () => setState(() {
      category = cat.key;
      type = cat.key == 'services' ? 'service' : 'all';
    }),
    borderRadius: BorderRadius.circular(15),
    child: SizedBox(width: 83, child: Column(children: [
      Container(height: 69, width: 69,
        decoration: BoxDecoration(color: cat.color,
          borderRadius: BorderRadius.circular(21),
          border: category == cat.key
            ? Border.all(color: TeyzaBrand.deepGreen, width: 2) : null),
        child: Icon(cat.icon, size: 28, color: TeyzaBrand.deepGreen)),
      const SizedBox(height: 6),
      Text(cat.label, textAlign: TextAlign.center, maxLines: 2,
        style: TextStyle(fontSize: 11, height: 1.1,
          fontWeight: category == cat.key ? FontWeight.w900 : FontWeight.w700)),
    ])),
  );

  Widget _shopCard(String name) => Container(width: 174,
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(color: Colors.white,
      border: Border.all(color: TeyzaBrand.border),
      borderRadius: BorderRadius.circular(16)),
    child: Row(children: [
      Container(width: 45, height: 45,
        decoration: BoxDecoration(color: const Color(0xFFE5F5EF),
          borderRadius: BorderRadius.circular(13)),
        child: const Icon(Icons.storefront_rounded, color: TeyzaBrand.deepGreen)),
      const SizedBox(width: 9),
      Expanded(child: Text(name, maxLines: 3,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12))),
    ]),
  );

  Widget _listingCard(_Item item) => Material(
    color: Colors.white, borderRadius: BorderRadius.circular(17),
    clipBehavior: Clip.antiAlias,
    child: InkWell(onTap: () => _details(item),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(child: Stack(fit: StackFit.expand, children: [
          item.imageUrl.isEmpty
            ? Container(color: const Color(0xFFECF4F0),
              child: Icon(item.kind == 'service' ? Icons.handyman_outlined
                : Icons.shopping_basket_outlined,
                color: TeyzaBrand.deepGreen, size: 49))
            : Image.network(item.imageUrl, fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const ColoredBox(
                  color: Color(0xFFECF4F0),
                  child: Icon(Icons.image_not_supported_outlined))),
          Positioned(left: 8, top: 8, child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: item.kind == 'service'
              ? const Color(0xFFFFE8E1) : const Color(0xFFE0F2EC),
              borderRadius: BorderRadius.circular(12)),
            child: Text(item.kind == 'service' ? 'SERVICE' : 'LOCAL SELLER',
              style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900,
                color: TeyzaBrand.deepGreen)))),
        ])),
        Padding(padding: const EdgeInsets.fromLTRB(10, 9, 10, 2),
          child: Text(item.shopName, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 10, color: TeyzaBrand.deepGreen,
              fontWeight: FontWeight.w800))),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Text(item.name, maxLines: 2, overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800))),
        Padding(padding: const EdgeInsets.fromLTRB(10, 5, 10, 3),
          child: Text(item.price, style: const TextStyle(
            fontSize: 17, fontWeight: FontWeight.w900))),
        Padding(padding: const EdgeInsets.all(7),
          child: SizedBox(height: 35, child: FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: item.kind == 'service'
                ? TeyzaBrand.dark : TeyzaBrand.green,
              padding: const EdgeInsets.symmetric(horizontal: 6)),
            onPressed: item.kind == 'service' ? () => _details(item) :
              item.stock < 1 ? null : () => widget.onAddProduct(item.id, item.raw),
            child: Text(item.kind == 'service' ? 'View service' :
              item.stock < 1 ? 'Sold out' : '+ Add to basket',
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
          ))),
      ]),
    ),
  );

  void _details(_Item item) {
    showModalBottomSheet<void>(context: context, showDragHandle: true,
      isScrollControlled: true, builder: (sheet) => SafeArea(
      child: FractionallySizedBox(heightFactor: .75,
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 5, 20, 24),
          children: [
            if (item.imageUrl.isNotEmpty)
              ClipRRect(borderRadius: BorderRadius.circular(16),
                child: Image.network(item.imageUrl, height: 185, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox(height: 70,
                    child: Icon(Icons.image_not_supported_outlined)))),
            const SizedBox(height: 14),
            Text(item.shopName, style: const TextStyle(
              color: TeyzaBrand.deepGreen, fontWeight: FontWeight.bold)),
            const SizedBox(height: 3),
            Text(item.name, style: const TextStyle(
              fontSize: 24, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text(item.price, style: const TextStyle(
              fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            Text(item.description.isEmpty ? 'No additional description provided.' : item.description,
              style: const TextStyle(color: TeyzaBrand.muted, height: 1.5)),
            const SizedBox(height: 16),
            if (item.kind == 'service')
              const Text('Service booking and enquiry will be connected after Firebase staging tests.',
                style: TextStyle(color: TeyzaBrand.muted))
            else
              Text(item.stock > 0 ? item.stock.toString() + ' available' : 'Sold out'),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: item.kind != 'service' && item.stock > 0 ? () {
                Navigator.pop(sheet);
                widget.onAddProduct(item.id, item.raw);
              } : null,
              child: Text(item.kind == 'service' ? 'Booking coming soon' :
                item.stock > 0 ? 'Add to basket' : 'Sold out')),
          ]))));
  }

  Widget _state(IconData icon, String heading, String message) =>
    Padding(padding: const EdgeInsets.fromLTRB(25, 6, 25, 30),
      child: Center(child: Column(children: [
        Icon(icon, size: 42, color: TeyzaBrand.muted),
        const SizedBox(height: 8),
        Text(heading, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
        const SizedBox(height: 5),
        Text(message, textAlign: TextAlign.center,
          style: const TextStyle(height: 1.4, color: TeyzaBrand.muted)),
      ])));
}

class _Category {
  final String key, label;
  final IconData icon;
  final Color color;
  const _Category(this.key, this.label, this.icon, this.color);
}
class _Item {
  final String id;
  final Map<String, dynamic> raw;
  const _Item(this.id, this.raw);
  String get name => raw['name']?.toString() ?? 'Untitled product';
  String get shopName => raw['shopName']?.toString() ?? 'Teyza shop';
  String get shopId => raw['shopId']?.toString() ?? '';
  String get category => raw['category']?.toString() ?? 'other';
  String get kind => raw['kind']?.toString() ?? 'product';
  String get description => raw['description']?.toString() ?? '';
  String get imageUrl => raw['imageUrl']?.toString() ?? '';
  int get stock => (raw['stock'] as num?)?.toInt() ?? 0;
  String get price => 'R ' + (((raw['priceCents'] as num?)?.toInt() ?? 0) / 100).toStringAsFixed(2);
}
