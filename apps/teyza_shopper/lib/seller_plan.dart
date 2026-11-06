import 'dart:io';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'seller_mandate.dart';

// Physical-goods Paystack payments are implemented separately in shop_orders.dart.
// No seller membership payment is offered in App Store / Play Store builds.
const teyzaPaymentChannel=String.fromEnvironment('TEYZA_PAYMENT_CHANNEL',defaultValue:'store');
final Uri teyzaSellerMembershipPage=Uri.https('teyza.co.za','/seller-subscriptions.html');
bool teyzaCanOpenMembershipPage({required bool isAndroid,required String channel})=>
    isAndroid&&channel=='direct';

class SellerPlanPage extends StatefulWidget {
 final ShopperSession session;
 final TeyzaMobileApi? api;
 final String businessType;
 final bool showPromotion,fromProductAction;
 const SellerPlanPage({super.key,required this.session,this.api,this.businessType='spaza',
   this.showPromotion=false,this.fromProductAction=false});
 @override State<SellerPlanPage> createState()=>_SellerPlanState();
}
class _SellerPlanState extends State<SellerPlanPage> with WidgetsBindingObserver {
 bool loading=true,paid=false,complimentary=false,approved=false;
 String? error,mandateStatus;
 int? paidUntil,complimentaryUntil;
 TeyzaMobileApi get api=>widget.api??TeyzaMobileApi(widget.session);
 bool get directMandates=>teyzaCanOpenMembershipPage(isAndroid:Platform.isAndroid,channel:teyzaPaymentChannel);
 @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);refresh();}
 @override void dispose(){WidgetsBinding.instance.removeObserver(this);super.dispose();}
 @override void didChangeAppLifecycleState(AppLifecycleState state){
   if(state==AppLifecycleState.resumed&&mounted)refresh();
 }
 Future<void> refresh()async{
   try{
     final s=await api.call('seller_summary');
     Map<String,dynamic>? m;
     // Retail store apps only display existing membership/access status.
     if(directMandates){try{m=await api.call('seller_mandate_status');}catch(_){}}
     if(mounted)setState((){
       loading=false;error=null;paid=s['listingPaid']==true;
       complimentary=s['complimentaryAccess']==true;
       approved=s['approvalStatus']=='approved';
       paidUntil=(s['paidUntil'] as num?)?.toInt();
       complimentaryUntil=(s['complimentaryUntil'] as num?)?.toInt();
       mandateStatus=m?['mandate'] is Map?m!['mandate']['status']?.toString():null;
     });
   }catch(e){if(mounted)setState(()=>error=mobileError(e));}
 }
 Future<void> openMandate()async{
   if(!directMandates)return;
   final uid=widget.session.userId;
   await Navigator.push(context,MaterialPageRoute(builder:(_)=>
     SellerMandatePage(session:widget.session,api:widget.api,
       phone:widget.session.phoneNumber??'')));
   if(mounted&&uid==widget.session.userId)await refresh();
 }
 Widget fact(String value)=>Padding(padding:const EdgeInsets.symmetric(vertical:5),
   child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
     const Icon(Icons.check_circle_outline,color:Color(0xFF138A5E),size:19),
     const SizedBox(width:9),Expanded(child:Text(value))]));
 @override Widget build(BuildContext context)=>Scaffold(
   appBar:AppBar(title:const Text('Teyza business membership')),
   backgroundColor:const Color(0xFFF6F8F6),
   body:SafeArea(child:ListView(padding:const EdgeInsets.all(20),children:[
     const Text('Grow your business',style:TextStyle(fontSize:26,fontWeight:FontWeight.w800)),
     const SizedBox(height:10),
     const Text('Shop registration is free. Seller membership is R99 monthly, subject to identity approval, mandate verification and confirmed collection.'),
     const SizedBox(height:16),
     if(loading)const LinearProgressIndicator(),
     if(error!=null)Text(error!,style:const TextStyle(color:Colors.red)),
     Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(
       crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('R99 / month',style:TextStyle(fontSize:28,fontWeight:FontWeight.w900)),
        const Text('Monthly debit-order membership agreement'),
        const SizedBox(height:12),
        fact('Sell approved products and receive shopper orders'),
        fact('Connect with participating wholesalers'),
        fact('Shop discovery and business opportunities, subject to eligibility'),
        const SizedBox(height:12),
        if(paid)ListTile(contentPadding:EdgeInsets.zero,
          leading:const Icon(Icons.verified,color:Colors.green),
          title:const Text('Existing paid membership active'),
          subtitle:Text(paidUntil==null?'Membership is active':
            'Paid through ${DateTime.fromMillisecondsSinceEpoch(paidUntil!).toLocal().toIso8601String().split('T').first}')),
        if(complimentary&&!paid)const ListTile(contentPadding:EdgeInsets.zero,
          leading:Icon(Icons.verified_outlined),title:Text('Temporary admin-granted access is active')),
        if(mandateStatus!=null)ListTile(contentPadding:EdgeInsets.zero,
          leading:const Icon(Icons.description_outlined),
          title:const Text('Mandate received'),
          subtitle:Text('Status: ${mandateStatus!.replaceAll('_',' ')}. No debit is active until provider authentication and successful collection.')),
        if(directMandates)FilledButton.icon(
          onPressed:loading?null:openMandate,
          icon:const Icon(Icons.account_balance_outlined),
          label:const Text('Review R99 debit-order mandate'))
        else const Text('This store build does not sell digital memberships or collect debit-order mandates. Membership administration is independent of shopper payments.',
          style:TextStyle(color:Color(0xFF5A6C60),fontSize:12)),
       ]))),
     const SizedBox(height:12),
     OutlinedButton.icon(onPressed:refresh,icon:const Icon(Icons.refresh),
       label:const Text('Refresh membership status')),
     if(!approved)const Padding(padding:EdgeInsets.only(top:12),
       child:Text('Teyza must approve your identity and shop before product selling can begin.')),
     const Padding(padding:EdgeInsets.only(top:16),
       child:Text('Submitting a mandate does not debit your account or activate access. Teyza needs an accredited South African debit-order provider and applicable bank authorisation. Existing Paystack subscriptions may require separate cancellation to avoid duplicate billing.',
         style:TextStyle(color:Color(0xFF5A6C60),fontSize:12)))
   ])),
 );
}
