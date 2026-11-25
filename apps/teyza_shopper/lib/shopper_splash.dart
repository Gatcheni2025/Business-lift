import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'shopper_design.dart';

/// A quiet first frame, never a gate on authentication, photos or location.
/// The home shell replaces this after its first frame; data loads in the feed.
class ShopperLaunchScreen extends StatelessWidget {
  final String message;
  const ShopperLaunchScreen(
      {super.key, this.message = 'Opening your neighbourhood…'});

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: TeyzaDesign.ivory,
        body: SafeArea(
            child: Center(
                child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Semantics(
              liveRegion: true,
              label: 'Teyza. $message',
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Container(
                    width: 104,
                    height: 104,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                        color: TeyzaDesign.softMint,
                        borderRadius: BorderRadius.circular(32)),
                    child:
                        SvgPicture.asset('assets/brand/teyza-sprout-icon.svg')),
                const SizedBox(height: 25),
                SvgPicture.asset('assets/brand/teyza-sprout-wordmark.svg',
                    width: 176, height: 56, fit: BoxFit.contain),
                const SizedBox(height: 12),
                const Text('Good things, close to home.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: TeyzaDesign.forest, fontSize: 17)),
                const SizedBox(height: 44),
                // Static progress respects reduced motion; no endless animation.
                Container(
                    width: 96,
                    height: 4,
                    decoration: BoxDecoration(
                        color: TeyzaDesign.border,
                        borderRadius: BorderRadius.circular(4)),
                    alignment: Alignment.centerLeft,
                    child: Container(
                        width: 38,
                        height: 4,
                        decoration: BoxDecoration(
                            color: TeyzaDesign.forest,
                            borderRadius: BorderRadius.circular(4)))),
                const SizedBox(height: 16),
                Text(message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: TeyzaDesign.muted, fontSize: 13)),
              ])),
        ))),
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
