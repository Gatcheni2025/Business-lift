import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'shopper_chat.dart';
import 'teyza_mobile_api.dart';

/// A wholesaler must explicitly approve a spaza before it receives prices,
/// discounts and negotiated delivery charges.
class WholesaleConnectionsPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  const WholesaleConnectionsPage({super.key,required this.session,this.api});
  @override State<WholesaleConnectionsPage> createState()=>_ConnectionsState();
}
class _ConnectionsState extends State<WholesaleConnectionsPage>{
  late final api=widget.api??TeyzaMobileApi(widget.session);
  late final uid=widget.session.userId;
  bool loading=false,working=false;
  String? error;
  List<Map<String,dynamic>> links=[];
  @override void initState(){super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)load();});}
  Future<void> load()async{
    if(loading||uid!=widget.session.userId)return;
    setState((){loading=true;error=null;});
    try{
      final response=await api.call('wholesale_connections');
      if(mounted&&uid==widget.session.userId)
        setState(()=>links=mobileRows(response['connections']));
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> decide(Map<String,dynamic> shop,String status)async{
    if(working||uid!=widget.session.userId)return;
    final discount=TextEditingController(text:
      (shop['discountPercent']??0).toString());
    final delivery=TextEditingController(text:shop['deliveryFeeCents'] is num?
      ((shop['deliveryFeeCents'] as num)/100).toStringAsFixed(2):'');
    try{
      final confirmed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
        title:Text(status=='approved'?'Approve connection and terms':'Decline connection'),
        content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,
          crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('Spaza: ${shop['name']}'),
          if(status=='approved')...[
            const SizedBox(height:12),
            TextField(controller:discount,keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'Discount % (0–50)')),
            const SizedBox(height:12),
            TextField(controller:delivery,keyboardType:const TextInputType.numberWithOptions(decimal:true),
              decoration:const InputDecoration(labelText:'Delivery fee (R)',
                helperText:'Leave blank for your usual advertised fee')),
            const SizedBox(height:8),
            const Text('These actual supplier-authorized terms will be applied to live stock quotes.',
              style:TextStyle(fontSize:12)),
          ]else const Text('The spaza will not see your private prices or be able to order.'),
        ])),
        actions:[
          TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,true),
            child:Text(status=='approved'?'Approve supplier terms':'Decline')),
        ]));
      if(confirmed!=true||!mounted)return;
      final percentage=int.tryParse(discount.text.trim());
      final fee=delivery.text.trim().isEmpty?null:
        double.tryParse(delivery.text.trim());
      if(status=='approved'&&(percentage==null||percentage<0||percentage>50||
          (delivery.text.trim().isNotEmpty&&(fee==null||fee<0||fee>10000)))){
        setState(()=>error='Enter a valid discount and delivery fee.');return;
      }
      setState((){working=true;error=null;});
      await api.call('wholesale_connection_respond',{
        'spazaUid':shop['spazaUid'],'status':status,
        if(status=='approved')'discountPercent':percentage,
        if(status=='approved'&&fee!=null)'deliveryFeeCents':(fee*100).round(),
      });
      if(mounted)await load();
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{discount.dispose();delivery.dispose();if(mounted)setState(()=>working=false);}
  }
  Future<void> chat(Map<String,dynamic> shop)async{
    if(shop['status']!='approved')return;
    try{
      final result=await api.call('wholesale_connection_chat_open',
        {'spazaUid':shop['spazaUid']});
      if(!mounted)return;
      Navigator.push(context,MaterialPageRoute(builder:(_)=>ShopperChatPage(
        session:widget.session,api:widget.api,asOwner:true,
        initialThreadId:result['threadId']?.toString(),
        initialTitle:shop['name']?.toString()??'Spaza partner')));
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Spaza partnerships'),
      actions:[IconButton(tooltip:'Refresh connections',onPressed:loading?null:load,
        icon:const Icon(Icons.refresh))]),
    body:SafeArea(child:RefreshIndicator(onRefresh:load,child:ListView(
      padding:const EdgeInsets.all(16),children:[
      const Text('Connect with spaza shops',style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),
      const Text('Approve genuine retailers and set their discounted prices and delivery fees. '
        'Only your approved partners can access these terms or send wholesale orders.'),
      if(loading)const LinearProgressIndicator(),
      if(error!=null)Padding(padding:const EdgeInsets.all(10),
        child:Text(error!,style:const TextStyle(color:Colors.red))),
      if(links.isEmpty&&!loading)
        const Padding(padding:EdgeInsets.all(24),
          child:Text('No spaza partnership requests yet.')),
      for(final shop in links)Card(child:Padding(padding:const EdgeInsets.all(14),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(shop['name']?.toString()??'Spaza shop',
          style:const TextStyle(fontSize:17,fontWeight:FontWeight.bold)),
        Text(shop['area']?.toString()??''),
        Text('Status: ${shop['status']??'pending'}'),
        if(shop['status']=='approved')
          Text('Discount ${shop['discountPercent']??0}% · '+
            (shop['deliveryFeeCents'] is num?
              'Delivery R${((shop['deliveryFeeCents'] as num)/100).toStringAsFixed(2)}':
              'Usual delivery fee')),
        const SizedBox(height:9),
        Wrap(spacing:8,children:[
          if(shop['status']!='declined')FilledButton.tonal(
            onPressed:working?null:()=>decide(shop,'approved'),
            child:Text(shop['status']=='approved'?'Edit partner terms':'Approve & set terms')),
          if(shop['status']=='pending')OutlinedButton(
            onPressed:working?null:()=>decide(shop,'declined'),
            child:const Text('Decline')),
          if(shop['status']=='approved')OutlinedButton.icon(
            onPressed:()=>chat(shop),
            icon:const Icon(Icons.chat_bubble_outline),
            label:const Text('Open messages')),
        ]),
      ]))),
    ]))),
  );
}
