import 'package:flutter/material.dart';
import 'market_brand.dart';

/// Read-only offline UI preview for APKs built without FlutterFire configuration.
/// No live stock, sign-in, checkout, quotes or services are sent in this mode.
class TeyzaPreviewApp extends StatelessWidget {
  const TeyzaPreviewApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'TEYZA Shopper Preview', debugShowCheckedModeBanner: false,
    theme: ThemeData(useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: TeyzaBrand.green),
      scaffoldBackgroundColor: TeyzaBrand.background),
    home: const _PreviewHome(),
  );
}

class _PreviewHome extends StatefulWidget {
  const _PreviewHome();
  @override
  State<_PreviewHome> createState() => _PreviewHomeState();
}

class _PreviewHomeState extends State<_PreviewHome> {
  int tab = 0;
  static const names = ['Shop', 'Services', 'Activity', 'Basket', 'Account'];
  static const icons = [
    Icons.storefront_outlined, Icons.handyman_outlined,
    Icons.receipt_long_outlined, Icons.shopping_basket_outlined,
    Icons.person_outline,
  ];
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(toolbarHeight: 67, backgroundColor: TeyzaBrand.dark,
      title: const Row(children: [
        TeyzaMark(size: 42), SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('TEYZA', style: TextStyle(fontWeight: FontWeight.w900,
            fontSize: 22, letterSpacing: 2, color: Colors.white)),
          Text('Shop local. Find services.',
            style: TextStyle(fontSize: 10, color: Color(0xFFB5ECDD))),
        ]),
      ])),
    body: SafeArea(child: ListView(padding: const EdgeInsets.all(16), children: [
      Container(padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
        decoration: BoxDecoration(color: const Color(0xFFFFEEE9),
          borderRadius: BorderRadius.circular(13)),
        child: const Row(children: [
          Icon(Icons.info_outline, color: TeyzaBrand.coral),
          SizedBox(width: 9),
          Expanded(child: Text('UI PREVIEW ONLY · Firebase staging is not connected. No live orders or payments.',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700))),
        ])),
      const SizedBox(height: 16),
      if (tab == 0 || tab == 1) ...[
        Container(padding: const EdgeInsets.all(25),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(21),
            gradient: const LinearGradient(colors: [
              TeyzaBrand.dark, Color(0xFF24524A)])),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('EVERYONE CAN SELL.', style: TextStyle(color: Color(0xFFB5ECDD),
              fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.4)),
            const SizedBox(height: 10),
            Text(tab == 0 ? 'Big finds.\nLocal stores.' : 'Your area.\nYour people.',
              style: const TextStyle(color: Colors.white, fontSize: 32,
                height: 1.05, fontWeight: FontWeight.w900)),
            const SizedBox(height: 11),
            Text(tab == 0
              ? 'Spaza favourites, independent retailers and local products.'
              : 'Discover trusted service providers and request a quote.',
              style: const TextStyle(color: Color(0xFFDAF0E9), fontSize: 13)),
          ])),
        const SizedBox(height: 22),
        Text(tab == 0 ? 'Shop your neighbourhood' : 'Services around you',
          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 21)),
        const SizedBox(height: 10),
        TextField(enabled: false, decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search),
          hintText: tab == 0 ? 'Search local shops and products' : 'Find a local service',
          filled: true, fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(15)))),
        const SizedBox(height: 19),
        const Text('QUICK SHOPS · EXAMPLE CATEGORIES', style: TextStyle(
          letterSpacing: 1.3, color: TeyzaBrand.deepGreen,
          fontWeight: FontWeight.w900, fontSize: 11)),
        const SizedBox(height: 12),
        Wrap(spacing: 10, runSpacing: 10, children:
          (tab == 0 ? [
            ('Spaza & groceries', Icons.storefront),
            ('Food', Icons.lunch_dining), ('Home', Icons.home),
            ('Fashion', Icons.checkroom), ('Electronics', Icons.devices),
          ] : [
            ('Plumbers', Icons.plumbing), ('Electricians', Icons.electrical_services),
            ('Cleaning', Icons.cleaning_services), ('Repairs', Icons.handyman),
            ('Beauty', Icons.spa),
          ]).map((item) => ActionChip(
            backgroundColor: Colors.white, label: Text(item.$1),
            avatar: Icon(item.$2, size: 18, color: TeyzaBrand.deepGreen),
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Category browsing will work after Firebase connection.'))),
          )).toList()),
        const SizedBox(height: 22),
        Card(child: Padding(padding: const EdgeInsets.all(20),
          child: Column(children: [
            Icon(tab == 0 ? Icons.inventory_2_outlined : Icons.handyman_outlined,
              size: 48, color: TeyzaBrand.deepGreen),
            const SizedBox(height: 12),
            const Text('Your local marketplace starts here',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            const SizedBox(height: 5),
            const Text('Real verified shops, prices, stock and service quotes appear once staging is connected.',
              textAlign: TextAlign.center,
              style: TextStyle(color: TeyzaBrand.muted, fontSize: 12)),
          ]))),
      ] else ...[
        const SizedBox(height: 35),
        Icon(icons[tab], size: 64, color: TeyzaBrand.deepGreen),
        const SizedBox(height: 14),
        Center(child: Text(names[tab],
          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900))),
        const SizedBox(height: 12),
        const Text('This area needs Firebase Authentication and the staged marketplace backend. No customer or merchant data is included in this APK.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: TeyzaBrand.muted)),
      ],
    ])),
    bottomNavigationBar: NavigationBar(
      selectedIndex: tab,
      onDestinationSelected: (value) => setState(() => tab = value),
      destinations: [
        for (var i = 0; i < names.length; i++)
          NavigationDestination(icon: Icon(icons[i]), label: names[i]),
      ]),
  );
}
