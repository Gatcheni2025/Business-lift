import 'dart:math';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'market_api.dart';
import 'market_brand.dart';

String dateOnly(DateTime d) => d.year.toString().padLeft(4, '0') + '-' +
  d.month.toString().padLeft(2, '0') + '-' + d.day.toString().padLeft(2, '0');

/// Submit a quote enquiry; this is not a guaranteed appointment or a payment.
Future<void> showServiceRequest(
  BuildContext context, String listingId, Map<String, dynamic> listing,
) async {
  if (FirebaseAuth.instance.currentUser == null) {
    await showLogin(context);
    if (!context.mounted || FirebaseAuth.instance.currentUser == null) return;
  }
  final details = TextEditingController();
  final suburb = TextEditingController();
  DateTime? preferredDate;
  bool sending = false;
  try {
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context, isScrollControlled: true, showDragHandle: true,
      builder: (sheet) => StatefulBuilder(builder: (sheet, update) =>
        SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.viewInsetsOf(sheet).bottom + 28),
          child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Request a service quote', style: TextStyle(
                fontWeight: FontWeight.w900, fontSize: 23, color: TeyzaBrand.ink)),
              const SizedBox(height: 8),
              Text(listing['name']?.toString() ?? 'Local service',
                style: const TextStyle(color: TeyzaBrand.deepGreen, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              const Text('Describe what you need. The provider will review it and send a quote.',
                style: TextStyle(color: TeyzaBrand.muted, fontSize: 12)),
              const SizedBox(height: 12),
              TextField(controller: details, minLines: 3, maxLines: 5,
                decoration: const InputDecoration(labelText: 'Describe your job',
                  hintText: 'Example: Repair a leaking tap')),
              const SizedBox(height: 12),
              TextField(controller: suburb,
                decoration: const InputDecoration(labelText: 'Your suburb / service area')),
              const SizedBox(height: 12),
              OutlinedButton.icon(icon: const Icon(Icons.calendar_today_outlined),
                label: Text(preferredDate == null ?
                  'Preferred date (optional)' : dateOnly(preferredDate!)),
                onPressed: sending ? null : () async {
                  final date = await showDatePicker(context: sheet,
                    initialDate: DateTime.now(), firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)));
                  if (date != null && sheet.mounted) update(() => preferredDate = date);
                }),
              const SizedBox(height: 15),
              FilledButton(onPressed: sending ? null : () async {
                if (details.text.trim().length < 15 || suburb.text.trim().length < 2) {
                  ScaffoldMessenger.of(sheet).showSnackBar(const SnackBar(
                    content: Text('Describe the job and enter your area.')));
                  return;
                }
                update(() => sending = true);
                try {
                  final id = DateTime.now().microsecondsSinceEpoch.toString() + '_' +
                    Random.secure().nextInt(0x7fffffff).toString();
                  await marketCall('requestMarketplaceService', {
                    'listingId': listingId, 'requestId': id,
                    'details': details.text.trim(), 'suburb': suburb.text.trim(),
                    'requestedDate': preferredDate == null ? '' : dateOnly(preferredDate!),
                  });
                  if (!sheet.mounted) return;
                  Navigator.pop(sheet);
                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Quote requested. View progress under Activity.')));
                } catch (e) {
                  if (sheet.mounted) ScaffoldMessenger.of(sheet).showSnackBar(
                    SnackBar(content: Text(marketError(e))));
                } finally {
                  if (sheet.mounted) update(() => sending = false);
                }
              }, child: Text(sending ? 'Sending request…' : 'Send quote request')),
              const SizedBox(height: 10),
              const Text('No payment is taken when you request a quote.',
                textAlign: TextAlign.center, style: TextStyle(
                  color: TeyzaBrand.muted, fontSize: 11)),
            ]),
        ),
      ),
    );
  } finally {
    details.dispose();
    suburb.dispose();
  }
}

class ServiceEnquiriesPage extends StatelessWidget {
  const ServiceEnquiriesPage({super.key});
  Future<void> decide(BuildContext context, String id, String action) async {
    try {
      await marketCall('decideMarketplaceServiceQuote', {
        'requestId': id, 'action': action,
      });
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(marketError(e))));
    }
  }
  @override
  Widget build(BuildContext context) => StreamBuilder<User?>(
    stream: FirebaseAuth.instance.authStateChanges(),
    builder: (context, auth) {
      if (auth.data == null) return Center(child: FilledButton(
        onPressed: () => showLogin(context),
        child: const Text('Sign in to view service quotes')));
      return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: FirebaseFirestore.instance.collection('teyzaMarketplaceServiceRequests')
          .where('buyerUid', isEqualTo: auth.data!.uid).limit(100).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) return Center(child: Text(marketError(snapshot.error!)));
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          if (snapshot.data!.docs.isEmpty) return const Center(
            child: Text('Your service quote requests will appear here.'));
          return ListView(padding: const EdgeInsets.all(16),
            children: snapshot.data!.docs.map((doc) {
              final d = doc.data();
              final status = d['status']?.toString() ?? 'pending_quote';
              final quote = (d['quotedAmountCents'] as num?)?.toInt();
              return Card(child: Padding(padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(d['serviceName']?.toString() ?? 'Service', style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w900)),
                  Text(d['providerName']?.toString() ?? 'Provider'),
                  const SizedBox(height: 5),
                  Text('Status: ' + status + ' · ' + (d['suburb']?.toString() ?? ''),
                    style: const TextStyle(color: TeyzaBrand.muted, fontSize: 12)),
                  if (quote != null) ...[
                    const SizedBox(height: 8),
                    Text('Quoted price: ' + zar(quote), style: const TextStyle(
                      fontWeight: FontWeight.bold, color: TeyzaBrand.deepGreen)),
                    Text(d['quoteNote']?.toString() ?? ''),
                  ],
                  if (status == 'quoted') Wrap(spacing: 9, children: [
                    OutlinedButton(onPressed: () => decide(context, doc.id, 'decline'),
                      child: const Text('Decline quote')),
                    FilledButton(onPressed: () => decide(context, doc.id, 'accept'),
                      child: const Text('Accept quote')),
                  ]),
                  if (status == 'quote_accepted') const Text(
                    'Quote accepted. Confirm the appointment and payment directly with the provider.',
                    style: TextStyle(fontSize: 12, color: TeyzaBrand.muted)),
                ])));
            }).toList());
        },
      );
    },
  );
}

class CustomerActivityPage extends StatelessWidget {
  final Widget ordersPage;
  const CustomerActivityPage({super.key, required this.ordersPage});
  @override
  Widget build(BuildContext context) => DefaultTabController(length: 2,
    child: Column(children: [
      const TabBar(tabs: [
        Tab(text: 'Purchases', icon: Icon(Icons.shopping_bag_outlined)),
        Tab(text: 'Services', icon: Icon(Icons.handyman_outlined)),
      ]),
      Expanded(child: TabBarView(children: [
        ordersPage, const ServiceEnquiriesPage(),
      ])),
    ]));
}
