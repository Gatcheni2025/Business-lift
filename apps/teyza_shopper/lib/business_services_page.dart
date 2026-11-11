import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

const serviceTypes=['Beauty & hair','Plumbing','Electrical','Furniture & upholstery',
  'Repairs','Cleaning','Printing','Tutoring','Transport','Other service'];

class BusinessServicesPage extends StatefulWidget {
 final ShopperSession session;
 final TeyzaMobileApi? api;
 const BusinessServicesPage({super.key,required this.session,this.api});
 @override State<BusinessServicesPage> createState()=>_BusinessServicesState();
}
class _BusinessServicesState extends State<BusinessServicesPage>{
 late final String? ownerUid=widget.session.userId;
 late final TeyzaMobileApi api=widget.api??TeyzaMobileApi(widget.session);
 List<Map<String,dynamic>> services=[];bool busy=false;String? error;
 bool get sameAccount=>ownerUid==widget.session.userId&&widget.session.idToken!=null;
 @override void initState(){super.initState();load();}
 Future<void> load() async{
  if(!sameAccount||busy)return;
  setState((){busy=true;error=null;});
  try{
   final data=await api.call('business_services_list');
   if(mounted&&sameAccount)setState(()=>services=mobileRows(data['services']));
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> edit([Map<String,dynamic>? existing]) async{
  if(!sameAccount||busy)return;
  final form=GlobalKey<FormState>();
  final name=TextEditingController(text:(existing?['name']??'').toString());
  final desc=TextEditingController(text:(existing?['description']??'').toString());
  String type=(existing?['type']??serviceTypes.first).toString();
  if(!serviceTypes.contains(type))type=serviceTypes.first;
  final saved=await showDialog<Map<String,String>>(context:context,builder:(ctx)=>StatefulBuilder(
    builder:(ctx,setDialog)=>AlertDialog(title:Text(existing==null?'Add a service':'Edit service'),
     content:SingleChildScrollView(child:Form(key:form,child:Column(mainAxisSize:MainAxisSize.min,children:[
      DropdownButtonFormField<String>(key:const ValueKey('business-service-type'),initialValue:type,isExpanded:true,
       decoration:const InputDecoration(labelText:'Service type'),
       items:serviceTypes.map((t)=>DropdownMenuItem(value:t,child:Text(t))).toList(),
       onChanged:(v)=>setDialog(()=>type=v??serviceTypes.first)),
      TextFormField(controller:name,maxLength:100,decoration:const InputDecoration(labelText:'Service name'),
       validator:(v)=>(v??'').trim().length<3?'Enter a service name':null),
      TextFormField(controller:desc,maxLength:500,maxLines:3,
       decoration:const InputDecoration(labelText:'Describe your service')),
      const Text('You can upload a public service photo after saving. Do not use private verification documents.',style:TextStyle(fontSize:12))
     ]))),
     actions:[TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Cancel')),
      FilledButton(onPressed:()=>form.currentState!.validate()?Navigator.pop(ctx,{
       'type':type,'name':name.text.trim(),'description':desc.text.trim(),
       if(existing?['id'] is String)'serviceId':existing!['id'] as String}):null,
       child:const Text('Save service'))])));
  name.dispose();desc.dispose();
  if(saved==null||!mounted||!sameAccount)return;
  setState(()=>busy=true);
  try{
   await api.call('business_service_save',saved);
   if(mounted){setState(()=>busy=false);await load();}
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> upload(Map<String,dynamic> service) async{
  if(!sameAccount||busy)return;
  final agree=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
    title:const Text('Public service photograph'),
    content:const Text('I have permission to publish this image publicly. It does not contain a private ID, verification selfie or a customer without consent.'),
    actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
      FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('I agree'))]));
  if(agree!=true||!mounted)return;
  final image=await ImagePicker().pickImage(source:ImageSource.gallery,
    imageQuality:72,maxWidth:1200,maxHeight:1200);
  if(image==null||!mounted||!sameAccount)return;
  setState(()=>busy=true);
  try{
   await api.call('business_service_photo',{
     'serviceId':service['id'],'imageBase64':base64Encode(await image.readAsBytes()),'consent':true});
   if(mounted){setState(()=>busy=false);await load();}
  }catch(e){if(mounted)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('My business services')),
  floatingActionButton:sameAccount?FloatingActionButton.extended(
    key:const ValueKey('business-add-service'),onPressed:busy?null:()=>edit(),
    icon:const Icon(Icons.add),label:const Text('Add service')):null,
  body:ListView(padding:const EdgeInsets.all(16),children:[
    const Text('Services',style:TextStyle(fontSize:25,fontWeight:FontWeight.w800)),
    const SizedBox(height:8),
    const Text('Choose a service type, describe your work and upload photographs. Services are separate from spaza products.'),
    if(busy)const LinearProgressIndicator(),
    if(error!=null)Text(error!,style:const TextStyle(color:Colors.red)),
    if(services.isEmpty&&!busy)const Padding(padding:EdgeInsets.all(16),child:Text('No services yet. Select Add service.')),
    for(final item in services)Card(child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      if((item['imageUrl']??'').toString().startsWith('https://'))
        Image.network(item['imageUrl'] as String,height:150,fit:BoxFit.cover,
          errorBuilder:(_,error,stack)=>const SizedBox(height:90,child:Icon(Icons.design_services_outlined))),
      ListTile(title:Text((item['name']??'Service').toString()),
        subtitle:Text((item['type']??'').toString()+'\n'+(item['description']??'').toString()),
        isThreeLine:true,trailing:IconButton(icon:const Icon(Icons.edit_outlined),
          onPressed:busy?null:()=>edit(item))),
      TextButton.icon(icon:const Icon(Icons.add_a_photo_outlined),
        onPressed:busy?null:()=>upload(item),label:const Text('Upload service image'))
    ])),
    const SizedBox(height:100)
  ]));
}
