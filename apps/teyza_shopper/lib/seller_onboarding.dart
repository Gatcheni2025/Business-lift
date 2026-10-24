import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'seller_firestore.dart';
import 'seller_phone.dart';
import 'seller_tools.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

class SellerOnboardingPage extends StatefulWidget {
  final ShopperSession session;
  final SellerShop shop;
  final String? legalType;
  final TeyzaMobileApi? api;
  final Future<Uint8List?> Function(ImageSource)? captureDocument;
  final Future<Uint8List?> Function()? captureSelfie;
  const SellerOnboardingPage({super.key,required this.session,required this.shop,this.legalType,this.api,this.captureDocument,this.captureSelfie});
  @override State<SellerOnboardingPage> createState()=>_OnboardingState();
}
class _OnboardingState extends State<SellerOnboardingPage> {
  late final uid=widget.session.userId,api=widget.api??TeyzaMobileApi(widget.session);
  late String legalType=widget.legalType??(widget.shop.companyName.isNotEmpty&&widget.shop.registrationNumber.isNotEmpty?'company':'individual');
  late final company=TextEditingController(text:widget.shop.companyName),registration=TextEditingController(text:widget.shop.registrationNumber);
  final number=TextEditingController();
  String kind='id';String? error,message;
  Uint8List? document;
  Map<String,dynamic> progress={};
  bool loading=false,busy=false,consent=false,changed=false;
  @override void initState(){super.initState();widget.session.addListener(accountChanged);load();}
  void accountChanged(){if(mounted&&uid!=widget.session.userId){document=null;number.clear();company.clear();registration.clear();
    setState((){changed=true;consent=false;progress={};error='Your account changed. Close this page and sign in again.';});}}
  @override void dispose(){widget.session.removeListener(accountChanged);document=null;number.dispose();company.dispose();registration.dispose();super.dispose();}
  Future<void> load() async {
    if(changed)return;setState(()=>loading=true);
    try{final data=await api.call('seller_onboarding');
      if(mounted&&uid==widget.session.userId)setState((){progress=data;legalType=data['legalType']?.toString()??legalType;error=null;});
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> capture(ImageSource source) async {
    if(busy||changed)return;
    setState((){busy=true;error=null;});
    XFile? file;
    try{
      Uint8List? bytes;
      if(widget.captureDocument!=null){bytes=await widget.captureDocument!(source);}
      else{file=await ImagePicker().pickImage(source:source,maxWidth:1600,maxHeight:1600,imageQuality:82,requestFullMetadata:false);bytes=await file?.readAsBytes();}
      if(bytes==null)return;
      if(bytes.length>2000000)throw StateError('Use a clear document photo smaller than 2 MB.');
      if(mounted&&uid==widget.session.userId)setState((){document=bytes;consent=false;message=null;});
    }catch(_){if(mounted)setState(()=>error='Could not open this photo. Allow camera or photo access in your device settings and try again.');}
    finally{if(file!=null){try{await File(file.path).delete();}catch(_){}}
      if(mounted)setState(()=>busy=false);}
  }
  Future<void> submitDocument() async {
    if(busy||changed)return;
    if(document==null||!consent){setState(()=>error='Add a clear document photo and agree to submit it.');return;}
    if(legalType=='company'&&(company.text.trim().isEmpty||registration.text.trim().isEmpty)){
      setState(()=>error='Enter your registered company name and registration number.');return;
    }
    if(legalType=='individual'&&number.text.trim().length<4){setState(()=>error='Enter your ID or passport number.');return;}
    setState((){busy=true;error=null;message=null;});
    try{
      await api.call('seller_identity_submit',{'legalType':legalType,'kind':kind,'documentNumber':number.text.trim(),
        'companyName':company.text.trim(),'registrationNumber':registration.text.trim(),'imageBase64':base64Encode(document!),'consent':true});
      if(!mounted||uid!=widget.session.userId)return;
      setState((){document=null;number.clear();consent=false;message='Private document submitted.';});await load();
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> selfie() async {
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerToolPage(session:widget.session,tool:SellerTool.verification,api:api,captureSelfie:widget.captureSelfie)));
    if(mounted&&!changed)load();
  }
  Future<void> phone() async {
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerPhonePage(session:widget.session,phone:progress['phone']?.toString()??widget.shop.phone)));
    if(mounted&&!changed)load();
  }
  Future<void> complete() async {
    if(busy||changed)return;
    setState((){busy=true;error=null;});
    try{
      final result=await api.call('seller_onboarding_complete');
      if(mounted&&uid==widget.session.userId&&result['sellingStatus']=='active'){
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Your shop is ready to sell. Add the products you stock.')));
        Navigator.pop(context,true);
      }
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Widget card(Widget child)=>Container(margin:const EdgeInsets.only(bottom:18),padding:const EdgeInsets.all(20),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(24),border:Border.all(color:const Color(0xFFE4EADF))),child:child);
  Widget heading(String step,String title,bool done)=>Row(children:[Container(width:34,height:34,decoration:BoxDecoration(
    color:done?const Color(0xFFE3F5EB):const Color(0xFFF1F2EA),borderRadius:BorderRadius.circular(12)),
    child:Center(child:done?const Icon(Icons.check,size:19,color:Color(0xFF168657)):Text(step,style:const TextStyle(fontWeight:FontWeight.w800)))),
    const SizedBox(width:12),Expanded(child:Text(title,style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800,color:ownerInk)))]);
  @override Widget build(BuildContext context){
    final identityDone=progress['identity'] is Map,selfieDone=progress['selfie'] is Map,phoneDone=progress['phoneVerified']==true;
    final allDone=identityDone&&selfieDone&&phoneDone;
    return Scaffold(backgroundColor:const Color(0xFFF7F8F5),appBar:AppBar(title:const Text('Get ready to sell'),
      actions:[IconButton(tooltip:'Refresh registration',onPressed:loading||busy||changed?null:load,icon:const Icon(Icons.refresh))]),
      body:SafeArea(child:ListView(padding:const EdgeInsets.all(20),children:[
        Container(padding:const EdgeInsets.all(24),decoration:BoxDecoration(color:ownerInk,borderRadius:BorderRadius.circular(26)),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('YOUR NEXT CHAPTER',style:TextStyle(color:Color(0xFF9DDFC0),fontSize:11,letterSpacing:1.5)),const SizedBox(height:12),
            Text(widget.shop.name,style:const TextStyle(color:Colors.white,fontSize:28,fontWeight:FontWeight.w800)),const SizedBox(height:10),
            const Text('A document, a selfie and your mobile. Complete these steps and start selling to your neighbourhood.',style:TextStyle(color:Color(0xFFD0E0D7),height:1.5)),
            const SizedBox(height:18),LinearProgressIndicator(value:[identityDone,selfieDone,phoneDone].where((v)=>v).length/3,
              color:ownerGreen,backgroundColor:const Color(0xFF35433B),borderRadius:BorderRadius.circular(8)),const SizedBox(height:8),
            Text('${[identityDone,selfieDone,phoneDone].where((v)=>v).length} of 3 complete',style:const TextStyle(color:Colors.white,fontSize:12))])),
        const SizedBox(height:20),if(loading)const LinearProgressIndicator(),
        if(error!=null)Padding(padding:const EdgeInsets.only(bottom:18),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412),height:1.4))),
        if(message!=null)Padding(padding:const EdgeInsets.only(bottom:18),child:Text(message!,style:const TextStyle(color:Color(0xFF168657)))),
        if(!changed)...[
          card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            heading('1',legalType=='company'?'Company registration':'ID or passport',identityDone),const SizedBox(height:14),
            Text(legalType=='company'?'Photograph your company registration certificate. Your registered name and number must be legible.':
              'Photograph the details page of your ID or passport. Keep all corners and text clear. This document stays private.',style:const TextStyle(height:1.5,color:Color(0xFF6C7880))),
            const SizedBox(height:14),
            if(legalType=='individual')...[
              DropdownButtonFormField<String>(initialValue:kind,decoration:const InputDecoration(labelText:'Document type',border:OutlineInputBorder()),
                items:const [DropdownMenuItem(value:'id',child:Text('ID document')),DropdownMenuItem(value:'passport',child:Text('Passport'))],
                onChanged:busy?null:(value)=>setState(()=>kind=value??'id')),
              const SizedBox(height:14),TextField(controller:number,maxLength:50,enabled:!busy,decoration:InputDecoration(labelText:kind=='id'?'ID number':'Passport number',border:const OutlineInputBorder()))
            ]else ...[
              TextField(controller:company,maxLength:160,enabled:!busy,decoration:const InputDecoration(labelText:'Registered company name',border:OutlineInputBorder())),const SizedBox(height:10),
              TextField(controller:registration,maxLength:50,enabled:!busy,decoration:const InputDecoration(labelText:'Company registration number',border:OutlineInputBorder()))
            ],
            if(identityDone&&document==null)const Padding(padding:EdgeInsets.symmetric(vertical:10),child:Text('Document received. Add a new photo only if you need to replace it.',style:TextStyle(color:Color(0xFF168657)))),
            if(document!=null)Padding(padding:const EdgeInsets.symmetric(vertical:12),child:ClipRRect(borderRadius:BorderRadius.circular(16),child:Image.memory(document!,height:200,fit:BoxFit.contain))),
            OutlinedButton.icon(onPressed:busy?null:()=>capture(ImageSource.camera),icon:const Icon(Icons.camera_alt_outlined),label:const Text('Photograph document')),
            TextButton.icon(onPressed:busy?null:()=>capture(ImageSource.gallery),icon:const Icon(Icons.photo_library_outlined),label:const Text('Choose document photo')),
            if(document!=null)...[
              CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:busy?null:(v)=>setState(()=>consent=v==true),
                title:const Text('Submit this private document for Teyza seller verification'),subtitle:const Text('Authorised reviewers can access it. The photo and document number are removed after 90 days.')),
              FilledButton(onPressed:busy?null:submitDocument,child:Text(busy?'Please wait…':'Submit document'))
            ]
          ])),
          card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[heading('2','Owner selfie',selfieDone),const SizedBox(height:12),
            const Text('Use the front camera to take a clear photo of the person responsible for this shop.',style:TextStyle(height:1.5,color:Color(0xFF6C7880))),const SizedBox(height:14),
            OutlinedButton.icon(onPressed:busy?null:selfie,icon:const Icon(Icons.face_retouching_natural),label:Text(selfieDone?'View or retake selfie':'Open selfie camera'))])),
          card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[heading('3','Mobile number & OTP',phoneDone),const SizedBox(height:12),
            Text(progress['phone']?.toString()??widget.shop.phone,style:const TextStyle(fontSize:18,fontWeight:FontWeight.w700)),const SizedBox(height:8),
            const Text('Confirm that you own this number using the SMS code. Your current account and shop stay together.',style:TextStyle(height:1.5,color:Color(0xFF6C7880))),const SizedBox(height:14),
            OutlinedButton.icon(onPressed:busy?null:phone,icon:const Icon(Icons.sms_outlined),label:Text(phoneDone?'Verify mobile again':'Verify mobile number'))])),
          if(progress['moderationBlocked']==true)const Padding(padding:EdgeInsets.only(bottom:16),child:Text('An administrator needs to review your registration before selling can resume.',style:TextStyle(color:Color(0xFF9A3412)))),
          FilledButton.icon(onPressed:busy||loading||!allDone||progress['moderationBlocked']==true?null:complete,icon:const Icon(Icons.storefront_outlined),label:Text(busy?'Please wait…':'Finish setup & start selling')),
          const SizedBox(height:12),const Text('The verified badge is added after an administrator checks your documents and selfie. You can prepare private products at any time.',textAlign:TextAlign.center,style:TextStyle(color:Color(0xFF6C7880),fontSize:12,height:1.5))
        ]
      ])));
  }
}
