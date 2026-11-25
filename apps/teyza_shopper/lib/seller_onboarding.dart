import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'seller_firestore.dart';
import 'seller_phone.dart';
import 'seller_tools.dart';
import 'seller_shop_photo.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'seller_location.dart';

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
  late final String? uid;
  late final api=widget.api??TeyzaMobileApi(widget.session);
  late String legalType=widget.legalType??(widget.shop.companyName.isNotEmpty&&widget.shop.registrationNumber.isNotEmpty?'company':'individual');
  late final company=TextEditingController(text:widget.shop.companyName),registration=TextEditingController(text:widget.shop.registrationNumber);
  final number=TextEditingController();
  final scroll=ScrollController();
  String kind='id';String? error,message;
  Uint8List? document;
  Map<String,dynamic> progress={};
  bool loading=false,busy=false,consent=false,changed=false;
  bool initialStepSelected=false;
  int setupStep=0;
  static const setupLabels=['Identity','Owner selfie','Mobile OTP','Shop photo','Shop location'];
  static const setupIds=['identity','selfie','phone','photo','location'];
  Map get registrationProgress=>progress['registrationProgress'] is Map?progress['registrationProgress'] as Map:const {};
  List<bool> get completedSteps {
    final selfie=progress['selfie'];
    final fallback=[progress['identity'] is Map,
      selfie is Map&&!['rejected','needs_new_photo'].contains(selfie['status']),
      progress['phoneVerified']==true,progress['shopFront'] is Map,progress['locationSaved']==true];
    final steps=registrationProgress['steps'];
    if(steps is! List)return fallback;
    return List<bool>.generate(setupIds.length,(index){
      for(final step in steps){if(step is Map&&step['id']==setupIds[index]&&step['complete'] is bool)return step['complete'] as bool;}
      return fallback[index];
    });
  }
  String get applicationStatus {
    final status=registrationProgress['status'];
    if(['in_progress','pending_review','approved','needs_correction'].contains(status))return status as String;
    final selfie=progress['selfie'];
    if(progress['moderationBlocked']==true||selfie is Map&&['rejected','needs_new_photo'].contains(selfie['status']))return 'needs_correction';
    if(completedSteps.every((value)=>value)){
      if(progress['sellingStatus']=='active'&&selfie is Map&&selfie['status']=='approved')return 'approved';
      if(progress['sellingStatus']=='pending_approval')return 'pending_review';
    }
    return 'in_progress';
  }
  bool get submittedAlready=>['pending_review','approved'].contains(applicationStatus);
  bool get readyToSubmit=>completedSteps.every((value)=>value)&&progress['moderationBlocked']!=true&&
    applicationStatus!='needs_correction'&&!submittedAlready&&registrationProgress['readyToSubmit']!=false;
  int get nextIncomplete {
    final next=completedSteps.indexOf(false);return next<0?4:next;
  }
  void showStep(int step){
    FocusScope.of(context).unfocus();setState(()=>setupStep=step);
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted&&scroll.hasClients)scroll.jumpTo(0);});
  }
  @override void initState(){super.initState();uid=widget.session.userId;widget.session.addListener(accountChanged);load();}
  void accountChanged(){if(mounted&&uid!=widget.session.userId){document=null;number.clear();company.clear();registration.clear();
    setState((){changed=true;consent=false;progress={};error='Your account changed. Close this page and sign in again.';});}}
  @override void dispose(){widget.session.removeListener(accountChanged);document=null;number.dispose();company.dispose();registration.dispose();scroll.dispose();super.dispose();}
  Future<void> load() async {
    if(changed)return;setState(()=>loading=true);
    try{final data=await api.call('seller_onboarding');
      if(mounted&&uid==widget.session.userId)setState((){progress=data;legalType=data['legalType']?.toString()??legalType;error=null;
        if(!initialStepSelected){setupStep=submittedAlready?4:nextIncomplete;initialStepSelected=true;}
      });
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
  Future<void> shopPhoto() async {
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerShopPhotoPage(session:widget.session,api:api)));
    if(mounted&&!changed)load();
  }
  Future<void> phone() async {
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerPhonePage(session:widget.session,phone:progress['phone']?.toString()??widget.shop.phone)));
    if(mounted&&!changed)load();
  }
  Future<void> setWhatsApp(bool enabled) async {
    if(busy||changed)return;setState((){busy=true;error=null;});
    try{await api.call('seller_whatsapp_preferences',{'enabled':enabled});
      if(mounted&&uid==widget.session.userId)setState((){progress={...progress,'whatsappOptedIn':enabled};
        message=enabled?'WhatsApp approval updates enabled.':'WhatsApp approval updates disabled.';});
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> location() async {
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerLocationPage(session:widget.session,api:api,shopAddress:widget.shop.address)));
    if(mounted&&!changed)load();
  }
  Future<void> complete() async {
    if(busy||changed)return;
    if(!readyToSubmit){
      setState(()=>error=submittedAlready?'Your application is already submitted. Refresh to check the review status.':'Complete the outstanding verification checks before submitting.');return;
    }
    setState((){busy=true;error=null;});
    try{
      final result=await api.call('seller_onboarding_complete');
      if(mounted&&uid==widget.session.userId&&['active','pending_approval'].contains(result['sellingStatus'])){
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(result['sellingStatus']=='active'&&result['verificationStatus']=='approved'?
          'Your approved shop is published. Keep your shop location and stock up to date.':'Setup submitted. Your shop will be visible after Teyza approves it.')));
        Navigator.pop(context,true);
      }
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Widget card(Widget child)=>Padding(padding:const EdgeInsets.only(bottom:18),child:Material(color:Colors.white,
    shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(24),side:const BorderSide(color:Color(0xFFE4EADF))),
    child:Padding(padding:const EdgeInsets.all(20),child:child)));
  // Celebrate server-confirmed uploads without displaying private selfie bytes.
  // Progress is loaded from the verified seller setup response, never guessed.
  Widget uploadSavedBadge(String label,bool completed)=>AnimatedSwitcher(
    duration:const Duration(milliseconds:420),
    switchInCurve:Curves.easeOutBack,
    transitionBuilder:(child,animation)=>FadeTransition(
      opacity:animation,child:ScaleTransition(
        scale:Tween<double>(begin:0.92,end:1).animate(animation),child:child)),
    child:completed
      ?Container(key:ValueKey('teyza-upload-confirmed-$label'),
        padding:const EdgeInsets.symmetric(horizontal:13,vertical:12),
        margin:const EdgeInsets.only(bottom:12),
        decoration:BoxDecoration(color:const Color(0xFFE5F9EF),
          border:Border.all(color:const Color(0xFF88D9B5)),
          borderRadius:BorderRadius.circular(13)),
        child:Row(children:[
          const Icon(Icons.check_circle_rounded,color:Color(0xFF13885C)),
          const SizedBox(width:10),
          Expanded(child:Text(label,style:const TextStyle(
            color:Color(0xFF08734F),fontWeight:FontWeight.w800)))
        ]))
      :const SizedBox.shrink(key:ValueKey('teyza-upload-awaiting')),
  );
  Widget heading(String step,String title,bool done)=>Row(children:[Container(width:34,height:34,decoration:BoxDecoration(
    color:done?const Color(0xFFE3F5EB):const Color(0xFFF1F2EA),borderRadius:BorderRadius.circular(12)),
    child:Center(child:done?const Icon(Icons.check,size:19,color:Color(0xFF168657)):Text(step,style:const TextStyle(fontWeight:FontWeight.w800)))),
    const SizedBox(width:12),Expanded(child:Text(title,style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800,color:ownerInk)))]);
  Widget stepActions(bool currentDone)=>LayoutBuilder(builder:(context,constraints){
    final back=OutlinedButton.icon(
      key:const ValueKey('teyza-onboarding-back'),
      onPressed:busy||loading?null:()=>showStep(setupStep-1),
      icon:const Icon(Icons.arrow_back),label:const Text('Back'));
    final next=FilledButton.icon(
      key:const ValueKey('teyza-onboarding-next'),
      onPressed:busy||loading||(!currentDone&&!(setupStep==4&&submittedAlready))?null:
        setupStep==4?(submittedAlready?()=>Navigator.pop(context,true):readyToSubmit?complete:null):
        ()=>showStep(setupStep+1),
      icon:Icon(setupStep==4?Icons.verified_user_outlined:Icons.arrow_forward),
      label:Text(busy?'Please wait…':setupStep==4?(submittedAlready?'Back to business':'Submit for review'):'Next',textAlign:TextAlign.center));
    if(constraints.maxWidth<360||MediaQuery.textScalerOf(context).scale(14)>17){
      return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        next,if(setupStep>0)...[const SizedBox(height:8),back]]);
    }
    return Row(children:[if(setupStep>0)...[Expanded(child:back),const SizedBox(width:12)],
      Expanded(flex:2,child:next)]);
  });
  @override Widget build(BuildContext context){
    final completed=completedSteps;
    final identityDone=completed[0],selfieDone=completed[1],phoneDone=completed[2];
    final photoDone=completed[3],locationDone=completed[4];
    final allDone=completed.every((ready)=>ready);
    final currentDone=completed[setupStep];
    final selfieInfo=progress['selfie'];
    final correction= selfieInfo is Map ? (selfieInfo['reviewNote']??'').toString().trim() : '';
    final correctionSent= selfieInfo is Map && selfieInfo['complianceRequestedAt']!=null;
    return Scaffold(backgroundColor:const Color(0xFFF7F8F5),appBar:AppBar(title:const Text('Get ready to sell'),
      actions:[IconButton(tooltip:'Refresh registration',onPressed:loading||busy||changed?null:load,icon:const Icon(Icons.refresh))]),
      body:SafeArea(child:ListView(controller:scroll,padding:const EdgeInsets.all(20),children:[
        Container(padding:const EdgeInsets.all(16),decoration:BoxDecoration(color:ownerInk,borderRadius:BorderRadius.circular(20)),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(widget.shop.name,style:const TextStyle(color:Colors.white,fontSize:20,fontWeight:FontWeight.w800)),const SizedBox(height:6),
            const Text('Complete five checks for Teyza review.',style:TextStyle(color:Color(0xFFD0E0D7),fontSize:13,height:1.3)),
            const SizedBox(height:12),
            if(initialStepSelected)LinearProgressIndicator(value:completed.where((v)=>v).length/5,
              color:ownerGreen,backgroundColor:const Color(0xFF35433B),borderRadius:BorderRadius.circular(8)),const SizedBox(height:8),
            Text(initialStepSelected?'${completed.where((v)=>v).length} of 5 saved · Step ${setupStep+1} of 5':
              loading?'Checking your saved progress…':'Saved progress unavailable. Refresh to retry.',
              style:const TextStyle(color:Colors.white,fontSize:12)),
            const SizedBox(height:8),
            const Text('Checks are saved to your account. Continue later anytime.',
              style:TextStyle(color:Color(0xFFD0E0D7),fontSize:12,height:1.4))])),
        const SizedBox(height:12),if(loading)const LinearProgressIndicator(),
        if(error!=null)Padding(padding:const EdgeInsets.only(bottom:18),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412),height:1.4))),
        if(message!=null)Padding(padding:const EdgeInsets.only(bottom:18),child:Text(message!,style:const TextStyle(color:Color(0xFF168657)))),
        if(correction.isNotEmpty)Card(color:const Color(0xFFFFF4DF),child:Padding(
          padding:const EdgeInsets.all(15),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(correctionSent?'Admin requested missing requirements':'Message from your Teyza reviewer',
              style:const TextStyle(fontWeight:FontWeight.w800,color:Color(0xFF8A5916))),
            const SizedBox(height:8),Text(correction),
            const SizedBox(height:8),const Text('Complete the applicable steps below, then refresh your registration. Your current selfie is retained unless a new one was explicitly requested.',
              style:TextStyle(fontSize:12,color:Color(0xFF704F20)))
          ]))),
        if(!changed)...[
          if(initialStepSelected)card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            Text(submittedAlready?(applicationStatus=='approved'?'Verification approved':'Application submitted'):
              applicationStatus=='needs_correction'?'Registration needs attention':allDone?'Ready to submit':'Continue your registration',
              key:const ValueKey('teyza-application-status'),
              style:const TextStyle(fontSize:18,fontWeight:FontWeight.w800,color:ownerInk)),
            const SizedBox(height:8),
            Text(applicationStatus=='approved'?
              'Teyza has approved your business verification. You can return to your business workspace.':
              applicationStatus=='pending_review'?
              'Your information is saved and awaiting Teyza review. You do not need to submit it again.':
              applicationStatus=='needs_correction'?
              'Review the message from Teyza and correct the requested information. Approval is still pending.':
              allDone?'All five checks are saved. Submit your application for Teyza review.':
              'Next: ${setupLabels[nextIncomplete]}. Your saved checks are listed below.',
              style:const TextStyle(height:1.4,color:Color(0xFF547363))),
            const SizedBox(height:10),
            ExpansionTile(tilePadding:EdgeInsets.zero,title:const Text('View saved checklist'),
              children:[for(var i=0;i<setupLabels.length;i++)ListTile(
              key:ValueKey('teyza-registration-check-${setupIds[i]}'),contentPadding:EdgeInsets.zero,
              leading:Icon(completed[i]?Icons.check_circle_outline:Icons.radio_button_unchecked,
                color:completed[i]?const Color(0xFF168657):const Color(0xFF7A8980)),
              title:Text(setupLabels[i]),subtitle:Text(completed[i]?'Saved':i==nextIncomplete?'Next step':'Not complete'),
              trailing:setupStep==i?const Icon(Icons.arrow_forward,size:18):null,
              onTap:busy||loading||!(completed[i]||i<=nextIncomplete)?null:()=>showStep(i))]),
          ])),
          Semantics(label:'Setup step ${setupStep+1} of 5: ${setupLabels[setupStep]}',
            child:Row(children:[
              for(var i=0;i<setupLabels.length;i++)Expanded(child:Container(
                height:6,margin:const EdgeInsets.symmetric(horizontal:3),
                decoration:BoxDecoration(
                  color:completed[i]?const Color(0xFF168657):
                    i==setupStep?const Color(0xFF3279D5):const Color(0xFFDBE4E0),
                  borderRadius:BorderRadius.circular(6)))),
            ])),
          const SizedBox(height:14),
          Text(setupLabels[setupStep],key:const ValueKey('teyza-onboarding-step-title'),
            style:const TextStyle(fontSize:19,fontWeight:FontWeight.w800,color:ownerInk)),
          const SizedBox(height:12),
          if(setupStep==0)card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            heading('1',legalType=='company'?'Company registration':'ID or passport',identityDone),const SizedBox(height:14),
            Text(legalType=='company'?'Photograph your company registration certificate. Your registered name and number must be legible.':
              'Photograph the details page of your ID or passport. Keep all corners and text clear. This document stays private.',style:const TextStyle(height:1.5,color:Color(0xFF6C7880))),
            const SizedBox(height:14),
            if(legalType=='individual')...[
              DropdownButtonFormField<String>(initialValue:kind,isExpanded:true,decoration:const InputDecoration(labelText:'Document type',border:OutlineInputBorder()),
                items:const [DropdownMenuItem(value:'id',child:Text('ID document',maxLines:1,overflow:TextOverflow.ellipsis)),DropdownMenuItem(value:'passport',child:Text('Passport',maxLines:1,overflow:TextOverflow.ellipsis))],
                onChanged:busy?null:(value)=>setState(()=>kind=value??'id')),
              const SizedBox(height:14),TextField(controller:number,maxLength:50,enabled:!busy,decoration:InputDecoration(labelText:kind=='id'?'ID number':'Passport number',border:const OutlineInputBorder()))
            ]else ...[
              TextField(controller:company,maxLength:160,enabled:!busy,decoration:const InputDecoration(labelText:'Registered company name',border:OutlineInputBorder())),const SizedBox(height:10),
              TextField(controller:registration,maxLength:50,enabled:!busy,decoration:const InputDecoration(labelText:'Company registration number',border:OutlineInputBorder()))
            ],
            if(identityDone&&document==null)uploadSavedBadge('Private document saved securely',true),
            if(document!=null)Padding(padding:const EdgeInsets.symmetric(vertical:12),
              child:AnimatedSwitcher(
                duration:const Duration(milliseconds:450),
                switchInCurve:Curves.easeOutBack,
                transitionBuilder:(child,animation)=>ScaleTransition(
                  scale:Tween<double>(begin:0.85,end:1).animate(animation),
                  child:FadeTransition(opacity:animation,child:child)),
                child:ClipRRect(
                  key:ValueKey<int>(document!.length),
                  borderRadius:BorderRadius.circular(16),
                  child:Image.memory(document!,height:200,fit:BoxFit.contain)))),
            if(document!=null)const Padding(padding:EdgeInsets.only(bottom:8),
              child:Row(children:[Icon(Icons.check_circle,color:Color(0xFF168657)),
                SizedBox(width:8),Expanded(child:Text('Image ready — submit to save',
                  style:TextStyle(color:Color(0xFF168657),fontWeight:FontWeight.w700)))])),
            OutlinedButton.icon(onPressed:busy?null:()=>capture(ImageSource.camera),icon:const Icon(Icons.camera_alt_outlined),label:const Text('Photograph document')),
            TextButton.icon(onPressed:busy?null:()=>capture(ImageSource.gallery),icon:const Icon(Icons.photo_library_outlined),label:const Text('Choose document photo')),
            if(document!=null)...[
              CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:busy?null:(v)=>setState(()=>consent=v==true),
                title:const Text('Submit this private document for Teyza seller verification'),subtitle:const Text('Authorised reviewers can access it. The photo and document number are removed after 90 days.')),
              FilledButton(onPressed:busy?null:submitDocument,child:Text(busy?'Please wait…':'Submit document'))
            ]
          ])),
          if(setupStep==1)card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[heading('2','Owner selfie',selfieDone),const SizedBox(height:12),
            const Text('Use the front camera to take a clear photo of the person responsible for this shop.',style:TextStyle(height:1.5,color:Color(0xFF6C7880))),const SizedBox(height:14),
             uploadSavedBadge('Owner selfie saved privately',selfieDone),
            OutlinedButton.icon(onPressed:busy?null:selfie,icon:const Icon(Icons.face_retouching_natural),label:Text(selfieDone?'View or retake selfie':'Open selfie camera'))])),
          if(setupStep==2)card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[heading('3','Mobile number & OTP',phoneDone),const SizedBox(height:12),
            Text(progress['phone']?.toString()??widget.shop.phone,style:const TextStyle(fontSize:18,fontWeight:FontWeight.w700)),const SizedBox(height:8),
            const Text('Confirm that you own this number using the SMS code. Your current account and shop stay together.',style:TextStyle(height:1.5,color:Color(0xFF6C7880))),const SizedBox(height:14),
            OutlinedButton.icon(onPressed:busy?null:phone,icon:const Icon(Icons.sms_outlined),label:Text(phoneDone?'Verify mobile again':'Verify mobile number')),
            CheckboxListTile(contentPadding:EdgeInsets.zero,value:progress['whatsappOptedIn']==true,onChanged:busy||loading?null:(v)=>setWhatsApp(v==true),
              title:const Text('Send my approval update on WhatsApp'),subtitle:const Text('Optional. We use the registered mobile number for the approval update and getting-started link.'))])),
          if(setupStep==3)card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            heading('4','Shop-front photo',photoDone),const SizedBox(height:12),
            const Text('Help customers recognise your entrance. This photo appears on your published shop listing; your identity documents stay private.',style:TextStyle(height:1.5,color:Color(0xFF6C7880))),
            const SizedBox(height:12),uploadSavedBadge('Shop-front image uploaded',photoDone),
             OutlinedButton.icon(onPressed:busy?null:shopPhoto,icon:const Icon(Icons.storefront_outlined),
              label:Text(progress['shopFront'] is Map?'View or replace shop photo':'Add shop-front photo'))])),
          if(setupStep==4)card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[heading('5','Shop map location',locationDone),
            const SizedBox(height:12),const Text('Save your shop pin and suburb so shoppers can find your approved shop in their area.'),
            const SizedBox(height:12),OutlinedButton.icon(onPressed:busy?null:location,icon:const Icon(Icons.location_on_outlined),
              label:Text(progress['locationSaved']==true?'View shop location':'Set shop location'))])),
          if(progress['moderationBlocked']==true)const Padding(padding:EdgeInsets.only(bottom:16),child:Text('An administrator needs to review your registration before selling can resume.',style:TextStyle(color:Color(0xFF9A3412)))),
          stepActions(currentDone),
          if(!currentDone)Padding(padding:const EdgeInsets.only(top:8),child:Text(
            submittedAlready?'You can update your ${setupLabels[setupStep].toLowerCase()} here or return to your business.':
              'Complete ${setupLabels[setupStep].toLowerCase()} before continuing.',
            style:const TextStyle(color:Color(0xFF925913),fontWeight:FontWeight.w600,fontSize:12))),
          TextButton(onPressed:busy||loading?null:()=>Navigator.pop(context,false),child:const Text('Finish later — keep my progress')),
          const SizedBox(height:12),const Text('An administrator reviews your documents and selfie first. Once approved, you can activate product access and add products.',textAlign:TextAlign.center,style:TextStyle(color:Color(0xFF6C7880),fontSize:12,height:1.5))
        ]
      ])));
  }
}
