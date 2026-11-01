import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

/// Available from both Shopper Account and Seller > My Business.
class TeyzaDeleteAccountPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  const TeyzaDeleteAccountPage({super.key,required this.session,this.api});
  @override State<TeyzaDeleteAccountPage> createState()=>_DeleteAccountState();
}

class _DeleteAccountState extends State<TeyzaDeleteAccountPage> {
  final confirmation=TextEditingController();
  bool acknowledged=false,busy=false,loading=true;
  Map<String,dynamic>? receipt;
  String? error;
  TeyzaMobileApi get api=>widget.api??TeyzaMobileApi(widget.session);

  @override void initState(){
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_)=>loadStatus());
  }
  @override void dispose(){confirmation.dispose();super.dispose();}

  Future<void> loadStatus()async{
    if(widget.session.userId==null){if(mounted)setState(()=>loading=false);return;}
    try{
      final response=await api.call('account_deletion_status');
      if(mounted)setState((){
        receipt=response['requested']==true?response:null;
        loading=false;error=null;
      });
    }catch(_){
      if(mounted)setState(()=>loading=false);
    }
  }
  Future<void> requestDeletion()async{
    if(busy||!acknowledged||confirmation.text.trim()!='DELETE')return;
    setState(()=>busy=true);
    try{
      final response=await api.call('account_deletion_request',{'confirmation':'DELETE'});
      if(mounted)setState(()=>receipt=response);
    }catch(e){
      if(mounted)setState(()=>error=mobileError(e));
    }finally{if(mounted)setState(()=>busy=false);}
  }

  @override Widget build(BuildContext context){
    final r=receipt;
    return Scaffold(
      appBar:AppBar(title:const Text('Delete My Account')),
      body:SafeArea(child:ListView(padding:const EdgeInsets.all(22),children:[
        const Icon(Icons.shield_outlined,size:52,color:Color(0xFF007F62)),
        const SizedBox(height:14),
        Text(r!=null?'Deletion request received':'Delete your Teyza account',
          textAlign:TextAlign.center,style:const TextStyle(fontSize:24,fontWeight:FontWeight.w800)),
        const SizedBox(height:15),
        if(loading)
          const Center(child:CircularProgressIndicator())
        else if(r!=null)...[
          const Text('Keep this reference for your records. Teyza will process the request within 30 days, subject to legally required retention. Shop listings are removed from discovery while pending.',
            textAlign:TextAlign.center),
          const SizedBox(height:16),
          SelectableText('Reference: ${r['reference']??'Not available'}',textAlign:TextAlign.center,
            style:const TextStyle(fontSize:18,fontWeight:FontWeight.w700)),
          const SizedBox(height:10),
          Text('Status: ${r['status']??'pending_review'}',textAlign:TextAlign.center),
          const SizedBox(height:15),
          OutlinedButton.icon(icon:const Icon(Icons.copy),label:const Text('Copy reference'),
            onPressed:()=>Clipboard.setData(ClipboardData(text:'${r['reference']??''}'))),
          const SizedBox(height:18),
          FilledButton.icon(icon:const Icon(Icons.logout),label:const Text('Sign out'),
            onPressed:busy?null:()async{
              await widget.session.signOut();
              if(context.mounted)Navigator.of(context).pop();
            }),
        ]else...[
          const Text('Request permanent deletion of your Teyza account and personal information that Teyza is not legally required to retain. This cannot be undone once completed.'),
          const SizedBox(height:14),
          const Card(child:Padding(padding:EdgeInsets.all(14),
            child:Text('Shop owners: your public shop listing will be suspended immediately. Outstanding orders, subscriptions or debit mandates need settlement; some transaction records may be legally retained. A request does not automatically stop external bank collections.'))),
          const SizedBox(height:12),
          const Text('We aim to complete deletion requests within 30 days. You can start here without emailing support.',
            style:TextStyle(fontWeight:FontWeight.w600)),
          const SizedBox(height:18),
          TextField(controller:confirmation,autocorrect:false,enableSuggestions:false,
            decoration:const InputDecoration(labelText:'Type DELETE to confirm',border:OutlineInputBorder()),
            onChanged:(_)=>setState((){})),
          const SizedBox(height:9),
          CheckboxListTile(contentPadding:EdgeInsets.zero,
            title:const Text('I understand Teyza will delete my account and eligible personal data.'),
            value:acknowledged,onChanged:busy?null:(v)=>setState(()=>acknowledged=v==true)),
          const SizedBox(height:8),
          FilledButton.icon(icon:const Icon(Icons.delete_forever),
            onPressed:busy||!acknowledged||confirmation.text.trim()!='DELETE'?null:requestDeletion,
            style:FilledButton.styleFrom(backgroundColor:Colors.red),
            label:Text(busy?'Submitting…':'Request permanent account deletion')),
          const SizedBox(height:10),
          const Text('Security check: if your last login was more than 15 minutes ago, sign out and sign in again before submitting.',
            style:TextStyle(color:Colors.black54,fontSize:12)),
        ],
        if(error!=null)Padding(padding:const EdgeInsets.only(top:12),
          child:Text(error!,style:const TextStyle(color:Colors.red))),
      ])),
    );
  }
}
