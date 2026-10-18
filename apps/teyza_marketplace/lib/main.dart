import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'market_api.dart';
import 'seller.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Configure native Firebase SDKs before running: see README.
  await Firebase.initializeApp();
  runApp(const TeyzaApp());
}

class TeyzaApp extends StatelessWidget {
  const TeyzaApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'TEYZA Marketplace', debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xFFF6F8F4),
      colorScheme: ColorScheme.fromSeed(seedColor: teyzaGreen),
      appBarTheme: const AppBarTheme(backgroundColor: Color(0xFFF6F8F4)),
      inputDecorationTheme: InputDecorationTheme(filled: true, fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14))),
    ),
    home: const MarketHome(),
  );
}

class Product {
  final String id, shopId, name, shopName, category, imageUrl, kind;
  final int cents, stock;
  Product(this.id, Map<String, dynamic> d)
      : shopId = d['shopId']?.toString() ?? '',
        name = d['name']?.toString() ?? '',
        shopName = d['shopName']?.toString() ?? '',
        category = d['category']?.toString() ?? '',
        imageUrl = d['imageUrl']?.toString() ?? '',
        kind = d['kind']?.toString() ?? 'product',
        cents = (d['priceCents'] as num?)?.toInt() ?? 0,
        stock = (d['stock'] as num?)?.toInt() ?? 0;
}

class BasketItem {
  final Product item;
  int quantity;
  BasketItem(this.item, this.quantity);
}

class MarketHome extends StatefulWidget {
  const MarketHome({super.key});
  @override
  State<MarketHome> createState() => _MarketHomeState();
}

class _MarketHomeState extends State<MarketHome> {
  int tab = 0;
  String category = 'All';
  final basket = <BasketItem>[];
  static const categories = [
    'All', 'groceries', 'food', 'household', 'beauty',
    'fashion', 'electronics', 'other', 'services',
  ];

  void addProduct(Product p) {
    if (p.kind == 'service' || p.stock == 0) return;
    if (basket.isNotEmpty && basket.first.item.shopId != p.shopId) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Checkout supports one seller at a time in Phase 1.')));
      return;
    }
    final existing = basket.where((line) => line.item.id == p.id).toList();
    setState(() {
      if (existing.isEmpty) {
        basket.add(BasketItem(p, 1));
      } else if (existing.first.quantity < p.stock) {
        existing.first.quantity++;
      }
    });
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(p.name + ' added to basket')));
  }

  void adjust(BasketItem line, int change) => setState(() {
    final quantity = line.quantity + change;
    if (quantity < 1) basket.remove(line);
    else if (quantity <= line.item.stock) line.quantity = quantity;
  });

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Column(
      crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('TEYZA', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2)),
        Text('Everyone can sell.', style: TextStyle(color: teyzaGreen, fontSize: 11)),
      ]),
      actions: [IconButton(onPressed: () => showLogin(context),
        icon: const Icon(Icons.account_circle_outlined), tooltip: 'My account')]),
    body: SafeArea(child: [
      discover(),
      const WholesalePage(),
      const SellerPage(),
      const OrdersPage(),
      cart(),
    ][tab]),
    bottomNavigationBar: NavigationBar(selectedIndex: tab,
      onDestinationSelected: (index) => setState(() => tab = index),
      destinations: [
        const NavigationDestination(icon: Icon(Icons.storefront_outlined), label: 'Explore'),
        const NavigationDestination(icon: Icon(Icons.warehouse_outlined), label: 'Wholesale'),
        const NavigationDestination(icon: Icon(Icons.add_business_outlined), label: 'Sell'),
        const NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'Orders'),
        NavigationDestination(icon: Badge(
          isLabelVisible: basket.isNotEmpty, label: Text(basket.length.toString()),
          child: const Icon(Icons.shopping_basket_outlined)), label: 'Basket'),
      ]),
  );

  Widget discover() => StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
    stream: FirebaseFirestore.instance.collection('teyzaMarketplaceListings')
      .where('status', isEqualTo: 'active').limit(80).snapshots(),
    builder: (context, snapshot) {
      final products = snapshot.data?.docs.map((d) => Product(d.id, d.data()))
        .where((p) => category == 'All' || p.category == category).toList() ?? [];
      return CustomScrollView(slivers: [
        SliverToBoxAdapter(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(margin: const EdgeInsets.all(16), padding: const EdgeInsets.all(25),
            decoration: BoxDecoration(color: teyzaGreen, borderRadius: BorderRadius.circular(24)),
            child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('SHOP LOCAL. GROW TOGETHER.',
                style: TextStyle(color: Color(0xFFBCF2D6), fontWeight: FontWeight.bold)),
              SizedBox(height: 10),
              Text('Your township.\nYour marketplace.',
                style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              SizedBox(height: 10),
              Text('Spaza groceries, independent sellers and everyday services.',
                style: TextStyle(color: Colors.white)),
            ]),
          ),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text('Find what you need', style: TextStyle(
              fontSize: 21, fontWeight: FontWeight.w800))),
          SingleChildScrollView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.all(14),
            child: Row(children: categories.map((c) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(label: Text(c), selected: category == c,
                onSelected: (_) => setState(() => category = c)))).toList())),
          const Padding(padding: EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Text('From local sellers', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800))),
        ])),
        if (snapshot.hasError) SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text('Could not load shop listings: ' + marketError(snapshot.error!)))),
        if (!snapshot.hasData && !snapshot.hasError) const SliverToBoxAdapter(
          child: Center(child: CircularProgressIndicator())),
        if (snapshot.hasData && products.isEmpty) const SliverToBoxAdapter(
          child: Padding(padding: EdgeInsets.all(20),
            child: Text('No verified sellers have published in this category yet.'))),
        SliverPadding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
          sliver: SliverLayoutBuilder(builder: (ctx, constraints) => SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: constraints.crossAxisExtent >= 760 ? 4 : 2,
              childAspectRatio: .68, crossAxisSpacing: 12, mainAxisSpacing: 12),
            delegate: SliverChildBuilderDelegate((ctx, index) =>
              productCard(products[index]), childCount: products.length)))),
      ]);
    },
  );

  Widget productCard(Product p) => Card(
    color: Colors.white, clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Expanded(child: p.imageUrl.isEmpty ? const ColoredBox(color: Color(0xFFEAF0EA),
        child: Icon(Icons.shopping_basket_outlined, color: teyzaGreen, size: 42))
        : Image.network(p.imageUrl, fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined))),
      Padding(padding: const EdgeInsets.fromLTRB(10, 8, 10, 2),
        child: Text(p.shopName, maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: teyzaGreen, fontSize: 11, fontWeight: FontWeight.bold))),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.bold))),
      Padding(padding: const EdgeInsets.fromLTRB(10, 4, 10, 0),
        child: Text(zar(p.cents), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900))),
      Padding(padding: const EdgeInsets.all(7),
        child: FilledButton.tonal(
          onPressed: p.kind == 'service' || p.stock <= 0 ? null : () => addProduct(p),
          child: Text(p.kind == 'service' ? 'Enquiry soon' :
            p.stock <= 0 ? 'Sold out' : 'Add to basket',
            style: const TextStyle(fontSize: 11)))),
    ]),
  );

  Widget cart() {
    if (basket.isEmpty) return const Center(
      child: Text('Your basket is empty. Start by exploring Teyza shops.'));
    final subtotal = basket.fold<int>(0, (total, line) =>
      total + line.item.cents * line.quantity);
    return FutureBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      future: FirebaseFirestore.instance.collection('teyzaMarketplaceShops')
        .doc(basket.first.item.shopId).get(),
      builder: (context, snap) {
        if (snap.hasError) return Center(child: Text(marketError(snap.error!)));
        final shop = snap.data?.data();
        if (shop == null) return const Center(child: CircularProgressIndicator());
        return ListView(padding: const EdgeInsets.all(18), children: [
          Text(shop['name']?.toString() ?? 'Teyza shop',
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const Text('One seller per checkout · prices confirmed on the server'),
          const SizedBox(height: 14),
          ...basket.map((line) => Card(child: ListTile(
            title: Text(line.item.name),
            subtitle: Text(zar(line.item.cents) + ' × ' + line.quantity.toString()),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              IconButton(onPressed: () => adjust(line, -1), icon: const Icon(Icons.remove_circle_outline)),
              Text(line.quantity.toString()),
              IconButton(onPressed: () => adjust(line, 1), icon: const Icon(Icons.add_circle_outline)),
            ]),
          ))),
          const SizedBox(height: 16),
          Text('Subtotal: ' + zar(subtotal), style: const TextStyle(
            fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          const Text('Cash on collection/delivery only. No online card payments are live yet.'),
          const SizedBox(height: 20),
          FilledButton(onPressed: () => checkout(shop), child: const Text('Continue to collection or delivery')),
        ]);
      },
    );
  }

  Future<void> checkout(Map<String, dynamic> shop) async {
    if (FirebaseAuth.instance.currentUser == null) {
      await showLogin(context);
      if (!mounted || FirebaseAuth.instance.currentUser == null) return;
    }
    String fulfilment = shop['pickupEnabled'] == true ? 'pickup' : 'delivery';
    final address = TextEditingController();
    bool busy = false;
    try {
      await showModalBottomSheet<void>(context: context, showDragHandle: true,
        isScrollControlled: true, builder: (sheet) => StatefulBuilder(builder: (sheet, update) =>
        Padding(padding: EdgeInsets.fromLTRB(16, 8, 16, MediaQuery.viewInsetsOf(sheet).bottom + 30),
          child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Collect or deliver?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            if (shop['pickupEnabled'] == true)
              RadioListTile<String>(value: 'pickup', groupValue: fulfilment,
                title: const Text('Collect at shop'),
                onChanged: (v) => update(() => fulfilment = v!)),
            if (shop['deliveryEnabled'] == true)
              RadioListTile<String>(value: 'delivery', groupValue: fulfilment,
                title: Text('Local shop delivery · ' +
                  zar((shop['deliveryFeeCents'] as num?)?.toInt() ?? 0)),
                onChanged: (v) => update(() => fulfilment = v!)),
            if (fulfilment == 'delivery') TextField(controller: address,
              decoration: const InputDecoration(labelText: 'Delivery address')),
            const SizedBox(height: 10),
            FilledButton(onPressed: busy ? null : () async {
              if (fulfilment == 'delivery' && address.text.trim().isEmpty) {
                ScaffoldMessenger.of(sheet).showSnackBar(
                  const SnackBar(content: Text('Enter your delivery address.')));
                return;
              }
              update(() => busy = true);
              try {
                final id = DateTime.now().microsecondsSinceEpoch.toString() + '_' +
                  Random.secure().nextInt(0x7fffffff).toString();
                await marketCall('placeMarketplaceOrder', {
                  'shopId': basket.first.item.shopId, 'requestId': id,
                  'items': basket.map((line) => {
                    'listingId': line.item.id, 'quantity': line.quantity}).toList(),
                  'fulfilment': fulfilment, 'deliveryAddress': address.text.trim(),
                });
                if (!mounted) return;
                Navigator.pop(sheet);
                setState(() { basket.clear(); tab = 3; });
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text('Order requested. The shop must accept before fulfilment.')));
              } catch (e) {
                if (sheet.mounted) ScaffoldMessenger.of(sheet).showSnackBar(
                  SnackBar(content: Text(marketError(e))));
              } finally {
                if (sheet.mounted) update(() => busy = false);
              }
            }, child: Text(busy ? 'Submitting…' : 'Send order request · Pay at fulfilment')),
          ]))));
    } finally {
      address.dispose();
    }
  }
}

class WholesalePage extends StatelessWidget {
  const WholesalePage({super.key});
  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: const [
    Icon(Icons.warehouse_outlined, size: 55, color: teyzaGreen),
    SizedBox(height: 12),
    Text('Give spaza shops buying power', style: TextStyle(
      fontSize: 24, fontWeight: FontWeight.w900)),
    SizedBox(height: 15),
    Text('Wholesale ordering and collective bulk buying will become available after suppliers are verified.'),
    Card(child: ListTile(leading: Icon(Icons.inventory_2_outlined),
      title: Text('Wholesale ordering'), subtitle: Text('Supplier stock, packs and minimum quantities · planned'))),
    Card(child: ListTile(leading: Icon(Icons.groups_2_outlined),
      title: Text('Group buying'), subtitle: Text('Combine spaza orders to improve buying prices · planned'))),
    Card(child: ListTile(leading: Icon(Icons.account_balance_outlined),
      title: Text('Credit for stock'), subtitle: Text('Future referrals to authorised finance partners — not active'))),
  ]);
}

class OrdersPage extends StatelessWidget {
  const OrdersPage({super.key});
  @override
  Widget build(BuildContext context) => StreamBuilder<User?>(
    stream: FirebaseAuth.instance.authStateChanges(),
    builder: (context, user) {
      if (user.data == null) return Center(
        child: FilledButton(onPressed: () => showLogin(context),
          child: const Text('Sign in to see your orders')));
      return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance.collection('teyzaMarketplaceOrders')
          .where('buyerUid', isEqualTo: user.data!.uid).limit(100).snapshots(),
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text(marketError(snap.error!)));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          if (snap.data!.docs.isEmpty) return const Center(
            child: Text('You have no order requests yet.'));
          return ListView(padding: const EdgeInsets.all(16), children: snap.data!.docs.map((d) {
            final data = d.data();
            return Card(child: ListTile(
              title: Text(data['shopName']?.toString() ?? 'Local shop'),
              subtitle: Text((data['status']?.toString() ?? '') + ' · ' +
                (data['fulfilment']?.toString() ?? '')),
              trailing: Text(zar((data['totalCents'] as num?)?.toInt() ?? 0)),
            ));
          }).toList());
        },
      );
    },
  );
}
