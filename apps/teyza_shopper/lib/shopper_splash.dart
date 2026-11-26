import 'package:flutter/material.dart';
import 'shopper_design.dart';

/// A quiet first frame, never a gate on authentication, photos or location.
/// The home shell replaces this after its first frame; data loads in the feed.
class ShopperLaunchScreen extends StatelessWidget {
  final String message;
  const ShopperLaunchScreen(
      {super.key, this.message = 'Opening your neighbourhood…'});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: TeyzaDesign.deepTeal,
        body: TeyzaBrandPanel(radius: 0, padding: EdgeInsets.zero,
          child: SafeArea(
            child: Center(
                child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Semantics(
              liveRegion: true,
              label: 'Teyza. $message',
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const TeyzaWordmark(width: 240, darkSurface: true),
                const SizedBox(height: 22),
                const Text('Good things, close to home.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white, fontSize: 21,
                      fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                const Text('Shop · Discover · Order · Grow',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: TeyzaDesign.mint, fontSize: 14,
                      fontWeight: FontWeight.w700)),
                const SizedBox(height: 44),
                // Static progress respects reduced motion; no endless animation.
                Container(
                    width: 96,
                    height: 4,
                    decoration: BoxDecoration(
                        color: const Color(0x3379D91B),
                        borderRadius: BorderRadius.circular(4)),
                    alignment: Alignment.centerLeft,
                    child: Container(
                        width: 38,
                        height: 4,
                        decoration: BoxDecoration(
                            color: TeyzaDesign.lime,
                            borderRadius: BorderRadius.circular(4)))),
                const SizedBox(height: 16),
                Text(message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white, fontSize: 13)),
              ])),
        )))),
      );
}

/// Non-animated loading content. Navigation and location stay usable while
/// remote data loads, including for people who request reduced motion.
class ShopperShelfLoading extends StatelessWidget {
  final String label;
  const ShopperShelfLoading({super.key, required this.label});
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        label: label,
        child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: TeyzaDesign.border),
                borderRadius: BorderRadius.circular(20)),
            child: Row(children: [
              Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                      color: TeyzaDesign.softMint,
                      borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.storefront_outlined,
                      color: TeyzaDesign.muted)),
              const SizedBox(width: 14),
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text(label,
                        style: const TextStyle(
                            color: TeyzaDesign.muted, fontSize: 13)),
                    const SizedBox(height: 10),
                    Container(
                        height: 5,
                        decoration: BoxDecoration(
                            color: TeyzaDesign.softMint,
                            borderRadius: BorderRadius.circular(5))),
                  ])),
            ])),
      );
}
