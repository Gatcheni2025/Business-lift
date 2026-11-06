import 'dart:io';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

// Store-distributed Android and iOS builds must use store-compliant billing.
// Only a deliberately configured direct-distribution build may redirect to Paystack.
const teyzaPaymentChannel=String.fromEnvironment('TEYZA_PAYMENT_CHANNEL',defaultValue:'store');
const sellerSubscriptionTermsVersion='seller-r49-r99-2026-11';
final Uri teyzaSellerMembershipPage=Uri.https('teyza.co.za','/seller-subscriptions.html');
bool teyzaCanOpenMembershipPage({required bool isAndroid,required String channel})=>
  isAndroid&&channel=='direct';
class SellerSubscriptionTermsDialog extends StatelessWidget {
 const SellerSubscriptionTermsDialog({super.key});
 @override Widget build(BuildContext context)=>AlertDialog(
  title:const Text('Confirm monthly renewal'),
  content:const Text('Your first eligible month costs R49; otherwise the first payment is R99. After that, your card is charged R99 each month until you cancel. You can manage or cancel the subscription through Paystack.'),
  actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('Not now')),
   FilledButton(onPressed:()=>Navigator.pop(context,true),child:const Text('Agree and continue'))]);
}
/// Payment is optional and is offered when the seller chooses to add products.
/// iOS boosts/listings require StoreKit instead of a Paystack redirect.
class SellerPlanPage extends StatefulWidget {
 final ShopperSession session;
 final TeyzaMobileApi? api;
 final String businessType;
 final bool showPromotion;
 final bool fromProductAction;
 const SellerPlanPage({super.key,required this.session,this.api,this.businessType='spaza',this.showPromotion=false,this.fromProductAction=false});
 @override State<SellerPlanPage> createState()=>_SellerPlanState();
}
class _SellerPlanState extends State<SellerPlanPage> with WidgetsBindingObserver {
 bool busy=false,paid=false,complimentary=false,promoted=false,loading=true,approved=false;
 bool? introEligible;
 String? error,paymentReference,renewalSetup,membershipStatus;
 int? promotionEndsAt,paidUntil,complimentaryUntil;
 TeyzaMobileApi get api=>widget.api??TeyzaMobileApi(widget.session);
 bool get paystackAllowed=>teyzaCanOpenMembershipPage(isAndroid:Platform.isAndroid,channel:teyzaPaymentChannel);
 String get purchaseLabel=>paystackAllowed?'Continue on the website':'In-app subscription unavailable';
 @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);refresh();}
 @override void dispose(){WidgetsBinding.instance.removeObserver(this);super.dispose();}
 @override void didChangeAppLifecycleState(AppLifecycleState state) {
  if(state==AppLifecycleState.resumed&&mounted)refresh();
 }
 Future<void> refresh() async {
  try {
   // Website/direct Android membership checks are safe, server-verified and do
   // not start a purchase. Store-distributed builds remain IAP-policy gated.
   Map<String,dynamic>? payment;
   if(paystackAllowed){
     try{payment=await api.call('billing_status',{'checkNow':true});}
     catch(_){/* Keep seller summary available during payment-provider outages. */}
   }
   final data=await api.call('seller_summary');
   if(mounted)setState((){approved=data['approvalStatus']=='approved';paid=data['listingPaid']==true;complimentary=data['complimentaryAccess']==true;promoted=data['promotionActive']==true;
    paidUntil=(data['paidUntil'] as num?)?.toInt();
    complimentaryUntil=(data['complimentaryUntil'] as num?)?.toInt();
    introEligible=data['introEligible'] is bool?data['introEligible'] as bool:null;
    renewalSetup=data['renewalSetup']?.toString();membershipStatus=payment?['membershipStatus']?.toString();
    promotionEndsAt=(data['promotionEndsAt'] as num?)?.toInt();loading=false;});
  }catch(e){if(mounted)setState((){loading=false;error=mobileError(e);});}
 }
 Future<void> beginCheckout({required bool promotion}) async {
  if(busy||loading)return;
  if(!approved){setState(()=>error='Your seller registration must be approved before paying for product access.');return;}
  if(!promotion&&!widget.fromProductAction){
   setState(()=>error='Choose Add a product in your seller dashboard when you are ready to activate product access.');
   return;
  }
  if(!paystackAllowed){
   setState(()=>error='In-app digital purchases require approved store billing for this app distribution. Your free shop remains available.');
   return;
  }
  if(promotion&&!paid){setState(()=>error='Upgrade your membership first.');return;}
  setState((){busy=true;error=null;});
  try{
   if(!promotion){
    // The website authenticates the same seller, presents the recurring terms,
    // and verifies the transaction server-side. No account token is in the URL.
    if(!await launchUrl(teyzaSellerMembershipPage,mode:LaunchMode.externalApplication))
      throw StateError('Could not open the Teyza membership page. Try again.');
    return;
   }
   final result=await api.call('promote_checkout');
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
   if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(
    result['paymentEnvironment']=='test'?'Test payment verified. It does not activate live selling.':'Payment verified. Your Teyza account is updated.')));
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
   const Text('Registration and verification are free. Once approved, choose membership only when you are ready to add products. Your first eligible month is R49, then R99 per month.',
    style:TextStyle(height:1.4,color:Color(0xFF52685B))),const SizedBox(height:20),
   if(loading)const LinearProgressIndicator(),
   if(error!=null)Padding(padding:const EdgeInsets.only(bottom:15),
    child:Text(error!,style:const TextStyle(color:Color(0xFF9C3412)))),
   if(paystackAllowed&&membershipStatus=='pending')const Card(child:ListTile(
     leading:Icon(Icons.schedule_outlined,color:Color(0xFFB57510)),
     title:Text('Membership payment pending'),
     subtitle:Text('Paystack is processing your payment. Teyza will activate membership automatically once confirmed. Use Refresh membership status to check again.'))),
   if(paystackAllowed&&membershipStatus=='review_required')const Card(child:ListTile(
     leading:Icon(Icons.info_outline,color:Color(0xFFB57510)),
     title:Text('Payment requires review'),
     subtitle:Text('Payment was received but eligibility changed. Contact support before paying again.'))),
   if(paid)Card(child:ListTile(leading:const Icon(Icons.verified,color:Color(0xFF078B59)),
    title:const Text('Business membership active'),
    subtitle:Text(paidUntil==null?'You can list products.':
     'Paid through '+DateTime.fromMillisecondsSinceEpoch(paidUntil!).toLocal().toString().split(' ').first))),
   if(paid&&['action_required','payment_failed','cancelled'].contains(renewalSetup))
    const Card(child:ListTile(leading:Icon(Icons.info_outline),title:Text('Check your renewal'),
     subtitle:Text('Automatic renewal is not currently confirmed. Your current access remains available until its paid end date. Contact Teyza support for help.'))),
   if(complimentary&&!paid)Card(child:ListTile(leading:const Icon(Icons.verified_outlined,color:Color(0xFF078B59)),
    title:const Text('Temporary product access'),subtitle:Text(complimentaryUntil==null?
     'An administrator granted temporary access. This is not a payment.':
     'Access ends '+DateTime.fromMillisecondsSinceEpoch(complimentaryUntil!).toLocal().toString().split(' ').first+'. No payment was recorded.'))),
   if(paystackAllowed&&(paid||['scheduled','active','payment_failed'].contains(renewalSetup)))Padding(
    padding:const EdgeInsets.only(bottom:12),
    child:OutlinedButton(onPressed:busy?null:manageSubscription,
     child:const Text('Manage or cancel monthly subscription'))),
   OutlinedButton.icon(onPressed:busy?null:refresh,icon:const Icon(Icons.refresh),
     label:const Text('Refresh membership status')),
   if(!approved&&!loading)const Card(child:ListTile(leading:Icon(Icons.hourglass_empty),title:Text('Seller approval needed'),subtitle:Text('Product access and payment are available after Teyza approves your registration.'))),
   if(!paid)planCard(title:'Business membership',price:introEligible==false?'R99/month':'R49 first month · then R99/month',
    highlighted:true,benefits:const [
     'Add products, prices and available stock',
     'Make your verified shop shoppable in your local area',
     'Receive orders, enquiries, collection and delivery requests',
     'Manage your products from the seller dashboard',
     'Standard renewal is R99 per month'
    ],action:!widget.fromProductAction?'Add a product to upgrade':paystackAllowed?(introEligible==true?'Continue on website · R49':
      introEligible==false?'Continue on website · R99':'Check price on website'):purchaseLabel,
    onPressed:approved&&widget.fromProductAction&&paystackAllowed&&membershipStatus!='pending'?()=>beginCheckout(promotion:false):null),
   planCard(title:'Promote your business',price:'R29 for 7 days',benefits:const [
     'Display a clearly labelled promoted business in relevant local results',
     'Seven days of promotion after verified payment',
     'Requires an active paid Business membership',
     'Improves visibility without guaranteeing sales'
    ],action:promoted?'Promotion active':!paid?'Upgrade first':
     paystackAllowed?'Promote for R29 with Paystack':purchaseLabel,
    onPressed:!approved||promoted||!paid||!paystackAllowed?null:()=>beginCheckout(promotion:true)),
   if(promoted&&promotionEndsAt!=null)Text('Promotion ends '+
    DateTime.fromMillisecondsSinceEpoch(promotionEndsAt!).toLocal().toString().split(' ').first),
   if(paymentReference!=null)Card(child:Padding(padding:const EdgeInsets.all(16),
    child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
     const Text('Finish the secure Paystack checkout in your browser, then return here.'),
     const SizedBox(height:12),
     OutlinedButton(onPressed:busy?null:confirm,child:const Text('I have paid · verify payment'))]))),
   if(!paystackAllowed)const Text('Store-distributed builds do not activate external subscription checkout. Any existing membership is shown after account verification and refresh.',
     style:TextStyle(fontSize:12,color:Color(0xFF66776A))),
   const Text('No charge at registration or when opening this page. Membership starts only after you choose a supported checkout and the payment is verified. The introductory price applies to the first eligible month; renewal is R99 per month.',
    style:TextStyle(fontSize:12,color:Color(0xFF66776A),height:1.5))
  ])),
 );
}

