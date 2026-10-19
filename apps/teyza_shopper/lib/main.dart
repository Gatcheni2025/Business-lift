import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

const ink = Color(0xFF122F2A);
const emerald = Color(0xFF078E66);
const faint = Color(0xFFF3F7F5);
const muted = Color(0xFF61766F);
const catalogUrl = 'https://teyza.co.za/api/shopper-catalog.php';
String rand(int cents) => 'R' + (cents / 100).toStringAsFixed(2);

class Product {
  final String id, name, category, picture;
  final int priceCents, stock;
  const Product(this.id, this.name, this.category, this.picture, this.priceCents, this.stock);
  factory Product.fromJson(Map<String, dynamic> x) => Product(
    (x['id'] ?? '').toString(), (x['name'] ?? '').toString(),
    (x['category'] ?? '').toString(), (x['imageUrl'] ?? '').toString(),
    (x['priceCents'] as num?)?.toInt() ?? 0, (x['stock'] as num?)?.toInt() ?? 0);
}

class Shop {
  final String id, name, area, photo, phone;
  final bool pickup, delivery;
  final List<Product> products;
  const Shop(this.id, this.name, this.area, this.photo, this.phone,
    this.pickup, this.delivery, this.products);
  factory Shop.fromJson(Map<String, dynamic> x) => Shop(
    (x['id'] ?? '').toString(), (x['name'] ?? '').toString(),
    (x['area'] ?? '').toString(), (x['photoUrl'] ?? '').toString(),
    (x['whatsappPhone'] ?? '').toString(), x['pickupEnabled'] == true,
    x['deliveryEnabled'] == true,
    ((x['products'] as List?) ?? []).whereType<Map>().map((p) =>
      Product.fromJson(Map<String, dynamic>.from(p)))
        .where((p) => p.id.isNotEmpty && p.name.isNotEmpty && p.stock > 0 && p.priceCents > 0).toList());
}

Future<List<Shop>> fetchCatalogue({http.Client? client}) async {
  final source = client ?? http.Client();
  try {
    final res = await source.get(Uri.parse(catalogUrl),
      headers: const {'Accept': 'application/json'}).timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw Exception('Shop catalogue is unavailable (HTTP ' + res.statusCode.toString() + ').');
    }
    final json = jsonDecode(utf8.decode(res.bodyBytes));
    if (json is! Map || json['ok'] != true || json['shops'] is! List) {
      throw const FormatException('Unexpected shop catalogue response.');
    }
    return (json['shops'] as List).whereType<Map>()
      .map((v) => Shop.fromJson(Map<String, dynamic>.from(v)))
      .where((shop) => shop.id.isNotEmpty && shop.name.isNotEmpty && shop.products.isNotEmpty).toList();
  } finally {
    if (client == null) source.close();
  }
}

void main() => runApp(const TeyzaShopper());

class TeyzaShopper extends StatelessWidget {
  const TeyzaShopper({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false, title: 'Teyza Shopper',
    theme: ThemeData(useMaterial3: true, scaffoldBackgroundColor: faint,
      colorScheme: ColorScheme.fromSeed(seedColor: emerald),
      appBarTheme: const AppBarTheme(backgroundColor: ink, foregroundColor: Colors.white)),
    home: const Home());
}

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  List<Shop> shops = [];
  Shop? currentShop;
  String search = '';
  String? error;
  bool busy = true;
  int tab = 0;
  final Map<String, int> cart = {};

  @override
  void initState() { super.initState(); reload(); }

  Future<void> reload() async {
    setState(() { busy = true; error = null; });
    try {
      final fresh = await fetchCatalogue();
      if (!mounted) return;
      Shop? retained;
      for (final shop in fresh) {
        if (shop.id == currentShop?.id) { retained = shop; break; }
      }
      setState(() { shops = fresh; currentShop = retained; busy = false; });
    } catch (e) {
      if (!mounted) return;
      setState(() { error = e.toString().replaceFirst('Exception: ', ''); busy = false; });
    }
  }

  void selectShop(Shop shop) => setState(() {
    if (currentShop?.id != shop.id) cart.clear();
    currentShop = shop;
    search = '';
    tab = 1;
  });

  void quantity(Product product, int delta) => setState(() {
    final next = (cart[product.id] ?? 0) + delta;
    if (next < 1) cart.remove(product.id);
    else if (next <= product.stock) cart[product.id] = next;
  });

  List<Product> get selectedProducts => currentShop?.products
    .where((p) => (cart[p.id] ?? 0) > 0).toList() ?? [];
  int get basketSize => cart.values.fold(0, (a,b) => a + b);
  int get subtotal => selectedProducts.fold(0,
    (sum, p) => sum + p.priceCents * (cart[p.id] ?? 0));

  Widget image(String url, {double size = 85, IconData icon = Icons.storefront_outlined}) =>
    Container(width: size, height: size, clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: const Color(0xFFE4F3EC),
        borderRadius: BorderRadius.circular(13)),
      child: url.isEmpty ? Icon(icon, color: emerald, size: size / 2) :
        Image.network(url, fit: BoxFit.contain,
          errorBuilder: (_, error, stack) => Icon(icon, color: emerald, size: size / 2)));

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(toolbarHeight: 69, title: Row(children: [
      Container(width: 42, height: 42, alignment: Alignment.center,
        decoration: BoxDecoration(color: emerald, borderRadius: BorderRadius.circular(12)),
        child: const Text('T', style: TextStyle(fontSize: 27, fontWeight: FontWeight.w900,
          color: Colors.white, fontStyle: FontStyle.italic))),
      const SizedBox(width: 11),
      const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('TEYZA', style: TextStyle(fontSize: 22, letterSpacing: 2,
          fontWeight: FontWeight.w900, color: Colors.white)),
        Text('Your neighbourhood marketplace',
          style: TextStyle(fontSize: 10, color: Color(0xFFC6E7DB)))
      ])
    ]), actions: [IconButton(tooltip: 'Refresh shops', onPressed: reload,
      icon: const Icon(Icons.refresh_rounded))]),
    body: SafeArea(child: tab == 2 ? basketView() :
      tab == 3 ? aboutView() : tab == 1 && currentShop != null ?
      shopView(currentShop!) : browseView()),
    bottomNavigationBar: NavigationBar(
      backgroundColor: Colors.white, selectedIndex: tab,
      onDestinationSelected: (value) => setState(() => tab = value),
      destinations: [
        const NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Discover'),
        const NavigationDestination(icon: Icon(Icons.storefront_outlined), label: 'Spaza'),
        NavigationDestination(icon: Badge(isLabelVisible: basketSize > 0,
          label: Text(basketSize.toString()),
          child: const Icon(Icons.shopping_basket_outlined)), label: 'Basket'),
        const NavigationDestination(icon: Icon(Icons.info_outline), label: 'About'),
      ]),
  );

  Widget browseView() => RefreshIndicator(onRefresh: reload, child: ListView(
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.all(16), children: [
      Container(padding: const EdgeInsets.all(23),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(22),
          gradient: const LinearGradient(colors: [ink, Color(0xFF178262)])),
        child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('LOCAL SHOPS. REAL STOCK.', style: TextStyle(color: Color(0xFFA4E4C8),
            fontWeight: FontWeight.w800, letterSpacing: 1.4, fontSize: 11)),
          SizedBox(height: 11),
          Text('Your spaza.\nYour essentials.', style: TextStyle(
            color: Colors.white, fontSize: 31, fontWeight: FontWeight.w900, height: 1.1)),
          SizedBox(height: 10),
          Text('Find approved local shops and see their available products.',
            style: TextStyle(color: Color(0xFFE1F2EA), fontSize: 13))
        ])),
      const SizedBox(height: 19),
      const Text('Find your local shop', style: TextStyle(
        fontSize: 22, fontWeight: FontWeight.w900, color: ink)),
      const SizedBox(height: 10),
      TextField(onChanged: (value) => setState(() => search = value),
        decoration: InputDecoration(prefixIcon: const Icon(Icons.search_rounded),
          hintText: 'Search shop, suburb or groceries',
          filled: true, fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(15)))),
      const SizedBox(height: 15),
      if (busy) const Center(child: Padding(padding: EdgeInsets.all(24),
        child: CircularProgressIndicator()))
      else if (error != null) message('Unable to load shops', error!)
      else if (shops.isEmpty) message('No spaza shops listed yet',
        'Approved shop owners will appear here after they publish their products to Teyza Shopper.')
      else ...[
        ...shops.where((shop) => (shop.name + ' ' + shop.area + ' ' +
          shop.products.map((p) => p.name).join(' '))
            .toLowerCase().contains(search.toLowerCase())).map(shopCard),
        if (!shops.any((shop) => (shop.name + ' ' + shop.area + ' ' +
          shop.products.map((p) => p.name).join(' '))
            .toLowerCase().contains(search.toLowerCase())))
          message('No matching shops', 'Try a different shop name or suburb.')
      ]
    ]));

  Widget message(String title, String detail) => Card(
    color: Colors.white, elevation: 0,
    child: Padding(padding: const EdgeInsets.all(24),
      child: Column(children: [
        const Icon(Icons.storefront, color: emerald, size: 47),
        const SizedBox(height: 12),
        Text(title, textAlign: TextAlign.center, style: const TextStyle(
          fontSize: 19, fontWeight: FontWeight.w900)),
        const SizedBox(height: 9),
        Text(detail, textAlign: TextAlign.center, style: const TextStyle(color: muted)),
        const SizedBox(height: 12),
        TextButton.icon(onPressed: reload, icon: const Icon(Icons.refresh),
          label: const Text('Refresh'))
      ])));

  Widget shopCard(Shop shop) => Card(
    elevation: 0, color: Colors.white, margin: const EdgeInsets.only(bottom: 11),
    child: InkWell(onTap: () => selectShop(shop),
      child: Padding(padding: const EdgeInsets.all(12),
        child: Row(children: [
          image(shop.photo, size: 92), const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(shop.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
            const SizedBox(height: 4),
            Text(shop.area, maxLines: 2, overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: muted, fontSize: 12)),
            const SizedBox(height: 7),
            Text(shop.products.length.toString() + ' available products',
              style: const TextStyle(color: emerald, fontWeight: FontWeight.w800))
          ])),
          const Icon(Icons.chevron_right, color: emerald)
        ]))));

  Widget shopView(Shop shop) {
    final products = shop.products.where((p) =>
      (p.name + ' ' + p.category).toLowerCase().contains(search.toLowerCase())).toList();
    return ListView(padding: const EdgeInsets.all(16), children: [
      TextButton.icon(onPressed: () => setState(() { tab = 0; search = ''; }),
        icon: const Icon(Icons.arrow_back), label: const Text('All shops')),
      Row(children: [
        image(shop.photo, size: 82), const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(shop.name, style: const TextStyle(
            fontSize: 24, fontWeight: FontWeight.w900, color: ink)),
          Text(shop.area, style: const TextStyle(color: muted)),
          Text(shop.pickup && shop.delivery ? 'Collection or delivery' :
            shop.pickup ? 'Collection available' : 'Delivery available',
            style: const TextStyle(fontSize: 12, color: emerald, fontWeight: FontWeight.bold))
        ]))
      ]),
      const SizedBox(height: 17),
      TextField(onChanged: (value) => setState(() => search = value),
        decoration: InputDecoration(prefixIcon: const Icon(Icons.search),
          hintText: 'Search this shop',
          filled: true, fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(15)))),
      const SizedBox(height: 16),
      Text('Available products (' + products.length.toString() + ')',
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
      const SizedBox(height: 9),
      LayoutBuilder(builder: (context, space) => GridView.builder(
        shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
        itemCount: products.length,
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: space.maxWidth > 680 ? 4 : 2,
          crossAxisSpacing: 11, mainAxisSpacing: 11, childAspectRatio: .68),
        itemBuilder: (context, index) {
          final product = products[index];
          return Container(padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white,
              borderRadius: BorderRadius.circular(16)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: SizedBox(width: double.infinity,
                child: image(product.picture, size: 145, icon: Icons.shopping_bag_outlined))),
              const SizedBox(height: 6),
              Text(product.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w800)),
              Text(rand(product.priceCents), style: const TextStyle(
                fontWeight: FontWeight.w900, color: emerald, fontSize: 15)),
              Text(product.stock.toString() + ' available',
                style: const TextStyle(fontSize: 10, color: muted)),
              SizedBox(width: double.infinity, child: FilledButton(
                onPressed: () => quantity(product, 1),
                style: FilledButton.styleFrom(backgroundColor: emerald,
                  visualDensity: VisualDensity.compact, padding: const EdgeInsets.all(4)),
                child: Text((cart[product.id] ?? 0) == 0 ? 'Add to basket' :
                  'Add more (' + (cart[product.id] ?? 0).toString() + ')',
                  maxLines: 1, style: const TextStyle(fontSize: 11))))
            ]));
        })),
      if (products.isEmpty) const Padding(padding: EdgeInsets.all(20),
        child: Center(child: Text('No matching products here.'))),
      const SizedBox(height: 15),
      const Text('Prices and stock are supplied by shops. Confirm before purchase.',
        textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 11))
    ]);
  }

  Future<void> requestOrder() async {
    final shop = currentShop;
    if (shop == null || selectedProducts.isEmpty || shop.phone.isEmpty) return;
    final rows = selectedProducts.map((p) =>
      '- ' + p.name + ' x' + (cart[p.id] ?? 0).toString() + ': ' +
      rand(p.priceCents * (cart[p.id] ?? 0))).join('\n');
    final messageText = 'Hello ' + shop.name + ', I found your shop on TEYZA.\n\n'
      'Can I request these items?\n' + rows + '\n\nEstimated subtotal: ' +
      rand(subtotal) + '\nPlease confirm stock, total cost and collection or delivery. '
      'No payment has been made.';
    final uri = Uri.parse('https://wa.me/' + shop.phone +
      '?text=' + Uri.encodeComponent(messageText));
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Unable to open WhatsApp on this device.')));
    }
  }

  Widget basketView() {
    if (currentShop == null || selectedProducts.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.shopping_basket_outlined, size: 55, color: emerald),
        const SizedBox(height: 12),
        const Text('Your basket is empty',
          style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900)),
        const SizedBox(height: 12),
        FilledButton(onPressed: () => setState(() => tab = 0),
          child: const Text('Find a spaza shop'))
      ]));
    }
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text(currentShop!.name, style: const TextStyle(
        fontSize: 24, fontWeight: FontWeight.w900)),
      const SizedBox(height: 7),
      const Text('One spaza shop per basket.',
        style: TextStyle(color: muted)),
      const SizedBox(height: 14),
      ...selectedProducts.map((p) => Card(
        color: Colors.white, elevation: 0, child: Padding(
          padding: const EdgeInsets.all(8), child: Row(children: [
            image(p.picture, size: 64, icon: Icons.shopping_bag_outlined),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.name, style: const TextStyle(fontWeight: FontWeight.bold)),
              Text(rand(p.priceCents * (cart[p.id] ?? 0)),
                style: const TextStyle(color: emerald))
            ])),
            IconButton(onPressed: () => quantity(p, -1),
              icon: const Icon(Icons.remove_circle_outline)),
            Text((cart[p.id] ?? 0).toString()),
            IconButton(onPressed: () => quantity(p, 1),
              icon: const Icon(Icons.add_circle_outline))
          ])))),
      const SizedBox(height: 17),
      Text('Estimated subtotal: ' + rand(subtotal), style: const TextStyle(
        fontSize: 22, fontWeight: FontWeight.w900, color: ink)),
      const SizedBox(height: 8),
      const Text('Collection and delivery options are confirmed by the shop. '
        'No payments are taken inside the app.', style: TextStyle(color: muted)),
      const SizedBox(height: 16),
      FilledButton.icon(onPressed: currentShop!.phone.isEmpty ? null : requestOrder,
        style: FilledButton.styleFrom(backgroundColor: emerald,
          padding: const EdgeInsets.all(17)),
        icon: const Icon(Icons.send_outlined),
        label: const Text('Ask shop via WhatsApp')),
      if (currentShop!.phone.isEmpty)
        const Padding(padding: EdgeInsets.all(10),
          child: Text('WhatsApp orders have not been enabled by this shop.',
            textAlign: TextAlign.center, style: TextStyle(color: muted))),
      const SizedBox(height: 8),
      const Text('WhatsApp sends an enquiry only, not a confirmed order.',
        textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 11)),
    ]);
  }

  Widget aboutView() => ListView(padding: const EdgeInsets.all(22), children: const [
    Icon(Icons.storefront, size: 60, color: emerald),
    SizedBox(height: 12),
    Text('TEYZA Shopper', textAlign: TextAlign.center, style: TextStyle(
      fontSize: 27, fontWeight: FontWeight.w900, color: ink)),
    SizedBox(height: 12),
    Text('See products in approved local spaza shops. Select a shop, browse available '
      'stock and prepare a basket. Browsing is free and needs no login.',
      textAlign: TextAlign.center),
    SizedBox(height: 20),
    Card(child: ListTile(leading: Icon(Icons.verified_outlined),
      title: Text('Verified shops only'),
      subtitle: Text('Shops must be approved and opt into the shopper catalogue.'))),
    Card(child: ListTile(leading: Icon(Icons.lock_outline),
      title: Text('Merchant banking is private'),
      subtitle: Text('Financing, identity and private documents are never sent to this app.'))),
    Card(child: ListTile(leading: Icon(Icons.local_shipping_outlined),
      title: Text('Collection and delivery'),
      subtitle: Text('Ask each shop to confirm fulfilment and payment arrangements.'))),
    SizedBox(height: 16),
    Text('Shop owners manage products on teyza.co.za.',
      textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: muted))
  ]);
}
