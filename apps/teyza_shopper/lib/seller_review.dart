import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

class SellerReviewPage extends StatefulWidget{
  final ShopperSession session;final TeyzaMobileApi? api;
  const SellerReviewPage({super.key,required this.session,this.api});
  @override State<SellerReviewPage> createState()=>_ReviewState();
}
class _ReviewState extends State<SellerReviewPage> with WidgetsBindingObserver{
  late final api=widget.api??TeyzaMobileApi(widget.session);
  late final String? uid;
  List<Map<String,dynamic>> sellers=[];
  Map<String,dynamic>? selected,identityDetails;Uint8List? photo,document;
  final note=TextEditingController();
  String? error,next;bool busy=false,reviewed=false;int generation=0;
  @override void initState(){super.initState();uid=widget.session.userId;WidgetsBinding.instance.addObserver(this);widget.session.addListener(changed);load();}
  @override void dispose(){generation++;photo=null;document=null;identityDetails=null;note.dispose();widget.session.removeListener(changed);WidgetsBinding.instance.removeObserver(this);super.dispose();}
  void changed(){if(mounted&&uid!=widget.session.userId)setState((){generation++;photo=null;document=null;identityDetails=null;sellers=[];selected=null;error='Your account changed. Close this page.';});}
  @override void didChangeAppLifecycleState(AppLifecycleState state){if(state!=AppLifecycleState.resumed&&mounted)setState((){generation++;photo=null;document=null;identityDetails=null;reviewed=false;});}
  Future<void> load({bool more=false}) async{
    if(busy||uid!=widget.session.userId)return;setState((){busy=true;error=null;});
    try{final r=await api.call('admin_seller_queue',{if(more&&next!=null)'after':next});
      if(mounted&&uid==widget.session.userId)setState((){sellers=[if(more)...sellers,...mobileRows(r['sellers'])];next=r['next']?.toString();});
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> view() async{
    final seller=selected;if(seller==null||busy||uid!=widget.session.userId)return;
    final request=++generation;setState((){busy=true;error=null;photo=null;reviewed=false;});
    try{final r=await api.call('verification_read',{'sellerUid':seller['sellerUid'],'submissionId':seller['submissionId']});
      if(mounted&&uid==widget.session.userId&&request==generation)setState(()=>photo=base64Decode(r['imageBase64'] as String));
    }catch(e){if(mounted&&request==generation)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> viewDocument() async {
    final seller=selected;if(seller==null||busy||uid!=widget.session.userId)return;
    final request=++generation;setState((){busy=true;error=null;document=null;identityDetails=null;reviewed=false;});
    try{final r=await api.call('seller_identity_read',{'sellerUid':seller['sellerUid'],'evidenceId':seller['evidenceId']});
      if(mounted&&uid==widget.session.userId&&request==generation)setState((){
        document=base64Decode(r['imageBase64'] as String);identityDetails=Map<String,dynamic>.from(r['details'] as Map);
      });
    }catch(e){if(mounted&&request==generation)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  bool get documentRequired=>selected?['evidenceId']!=null;
  Future<void> decide(String status) async{
    final seller=selected;if(seller==null||busy||uid!=widget.session.userId)return;
    if(status=='approved'&&(!reviewed||photo==null||(documentRequired&&document==null))){setState(()=>error='View the current selfie and required identity document, then confirm your review.');return;}
    if(status!='approved'&&note.text.trim().isEmpty){setState(()=>error='Write a short note explaining what the seller should do next.');return;}
    final yes=await showDialog<bool>(context:context,builder:(c)=>AlertDialog(title:Text(status=='approved'?'Approve this seller?':'Send this review outcome?'),
      content:Text('${seller['shopName']}\n${status=='approved'?'This grants the verified owner badge. Seller setup completion controls access to selling.':note.text.trim()}'),
      actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:const Text('Cancel')),
        FilledButton(onPressed:()=>Navigator.pop(c,true),child:const Text('Confirm review'))]));
    if(yes!=true||!mounted||uid!=widget.session.userId)return;
    if(status=='approved'&&(!reviewed||photo==null||(documentRequired&&document==null))){setState(()=>error='Re-open the selfie before approving.');return;}
    setState((){busy=true;error=null;});
    try{await api.call('admin_seller_review',{'sellerUid':seller['sellerUid'],'submissionId':seller['submissionId'],if(seller['evidenceId']!=null)'evidenceId':seller['evidenceId'],'status':status,'reason':note.text.trim()});
      if(!mounted||uid!=widget.session.userId)return;
      setState((){selected=null;photo=null;document=null;identityDetails=null;reviewed=false;note.clear();});
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Review saved. The seller will receive an update.')));
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
    if(selected==null)await load();
  }
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF7F8F5),
    appBar:AppBar(backgroundColor:const Color(0xFFF7F8F5),foregroundColor:const Color(0xFF010F1C),title:const Text('Seller review desk'),leading:selected==null?null:BackButton(onPressed:(){
      if(busy)return;setState((){generation++;selected=null;photo=null;document=null;identityDetails=null;reviewed=false;note.clear();});}),
      actions:[IconButton(tooltip:'Refresh seller queue',onPressed:busy?null:()=>load(),icon:const Icon(Icons.refresh))]),
    body:SafeArea(child:ListView(padding:const EdgeInsets.all(20),children:[
      const Text('Trusted shops start here',style:TextStyle(fontSize:26,fontWeight:FontWeight.w800)),
      const SizedBox(height:8),const Text('Private owner verification · authorised administrators only',style:TextStyle(color:Color(0xFF6C7880))),
      const SizedBox(height:18),if(error!=null)Padding(padding:const EdgeInsets.only(bottom:14),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
      if(error?.contains('Sign in again')==true)OutlinedButton(onPressed:busy?null:() async{
        await widget.session.signOut();if(context.mounted)Navigator.of(context).popUntil((r)=>r.isFirst);
      },child:const Text('Sign out to renew review session')),
      if(busy)const LinearProgressIndicator(),
      if(selected==null)...[
        if(!busy&&sellers.isEmpty&&error==null)const Padding(padding:EdgeInsets.all(30),child:Text('All caught up. There are no selfies awaiting review.')),
        for(final s in sellers)Card(color:Colors.white,elevation:0,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22),
          side:const BorderSide(color:Color(0xFFE0E7DD))),child:ListTile(contentPadding:const EdgeInsets.all(16),
          leading:const CircleAvatar(backgroundColor:Color(0xFFE1F6EB),child:Icon(Icons.storefront_outlined,color:Color(0xFF169F68))),
          title:Text(s['shopName'].toString(),style:const TextStyle(fontWeight:FontWeight.w700)),
          subtitle:Text('${s['category']=='spaza'?'Spaza shop':'Retail / wholesale'}\n${s['address']}\n${s['expired']==true?'Photo expired · request another':'Awaiting owner review'}'),
          trailing:const Icon(Icons.chevron_right),onTap:busy?null:()=>setState((){selected=s;photo=null;document=null;identityDetails=null;reviewed=false;note.clear();}))),
        if(next!=null)OutlinedButton(onPressed:busy?null:()=>load(more:true),child:const Text('Load more sellers'))
      ]else...[
        Card(color:Colors.white,child:Padding(padding:const EdgeInsets.all(20),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(selected!['shopName'].toString(),style:const TextStyle(fontSize:23,fontWeight:FontWeight.w800)),const SizedBox(height:14),
          for(final key in ['address','ownerEmail','phone','companyName','registrationNumber'])if(selected![key]?.toString().isNotEmpty==true)
            Padding(padding:const EdgeInsets.only(bottom:8),child:Text(selected![key].toString())),
          Text('Owner: ${selected!['approvalStatus']} · Listing: ${selected!['listingStatus']}')]))),
        const SizedBox(height:12),if(photo!=null)ClipRRect(borderRadius:BorderRadius.circular(22),child:Image.memory(photo!,height:300,fit:BoxFit.contain,
          errorBuilder:(_,__,___)=>const Text('This photo could not be displayed. Request a new photo.'))),
        OutlinedButton.icon(onPressed:busy||selected!['expired']==true?null:view,icon:const Icon(Icons.lock_outline),label:const Text('View private selfie')),
        if(documentRequired)...[
          const SizedBox(height:16),if(document!=null)ClipRRect(borderRadius:BorderRadius.circular(22),child:Image.memory(document!,height:300,fit:BoxFit.contain)),
          if(identityDetails!=null)Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            for(final key in ['kind','documentNumber','companyName','registrationNumber'])if(identityDetails![key]!=null)Text(identityDetails![key].toString())
          ]))),
          OutlinedButton.icon(onPressed:busy?null:viewDocument,icon:const Icon(Icons.badge_outlined),label:Text(selected!['evidenceKind']=='company'?'View private company registration':'View private ID / passport'))
        ],
        CheckboxListTile(contentPadding:EdgeInsets.zero,value:reviewed,onChanged:busy||photo==null||(documentRequired&&document==null)?null:(v)=>setState(()=>reviewed=v==true),
          title:const Text('I have reviewed this selfie and the shop registration.')),
        TextField(controller:note,maxLength:400,maxLines:3,enabled:!busy,decoration:const InputDecoration(labelText:'Review note to seller',border:OutlineInputBorder())),
        const SizedBox(height:16),FilledButton.icon(onPressed:busy||!reviewed||photo==null||(documentRequired&&document==null)?null:()=>decide('approved'),icon:const Icon(Icons.verified_user_outlined),label:const Text('Approve seller')),
        OutlinedButton(onPressed:busy?null:()=>decide('needs_new_photo'),child:const Text('Request a new selfie')),
        TextButton(onPressed:busy?null:()=>decide('rejected'),child:const Text('Reject registration')),
        const SizedBox(height:12),const Text('Photos clear when the app leaves the foreground. Re-open the selfie and document before approving. This is a manual review, not an automated face match.',style:TextStyle(color:Color(0xFF6C7880),height:1.5))
      ]
    ])));
}
