import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

/// Trusted administrators review user reports before acting on a chat.
// Admin permissions are also checked independently by the server.
class ChatModerationPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  const ChatModerationPage({super.key,required this.session,this.api});

  @override State<ChatModerationPage> createState()=>_ChatModerationState();
}
class _ChatModerationState extends State<ChatModerationPage>{
  late final TeyzaMobileApi api=widget.api??TeyzaMobileApi(widget.session);
  late final String? initialUid=widget.session.userId;
  bool busy=false;
  String? error;
  List<Map<String,dynamic>> reports=[];
  @override void initState(){
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)refresh();});
  }
  Future<void> refresh()async{
    if(busy||!mounted||widget.session.userId!=initialUid)return;
    setState((){busy=true;error=null;});
    try{
      final result=await api.call('chat_report_queue');
      if(!mounted||widget.session.userId!=initialUid)return;
      setState(()=>reports=mobileRows(result['reports']));
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> decide(Map<String,dynamic> report,String status)async{
    if(busy||widget.session.userId!=initialUid)return;
    setState((){busy=true;error=null;});
    try{
      await api.call('chat_report_resolve',{
        'reportId':report['id'],'status':status});
      if(!mounted||widget.session.userId!=initialUid)return;
      setState(()=>reports.removeWhere((r)=>r['id']==report['id']));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content:Text(status=='resolved'?'Report marked resolved.':'Report dismissed.')));
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Chat moderation'),actions:[
      IconButton(tooltip:'Refresh reports',onPressed:busy?null:refresh,
        icon:const Icon(Icons.refresh))]),
    body:SafeArea(child:ListView(padding:const EdgeInsets.all(16),children:[
      const Text('User reports',style:TextStyle(fontSize:24,fontWeight:FontWeight.w800)),
      const SizedBox(height:8),
      const Text('Review reported messages and record a decision. Blocking prevents '
        'new messages but keeps existing evidence available for moderation. '
        'For imminent threats, follow the Teyza escalation procedure.'),
      if(busy)const LinearProgressIndicator(),
      if(error!=null)Padding(padding:const EdgeInsets.only(top:12),
        child:Text(error!,style:const TextStyle(color:Colors.red))),
      if(reports.isEmpty&&!busy)const Padding(
        padding:EdgeInsets.only(top:26),child:Text('No open chat reports.')),
      for(final report in reports)Card(child:Padding(
        padding:const EdgeInsets.all(15),child:Column(
          crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('Reason: ${report['reason']??'Not supplied'}',
            style:const TextStyle(fontWeight:FontWeight.w800)),
          const SizedBox(height:6),
          SelectableText(report['messageText']?.toString()??'No message excerpt'),
          const SizedBox(height:8),
          Text('Reporter: ${report['reporterUid']??''} · Reported account: ${report['reportedUid']??''}',
            style:const TextStyle(fontSize:12)),
          const SizedBox(height:12),
          Wrap(spacing:8,children:[
            FilledButton(onPressed:busy?null:()=>decide(report,'resolved'),
              child:const Text('Mark resolved')),
            OutlinedButton(onPressed:busy?null:()=>decide(report,'dismissed'),
              child:const Text('Dismiss report'))
          ])
        ]))),
    ])),
  );
}
