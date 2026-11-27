import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';
import 'shop_address.dart';

class SellerLocationPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final String shopAddress;
  const SellerLocationPage({super.key,required this.session,this.api,this.shopAddress=''});
  @override State<SellerLocationPage> createState()=>_LocationState();
}
class _LocationState extends State<SellerLocationPage> {
  late final String? uid=widget.session.userId;
  late final TeyzaMobileApi api=widget.api??TeyzaMobileApi(widget.session);
  final unit=TextEditingController();
  late String currentAddress=widget.shopAddress,streetAddress=widget.shopAddress;
  ShopAddressSelection? selection;
  bool loading=true,working=false,consent=false,changed=false;String? error;
  @override void initState(){super.initState();widget.session.addListener(accountChanged);load();}
  @override void dispose(){widget.session.removeListener(accountChanged);unit.dispose();super.dispose();}
  void accountChanged(){if(mounted&&uid!=widget.session.userId){unit.clear();
    setState((){changed=true;currentAddress='';streetAddress='';selection=null;consent=false;error='Your account changed. Close this page and sign in again.';});}}
  Future<void> load() async {
    try{final data=await api.call('seller_location_read');if(!mounted||uid!=widget.session.userId)return;
      currentAddress=(data['address']??widget.shopAddress).toString();streetAddress=(data['streetAddress']??currentAddress).toString();unit.text=(data['unit']??'').toString();
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> save() async {
    if(working||loading||changed)return;final selected=selection;
    if(selected==null||!consent){setState(()=>error='Select your full shop address from the suggestions and confirm that shoppers may see its location.');return;}
    setState((){working=true;error=null;});
    try{await api.call('seller_location_save',{'addressSelection':selected.receipt,'unit':unit.text.trim(),'consent':true});
      if(mounted&&uid==widget.session.userId){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Shop location saved. Approved shops can appear in nearby results.')));Navigator.pop(context,true);}
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>working=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF6F7F2),
    appBar:AppBar(title:const Text('Shop location')),body:ListView(padding:const EdgeInsets.all(20),children:[
      const Text('Put your shop on the map',style:TextStyle(fontSize:25,fontWeight:FontWeight.w800)),const SizedBox(height:8),
      const Text('Select your full street address so nearby shoppers can find your approved shop. Check the selected address on Google Maps before saving.'),
      const SizedBox(height:18),if(loading)const LinearProgressIndicator(),
      if(!changed&&!loading)...[
        if(currentAddress.isNotEmpty)Container(padding:const EdgeInsets.all(16),margin:const EdgeInsets.only(bottom:18),
          decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(16)),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            const Text('Current business address',style:TextStyle(fontWeight:FontWeight.w700)),const SizedBox(height:6),Text(currentAddress),
            const SizedBox(height:6),const Text('Search and select a full address below to update the address and map location together.')])),
        ShopAddressPicker(session:widget.session,api:api,initialAddress:streetAddress,enabled:!working,
          onChanged:(value){if(mounted)setState((){selection=value;consent=false;});}),
        const SizedBox(height:16),TextField(controller:unit,enabled:!working,maxLength:80,onChanged:(_)=>setState(()=>consent=false),
          decoration:const InputDecoration(labelText:'Shop / unit number (optional)',counterText:'',border:OutlineInputBorder())),
        CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:working?null:(v)=>setState(()=>consent=v==true),
          title:const Text('This is my shop address. Show this business address and map location to shoppers.')),
      ],
      if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
      const SizedBox(height:12),FilledButton(onPressed:working||loading||changed?null:save,child:Text(working?'Saving…':'Save shop location')),
    ]));
}
