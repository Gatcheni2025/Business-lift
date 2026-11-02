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
      const Text('7-day Teyza shop trial',
        style:TextStyle(fontSize:27,fontWeight:FontWeight.w800)),
      const SizedBox(height:8),
      const Text('A seven-day trial starts after Teyza approves your shop. '
        'Your approved shop appears in local searches automatically, even if you '
        'have not yet published product prices. No debit mandate or bank details '
        'are required for the trial.',
        style:TextStyle(color:Color(0xFF506458),height:1.4)),
      const SizedBox(height:20),
      planCard(name:'7-day trial',price:'R0 for 7 days',featured:true,
        benefits:const [
          'One trial per verified shop owner, beginning at approval',
          'Approved shop appears in nearby results',
          'Publish your real catalogue, prices and stock when ready',
          'Receive customer messages and order enquiries',
          'Collection and delivery options',
          'After seven days, listing and order access pause until a valid paid entitlement is active',
          'No automatic charge; no bank debit mandate',
        ],button:'Activate my one-time trial',select:()=>choose('trial')),
      if(error!=null)Padding(padding:const EdgeInsets.only(bottom:14),
        child:Text(error!,style:const TextStyle(color:Colors.red))),
      const Text('After the trial, the intended Basic plan is R99 per month. '
        'The iOS purchase option is not available until Apple In-App Purchase '
        'is configured and approved. This screen does not collect payment or '
        'automatically renew a subscription.',
        style:TextStyle(color:Color(0xFF56665D),fontSize:12,height:1.5)),
    ])),
  );
}
