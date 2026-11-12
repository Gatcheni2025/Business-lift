import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

/// Seller growth information only. The mobile store builds never contain a
/// website checkout URL, WhatsApp payment URL or purchase hand-off.
class SellerGrowthPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final bool businessApproved;
  final String initialPurpose;
  const SellerGrowthPage({super.key,required this.session,this.api,
    this.businessApproved=false,this.initialPurpose='upgrade'});
  @override State<SellerGrowthPage> createState()=>_SellerGrowthPageState();
}

class _SellerGrowthPageState extends State<SellerGrowthPage>{
  bool sending=false;
  String? status;
  TeyzaMobileApi get api=>widget.api??TeyzaMobileApi(widget.session);
  static const forest=Color(0xFF063F42),leaf=Color(0xFF167A59);
  Widget benefit(IconData icon,String title,String description)=>Container(
    padding:const EdgeInsets.all(16),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),
      border:Border.all(color:const Color(0xFFE0EDE6))),
    child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Container(padding:const EdgeInsets.all(11),
        decoration:BoxDecoration(color:const Color(0xFFE6F5EB),borderRadius:BorderRadius.circular(13)),
        child:Icon(icon,color:leaf,size:24)),
      const SizedBox(width:14),
      Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(title,style:const TextStyle(fontSize:15,fontWeight:FontWeight.w800,color:forest)),
        const SizedBox(height:4),Text(description,style:const TextStyle(
          fontSize:12.5,color:Color(0xFF526C63),height:1.35))
      ]))
    ]));
  Future<void> request(String purpose) async {
    if(sending)return;
    final uid=widget.session.userId;
    if(uid==null||widget.session.idToken==null){
      setState(()=>status='Sign in with your original Teyza seller account first.');
      return;
    }
    final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:Text(purpose=='advertise'?'Request advertising guidance':'Request upgrade guidance'),
      content:const Text(
        'Would you like one WhatsApp information message from Teyza? '
        'We will use the mobile number already verified on your seller account. '
        'This does not start a payment or send a payment link. '
        'WhatsApp delivery requires Meta approval and an available message template.'),
      actions:[
        TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,true),
          child:const Text('I agree · Request WhatsApp'))
      ]));
    if(accepted!=true||!mounted||uid!=widget.session.userId)return;
    setState((){sending=true;status=null;});
    try{
      final response=await api.call('seller_growth_interest',{
        'purpose':purpose,'whatsappConsent':true
      });
      if(!mounted||uid!=widget.session.userId)return;
      setState(()=>status=response['alreadyRequested']==true?
        'Your request was already received today. Please do not request it again.':
        'Request received. We will send information through WhatsApp once '
        'your account and the Meta messaging service are eligible.');
    }catch(e){
      if(mounted&&uid==widget.session.userId)setState(()=>status=mobileError(e));
    }finally{if(mounted)setState(()=>sending=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    backgroundColor:const Color(0xFFF3F8F5),
    appBar:AppBar(backgroundColor:const Color(0xFFF3F8F5),
      title:Text(widget.initialPurpose=='advertise'?'Advertise locally':'Grow with Teyza')),
    body:SafeArea(child:ListView(padding:const EdgeInsets.fromLTRB(18,10,18,30),children:[
      Container(padding:const EdgeInsets.all(24),
        decoration:BoxDecoration(
          gradient:const LinearGradient(colors:[forest,Color(0xFF117B65)],
            begin:Alignment.topLeft,end:Alignment.bottomRight),
          borderRadius:BorderRadius.circular(26)),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Icon(Icons.auto_graph_rounded,color:Color(0xFFD0F7C0),size:43),
          const SizedBox(height:16),
          const Text('Turn local discovery into real business growth.',
            style:TextStyle(fontSize:24,fontWeight:FontWeight.w900,color:Colors.white,height:1.15)),
          const SizedBox(height:11),
          const Text('Get discovered by more nearby customers, manage your offers, '
            'and connect with opportunities that help your business thrive.',
            style:TextStyle(fontSize:13.5,color:Color(0xFFE4F6EE),height:1.45)),
          const SizedBox(height:13),
          Text(widget.businessApproved?'Your shop is verified and can remain listed for free.':
            'Complete business verification to unlock eligible seller tools.',
            style:const TextStyle(color:Color(0xFFCEF3DD),fontSize:12))
        ])),
      const SizedBox(height:24),
      const Text('What upgrading can do for you',style:TextStyle(
        color:forest,fontSize:20,fontWeight:FontWeight.w900)),
      const SizedBox(height:13),
      benefit(Icons.shopping_bag_outlined,'Sell your products or services',
        'Manage your range or service offering and reach Teyza shoppers in your area.'),
      const SizedBox(height:9),
      benefit(Icons.groups_2_outlined,'Reach more local customers',
        'Improve your local visibility and help nearby shoppers discover your business.'),
      const SizedBox(height:9),
      benefit(Icons.inventory_2_outlined,'Access discounted wholesale stock',
        'Connect with participating wholesalers for eligible stock prices and delivery offers.'),
      const SizedBox(height:9),
      benefit(Icons.account_balance_outlined,'Explore business finance',
        'Request a stock-finance or business-funding review, subject to approval.'),
      const SizedBox(height:9),
      benefit(Icons.campaign_outlined,'Showcase your business',
        'Submit reviewed promotions and eligible products for community discovery.'),
      const SizedBox(height:23),
      Card(color:Colors.white,elevation:0,shape:RoundedRectangleBorder(
        borderRadius:BorderRadius.circular(19),side:const BorderSide(color:Color(0xFFD7E9DE))),
        child:Padding(padding:const EdgeInsets.all(18),child:Column(
          crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          const Text('Ready to take the next step?',style:TextStyle(
            color:forest,fontWeight:FontWeight.w900,fontSize:18)),
          const SizedBox(height:8),
          const Text('Choose the information you want. Teyza will use your verified '
            'contact details to respond when WhatsApp notifications are available.',
            style:TextStyle(fontSize:12.5,height:1.4)),
          const SizedBox(height:17),
          FilledButton.icon(key:const ValueKey('growth-upgrade'),
            onPressed:sending?null:()=>request('upgrade'),
            style:FilledButton.styleFrom(backgroundColor:leaf,padding:const EdgeInsets.all(15)),
            icon:const Icon(Icons.rocket_launch_outlined),
            label:const Text('Upgrade Account')),
          const SizedBox(height:10),
          OutlinedButton.icon(key:const ValueKey('growth-advertise'),
            onPressed:sending?null:()=>request('advertise'),
            style:OutlinedButton.styleFrom(padding:const EdgeInsets.all(15)),
            icon:const Icon(Icons.campaign_outlined),
            label:const Text('Advertise to the community')),
          const SizedBox(height:12),
          const Text('No payment is taken from this page. Your request does not '
            'activate selling or advertising. Approval and activation are verified independently.',
            style:TextStyle(color:Color(0xFF617970),fontSize:11.5,height:1.35)),
        ]))),
      if(sending)const Padding(padding:EdgeInsets.all(12),
        child:Center(child:CircularProgressIndicator())),
      if(status!=null)Padding(padding:const EdgeInsets.only(top:16),
        child:Semantics(liveRegion:true,child:Card(color:Colors.white,
          child:Padding(padding:const EdgeInsets.all(15),child:Text(status!,
            style:const TextStyle(fontSize:13,height:1.35)))))),
    ])),
  );
}
