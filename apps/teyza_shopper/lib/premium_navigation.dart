import 'package:flutter/material.dart';

/// Shopper destinations. Merchant access lives in the account role selector.
class PremiumShopperNavigation extends StatelessWidget {
  final int selectedIndex, cartCount;
  final ValueChanged<int> onSelect;
  const PremiumShopperNavigation({super.key,required this.selectedIndex,
    required this.cartCount,required this.onSelect});
  static const green=Color(0xFF3BB77E),ink=Color(0xFF010F1C),muted=Color(0xFF89929B);

  Widget destination(int index,String label,IconData active,IconData idle){
    final selected=selectedIndex==index;
    return Expanded(child:Semantics(button:true,selected:selected,label:label,
      child:InkWell(onTap:()=>onSelect(index),borderRadius:BorderRadius.circular(20),
        child:ConstrainedBox(constraints:const BoxConstraints(minHeight:56),
          child:Padding(padding:const EdgeInsets.symmetric(vertical:7),
            child:Column(mainAxisSize:MainAxisSize.min,children:[
              AnimatedContainer(duration:const Duration(milliseconds:180),
                padding:const EdgeInsets.symmetric(horizontal:14,vertical:4),
                decoration:BoxDecoration(color:selected?const Color(0xFFE6F7EE):Colors.transparent,
                  borderRadius:BorderRadius.circular(13)),
                child:Icon(selected?active:idle,color:selected?green:muted,size:23)),
              const SizedBox(height:2),
              Text(label,maxLines:1,style:TextStyle(fontSize:10,
                fontWeight:selected?FontWeight.w700:FontWeight.w400,
                color:selected?green:muted))
            ]))))));
  }

  @override
  Widget build(BuildContext context)=>SafeArea(top:false,
    child:Padding(padding:const EdgeInsets.fromLTRB(12,4,12,10),
      child:Container(decoration:BoxDecoration(color:Colors.white,
        borderRadius:BorderRadius.circular(27),
        border:Border.all(color:const Color(0xFFF0F1F2)),
        boxShadow:const [BoxShadow(color:Color(0x0C010F1C),blurRadius:24,offset:Offset(0,5))]),
        child:Material(color:Colors.transparent,borderRadius:BorderRadius.circular(27),
          child:Row(crossAxisAlignment:CrossAxisAlignment.center,children:[
            destination(0,'Home',Icons.home_rounded,Icons.home_outlined),
            destination(1,'Shops',Icons.storefront_rounded,Icons.storefront_outlined),
            Expanded(child:Semantics(button:true,selected:selectedIndex==2,label:'Cart',
              child:InkWell(onTap:()=>onSelect(2),borderRadius:BorderRadius.circular(24),
                child:Padding(padding:const EdgeInsets.symmetric(vertical:7),
                  child:Column(mainAxisSize:MainAxisSize.min,children:[
                    Container(width:48,height:48,
                      decoration:const BoxDecoration(color:green,shape:BoxShape.circle,
                        boxShadow:[BoxShadow(color:Color(0x303BB77E),blurRadius:12,offset:Offset(0,4))]),
                      child:Center(child:Badge(isLabelVisible:cartCount>0,
                        label:Text(cartCount>99?'99+':cartCount.toString()),
                        child:const Icon(Icons.shopping_cart_outlined,color:Colors.white,size:24)))),
                    const SizedBox(height:2),
                    Text('Cart',style:TextStyle(fontSize:10,
                      fontWeight:FontWeight.w700,color:selectedIndex==2?green:muted))
                  ]))))),
            destination(3,'Orders',Icons.receipt_long_rounded,Icons.receipt_long_outlined),
            destination(4,'Account',Icons.person_rounded,Icons.person_outline_rounded)
          ])))));
}
