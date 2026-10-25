import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

class SellerShopPhotoPage extends StatefulWidget {
 final ShopperSession session;
 final TeyzaMobileApi? api;
 final Future<Uint8List?> Function(ImageSource)? capture;
 const SellerShopPhotoPage({super.key,required this.session,this.api,this.capture});
 @override State<SellerShopPhotoPage> createState()=>_ShopPhotoState();
}
class _ShopPhotoState extends State<SellerShopPhotoPage>{
 late final String? uid;
 late final api=widget.api??TeyzaMobileApi(widget.session);
 Uint8List? photo;
 bool loading=true,busy=false,consent=false,changed=false,dirty=false;
 String? error;
 @override void initState(){super.initState();uid=widget.session.userId;widget.session.addListener(accountChanged);load();}
 void accountChanged(){if(mounted&&uid!=widget.session.userId)setState((){changed=true;photo=null;consent=false;error='Your account changed. Close this page and sign in again.';});}
 @override void dispose(){widget.session.removeListener(accountChanged);photo=null;super.dispose();}
 Future<void> load() async{
  try{final data=await api.call('shop_front_read');final saved=data['shopFront'];
   if(mounted&&!changed&&!dirty&&uid==widget.session.userId&&saved is Map&&saved['imageBase64'] is String)
    setState(()=>photo=base64Decode(saved['imageBase64'] as String));
  }catch(e){if(mounted&&!changed)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>loading=false);}
 }
 Future<void> capture(ImageSource source) async{
  if(busy||changed)return;setState((){busy=true;error=null;});XFile? file;
  try{
   Uint8List? bytes;
   if(widget.capture!=null){bytes=await widget.capture!(source);}
   else{file=await ImagePicker().pickImage(source:source,preferredCameraDevice:CameraDevice.rear,
     maxWidth:1600,maxHeight:1200,imageQuality:80,requestFullMetadata:false);bytes=await file?.readAsBytes();}
   if(bytes==null)return;
   if(bytes.isEmpty||bytes.length>2000000)throw StateError('Choose a clear shop photo smaller than 2 MB.');
   if(mounted&&!changed&&uid==widget.session.userId)setState((){photo=bytes;dirty=true;consent=false;});
  }catch(e){if(mounted&&!changed)setState(()=>error=e is StateError?mobileError(e):'Allow camera or photo access in your phone settings and try again.');}
  finally{if(file!=null)try{await File(file.path).delete();}catch(_){}if(mounted)setState(()=>busy=false);}
 }
 Future<void> save() async{
  if(busy||changed||photo==null||!dirty||!consent)return;
  setState((){busy=true;error=null;});
  try{await api.call('shop_front_submit',{'imageBase64':base64Encode(photo!),'consent':true});
   if(mounted&&!changed&&uid==widget.session.userId){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Shop-front photo saved.')));Navigator.pop(context,true);}
  }catch(e){if(mounted&&!changed)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF7F8F5),
  appBar:AppBar(title:const Text('Shop-front photo')),
  body:SafeArea(child:ListView(padding:const EdgeInsets.all(24),children:[
   const Text('Help shoppers find your shop',style:TextStyle(fontSize:27,fontWeight:FontWeight.w800,color:Color(0xFF010F1C))),
   const SizedBox(height:12),const Text('Photograph the front entrance, shop name and sign from outside. Keep people, IDs and other private documents out of the picture.',style:TextStyle(height:1.5)),
   const SizedBox(height:20),if(loading)const LinearProgressIndicator(),
   if(error!=null)Padding(padding:const EdgeInsets.only(bottom:16),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
   if(photo!=null)ClipRRect(borderRadius:BorderRadius.circular(24),child:Image.memory(photo!,height:230,fit:BoxFit.cover))
   else Container(height:210,decoration:BoxDecoration(color:const Color(0xFFEDE9E0),borderRadius:BorderRadius.circular(24)),
    child:const Center(child:Icon(Icons.storefront_outlined,size:72,color:Color(0xFF168657)))),
   const SizedBox(height:18),OutlinedButton.icon(onPressed:busy||changed?null:()=>capture(ImageSource.camera),icon:const Icon(Icons.camera_alt_outlined),label:const Text('Photograph shop front')),
   TextButton.icon(onPressed:busy||changed?null:()=>capture(ImageSource.gallery),icon:const Icon(Icons.photo_library_outlined),label:const Text('Choose shop-front photo')),
   CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:busy||changed?null:(v)=>setState(()=>consent=v==true),
    title:const Text('Show this photo on my shop listing'),subtitle:const Text('Shoppers can see it when your shop is published. ID documents and selfies stay private.')),
   const SizedBox(height:12),FilledButton(onPressed:busy||changed||!dirty||!consent?null:save,child:Text(busy?'Saving photo…':'Save shop-front photo')),
  ])));
}
