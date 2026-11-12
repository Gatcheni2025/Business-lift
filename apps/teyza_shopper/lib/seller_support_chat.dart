import 'dart:async';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'seller_growth_page.dart';

/// Dedicated seller-to-Teyza support chat, separate from customer chat.
/// Neither the chat nor its messages initiate membership payments.
class SellerSupportChatPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final bool premiumAccount;
  final bool businessApproved;
  const SellerSupportChatPage({super.key,required this.session,this.api,
    this.premiumAccount=false,this.businessApproved=false});
  @override State<SellerSupportChatPage> createState()=>_SellerSupportChatPageState();
}
class _SellerSupportChatPageState extends State<SellerSupportChatPage>{
  final input=TextEditingController();
  bool loading=false,sending=false;
  String? ticketId,error;
  List<Map<String,dynamic>> messages=[];
  String? ownerUid;
  Timer? refreshTimer;
  TeyzaMobileApi get api=>widget.api??TeyzaMobileApi(widget.session);
  @override void initState(){
    super.initState();ownerUid=widget.session.userId;refresh();
    refreshTimer=Timer.periodic(const Duration(seconds:25),(_){if(mounted)refresh();});
  }
  @override void dispose(){refreshTimer?.cancel();input.dispose();super.dispose();}
  Future<void> refresh()async{
    if(loading||ownerUid==null)return;
    setState(()=>loading=true);
    try{
      final opened=await api.call('seller_support_open');
      final thread=await api.call('seller_support_thread');
      if(!mounted||widget.session.userId!=ownerUid)return;
      setState((){
        ticketId=opened['ticketId']?.toString();
        messages=mobileRows(thread['messages']);
        error=null;
      });
    }catch(e){if(mounted&&widget.session.userId==ownerUid)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> send()async{
    final message=input.text.trim();
    if(sending||message.isEmpty||ticketId==null||widget.session.userId!=ownerUid)return;
    setState(()=>sending=true);
    try{
      await api.call('seller_support_message',{
        'message':message,
        'messageId':'s'+DateTime.now().microsecondsSinceEpoch.toString()
      });
      if(!mounted||widget.session.userId!=ownerUid)return;
      input.clear();
      setState(()=>sending=false);
      await refresh();
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>sending=false);}
  }
  void explainUpgrade(){
    Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerGrowthPage(
      session:widget.session,api:widget.api,businessApproved:widget.businessApproved)));
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Chat with Teyza Support'),actions:[
      IconButton(tooltip:'Refresh support messages',onPressed:loading?null:refresh,
        icon:const Icon(Icons.refresh))]),
    body:SafeArea(child:Column(children:[
      Padding(padding:const EdgeInsets.all(16),child:Column(
        crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          const Text('Ask Teyza Support about verification, account upgrades or your shop. Never share passwords, OTPs or card details.',
            style:TextStyle(height:1.4)),
          const SizedBox(height:10),
          if(!widget.premiumAccount)OutlinedButton.icon(
            key:const ValueKey('support-upgrade-account'),
            onPressed:explainUpgrade,
            icon:const Icon(Icons.workspace_premium_outlined),
            label:const Text('Upgrade Account'))
          else const Chip(
            avatar:Icon(Icons.workspace_premium_outlined),
            label:Text('Premium account')),
        ])),
      if(error!=null)Padding(padding:const EdgeInsets.all(12),
        child:Text(error!,style:const TextStyle(color:Colors.red))),
      Expanded(child:loading&&messages.isEmpty?const Center(child:CircularProgressIndicator()):
        messages.isEmpty?const Center(child:Text('Start a conversation with Teyza Support.')):
        ListView.builder(reverse:false,padding:const EdgeInsets.all(14),itemCount:messages.length,
          itemBuilder:(context,i){
            final row=messages[i],mine=row['senderUid']==ownerUid;
            return Align(alignment:mine?Alignment.centerRight:Alignment.centerLeft,
              child:Container(margin:const EdgeInsets.symmetric(vertical:5),
                padding:const EdgeInsets.all(12),
                constraints:const BoxConstraints(maxWidth:330),
                decoration:BoxDecoration(
                  color:mine?const Color(0xFFDEF5E8):const Color(0xFFF0F2F2),
                  borderRadius:BorderRadius.circular(15)),
                child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text(mine?'You':'Teyza Support',style:const TextStyle(fontSize:11,fontWeight:FontWeight.w800)),
                  const SizedBox(height:4),
                  Text(row['text']?.toString()??'',style:const TextStyle(height:1.35)),
                ])));
          })),
      const Divider(height:1),
      Padding(padding:const EdgeInsets.all(12),child:Row(children:[
        Expanded(child:TextField(controller:input,maxLines:3,minLines:1,maxLength:1000,
          decoration:const InputDecoration(hintText:'Write to Teyza Support',
            border:OutlineInputBorder(),counterText:''))),
        IconButton(tooltip:'Send support message',onPressed:sending||loading?null:send,
          icon:Icon(sending?Icons.hourglass_empty:Icons.send_rounded))
      ]))
    ])),
  );
}
