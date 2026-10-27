import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

class SellerMandatePage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final String phone;
  final Future<Uint8List?> Function(ImageSource)? captureDocument;
  const SellerMandatePage({super.key,required this.session,this.api,this.phone='',this.captureDocument});
  @override State<SellerMandatePage> createState()=>_SellerMandateState();
}
class _SellerMandateState extends State<SellerMandatePage> {
  final form=GlobalKey<FormState>();
  final first=TextEditingController(),surname=TextEditingController(),phone=TextEditingController(),number=TextEditingController(),holder=TextEditingController(),account=TextEditingController(),branch=TextEditingController();
  late final uid=widget.session.userId;
  late final api=widget.api??TeyzaMobileApi(widget.session);
  String requestId='mandate_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(100000000)}';
  String kind='id',accountType='current';String? bank,error;
  DateTime? firstDate;Uint8List? document;
  Map<String,dynamic>? saved,identity;Map<String,dynamic> config={};
  bool loading=true,busy=false,consent=false,identityConsent=false,changed=false,editing=false,useExisting=true;
  @override void initState(){super.initState();phone.text=widget.phone;widget.session.addListener(accountChanged);load();}
  void accountChanged(){if(uid!=widget.session.userId){for(final c in [first,surname,phone,number,holder,account,branch]){c.clear();}document=null;if(mounted)setState((){changed=true;saved=null;identity=null;consent=false;identityConsent=false;error='Your account changed. Close this form and sign in again.';});}}
  @override void dispose(){widget.session.removeListener(accountChanged);document=null;for(final c in [first,surname,phone,number,holder,account,branch]){c.dispose();}super.dispose();}
  Future<void> load() async {
    if(changed)return;setState(()=>loading=true);
    try{final r=await api.call('seller_mandate_status');if(!mounted||uid!=widget.session.userId)return;
      setState((){config=r;saved=r['mandate'] is Map?Map<String,dynamic>.from(r['mandate']):null;identity=r['identity'] is Map?Map<String,dynamic>.from(r['identity']):null;kind=identity?['kind']?.toString()??'id';editing=saved==null||saved?['status']=='withdrawn';error=null;});
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  String get date=>firstDate==null?'':firstDate!.toIso8601String().substring(0,10);
  String get terms=>(config['termsTemplate']?.toString()??'').replaceAll('{firstDate}',date.isEmpty?'your selected first date':date).replaceAll('{collectionDay}',firstDate?.day.toString()??'your selected day');
  Future<void> pickDate() async {
    final now=DateTime.now().toUtc().add(const Duration(hours:2)),today=DateTime(now.year,now.month,now.day);var initial=today;
    if(initial.day>28)initial=DateTime(initial.year,initial.month+1,1);
    final picked=await showDatePicker(context:context,initialDate:firstDate??initial,firstDate:today,lastDate:today.add(const Duration(days:365)),selectableDayPredicate:(d)=>d.day<=28);
    if(picked!=null&&mounted)setState((){firstDate=picked;consent=false;});
  }
  Future<void> capture(ImageSource source) async {
    if(busy||changed)return;setState((){busy=true;error=null;});XFile? file;
    try{Uint8List? bytes;if(widget.captureDocument!=null){bytes=await widget.captureDocument!(source);}else{file=await ImagePicker().pickImage(source:source,maxWidth:1600,maxHeight:1600,imageQuality:82,requestFullMetadata:false);bytes=await file?.readAsBytes();}
      if(bytes==null)return;if(bytes.length>2000000)throw StateError('Use a clear ID/passport photo smaller than 2 MB.');
      if(mounted&&uid==widget.session.userId)setState((){document=bytes;useExisting=false;identityConsent=false;consent=false;});
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(file!=null){try{await File(file.path).delete();}catch(_){}}if(mounted)setState(()=>busy=false);}
  }
  Future<void> submit() async {
    if(busy||changed||!form.currentState!.validate())return;
    if(firstDate==null||!consent||!identityConsent||(document==null&&!(useExisting&&identity!=null))){setState(()=>error='Choose a date, attach your ID/passport and accept both confirmations.');return;}
    setState((){busy=true;error=null;});
    try{final r=await api.call('seller_mandate_submit',{'requestId':requestId,'expectedMandateId':saved?['mandateId'],'amountCents':9900,'termsVersion':config['termsVersion'],'firstDate':date,'collectionDay':firstDate!.day,
      'firstName':first.text.trim(),'surname':surname.text.trim(),'phone':phone.text.trim(),'documentKind':kind,'documentNumber':number.text.trim(),'accountHolder':holder.text.trim(),'bankName':bank,'branchCode':branch.text.trim(),'accountNumber':account.text.trim(),'accountType':accountType,'consent':true,'identityConsent':true,
      if(document!=null)'imageBase64':base64Encode(document!),if(document==null&&useExisting)'identityEvidenceId':identity?['evidenceId']});
      if(!mounted||uid!=widget.session.userId)return;for(final c in [first,surname,number,holder,account]){c.clear();}
      setState((){document=null;saved=Map<String,dynamic>.from(r['mandate']);editing=false;consent=false;identityConsent=false;});
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Mandate saved. No payment has been collected.')));
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> withdraw() async {
    final confirmed=await showDialog<bool>(context:context,builder:(c)=>AlertDialog(title:const Text('Withdraw this authorisation?'),content:const Text('This stops this recorded authorisation. Contact support@teyza.co.za about an existing provider collection or any amount already due.'),actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:const Text('Keep mandate')),FilledButton(onPressed:()=>Navigator.pop(c,true),child:const Text('Withdraw'))]));
    if(confirmed!=true||!mounted||changed)return;setState(()=>busy=true);
    try{await api.call('seller_mandate_withdraw',{'mandateId':saved!['mandateId']});if(mounted&&uid==widget.session.userId)await load();}catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}finally{if(mounted)setState(()=>busy=false);}
  }
  Widget card(String title,List<Widget> children)=>Container(margin:const EdgeInsets.only(bottom:18),padding:const EdgeInsets.all(20),decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(24),border:Border.all(color:const Color(0xFFE1E8E2))),child:Material(type:MaterialType.transparency,child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[Text(title,style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800,color:Color(0xFF143D37))),const SizedBox(height:14),...children])));
  Widget input(String label,TextEditingController c,{TextInputType? keyboard,bool private=false,String? Function(String?)? validate})=>Padding(padding:const EdgeInsets.only(bottom:14),child:TextFormField(controller:c,keyboardType:keyboard,obscureText:private,autocorrect:false,enableSuggestions:false,decoration:InputDecoration(labelText:label,border:OutlineInputBorder(borderRadius:BorderRadius.circular(14))),validator:validate??(v)=>(v??'').trim().isEmpty?'Required':null,onChanged:(_)=>setState(()=>consent=false)));
  @override Widget build(BuildContext context){
    final banks=mobileRows(config['banks']),benefits=(config['benefits'] as List? ??const []).map((e)=>e.toString()).toList();
    return Scaffold(backgroundColor:const Color(0xFFF5F7F2),appBar:AppBar(title:const Text('Membership & mandate')),body:SafeArea(child:loading?const Center(child:CircularProgressIndicator()):ListView(padding:const EdgeInsets.all(20),children:[
      Container(padding:const EdgeInsets.all(24),margin:const EdgeInsets.only(bottom:20),decoration:BoxDecoration(color:const Color(0xFF123E36),borderRadius:BorderRadius.circular(28)),child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('GROW YOUR SHOP',style:TextStyle(color:Color(0xFFC4EB94),letterSpacing:1.6,fontWeight:FontWeight.w700)),SizedBox(height:12),Text('Your next chapter.\nR99 / month.',style:TextStyle(color:Colors.white,fontSize:32,fontWeight:FontWeight.w800)),SizedBox(height:12),Text('Choose your collection date. Review your details. Stay in control.',style:TextStyle(color:Color(0xFFDBE9E1),height:1.5))])),
      if(error!=null)card('Please check',[Text(error!,style:const TextStyle(color:Colors.red)),if(config.isEmpty&&!changed)TextButton(onPressed:load,child:const Text('Retry'))]),
      if(benefits.isNotEmpty)card('Made for your business',[for(final b in benefits)Padding(padding:const EdgeInsets.only(bottom:12),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[const Icon(Icons.check_circle_outline,color:Color(0xFF16845D),size:20),const SizedBox(width:10),Expanded(child:Text(b))])),const Text('Partner offers and priority placement are subject to availability. Finance requires a separate application and approval.',style:TextStyle(fontSize:12))]),
      if(saved!=null)card('Your authorisation',[SelectableText('Reference: ${saved!['mandateId']}'),Text('Status: ${saved!['status'].toString().replaceAll('_',' ')}'),Text('${saved!['bankName']} · account ending ${saved!['accountLast4']}'),Text('R99.00 monthly · day ${saved!['collectionDay']} · first date ${saved!['firstDate']}'),const SizedBox(height:12),Text(saved!['terms']?.toString()??''),const SizedBox(height:12),const Text('Automatic collection is not active. Teyza will contact you for provider/bank activation after approval.'),if(saved!['status']!='withdrawn')...[
        TextButton(onPressed:busy||changed?null:()=>setState((){editing=true;consent=false;identityConsent=false;requestId='mandate_${DateTime.now().microsecondsSinceEpoch}_${Random.secure().nextInt(100000000)}';}),child:const Text('Replace mandate details')),
        TextButton(onPressed:busy||changed?null:withdraw,child:const Text('Withdraw authorisation'))]]),
      if(editing&&!changed&&config.isNotEmpty)AbsorbPointer(absorbing:busy,child:Form(key:form,child:Column(children:[
        card('1. Account holder',[input('Name',first),input('Surname',surname),input('Phone number',phone,keyboard:TextInputType.phone),DropdownButtonFormField<String>(initialValue:kind,decoration:const InputDecoration(labelText:'Document type'),items:const [DropdownMenuItem(value:'id',child:Text('South African ID')),DropdownMenuItem(value:'passport',child:Text('Passport'))],onChanged:(v)=>setState((){kind=v!;useExisting=identity?['kind']==kind;consent=false;})),const SizedBox(height:14),input('ID / passport number',number,validate:(v)=>kind=='id'?(RegExp(r'^\d{13}$').hasMatch(v??'')?null:'Enter your 13-digit ID number'):((v??'').trim().length>=4?null:'Enter your passport number'))]),
        card('2. Required ID attachment',[if(identity!=null&&identity?['kind']==kind)CheckboxListTile(contentPadding:EdgeInsets.zero,value:useExisting&&document==null,onChanged:(v)=>setState((){useExisting=v??false;consent=false;}),title:const Text('Use my current verification ID/passport attachment')),if(document!=null)...[const Text('ID/passport photo attached'),const SizedBox(height:8),Image.memory(document!,height:150,fit:BoxFit.contain,excludeFromSemantics:true)],OutlinedButton.icon(onPressed:()=>capture(ImageSource.camera),icon:const Icon(Icons.camera_alt_outlined),label:const Text('Photograph ID / passport')),TextButton(onPressed:()=>capture(ImageSource.gallery),child:const Text('Attach ID / passport photo')),CheckboxListTile(contentPadding:EdgeInsets.zero,value:identityConsent,onChanged:(v)=>setState(()=>identityConsent=v??false),title:const Text('I consent to Teyza processing this private ID/passport for owner verification.')),const Text('Required for verification. A mandate submission does not automatically verify or approve a shop.',style:TextStyle(fontSize:12))]),
        card('3. Bank details',[input('Account holder / authorised signatory',holder),DropdownButtonFormField<String>(initialValue:bank,decoration:const InputDecoration(labelText:'Bank name'),items:[for(final b in banks)DropdownMenuItem(value:b['name'].toString(),child:Text(b['name'].toString()))],onChanged:(v)=>setState((){bank=v;branch.text=banks.firstWhere((b)=>b['name']==v)['branchCode']?.toString()??'';consent=false;}),validator:(v)=>v==null?'Select your bank':null),const SizedBox(height:14),input('Branch code (filled when bank is selected)',branch,keyboard:TextInputType.number,validate:(v)=>RegExp(r'^\d{6}$').hasMatch(v??'')?null:'Enter six digits'),input('Account number',account,keyboard:TextInputType.number,validate:(v)=>RegExp(r'^\d{6,20}$').hasMatch(v??'')?null:'Enter your account number'),const Text('Selecting a bank fills its universal branch code. Your personal account number must be entered by you; this form does not verify bank ownership.',style:TextStyle(fontSize:12)),DropdownButtonFormField<String>(initialValue:accountType,decoration:const InputDecoration(labelText:'Account type'),items:const [DropdownMenuItem(value:'current',child:Text('Current / cheque')),DropdownMenuItem(value:'savings',child:Text('Savings')),DropdownMenuItem(value:'transmission',child:Text('Transmission'))],onChanged:(v)=>setState((){accountType=v!;consent=false;}))]),
        card('4. Your collection agreement',[const Text('Membership amount: R99.00 per month',style:TextStyle(fontWeight:FontWeight.w800,fontSize:18)),const SizedBox(height:12),OutlinedButton.icon(onPressed:pickDate,icon:const Icon(Icons.calendar_month_outlined),label:Text(date.isEmpty?'Choose first collection date':date)),const Text('Choose day 1–28 so the date exists every month.'),const SizedBox(height:14),Text(terms),const SizedBox(height:14),CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:(v)=>setState(()=>consent=v??false),title:const Text('I have read and authorise the exact amount, dates and bank account above.')),const Text('No debit is made by submitting this form. Seller approval and payment-provider activation are required first.',style:TextStyle(fontSize:12)),const SizedBox(height:14),FilledButton(onPressed:busy||config['termsVersion']==null?null:submit,child:Text(busy?'Saving securely…':'Sign & submit R99 mandate'))])
      ]))),
    ])));
  }
}
