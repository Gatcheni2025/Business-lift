import 'package:flutter/material.dart';
import 'shopper_design.dart';

/// Public catalogue/directory items only; verification is never inferred.
class TeyzaMerchantGridItem {
  final String id, name, subtitle;
  final Widget image;
  final bool verified;
  final VoidCallback onTap;
  const TeyzaMerchantGridItem(
      {required this.id,
      required this.name,
      required this.image,
      required this.onTap,
      this.verified = false,
      this.subtitle = ''});
}

class TeyzaMerchantGrid extends StatelessWidget {
  final List<TeyzaMerchantGridItem> merchants;
  final VoidCallback onViewAll;
  final String categoryKey, emptyLabel;
  const TeyzaMerchantGrid(
      {super.key,
      required this.merchants,
      required this.onViewAll,
      required this.categoryKey,
      required this.emptyLabel});

  @override
  Widget build(BuildContext context) {
    if (merchants.isEmpty) {
      return Container(
          key: ValueKey('teyza-$categoryKey-empty'),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: TeyzaDesign.border)),
          child: Row(children: [
            Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                    color: TeyzaDesign.softMint,
                    borderRadius: BorderRadius.circular(14)),
                child: Icon(
                    categoryKey == 'spaza'
                        ? Icons.storefront_outlined
                        : Icons.business_center_outlined,
                    color: TeyzaDesign.forest,
                    size: 24)),
            const SizedBox(width: 13),
            Expanded(
                child: Text(emptyLabel,
                    style: const TextStyle(
                        color: TeyzaDesign.muted, fontSize: 13, height: 1.4))),
          ]));
    }
    final textGrowth =
        (MediaQuery.textScalerOf(context).scale(14) - 14).clamp(0.0, 42.0);
    return SizedBox(
        key: ValueKey('teyza-$categoryKey-grid'),
        height: 242 + textGrowth * 5,
        child: ListView.separated(
          key: ValueKey('teyza-$categoryKey-horizontal-shelf'),
          scrollDirection: Axis.horizontal,
          itemCount: merchants.length,
          padding: const EdgeInsets.only(bottom: 3),
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (context, index) => _tile(merchants[index]),
        ));
  }

  Widget _tile(TeyzaMerchantGridItem item) => Semantics(
        button: true,
        label: 'Open ${item.name}',
        child: Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              key: ValueKey('nearby-${item.id}'),
              onTap: item.onTap,
              borderRadius: BorderRadius.circular(20),
              child: Container(
                  width: 172,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: TeyzaDesign.border)),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                            height: 116,
                            width: 172,
                            child: Stack(fit: StackFit.expand, children: [
                              ColoredBox(
                                  color: TeyzaDesign.softMint,
                                  child: ClipRect(
                                      child: FittedBox(
                                          fit: BoxFit.cover,
                                          child: item.image))),
                              if (item.verified)
                                Positioned(
                                    top: 9,
                                    left: 9,
                                    child: Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 5),
                                        decoration: BoxDecoration(
                                            color: Colors.white,
                                            borderRadius:
                                                BorderRadius.circular(10)),
                                        child: const Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Icon(Icons.verified_rounded,
                                                  color: TeyzaDesign.forest,
                                                  size: 13),
                                              SizedBox(width: 4),
                                              Text('Teyza verified',
                                                  style: TextStyle(
                                                      color: TeyzaDesign.forest,
                                                      fontSize: 9,
                                                      fontWeight:
                                                          FontWeight.w700)),
                                            ]))),
                            ])),
                        Expanded(
                            child: Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(12, 12, 12, 12),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(item.name,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              color: TeyzaDesign.ink,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 15,
                                              height: 1.15)),
                                      const SizedBox(height: 5),
                                      Text(
                                          item.subtitle.isEmpty
                                              ? 'View shop profile'
                                              : item.subtitle,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              color: TeyzaDesign.muted,
                                              fontSize: 11)),
                                      const Spacer(),
                                      const Row(children: [
                                        Expanded(
                                            child: Text('Explore shop',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                    color: TeyzaDesign.forest,
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 12))),
                                        SizedBox(width: 4),
                                        Icon(Icons.arrow_forward_rounded,
                                            color: TeyzaDesign.forest,
                                            size: 17),
                                      ]),
                                    ]))),
                      ])),
            )),
      );
}
