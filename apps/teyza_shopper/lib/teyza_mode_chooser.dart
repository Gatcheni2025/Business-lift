import 'package:flutter/material.dart';

/// Navigation choice only. Permissions are never conferred by selecting a card.
class TeyzaModeChooser extends StatelessWidget{
 final bool agentApproved;
 final VoidCallback onShopper,onAgent,onSeller;
 const TeyzaModeChooser({super.key,required this.agentApproved,required this.onShopper,
  required this.onAgent,required this.onSeller});
 @override Widget build(BuildContext context){
  return Scaffold(backgroundColor:const Color(0xFFF3F7FC),
   body:SafeArea(child:LayoutBuilder(builder:(context,c)=>SingleChildScrollView(
    padding:const EdgeInsets.symmetric(horizontal:22,vertical:26),
    child:ConstrainedBox(constraints:BoxConstraints(minHeight:c.maxHeight-52),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Row(children:[Container(padding:const EdgeInsets.all(10),
      decoration:BoxDecoration(color:const Color(0xFF0E705B),borderRadius:BorderRadius.circular(15)),
      child:const Icon(Icons.store_mall_directory,color:Colors.white)),
      const SizedBox(width:12),const Text('TEYZA',style:TextStyle(fontSize:26,fontWeight:FontWeight.w900,color:Color(0xFF063E42)))]),
     const SizedBox(height:34),
     const Text('Welcome back',style:TextStyle(fontSize:35,fontWeight:FontWeight.w900,color:Color(0xFF0B2738))),
     const SizedBox(height:8),
     const Text('How would you like to use Teyza today?',style:TextStyle(fontSize:16,color:Color(0xFF536775))),
     const SizedBox(height:20),
     _mode(Icons.shopping_basket_outlined,'Continue as Shopper',
      'Discover local shops, compare essentials and buy nearby.',
      const Color(0xFFE4F4FA),const Color(0xFF18658A),onShopper),
     if(agentApproved)_mode(Icons.explore_outlined,'Continue as Field Agent',
      'Find shops on the map, visit owners, take photos and track verified R90 registrations.',
      const Color(0xFFECE6FF),const Color(0xFF6857B8),onAgent),
     _mode(Icons.storefront_outlined,'Continue as Seller / Business',
      'Manage an existing shop or register your own business. Seller verification remains required.',
      const Color(0xFFE6F5EA),const Color(0xFF08734F),onSeller),
     const SizedBox(height:20),
     const Row(children:[Icon(Icons.verified_user_outlined,color:Color(0xFF558A73),size:19),
      SizedBox(width:9),Expanded(child:Text('One account. Separate permissions. Admin must approve agent and seller access.',
        style:TextStyle(color:Color(0xFF526C66),fontSize:12)))]),
    ]))))));
 }
 Widget _mode(IconData icon,String title,String subtitle,Color bg,Color accent,VoidCallback callback){
  return Padding(padding:const EdgeInsets.only(bottom:13),child:Material(color:Colors.white,
   borderRadius:BorderRadius.circular(19),child:InkWell(
    key:ValueKey('mode-'+(title.contains('Field Agent')?'agent':title.contains('Seller')?'seller':'shopper')),
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
