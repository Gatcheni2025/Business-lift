import 'dart:io';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'seller_mandate.dart';

// Physical-goods Paystack payments are implemented separately in shop_orders.dart.
// Store-distributed builds show current access and non-purchase business tools only.
// Never solicit a digital entitlement outside App Store / Play billing.
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
 bool get mandateAwaitingReview=>['pending_provider_authentication','signed_pending_activation','reviewed_pending_provider','submitted_to_netcash'].contains(mandateStatus);
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
   if(!directMandates||!approved||loading||error!=null)return;
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
   appBar:AppBar(title:const Text('Sell on Teyza')),
   backgroundColor:const Color(0xFFF6F8F6),
   body:SafeArea(child:ListView(padding:const EdgeInsets.all(20),children:[
     if(loading)const LinearProgressIndicator(),
     if(error!=null)Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
       Text('Could not refresh your seller status: $error',style:const TextStyle(color:Colors.red)),
       const SizedBox(height:8),TextButton.icon(onPressed:loading?null:refresh,icon:const Icon(Icons.refresh),label:const Text('Try again'))]))),
     Container(padding:const EdgeInsets.all(24),decoration:BoxDecoration(color:const Color(0xFF073F40),borderRadius:BorderRadius.circular(25)),
       child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('TEYZA BUSINESS',style:TextStyle(color:Color(0xFFC1E98D),fontWeight:FontWeight.w800,fontSize:11,letterSpacing:1.4)),
        const SizedBox(height:12),const Text('Sell on Teyza',style:TextStyle(color:Colors.white,fontSize:27,height:1.12,fontWeight:FontWeight.w800)),
        if(directMandates)const SizedBox(height:14),if(directMandates)const Text('R99 / month',style:TextStyle(color:Colors.white,fontSize:30,fontWeight:FontWeight.w900)),
        if(directMandates)const SizedBox(height:5),if(directMandates)const Text('Free registration. Review the monthly debit-order request when eligible.',style:TextStyle(color:Color(0xFFD5E6DA),height:1.4)),
        if(!directMandates)const Padding(padding:EdgeInsets.only(top:14),
          child:Text('Check your verified seller status and available tools.',
            style:TextStyle(color:Color(0xFFD5E6DA),height:1.4))),
       ])),
     const SizedBox(height:18),
     Card(margin:EdgeInsets.zero,color:Colors.white,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22)),child:Padding(padding:const EdgeInsets.all(19),child:Column(
       crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('Benefits for your shop',style:TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
        const SizedBox(height:6),
        benefit(Icons.storefront_outlined,'A shop people can discover','Approved businesses can appear to shoppers nearby.'),
        benefit(Icons.inventory_2_outlined,'Add products and receive orders','List your available items when verified product access is active.'),
        if(directMandates)benefit(Icons.location_on_outlined,'Local visibility','Priority placement may be offered in eligible areas.'),
        benefit(Icons.handshake_outlined,'Wholesale savings','Explore discounts from participating wholesalers.'),
        benefit(Icons.local_shipping_outlined,'Delivery options','Arrange collection or delivery for physical goods.'),
        benefit(Icons.account_balance_outlined,'Apply for stock finance','Applications are reviewed separately and are not guaranteed.'),
        benefit(Icons.receipt_long_outlined,'Bookkeeping support','Support may be offered where available.'),
        const Text('Supplier offers, delivery options and support depend on availability and eligibility.',style:TextStyle(color:Color(0xFF657B6E),fontSize:12,height:1.4)),
       ]))),
     const SizedBox(height:16),
     Card(margin:EdgeInsets.zero,color:Colors.white,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22)),child:Padding(padding:const EdgeInsets.all(19),child:Column(
       crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const Text('Your seller eligibility',style:TextStyle(fontSize:18,fontWeight:FontWeight.w800)),
        const SizedBox(height:8),
        if(paid)ListTile(contentPadding:EdgeInsets.zero,
          leading:const Icon(Icons.verified,color:Colors.green),
          title:const Text('Existing paid membership active'),
          subtitle:Text(paidUntil==null?'Membership is active':
            'Paid through ${DateTime.fromMillisecondsSinceEpoch(paidUntil!).toLocal().toIso8601String().split('T').first}')),
        if(complimentary&&!paid)const ListTile(contentPadding:EdgeInsets.zero,
          leading:Icon(Icons.verified_outlined),title:Text('Temporary admin-granted access is active')),
        if(mandateAwaitingReview&&!paid)ListTile(contentPadding:EdgeInsets.zero,
          leading:const Icon(Icons.hourglass_top_rounded,color:Color(0xFF8A640F)),
          title:Text(mandateStatus=='pending_provider_authentication'?'Waiting for review (by admin)':'Provider review in progress'),
          subtitle:const Text('Your R99 request has been saved. Product access remains locked until approval and confirmed collection.')),
        if(mandateStatus!=null&&!mandateAwaitingReview&&!paid)ListTile(contentPadding:EdgeInsets.zero,
          leading:const Icon(Icons.description_outlined),
          title:const Text('Mandate status'),
          subtitle:Text('Status: ${mandateStatus!.replaceAll('_',' ')}. Review or correct your request as needed.')),
        if(!loading&&!approved)Text(directMandates?'Waiting for admin approval. Once your seller registration and identity are approved, you can complete the R99 mandate.':'Complete your seller verification. Product publishing requires a verified eligible account.',style:TextStyle(color:Color(0xFF8A640F),height:1.45)),
        if(directMandates&&!loading&&approved&&!setupComplete)const Text('Your seller account is approved. You can complete your R99 mandate now; finish any remaining shop setup before products can go live.',style:TextStyle(color:Color(0xFF60736B),height:1.4)),
        if(directMandates&&mandateError!=null)const Padding(padding:EdgeInsets.symmetric(vertical:8),
          child:Text('Mandate status could not be loaded. You may still open the form to retry securely; no payment will be collected.',style:TextStyle(color:Color(0xFF9A4B31)))),
        if(directMandates)FilledButton.icon(
          key:const ValueKey('seller-upgrade-now'),
          onPressed:loading||error!=null||!approved?null:openMandate,
          icon:const Icon(Icons.account_balance_outlined),
          label:Text(mandateStatus==null||['withdrawn','needs_correction'].contains(mandateStatus)?'Upgrade now':'View mandate request'))
        else if(!directMandates&&!paid&&!complimentary)const Text('Your shop registration is free. Additional selling tools appear when your account is eligible. There is no membership purchase in this app.',
          style:TextStyle(color:Color(0xFF5A6C60),fontSize:13,height:1.4)),
       ]))),
     const SizedBox(height:12),
     OutlinedButton.icon(onPressed:refresh,icon:const Icon(Icons.refresh),
       label:const Text('Refresh membership status')),
     if(directMandates)const Padding(padding:EdgeInsets.only(top:16),
       child:Text('A mandate request is not a payment or bank authorisation. Provider verification and a confirmed collection are required before paid access starts. Existing subscriptions may need separate cancellation.',
         style:TextStyle(color:Color(0xFF5A6C60),fontSize:12)))
   ])),
 );
}
