import 'dart:async';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

const chatGreen=Color(0xFF3BB77E);
class ShopperConversation {
  final String id,name;
  const ShopperConversation(this.id,this.name);
}
class ShopperChatApi {
  // Firebase UID listings and legacy registered IDs; map listings are never chat merchants.
  static bool isTeyzaShop(String id)=>RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(id)&&
    !id.startsWith('google-')&&!id.startsWith('osm-')&&!id.startsWith('listed-');
  static Future<int> unreadTotal(ShopperSession session) async {
    if(session.idToken==null||!session.contactVerified)return 0;
    final result=await TeyzaMobileApi(session).call('chat_list');
    return mobileRows(result['threads']).fold<int>(0,(n,t)=>n+((t['unread'] as num?)?.toInt()??0));
  }
}
class ShopperChatPage extends StatefulWidget {
  final ShopperSession session;
  final ShopperConversation? initialShop;
  final TeyzaMobileApi? api;
  final String? initialThreadId,initialTitle,initialMessage;
  final bool asOwner;
  const ShopperChatPage({super.key,required this.session,this.initialShop,this.api,this.initialThreadId,this.initialTitle,this.initialMessage,this.asOwner=false});
  @override State<ShopperChatPage> createState()=>_ChatState();
}
class _ChatState extends State<ShopperChatPage> with WidgetsBindingObserver {
  late final TeyzaMobileApi api=widget.api??TeyzaMobileApi(widget.session);
  String? threadId,title,error;
  List<Map<String,dynamic>> threads=[],messages=[];
  final input=TextEditingController();
  final scroll=ScrollController();
  Timer? poll;
  bool loading=false,sending=false,active=true;
  String? uid;
  @override void initState(){
    super.initState();uid=widget.session.userId;
    WidgetsBinding.instance.addObserver(this);widget.session.addListener(accountChanged);
    title=widget.initialTitle??widget.initialShop?.name;threadId=widget.initialThreadId;input.text=widget.initialMessage??'';
    refresh();poll=Timer.periodic(const Duration(seconds:5),(_){if(active&&!sending)refresh(quiet:true);});
  }
  void accountChanged(){if(uid!=widget.session.userId&&mounted){poll?.cancel();setState((){
    threadId=null;messages=[];threads=[];error='Your account changed. Close this page and sign in again.';
  });}}
  @override void didChangeAppLifecycleState(AppLifecycleState state){active=state==AppLifecycleState.resumed;}
  @override void dispose(){poll?.cancel();widget.session.removeListener(accountChanged);
    WidgetsBinding.instance.removeObserver(this);input.dispose();scroll.dispose();super.dispose();}
  Future<void> refresh({bool quiet=false}) async {
    if(loading||uid!=widget.session.userId)return;
    setState((){loading=true;if(!quiet)error=null;});
    try{
      if(widget.initialShop!=null&&threadId==null){
        final opened=await api.call('chat_open',{'shopId':widget.initialShop!.id});
        if(!mounted||uid!=widget.session.userId)return;
        threadId=opened['threadId'] as String?;
      }
      final result=await api.call(threadId==null?'chat_list':'chat_read',
        threadId==null?{if(widget.asOwner)'asOwner':true}:{'threadId':threadId});
      if(widget.asOwner&&threadId==null&&result['scope']!='owner')throw StateError('Seller chat needs the latest Teyza service update. Please contact support.');
      if(mounted&&uid==widget.session.userId)setState((){
        if(threadId==null)threads=mobileRows(result['threads']);else messages=mobileRows(result['messages']);error=null;
      });
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> send() async {
    if(sending||threadId==null||input.text.trim().isEmpty)return;
    setState((){sending=true;error=null;});
    try{
      final result=await api.call('chat_send',{'threadId':threadId,'message':input.text.trim(),
        'messageId':'m'+DateTime.now().microsecondsSinceEpoch.toString()});
      if(mounted&&uid==widget.session.userId)setState((){messages=mobileRows(result['messages']);input.clear();});
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>sending=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFFAFBFA),
    appBar:AppBar(title:Text(title??(widget.asOwner?'Customer chat':'Live chat')),actions:[IconButton(
      tooltip:'Refresh messages',onPressed:loading?null:refresh,icon:const Icon(Icons.refresh))]),
    body:SafeArea(child:Column(children:[
      if(loading)const LinearProgressIndicator(),
      if(error!=null)Padding(padding:const EdgeInsets.all(16),child:Text(error!,
        style:const TextStyle(color:Color(0xFF9A3412)))),
      Expanded(child:threadId==null?ListView(padding:const EdgeInsets.all(18),children:[
        Text(widget.asOwner?'Your customers':'Your conversations',style:const TextStyle(fontSize:25,fontWeight:FontWeight.w800)),
        const SizedBox(height:8),Text(widget.asOwner?'Reply to customer questions about products, collection and delivery.':'Ask about products, collection or delivery. Replies appear here.'),
        if(threads.isEmpty&&!loading)Padding(padding:const EdgeInsets.symmetric(vertical:20),
          child:Text(widget.asOwner?'No customer messages yet. New customer conversations will appear here.':'No conversations yet. Open a registered shop and tap Live chat.')),
        for(final item in threads)Card(color:Colors.white,child:ListTile(
          leading:const CircleAvatar(backgroundColor:Color(0xFFE1F6EB),child:Icon(Icons.chat_bubble_outline,color:chatGreen)),
          title:Text(item['name']?.toString()??'Conversation'),
          subtitle:Text(item['lastMessage']?.toString()??'',maxLines:2,overflow:TextOverflow.ellipsis),
          trailing:(item['unread'] as num? ??0)>0?Badge(label:Text(item['unread'].toString())):const Icon(Icons.chevron_right),
          onTap:loading?null:(){setState((){threadId=item['id'].toString();title=item['name'].toString();messages=[];});refresh();}))
      ]):ListView(controller:scroll,padding:const EdgeInsets.all(16),children:[
        if(widget.initialShop==null)Align(alignment:Alignment.centerLeft,child:TextButton.icon(
          onPressed:loading?null:(){setState((){threadId=null;title=null;messages=[];});refresh();},
          icon:const Icon(Icons.arrow_back,size:18),label:const Text('All conversations'))),
        if(messages.isEmpty&&!loading)const Padding(padding:EdgeInsets.symmetric(vertical:30),
          child:Text('Start a conversation with this shop.')),
        for(final message in messages)Align(
          alignment:message['senderUid']==uid?Alignment.centerRight:Alignment.centerLeft,
          child:Container(constraints:const BoxConstraints(maxWidth:310),
            margin:const EdgeInsets.only(bottom:10),padding:const EdgeInsets.all(14),
            decoration:BoxDecoration(color:message['senderUid']==uid?const Color(0xFFE1F6EB):Colors.white,
              borderRadius:BorderRadius.circular(18)),child:Text(message['text']?.toString()??'',
                style:const TextStyle(fontSize:15,height:1.4))))
      ])),
      if(threadId!=null)Padding(padding:const EdgeInsets.fromLTRB(14,8,14,12),
        child:Row(children:[Expanded(child:TextField(controller:input,maxLength:1000,minLines:1,maxLines:4,
          textCapitalization:TextCapitalization.sentences,decoration:InputDecoration(
            counterText:'',hintText:'Write a message…',filled:true,fillColor:Colors.white,
            border:OutlineInputBorder(borderRadius:BorderRadius.circular(22),borderSide:BorderSide.none)))),
          const SizedBox(width:8),IconButton.filled(onPressed:sending?null:send,
            tooltip:'Send message',icon:Icon(sending?Icons.hourglass_top:Icons.send_rounded))]))
    ])));
}
