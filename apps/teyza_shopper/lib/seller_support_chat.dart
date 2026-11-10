import 'dart:async';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

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
    showModalBottomSheet<void>(context:context,isScrollControlled:true,
      showDragHandle:true,builder:(sheetContext)=>SafeArea(child:Padding(
        padding:const EdgeInsets.fromLTRB(20,8,20,24),
        child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Upgrade Account',style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),
          const SizedBox(height:12),
          Text(widget.businessApproved?'Your business is verified and can appear in the community for free.':
            'First complete your business registration and verification. Your shop can be listed free after approval.'),
          const SizedBox(height:14),
          const Text('Membership steps',style:TextStyle(fontWeight:FontWeight.w700)),
          const SizedBox(height:8),
          const Text('1. Finish email, phone, ID, selfie, shop-front and location verification.'),
          const SizedBox(height:7),
          const Text('2. Confirm your business has received final approval.'),
          const SizedBox(height:7),
          const Text('3. Review the available Premium membership terms and give consent through a supported purchase process.'),
          const SizedBox(height:7),
          const Text('4. After Teyza independently verifies an active subscription for your Firebase account, the app updates to Premium account and unlocks eligible selling or wholesale tools.'),
          const SizedBox(height:14),
          const Text('Membership information: introductory R10 if eligible, otherwise R99; monthly renewal R99 until cancelled. This chat cannot accept payments or activate Premium.',
            style:TextStyle(fontSize:12)),
          const SizedBox(height:16),
          Align(alignment:Alignment.centerRight,
            child:TextButton(onPressed:()=>Navigator.pop(sheetContext),
              child:const Text('Close')))
        ]),
      )));
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Chat with Teyza Support'),actions:[
      IconButton(tooltip:'Refresh support messages',onPressed:loading?null:refresh,
        icon:const Icon(Icons.refresh))]),
    body:SafeArea(child:Column(children:[
      Padding(padding:const EdgeInsets.all(16),child:Column(
        crossAxisAlignment:CrossAxisAlignment.stretch,children:[
          const Text('Ask Teyza Support about verification, membership or your shop. Never share passwords, OTPs or card details.',
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
