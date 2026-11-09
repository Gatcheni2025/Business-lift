import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

const _ink=Color(0xFF063F3F),_subtle=Color(0xFF60736B);
String teyzaBillingMoney(Object? value){
  final cents=value is num?value.toInt():null;
  return cents==null||cents<0?'Not invoiced':'R${(cents/100).toStringAsFixed(2)}';
}
String teyzaBillingDate(Object? value){
  if(value is! num||value<=0)return 'Not scheduled';
  // Paystack cycle dates are server timestamps. South Africa observes UTC+2.
  final date=DateTime.fromMillisecondsSinceEpoch(value.toInt(),isUtc:true).add(const Duration(hours:2));
  const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return '${date.day} ${month[date.month-1]} ${date.year}';
}
String teyzaBillingStatus(String status)=>switch(status){
  'paid'=>'Paid · active',
  'complimentary_access'=>'Temporary complimentary access',
  'legacy_temporary_access'=>'Historic processing access · not a payment',
  'payment_failed'=>'Renewal payment failed',
  'cancelled'=>'Renewal cancelled',
  'action_required'=>'Paystack action required',
  _=>'No verified subscription',
};

class SellerBillingCard extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  const SellerBillingCard({super.key,required this.session,this.api});
  @override State<SellerBillingCard> createState()=>_SellerBillingCardState();
}
class _SellerBillingCardState extends State<SellerBillingCard> {
  late final String? uid=widget.session.userId;
  bool loading=true;
  String? error;
  Map<String,dynamic>? data;
  @override void initState(){super.initState();widget.session.addListener(_sessionChanged);load();}
  @override void dispose(){widget.session.removeListener(_sessionChanged);super.dispose();}
  void _sessionChanged(){
    if(uid!=widget.session.userId&&mounted)setState((){
      data=null;error='The signed-in business account changed. Reopen your profile to view its statement.';loading=false;
    });
  }
  Future<void> load() async {
    if(uid==null||uid!=widget.session.userId)return;
    setState((){loading=true;error=null;});
    try{
      final result=await (widget.api??TeyzaMobileApi(widget.session)).call('seller_billing_overview');
      if(!mounted||uid!=widget.session.userId)return;
      if(result['sellerUid']!=uid||result['provider']!='paystack')throw StateError('Billing identity did not match your signed-in shop.');
      setState(()=>data=result);
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted&&uid==widget.session.userId)setState(()=>loading=false);}
  }
  @override Widget build(BuildContext context){
    final b=data;
    final paid=b?['paymentVerified']==true;
    final next=b?['nextBillingAt'];
    return Card(
      key:const ValueKey('seller-billing-preview'),
      color:Colors.white,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(20)),
      child:Padding(padding:const EdgeInsets.all(16),child:Column(
        crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(children:[
            const Icon(Icons.receipt_long_outlined,color:_ink),
            const SizedBox(width:9),
            const Expanded(child:Text('Subscription & billing',style:TextStyle(fontSize:17,fontWeight:FontWeight.w800))),
            IconButton(tooltip:'Refresh subscription status',onPressed:loading?null:load,icon:const Icon(Icons.refresh)),
          ]),
          if(loading)const LinearProgressIndicator(),
          if(error!=null)Padding(padding:const EdgeInsets.only(top:9),child:Text('Could not load billing: $error',
            style:const TextStyle(color:Color(0xFFA33B21)))),
          if(b!=null)...[
            const SizedBox(height:9),
            Text(teyzaBillingStatus(b['status']?.toString()??''),style:const TextStyle(fontWeight:FontWeight.w700,color:_ink)),
            const SizedBox(height:9),
            Text('Monthly plan: ${teyzaBillingMoney(b['monthlyFeeCents'])}',style:const TextStyle(color:_subtle)),
            Text('Next billing: ${teyzaBillingDate(next)}',style:const TextStyle(color:_subtle)),
            Text('Amount due: ${teyzaBillingMoney(b['amountDueCents'])}',
              style:const TextStyle(color:_subtle)),
            if(next!=null)Text('Next scheduled charge: ${teyzaBillingMoney(b['nextBillAmountCents'])}',
              style:const TextStyle(color:_subtle)),
            if(paid)Text('Paid through: ${teyzaBillingDate(b['paidThrough'])}',
              style:const TextStyle(color:_subtle)),
            if(b['temporaryAccessUntil']!=null)Text(
              'Temporary access until ${teyzaBillingDate(b['temporaryAccessUntil'])} (not a collected payment)',
              style:const TextStyle(color:_subtle)),
            if(b['amountDueCents']==null)
              const Text('No confirmed outstanding renewal invoice. Any R99 activation price is separate from an amount owed.',
                style:TextStyle(fontSize:11,color:_subtle)),
            const SizedBox(height:11),
            OutlinedButton.icon(
              key:const ValueKey('seller-open-statement'),
              onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>
                SellerBillingPage(session:widget.session,api:widget.api))),
              icon:const Icon(Icons.description_outlined),
              label:const Text('View statement & payments'),
            ),
          ],
        ])),
    );
  }
}

class SellerBillingPage extends StatefulWidget {
  final ShopperSession session;final TeyzaMobileApi? api;
  const SellerBillingPage({super.key,required this.session,this.api});
  @override State<SellerBillingPage> createState()=>_SellerBillingPageState();
}
class _SellerBillingPageState extends State<SellerBillingPage> {
  late final String? uid=widget.session.userId;
  bool loading=true;String? error;Map<String,dynamic>? data;
  @override void initState(){super.initState();widget.session.addListener(_changed);refresh();}
  @override void dispose(){widget.session.removeListener(_changed);super.dispose();}
  void _changed(){
    if(mounted&&uid!=widget.session.userId)setState((){
      data=null;error='Account switched. Close this statement and reopen it from the right business.';loading=false;
    });
  }
  Future<void> refresh() async {
    if(uid==null||uid!=widget.session.userId)return;
    setState((){loading=true;error=null;});
    try{
      final response=await (widget.api??TeyzaMobileApi(widget.session)).call('seller_billing_overview');
      if(!mounted||uid!=widget.session.userId)return;
      if(response['sellerUid']!=uid||response['provider']!='paystack')
        throw StateError('Billing information does not belong to this seller.');
      setState(()=>data=response);
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted&&uid==widget.session.userId)setState(()=>loading=false);}
  }
  Widget summary(String title,String value,{String? note})=>Card(color:Colors.white,child:Padding(
    padding:const EdgeInsets.all(15),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(title,style:const TextStyle(fontSize:12,color:_subtle)),
      const SizedBox(height:5),Text(value,style:const TextStyle(fontSize:19,fontWeight:FontWeight.w800,color:_ink)),
      if(note!=null)Padding(padding:const EdgeInsets.only(top:5),child:Text(note,style:const TextStyle(fontSize:11,color:_subtle))),
    ])));
  @override Widget build(BuildContext context){
    final b=data;
    final tx=b?['transactions'] is List?b!['transactions'] as List:const [];
    return Scaffold(backgroundColor:const Color(0xFFF4F8F5),
      appBar:AppBar(title:const Text('Subscription & statements'),actions:[
        IconButton(tooltip:'Refresh billing',onPressed:loading?null:refresh,icon:const Icon(Icons.refresh)),
      ]),
      body:ListView(padding:const EdgeInsets.all(16),children:[
        if(loading)const LinearProgressIndicator(),
        if(error!=null)Card(child:Padding(padding:const EdgeInsets.all(16),child:Text(
          'Billing information is unavailable. Retry without starting a new payment. $error',
          style:const TextStyle(color:Color(0xFFA33B21))))),
        if(b!=null)...[
          Text(b['shopName']?.toString()??'Your Teyza business',style:const TextStyle(fontSize:21,fontWeight:FontWeight.w800)),
          Text(b['businessType']=='wholesale'?'Wholesaler membership':
            b['businessType']=='spaza'?'Spaza shop membership':'Business membership',
            style:const TextStyle(color:_subtle)),
          const SizedBox(height:10),
          summary('Subscription status',teyzaBillingStatus(b['status']?.toString()??''),
            note:'Paystack card billing · Verified live charges only'),
          summary('Monthly membership',teyzaBillingMoney(b['monthlyFeeCents']),
            note:'First-time introductory rate is ${teyzaBillingMoney(b['introductoryFeeCents'])}, if eligible'),
          summary('Next billing date',teyzaBillingDate(b['nextBillingAt']),
            note:b['nextBillingAt']==null?'No Paystack renewal date is confirmed':
              'Scheduled amount: ${teyzaBillingMoney(b['nextBillAmountCents'])}'),
          summary('Amount due',teyzaBillingMoney(b['amountDueCents']),
            note:b['amountDueIsInvoice']==true?'Verified invoice':
              'Not a debt or invoice unless a provider payment failure has been confirmed'),
          if(b['paidThrough']!=null)
            summary('Paid through',teyzaBillingDate(b['paidThrough'])),
          if(b['temporaryAccessUntil']!=null)
            summary('Temporary access (not paid)',teyzaBillingDate(b['temporaryAccessUntil'])),
          if(b['renewalStatus']=='action_required'||b['renewalStatus']=='payment_failed')
            const Padding(padding:EdgeInsets.all(12),child:Text(
              'Paystack renewal needs attention. Manage your card on the official Teyza website or contact support. No automatic bank-mandate collection is active.',
              style:TextStyle(color:Color(0xFF9A641D)))),
          const SizedBox(height:18),
          const Text('Payment statement',style:TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
          const SizedBox(height:5),
          const Text('Verified Paystack transactions are separate from historical Netcash mandates and shopper order payments.',
            style:TextStyle(color:_subtle,fontSize:12)),
          if(tx.isEmpty)const Padding(padding:EdgeInsets.symmetric(vertical:18),child:Text(
            'No Paystack membership transactions recorded for this account yet.')),
          for(final raw in tx)
            if(raw is Map)Card(child:ListTile(
              title:Text('${teyzaBillingMoney(raw['amountCents'])} · ${raw['status']??'pending'}',
                style:const TextStyle(fontWeight:FontWeight.w700)),
              subtitle:Text('${teyzaBillingDate(raw['date'])} · ${raw['kind']??'membership'} · ${raw['environment']??'unconfirmed'}\nReference: ${raw['reference']??''}'),
              isThreeLine:true,
              trailing:raw['paymentVerified']==true?
                const Icon(Icons.verified_outlined,color:Color(0xFF128356)):
                const Icon(Icons.info_outline,color:Color(0xFFB18542)),
            )),
          if(b['historyTruncated']==true)const Text(
            'This is a limited transaction preview. Contact Teyza support for archived statements.',
            style:TextStyle(fontSize:12,color:_subtle)),
          const SizedBox(height:16),
          const Text('This page does not charge your card, create a Paystack subscription or migrate bank consent. Payments and cancellations are handled securely through the website.',
            style:TextStyle(fontSize:12,color:_subtle)),
        ],
      ]),
    );
  }
}
