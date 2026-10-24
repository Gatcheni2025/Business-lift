import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'seller_tools.dart';

class SellerRegistrationPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  const SellerRegistrationPage({super.key,required this.session,this.api});
  @override State<SellerRegistrationPage> createState()=>_RegistrationState();
}
class _RegistrationState extends State<SellerRegistrationPage>{
  final form=GlobalKey<FormState>();
  final name=TextEditingController(),phone=TextEditingController(),address=TextEditingController(),company=TextEditingController(),number=TextEditingController();
  late final uid=widget.session.userId;
  String category='spaza';String? error;bool busy=false,consent=false,saved=false;
  @override void initState(){super.initState();widget.session.addListener(changed);}
  void changed(){if(mounted&&uid!=widget.session.userId)setState(()=>error='Your account changed. Close this page and sign in again.');}
  @override void dispose(){widget.session.removeListener(changed);for(final c in [name,phone,address,company,number]){c.dispose();}super.dispose();}
  Future<void> save() async{
    if(busy||uid!=widget.session.userId||!form.currentState!.validate())return;
    if(!consent){setState(()=>error='Confirm that these shop details are yours.');return;}
    setState((){busy=true;error=null;});
    try{
      await (widget.api??TeyzaMobileApi(widget.session)).call('seller_register',{'category':category,'shopName':name.text.trim(),
        'phone':phone.text.trim(),'address':address.text.trim(),'companyName':company.text.trim(),'registrationNumber':number.text.trim(),'consent':true});
      if(!mounted||uid!=widget.session.userId)return;
      setState(()=>saved=true);
      await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerToolPage(session:widget.session,tool:SellerTool.verification,api:widget.api)));
      if(mounted&&uid==widget.session.userId)Navigator.pop(context,true);
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF7F8F5),
    appBar:AppBar(title:const Text('Register your shop')),
    body:SafeArea(child:ListView(padding:const EdgeInsets.all(22),children:[
      Container(padding:const EdgeInsets.all(24),decoration:BoxDecoration(color:ownerInk,borderRadius:BorderRadius.circular(26)),
        child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('LET’S BUILD YOUR LOCAL BUSINESS',style:TextStyle(color:Color(0xFF9DDFC0),fontSize:11,letterSpacing:1.5)),SizedBox(height:12),
          Text('Your shop.\nA bigger neighbourhood.',style:TextStyle(color:Colors.white,fontSize:29,fontWeight:FontWeight.w800,height:1.1)),SizedBox(height:14),
          Text('1  Shop details   →   2  Camera verification',style:TextStyle(color:Color(0xFFD0E0D7),height:1.5))])),
      const SizedBox(height:22),
      if(error!=null)Padding(padding:const EdgeInsets.only(bottom:16),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
      if(uid==widget.session.userId)Form(key:form,child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const Text('Tell us about your shop',style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),const SizedBox(height:16),
        DropdownButtonFormField<String>(initialValue:category,isExpanded:true,decoration:const InputDecoration(labelText:'Shop type',border:OutlineInputBorder()),
          items:const [DropdownMenuItem(value:'spaza',child:Text('Spaza Shop')),DropdownMenuItem(value:'retail',child:Text('Other Retail / Wholesale'))],
          onChanged:busy?null:(v)=>setState(()=>category=v??'spaza')),
        const SizedBox(height:16),
        for(final f in [(name,'Shop name',120,true),(phone,'Contact number',25,true),(address,'Shop address',250,true),
          (company,'Company name (optional)',160,false),(number,'Registration number (optional)',50,false)])Padding(padding:const EdgeInsets.only(bottom:16),
          child:TextFormField(controller:f.$1,maxLength:f.$3,enabled:!busy,keyboardType:f.$1==phone?TextInputType.phone:TextInputType.text,
            decoration:InputDecoration(labelText:f.$2,border:const OutlineInputBorder()),
            validator:(v)=>f.$4&&(v??'').trim().length<(f.$1==phone?9:2)?'Enter ${f.$2.toLowerCase()}':null)),
        CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:busy?null:(v)=>setState(()=>consent=v==true),
          title:const Text('I confirm that these are my shop’s details.')),
        const SizedBox(height:12),FilledButton.icon(onPressed:busy||saved?null:save,icon:const Icon(Icons.camera_alt_outlined),
          label:Text(busy?'Saving shop…':'Continue to camera verification')),
        const SizedBox(height:12),const Text('Your shop stays private while an admin reviews your registration. You can resume verification from your dashboard.',
          style:TextStyle(color:Color(0xFF6C7880),height:1.5))
      ]))
    ])));
}
