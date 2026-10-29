import 'dart:async';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'shopper_chat.dart';
import 'teyza_mobile_api.dart';
import 'seller_push.dart';

const orderLabels={'requested':'Awaiting shop confirmation','confirmed':'Confirmed by shop',
  'preparing':'Being prepared','ready':'Ready to collect','out_for_delivery':'Out for delivery',
  'completed':'Completed','cancelled':'Cancelled'};
class ShopOrdersPanel extends StatefulWidget {
  final ShopperSession session;final bool asOwner;final TeyzaMobileApi? api;final VoidCallback? onLogin;
  const ShopOrdersPanel({super.key,required this.session,this.asOwner=false,this.api,this.onLogin});
  @override State<ShopOrdersPanel> createState()=>_OrdersState();
}
class _OrdersState extends State<ShopOrdersPanel> with WidgetsBindingObserver {
  late final api=widget.api??TeyzaMobileApi(widget.session);
  String? uid,error;List<Map<String,dynamic>> orders=[];
  bool loading=false,working=false,active=true;Timer? poll;
  StreamSubscription<void>? updates;
  @override void initState(){super.initState();uid=widget.session.userId;widget.session.addListener(accountChanged);
    WidgetsBinding.instance.addObserver(this);load();
    poll=Timer.periodic(const Duration(seconds:20),(_){if(active&&!working)load(quiet:true);});
    if(widget.asOwner)updates=SellerPush(widget.session).updates.stream.listen((_){if(active&&!working)load(quiet:true);});}
  void accountChanged(){if(uid!=widget.session.userId&&mounted){uid=widget.session.userId;
    setState(()=>orders=[]);load();}}
  @override void dispose(){poll?.cancel();updates?.cancel();widget.session.removeListener(accountChanged);WidgetsBinding.instance.removeObserver(this);super.dispose();}
  @override void didChangeAppLifecycleState(AppLifecycleState state){active=state==AppLifecycleState.resumed;}
  Future<void> load({bool quiet=false}) async {
    if(loading||widget.session.idToken==null)return;
    final requestedUid=widget.session.userId;setState((){loading=true;if(!quiet)error=null;});
    try{final result=await api.call('order_list',{'asOwner':widget.asOwner});
      if(mounted&&requestedUid==widget.session.userId)setState((){orders=mobileRows(result['orders']);error=null;});
    }catch(e){if(mounted&&requestedUid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  List<String> nextSteps(Map<String,dynamic> order)=>switch(order['status']){
    'requested'=>widget.asOwner?['confirmed','cancelled']:['cancelled'],
    'confirmed'=>widget.asOwner?['preparing','cancelled']:[],
    'preparing'=>widget.asOwner?[order['mode']=='delivery'?'out_for_delivery':'ready','cancelled']:[],
    'ready'=>widget.asOwner?['completed','cancelled']:[],
    'out_for_delivery'=>widget.asOwner?['completed']:[],_=>[]};
  Future<void> update(Map<String,dynamic> order,String status) async {
    if(working)return;
    final label=status=='cancelled'?'Cancel this request?':'Update this order?';
    final yes=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text(label),
      content:Text(status=='confirmed'?'Confirm this order and reserve its available stock?':
        status=='completed'?'Confirm that the customer has received this order.':
        status=='cancelled'?'The customer and shop will both see the cancellation.':'Set status to '+(orderLabels[status]??status)+'?'),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Go back')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Confirm'))]));
    if(yes!=true||!mounted)return;setState(()=>working=true);
    try{await api.call('order_update',{'orderId':order['id'],'status':status});await load();}
    catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>working=false);}
  }
  Future<void> chat(Map<String,dynamic> order) async {
    try{final result=await api.call('order_chat',{'orderId':order['id']});
      if(mounted)Navigator.push(context,MaterialPageRoute(builder:(_)=>ShopperChatPage(session:widget.session,asOwner:widget.asOwner,
        initialThreadId:result['threadId']?.toString(),initialTitle:widget.asOwner?order['shopperName']?.toString():order['shopName']?.toString())));
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  }
  Future<void> rateShop(Map<String,dynamic> order) async {
    final requestedUid=widget.session.userId;
    final stars=await showDialog<int>(context:context,builder:(ctx)=>SimpleDialog(
      title:const Text('Rate your shop experience'),children:[
        const Padding(padding:EdgeInsets.symmetric(horizontal:24),child:Text('Your latest rating counts once per shop. You can update it after a completed order.')),
        for(var n=5;n>=1;n--)SimpleDialogOption(onPressed:()=>Navigator.pop(ctx,n),
          child:Text('$n ${n==1?'star':'stars'}'))]));
    if(stars==null||!mounted||requestedUid!=widget.session.userId)return;
    setState(()=>working=true);
    try{await api.call('shop_rate',{'orderId':order['id'],'stars':stars});
      if(mounted&&requestedUid==widget.session.userId)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Your shop rating has been saved.')));
    }catch(e){if(mounted&&requestedUid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>working=false);}
  }
  @override Widget build(BuildContext context)=>RefreshIndicator(onRefresh:load,child:ListView(
    padding:const EdgeInsets.fromLTRB(18,22,18,30),children:[
      Text(widget.asOwner?'Customer orders':'Your orders',style:const TextStyle(fontSize:26,fontWeight:FontWeight.w800,color:Color(0xFF010F1C))),
      const SizedBox(height:7),Text(widget.asOwner?'Confirm stock, prepare orders and keep shoppers updated.':
        'Delivery and collection requests from your local shops.',style:const TextStyle(color:Color(0xFF6C7880))),
      const SizedBox(height:18),
      if(widget.session.idToken==null)Card(child:Padding(padding:const EdgeInsets.all(22),child:Column(children:[
        const Icon(Icons.shopping_bag_outlined,size:54,color:Color(0xFF3BB77E)),const SizedBox(height:12),
        const Text('Sign in to see your orders'),if(widget.onLogin!=null)FilledButton(onPressed:widget.onLogin,child:const Text('Sign in'))
      ]))),
      if(loading)const LinearProgressIndicator(),
      if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:15),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(error!,style:const TextStyle(color:Color(0xFF9A3412))),TextButton(onPressed:load,child:const Text('Retry'))])),
      if(!loading&&error==null&&orders.isEmpty&&widget.session.idToken!=null)Container(
        padding:const EdgeInsets.all(28),decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(23)),
        child:Column(children:[Image.asset('assets/images/grocery-basket.png',height:145),const SizedBox(height:18),
          const Text('No orders yet',style:TextStyle(fontSize:22,fontWeight:FontWeight.w700)),const SizedBox(height:8),
          Text(widget.asOwner?'Customer requests will appear here.':'Open a participating shop, add products and choose delivery or collection.',textAlign:TextAlign.center)])),
      for(final order in orders)Container(margin:const EdgeInsets.only(bottom:14),padding:const EdgeInsets.all(18),
        decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(22)),child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,children:[
            Row(children:[Expanded(child:Text((widget.asOwner?order['shopperName']:order['shopName'])?.toString()??'Order',
              style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800))),
              Icon(order['mode']=='delivery'?Icons.local_shipping_outlined:Icons.shopping_bag_outlined,color:const Color(0xFF3BB77E))]),
            const SizedBox(height:10),Chip(label:Text(orderLabels[order['status']]??'Awaiting confirmation')),
            Text(order['mode']=='delivery'?'Delivery':'Pay & collect',style:const TextStyle(fontWeight:FontWeight.w700)),
            if(order['mode']=='delivery')Text(order['address']?.toString()??''),
            if(widget.asOwner)Text('Contact: '+(order['phone']?.toString()??'')),
            const Divider(height:24),
            for(final item in mobileRows(order['items']))Padding(padding:const EdgeInsets.only(bottom:6),child:Row(children:[
              Expanded(child:Text(item['name'].toString()+' ×'+item['quantity'].toString())),
              Text(money(((item['priceCents'] as num? ??0)*(item['quantity'] as num? ??0)).toInt()))])),
            const Divider(),
            Text('Items: '+money((order['subtotalCents'] as num? ??0).toInt())),
            if(order['mode']=='delivery')Text('Delivery: '+money((order['deliveryFeeCents'] as num? ??0).toInt())),
            if((order['cashDiscountCents'] as num? ??0)>0)Text('Cash discount: −'+money((order['cashDiscountCents'] as num).toInt())),
            Text(order['paymentMethod']=='card_at_shop'?'Card at shop · no extra card charge':order['paymentMethod']=='cash'?'Cash payment':'Payment to be arranged with shop'),
            const SizedBox(height:8),Row(children:[const Expanded(child:Text('Total',style:TextStyle(fontWeight:FontWeight.w700))),
              Text(money((order['totalCents'] as num? ??0).toInt()),style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800))]),
            const SizedBox(height:7),const Text('Payment arranged with the shop. No online payment has been taken.',style:TextStyle(fontSize:11,color:Color(0xFF6C7880))),
            Wrap(spacing:7,children:[for(final status in nextSteps(order))TextButton(onPressed:working?null:()=>update(order,status),
              child:Text(switch(status){'confirmed'=>'Confirm order','preparing'=>'Start preparing','ready'=>'Ready to collect',
                'out_for_delivery'=>'Out for delivery','completed'=>'Mark completed',_=>'Cancel'})),
              TextButton.icon(onPressed:working?null:()=>chat(order),icon:const Icon(Icons.chat_bubble_outline,size:17),label:const Text('Message')),
              if(!widget.asOwner&&order['status']=='completed')TextButton.icon(onPressed:working?null:()=>rateShop(order),
                icon:const Icon(Icons.star_outline,size:17),label:const Text('Rate shop'))])
          ]))
    ]));
}

class ShopperCheckoutPage extends StatefulWidget {
  final ShopperSession session;final String shopId,shopName;
  final List<Map<String,dynamic>> items;final bool delivery,collection,acceptsCard;final int deliveryFeeCents,cashDiscountPercent;
  final TeyzaMobileApi? api;
  const ShopperCheckoutPage({super.key,required this.session,required this.shopId,required this.shopName,
    required this.items,required this.delivery,required this.collection,this.deliveryFeeCents=0,this.cashDiscountPercent=0,this.acceptsCard=false,this.api});
  @override State<ShopperCheckoutPage> createState()=>_CheckoutState();
}
class _CheckoutState extends State<ShopperCheckoutPage>{
  late final String? uid=widget.session.userId;
  late final api=widget.api??TeyzaMobileApi(widget.session);
  late String mode=widget.collection?'collection':'delivery';String paymentMethod='cash';
  final address=TextEditingController(),phone=TextEditingController();
  final requestId='r'+DateTime.now().microsecondsSinceEpoch.toString();
  bool working=false,checking=false;String? error;int quoteRequest=0;Map<String,dynamic>? quote;
  @override void initState(){super.initState();widget.session.addListener(accountChanged);loadQuote();}
  void accountChanged(){if(mounted&&uid!=widget.session.userId){quoteRequest++;address.clear();phone.clear();setState((){quote=null;error='Your account changed. Reopen your basket.';checking=false;});}}
  @override void dispose(){quoteRequest++;widget.session.removeListener(accountChanged);address.dispose();phone.dispose();super.dispose();}
  Map<String,dynamic> get request=>{'shopId':widget.shopId,'mode':mode,'paymentMethod':paymentMethod,
    'items':widget.items.map((x)=>{'id':x['id'],'quantity':x['quantity']}).toList()};
  Future<void> loadQuote() async {
    if(uid!=widget.session.userId)return;
    if(!widget.collection&&!widget.delivery){setState(()=>error='This shop is not currently accepting delivery or collection requests.');return;}
    final ticket=++quoteRequest;setState((){checking=true;quote=null;error=null;});
    try{final result=await api.call('order_quote',request);
      if(!mounted||uid!=widget.session.userId||ticket!=quoteRequest)return;
      if(result['quote'] is! Map)throw StateError('Could not check the current order total. Please retry.');
      final current=Map<String,dynamic>.from(result['quote'] as Map);
      if(current['quoteId'] is! String||current['totalCents'] is! num)throw StateError('Could not check the current order total. Please retry.');
      setState(()=>quote=current);
    }catch(e){if(mounted&&uid==widget.session.userId&&ticket==quoteRequest)setState(()=>error=mobileError(e));}
    finally{if(mounted&&ticket==quoteRequest)setState(()=>checking=false);}
  }
  Future<void> submit() async {
    if(working||checking||quote==null||uid!=widget.session.userId)return;
    if(phone.text.replaceAll(RegExp(r'\D'),'').length<9||(mode=='delivery'&&address.text.trim().length<8)){
      setState(()=>error='Enter your contact number and, for delivery, a complete delivery address.');return;}
    setState((){working=true;error=null;});
    try{await api.call('order_request',{...request,'requestId':requestId,'phone':phone.text.trim(),'address':address.text.trim(),'expectedQuoteId':quote!['quoteId']});
      if(mounted&&uid==widget.session.userId)Navigator.pop(context,true);
    }catch(e){if(mounted&&uid==widget.session.userId)setState((){error=mobileError(e);quote=null;});}
    finally{if(mounted)setState(()=>working=false);}
  }
  int cents(String key)=>(quote?[key] as num? ??0).toInt();
  @override Widget build(BuildContext context){
    final hasOptions=widget.collection||widget.delivery;
    return Scaffold(appBar:AppBar(title:const Text('Delivery or collection')),body:ListView(padding:const EdgeInsets.all(20),children:[
      Text(widget.shopName,style:const TextStyle(fontSize:24,fontWeight:FontWeight.w800)),const SizedBox(height:18),
      if(hasOptions)SegmentedButton<String>(segments:[if(widget.collection)const ButtonSegment(value:'collection',label:Text('Collect'),icon:Icon(Icons.shopping_bag_outlined)),
        if(widget.delivery)const ButtonSegment(value:'delivery',label:Text('Delivery'),icon:Icon(Icons.local_shipping_outlined))],selected:{mode},
        onSelectionChanged:working||uid!=widget.session.userId?null:(v){setState((){mode=v.first;if(mode=='delivery')paymentMethod='cash';});loadQuote();}),
      const SizedBox(height:20),const Text('Payment with the shop',style:TextStyle(fontSize:17,fontWeight:FontWeight.w700)),
      const SizedBox(height:8),Wrap(spacing:8,runSpacing:8,children:[
        ChoiceChip(label:Text(mode=='delivery'?'Cash on delivery':'Cash'),selected:paymentMethod=='cash',
          onSelected:working||uid!=widget.session.userId?null:(_){setState(()=>paymentMethod='cash');loadQuote();}),
        if(mode=='collection'&&widget.acceptsCard)ChoiceChip(label:const Text('Card at the shop'),selected:paymentMethod=='card_at_shop',
          onSelected:working||uid!=widget.session.userId?null:(_){setState(()=>paymentMethod='card_at_shop');loadQuote();}),
      ]),
      if(paymentMethod=='card_at_shop')const Padding(padding:EdgeInsets.only(top:8),child:Text('No extra card charge. Pay the shop’s advertised price.')),
      const SizedBox(height:20),TextField(controller:phone,enabled:!working&&uid==widget.session.userId,keyboardType:TextInputType.phone,autofillHints:const [AutofillHints.telephoneNumber],
        decoration:const InputDecoration(labelText:'Contact number',border:OutlineInputBorder())),const SizedBox(height:16),
      if(mode=='delivery')...[
        TextField(controller:address,enabled:!working&&uid==widget.session.userId,maxLines:3,decoration:const InputDecoration(labelText:'Full delivery address',border:OutlineInputBorder())),
        const SizedBox(height:16)],
      if(checking)const LinearProgressIndicator(),
      for(final item in quote==null?widget.items:mobileRows(quote!['items']))ListTile(contentPadding:EdgeInsets.zero,title:Text(item['name'].toString()),
        trailing:Text('×'+item['quantity'].toString())),
      if(quote!=null)...[
        const Divider(),Text('Item subtotal: '+money(cents('subtotalCents'))),
        if(mode=='delivery')Text('Delivery fee: '+money(cents('deliveryFeeCents'))),
        if(cents('cashDiscountCents')>0)Text('10% cash discount on items: −'+money(cents('cashDiscountCents'))),
        if(paymentMethod=='card_at_shop')Text('Extra card charge: '+money(cents('cardFeeCents'))),
        const SizedBox(height:10),Text('Total: '+money(cents('totalCents')),style:const TextStyle(fontSize:23,fontWeight:FontWeight.w800)),
      ],
      const SizedBox(height:15),const Text('The shop will confirm stock and delivery availability. Payment is arranged directly with the shop.'),
      if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:14),child:Text(error!,style:const TextStyle(color:Colors.red))),
      TextButton.icon(onPressed:checking||working||uid!=widget.session.userId?null:loadQuote,icon:const Icon(Icons.refresh),label:const Text('Refresh order total')),
      FilledButton(onPressed:working||checking||quote==null||uid!=widget.session.userId?null:submit,child:Text(working?'Sending…':'Send order request'))
    ]));
  }
}
