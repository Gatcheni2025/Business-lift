import 'package:flutter/material.dart';

const _ink=Color(0xFF102C26),_green=Color(0xFF137B54),_muted=Color(0xFF60736B);

class SellerNavigation extends StatelessWidget {
  final int selected;
  final ValueChanged<int> onSelect;
  const SellerNavigation({super.key,required this.selected,required this.onSelect});
  @override Widget build(BuildContext context)=>SafeArea(top:false,child:Material(color:Colors.white,
    child:Row(children:[
      for(final (index,label,icon) in const [
        (0,'Dashboard',Icons.space_dashboard_outlined),(1,'Products',Icons.inventory_2_outlined),
        (2,'Orders',Icons.receipt_long_outlined),(3,'Chat',Icons.chat_bubble_outline_rounded),
        (4,'Business',Icons.tune_rounded)])
        Expanded(child:Semantics(button:true,selected:selected==index,label:'Seller $label',
          child:InkWell(key:ValueKey('seller-nav-$index'),onTap:()=>onSelect(index),
            child:Padding(padding:const EdgeInsets.symmetric(vertical:10,horizontal:3),
              child:Column(mainAxisSize:MainAxisSize.min,children:[
                Container(padding:const EdgeInsets.symmetric(horizontal:12,vertical:5),
                  decoration:BoxDecoration(color:selected==index?const Color(0xFFE1F2E8):Colors.transparent,
                    borderRadius:BorderRadius.circular(13)),
                  child:Icon(icon,color:selected==index?_green:_muted,size:23)),
                const SizedBox(height:4),Text(label,maxLines:1,overflow:TextOverflow.ellipsis,
                  style:TextStyle(fontSize:10,fontWeight:selected==index?FontWeight.w800:FontWeight.w500,
                    color:selected==index?_green:_muted))
              ])))))])));
}

class SellerSellingDashboard extends StatelessWidget {
  final String shopName;
  final bool live,verified;
  final int? productCount;
  final VoidCallback? onAdd;
  final VoidCallback onProducts,onOrders,onChat,onFinance,onAreas,onBusiness,onVerify;
  const SellerSellingDashboard({super.key,required this.shopName,required this.live,required this.verified,
    required this.productCount,required this.onAdd,required this.onProducts,required this.onOrders,
    required this.onChat,required this.onFinance,required this.onAreas,required this.onBusiness,required this.onVerify});
  @override Widget build(BuildContext context)=>ListView(physics:const AlwaysScrollableScrollPhysics(),
    padding:const EdgeInsets.fromLTRB(18,12,18,28),children:[
      Container(padding:const EdgeInsets.all(21),decoration:BoxDecoration(
        color:_ink,borderRadius:BorderRadius.circular(25)),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(shopName,style:const TextStyle(color:Color(0xFFACDFC2),fontWeight:FontWeight.w700,fontSize:13)),
          const SizedBox(height:9),const Text('Ready for your\nnext customer?',style:TextStyle(
            color:Colors.white,fontSize:28,height:1.13,fontWeight:FontWeight.w800)),
          const SizedBox(height:15),Wrap(spacing:8,runSpacing:7,children:[
            _pill(live?'Shop is live':'Shop setup needed',live?Icons.check_circle_outline:Icons.info_outline),
            if(verified)_pill('Teyza verified',Icons.verified_outlined),
          ])])),
      const SizedBox(height:16),SizedBox(width:double.infinity,child:FilledButton.icon(
        key:const ValueKey('seller-add-product'),onPressed:onAdd,icon:const Icon(Icons.add),
        style:FilledButton.styleFrom(backgroundColor:_green,padding:const EdgeInsets.all(16)),
        label:const Text('Add a product',style:TextStyle(fontSize:16,fontWeight:FontWeight.w700)))),
      const SizedBox(height:9),Text(productCount==null?'Product list unavailable. Open Products to retry.':
        '$productCount saved products · keep prices and stock up to date',style:const TextStyle(color:_muted,fontSize:12)),
      if(!live)Padding(padding:const EdgeInsets.only(top:9),child:OutlinedButton.icon(onPressed:onVerify,
        icon:const Icon(Icons.task_alt),label:const Text('Finish setup to start selling'))),
      const SizedBox(height:22),const Text('Your selling tools',style:TextStyle(color:_ink,fontSize:21,fontWeight:FontWeight.w800)),
      const SizedBox(height:12),LayoutBuilder(builder:(context,c)=>GridView.count(
        crossAxisCount:c.maxWidth<310||MediaQuery.textScalerOf(context).scale(14)>19?1:c.maxWidth>700?3:2,
        mainAxisSpacing:12,crossAxisSpacing:12,shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),
        mainAxisExtent:166+(MediaQuery.textScalerOf(context).scale(14)-14)*5,
        children:[
          _tool('My products','List, price & manage stock',Icons.inventory_2_outlined,onProducts),
          _tool('Customer orders','Confirm, prepare & fulfil',Icons.receipt_long_outlined,onOrders),
          _tool('Customer chat','Reply and make the sale',Icons.chat_bubble_outline_rounded,onChat),
          _tool('Stock finance','Apply for a funding review',Icons.account_balance_outlined,onFinance),
          _tool('Areas around me','Plan your local deliveries',Icons.near_me_outlined,onAreas),
          _tool('My business','Services, photos & settings',Icons.tune_rounded,onBusiness),
        ])),
    ]);
  Widget _pill(String text,IconData icon)=>Container(padding:const EdgeInsets.symmetric(horizontal:10,vertical:7),
    decoration:BoxDecoration(color:const Color(0xFF2A4B40),borderRadius:BorderRadius.circular(20)),
    child:Row(mainAxisSize:MainAxisSize.min,children:[Icon(icon,color:const Color(0xFFACDFC2),size:15),
      const SizedBox(width:6),Flexible(child:Text(text,style:const TextStyle(color:Colors.white,fontSize:11)))]));
  Widget _tool(String title,String detail,IconData icon,VoidCallback tap)=>Material(color:Colors.white,
    shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(20),side:const BorderSide(color:Color(0xFFE1E9DF))),
    child:InkWell(onTap:tap,borderRadius:BorderRadius.circular(20),child:Padding(padding:const EdgeInsets.all(15),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Icon(icon,color:_green,size:27),const Spacer(),Text(title,maxLines:2,overflow:TextOverflow.ellipsis,
          style:const TextStyle(fontWeight:FontWeight.w800,fontSize:15,color:_ink,height:1.2)),
        const SizedBox(height:4),Text(detail,maxLines:2,overflow:TextOverflow.ellipsis,
          style:const TextStyle(fontSize:11,color:_muted,height:1.2))]))));
}
