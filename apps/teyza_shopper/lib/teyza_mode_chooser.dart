import 'package:flutter/material.dart';
import 'shopper_design.dart';

/// Navigation choice only. Permissions are never conferred by selecting a card.
class TeyzaModeChooser extends StatelessWidget{
 final bool agentApproved,shopperAvailable,sellerAvailable;
 final String sellerLabel,sellerName;
 final VoidCallback onShopper,onAgent,onSeller;
 const TeyzaModeChooser({super.key,required this.agentApproved,required this.onShopper,
  required this.onAgent,required this.onSeller,this.shopperAvailable=true,
  this.sellerAvailable=true,this.sellerLabel='Seller',this.sellerName=''});
 @override Widget build(BuildContext context){
  return Scaffold(backgroundColor:TeyzaDesign.ivory,
   body:SafeArea(child:LayoutBuilder(builder:(context,c)=>SingleChildScrollView(
    padding:const EdgeInsets.symmetric(horizontal:22,vertical:26),
    child:ConstrainedBox(constraints:BoxConstraints(minHeight:c.maxHeight-52),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     const TeyzaWordmark(width:180),
     const SizedBox(height:34),
     const Text('Select account',style:TextStyle(fontSize:35,fontWeight:FontWeight.w900,color:Color(0xFF0B2738))),
     const SizedBox(height:8),
     const Text('Choose an account to continue.',style:TextStyle(fontSize:16,color:Color(0xFF536775))),
     const SizedBox(height:20),
     if(shopperAvailable)_mode(Icons.shopping_basket_outlined,'Shopper',
      'Discover local shops, compare essentials and buy nearby.',
      TeyzaDesign.softMint,TeyzaDesign.leaf,onShopper),
     if(agentApproved)_mode(Icons.explore_outlined,'Continue as Field Agent',
      'Find shops on the map, visit owners, take photos and track verified R90 registrations.',
      TeyzaDesign.softOrange,const Color(0xFFB44D00),onAgent),
     if(sellerAvailable)_mode(Icons.storefront_outlined,sellerLabel,
      sellerName.isNotEmpty?sellerName:'Manage your registered business.',
      const Color(0xFFE5F3F2),TeyzaDesign.forest,onSeller),
     const SizedBox(height:20),
     const Row(children:[Icon(Icons.verified_user_outlined,color:Color(0xFF558A73),size:19),
      SizedBox(width:9),Expanded(child:Text('Your accounts use the same secure sign-in.',
        style:TextStyle(color:Color(0xFF526C66),fontSize:12)))]),
    ]))))));
 }
 Widget _mode(IconData icon,String title,String subtitle,Color bg,Color accent,VoidCallback callback){
  return Padding(padding:const EdgeInsets.only(bottom:13),child:Material(color:Colors.white,
   borderRadius:BorderRadius.circular(19),child:InkWell(
    key:ValueKey('mode-'+(title.contains('Field Agent')?'agent':title=='Shopper'?'shopper':'seller')),
    onTap:callback,borderRadius:BorderRadius.circular(19),
    child:Container(padding:const EdgeInsets.all(17),decoration:BoxDecoration(
     borderRadius:BorderRadius.circular(19),border:Border.all(color:const Color(0xFFE5ECEB))),
     child:Row(children:[
      Container(width:56,height:56,decoration:BoxDecoration(color:bg,borderRadius:BorderRadius.circular(17)),
       child:Icon(icon,color:accent,size:29)),
      const SizedBox(width:15),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
       Text(title,style:const TextStyle(color:Color(0xFF0C3242),fontWeight:FontWeight.w900,fontSize:16)),
       const SizedBox(height:5),Text(subtitle,style:const TextStyle(color:Color(0xFF63747A),fontSize:12))
      ])),
      const Icon(Icons.arrow_forward_ios_rounded,size:16,color:Color(0xFF6C7D85))
     ])))));
 }
}
