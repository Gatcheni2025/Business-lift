import 'dart:io';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

// Store-distributed Android and iOS builds must use store-compliant billing.
// Only a deliberately configured direct-distribution build may redirect to Paystack.
const teyzaPaymentChannel=String.fromEnvironment('TEYZA_PAYMENT_CHANNEL',defaultValue:'store');
/// Payment is optional and is offered when the seller chooses to add products.
/// iOS boosts/listings require StoreKit instead of a Paystack redirect.
class SellerPlanPage extends StatefulWidget {
 final ShopperSession session;
 final TeyzaMobileApi? api;
 final String businessType;
 final bool showPromotion;
 const SellerPlanPage({super.key,required this.session,this.api,this.businessType='spaza',this.showPromotion=false});
 @override State<SellerPlanPage> createState()=>_SellerPlanState();
}
class _SellerPlanState extends State<SellerPlanPage> with WidgetsBindingObserver {
 bool busy=false,paid=false,promoted=false,loading=true;
 String? error,paymentReference;
 int? promotionEndsAt,paidUntil;
 TeyzaMobileApi get api=>widget.api??TeyzaMobileApi(widget.session);
 bool get paystackAllowed=>!Platform.isIOS&&Platform.isAndroid&&teyzaPaymentChannel=='direct';
 String get purchaseLabel=>paystackAllowed?'Pay with Paystack':'Store billing coming soon';
 @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);refresh();}
 @override void dispose(){WidgetsBinding.instance.removeObserver(this);super.dispose();}
 @override void didChangeAppLifecycleState(AppLifecycleState state) {
  if(state==AppLifecycleState.resumed&&mounted)refresh();
 }
 Future<void> refresh() async {
  try {
   final data=await api.call('seller_summary');
   if(mounted)setState((){paid=data['listingPaid']==true;promoted=data['promotionActive']==true;
    paidUntil=(data['paidUntil'] as num?)?.toInt();
    promotionEndsAt=(data['promotionEndsAt'] as num?)?.toInt();loading=false;});
  }catch(e){if(mounted)setState((){loading=false;error=mobileError(e);});}
 }
 Future<void> beginCheckout({required bool promotion}) async {
  if(busy||loading)return;
  if(!paystackAllowed){
   setState(()=>error='In-app digital purchases require approved store billing for this app distribution. Your free shop remains available.');
   return;
  }
  if(promotion&&!paid){setState(()=>error='Upgrade your membership first.');return;}
  setState((){busy=true;error=null;});
  try{
   final result=await api.call(promotion?'promote_checkout':'billing_checkout');
   if(!mounted)return;
   final raw=result['checkoutUrl']?.toString()??'';
   final uri=Uri.tryParse(raw);
   if(uri==null||uri.scheme!='https'||uri.host!='checkout.paystack.com'){
    throw StateError('Paystack did not return a valid checkout page.');
   }
   setState(()=>paymentReference=result['reference']?.toString());
   if(!await launchUrl(uri,mode:LaunchMode.externalApplication)){
    throw StateError('Could not open Paystack. Try again.');
   }
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> confirm() async {
  final ref=paymentReference;
  if(busy||ref==null)return;
  setState((){busy=true;error=null;});
  try{
   final result=await api.call('billing_confirm',{'reference':ref});
   if(result['paid']!=true)throw StateError('Paystack has not verified your payment.');
   paymentReference=null;await refresh();
   if(mounted)ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content:Text('Payment verified. Your Teyza account is updated.')));
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> manageSubscription() async{
  if(busy||!paystackAllowed)return;
  setState((){busy=true;error=null;});
  try{
   final response=await api.call('billing_manage');
   final uri=Uri.tryParse(response['manageUrl']?.toString()??'');
   if(uri==null||uri.scheme!='https'||uri.host!='paystack.com'){
    throw StateError('A valid subscription management link is not available.');
   }
   if(!await launchUrl(uri,mode:LaunchMode.externalApplication)){
    throw StateError('Could not open Paystack subscription settings.');
   }
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Widget benefit(String text)=>Padding(padding:const EdgeInsets.symmetric(vertical:6),
  child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
   const Icon(Icons.check_circle_outline,color:Color(0xFF08794E),size:20),
   const SizedBox(width:9),Expanded(child:Text(text,style:const TextStyle(height:1.35)))]));
 Widget planCard({required String title,required String price,required List<String> benefits,
  required String action,required VoidCallback? onPressed,bool highlighted=false})=>
  Container(margin:const EdgeInsets.only(bottom:15),padding:const EdgeInsets.all(20),
   decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(22),
    border:Border.all(color:highlighted?const Color(0xFF0C9463):const Color(0xFFDDE8E1),width:highlighted?2:1)),
   child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    Text(title,style:const TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
    const SizedBox(height:6),Text(price,style:const TextStyle(fontSize:27,fontWeight:FontWeight.w800,
     color:Color(0xFF08794E))),const SizedBox(height:12),
    for(final item in benefits)benefit(item),const SizedBox(height:15),
    FilledButton(onPressed:busy||loading?null:onPressed,child:Text(busy?'Please wait…':action))
   ]));
 @override Widget build(BuildContext context)=>Scaffold(
  backgroundColor:const Color(0xFFF6F8F6),
  appBar:AppBar(title:Text(widget.showPromotion?'Promote your business':'Teyza Business upgrade')),
  body:SafeArea(child:ListView(padding:const EdgeInsets.all(20),children:[
   const Text('Grow your business, on your terms.',style:TextStyle(fontSize:26,fontWeight:FontWeight.w800)),
   const SizedBox(height:9),
   const Text('Business registration and verification are free. Upgrade only when you are ready to list products.',
    style:TextStyle(height:1.4,color:Color(0xFF52685B))),const SizedBox(height:20),
   if(loading)const LinearProgressIndicator(),
   if(error!=null)Padding(padding:const EdgeInsets.only(bottom:15),
    child:Text(error!,style:const TextStyle(color:Color(0xFF9C3412)))),
   if(paid)Card(child:ListTile(leading:const Icon(Icons.verified,color:Color(0xFF078B59)),
    title:const Text('Business membership active'),
    subtitle:Text(paidUntil==null?'You can list products.':
     'Paid through '+DateTime.fromMillisecondsSinceEpoch(paidUntil!).toLocal().toString().split(' ').first))),
   if(paid&&paystackAllowed)Padding(
    padding:const EdgeInsets.only(bottom:12),
    child:OutlinedButton(onPressed:busy?null:manageSubscription,
     child:const Text('Manage or cancel monthly subscription'))),
   if(!paid)planCard(title:'Business membership',price:'R49 first month · then R99/month',
    highlighted:true,benefits:const [
     'Add products, prices and available stock',
     'Make your verified shop shoppable in your local area',
     'Receive orders, enquiries, collection and delivery requests',
     'Manage your products from the seller dashboard',
     'R99 monthly renewal after your first discounted month'
    ],action:paystackAllowed?'Upgrade for R49 with Paystack':purchaseLabel,
    onPressed:()=>beginCheckout(promotion:false)),
   planCard(title:'Promote your business',price:'R29 for 7 days',benefits:const [
     'Display a clearly labelled promoted business in relevant local results',
     'Seven days of promotion after verified payment',
     'Requires an active paid Business membership',
     'Improves visibility without guaranteeing sales'
    ],action:promoted?'Promotion active':!paid?'Upgrade first':
     paystackAllowed?'Promote for R29 with Paystack':purchaseLabel,
    onPressed:promoted||!paid?null:()=>beginCheckout(promotion:true)),
   if(promoted&&promotionEndsAt!=null)Text('Promotion ends '+
    DateTime.fromMillisecondsSinceEpoch(promotionEndsAt!).toLocal().toString().split(' ').first),
   if(paymentReference!=null)Card(child:Padding(padding:const EdgeInsets.all(16),
    child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
     const Text('Finish the secure Paystack checkout in your browser, then return here.'),
     const SizedBox(height:12),
     OutlinedButton(onPressed:busy?null:confirm,child:const Text('I have paid · verify payment'))]))),
   const Text('No charge at registration. Benefits activate only after server-side payment verification. Recurring billing starts at R99 after the introductory month; cancellation must be available. Store-distributed app purchases require approved store billing.',
    style:TextStyle(fontSize:12,color:Color(0xFF66776A),height:1.5))
  ])),
 );
}
