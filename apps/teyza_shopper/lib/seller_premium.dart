import 'package:flutter/material.dart';
import 'seller_firestore.dart';

const sellerCanvas=Color(0xFFF6F7F2);
class SellerShopHero extends StatelessWidget{
  final SellerShop shop;final int? productCount;final int unread;
  final VoidCallback onNotifications;
  const SellerShopHero({super.key,required this.shop,required this.productCount,required this.onNotifications,this.unread=0});
  @override Widget build(BuildContext context)=>Container(padding:const EdgeInsets.all(23),
    decoration:BoxDecoration(gradient:const LinearGradient(begin:Alignment.topLeft,end:Alignment.bottomRight,
      colors:[Color(0xFF010F1C),Color(0xFF123E31)]),borderRadius:BorderRadius.circular(28),
      boxShadow:const [BoxShadow(color:Color(0x16010F1C),blurRadius:20,offset:Offset(0,8))]),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Row(children:[Expanded(child:Align(alignment:Alignment.centerLeft,child:Container(padding:const EdgeInsets.symmetric(horizontal:11,vertical:7),
        decoration:BoxDecoration(color:const Color(0xFF244C3E),borderRadius:BorderRadius.circular(30)),
        child:const Text('TEYZA  /  FOR BUSINESS',style:TextStyle(color:Color(0xFFB7EACD),fontSize:10,fontWeight:FontWeight.w700,letterSpacing:1))))),
        Badge(isLabelVisible:unread>0,label:Text(unread>=100?'99+':'$unread'),
          child:IconButton(tooltip:'Shop notifications',onPressed:onNotifications,icon:const Icon(Icons.notifications_none_rounded,color:Colors.white)))]),
      const SizedBox(height:17),Text(shop.name.isEmpty?'Your neighbourhood shop':shop.name,
        style:const TextStyle(color:Colors.white,fontSize:30,fontWeight:FontWeight.w800,height:1.12)),
      const SizedBox(height:9),Text(shop.categoryLabel,key:const ValueKey('saved-shop-category'),
        style:const TextStyle(color:Color(0xFF83D9AE),fontSize:13,fontWeight:FontWeight.w700)),
      if(shop.address.isNotEmpty)...[const SizedBox(height:9),Text(shop.address,style:const TextStyle(color:Color(0xFFBACFC3),height:1.4))],
      const SizedBox(height:20),Wrap(spacing:10,runSpacing:10,children:[
        _pill(shop.isLive?'Shop is live':shop.approvalStatus=='approved'?'Owner approved · listing pending':'Shop is not live yet',
          shop.isLive?Icons.check_circle_outline:Icons.shield_outlined),
        _pill(productCount==null?'Products unavailable':'$productCount products',Icons.inventory_2_outlined)
      ]),
      const SizedBox(height:14),Text(shop.isLive?'Ready for your next local customer.':
        shop.approvalStatus=='approved'?'Your owner review is approved. Listing activation is handled separately.':'Prepare your range while Teyza reviews your registration.',
        style:const TextStyle(color:Color(0xFFBACFC3),height:1.45,fontSize:12))
    ]));
  Widget _pill(String label,IconData icon)=>Container(padding:const EdgeInsets.symmetric(horizontal:11,vertical:9),
    decoration:BoxDecoration(color:const Color(0xFF244536),borderRadius:BorderRadius.circular(12)),
    child:Row(mainAxisSize:MainAxisSize.min,children:[Icon(icon,size:15,color:const Color(0xFF9CE7BB)),const SizedBox(width:7),
      Flexible(child:Text(label,style:const TextStyle(color:Colors.white,fontSize:11,fontWeight:FontWeight.w700)))]));
}

class SellerSetupCard extends StatelessWidget{
  final int? products;final String verification;final VoidCallback onVerify,onProducts;
  const SellerSetupCard({super.key,required this.products,required this.verification,required this.onVerify,required this.onProducts});
  @override Widget build(BuildContext context){
    final hasPhoto=['pending_review','approved'].contains(verification),hasProducts=(products??0)>0;
    final done=1+(hasPhoto?1:0)+(hasProducts?1:0);
    return Container(padding:const EdgeInsets.all(19),decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(23),
      border:Border.all(color:const Color(0xFFE6EBE3))),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Row(children:[const Expanded(child:Text('Make your shop stand out',style:TextStyle(fontSize:18,fontWeight:FontWeight.w800))),
        Text('$done / 3',style:const TextStyle(fontWeight:FontWeight.w800,color:Color(0xFF168C5A)))]),
      const SizedBox(height:12),ClipRRect(borderRadius:BorderRadius.circular(8),child:LinearProgressIndicator(value:done/3,
        minHeight:5,backgroundColor:const Color(0xFFEBF2EB),color:const Color(0xFF3BB77E))),const SizedBox(height:14),
      const Text('✓  Shop profile saved',style:TextStyle(color:Color(0xFF52715D))),
      TextButton.icon(onPressed:onVerify,icon:Icon(hasPhoto?Icons.check_circle_outline:Icons.camera_alt_outlined,size:18),
        label:Text(verification=='approved'?'Owner review approved':hasPhoto?'Selfie awaiting review':verification=='needs_new_photo'?'A new selfie is needed':'Take your owner verification selfie')),
      TextButton.icon(onPressed:onProducts,icon:Icon(hasProducts?Icons.check_circle_outline:Icons.add,size:18),
        label:Text(hasProducts?'Your product range is ready':'Choose products for your shop'))
    ]));
  }
}
