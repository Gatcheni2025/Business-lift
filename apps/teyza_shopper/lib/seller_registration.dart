import 'dart:async';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'seller_tools.dart';
import 'seller_onboarding.dart';
import 'seller_firestore.dart';
import 'seller_phone.dart';
import 'shop_address.dart';
import 'seller_claim_picker.dart';
import 'business_categories.dart';
import 'seller_registration_draft.dart';

class SellerRegistrationPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final String? initialGooglePlaceId;
  final SellerRegistrationDraftStore? draftStore;
  const SellerRegistrationPage({super.key,required this.session,this.api,this.initialGooglePlaceId,this.draftStore});
  @override State<SellerRegistrationPage> createState()=>_RegistrationState();
}
class _RegistrationState extends State<SellerRegistrationPage> with WidgetsBindingObserver {
  final form=GlobalKey<FormState>();
  final name=TextEditingController(),phone=TextEditingController(),unit=TextEditingController(),company=TextEditingController(),number=TextEditingController();
  final scroll=ScrollController();
  late final draftStore=widget.draftStore??SellerRegistrationDraftStore();
  Timer? draftTimer;
  int draftRevision=0;
  bool restoringDraft=true,draftWriting=false,draftSaved=false,draftFailed=false,discardingDraft=false;
  String draftAddress='';
  String? draftNotice;
  ShopAddressSelection? selectedAddress;
  SellerClaimSelection? claim;
  late final String? uid;
  late String category=widget.session.requestedSellerCategory??'spaza';
  late String businessType=widget.session.requestedBusinessType??teyzaDefaultBusinessType(category);
  String legalType='individual';String? error;
  bool busy=false,consent=false,saved=false,whatsappConsent=false;
  int registrationStep=0;
  static const registrationSteps=['Business details','Shop address','Review & consent'];
  bool? listedOnGoogle;bool ownerAuthority=false,ownershipEvidence=false,contactEvidence=false;
  String get categoryExplanation=>switch(category){
    'wholesale'=>'I supply spaza shops: publish bulk stock, pack prices and delivery or collection terms after approval.',
    'retail'=>'I manufacture products or provide business and service enquiries through my public profile.',
    _=>'I sell physical products as a shop, food outlet or product seller. Existing selling and approval rules apply.',
  };
  @override void initState(){super.initState();
    if(teyzaTypeFor(businessType)?.accountCategory!=category){
      businessType=teyzaDefaultBusinessType(category);
    }
    uid=widget.session.userId;widget.session.addListener(changed);
    WidgetsBinding.instance.addObserver(this);
    for(final controller in [name,phone,unit,company,number]){controller.addListener(scheduleDraftSave);}
    restoreDraft();}
  SellerRegistrationDraft get currentDraft=>SellerRegistrationDraft(
    name:name.text.trim(),phone:phone.text.trim(),category:category,businessType:businessType,legalType:legalType,
    companyName:company.text.trim(),companyNumber:number.text.trim(),unit:unit.text.trim(),
    addressText:selectedAddress?.address??draftAddress);
  Future<void> restoreDraft() async {
    try {
      final owner=uid;
      final draft=owner==null?null:await draftStore.read(owner);
      if(!mounted||owner!=widget.session.userId)return;
      if(draft!=null&&!draft.isEmpty){
        name.text=draft.name;phone.text=draft.phone;unit.text=draft.unit;
        company.text=draft.companyName;number.text=draft.companyNumber;
        category=draft.category;
        businessType=teyzaTypeFor(draft.businessType)?.accountCategory==category
          ?draft.businessType:teyzaDefaultBusinessType(category);
        legalType=draft.legalType;draftAddress=draft.addressText;
        registrationStep=firstStageReady?1:0;
        draftSaved=true;
        draftNotice='Your saved business details are restored. Select your address again and review your consent before submitting.';
      }
    } catch (_) {
      if(mounted)draftNotice='Your saved draft could not be opened. You can enter your details here.';
    } finally {
      if(mounted){setState(()=>restoringDraft=false);
        if(uid==widget.session.userId&&widget.initialGooglePlaceId?.isNotEmpty==true)loadInitialClaim();}
    }
  }
  void scheduleDraftSave(){
    if(restoringDraft||saved||discardingDraft||uid==null||uid!=widget.session.userId)return;
    draftTimer?.cancel();
    draftRevision++;
    if(mounted)setState((){draftSaved=false;draftFailed=false;});
    draftTimer=Timer(const Duration(milliseconds:500),persistDraft);
  }
  Future<void> persistDraft() async {
    draftTimer?.cancel();
    final owner=uid;
    if(owner==null||restoringDraft||saved||discardingDraft||owner!=widget.session.userId)return;
    final snapshot=currentDraft;
    final revision=draftRevision;
    if(mounted)setState(()=>draftWriting=true);
    try {
      await draftStore.save(owner,snapshot);
      if(mounted&&owner==widget.session.userId)setState((){draftSaved=revision==draftRevision;draftFailed=false;});
    } catch (_) {
      if(mounted&&owner==widget.session.userId)setState(()=>draftFailed=true);
    } finally {if(mounted)setState(()=>draftWriting=false);}
  }
  Future<void> discardDraft() async {
    final owner=uid;if(owner==null||busy||restoringDraft||owner!=widget.session.userId)return;
    final confirmed=await showDialog<bool>(context:context,builder:(context)=>AlertDialog(
      title:const Text('Discard this registration draft?'),
      content:const Text('This removes the business details saved on this device. Your Teyza account is kept.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(context,false),child:const Text('Keep draft')),
        TextButton(onPressed:()=>Navigator.pop(context,true),child:const Text('Discard draft'))]));
    if(confirmed!=true||!mounted||owner!=widget.session.userId)return;
    draftTimer?.cancel();setState(()=>discardingDraft=true);
    try {
      await draftStore.clear(owner);
      if(!mounted||owner!=widget.session.userId)return;
      for(final controller in [name,phone,unit,company,number]){controller.clear();}
      setState((){selectedAddress=null;claim=null;draftAddress='';listedOnGoogle=null;
        ownerAuthority=false;ownershipEvidence=false;contactEvidence=false;consent=false;whatsappConsent=false;
        registrationStep=0;draftSaved=false;draftFailed=false;draftNotice=null;error=null;});
    } catch (_) {if(mounted)setState(()=>draftNotice='The draft could not be removed. Please try again.');}
    finally {if(mounted)setState(()=>discardingDraft=false);}
  }
  void showStep(int step){
    FocusScope.of(context).unfocus();
    setState((){registrationStep=step;error=null;});scheduleDraftSave();
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted&&scroll.hasClients)scroll.jumpTo(0);});
  }
  @override void didChangeAppLifecycleState(AppLifecycleState state){
    if(state==AppLifecycleState.inactive||state==AppLifecycleState.paused)persistDraft();
  }
  Future<void> loadInitialClaim() async{
    setState((){busy=true;error=null;});
    try{final data=await (widget.api??TeyzaMobileApi(widget.session)).call('seller_claim_by_id',{'placeId':widget.initialGooglePlaceId});
      if(!mounted||uid!=widget.session.userId)return;
      final value=SellerClaimSelection.fromJson(Map<String,dynamic>.from(data['claim'] as Map));
      setState((){claim=value;selectedAddress=value.address;draftAddress=value.address?.address??'';name.text=value.name;consent=false;listedOnGoogle=true;});
      scheduleDraftSave();
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error='Could not load that business. Search for it below or register with your address.');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  void changed(){if(mounted&&uid!=widget.session.userId){draftTimer?.cancel();setState(()=>error='Your account changed. Close this page and sign in again.');}}
  @override void dispose(){WidgetsBinding.instance.removeObserver(this);widget.session.removeListener(changed);
    draftTimer?.cancel();
    if(!saved&&!restoringDraft&&!discardingDraft&&uid!=null&&uid==widget.session.userId){
      draftStore.save(uid!,currentDraft).catchError((Object _){});
    }
    for(final c in [name,phone,unit,company,number]){c.removeListener(scheduleDraftSave);c.dispose();}
    scroll.dispose();super.dispose();}
  String? phoneError(String? value){
    try{normalizeMobile(value??'');return null;}
    catch(_){return 'Enter a valid mobile number, e.g. 071 234 5678 or +27 71 234 5678.';}
  }
  bool get firstStageReady=>name.text.trim().length>=2&&
    phoneError(phone.text)==null&&
    (legalType!='company'||(company.text.trim().length>=2&&number.text.trim().length>=2));
  void nextStage(){
    if(busy||restoringDraft||discardingDraft)return;
    if(registrationStep==0){
      if(!form.currentState!.validate()||!firstStageReady)return;
    }else if(registrationStep==1){
      if(selectedAddress==null){setState(()=>error='Select your complete shop address from Google suggestions.');return;}
      if(listedOnGoogle==null){setState(()=>error='Choose whether the business is listed on Google Maps.');return;}
      if(listedOnGoogle==true&&(claim==null||!ownerAuthority||!ownershipEvidence||!contactEvidence)){
        setState(()=>error='Select the existing Google business and confirm the three ownership checks.');return;
      }
    }
    showStep(registrationStep+1);
  }
  Future<void> save() async{
    if(busy||restoringDraft||discardingDraft||uid!=widget.session.userId||saved)return;
    if(!firstStageReady){showStep(0);form.currentState?.validate();setState(()=>error='Complete the business details and a valid contact number first.');return;}
    final selected=selectedAddress;if(selected==null){setState(()=>error='Select your full shop address from the suggestions.');return;}
    if(listedOnGoogle==null){
      setState(()=>error='Tell us whether this business is already on Google Maps.');return;
    }
    if(listedOnGoogle==true&&(claim==null||!ownerAuthority||!ownershipEvidence||!contactEvidence)){
      setState(()=>error='Select the matching Google business and answer all three ownership-verification questions.');return;
    }
    if(!consent){setState(()=>error='Confirm that these shop details are yours.');return;}
    setState((){busy=true;error=null;});
    try{
      final data={'category':category,'businessType':businessType,
        'legalType':legalType,'shopName':name.text.trim(),
        'phone':normalizeMobile(phone.text),'addressSelection':selected.receipt,'unit':unit.text.trim(),
        'companyName':legalType=='company'?company.text.trim():'',
        'registrationNumber':legalType=='company'?number.text.trim():'','consent':true,'locationConsent':true,
        'whatsappConsent':whatsappConsent,
        if(listedOnGoogle==true&&claim!=null)...{
          'googleClaimSelection':claim!.receipt,
          'googleClaimAnswers':{'authorized':ownerAuthority,'canProvideEvidence':ownershipEvidence,
            'canVerifyContact':contactEvidence}}
      };
      await (widget.api??TeyzaMobileApi(widget.session)).call('seller_register',data);
      if(!mounted||uid!=widget.session.userId)return;
      draftTimer?.cancel();
      setState(()=>saved=true);
      try{if(uid!=null)await draftStore.clear(uid!);}catch(_){/* Registration succeeded; draft cleanup must not block verification. */}
      if(!mounted||uid!=widget.session.userId)return;
      // Free registration proceeds directly to identity and phone verification.
      await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerOnboardingPage(session:widget.session,api:widget.api,legalType:legalType,
        shop:SellerShop(name.text.trim(),category,'${unit.text.trim().isEmpty?'':unit.text.trim()+', '}${selected.address}','pending','not_listed',phone:normalizeMobile(phone.text),
          companyName:data['companyName'] as String,registrationNumber:data['registrationNumber'] as String))));
      if(mounted&&uid==widget.session.userId)Navigator.pop(context,true);
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Widget stepActions()=>LayoutBuilder(builder:(context,constraints){
    final back=OutlinedButton.icon(
      key:const ValueKey('teyza-registration-back'),
      onPressed:busy||saved||discardingDraft?null:()=>showStep(registrationStep-1),
      icon:const Icon(Icons.arrow_back),label:const Text('Back'));
    final next=FilledButton.icon(
      key:const ValueKey('teyza-registration-next'),
      onPressed:busy||saved||discardingDraft?null:registrationStep==2?save:nextStage,
      icon:Icon(registrationStep==2?Icons.verified_user_outlined:Icons.arrow_forward),
      label:Text(busy?'Saving shop…':registrationStep==2?'Submit & verify':'Next',textAlign:TextAlign.center));
    if(constraints.maxWidth<360||MediaQuery.textScalerOf(context).scale(14)>17){
      return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        next,if(registrationStep>0)...[const SizedBox(height:8),back]]);
    }
    return Row(children:[if(registrationStep>0)...[Expanded(child:back),const SizedBox(width:10)],
      Expanded(flex:2,child:next)]);
  });
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF7F8F5),
    appBar:AppBar(backgroundColor:const Color(0xFFF7F8F5),foregroundColor:ownerInk,title:const Text('Register your business')),
    body:SafeArea(child:ListView(controller:scroll,padding:const EdgeInsets.all(22),children:[
      Container(padding:const EdgeInsets.all(24),decoration:BoxDecoration(color:ownerInk,borderRadius:BorderRadius.circular(26)),
        child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('LET’S BUILD YOUR LOCAL BUSINESS',style:TextStyle(color:Color(0xFF9DDFC0),fontSize:11,letterSpacing:1.5)),SizedBox(height:12),
          Text('Your shop.\nA bigger neighbourhood.',style:TextStyle(color:Colors.white,fontSize:29,fontWeight:FontWeight.w800,height:1.1)),SizedBox(height:14),
          Wrap(spacing:12,runSpacing:8,crossAxisAlignment:WrapCrossAlignment.center,children:[
            Text('1  Shop details',style:TextStyle(color:Color(0xFFD0E0D7),height:1.5)),
            Icon(Icons.arrow_forward_rounded,color:Color(0xFF83D9AE),size:17),
            Text('2  Verify owner · free',style:TextStyle(color:Color(0xFFD0E0D7),height:1.5))])])),
      const SizedBox(height:22),
      if(restoringDraft)const LinearProgressIndicator(),
      if(draftNotice!=null)Padding(padding:const EdgeInsets.only(bottom:12),child:Text(draftNotice!,
        key:const ValueKey('teyza-registration-draft-notice'),style:const TextStyle(color:Color(0xFF28559B),height:1.4))),
      if(error!=null&&uid!=widget.session.userId)Padding(padding:const EdgeInsets.only(bottom:16),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
      if(uid==widget.session.userId&&!restoringDraft)Form(key:form,child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        Container(key:const ValueKey('teyza-registration-step-progress'),
          padding:const EdgeInsets.all(12),
          decoration:BoxDecoration(color:const Color(0xFFE7F0FC),
            borderRadius:BorderRadius.circular(14)),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('Step ${registrationStep+1} of 3 · ${registrationSteps[registrationStep]}',
              style:const TextStyle(fontWeight:FontWeight.w800,color:Color(0xFF28559B))),
            const SizedBox(height:10),
            LinearProgressIndicator(value:(registrationStep+1)/3,
              color:const Color(0xFF2878CF),backgroundColor:const Color(0xFFD1E1F5)),
          ])),
        const SizedBox(height:15),
        if(busy&&claim==null&&widget.initialGooglePlaceId!=null)const LinearProgressIndicator(),
        if(claim!=null&&registrationStep==0)Card(
          child:ListTile(leading:const Icon(Icons.verified_outlined,
            color:Color(0xFF168657)),
            title:Text('Google Maps: ${claim!.name}'),
            subtitle:const Text('Shop address from Google Maps'))),
        if(registrationStep==1)...[
        if(claim!=null)Card(child:ListTile(leading:const Icon(Icons.storefront_outlined),title:Text('Google Maps: ${claim!.name}'),
          subtitle:const Text('Teyza will review your claim. Confirm the details below.'))),
        SellerClaimPicker(session:widget.session,api:widget.api,enabled:!busy,onChanged:(value){
          if(mounted)setState((){claim=value;selectedAddress=value?.address;consent=false;
            if(value!=null){name.text=value.name;listedOnGoogle=true;}
          });}),
        ],
        if(registrationStep==0)...[
        const SizedBox(height:16),
        const Text('Choose your Teyza account type',style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),const SizedBox(height:16),
        DropdownButtonFormField<String>(initialValue:category,isExpanded:true,decoration:InputDecoration(labelText:'I am signing up as',filled:true,fillColor:Colors.white,
          border:OutlineInputBorder(borderRadius:BorderRadius.circular(16),borderSide:const BorderSide(color:Color(0xFFE0E7DD)))),
          items:const [DropdownMenuItem(value:'spaza',child:Text('Shop / product seller',maxLines:1,overflow:TextOverflow.ellipsis)),DropdownMenuItem(value:'wholesale',child:Text('Wholesaler — supplying Spaza Shops',maxLines:1,overflow:TextOverflow.ellipsis)),DropdownMenuItem(value:'retail',child:Text('Manufacturer / service business',maxLines:1,overflow:TextOverflow.ellipsis))],
          onChanged:busy?null:(v){setState((){
            category=v??'spaza';
            businessType=teyzaDefaultBusinessType(category);
            consent=false;
          });scheduleDraftSave();}),
        const SizedBox(height:12),
        DropdownButtonFormField<String>(
          key:ValueKey('teyza-business-category-$category'),
          initialValue:businessType,isExpanded:true,
          decoration:const InputDecoration(labelText:'What kind of business?',
            border:OutlineInputBorder(),filled:true,fillColor:Colors.white),
          items:[
            for(final type in teyzaBusinessTypes.where((type)=>type.accountCategory==category))
              DropdownMenuItem(value:type.id,child:Text(teyzaDiscoveryCategoryLabel(type.discoveryGroup)+' · '+type.label,overflow:TextOverflow.ellipsis))
          ],
          onChanged:busy?null:(value){setState((){
            businessType=value??teyzaDefaultBusinessType(category);
            consent=false;
          });scheduleDraftSave();}),
        const SizedBox(height:8),Text(categoryExplanation,style:const TextStyle(
          color:Color(0xFF547363),fontWeight:FontWeight.w600,height:1.4)),
        const SizedBox(height:16),
        DropdownButtonFormField<String>(initialValue:legalType,isExpanded:true,decoration:const InputDecoration(labelText:'Register as',border:OutlineInputBorder()),
          items:const [DropdownMenuItem(value:'individual',child:Text('Individual seller')),DropdownMenuItem(value:'company',child:Text('Registered company'))],
          onChanged:busy?null:(v){setState((){legalType=v??'individual';consent=false;});scheduleDraftSave();}),const SizedBox(height:16),
        for(final f in [(name,'Shop name',120,true),(phone,'Contact number',25,true),
          if(legalType=='company')(company,'Registered company name',160,true),if(legalType=='company')(number,'Company registration number',50,true)])Padding(padding:const EdgeInsets.only(bottom:16),
          child:TextFormField(controller:f.$1,maxLength:f.$3,enabled:!busy,keyboardType:f.$1==phone?TextInputType.phone:TextInputType.text,
            onChanged:(_)=>setState((){consent=false;if(f.$1==phone)whatsappConsent=false;}),
            decoration:InputDecoration(labelText:f.$2,counterText:'',filled:true,fillColor:Colors.white,
              border:OutlineInputBorder(borderRadius:BorderRadius.circular(16),borderSide:const BorderSide(color:Color(0xFFE0E7DD)))),
            validator:(v)=>f.$1==phone?phoneError(v):f.$4&&(v??'').trim().length<2?'Enter ${f.$2.toLowerCase()}':null)),
        ],
        if(registrationStep==1)...[
        if(claim?.address!=null&&selectedAddress==claim?.address)
          Card(child:ListTile(leading:const Icon(Icons.location_on_outlined),title:const Text('Shop address from Google Maps'),
            subtitle:Text(selectedAddress!.address),trailing:TextButton(onPressed:busy?null:()=>setState((){selectedAddress=null;consent=false;}),child:const Text('Change'))))
        else ShopAddressPicker(session:widget.session,api:widget.api,enabled:!busy,initialAddress:draftAddress,
          onChanged:(value){if(mounted){setState((){selectedAddress=value;if(value!=null)draftAddress=value.address;consent=false;});scheduleDraftSave();}}),
        const SizedBox(height:16),
        Card(child:Column(children:[
          const ListTile(leading:Icon(Icons.map_outlined),title:Text('Is this business already listed on Google Maps?'),
            subtitle:Text('If your business name and address match an existing Google listing, you must claim it before Teyza can link the listing.')),
          RadioListTile<bool>(key:const ValueKey('claim-existing-google-yes'),
            title:const Text('Yes — claim my existing business'),value:true,groupValue:listedOnGoogle,
            onChanged:busy?null:(v)=>setState((){listedOnGoogle=v;consent=false;})),
          RadioListTile<bool>(title:const Text('No — this is a new business listing'),
            value:false,groupValue:listedOnGoogle,onChanged:busy?null:(v)=>setState((){
              listedOnGoogle=v;claim=null;ownerAuthority=false;ownershipEvidence=false;contactEvidence=false;consent=false;})),
          if(listedOnGoogle==true)...[
            const Padding(padding:EdgeInsets.symmetric(horizontal:16,vertical:6),
              child:Text('Select the business through Find your business above. Teyza will review ownership evidence before linking it.')),
            CheckboxListTile(value:ownerAuthority,
              onChanged:busy?null:(v)=>setState((){ownerAuthority=v==true;consent=false;}),
              title:const Text('I own this business or have written authority to represent it.')),
            CheckboxListTile(value:ownershipEvidence,
              onChanged:busy?null:(v)=>setState((){ownershipEvidence=v==true;consent=false;}),
              title:const Text('I can provide registration or ownership documents if requested.')),
            CheckboxListTile(value:contactEvidence,
              onChanged:busy?null:(v)=>setState((){contactEvidence=v==true;consent=false;}),
              title:const Text('I can verify the business phone number or another official contact.')),
          ]
        ])),
        const SizedBox(height:16),TextFormField(controller:unit,enabled:!busy,maxLength:80,onChanged:(_)=>setState(()=>consent=false),
          decoration:const InputDecoration(labelText:'Shop / unit number (optional)',hintText:'e.g. Shop 4, ground floor',
            counterText:'',filled:true,fillColor:Colors.white,border:OutlineInputBorder())),
        ],
        if(registrationStep==2)...[
        Card(color:const Color(0xFFE5F7EF),child:Padding(
          padding:const EdgeInsets.all(14),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('Review your account',style:TextStyle(
              fontSize:17,fontWeight:FontWeight.w800,color:Color(0xFF087D5E))),
            const SizedBox(height:7),
            Text('Account: ${category=='spaza'?'Spaza shop':category=='retail'?'Local business':'Wholesaler'}'),
            Text('Business type: ${teyzaTypeFor(businessType)?.label??businessType}'),
            Text('Business: ${name.text.trim()}'),
            Text('Mobile: ${phone.text.trim()}'),
            Text('Location: ${selectedAddress?.address??'Missing'}'),
            const SizedBox(height:6),
            const Text('Your business will be submitted for independent Teyza verification.',
              style:TextStyle(fontSize:12)),
          ]))),
        CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:busy?null:(v)=>setState(()=>consent=v==true),
          title:Text(claim==null?'I confirm that these are my shop’s details and shoppers may see this business address and map location.':
            'I am authorised to represent this business, and shoppers may see its address and map location.')),
        CheckboxListTile(contentPadding:EdgeInsets.zero,value:whatsappConsent,onChanged:busy?null:(v)=>setState(()=>whatsappConsent=v==true),
          title:const Text('Send my approval update and getting-started link on WhatsApp'),
          subtitle:const Text('Optional. Uses the contact number above. You can change this in seller verification.')),
        ],
        const SizedBox(height:12),
        stepActions(),
        if(error!=null)Padding(padding:const EdgeInsets.only(top:10),child:Semantics(liveRegion:true,
          child:Text(error!,key:const ValueKey('teyza-registration-step-error'),style:const TextStyle(color:Color(0xFF9A3412),height:1.4)))),
        const SizedBox(height:12),
        Text(draftFailed?'Your draft could not be saved on this device. Keep this screen open and retry.':
          draftWriting?'Saving your business details on this device…':
          draftSaved?'Business details saved on this device for 7 days. Your application has not been submitted.':
          'Your business details are saved on this device as you go. Your address and consent must be confirmed before submission.',
          key:const ValueKey('teyza-registration-draft-status'),style:TextStyle(fontSize:12,height:1.4,
            color:draftFailed?const Color(0xFF9A3412):const Color(0xFF547363))),
        if(draftFailed)TextButton(onPressed:busy||discardingDraft?null:persistDraft,child:const Text('Retry saving draft')),
        if(draftSaved||!currentDraft.isEmpty)TextButton(onPressed:busy||discardingDraft?null:discardDraft,child:const Text('Discard saved draft')),
        const SizedBox(height:12),const Text('Registration is free for spaza shops, wholesalers and other businesses. After approval your shop can appear nearby for free. Product publishing is subject to verification and seller account eligibility. Wholesalers publish their own bulk stock prices for approved spaza buyers; public Google listings cannot sell through Teyza until registered.',
          style:TextStyle(color:Color(0xFF6C7880),height:1.5))
      ]))
    ])));
}
