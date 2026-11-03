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
    if(session.idToken==null)return 0;
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
  bool loading=false,sending=false,active=true,blocked=false,blockedByMe=false;
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
        if(threadId==null)threads=mobileRows(result['threads']);else {
          messages=mobileRows(result['messages']);
          blocked=result['blocked']==true;blockedByMe=result['blockedByMe']==true;
        }error=null;
      });
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> send() async {
    if(sending||blocked||threadId==null||input.text.trim().isEmpty)return;
    setState((){sending=true;error=null;});
    try{
      final result=await api.call('chat_send',{'threadId':threadId,'message':input.text.trim(),
        'messageId':'m'+DateTime.now().microsecondsSinceEpoch.toString()});
      if(mounted&&uid==widget.session.userId)setState((){messages=mobileRows(result['messages']);input.clear();});
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>sending=false);}
  }
  Future<void> toggleBlock(bool value)async{
    if(threadId==null||sending)return;
    try{
      await api.call('chat_block',{'threadId':threadId,'blocked':value});
      if(!mounted)return;
      setState((){blockedByMe=value;blocked=value;});
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(
        value?'Conversation blocked. Neither party can send messages.':'Conversation unblocked.')));
      await refresh(quiet:true);
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  }
  Future<void> reportMessage(Map<String,dynamic> message)async{
    final id=message['id']?.toString(),thread=threadId;
    if(id==null||thread==null)return;
    final reason=await showModalBottomSheet<String>(context:context,showDragHandle:true,
      builder:(context)=>SafeArea(child:Column(mainAxisSize:MainAxisSize.min,children:[
        const Padding(padding:EdgeInsets.all(16),child:Text('Report message',style:TextStyle(
          fontWeight:FontWeight.w800,fontSize:20))),
        for(final entry in const [('harassment','Harassment or bullying'),
          ('hate','Hateful or discriminatory'),('scam','Scam or fraud'),
          ('spam','Spam'),('unsafe','Threatening or unsafe'),('other','Other')])
          ListTile(title:Text(entry.$2),onTap:()=>Navigator.pop(context,entry.$1)),
        const SizedBox(height:12),
      ])));
    if(reason==null||!mounted)return;
    try{
      await api.call('chat_report',{'threadId':thread,'messageId':id,'reason':reason});
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:Text('Report submitted for Teyza moderation review.')));
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  }
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFFAFBFA),
    appBar:AppBar(title:Text(title??(widget.asOwner?'Customer chat':'Live chat')),actions:[
      if(threadId!=null)PopupMenuButton<String>(
        tooltip:'Chat safety',onSelected:(value)=>toggleBlock(value=='block'),
        itemBuilder:(_)=>[PopupMenuItem(value:blockedByMe?'unblock':'block',
          child:Text(blockedByMe?'Unblock conversation':'Block this user'))]),
      IconButton(tooltip:'Refresh messages',onPressed:loading?null:refresh,icon:const Icon(Icons.refresh))]),
    body:SafeArea(child:Column(children:[
      if(loading)const LinearProgressIndicator(),
      if(error!=null)Padding(padding:const EdgeInsets.all(16),child:Text(error!,
        style:const TextStyle(color:Color(0xFF9A3412)))),
      if(blocked&&threadId!=null)Padding(padding:const EdgeInsets.all(12),child:Text(
        blockedByMe?'You blocked this conversation. Unblock from the menu to reply.':
          'This conversation is blocked. Messages cannot be sent.',
        style:const TextStyle(color:Colors.deepOrange,fontWeight:FontWeight.w700))),
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
        if(messages.isEmpty&&!loading)Padding(padding:const EdgeInsets.symmetric(vertical:30),
          child:Text(widget.asOwner?'Send a message to your customer.':'Start a conversation with this shop.')),
        for(final message in messages)Align(
          alignment:message['senderUid']==uid?Alignment.centerRight:Alignment.centerLeft,
          child:Column(crossAxisAlignment:message['senderUid']==uid?
            CrossAxisAlignment.end:CrossAxisAlignment.start,children:[
            Container(constraints:const BoxConstraints(maxWidth:310),
              margin:const EdgeInsets.only(bottom:2),padding:const EdgeInsets.all(14),
              decoration:BoxDecoration(color:message['senderUid']==uid?
                const Color(0xFFE1F6EB):Colors.white,
                borderRadius:BorderRadius.circular(18)),
              child:Text(message['text']?.toString()??'',
                style:const TextStyle(fontSize:15,height:1.4))),
            if(message['senderUid']!=uid)TextButton.icon(
              key:ValueKey('chat-report-${message['id']}'),
              onPressed:()=>reportMessage(message),icon:const Icon(Icons.flag_outlined,size:15),
              label:const Text('Report message',style:TextStyle(fontSize:11))),
          ]))
      ])),
      if(threadId!=null&&!blocked)Padding(padding:const EdgeInsets.fromLTRB(14,8,14,12),
        child:Row(children:[Expanded(child:TextField(controller:input,maxLength:1000,minLines:1,maxLines:4,
          textCapitalization:TextCapitalization.sentences,decoration:InputDecoration(
            counterText:'',hintText:'Write a message…',filled:true,fillColor:Colors.white,
            border:OutlineInputBorder(borderRadius:BorderRadius.circular(22),borderSide:BorderSide.none)))),
          const SizedBox(width:8),IconButton.filled(onPressed:sending?null:send,
            tooltip:'Send message',icon:Icon(sending?Icons.hourglass_top:Icons.send_rounded))]))
    ])));
}
