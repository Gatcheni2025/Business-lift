import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'seller_plan.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'teyza_ads_store_billing.dart';

// Seven-day, non-recurring local campaign. Server is authoritative at checkout.
const int teyzaAdsLocalKm=10,teyzaAdsMaxKm=50,teyzaAdsDays=7;
int teyzaAdsPriceCents(int km){
 if(km<1||km>teyzaAdsMaxKm)throw RangeError.range(km,1,teyzaAdsMaxKm);
 return 2900+(km<=10?0:km-10)*200;
}
String teyzaAdRand(int cents)=>'R'+(cents/100).toStringAsFixed(2);

class TeyzaAdsPage extends StatefulWidget{
 final ShopperSession session;
 final TeyzaMobileApi? api;
 const TeyzaAdsPage({super.key,required this.session,this.api});
 @override State<TeyzaAdsPage> createState()=>_TeyzaAdsState();
}
class _TeyzaAdsState extends State<TeyzaAdsPage> with WidgetsBindingObserver{
 late final String? uid=widget.session.userId;
 late final TeyzaMobileApi api=widget.api??TeyzaMobileApi(widget.session);
 final headline=TextEditingController(),description=TextEditingController();
 Uint8List? image;
 int radiusKm=10;
 bool consent=false,busy=false;
 TeyzaStoreAdPurchase? storePurchases;
 List<Map<String,dynamic>> ads=[];
 String? error,success;
 bool get sameSeller=>uid!=null&&uid==widget.session.userId&&widget.session.idToken!=null;
 bool get directPaystack=>Platform.isAndroid&&teyzaPaymentChannel=='direct';
 String get referenceKey=>'teyza_ad_checkout_ref_'+(uid??'none');
 @override void initState(){
  super.initState();WidgetsBinding.instance.addObserver(this);
  widget.session.addListener(accountChanged);
  if(!directPaystack&&(Platform.isIOS||Platform.isAndroid)){
   storePurchases=TeyzaStoreAdPurchase(session:widget.session,api:api,
    onMessage:(message,isError){if(mounted)setState((){
      if(isError){error=message;success=null;}else{success=message;error=null;}
    });},onComplete:(){if(mounted)unawaited(load());});
   storePurchases!.initialize();
  }
  load();
  WidgetsBinding.instance.addPostFrameCallback((_){if(mounted){
   if(directPaystack)unawaited(confirmReturn());
   else unawaited(storePurchases?.recover()??Future<void>.value());
  }});
 }
 @override void didChangeAppLifecycleState(AppLifecycleState state){
  if(state==AppLifecycleState.resumed&&sameSeller){
   if(directPaystack)unawaited(confirmReturn());
   else unawaited(storePurchases?.recover()??Future<void>.value());
  }
 }
 void accountChanged(){
  if(!sameSeller&&mounted)setState((){
   image=null;ads=[];error='Account changed. Reopen Ads with your own shop account.';
  });
 }
 @override void dispose(){
  WidgetsBinding.instance.removeObserver(this);
  widget.session.removeListener(accountChanged);
  storePurchases?.dispose();
  headline.dispose();description.dispose();super.dispose();
 }
 Future<void> load()async{
  if(!sameSeller||busy)return;
  setState((){busy=true;error=null;});
  try{
   final result=await api.call('ads_mine');
   if(mounted&&sameSeller)setState(()=>ads=mobileRows(result['ads']));
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> pickImage()async{
  if(!sameSeller||busy)return;
  final photo=await ImagePicker().pickImage(source:ImageSource.gallery,
   maxWidth:1280,maxHeight:1280,imageQuality:70);
  if(photo==null||!mounted||!sameSeller)return;
  final bytes=await photo.readAsBytes();
  if(!mounted||!sameSeller)return;
  setState((){
   if(bytes.length>2000000){
    error='Choose a smaller photograph (maximum 2 MB).';image=null;
   }else{image=bytes;error=null;}
  });
 }
 Future<void> submit()async{
  if(busy||!sameSeller)return;
  if(headline.text.trim().length<5||description.text.trim().length<12||image==null||!consent){
   setState(()=>error='Add a headline, description, image and permission to publish it.');return;
  }
  setState((){busy=true;error=null;success=null;});
  try{
   await api.call('ads_submit',{'title':headline.text.trim(),
    'message':description.text.trim(),'radiusKm':radiusKm,
    'imageBase64':base64Encode(image!),'publicDisplayConsent':true});
   if(!mounted||!sameSeller)return;
   setState((){
    headline.clear();description.clear();image=null;consent=false;
    success='Submitted for Teyza review. You will only pay after approval.';
   });
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
  if(mounted&&sameSeller)unawaited(load());
 }
 Future<void> pay(Map<String,dynamic> item)async{
  if(!directPaystack||busy||!sameSeller)return;
  setState((){busy=true;error=null;success=null;});
  try{
   final result=await api.call('ads_checkout',{
    'advertisementId':item['id'],'checkoutChannel':'direct'});
   if(!mounted||!sameSeller)return;
   final url=Uri.tryParse((result['checkoutUrl']??'').toString());
   if(url==null||url.scheme!='https'||url.host!='checkout.paystack.com')
    throw StateError('Unexpected payment-provider address.');
   final reference=(result['reference']??'').toString();
   if(!RegExp(r'^TZA-[a-f0-9]{26}$').hasMatch(reference))
    throw StateError('Secure payment reference was not received.');
   final prefs=await SharedPreferences.getInstance();
   await prefs.setString(referenceKey,reference);
   if(!mounted||!sameSeller)return;
   final opened=await launchUrl(url,mode:LaunchMode.externalApplication);
   if(!opened)throw StateError('Could not open Paystack. Your reference was saved; do not pay twice.');
   if(mounted)setState(()=>success='Complete the Paystack payment and return to Teyza to verify it.');
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> confirmReturn()async{
  if(!sameSeller||busy)return;
  final prefs=await SharedPreferences.getInstance();
  final reference=prefs.getString(referenceKey);
  if(reference==null||!RegExp(r'^TZA-[a-f0-9]{26}$').hasMatch(reference))return;
  setState((){busy=true;error=null;});
  try{
   final result=await api.call('ads_confirm',{'reference':reference});
   if(!mounted||!sameSeller)return;
   if(result['paid']==true){
    await prefs.remove(referenceKey);
    if(mounted)setState(()=>success='Paystack verified. Your reviewed ad is live for seven days.');
   }else if(result['refundReviewRequired']==true){
    await prefs.remove(referenceKey);
    if(mounted)setState(()=>error='Payment requires support review. Do not pay again.');
   }
  }catch(_){
   if(mounted)setState(()=>error='Payment not verified yet. Return after completing Paystack, or contact support.');
  }finally{if(mounted)setState(()=>busy=false);}
  if(mounted&&sameSeller)unawaited(load());
 }
 Future<void> pause(Map<String,dynamic> item)async{
  if(!sameSeller||busy)return;
  final accepted=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
   title:const Text('Pause this ad?'),
   content:const Text('Pausing an active ad does not extend the seven days or automatically issue a refund.'),
   actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
    FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Pause ad'))]));
  if(accepted!=true||!mounted||!sameSeller)return;
  setState(()=>busy=true);
  try{
   await api.call('ads_pause',{'advertisementId':item['id']});
   if(mounted)setState(()=>success='Advertisement paused.');
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
  if(mounted&&sameSeller)unawaited(load());
 }
 String label(String status)=>switch(status){
  'pending_review'=>'Awaiting Teyza review',
  'approved_unpaid'=>'Approved · payment required',
  'active'=>'Live · Sponsored',
  'rejected'=>'Rejected · see review note',
  'paused'=>'Paused',
  _=>'Campaign ended'
 };
 Widget campaignCard(Map<String,dynamic> ad){
  final status=(ad['status']??'').toString();
  final amount=(ad['amountCents'] as num?)?.toInt()??2900;
  final expires=(ad['endsAt'] as num?)?.toInt();
  return Card(margin:const EdgeInsets.only(bottom:11),child:Padding(
   padding:const EdgeInsets.all(15),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Row(children:[const Icon(Icons.campaign_outlined,color:Color(0xFF128357)),
     const SizedBox(width:8),Expanded(child:Text((ad['title']??'Your ad').toString(),
      style:const TextStyle(fontWeight:FontWeight.w800,fontSize:17)))]),
    const SizedBox(height:6),Text(label(status),
     style:const TextStyle(color:Color(0xFF128357),fontWeight:FontWeight.w700)),
    Text((ad['radiusKm']??10).toString()+' km reach · '+teyzaAdRand(amount)+' · 7 days'),
    if(expires!=null)Text('Ends '+DateTime.fromMillisecondsSinceEpoch(expires).toLocal().toString().split('.').first),
    if((ad['reviewNote']??'').toString().isNotEmpty)
     Text('Review note: '+(ad['reviewNote']??'').toString()),
    if(status=='approved_unpaid')...[
     if(directPaystack)FilledButton.icon(onPressed:busy?null:()=>pay(ad),
       icon:const Icon(Icons.lock_outline),
       label:Text('Pay '+teyzaAdRand(amount)+' with Paystack'))
     else FilledButton.icon(onPressed:busy||!sameSeller?null:()=>storePurchases?.open(ad),
       icon:const Icon(Icons.shopping_bag_outlined),
       label:Text('Buy 7-day ad · '+teyzaAdRand(amount)+' via '+(Platform.isIOS?'App Store':'Google Play')))

    ],
    if(['active','pending_review','approved_unpaid'].contains(status))
     TextButton.icon(onPressed:busy?null:()=>pause(ad),
      icon:const Icon(Icons.pause_circle_outline),label:const Text('Pause')),
   ])));
 }
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('Teyza Ads'),actions:[
   IconButton(tooltip:'Refresh campaigns',onPressed:busy?null:load,icon:const Icon(Icons.refresh))]),
  body:ListView(padding:const EdgeInsets.all(18),children:[
   const Text('Reach more local shoppers',style:TextStyle(fontSize:26,fontWeight:FontWeight.w900)),
   const SizedBox(height:6),
   const Text('For approved spaza shops and local businesses. Add your image and offer, choose the radius and submit for review. Only approved and verified paid ads reach shoppers.'),
   const SizedBox(height:14),
   Card(color:const Color(0xFFE8F6EB),child:Padding(padding:const EdgeInsets.all(18),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     const Text('7-day advertising package',style:TextStyle(fontWeight:FontWeight.w800,fontSize:18)),
     const SizedBox(height:5),
     const Text('R29 covers up to 10 km. Add R2 for each kilometre beyond 10 km. No auto-renewal.'),
     const SizedBox(height:12),
     Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[
      Text(radiusKm.toString()+' km radius',style:const TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
      Text(teyzaAdRand(teyzaAdsPriceCents(radiusKm)),
       key:const ValueKey('ad-radius-price'),
       style:const TextStyle(fontSize:24,fontWeight:FontWeight.w900))
     ]),
     Slider(key:const ValueKey('ad-radius-slider'),min:1,max:50,divisions:49,
      value:radiusKm.toDouble(),label:radiusKm.toString()+' km',
      onChanged:busy?null:(v)=>setState(()=>radiusKm=v.round())),
     const Text('The radius is measured from the approved shop pin, not your current phone GPS.')
    ]))),
   const SizedBox(height:14),
   TextField(key:const ValueKey('ad-title'),controller:headline,maxLength:80,
    decoration:const InputDecoration(labelText:'Ad headline',border:OutlineInputBorder())),
   const SizedBox(height:9),
   TextField(key:const ValueKey('ad-description'),controller:description,maxLength:240,maxLines:3,
    decoration:const InputDecoration(labelText:'What should nearby shoppers know?',border:OutlineInputBorder())),
   const SizedBox(height:7),
   OutlinedButton.icon(onPressed:busy?null:pickImage,
    icon:const Icon(Icons.add_a_photo_outlined),
    label:Text(image==null?'Choose an ad image':'Change ad image')),
   if(image!=null)Padding(padding:const EdgeInsets.symmetric(vertical:8),
    child:ClipRRect(borderRadius:BorderRadius.circular(16),
     child:Image.memory(image!,height:170,fit:BoxFit.cover))),
   CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,
    onChanged:busy?null:(v)=>setState(()=>consent=v??false),
    controlAffinity:ListTileControlAffinity.leading,
    title:const Text('I own or have permission to use this image and approve public display after review and payment.')),
   if(busy)const LinearProgressIndicator(),
   if(error!=null)Text(error!,style:const TextStyle(color:Colors.red)),
   if(success!=null)Text(success!,style:const TextStyle(color:Color(0xFF137B54))),
   const SizedBox(height:10),
   FilledButton.icon(key:const ValueKey('ad-submit'),onPressed:busy||!sameSeller?null:submit,
    icon:const Icon(Icons.fact_check_outlined),label:const Text('Submit ad for approval')),
   const SizedBox(height:12),
   const Text('Submitting does not charge you. Campaigns run for seven days after separate Teyza approval and verified payment.',
    style:TextStyle(color:Color(0xFF60736B),fontSize:12)),
   const SizedBox(height:20),
   const Text('My campaigns',style:TextStyle(fontSize:21,fontWeight:FontWeight.w800)),
   if(ads.isEmpty&&!busy)const Padding(padding:EdgeInsets.all(12),
    child:Text('No advertising campaigns submitted yet.')),
   for(final ad in ads)campaignCard(ad),
   const SizedBox(height:60)
  ]));
}
