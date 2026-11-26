import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

const serviceTypes=["Beauty & hair","Plumbing","Electrical","Furniture & upholstery","Repairs","Cleaning","Printing","Tutoring","Transport","Other service","Manufacturing & fabrication","Catering & food preparation","Professional & consulting","Accounting & financial services","IT & digital services","Photography & events","Health & wellness","Education & training","Accommodation & tourism","Agriculture"];
const businessOfferProductTypes=["Fashion & accessories","Electronics & appliances","Furniture, home & living","Beauty & personal care products","Hardware & building supplies","Sports & outdoor","Books & stationery","Agricultural supplies","Motor parts & accessories","Speciality food & beverages","Other products"];
const businessOfferPayments={'arrange':"Arrange with business",'cash':"Cash",'card_in_person':"Card in person",'eft':"EFT / bank transfer"};
const businessOfferFulfilments={'collection':"Collection",'seller_delivery':"Business delivery",'courier':"Courier",'on_site':"On-site service",'remote':"Remote service"};

/// Business offerings are enquiries, not a bypass around the verified
/// physical-goods checkout or the wholesale partnership rules.
String businessOfferTerms(Map<String,dynamic> item) {
 final price=item['priceCents'];
 final methods=((item['paymentMethods'] as List?)??const [])
   .whereType<String>().map((id)=>businessOfferPayments[id]).whereType<String>();
 final fulfilments=((item['fulfilmentTypes'] as List?)??const [])
   .whereType<String>().map((id)=>businessOfferFulfilments[id]).whereType<String>();
 return [
  if(price is int && price>=0) 'Price guide: R'+(price/100).toStringAsFixed(2)
   else 'Request a quote',
  if(methods.isNotEmpty) 'Payment: '+methods.join(', '),
  if(fulfilments.isNotEmpty) 'Fulfilment: '+fulfilments.join(', '),
  'Confirm final price and arrangements with the business.',
 ].join('\n');
}

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
  }catch(e){if(mounted&&sameAccount)setState(()=>error=mobileError(e));}
  finally{if(mounted)setState(()=>busy=false);}
 }

 Future<void> edit([Map<String,dynamic>? existing]) async{
  if(!sameAccount||busy)return;
  final form=GlobalKey<FormState>();
  final name=TextEditingController(text:(existing?['name']??'').toString());
  final desc=TextEditingController(text:(existing?['description']??'').toString());
  final previousPrice=existing?['priceCents'];
  final price=TextEditingController(text:previousPrice is int?
    (previousPrice/100).toStringAsFixed(2):'');
  String kind=existing?['kind']=='product'?'product':'service';
  List<String> categories()=>kind=='product'?businessOfferProductTypes:serviceTypes;
  String type=(existing?['type']??categories().first).toString();
  if(!categories().contains(type))type=categories().first;
  final payment=((existing?['paymentMethods'] as List?)??const ['arrange'])
    .whereType<String>().where(businessOfferPayments.containsKey).toSet();
  final fulfilment=((existing?['fulfilmentTypes'] as List?)??const [])
    .whereType<String>().where(businessOfferFulfilments.containsKey).toSet();
  final saved=await showDialog<Map<String,dynamic>>(context:context,builder:(ctx)=>StatefulBuilder(
    builder:(ctx,setDialog)=>AlertDialog(
      title:Text(existing==null?'Add a product or service':'Edit offering'),
      content:SingleChildScrollView(child:Form(key:form,child:Column(
        mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        DropdownButtonFormField<String>(key:const ValueKey('business-offering-kind'),
          initialValue:kind,isExpanded:true,decoration:const InputDecoration(labelText:'What are you listing?'),
          items:const [DropdownMenuItem(value:'product',child:Text('Product')),
            DropdownMenuItem(value:'service',child:Text('Service'))],
          onChanged:(v)=>setDialog((){kind=v??'service';type=categories().first;
            if(kind=='product')fulfilment.removeAll(['on_site','remote']);})),
        const SizedBox(height:12),
        DropdownButtonFormField<String>(key:ValueKey('business-service-type-'+kind),
          initialValue:type,isExpanded:true,decoration:const InputDecoration(labelText:'Category'),
          items:categories().map((t)=>DropdownMenuItem(value:t,child:Text(t,overflow:TextOverflow.ellipsis))).toList(),
          onChanged:(v)=>setDialog(()=>type=v??categories().first)),
        const SizedBox(height:12),
        TextFormField(controller:name,maxLength:100,decoration:const InputDecoration(labelText:'Product or service name'),
          validator:(v)=>(v??'').trim().length<3?'Enter a name':null),
        TextFormField(controller:desc,maxLength:500,maxLines:3,
          decoration:const InputDecoration(labelText:'Description, size or terms')),
        TextFormField(key:const ValueKey('business-offering-price'),controller:price,
          keyboardType:const TextInputType.numberWithOptions(decimal:true),
          decoration:const InputDecoration(labelText:'Indicative price (R)',helperText:'Leave blank for a quote'),
          validator:(v){final s=(v??'').trim().replaceAll(',','.');
            if(s.isEmpty)return null;
            final amount=double.tryParse(s);
            return !RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(s)||amount==null||
              !amount.isFinite||amount<0||amount>1000000?'Enter a valid price':null;}),
        const SizedBox(height:16),
        const Text('Payment arrangements',style:TextStyle(fontWeight:FontWeight.w800)),
        for(final method in businessOfferPayments.entries)
          CheckboxListTile(contentPadding:EdgeInsets.zero,controlAffinity:ListTileControlAffinity.leading,
            title:Text(method.value),value:payment.contains(method.key),
            onChanged:(value)=>setDialog((){if(value==true){payment.add(method.key);}
              else{payment.remove(method.key);}})),
        const SizedBox(height:12),
        const Text('Delivery or service type',style:TextStyle(fontWeight:FontWeight.w800)),
        for(final mode in businessOfferFulfilments.entries)
          if(kind=='service'||!['on_site','remote'].contains(mode.key))
            CheckboxListTile(contentPadding:EdgeInsets.zero,controlAffinity:ListTileControlAffinity.leading,
              title:Text(mode.value),value:fulfilment.contains(mode.key),
              onChanged:(value)=>setDialog((){if(value==true){fulfilment.add(mode.key);}
                else{fulfilment.remove(mode.key);}})),
        const SizedBox(height:8),
        const Text('These are enquiry terms, not online checkout. Confirm availability, final price, payment and delivery with the customer. Never enter bank or card details here.',
          style:TextStyle(fontSize:12,height:1.4)),
        const SizedBox(height:8),
        const Text('You can upload a public offering photo after saving.',style:TextStyle(fontSize:12)),
      ]))),
      actions:[
        TextButton(onPressed:()=>Navigator.pop(ctx),child:const Text('Cancel')),
        FilledButton(onPressed:(){
          if(!form.currentState!.validate())return;
          final raw=price.text.trim().replaceAll(',','.');
          Navigator.pop(ctx,<String,dynamic>{
            'kind':kind,'type':type,'name':name.text.trim(),'description':desc.text.trim(),
            'priceCents':raw.isEmpty?null:(double.parse(raw)*100).round(),
            'paymentMethods':payment.toList(),'fulfilmentTypes':fulfilment.toList(),
            if(existing?['id'] is String)'serviceId':existing!['id'] as String,
          });
        },child:const Text('Save offering')),
      ])));
  name.dispose();desc.dispose();price.dispose();
  if(saved==null||!mounted||!sameAccount)return;
  setState(()=>busy=true);
  try{
   await api.call('business_service_save',saved);
   if(mounted&&sameAccount){setState(()=>busy=false);await load();}
  }catch(e){if(mounted&&sameAccount)setState(()=>error=mobileError(e));}
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
  appBar:AppBar(title:const Text('My products & services')),
  floatingActionButton:sameAccount?FloatingActionButton.extended(
    key:const ValueKey('business-add-service'),onPressed:busy?null:()=>edit(),
    icon:const Icon(Icons.add),label:const Text('Add offering')):null,
  body:ListView(padding:const EdgeInsets.all(16),children:[
    const Text('Products & services',style:TextStyle(fontSize:25,fontWeight:FontWeight.w800)),
    const SizedBox(height:8),
    const Text('List what your business manufactures, sells or provides. Choose categories, price guides, payment and delivery arrangements. Customers enquire before agreeing to a purchase or booking.'),
    if(busy)const LinearProgressIndicator(),
    if(error!=null)Text(error!,style:const TextStyle(color:Colors.red)),
    if(services.isEmpty&&!busy)const Padding(padding:EdgeInsets.all(16),child:Text('No offerings yet. Select Add offering.')),
    for(final item in services)Card(child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      if((item['imageUrl']??'').toString().startsWith('https://'))
        Image.network(item['imageUrl'] as String,height:150,fit:BoxFit.cover,
          errorBuilder:(_,error,stack)=>const SizedBox(height:90,child:Icon(Icons.design_services_outlined))),
      ListTile(title:Text((item['name']??'Offering').toString()),
        subtitle:Text((item['kind']=='product'?'Product':'Service')+' · '+
          (item['type']??'').toString()+'\n'+(item['description']??'').toString()+
          '\n'+businessOfferTerms(item)),
        isThreeLine:true,trailing:IconButton(icon:const Icon(Icons.edit_outlined),
          onPressed:busy?null:()=>edit(item))),
      TextButton.icon(icon:const Icon(Icons.add_a_photo_outlined),
        onPressed:busy?null:()=>upload(item),label:const Text('Upload offering image'))
    ])),
    const SizedBox(height:100)
  ]));
}
