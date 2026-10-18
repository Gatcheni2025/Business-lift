import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'market_api.dart';

class SellerPage extends StatefulWidget {
  const SellerPage({super.key});
  @override
  State<SellerPage> createState() => _SellerPageState();
}

class _SellerPageState extends State<SellerPage> {
  final name = TextEditingController();
  final city = TextEditingController();
  final suburb = TextEditingController();
  final deliveryFee = TextEditingController(text: '15.00');
  String type = 'spaza';
  bool pickup = true, delivery = false, busy = false;

  @override
  void dispose() {
    name.dispose();
    city.dispose();
    suburb.dispose();
    deliveryFee.dispose();
    super.dispose();
  }

  Future<void> register() async {
    setState(() => busy = true);
    try {
      await marketCall('registerMarketplaceShop', {
        'name': name.text.trim(),
        'city': city.text.trim(),
        'suburb': suburb.text.trim(),
        'type': type,
        'pickupEnabled': pickup,
        'deliveryEnabled': delivery,
        'deliveryFeeCents': delivery ? randCents(deliveryFee.text) : 0,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Shop submitted. Await manual Teyza approval.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(marketError(e))));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<User?>(
    stream: FirebaseAuth.instance.authStateChanges(),
    builder: (context, current) {
      if (current.data == null) return Center(child: FilledButton(
        onPressed: () => showLogin(context), child: const Text('Sign in to open a shop')));
      return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance.collection('teyzaMarketplaceShops')
          .doc(current.data!.uid).snapshots(),
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text(marketError(snap.error!)));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final shop = snap.data!.data();
          if (shop == null) return registerForm();
          return sellerDashboard(shop, current.data!.uid);
        });
    },
  );

  Widget registerForm() => ListView(padding: const EdgeInsets.all(18), children: [
    const Text('Launch your digital shop',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
    const SizedBox(height: 10),
    const Text('Spaza stores, informal traders, retailers, wholesalers and service providers.'),
    const SizedBox(height: 16),
    TextField(controller: name, decoration: const InputDecoration(labelText: 'Business name')),
    const SizedBox(height: 12),
    DropdownButtonFormField<String>(
      initialValue: type, decoration: const InputDecoration(labelText: 'I am a'),
      items: const [
        DropdownMenuItem(value: 'spaza', child: Text('Spaza shop')),
        DropdownMenuItem(value: 'retailer', child: Text('Retailer')),
        DropdownMenuItem(value: 'informal_seller', child: Text('Informal seller')),
        DropdownMenuItem(value: 'wholesaler', child: Text('Wholesaler')),
        DropdownMenuItem(value: 'service_provider', child: Text('Service provider')),
      ],
      onChanged: (v) => setState(() => type = v!)),
    const SizedBox(height: 12),
    TextField(controller: city, decoration: const InputDecoration(labelText: 'City / town')),
    const SizedBox(height: 12),
    TextField(controller: suburb, decoration: const InputDecoration(labelText: 'Suburb / township')),
    SwitchListTile(value: pickup, onChanged: (v) => setState(() => pickup = v),
      title: const Text('Offer customer collection')),
    SwitchListTile(value: delivery, onChanged: (v) => setState(() => delivery = v),
      title: const Text('Offer shop delivery')),
    if (delivery) TextField(controller: deliveryFee,
      decoration: const InputDecoration(labelText: 'Delivery fee in Rand'),
      keyboardType: const TextInputType.numberWithOptions(decimal: true)),
    const SizedBox(height: 14),
    FilledButton(onPressed: busy ? null : register,
      child: Text(busy ? 'Submitting…' : 'Submit shop for verification')),
    const SizedBox(height: 12),
    const Text('Listings are hidden until Teyza approves the seller. Wholesale onboarding is separate.',
      style: TextStyle(fontSize: 12, color: Colors.black54)),
  ]);

  Widget sellerDashboard(Map<String, dynamic> shop, String uid) {
    final approved = shop['status'] == 'approved';
    return ListView(padding: const EdgeInsets.all(18), children: [
      Text(shop['name']?.toString() ?? 'My Teyza shop',
        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
      const SizedBox(height: 6),
      Text(approved ? 'Approved merchant' :
        'Verification status: ' + (shop['status']?.toString() ?? 'pending'),
        style: TextStyle(color: approved ? teyzaGreen : Colors.deepOrange)),
      if (approved) ...[
        const SizedBox(height: 14),
        FilledButton.icon(onPressed: addListing,
          icon: const Icon(Icons.add), label: const Text('Add a product or service')),
      ] else const Padding(padding: EdgeInsets.symmetric(vertical: 18),
        child: Text('Teyza will verify your business before you can publish.')),
      const SizedBox(height: 20),
      const Text('Incoming orders', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
      StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance.collection('teyzaMarketplaceOrders')
          .where('sellerUid', isEqualTo: uid).limit(100).snapshots(),
        builder: (context, snap) {
          if (snap.hasError) return Text(marketError(snap.error!));
          if (!snap.hasData) return const LinearProgressIndicator();
          if (snap.data!.docs.isEmpty) return const Padding(
            padding: EdgeInsets.all(18), child: Text('No new orders yet.'));
          return Column(children: snap.data!.docs.map((doc) {
            final order = doc.data();
            final status = order['status']?.toString() ?? '';
            final actions = status == 'pending_seller' ? ['accept', 'decline'] :
              status == 'accepted' ? ['ready'] :
              status == 'ready' ? ['fulfilled'] : <String>[];
            return Card(child: Padding(padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(zar((order['totalCents'] as num?)?.toInt() ?? 0) + ' · ' + status,
                  style: const TextStyle(fontWeight: FontWeight.bold)),
                Text(order['fulfilment']?.toString() ?? ''),
                if ((order['deliveryAddress']?.toString() ?? '').isNotEmpty)
                  Text(order['deliveryAddress'].toString()),
                Wrap(spacing: 8, children: actions.map((action) => OutlinedButton(
                  onPressed: () async {
                    try {
                      await marketCall('reviewMarketplaceOrder', {
                        'orderId': doc.id, 'action': action});
                    } catch (e) {
                      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(marketError(e))));
                    }
                  }, child: Text(action.toUpperCase()))).toList()),
              ])));
          }).toList());
        }),
      const SizedBox(height: 14),
      const Text('Payments remain unpaid until a verified settlement flow is installed.',
        style: TextStyle(fontSize: 12, color: Colors.black54)),
    ]);
  }

  Future<void> addListing() async {
    final productName = TextEditingController();
    final description = TextEditingController();
    final price = TextEditingController();
    final stock = TextEditingController(text: '10');
    final image = TextEditingController();
    bool sending = false, uploading = false;
    String kind = 'product', category = 'groceries';
    try {
      await showModalBottomSheet<void>(context: context, isScrollControlled: true,
        showDragHandle: true, builder: (sheet) => StatefulBuilder(builder: (sheet, update) =>
        SingleChildScrollView(child: Padding(
          padding: EdgeInsets.fromLTRB(18, 10, 18, MediaQuery.viewInsetsOf(sheet).bottom + 24),
          child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Publish on Teyza',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: kind, decoration: const InputDecoration(labelText: 'Listing type'),
              items: const [
                DropdownMenuItem(value: 'product', child: Text('Product')),
                DropdownMenuItem(value: 'service', child: Text('Service (enquiries coming later)')),
              ], onChanged: (v) => update(() {
                kind = v!;
                category = kind == 'service' ? 'services' : 'groceries';
              })),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(key: ValueKey(kind), initialValue: category,
              decoration: const InputDecoration(labelText: 'Category'),
              items: (kind == 'service' ? ['services'] :
                ['groceries', 'food', 'household', 'beauty', 'fashion', 'electronics', 'other'])
                .map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => update(() => category = v!)),
            const SizedBox(height: 10),
            TextField(controller: productName,
              decoration: const InputDecoration(labelText: 'Product or service name')),
            const SizedBox(height: 10),
            TextField(controller: description, minLines: 2, maxLines: 3,
              decoration: const InputDecoration(labelText: 'Description')),
            const SizedBox(height: 10),
            TextField(controller: price, keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Price in Rand')),
            if (kind == 'product') ...[
              const SizedBox(height: 10),
              TextField(controller: stock, keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Available quantity')),
            ],
            const SizedBox(height: 10),
            TextField(controller: image,
              decoration: const InputDecoration(labelText: 'Product photo URL (or upload below)')),
            const SizedBox(height: 9),
            if (image.text.isNotEmpty) ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network(image.text, height: 135, fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox(height: 45,
                  child: Center(child: Text('Photo preview unavailable'))))),
            OutlinedButton.icon(
              onPressed: sending || uploading ? null : () async {
                update(() => uploading = true);
                try {
                  final selected = await ImagePicker().pickImage(
                    source: ImageSource.gallery, imageQuality: 80, maxWidth: 1600);
                  if (selected == null) return;
                  final filename = selected.name.toLowerCase();
                  final png = filename.endsWith('.png');
                  if (!png && !filename.endsWith('.jpg') && !filename.endsWith('.jpeg')) {
                    throw const FormatException('Choose a JPG or PNG photo.');
                  }
                  final bytes = await selected.readAsBytes();
                  if (bytes.isEmpty || bytes.length > 5 * 1024 * 1024) {
                    throw const FormatException('Product photos must be below 5 MB.');
                  }
                  final uid = FirebaseAuth.instance.currentUser?.uid;
                  if (uid == null) throw const FormatException('Sign in to upload photos.');
                  final extension = png ? '.png' : '.jpg';
                  final storageRef = FirebaseStorage.instance.ref()
                    .child('teyza_marketplace_products/' + uid + '/p_' +
                      DateTime.now().microsecondsSinceEpoch.toString() + extension);
                  final saved = await storageRef.putData(bytes,
                    SettableMetadata(contentType: png ? 'image/png' : 'image/jpeg'));
                  final url = await saved.ref.getDownloadURL();
                  if (sheet.mounted) update(() => image.text = url);
                } catch (e) {
                  if (sheet.mounted) ScaffoldMessenger.of(sheet).showSnackBar(
                    SnackBar(content: Text(marketError(e))));
                } finally {
                  if (sheet.mounted) update(() => uploading = false);
                }
              },
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(uploading ? 'Uploading photo…' : 'Choose photo from phone')),
            const SizedBox(height: 16),
            FilledButton(onPressed: sending ? null : () async {
              update(() => sending = true);
              try {
                await marketCall('publishMarketplaceListing', {
                  'name': productName.text.trim(), 'description': description.text.trim(),
                  'kind': kind, 'category': category, 'priceCents': randCents(price.text),
                  'stock': kind == 'service' ? 0 : int.parse(stock.text.trim()),
                  'imageUrl': image.text.trim(),
                });
                if (sheet.mounted) Navigator.pop(sheet);
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Listing successfully published.')));
              } catch (e) {
                if (sheet.mounted) ScaffoldMessenger.of(sheet).showSnackBar(
                  SnackBar(content: Text(marketError(e))));
              } finally {
                if (sheet.mounted) update(() => sending = false);
              }
            }, child: Text(sending ? 'Publishing…' : 'Publish listing')),
          ]),
        ))));
    } finally {
      productName.dispose();
      description.dispose();
      price.dispose();
      stock.dispose();
      image.dispose();
    }
  }
}
