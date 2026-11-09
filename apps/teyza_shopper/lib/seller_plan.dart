import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

// These constants preserve the existing distribution configuration.
// Payment checkout is never initiated within this app, including direct APKs.
const teyzaPaymentChannel=String.fromEnvironment('TEYZA_PAYMENT_CHANNEL',defaultValue:'store');
bool teyzaCanOpenMembershipPage({required bool isAndroid,required String channel})=>false;

class SellerPlanPage extends StatelessWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final String businessType;
  final bool showPromotion,fromProductAction;
  // Deprecated: kept temporarily for test and older caller compatibility.
  @visibleForTesting final bool? directMandateOverride;
  const SellerPlanPage({super.key,required this.session,this.api,this.businessType='spaza',
    this.showPromotion=false,this.fromProductAction=false,this.directMandateOverride});

  Widget benefit(IconData icon,String title,String detail)=>Padding(
    padding:const EdgeInsets.symmetric(vertical:10),
    child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Container(width:39,height:39,decoration:BoxDecoration(color:const Color(0xFFEAF5EB),borderRadius:BorderRadius.circular(12)),
        child:Icon(icon,color:const Color(0xFF13845D),size:20)),
      const SizedBox(width:12),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:14)),
        const SizedBox(height:3),Text(detail,style:const TextStyle(color:Color(0xFF657B6E),height:1.35,fontSize:12))]))]));

  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(businessType=='wholesale'?'Wholesale business membership':'Sell on Teyza')),
    backgroundColor:const Color(0xFFF6F8F6),
    body:SafeArea(child:ListView(padding:const EdgeInsets.all(20),children:[
      Container(padding:const EdgeInsets.all(24),decoration:BoxDecoration(color:const Color(0xFF073F40),borderRadius:BorderRadius.circular(25)),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('TEYZA BUSINESS',style:TextStyle(color:Color(0xFFC1E98D),fontWeight:FontWeight.w800,fontSize:11,letterSpacing:1.4)),
          const SizedBox(height:12),
          Text(businessType=='wholesale'?'Advertise to spaza shops':'Sell on Teyza',
            style:const TextStyle(color:Colors.white,fontSize:27,height:1.12,fontWeight:FontWeight.w800)),
          const SizedBox(height:12),
          const Text('Free business registration · check your verified subscription and product access below.',
            style:TextStyle(color:Color(0xFFD5E6DA),height:1.4))
        ])),
      const SizedBox(height:18),
      Card(margin:EdgeInsets.zero,color:Colors.white,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22)),child:Padding(
        padding:const EdgeInsets.all(19),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Benefits for your shop',style:TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
          const SizedBox(height:6),
          benefit(Icons.storefront_outlined,'A shop people can discover','Approved businesses can appear nearby.'),
          benefit(Icons.inventory_2_outlined,businessType=='wholesale'?'Advertise supplier offers':'List products and receive orders',
            businessType=='wholesale'?'Select participating spaza shops for approved supplier offers; no public wholesale prices.':'List products with verified subscription access.'),
          benefit(Icons.handshake_outlined,'Wholesale savings','Explore discounts from participating wholesalers.'),
          benefit(Icons.local_shipping_outlined,'Delivery options','Arrange collection and delivery for physical goods.'),
          benefit(Icons.account_balance_outlined,'Apply for stock finance','Finance applications are reviewed separately.'),
          benefit(Icons.receipt_long_outlined,'Bookkeeping support','Help may be available where offered.'),
          const Text('Benefits depend on availability and eligibility.',style:TextStyle(fontSize:12,color:Color(0xFF657B6E))),
        ]))),
      const SizedBox(height:18),
      const Text('Your available business tools reflect your verified account eligibility. No payments or subscriptions can be initiated in this app.',
        style:TextStyle(fontSize:12,color:Color(0xFF60736B))),
    ])),
  );
}
