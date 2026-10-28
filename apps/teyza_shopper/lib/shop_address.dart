import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

String newAddressSession() {
  final random=Random.secure(),bytes=List<int>.generate(16,(_)=>random.nextInt(256));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  final hex=bytes.map((b)=>b.toRadixString(16).padLeft(2,'0')).join();
  return '${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}';
}

class ShopAddressSelection {
  final String address,area,city,receipt,placeId;
  final double latitude,longitude;
  const ShopAddressSelection({required this.address,required this.area,required this.city,required this.receipt,
    required this.placeId,required this.latitude,required this.longitude});
  factory ShopAddressSelection.fromJson(Map<String,dynamic> data) {
    final latitude=data['latitude'],longitude=data['longitude'];
    for(final key in ['address','area','city','addressSelection','placeId']) {
      if(data[key] is! String||(data[key] as String).trim().isEmpty)throw StateError('Select a full street address from the suggestions.');
    }
    if(latitude is! num||longitude is! num||!latitude.isFinite||!longitude.isFinite||latitude.abs()>90||longitude.abs()>180||
      (latitude==0&&longitude==0))throw StateError('That address has no usable map position. Select a full street address.');
    return ShopAddressSelection(address:data['address'] as String,area:data['area'] as String,city:data['city'] as String,
      receipt:data['addressSelection'] as String,placeId:data['placeId'] as String,latitude:latitude.toDouble(),longitude:longitude.toDouble());
  }
}

class ShopAddressPicker extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final ValueChanged<ShopAddressSelection?> onChanged;
  final bool enabled;
  final String initialAddress;
  const ShopAddressPicker({super.key,required this.session,required this.onChanged,this.api,this.enabled=true,this.initialAddress=''});
  @override State<ShopAddressPicker> createState()=>_ShopAddressPickerState();
}

class _ShopAddressPickerState extends State<ShopAddressPicker> {
  late final String? uid=widget.session.userId;
  late final input=TextEditingController(text:widget.initialAddress);
  late final TeyzaMobileApi api=widget.api??TeyzaMobileApi(widget.session);
  Timer? timer;
  int generation=0;
  String sessionToken=newAddressSession();
  bool searching=false,resolving=false,accountChanged=false;
  String? error;
  List<Map<String,dynamic>> suggestions=[];
  ShopAddressSelection? selected;
  bool get enabled=>widget.enabled&&!accountChanged;
  @override void initState(){super.initState();widget.session.addListener(checkAccount);}
  @override void dispose(){timer?.cancel();generation++;widget.session.removeListener(checkAccount);input.dispose();super.dispose();}
  @override void didUpdateWidget(covariant ShopAddressPicker oldWidget){
    super.didUpdateWidget(oldWidget);
    if(oldWidget.enabled&&!widget.enabled){timer?.cancel();generation++;searching=false;resolving=false;suggestions=[];}
  }
  void checkAccount(){
    if(!mounted||uid==widget.session.userId)return;
    timer?.cancel();generation++;input.clear();
    setState((){accountChanged=true;selected=null;suggestions=[];searching=false;resolving=false;error=null;});
    widget.onChanged(null);
  }
  bool current(int request)=>mounted&&enabled&&uid==widget.session.userId&&generation==request;
  void edited(String value){
    timer?.cancel();generation++;
    setState((){selected=null;suggestions=[];error=null;searching=false;resolving=false;});widget.onChanged(null);
    final query=value.trim();if(query.length<4)return;
    timer=Timer(const Duration(milliseconds:450),()=>search(query));
  }
  Future<void> search(String query) async {
    if(!enabled||uid!=widget.session.userId||query.length<4)return;
    final request=++generation;setState((){searching=true;error=null;suggestions=[];});
    try{
      final data=await api.call('seller_address_suggest',{'query':query,'sessionToken':sessionToken});
      if(!current(request))return;
      setState((){suggestions=mobileRows(data['suggestions']).where((r)=>r['label'] is String&&r['predictionToken'] is String).toList();
        if(suggestions.isEmpty)error='No full address found. Include the street number and town, then try again.';});
    }catch(e){if(current(request))setState(()=>error=mobileError(e));}
    finally{if(current(request))setState(()=>searching=false);}
  }
  Future<void> choose(Map<String,dynamic> suggestion) async {
    if(!enabled||resolving)return;timer?.cancel();final request=++generation;
    setState((){resolving=true;searching=false;error=null;suggestions=[];selected=null;});widget.onChanged(null);
    try{
      final data=await api.call('seller_address_select',{'predictionToken':suggestion['predictionToken']});
      if(!current(request))return;
      final selection=ShopAddressSelection.fromJson(Map<String,dynamic>.from(data['selection'] as Map));
      setState((){selected=selection;input.text=selection.address;});widget.onChanged(selection);
      if(mounted)FocusScope.of(context).unfocus();
    }catch(e){if(current(request))setState(()=>error=mobileError(e));}
    finally{if(current(request))setState((){resolving=false;sessionToken=newAddressSession();});}
  }
  Future<void> checkMap() async {
    final selection=selected;if(selection==null)return;
    try{
      final opened=await launchUrl(Uri.https('www.google.com','/maps/search/',{'api':'1',
        'query':'${selection.latitude},${selection.longitude}','query_place_id':selection.placeId}),mode:LaunchMode.externalApplication);
      if(!opened)throw StateError('Map unavailable');
    }catch(_){if(mounted)setState(()=>error='Could not open Google Maps. Try again.');}
  }
  @override Widget build(BuildContext context)=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    TextFormField(key:const ValueKey('shop-address-search'),controller:input,enabled:enabled&&!resolving,maxLength:250,
      keyboardType:TextInputType.streetAddress,textInputAction:TextInputAction.search,
      decoration:const InputDecoration(labelText:'Shop street address',hintText:'e.g. 12 Main Road, Durban',
        helperText:'Start with the street number, then select a suggestion.',helperMaxLines:2,errorMaxLines:3,counterText:'',
        prefixIcon:Icon(Icons.location_on_outlined),filled:true,fillColor:Colors.white,border:OutlineInputBorder()),
      onChanged:edited,onFieldSubmitted:(value){timer?.cancel();if(selected==null)search(value.trim());},
      validator:(_)=>selected==null?'Select your full shop address from the suggestions.':null),
    if(searching||resolving)const Padding(padding:EdgeInsets.only(top:8),child:LinearProgressIndicator()),
    if(resolving)const Padding(padding:EdgeInsets.only(top:8),child:Text('Finding the address and map position…')),
    if(suggestions.isNotEmpty)Container(margin:const EdgeInsets.only(top:8),decoration:BoxDecoration(color:Colors.white,
      border:Border.all(color:const Color(0xFFDCE5DD)),borderRadius:BorderRadius.circular(14)),
      child:Column(children:[for(final suggestion in suggestions)ListTile(
        leading:const Icon(Icons.location_on_outlined),title:Text(suggestion['label'] as String),
        onTap:enabled?()=>choose(suggestion):null)])),
    if(selected!=null)Container(margin:const EdgeInsets.only(top:12),padding:const EdgeInsets.all(14),
      decoration:BoxDecoration(color:const Color(0xFFE8F5EC),borderRadius:BorderRadius.circular(14)),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Row(children:[Icon(Icons.check_circle_outline,color:Color(0xFF137547)),SizedBox(width:8),
          Expanded(child:Text('Full address selected',style:TextStyle(fontWeight:FontWeight.w700)))]),
        const SizedBox(height:8),Text(selected!.address),const SizedBox(height:4),Text('${selected!.area} · ${selected!.city}'),
        TextButton.icon(onPressed:enabled?checkMap:null,icon:const Icon(Icons.map_outlined),label:const Text('Check address on Google Maps'))])),
    const Padding(padding:EdgeInsets.fromLTRB(4,10,4,4),child:Align(alignment:Alignment.centerRight,
      child:Text('Google Maps',style:TextStyle(fontSize:12,fontWeight:FontWeight.w400,color:Color(0xFF5E5E5E))))),
    if(error!=null)Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(error!,style:const TextStyle(color:Color(0xFF9A3412))),
      TextButton(onPressed:enabled&&!searching&&!resolving?()=>search(input.text.trim()):null,child:const Text('Retry address search'))]),
  ]);
}
