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
 @visibleForTesting final bool? directMandateOverride;
 const SellerPlanPage({super.key,required this.session,this.api,this.businessType='spaza',
   this.showPromotion=false,this.fromProductAction=false,this.directMandateOverride});
 @override State<SellerPlanPage> createState()=>_SellerPlanState();
}
class _SellerPlanState extends State<SellerPlanPage> with WidgetsBindingObserver {
 bool loading=true,paid=false,complimentary=false,approved=false,setupComplete=false;
 String? error,mandateStatus,mandateError;
 int? paidUntil,complimentaryUntil;
 TeyzaMobileApi get api=>widget.api??TeyzaMobileApi(widget.session);
 bool get directMandates=>widget.directMandateOverride??teyzaCanOpenMembershipPage(isAndroid:Platform.isAndroid,channel:teyzaPaymentChannel);
 @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);refresh();}
 @override void dispose(){WidgetsBinding.instance.removeObserver(this);super.dispose();}
 @override void didChangeAppLifecycleState(AppLifecycleState state){
   if(state==AppLifecycleState.resumed&&mounted)refresh();
 }
 Future<void> refresh()async{
   try{
     final s=await api.call('seller_summary');
     Map<String,dynamic>? m;String? formError;
     // Retail store apps only display existing membership/access status.
     if(directMandates){try{m=await api.call('seller_mandate_status');}catch(e){formError=mobileError(e);}}
     if(mounted)setState((){
       loading=false;error=null;paid=s['listingPaid']==true;
       complimentary=s['complimentaryAccess']==true;
       approved=s['approvalStatus']=='approved';
       setupComplete=s['setupComplete']==true;
       paidUntil=(s['paidUntil'] as num?)?.toInt();
       complimentaryUntil=(s['complimentaryUntil'] as num?)?.toInt();
       mandateStatus=m?['mandate'] is Map?m!['mandate']['status']?.toString():null;
       mandateError=formError;
     });
   }catch(e){if(mounted)setState((){loading=false;error=mobileError(e);});}
 }
 Future<void> openMandate()async{
   if(!directMandates||!approved||!setupComplete||mandateError!=null)return;
   final uid=widget.session.userId;
   await Navigator.push(context,MaterialPageRoute(builder:(_)=>
     SellerMandatePage(session:widget.session,api:widget.api,
       phone:widget.session.phoneNumber??'')));
   if(mounted&&uid==widget.session.userId)await refresh();
 }
 Widget benefit(IconData icon,String title,String detail)=>Padding(
   padding:const EdgeInsets.symmetric(vertical:10),
   child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Container(width:39,height:39,decoration:BoxDecoration(color:const Color(0xFFEAF5EB),borderRadius:BorderRadius.circular(12)),
       child:Icon(icon,color:const Color(0xFF13845D),size:20)),
     const SizedBox(width:12),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
       Text(title,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:14)),
       const SizedBox(height:3),Text(detail,style:const TextStyle(color:Color(0xFF657B6E),height:1.35,fontSize:12))]))]));
 @override Widget build(BuildContext context)=>Scaffold(
   appBar:AppBar(title:const Text('Start selling')),
   backgroundColor:const Color(0xFFF6F8F6),
   body:SafeArea(child:ListView(padding:const EdgeInsets.all(20),children:[
     if(loading)const LinearProgressIndicator(),
     if(error!=null)Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
       Text('Could not refresh your seller status: $error',style:const TextStyle(color:Colors.red)),
       const SizedBox(height:8),TextButton.icon(onPressed:loading?null:refresh,icon:const Icon(Icons.refresh),label:const Text('Try again'))]))),
     Container(padding:const EdgeInsets.all(24),decoration:BoxDecoration(color:const Color(0xFF073F40),borderRadius:BorderRadius.circular(25)),
       child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('TEYZA BUSINESS',style:TextStyle(color:Color(0xFFC1E98D),fontWeight:FontWeight.w800,fontSize:11,letterSpacing:1.4)),
        const SizedBox(height:12),const Text('More ways to grow your shop.',style:TextStyle(color:Colors.white,fontSize:27,height:1.12,fontWeight:FontWeight.w800)),
        const SizedBox(height:14),const Text('R99 / month',style:TextStyle(color:Colors.white,fontSize:30,fontWeight:FontWeight.w900)),
        const SizedBox(height:5),const Text('Free registration. Membership when you are ready to sell.',style:TextStyle(color:Color(0xFFD5E6DA),height:1.4)),
       ])),
     const SizedBox(height:18),
     Card(margin:EdgeInsets.zero,color:Colors.white,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22)),child:Padding(padding:const EdgeInsets.all(19),child:Column(
       crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('What your business can enjoy',style:TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
        const SizedBox(height:6),
        benefit(Icons.storefront_outlined,'A shop people can discover','Approved businesses can appear to shoppers nearby.'),
        benefit(Icons.inventory_2_outlined,'Add products and receive orders','List your available items when verified product access is active.'),
        benefit(Icons.location_on_outlined,'Local visibility','Priority placement may be offered in eligible areas.'),
        benefit(Icons.handshake_outlined,'Wholesale savings','Explore discounts from participating wholesalers.'),
        benefit(Icons.local_shipping_outlined,'Selected delivery offers','Discounted delivery may be available on qualifying products.'),
        benefit(Icons.account_balance_outlined,'Apply for stock finance','Applications are reviewed separately and are not guaranteed.'),
        benefit(Icons.receipt_long_outlined,'Bookkeeping support','Support may be offered where available.'),
        const Text('Partner offers, priority placement and support depend on availability and eligibility.',style:TextStyle(color:Color(0xFF657B6E),fontSize:12,height:1.4)),
       ]))),
     const SizedBox(height:16),
     Card(margin:EdgeInsets.zero,color:Colors.white,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22)),child:Padding(padding:const EdgeInsets.all(19),child:Column(
       crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const Text('Your membership',style:TextStyle(fontSize:18,fontWeight:FontWeight.w800)),
        const SizedBox(height:8),
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
        if(!loading&&(!approved||!setupComplete))const Text('Complete seller verification and wait for approval before upgrading or adding products.',style:TextStyle(color:Color(0xFF8A640F),height:1.45)),
        if(directMandates&&mandateError!=null)const Padding(padding:EdgeInsets.symmetric(vertical:8),
          child:Text('The mandate form is temporarily unavailable. Refresh or contact Teyza support.',style:TextStyle(color:Color(0xFF9A4B31)))),
        if(directMandates&&(!paid&&!complimentary||mandateStatus!=null))FilledButton.icon(
          onPressed:loading||!approved||!setupComplete||mandateError!=null?null:openMandate,
          icon:const Icon(Icons.account_balance_outlined),
          label:Text(mandateStatus==null?'Upgrade account':'View mandate status'))
        else if(!directMandates&&!paid&&!complimentary)const Text('Membership upgrade in this app is not available yet. Existing verified access will appear here.',
          style:TextStyle(color:Color(0xFF5A6C60),fontSize:13,height:1.4)),
       ]))),
     const SizedBox(height:12),
     OutlinedButton.icon(onPressed:refresh,icon:const Icon(Icons.refresh),
       label:const Text('Refresh membership status')),
     const Padding(padding:EdgeInsets.only(top:16),
       child:Text('A mandate request is not a payment or bank authorisation. Provider verification and a confirmed collection are required before paid access starts. Existing subscriptions may need separate cancellation.',
         style:TextStyle(color:Color(0xFF5A6C60),fontSize:12)))
   ])),
 );
}
