import 'dart:async';
import 'package:flutter/material.dart';
import 'shop_address.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

class SellerClaimSelection {
  final String name,displayAddress,receipt;
  final ShopAddressSelection? address;
  const SellerClaimSelection({required this.name,required this.displayAddress,required this.receipt,this.address});
  factory SellerClaimSelection.fromJson(Map<String,dynamic> data){
    if(data['name'] is! String||data['claimSelection'] is! String||
       (data['name'] as String).isEmpty||(data['claimSelection'] as String).isEmpty){
      throw StateError('Could not select this business. Search again.');
    }
    return SellerClaimSelection(name:data['name'] as String,displayAddress:(data['displayAddress']??'').toString(),
      receipt:data['claimSelection'] as String,address:data['addressSelection'] is Map?
        ShopAddressSelection.fromJson(Map<String,dynamic>.from(data['addressSelection'] as Map)):null);
  }
}

class SellerClaimPicker extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final bool enabled;
  final ValueChanged<SellerClaimSelection?> onChanged;
  const SellerClaimPicker({super.key,required this.session,required this.onChanged,this.api,this.enabled=true});
  @override State<SellerClaimPicker> createState()=>_SellerClaimPickerState();
}

class _SellerClaimPickerState extends State<SellerClaimPicker> {
  late final String? uid=widget.session.userId;
  late final api=widget.api??TeyzaMobileApi(widget.session);
  final search=TextEditingController();
  Timer? timer;int generation=0;String sessionToken=newAddressSession();
  bool searching=false,resolving=false,accountChanged=false;
  String? error;SellerClaimSelection? selected;List<Map<String,dynamic>> results=[];
  bool get enabled=>widget.enabled&&!accountChanged;
  @override void initState(){super.initState();widget.session.addListener(checkAccount);}
  @override void dispose(){timer?.cancel();generation++;widget.session.removeListener(checkAccount);search.dispose();super.dispose();}
  @override void didUpdateWidget(covariant SellerClaimPicker oldWidget){super.didUpdateWidget(oldWidget);
    if(oldWidget.enabled&&!widget.enabled){timer?.cancel();generation++;searching=false;resolving=false;results=[];}}
  void checkAccount(){if(!mounted||uid==widget.session.userId)return;timer?.cancel();generation++;
    setState((){accountChanged=true;selected=null;results=[];search.clear();});widget.onChanged(null);}
  bool current(int n)=>mounted&&enabled&&uid==widget.session.userId&&n==generation;
  void edited(String value){
    timer?.cancel();generation++;setState((){selected=null;results=[];error=null;searching=false;resolving=false;});widget.onChanged(null);
    if(value.trim().length>=4)timer=Timer(const Duration(milliseconds:450),()=>find(value.trim()));
  }
  Future<void> find(String query) async{
    if(!enabled||query.length<4)return;final n=++generation;setState((){searching=true;error=null;results=[];});
    try{final data=await api.call('seller_claim_suggest',{'query':query,'sessionToken':sessionToken});
      if(current(n))setState((){results=mobileRows(data['suggestions']).where((v)=>v['label'] is String&&v['predictionToken'] is String).toList();
        if(results.isEmpty)error='No business found. Try the shop name and town, or register below.';});
    }catch(e){if(current(n))setState(()=>error=mobileError(e));}
    finally{if(current(n))setState(()=>searching=false);}
  }
  Future<void> choose(Map<String,dynamic> result) async{
    if(!enabled||resolving)return;timer?.cancel();final n=++generation;
    setState((){resolving=true;searching=false;results=[];error=null;});
    try{final data=await api.call('seller_claim_select',{'predictionToken':result['predictionToken']});
      if(!current(n))return;
      final value=SellerClaimSelection.fromJson(Map<String,dynamic>.from(data['claim'] as Map));
      setState((){selected=value;search.text=value.name;});widget.onChanged(value);
      if(mounted)FocusScope.of(context).unfocus();
    }catch(e){if(current(n))setState(()=>error=mobileError(e));}
    finally{if(current(n))setState((){resolving=false;sessionToken=newAddressSession();});}
  }
  @override Widget build(BuildContext context)=>Card(color:Colors.white,child:ExpansionTile(
    title:const Text('Already on Google Maps? Find your business',style:TextStyle(fontWeight:FontWeight.w700)),
    subtitle:const Text('Select your listing to fill in available details.'),
    children:[Padding(padding:const EdgeInsets.fromLTRB(16,0,16,16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      TextField(key:const ValueKey('seller-claim-search'),controller:search,enabled:enabled&&!resolving,onChanged:edited,
        decoration:const InputDecoration(labelText:'Business name and town',prefixIcon:Icon(Icons.search),border:OutlineInputBorder())),
      if(searching||resolving)const LinearProgressIndicator(),
      for(final result in results)ListTile(title:Text(result['label'] as String),leading:const Icon(Icons.storefront_outlined),
        onTap:enabled?()=>choose(result):null),
      if(selected!=null)Padding(padding:const EdgeInsets.only(top:10),child:Text('Selected: ${selected!.name}\n${selected!.displayAddress}',style:const TextStyle(color:Color(0xFF137547)))),
      if(error!=null)Padding(padding:const EdgeInsets.only(top:8),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
      const Padding(padding:EdgeInsets.only(top:10),child:Text('Google Maps',textAlign:TextAlign.right,style:TextStyle(fontSize:12,color:Color(0xFF5E5E5E)))),
      const Text('This requests a link on Teyza. Our team will review your identity and authority to represent the shop.',style:TextStyle(fontSize:12,height:1.4))
    ]))]));
}
