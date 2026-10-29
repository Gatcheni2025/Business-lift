import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

class SellerServiceControls extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final Map<String,dynamic> settings;
  final bool enabled;
  final VoidCallback? onSaved;
  const SellerServiceControls({super.key,required this.session,required this.settings,this.api,this.enabled=true,this.onSaved});
  @override State<SellerServiceControls> createState()=>_ServiceControlsState();
}
class _ServiceControlsState extends State<SellerServiceControls> {
  late final String? uid;
  final fee=TextEditingController(),radius=TextEditingController();
  bool delivery=false,cards=false,messages=true,working=false,dirty=false;
  int discount=0;String? error;
  bool get enabled=>widget.enabled&&!working&&uid==widget.session.userId;
  @override void initState(){super.initState();uid=widget.session.userId;read(widget.settings);widget.session.addListener(accountChanged);}
  @override void didUpdateWidget(covariant SellerServiceControls oldWidget){super.didUpdateWidget(oldWidget);if(!dirty&&!working)read(widget.settings);}
  void read(Map<String,dynamic> settings){
    delivery=settings['deliveryEnabled']==true;cards=settings['cardPayments']==true;messages=settings['liveChatEnabled']!=false;
    discount=settings['cashDiscountPercent']==10?10:0;
    fee.text=((settings['deliveryFeeCents'] as num? ??0)/100).toStringAsFixed(2);
    final distance=(settings['deliveryRadiusKm'] as num? ??0).toInt();radius.text=(distance>0?distance:5).toString();
  }
  void accountChanged(){if(mounted&&uid!=widget.session.userId){fee.clear();radius.clear();setState((){delivery=false;cards=false;messages=false;discount=0;dirty=false;error='Your account changed. Reopen your shop dashboard.';});}}
  @override void dispose(){widget.session.removeListener(accountChanged);fee.dispose();radius.dispose();super.dispose();}
  void edit(VoidCallback change){setState((){change();dirty=true;error=null;});}
  Future<void> save() async {
    if(!enabled)return;
    final text=fee.text.trim().replaceAll(',','.'),amount=double.tryParse(text),distance=int.tryParse(radius.text.trim());
    if(delivery&&(!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(text)||amount==null||!amount.isFinite||amount<0||amount>1000||distance==null||distance<1||distance>100)){
      setState(()=>error='Enter a delivery fee from R0 to R1,000 and a radius from 1 to 100 km.');return;}
    setState((){working=true;error=null;});
    try{
      final result=await (widget.api??TeyzaMobileApi(widget.session)).call('update_services',{
        'deliveryEnabled':delivery,'deliveryFeeCents':delivery?((amount??0)*100).round():0,
        'deliveryRadiusKm':delivery?distance:0,'cardPayments':cards,'liveChatEnabled':messages,
        'cashDiscountPercent':discount,'cardPaymentFeePercent':0});
      if(!mounted||uid!=widget.session.userId)return;
      setState((){dirty=false;if(result['settings'] is Map)read(Map<String,dynamic>.from(result['settings'] as Map));});
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Shop services saved.')));widget.onSaved?.call();
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>working=false);}
  }
  @override Widget build(BuildContext context)=>Material(color:Colors.white,borderRadius:BorderRadius.circular(22),
    child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      const Text('Delivery, cards & messages',style:TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
      const SizedBox(height:4),const Text('Choose what shoppers can request from your shop. Save your changes below.',style:TextStyle(color:Color(0xFF60736B),fontSize:12)),
      SwitchListTile(key:const ValueKey('seller-delivery-toggle'),contentPadding:EdgeInsets.zero,title:const Text('Offer delivery'),
        subtitle:Text(delivery?'Delivery is available':'Delivery is not offered'),value:delivery,onChanged:enabled?(v)=>edit(()=>delivery=v):null),
      if(delivery)...[
        TextField(key:const ValueKey('seller-delivery-fee'),controller:fee,enabled:enabled,onChanged:(_)=>edit((){}),
          keyboardType:const TextInputType.numberWithOptions(decimal:true),
          decoration:const InputDecoration(labelText:'Delivery fee',prefixText:'R ',helperText:'R0 means free delivery.',border:OutlineInputBorder())),
        const SizedBox(height:14),TextField(key:const ValueKey('seller-delivery-radius'),controller:radius,enabled:enabled,onChanged:(_)=>edit((){}),
          keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Delivery radius (km)',border:OutlineInputBorder())),
        const SizedBox(height:8)],
      SwitchListTile(key:const ValueKey('seller-card-toggle'),contentPadding:EdgeInsets.zero,title:const Text('Accept cards at the shop'),
        subtitle:const Text('Advertised price · no extra card charge'),value:cards,onChanged:enabled?(v)=>edit(()=>cards=v):null),
      InputDecorator(decoration:const InputDecoration(labelText:'Optional cash discount',border:OutlineInputBorder()),
        child:DropdownButtonHideUnderline(child:DropdownButton<int>(key:const ValueKey('seller-cash-discount'),value:discount,isExpanded:true,
          items:const [DropdownMenuItem(value:0,child:Text('No discount')),DropdownMenuItem(value:10,child:Text('10% off items for cash'))],
          onChanged:enabled?(v)=>edit(()=>discount=v??0):null))),
      const Padding(padding:EdgeInsets.only(top:7),child:Text('A cash discount reduces item prices for cash customers. The delivery fee stays the same.',style:TextStyle(color:Color(0xFF60736B),fontSize:11))),
      SwitchListTile(key:const ValueKey('seller-messaging-toggle'),contentPadding:EdgeInsets.zero,title:const Text('Live chat / messaging'),
        subtitle:const Text('Let shoppers message your shop'),value:messages,onChanged:enabled?(v)=>edit(()=>messages=v):null),
      if(error!=null)Padding(padding:const EdgeInsets.only(bottom:12),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
      FilledButton(onPressed:enabled&&dirty?save:null,child:Text(working?'Saving…':'Save shop options')),
    ])));
}
