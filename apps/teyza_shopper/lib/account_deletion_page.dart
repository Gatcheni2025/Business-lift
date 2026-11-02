import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_auth.dart';
import 'shopper_delivery_profile.dart';
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
      if(response['requested']==true&&response['signInBlocked']==true){
        // The server has disabled this Firebase Auth identity and revoked
        // sessions; clear local tokens immediately. Do not restore it.
        final oldUid=widget.session.userId;
        await ShopperDeliveryProfileStore().clear(oldUid);
        final oldUid=widget.session.userId;
      await ShopperDeliveryProfileStore().clear(oldUid);
      await widget.session.signOut();
      }
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
    setState((){busy=true;error=null;});
    try{
      final response=await api.call('account_deletion_request',{'confirmation':'DELETE'});
      if(response['signInBlocked']!=true)throw StateError(
        'Your deletion request was saved, but sign-in closure was not confirmed. Contact Teyza support and do not assume the account has been closed.');
      await widget.session.signOut();
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
        Text(r!=null&&r['signInBlocked']==true?'Account closed for sign-in':r!=null?'Deletion request received':'Delete your Teyza account',
          textAlign:TextAlign.center,style:const TextStyle(fontSize:24,fontWeight:FontWeight.w800)),
        const SizedBox(height:15),
        if(loading)
          const Center(child:CircularProgressIndicator())
        else if(r!=null)...[
          Text(r['signInBlocked']==true
            ?'Your previous Teyza account identity is closed and cannot be signed into again. You may register a NEW account with a new user ID, including the same email once the old sign-in identity is removed. The old shop, profile and orders will not be restored. Personal-data erasure and lawful retention review continue separately.'
            :'Your deletion request is recorded, but account sign-in closure is not confirmed. Contact Teyza support with your reference.',
            textAlign:TextAlign.center),
          const SizedBox(height:16),
          SelectableText('Reference: ${r['reference']??'Not available'}',textAlign:TextAlign.center,
            style:const TextStyle(fontSize:18,fontWeight:FontWeight.w700)),
          const SizedBox(height:10),
          Text('Data erasure: ${r['status']=='completed'?'Completed':'In progress / compliance review'}',
            textAlign:TextAlign.center),
          const SizedBox(height:15),
          OutlinedButton.icon(icon:const Icon(Icons.copy),label:const Text('Copy reference'),
            onPressed:()=>Clipboard.setData(ClipboardData(text:'${r['reference']??''}'))),
          const SizedBox(height:18),
          FilledButton.icon(icon:const Icon(Icons.arrow_back),label:const Text('Return to sign-in'),
            onPressed:busy?null:()async{
              if(widget.session.userId!=null)await widget.session.signOut();
              if(context.mounted)Navigator.of(context).pop();
            }),
        ]else...[
          const Text('Closing your account removes the old Firebase sign-in identity and revokes sessions. You may register a new account, but cannot restore or sign back into the old UID. Remaining personal data is handled under the deletion review.'),
          const SizedBox(height:14),
          const Card(child:Padding(padding:EdgeInsets.all(14),
            child:Text('Shop owners: your public shop listing will be suspended immediately. Outstanding orders, subscriptions or debit mandates need settlement; some transaction records may be legally retained. A request does not automatically stop external bank collections.'))),
          const SizedBox(height:12),
          const Text('Your account will stop accepting sign-ins after the server confirms closure. Complete data erasure may take up to 30 days. You can start here without emailing support.',
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
            label:Text(busy?'Closing account…':'Close account and request deletion')),
          const SizedBox(height:10),
          const Text('Security check: if your last login was more than 15 minutes ago, sign out and sign in again before submitting.',
            style:TextStyle(color:Colors.black54,fontSize:12)),
        ],
        const SizedBox(height:16),
        TextButton.icon(
          icon:const Icon(Icons.open_in_new),
          label:const Text('Read Teyza data deletion policy'),
          onPressed:()=>launchUrl(
            Uri.parse('https://teyza.co.za/data-deletion.html'),
            mode:LaunchMode.externalApplication,
          ),
        ),
        if(error!=null)Padding(padding:const EdgeInsets.only(top:12),
          child:Text(error!,style:const TextStyle(color:Colors.red))),
      ])),
    );
  }
}
