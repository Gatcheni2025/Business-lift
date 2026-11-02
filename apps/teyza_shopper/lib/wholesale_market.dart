import 'package:flutter/material.dart';
import 'shop_orders.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

/// B2B stock sourcing; never use unverified Google Places as a seller or price source.
class WholesaleMarketPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  const WholesaleMarketPage({super.key,required this.session,this.api});
  @override State<WholesaleMarketPage> createState()=>_WholesaleMarketState();
}
class _WholesaleMarketState extends State<WholesaleMarketPage> {
  String? uid,error;
  bool loading=true,busy=false;
  List<Map<String,dynamic>> suppliers=[];
  Map<String,dynamic>? selected;
  final quantities=<String,int>{};
  String search='';
  TeyzaMobileApi get api=>widget.api??TeyzaMobileApi(widget.session);
  @override void initState(){super.initState();uid=widget.session.userId;
    widget.session.addListener(accountChanged);
    WidgetsBinding.instance.addPostFrameCallback((_)=>load());
  }
  @override void dispose(){widget.session.removeListener(accountChanged);super.dispose();}
  void accountChanged(){if(!mounted||uid==widget.session.userId)return;
    setState((){uid=widget.session.userId;suppliers=[];selected=null;quantities.clear();
      error='Account changed. Sign in as an approved spaza owner.';});}
  Future<void> load()async{
    if(uid==null||uid!=widget.session.userId){
      if(mounted)setState((){loading=false;error='Sign in with your spaza shop account.';});return;
    }
    final requestUid=uid;
    setState((){loading=true;error=null;suppliers=[];selected=null;quantities.clear();});
    try{
      final rows=<Map<String,dynamic>>[];
      String? cursor;
      for(var page=0;page<5;page++){
        final data=await api.call('wholesale_directory',{if(cursor!=null)'after':cursor});
        if(!mounted||requestUid!=widget.session.userId)return;
        rows.addAll(mobileRows(data['entries']).where((row)=>
          row['shopCategory']=='wholesale'&&row['identityVerified']==true));
        cursor=data['next'] is String?data['next'] as String:null;
        if(cursor==null||cursor.isEmpty)break;
      }
      if(mounted&&requestUid==widget.session.userId)setState((){suppliers=rows;loading=false;});
    }catch(e){if(mounted&&requestUid==widget.session.userId)
      setState((){error=mobileError(e);loading=false;});}
  }
  List<Map<String,dynamic>> get products=>selected==null?[]:
    mobileRows(selected!['products']).where((p)=>p['id'] is String&&
      p['name'] is String&&(p['priceCents'] as num? ??0)>0&&
      (p['stock'] as num? ??0)>0).toList();
  void adjust(Map<String,dynamic> p,int delta){
    final key=p['id'] as String,max=(p['stock'] as num).toInt();
    setState((){
      final n=(quantities[key]??0)+delta;
      if(n<=0)quantities.remove(key);else quantities[key]=n>max?max:n;
    });
  }
  Future<void> checkout()async{
    if(busy||selected==null||quantities.isEmpty)return;
    final supplier=selected!;
    final items=products.where((p)=>quantities.containsKey(p['id'])).map((p)=>
      <String,dynamic>{'id':p['id'],'name':p['name'],'priceCents':p['priceCents'],
        'quantity':quantities[p['id']]!}).toList();
    if(items.isEmpty)return;
    setState(()=>busy=true);
    try{
      final result=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>
        ShopperCheckoutPage(session:widget.session,api:widget.api,
          shopId:supplier['id'].toString(),shopName:supplier['name'].toString(),
          delivery:supplier['deliveryEnabled']==true,collection:supplier['pickupEnabled']==true,
          deliveryFeeCents:(supplier['deliveryFeeCents'] as num? ??0).toInt(),items:items,wholesale:true)));
      if(mounted&&result==true){
        setState(()=>quantities.clear());
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:
          Text('Your wholesale stock request was sent. Agree payment and fulfilment with your supplier.')));
      }
    }finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context){
    final supplier=selected;
    final rows=suppliers.where((p)=>p['name'].toString().toLowerCase()
      .contains(search.toLowerCase())).toList();
    final total=products.fold<int>(0,(sum,p)=>sum+
      (p['priceCents'] as num).toInt()*(quantities[p['id']]??0));
    return Scaffold(
      appBar:AppBar(title:const Text('Buy wholesale stock')),
      body:SafeArea(child:RefreshIndicator(onRefresh:load,child:ListView(
        padding:const EdgeInsets.all(16),children:[
        const Text('Wholesale marketplace',style:TextStyle(fontSize:25,fontWeight:FontWeight.w800)),
        const SizedBox(height:7),
        const Text('Choose a verified wholesaler and send a stock order. You can then choose your own retail selling prices in My Products.'),
        const SizedBox(height:8),
        const Text('Only approved Teyza wholesalers have orderable prices. Google-listed businesses must join Teyza before selling here.',
          style:TextStyle(color:Colors.black54,fontSize:12)),
        if(loading)const Padding(padding:EdgeInsets.all(20),child:Center(child:CircularProgressIndicator())),
        if(error!=null)Padding(padding:const EdgeInsets.all(12),
          child:Text(error!,style:const TextStyle(color:Colors.red))),
        if(!loading&&error==null&&supplier==null)...[
          const SizedBox(height:12),
          TextField(decoration:const InputDecoration(labelText:'Search wholesalers',
            prefixIcon:Icon(Icons.search),border:OutlineInputBorder()),
            onChanged:(v)=>setState(()=>search=v)),
          if(rows.isEmpty)const Padding(padding:EdgeInsets.all(18),
            child:Text('No approved wholesale suppliers are listed yet. Invite wholesalers in your area to register.')),
          for(final p in rows)Card(child:ListTile(
            leading:const Icon(Icons.warehouse_outlined,color:Color(0xFF087954)),
            title:Text(p['name'].toString(),style:const TextStyle(fontWeight:FontWeight.bold)),
            subtitle:Text((p['area']??'').toString()+' · '+
              (p['deliveryEnabled']==true?
                (p['deliveryFeeCents']==0?'Advertises free delivery':'Delivery offered'):
                'Collection / delivery subject to supplier')),
            trailing:const Icon(Icons.chevron_right),
            onTap:()=>setState((){selected=p;quantities.clear();})))
        ],
        if(!loading&&supplier!=null)...[
          TextButton.icon(onPressed:()=>setState((){selected=null;quantities.clear();}),
            icon:const Icon(Icons.arrow_back),label:const Text('All wholesalers')),
          Text(supplier['name'].toString(),style:const TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
          Text((supplier['area']??'').toString()),
          if(supplier['deliveryEnabled']==true&&supplier['deliveryFeeCents']==0)
            const Chip(avatar:Icon(Icons.local_shipping_outlined),label:Text('Supplier advertises free delivery')),
          const Padding(padding:EdgeInsets.symmetric(vertical:10),child:Text(
            'Wholesale prices and packs are provided by the supplier. Stock and delivery fees are confirmed in your live quote.')),
          if(products.isEmpty)const Text('This wholesaler has not published stock yet.'),
          for(final p in products)Card(child:Padding(padding:const EdgeInsets.all(12),
            child:Row(children:[
              Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                Text(p['name'].toString(),style:const TextStyle(fontWeight:FontWeight.bold)),
                Text((p['category']??'Wholesale stock').toString(),style:const TextStyle(fontSize:12)),
                Text('Wholesale R'+((p['priceCents'] as num)/100).toStringAsFixed(2)+
                  ' · stock '+p['stock'].toString()),
              ])),
              IconButton(icon:const Icon(Icons.remove_circle_outline),
                onPressed:(quantities[p['id']]??0)>0?()=>adjust(p,-1):null),
              Text((quantities[p['id']]??0).toString()),
              IconButton(icon:const Icon(Icons.add_circle_outline),
                onPressed:(quantities[p['id']]??0)<(p['stock'] as num)?()=>adjust(p,1):null),
            ]))),
          Text('Stock subtotal R'+(total/100).toStringAsFixed(2),
            style:const TextStyle(fontWeight:FontWeight.w800,fontSize:20)),
          const Text('Supplier confirms the request; this is not an in-app payment. Delivery is free only if the live quote shows R0.'),
          const SizedBox(height:12),
          FilledButton.icon(icon:const Icon(Icons.shopping_cart_checkout),
            label:Text(busy?'Opening checkout…':'Request stock from wholesaler'),
            onPressed:busy||quantities.isEmpty||
              (supplier['deliveryEnabled']!=true&&supplier['pickupEnabled']!=true)?null:checkout)
        ]
      ]))),
    );
  }
}
