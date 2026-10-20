import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'shopper_auth.dart';

const chatEndpoint='https://teyza.co.za/api/chat.php';
const chatGreen=Color(0xFF078E66);
final chatStore=FlutterSecureStorage(aOptions:AndroidOptions(encryptedSharedPreferences:true));

class ShopperConversation {
  final String id, name;
  const ShopperConversation(this.id,this.name);
}

class ShopperChatApi {
  static bool isTeyzaShop(String id)=>RegExp(r'^TZ_[A-F0-9]{8}$').hasMatch(id);
  static Future<List<ShopperConversation>> list() async {
    final saved=await chatStore.read(key:'shopper_chat_index');
    if(saved==null)return [];
    try {
      final data=jsonDecode(saved);
      if(data is! List)return [];
      return data.whereType<Map>()
        .map((m)=>ShopperConversation((m['id']??'').toString(),(m['name']??'').toString()))
        .where((s)=>isTeyzaShop(s.id)).toList();
    }catch(_){return [];}
  }
  static Future<String?> token(String id)=>chatStore.read(key:'shopper_chat_'+id);
  static Future<void> save(ShopperConversation shop,String tokenValue) async {
    await chatStore.write(key:'shopper_chat_'+shop.id,value:tokenValue);
    final current=await list();
    current.removeWhere((s)=>s.id==shop.id);
    current.insert(0,shop);
    await chatStore.write(key:'shopper_chat_index',
      value:jsonEncode(current.take(70).map((s)=>{'id':s.id,'name':s.name}).toList()));
  }
  static Future<Map<String,dynamic>?> read(String id) async {
    final key=await token(id);
    if(key==null||!isTeyzaShop(id))return null;
    final url=Uri.parse(chatEndpoint).replace(queryParameters:{
      'mode':'client-thread','businessId':id,'clientToken':key});
    final res=await http.get(url).timeout(const Duration(seconds:15));
    if(res.statusCode!=200)throw StateError('Could not refresh conversation.');
    final data=jsonDecode(res.body);
    if(data is Map && data['thread'] is Map)return Map<String,dynamic>.from(data['thread'] as Map);
    return null;
  }
  static Future<Map<String,dynamic>?> send(ShopperConversation shop,ShopperSession session,String msg) async {
    if(!isTeyzaShop(shop.id))throw StateError('This shop has not joined Teyza chat.');
    if(session.idToken==null||!session.emailVerified)
      throw StateError('Sign in and verify your shopper account to send messages.');
    final res=await http.post(Uri.parse(chatEndpoint),headers:const {'Content-Type':'application/json'},
      body:jsonEncode({
        'action':'client-message','businessId':shop.id,
        'clientToken':await token(shop.id)??'',
        'name':session.name?.trim().isNotEmpty==true?session.name:'Shopper',
        'email':session.email??'','message':msg.trim()
      })).timeout(const Duration(seconds:16));
    final data=jsonDecode(res.body);
    if(res.statusCode!=200||data is! Map||data['ok']!=true)
      throw StateError(data is Map?(data['error']??'Could not send message').toString():
        'Could not send message');
    final newKey=(data['clientToken']??'').toString();
    if(newKey.isNotEmpty)await save(shop,newKey);
    return data['thread'] is Map ? Map<String,dynamic>.from(data['thread'] as Map):null;
  }
}

class ShopperChatPage extends StatefulWidget {
  final ShopperSession session;
  final ShopperConversation? initialShop;
  const ShopperChatPage({super.key,required this.session,this.initialShop});
  @override State<ShopperChatPage> createState()=>_ShopperChatPageState();
}
class _ShopperChatPageState extends State<ShopperChatPage> {
  ShopperConversation? selected;
  List<ShopperConversation> conversations=[];
  Map<String,dynamic>? thread;
  String? error;
  bool loading=false,sending=false;
  final input=TextEditingController();
  @override void initState(){super.initState();selected=widget.initialShop;refresh();}
  @override void dispose(){input.dispose();super.dispose();}
  Future<void> refresh() async {
    if(loading)return;
    setState(() {loading=true;error=null;});
    try {
      final saved=await ShopperChatApi.list();
      final data=selected==null?null:await ShopperChatApi.read(selected!.id);
      if(mounted)setState(() {conversations=saved;thread=data;});
    }catch(e){if(mounted)setState(()=>error=e.toString().replaceFirst('Bad state: ',''));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> send() async {
    if(selected==null||input.text.trim().isEmpty||sending)return;
    setState(() {sending=true;error=null;});
    try {
      await widget.session.refreshEmailStatus();
      final data=await ShopperChatApi.send(selected!,widget.session,input.text);
      if(mounted)setState(() {thread=data;input.clear();});
    }catch(e){if(mounted)setState(()=>error=e.toString().replaceFirst('Bad state: ',''));}
    finally{if(mounted)setState(()=>sending=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(selected?.name??'Messages'),
      actions:[IconButton(onPressed:loading?null:refresh,tooltip:'Refresh messages',
        icon:const Icon(Icons.refresh))]),
    body:Column(children:[
      if(loading)const LinearProgressIndicator(),
      if(error!=null)Padding(padding:const EdgeInsets.all(12),
        child:Text(error!,style:const TextStyle(color:Colors.red))),
      Expanded(child:selected==null?ListView(children:[
        const Padding(padding:EdgeInsets.all(18),child:Text('Messages from Teyza shops',
          style:TextStyle(fontSize:20,fontWeight:FontWeight.w800))),
        if(conversations.isEmpty)const Padding(padding:EdgeInsets.all(18),
          child:Text('Your messages will appear here. Open a registered Teyza shop and tap Chat.')),
        ...conversations.map((shop)=>Card(child:ListTile(
          leading:const Icon(Icons.chat_bubble_outline,color:chatGreen),
          title:Text(shop.name),trailing:const Icon(Icons.chevron_right),
          onTap:(){setState(()=>selected=shop);refresh();})))
      ]):Column(children:[
        if(widget.initialShop==null)TextButton.icon(
          onPressed:()=>setState(() {selected=null;thread=null;}),
          icon:const Icon(Icons.arrow_back),label:const Text('All conversations')),
        Expanded(child:ListView(padding:const EdgeInsets.all(12),children:[
          if(thread==null)const Padding(padding:EdgeInsets.all(18),
            child:Text('Ask this shop a question. The owner can reply from their Teyza dashboard.')),
          for(final m in ((thread?['messages'] as List?)??[]).whereType<Map>())
            Align(alignment:m['sender']=='client'?Alignment.centerRight:Alignment.centerLeft,
              child:Container(margin:const EdgeInsets.only(bottom:8),
                padding:const EdgeInsets.all(12),
                constraints:const BoxConstraints(maxWidth:320),
                decoration:BoxDecoration(
                  color:m['sender']=='client'?const Color(0xFFE0F3EA):Colors.white,
                  borderRadius:BorderRadius.circular(14)),
                child:Text((m['text']??'').toString())))
        ])),
        SafeArea(top:false,child:Padding(padding:const EdgeInsets.all(9),
          child:Row(children:[
            Expanded(child:TextField(controller:input,minLines:1,maxLines:3,maxLength:2000,
              decoration:const InputDecoration(hintText:'Message this shop',
                border:OutlineInputBorder(),counterText:''))),
            IconButton.filled(onPressed:sending?null:send,icon:const Icon(Icons.send))
          ])))
      ])),
      const Padding(padding:EdgeInsets.all(8),
        child:Text('Refresh to check replies. Push alerts are not available yet.',
          textAlign:TextAlign.center,style:TextStyle(fontSize:11,color:Colors.grey)))
    ]));
}
