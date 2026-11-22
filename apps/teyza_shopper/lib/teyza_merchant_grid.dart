import 'package:flutter/material.dart';

/// Swipeable, category-specific shelf. Sources are supplied by the trusted
/// public Teyza catalogue or a public directory; no seller drafts are shown.
class TeyzaMerchantGridItem {
  final String id;
  final String name;
  final String subtitle;
  final Widget image;
  final bool verified;
  final VoidCallback onTap;
  const TeyzaMerchantGridItem({
    required this.id,required this.name,required this.image,
    required this.onTap,this.verified=false,this.subtitle='',
  });
}

class TeyzaMerchantGrid extends StatelessWidget {
  final List<TeyzaMerchantGridItem> merchants;
  // Kept for compatibility with callers, but no longer redirects to another
  // page; the entire shelf is browsable by swiping.
  final VoidCallback onViewAll;
  final String categoryKey;
  final String emptyLabel;
  const TeyzaMerchantGrid({super.key,required this.merchants,
    required this.onViewAll,required this.categoryKey,required this.emptyLabel});

  static const forest=Color(0xFF06483C);
  static const muted=Color(0xFF64736E);
  static const cream=Color(0xFFFFF9F1);

  @override
  Widget build(BuildContext context) {
    if(merchants.isEmpty) {
      return Container(key:ValueKey('teyza-$categoryKey-empty'),
        padding:const EdgeInsets.all(16),
        decoration:BoxDecoration(color:cream,borderRadius:BorderRadius.circular(22),
          border:Border.all(color:const Color(0xFFF0E6D6))),
        child:Row(children:[
          const Icon(Icons.storefront_outlined,color:forest,size:30),
          const SizedBox(width:12),
          Expanded(child:Text(emptyLabel,style:const TextStyle(color:muted,fontSize:12))),
        ]));
    }
    return Container(key:ValueKey('teyza-$categoryKey-grid'),
      padding:const EdgeInsets.fromLTRB(12,15,0,13),
      decoration:BoxDecoration(
        color:cream,borderRadius:BorderRadius.circular(22),
        border:Border.all(color:const Color(0xFFF0E6D6))),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Padding(padding:const EdgeInsets.only(right:14,bottom:12),
          child:Row(children:[
            Expanded(child:Text(categoryKey=='spaza'?'SHOP IN YOUR COMMUNITY':'DISCOVER LOCAL BUSINESSES',
              style:const TextStyle(color:forest,fontWeight:FontWeight.w900,
                fontSize:11,letterSpacing:1))),
            const Icon(Icons.swipe_left_outlined,color:muted,size:18),
            const SizedBox(width:5),
            const Text('Swipe to explore',style:TextStyle(color:muted,fontSize:11)),
          ])),
        SizedBox(height:211,child:ListView.separated(
          key:ValueKey('teyza-$categoryKey-horizontal-shelf'),
          scrollDirection:Axis.horizontal,
          physics:const BouncingScrollPhysics(),
          itemCount:merchants.length,
          padding:const EdgeInsets.only(right:12),
          separatorBuilder:(_,__)=>const SizedBox(width:10),
          itemBuilder:(context,index)=>_tile(merchants[index]))),
      ]));
  }

  Widget _tile(TeyzaMerchantGridItem item)=>Semantics(
    button:true,label:'Open '+item.name,
    child:Material(color:Colors.white,borderRadius:BorderRadius.circular(17),
      child:InkWell(
        key:ValueKey('nearby-${item.id}'),
        onTap:item.onTap,borderRadius:BorderRadius.circular(17),
        child:Container(width:164,
          clipBehavior:Clip.antiAlias,
          decoration:BoxDecoration(
            borderRadius:BorderRadius.circular(17),
            border:Border.all(color:const Color(0xFFE8EDE5))),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            SizedBox(height:112,width:164,child:Stack(fit:StackFit.expand,children:[
              ColoredBox(color:const Color(0xFFE7F0E8),
                child:ClipRect(child:FittedBox(fit:BoxFit.cover,child:item.image))),
              if(item.verified)
                Positioned(top:8,left:8,child:Container(
                  padding:const EdgeInsets.symmetric(horizontal:7,vertical:4),
                  decoration:BoxDecoration(color:forest,borderRadius:BorderRadius.circular(12)),
                  child:const Row(mainAxisSize:MainAxisSize.min,children:[
                    Icon(Icons.verified_rounded,color:Colors.white,size:12),
                    SizedBox(width:4),
                    Text('Teyza verified',style:TextStyle(color:Colors.white,fontSize:9,fontWeight:FontWeight.w800))
                  ]))),
            ])),
            Expanded(child:Padding(padding:const EdgeInsets.fromLTRB(10,8,8,8),
              child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text(item.name,maxLines:1,overflow:TextOverflow.ellipsis,
                  style:const TextStyle(color:Color(0xFF163129),fontWeight:FontWeight.w900,fontSize:13)),
                const SizedBox(height:4),
                Text(item.subtitle.isEmpty?'View shop profile':item.subtitle,
                  maxLines:1,overflow:TextOverflow.ellipsis,
                  style:const TextStyle(color:muted,fontSize:10)),
                const Spacer(),
                const Row(children:[
                  Text('Explore shop',style:TextStyle(color:forest,fontWeight:FontWeight.w800,fontSize:11)),
                  SizedBox(width:5),Icon(Icons.arrow_forward_rounded,color:forest,size:15),
                ])
              ]))),
          ]))))); 
}
