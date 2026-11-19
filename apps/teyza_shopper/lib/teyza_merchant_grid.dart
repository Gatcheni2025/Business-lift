import 'package:flutter/material.dart';

/// Compact, independent merchant category shelf for the Teyza home screen.
/// The caller supplies only approved public Teyza merchants or public directory
/// listings from one requested category; this widget never merges shop types.
class TeyzaMerchantGridItem {
  final String id;
  final String name;
  final Widget image;
  final bool verified;
  final VoidCallback onTap;
  const TeyzaMerchantGridItem({
    required this.id,required this.name,required this.image,
    required this.onTap,this.verified=false,
  });
}

class TeyzaMerchantGrid extends StatelessWidget {
  final List<TeyzaMerchantGridItem> merchants;
  final VoidCallback onViewAll;
  final String categoryKey;
  final String emptyLabel;
  const TeyzaMerchantGrid({super.key,required this.merchants,
    required this.onViewAll,required this.categoryKey,required this.emptyLabel});

  static const dark=Color(0xFF141C2D);
  static const mint=Color(0xFF76E4BE);

  @override
  Widget build(BuildContext context) {
    if(merchants.isEmpty){
      return Material(
        key:ValueKey('teyza-$categoryKey-empty'),
        color:const Color(0xFFF0F5F2),borderRadius:BorderRadius.circular(20),
        child:ListTile(
          leading:const Icon(Icons.location_on_outlined,color:Color(0xFF087657)),
          title:Text(emptyLabel),
          trailing:const Icon(Icons.chevron_right_rounded),
          onTap:onViewAll));
    }
    // Leave a final View all tile when more than seven merchants are available.
    final hasMore=merchants.length>8;
    final shown=merchants.take(hasMore?7:8).toList();
    return Container(
      key:ValueKey('teyza-$categoryKey-grid'),
      padding:const EdgeInsets.fromLTRB(12,15,12,14),
      decoration:BoxDecoration(color:dark,borderRadius:BorderRadius.circular(22)),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(categoryKey=='spaza'?'SHOP IN YOUR COMMUNITY':'LOCAL SERVICES & BUSINESSES',
          style:const TextStyle(color:mint,fontSize:10,
            fontWeight:FontWeight.w900,letterSpacing:1.1)),
        const SizedBox(height:13),
        LayoutBuilder(builder:(context,size)=>GridView.builder(
          shrinkWrap:true,
          physics:const NeverScrollableScrollPhysics(),
          itemCount:shown.length+(hasMore?1:0),
          gridDelegate:SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount:size.maxWidth<285?3:4,
            crossAxisSpacing:6,mainAxisSpacing:14,mainAxisExtent:116),
          itemBuilder:(context,index){
            if(index>=shown.length){
              return _tile(
                key:ValueKey('teyza-$categoryKey-view-all'),
                name:'View all',
                image:const Icon(Icons.arrow_forward_rounded,color:mint,size:28),
                onTap:onViewAll,
                highlight:true);
            }
            final item=shown[index];
            return _tile(
              key:ValueKey('teyza-$categoryKey-${item.id}'),
              name:item.name,image:item.image,onTap:item.onTap,
              verified:item.verified);
          }))
      ]));
  }

  Widget _tile({required Key key,required String name,
    required Widget image,required VoidCallback onTap,bool verified=false,
    bool highlight=false})=>Semantics(
      button:true,label:highlight?'View all merchants':name,
      child:Material(color:Colors.transparent,
        child:InkWell(key:key,onTap:onTap,borderRadius:BorderRadius.circular(13),
          child:Column(mainAxisSize:MainAxisSize.min,children:[
            Stack(clipBehavior:Clip.none,children:[
              Container(width:68,height:68,
                decoration:BoxDecoration(
                  color:highlight?const Color(0xFF263B43):Colors.white,
                  borderRadius:BorderRadius.circular(15)),
                clipBehavior:Clip.antiAlias,
                child:Center(child:image)),
              if(verified)
                const Positioned(right:-2,bottom:-4,
                  child:CircleAvatar(radius:10,backgroundColor:mint,
                    child:Icon(Icons.verified_rounded,color:dark,size:13)))
            ]),
            const SizedBox(height:6),
            Text(name,maxLines:2,overflow:TextOverflow.ellipsis,
              textAlign:TextAlign.center,
              style:TextStyle(color:Colors.white,fontWeight:highlight?
                FontWeight.w800:FontWeight.w600,fontSize:11,height:1.15))
          ]))));
}
