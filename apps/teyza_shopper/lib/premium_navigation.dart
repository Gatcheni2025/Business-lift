import 'package:flutter/material.dart';
import 'shopper_design.dart';

/// Five equally reachable shopper destinations; business access is in Account.
class PremiumShopperNavigation extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onSelect;
  const PremiumShopperNavigation(
      {super.key, required this.selectedIndex, required this.onSelect});

  Widget destination(BuildContext context, int index, String label,
      IconData active, IconData idle) {
    final selected = selectedIndex == index;
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return Expanded(
        child: Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Tooltip(
          message: label,
          child: InkWell(
            key: ValueKey('nav-${label.toLowerCase()}'),
            onTap: () => onSelect(index),
            borderRadius: BorderRadius.circular(16),
            child: Padding(
                padding:
                    const EdgeInsets.symmetric(vertical: 10, horizontal: 2),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  AnimatedContainer(
                      duration: reducedMotion
                          ? Duration.zero
                          : const Duration(milliseconds: 160),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 15, vertical: 5),
                      decoration: BoxDecoration(
                          color: selected
                              ? TeyzaDesign.softMint
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(13)),
                      child: Icon(selected ? active : idle,
                          size: 23,
                          color: selected
                              ? TeyzaDesign.leaf
                              : TeyzaDesign.muted)),
                  const SizedBox(height: 3),
                  Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 11,
                          height: 1.2,
                          color:
                              selected ? TeyzaDesign.leaf : TeyzaDesign.muted,
                          fontWeight:
                              selected ? FontWeight.w700 : FontWeight.w400)),
                ])),
          )),
    ));
  }

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: TeyzaDesign.border))),
        child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                destination(context, 0, 'Home', Icons.home_rounded,
                    Icons.home_outlined),
                destination(context, 5, 'Discover', Icons.explore_rounded,
                    Icons.explore_outlined),
                destination(context, 1, 'Shop', Icons.shopping_bag_rounded,
                    Icons.shopping_bag_outlined),
                destination(context, 3, 'Orders', Icons.receipt_long_rounded,
                    Icons.receipt_long_outlined),
                destination(context, 4, 'Account', Icons.person_rounded,
                    Icons.person_outline_rounded),
              ]),
            )),
      );
}
