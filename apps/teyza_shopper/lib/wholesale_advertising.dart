import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

/// Private B2B advertising. Wholesalers never place products in the shopper
/// marketplace. Only opted-in spaza shops receive approved in-app offers.
class WholesaleAdvertisingPage extends StatefulWidget{
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final bool supplierMode;
  const WholesaleAdvertisingPage({super.key,required this.session,
    required this.supplierMode,this.api});
  @override State<WholesaleAdvertisingPage> createState()=>_WholesaleAdvertisingState();
}
class _WholesaleAdvertisingState extends State<WholesaleAdvertisingPage>{
  late final TeyzaMobileApi api=widget.api??TeyzaMobileApi(widget.session);
  late final String? uid=widget.session.userId;
  final headline=TextEditingController(),message=TextEditingController();
  List<Map<String,dynamic>> shops=[],campaigns=[],connections=[];
  final targets=<String>{};
  bool loading=false,busy=false,optedIn=false;
  String? error,notice;
  @override void initState(){
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)load();});
  }
  @override void dispose(){headline.dispose();message.dispose();super.dispose();}
  Future<void> load()async{
    if(loading||uid==null||uid!=widget.session.userId)return;
    setState((){loading=true;error=null;});
    try{
      final results=widget.supplierMode
        ?await Future.wait([
          api.call('wholesale_spaza_directory'),api.call('wholesale_ads')])
        :await Future.wait([
          api.call('wholesale_ad_preferences'),api.call('wholesale_ads'),
          api.call('wholesale_connections')]);
      if(!mounted||uid!=widget.session.userId)return;
      setState((){
        if(widget.supplierMode){
          shops=mobileRows(results[0]['shops']);
          campaigns=mobileRows(results[1]['campaigns']);
          targets.removeWhere((id)=>!shops.any((s)=>s['sellerUid']==id));
        }else{
          optedIn=results[0]['optedIn']==true;
          campaigns=mobileRows(results[1]['campaigns']);
          connections=mobileRows(results[2]['connections']);
        }
      });
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> submit()async{
    if(busy||uid==null||uid!=widget.session.userId)return;
    if(targets.isEmpty){setState(()=>error='Select at least one participating spaza shop.');return;}
    setState((){busy=true;error=null;notice=null;});
    try{
      final result=await api.call('wholesale_ad_submit',{
        'title':headline.text.trim(),'message':message.text.trim(),
        'targetUids':targets.toList()});
      if(!mounted||uid!=widget.session.userId)return;
      headline.clear();message.clear();targets.clear();
      setState(()=>notice='Your offer for ${result['targetCount']} spaza shops was submitted for moderation. It will not display until approved.');
      await load();
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> chooseOptIn(bool enabled)async{
    if(busy||uid!=widget.session.userId)return;
    setState((){busy=true;error=null;});
    try{
      await api.call('wholesale_ad_opt_in',{'optedIn':enabled});
      if(mounted&&uid==widget.session.userId)await load();
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> act(String action,Map<String,dynamic> payload,String success)async{
    if(busy||uid==null||uid!=widget.session.userId)return;
    setState((){busy=true;error=null;});
    try{
      await api.call(action,payload);
      if(mounted&&uid==widget.session.userId){
        setState(()=>notice=success);await load();
      }
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Widget campaign(Map<String,dynamic> c)=>Card(
    child:Padding(padding:const EdgeInsets.all(14),child:Column(
      crossAxisAlignment:CrossAxisAlignment.start,children:[
        Text(c['title']?.toString()??'Supplier offer',
          style:const TextStyle(fontWeight:FontWeight.w800,fontSize:16)),
        const SizedBox(height:4),
        Text(c['supplierName']?.toString()??''),
        Text(c['message']?.toString()??''),
        const SizedBox(height:7),
        Text('Status: ${c['status']??'pending_review'}',
          style:const TextStyle(fontSize:12)),
        if(widget.supplierMode)Text('Spaza recipients: ${c['targetCount']??0}',
          style:const TextStyle(fontSize:12)),
        if(widget.supplierMode&&['approved','pending_review'].contains(c['status']))
          TextButton.icon(onPressed:busy?null:()=>act('wholesale_ad_pause',
            {'campaignId':c['id']},'Campaign paused'),
            icon:const Icon(Icons.pause_circle_outline),label:const Text('Pause offer')),
        if(!widget.supplierMode&&c['supplierUid']!=null)
          TextButton.icon(onPressed:busy?null:()=>act('wholesale_connection_request',
            {'supplierUid':c['supplierUid']},'Connection request sent to supplier'),
            icon:const Icon(Icons.handshake_outlined),label:const Text('Request supplier connection')),
      ])));
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:Text(widget.supplierMode?'Advertise to spaza shops':'Supplier offers')),
    body:SafeArea(child:RefreshIndicator(onRefresh:load,child:ListView(
      padding:const EdgeInsets.all(16),children:[
      Text(widget.supplierMode?'Wholesaler advertising':'Supplier offers for my shop',
        style:const TextStyle(fontSize:23,fontWeight:FontWeight.w800)),
      const SizedBox(height:6),
      Text(widget.supplierMode
        ?'R99 per month unlocks in-app advertising to participating spaza shops. Select your audience, submit an offer, and await review. No products are sold through the public shopper marketplace.'
        :'Choose whether your spaza shop receives approved wholesale offers. Suppliers see only your public shop name and area, not your private contacts.'),
      if(loading)const LinearProgressIndicator(),
      if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:10),
        child:Text(error!,style:const TextStyle(color:Colors.red))),
      if(notice!=null)Padding(padding:const EdgeInsets.symmetric(vertical:10),
        child:Text(notice!,style:const TextStyle(color:Color(0xFF117558)))),
      if(widget.supplierMode)...[
        const SizedBox(height:16),
        const Text('Choose participating spaza shops',style:TextStyle(fontWeight:FontWeight.w800,fontSize:17)),
        if(shops.isEmpty&&!loading)
          const Padding(padding:EdgeInsets.symmetric(vertical:14),
            child:Text('No spaza shops have opted in yet. Approved public shop listings are not automatically subscribed to advertising.')),
        for(final shop in shops)CheckboxListTile(
          contentPadding:EdgeInsets.zero,
          title:Text(shop['name']?.toString()??'Spaza shop'),
          subtitle:Text(shop['area']?.toString()??''),
          value:targets.contains(shop['sellerUid']),
          onChanged:busy?null:(selected)=>setState((){
            final id=shop['sellerUid']?.toString()??'';
            if(selected==true&&targets.length<20)targets.add(id);
            if(selected!=true)targets.remove(id);
          })),
        const SizedBox(height:10),
        TextField(controller:headline,maxLength:90,
          decoration:const InputDecoration(labelText:'Offer headline',border:OutlineInputBorder())),
        const SizedBox(height:12),
        TextField(controller:message,maxLength:400,minLines:3,maxLines:5,
          decoration:const InputDecoration(labelText:'Describe your offer and available stock',border:OutlineInputBorder())),
        FilledButton.icon(onPressed:busy||targets.isEmpty?null:submit,
          icon:const Icon(Icons.campaign_outlined),label:Text('Submit offer to ${targets.length} shops')),
        const SizedBox(height:9),
        const Text('All campaigns are checked by Teyza before they appear. There are no automatic WhatsApp or SMS messages.'),
        const SizedBox(height:16),
        for(final shop in shops)OutlinedButton.icon(
          onPressed:busy?null:()=>act('wholesale_spaza_invite',{'spazaUid':shop['sellerUid']},
             'Invitation sent. This spaza must accept before a connection can be approved.'),
          icon:const Icon(Icons.handshake_outlined),
          label:Text('Invite ${shop['name']??'spaza'} to connect')),
      ]else...[
        SwitchListTile(
          contentPadding:EdgeInsets.zero,
          title:const Text('Receive supplier offers'),
          subtitle:const Text('Only approved in-app offers. You can opt out at any time.'),
          value:optedIn,onChanged:busy?null:chooseOptIn),
        for(final link in connections.where((s)=>s['status']=='invited'))
          Card(child:Column(children:[
            ListTile(title:Text('Supplier invitation: ${link['name']??'Wholesaler'}'),
              subtitle:Text(link['area']?.toString()??'')),
            Wrap(children:[
              TextButton(onPressed:busy?null:()=>act('wholesale_spaza_accept_invite',
                {'supplierUid':link['supplierUid'],'accept':true},
                'Invitation accepted. The supplier must approve your connection terms.'),
                child:const Text('Accept invitation')),
              TextButton(onPressed:busy?null:()=>act('wholesale_spaza_accept_invite',
                {'supplierUid':link['supplierUid'],'accept':false},'Invitation declined'),
                child:const Text('Decline')),
            ]),
          ])),
      ],
      const SizedBox(height:22),
      Text(widget.supplierMode?'My advertising campaigns':'Approved supplier offers',
        style:const TextStyle(fontWeight:FontWeight.w800,fontSize:19)),
      const SizedBox(height:8),
      if(campaigns.isEmpty&&!loading)const Text('No offers available yet.'),
      for(final c in campaigns)campaign(c),
      const SizedBox(height:20),
    ]))));
}
