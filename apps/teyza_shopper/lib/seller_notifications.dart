import 'dart:async';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'seller_push.dart';

class SellerNotificationsPage extends StatefulWidget{
  final ShopperSession session;final TeyzaMobileApi? api;
  final ValueChanged<String>? onOpen;
  const SellerNotificationsPage({super.key,required this.session,this.api,this.onOpen});
  @override State<SellerNotificationsPage> createState()=>_NotificationsState();
}
class _NotificationsState extends State<SellerNotificationsPage> with WidgetsBindingObserver{
  late final String? uid;
  late final api=widget.api??TeyzaMobileApi(widget.session);
  List<Map<String,dynamic>> rows=[];
  Map<String,bool> preferences={'orders':true,'messages':true,'stock':true,'reviews':true};
  String? error,status;bool loading=false,working=false;Timer? watch;StreamSubscription<void>? subscription;
  @override void initState(){super.initState();uid=widget.session.userId;WidgetsBinding.instance.addObserver(this);widget.session.addListener(changed);load();start();
    subscription=SellerPush(widget.session).updates.stream.listen((_)=>load());}
  void start(){watch?.cancel();watch=Timer.periodic(const Duration(seconds:25),(_)=>load());}
  @override void didChangeAppLifecycleState(AppLifecycleState s){if(s==AppLifecycleState.resumed){load();start();}else{watch?.cancel();}}
  void changed(){if(uid!=widget.session.userId&&mounted){watch?.cancel();setState((){rows=[];error='Your account changed. Close this page.';});}}
  @override void dispose(){watch?.cancel();subscription?.cancel();widget.session.removeListener(changed);WidgetsBinding.instance.removeObserver(this);super.dispose();}
  Future<void> load() async{
    if(loading||uid!=widget.session.userId)return;setState(()=>loading=true);
    try{final r=await api.call('notification_list');if(mounted&&uid==widget.session.userId)setState((){
      rows=mobileRows(r['notifications']);error=null;
      if(r['preferences'] is Map)preferences={for(final key in preferences.keys)key:(r['preferences'] as Map)[key]!=false};
    });}catch(e){if(mounted)setState(()=>error=mobileError(e));}finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> mark(List<String> ids) async{
    if(working||uid!=widget.session.userId)return;setState(()=>working=true);
    try{await api.call('notification_read',{'ids':ids});if(mounted&&uid==widget.session.userId)setState((){
      rows=[for(final row in rows){...row,if(ids.contains(row['id']))'read':true}];});}
    catch(e){if(mounted)setState(()=>error=mobileError(e));}finally{if(mounted)setState(()=>working=false);}
  }
  Future<void> settings() async{
    final chosen=Map<String,bool>.from(preferences);
    final saved=await showModalBottomSheet<bool>(context:context,isScrollControlled:true,showDragHandle:true,useSafeArea:true,builder:(c)=>StatefulBuilder(builder:(c,set)=>
      SingleChildScrollView(child:Padding(padding:const EdgeInsets.fromLTRB(22,0,22,24),child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const Text('Shop notifications',style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),const SizedBox(height:12),
        for(final item in const [('orders','Customer orders'),('messages','Customer messages'),('stock','Low stock & sold out'),('reviews','Registration & verification')])
          SwitchListTile(contentPadding:EdgeInsets.zero,title:Text(item.$2),subtitle:item.$1=='orders'?const Text('Controls phone alerts. Every order remains in your inbox.'):null,
            value:chosen[item.$1]!,onChanged:(v)=>set(()=>chosen[item.$1]=v)),
        FilledButton(onPressed:()=>Navigator.pop(c,true),child:const Text('Save preferences'))
      ])))));
    if(saved!=true||!mounted||uid!=widget.session.userId)return;
    setState(()=>working=true);
    try{await api.call('notification_preferences',chosen);if(mounted)setState((){preferences=chosen;status='Notification preferences saved.';});}
    catch(e){if(mounted)setState(()=>error=mobileError(e));}finally{if(mounted)setState(()=>working=false);}
  }
  Future<void> phoneAlerts(bool enable) async{
    if(working||uid!=widget.session.userId)return;setState((){working=true;error=null;status=null;});
    try{final push=SellerPush(widget.session);if(enable){await push.enable();}else{await push.disable();}
      if(mounted)setState(()=>status=enable?'Phone alerts enabled for this seller account.':'Phone alerts turned off on this device.');}
    catch(e){if(mounted)setState(()=>error=mobileError(e));}finally{if(mounted)setState(()=>working=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF7F8F5),
    appBar:AppBar(backgroundColor:const Color(0xFFF7F8F5),foregroundColor:const Color(0xFF010F1C),title:const Text('Shop notifications'),actions:[IconButton(tooltip:'Notification preferences',onPressed:working?null:settings,icon:const Icon(Icons.tune_rounded))]),
    body:SafeArea(child:RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(20),children:[
      Container(padding:const EdgeInsets.all(22),decoration:BoxDecoration(color:const Color(0xFF010F1C),borderRadius:BorderRadius.circular(25)),
        child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Icon(Icons.notifications_active_outlined,color:Color(0xFF70D7A8),size:32),const SizedBox(height:14),
          const Text('Stay close to your customers.',style:TextStyle(color:Colors.white,fontSize:25,fontWeight:FontWeight.w800)),
          const SizedBox(height:10),const Text('Orders, messages, stock and review updates in one place.',style:TextStyle(color:Color(0xFFCCDCD3),height:1.5)),
          const SizedBox(height:16),FilledButton(onPressed:working?null:()=>phoneAlerts(true),child:const Text('Enable phone alerts')),
          TextButton(onPressed:working?null:()=>phoneAlerts(false),child:const Text('Turn off phone alerts',style:TextStyle(color:Color(0xFFCCDCD3))))])),
      const SizedBox(height:18),if(status!=null)Text(status!,style:const TextStyle(color:Color(0xFF078E66))),
      if(error!=null)Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(error!,style:const TextStyle(color:Color(0xFF9A3412))),TextButton(onPressed:load,child:const Text('Retry'))]),
      if(loading)const LinearProgressIndicator(),
      Row(children:[const Expanded(child:Text('Recent updates',style:TextStyle(fontSize:22,fontWeight:FontWeight.w800))),
        TextButton(onPressed:working||rows.isEmpty?null:()=>mark(rows.map((r)=>r['id'].toString()).toList()),child:const Text('Mark recent read'))]),
      if(!loading&&rows.isEmpty&&error==null)const Padding(padding:EdgeInsets.symmetric(vertical:36),child:Text('You’re all caught up. New shop updates will appear here.')),
      for(final row in rows)Card(color:row['read']==true?Colors.white:const Color(0xFFE7F5ED),elevation:0,
        shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22),side:const BorderSide(color:Color(0xFFDCE8DC))),
        child:ListTile(contentPadding:const EdgeInsets.all(16),
        leading:Icon(switch(row['target']){'orders'=>Icons.receipt_long_outlined,'chat'=>Icons.chat_bubble_outline,'products'=>Icons.inventory_2_outlined,_=>Icons.verified_user_outlined},color:const Color(0xFF169F68)),
        title:Text(row['title']?.toString()??'Shop update',style:TextStyle(fontWeight:row['read']==true?FontWeight.w600:FontWeight.w800)),
        subtitle:Padding(padding:const EdgeInsets.only(top:7),child:Text(row['body']?.toString()??'',style:const TextStyle(height:1.4))),
        trailing:row['read']==true?null:const Icon(Icons.circle,size:8,color:Color(0xFF3BB77E)),onTap:working?null:() async{
          await mark([row['id'].toString()]);if(mounted&&uid==widget.session.userId&&widget.onOpen!=null){Navigator.pop(context);widget.onOpen!(row['target'].toString());}
        })),
      const SizedBox(height:14),const Text('Showing your latest 60 updates. Phone alerts depend on device permission; your private inbox remains available.',style:TextStyle(fontSize:12,color:Color(0xFF6C7880),height:1.5))
    ]))));
}
