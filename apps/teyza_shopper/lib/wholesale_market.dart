import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'shopper_chat.dart';
import 'package:geocoding/geocoding.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_discovery.dart';
import 'shop_orders.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

/// B2B stock sourcing; never use unverified Google Places as a seller or price source.
class WholesaleMarketPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final String businessAddress;
  const WholesaleMarketPage({super.key,required this.session,this.api,this.businessAddress=''});
  @override State<WholesaleMarketPage> createState()=>_WholesaleMarketState();
}
class _WholesaleMarketState extends State<WholesaleMarketPage> {
  String? uid,error;
  bool loading=true,busy=false;
  List<Map<String,dynamic>> suppliers=[];
  List<OnlineShop> googleSuppliers=[];
  String? discoveryError,memberNotice;
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
    setState((){uid=widget.session.userId;suppliers=[];googleSuppliers=[];selected=null;quantities.clear();
      error='Account changed. Sign in as an approved spaza owner.';});}
  Future<void> load()async{
    if(uid==null||uid!=widget.session.userId){
      if(mounted)setState((){loading=false;error='Sign in with your spaza shop account.';});return;
    }
    final requestUid=uid;
    setState((){loading=true;error=null;memberNotice=null;discoveryError=null;
      suppliers=[];googleSuppliers=[];selected=null;quantities.clear();});
    // Public discovery and private B2B ordering are intentionally independent.
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
      suppliers=rows;
    }catch(e){
      memberNotice='Wholesale connections require an approved Teyza spaza registration and active product access. Membership is R49 for the first eligible month, then R99 per month.';
    }
    try{
      if(widget.businessAddress.trim().isEmpty)throw StateError('Add your shop address to discover nearby wholesalers.');
      final locations=await locationFromAddress(widget.businessAddress).timeout(const Duration(seconds:12));
      if(locations.isEmpty)throw StateError('Unable to find your shop location.');
      final origin=locations.first;
      suppliers.sort((a,b){
        final al=a['latitude'],ao=a['longitude'],bl=b['latitude'],bo=b['longitude'];
        final ad=al is num&&ao is num?distanceKm(origin.latitude,origin.longitude,al.toDouble(),ao.toDouble()):1e9;
        final bd=bl is num&&bo is num?distanceKm(origin.latitude,origin.longitude,bl.toDouble(),bo.toDouble()):1e9;
        return ad.compareTo(bd);
      });
      final results=await findOnlineShops(latitude:origin.latitude,longitude:origin.longitude,
        category:'wholesale',radiusKm:50);
      if(mounted&&requestUid==widget.session.userId)googleSuppliers=results;
    }catch(_){
      discoveryError='Google-linked wholesale discovery is unavailable for this address. Check your shop address, connection and Places deployment.';
    }
    if(mounted&&requestUid==widget.session.userId)setState(()=>loading=false);
  }
  Future<void> connect(Map<String,dynamic> supplier)async{
    if(busy)return;
    setState(()=>busy=true);
    try{
      final result=await api.call('wholesale_connection_request',{
        'supplierUid':supplier['id']});
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content:Text(result['status']=='approved'?'Supplier already connected.':
          'Connection request sent. The wholesaler must approve your terms.')));
      if(mounted)await load();
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> supplierChat(Map<String,dynamic> supplier)async{
    if(supplier['connected']!=true||busy)return;
    try{
      final result=await api.call('wholesale_connection_chat_open',
        {'supplierUid':supplier['id']});
      if(!mounted)return;
      Navigator.push(context,MaterialPageRoute(builder:(_)=>ShopperChatPage(
        session:widget.session,api:widget.api,
        initialThreadId:result['threadId']?.toString(),
        initialTitle:supplier['name']?.toString()??'Wholesaler')));
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  }
  double distanceKm(double a,double b,double c,double d){
    const radius=6371.0,rad=math.pi/180;
    final deltaLat=(c-a)*rad,deltaLon=(d-b)*rad;
    final h=math.pow(math.sin(deltaLat/2),2)+math.cos(a*rad)*
      math.cos(c*rad)*math.pow(math.sin(deltaLon/2),2);
    return 2*radius*math.asin(math.sqrt(h.clamp(0.0,1.0)));
  }
  Future<void> requestSupplierLink(OnlineShop supplier)async{
    if(busy)return;
    setState(()=>busy=true);
    try{
      if(supplier.origin=='google_places'&&supplier.placeId.isNotEmpty){
        await api.call('wholesale_link_request',{
          'placeId':supplier.placeId,'name':supplier.name,'address':supplier.address});
        if(mounted)ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content:Text('Supplier link requested. Teyza must confirm the wholesaler before orders are available.')));
      }else{
        final text=Uri.encodeComponent('Please register your wholesale business on Teyza so spaza shops can request stock: https://www.teyza.co.za/');
        await launchUrl(Uri.parse('https://wa.me/?text=$text'),mode:LaunchMode.externalApplication);
      }
    }catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(mobileError(e))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> openMaps(OnlineShop place)async{
    final uri=Uri.tryParse(place.source);
    if(uri!=null&&uri.scheme=='https')await launchUrl(uri,mode:LaunchMode.externalApplication);
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
        const Text('Discover approved wholesalers near your spaza, request a connection and chat. Once the supplier approves, view their agreed discounts and delivery fee.'),
        const SizedBox(height:8),
        const Text('Only approved Teyza wholesalers have orderable prices. Google-listed businesses must join Teyza before selling here.',
          style:TextStyle(color:Colors.black54,fontSize:12)),
        if(memberNotice!=null)Padding(padding:const EdgeInsets.symmetric(vertical:8),
          child:Text(memberNotice!,style:const TextStyle(color:Colors.deepOrange))),
        if(discoveryError!=null)Padding(padding:const EdgeInsets.symmetric(vertical:8),
          child:Text(discoveryError!,style:const TextStyle(color:Colors.black54))),
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
          for(final p in rows)Card(child:Padding(
            padding:const EdgeInsets.all(12),child:Column(
              crossAxisAlignment:CrossAxisAlignment.start,children:[
              ListTile(contentPadding:EdgeInsets.zero,
                leading:const Icon(Icons.warehouse_outlined,color:Color(0xFF087954)),
                title:Text(p['name'].toString(),style:const TextStyle(fontWeight:FontWeight.bold)),
                subtitle:Text((p['area']??'').toString()+' · '+
                  (p['connected']==true?'Connected supplier':
                   p['connectionStatus']=='pending'?'Waiting for supplier approval':
                   'Request a partnership to unlock private prices')),
                trailing:p['connected']==true?const Icon(Icons.verified,color:Colors.green):null),
              if(p['connected']==true)...[
                Text('Approved discount: ${p['discountPercent']??0}%'),
                if(p['deliveryFeeCents'] is num)
                  Text('Supplier delivery fee: R${((p['deliveryFeeCents'] as num)/100).toStringAsFixed(2)}'),
              ],
              Wrap(spacing:8,runSpacing:8,children:[
                if(p['connected']==true)...[
                  FilledButton.icon(onPressed:()=>setState((){selected=p;quantities.clear();}),
                    icon:const Icon(Icons.local_offer_outlined),label:const Text('View negotiated prices')),
                  OutlinedButton.icon(onPressed:()=>supplierChat(p),
                    icon:const Icon(Icons.chat_bubble_outline),label:const Text('Chat with wholesaler')),
                ]else if(p['connectionStatus']=='pending')
                  const OutlinedButton(onPressed:null,child:Text('Request pending'))
                else FilledButton.tonalIcon(onPressed:busy?null:()=>connect(p),
                  icon:const Icon(Icons.handshake_outlined),label:const Text('Connect')),
              ]),
          ]))),
          const SizedBox(height:20),
          const Text('Nearby Google-listed wholesalers',style:TextStyle(fontSize:20,fontWeight:FontWeight.bold)),
          const Text('These businesses are not automatically on Teyza. You can view their map listing or request that Teyza contact them to join.',
            style:TextStyle(fontSize:12,color:Colors.black54)),
          if(googleSuppliers.isEmpty)const Padding(padding:EdgeInsets.all(14),
            child:Text('No public wholesale suppliers were found. Check your business address or try another area.')),
          for(final g in googleSuppliers.where((p)=>
              p.name.toLowerCase().contains(search.toLowerCase())))Card(child:Padding(
            padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(g.name,style:const TextStyle(fontWeight:FontWeight.bold)),
              Text(g.address,style:const TextStyle(fontSize:12)),
              if(g.phone.isNotEmpty)Text('Contact: '+g.phone,style:const TextStyle(fontSize:12)),
              const SizedBox(height:8),
              Wrap(spacing:8,runSpacing:8,children:[
                OutlinedButton.icon(onPressed:()=>openMaps(g),
                  icon:const Icon(Icons.map_outlined),label:const Text('View on Maps')),
                FilledButton.tonalIcon(onPressed:busy?null:()=>requestSupplierLink(g),
                  icon:const Icon(Icons.add_link),label:const Text('Request supplier link')),
              ]),
              const Text('Not yet connected to Teyza · Orders unavailable',
                style:TextStyle(fontSize:11,color:Colors.black54))
            ]))),
        ],
        if(!loading&&supplier!=null)...[
          TextButton.icon(onPressed:()=>setState((){selected=null;quantities.clear();}),
            icon:const Icon(Icons.arrow_back),label:const Text('All wholesalers')),
          Text(supplier['name'].toString(),style:const TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
          Text((supplier['area']??'').toString()),
          Text('Connected · ${supplier['discountPercent']??0}% negotiated discount'),
          OutlinedButton.icon(onPressed:()=>supplierChat(supplier),
            icon:const Icon(Icons.chat_bubble_outline),label:const Text('Message this wholesaler')),
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
