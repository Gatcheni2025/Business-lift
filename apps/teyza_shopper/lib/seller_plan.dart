import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

/// Plan selection does not take payment or approve a seller. Billing and
/// publication are activated only after verified back-office processing.
class SellerPlanPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final String businessType;
  const SellerPlanPage({super.key,required this.session,this.api,this.businessType='spaza'});
  @override State<SellerPlanPage> createState()=>_SellerPlanState();
}

class _SellerPlanState extends State<SellerPlanPage> {
  bool saving=false;
  String? error;
  Future<void> choose(String plan) async {
    if(saving)return;
    setState(() {saving=true;error=null;});
    try {
      final response=await (widget.api??TeyzaMobileApi(widget.session))
        .call('seller_plan_select',{'plan':plan});
      if(!mounted)return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content:Text(response['message']?.toString()??'Your plan preference has been saved.')));
      Navigator.of(context).pop(plan);
    }catch(e){
      if(mounted)setState(()=>error=mobileError(e));
    }finally{
      if(mounted)setState(()=>saving=false);
    }
  }

  Widget planCard({required String name,required String price,required List<String> benefits,
      required String button,required VoidCallback select,bool featured=false}) =>
    Container(
      margin:const EdgeInsets.only(bottom:18),
      padding:const EdgeInsets.all(19),
      decoration:BoxDecoration(color:Colors.white,
        border:Border.all(color:featured?const Color(0xFF09895B):const Color(0xFFDDE8E1),width:featured?2:1),
        borderRadius:BorderRadius.circular(20)),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        if(featured)const Padding(padding:EdgeInsets.only(bottom:9),
          child:Text('MORE VISIBILITY',style:TextStyle(color:Color(0xFF09895B),fontWeight:FontWeight.w800,letterSpacing:1))),
        Text(name,style:const TextStyle(fontSize:22,fontWeight:FontWeight.w800)),
        const SizedBox(height:4),
        Text(price,style:TextStyle(fontSize:27,fontWeight:FontWeight.w800,
          color:featured?const Color(0xFF09895B):const Color(0xFF23352E))),
        const SizedBox(height:11),
        for(final benefit in benefits)Padding(padding:const EdgeInsets.symmetric(vertical:5),
          child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Icon(Icons.check_circle_outline,color:Color(0xFF168657),size:19),
            const SizedBox(width:9),
            Expanded(child:Text(benefit,style:const TextStyle(height:1.3))),
          ])),
        const SizedBox(height:16),
        SizedBox(width:double.infinity,
          child:FilledButton(onPressed:saving?null:select,
            style:FilledButton.styleFrom(backgroundColor:featured?const Color(0xFF08794E):const Color(0xFF24382E)),
            child:Text(saving?'Saving…':button))),
      ]));

  @override Widget build(BuildContext context)=>Scaffold(
    backgroundColor:const Color(0xFFF6F8F6),
    appBar:AppBar(title:const Text('Choose your Teyza plan')),
    body:SafeArea(child:ListView(padding:const EdgeInsets.all(20),children:[
      const Text('Registration is free',style:TextStyle(fontSize:27,fontWeight:FontWeight.w800)),
      const SizedBox(height:8),
      Text(widget.businessType=='wholesale'?
        'Register your wholesale business for free. Activate Basic to share your published wholesale catalogue with approved spaza buyers after verification and payment.':
        'Set up your shop now. Select the R99 plan when you want to be listed for local shoppers.',
        style:const TextStyle(color:Color(0xFF506458),height:1.4)),
      const SizedBox(height:20),
      planCard(name:'Free',price:'R0',benefits:const [
        'Create and manage your business profile',
        'Submit your documents for verification',
        'Prepare products and stock lists privately',
        'Your shop is not shown in nearby shopper results',
        'Upgrade your plan when you are ready',
      ],button:'Continue with Free',select:()=>choose('free')),
      planCard(name:'Basic',price:'R99 / month',featured:true,benefits:widget.businessType=='wholesale'?const [
        'Everything in Free',
        'List your verified business in the approved spaza-owner wholesale directory',
        'Publish wholesale product and pack prices from your own catalogue',
        'Receive direct stock order requests and customer messages from spaza buyers',
        'Offer collection or delivery, including R0 delivery when your business can provide it',
        'Only approved spaza shop accounts can view and request wholesale products',
        'Your supplier listing goes live only after approval and verified payment',
      ]:const [
        'Everything in Free',
        'Eligible to appear in nearby shopper searches after approval and payment',
        'Priority placement within the relevant shopping area',
        'Show approved products and offer collection or delivery',
        'Receive enquiries, chat and order requests when your shop is active',
        'Business finance and stock loans: submit an enquiry for lender assessment (approval is not guaranteed)',
        'Wholesale stock discounts: access participating supplier offers when available',
        'Free stock delivery on qualifying wholesale orders in supported areas when a partner offers it',
        'Buy stock more affordably and set competitive retail prices; savings and sales vary',
        'Prepare wholesale stock lists and access supplier links',
        'Your listing is only activated after payment is verified',
      ],button:'Choose R99 Basic',select:()=>choose('basic')),
      if(error!=null)Padding(padding:const EdgeInsets.only(bottom:14),
        child:Text(error!,style:const TextStyle(color:Colors.red))),
      Text(widget.businessType=='wholesale'?
        'Choosing Basic does not charge your bank account. Supplier listing is subject to verification and payment. You control your own wholesale prices and delivery terms; Teyza does not guarantee orders.':
        'Selecting Basic does not charge your card or bank account. Payment and activation are handled separately. Finance, discounts and free delivery depend on approved providers, eligibility and availability. Priority positioning does not guarantee sales.',
        style:TextStyle(color:Color(0xFF56665D),fontSize:12,height:1.5)),
    ])),
  );
}
