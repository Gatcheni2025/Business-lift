import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'shopper_auth.dart';

/// Delivery address and contact details belong to the shopper, never a shop.
/// Guest details stay encrypted on this device. Signed-in profiles are also
/// stored server-side under the Firebase UID and cannot revive a deleted UID.
class ShopperDeliveryProfile {
  final String address,area,city,displayName,email,phone;
  final double latitude,longitude;
  const ShopperDeliveryProfile({required this.address,required this.area,
    required this.city,required this.displayName,required this.email,
    required this.phone,required this.latitude,required this.longitude});
  Map<String,dynamic> toJson()=>{'address':address,'area':area,'city':city,
    'displayName':displayName,'email':email,'phone':phone,
    'latitude':latitude,'longitude':longitude};
  factory ShopperDeliveryProfile.fromJson(Map data)=>ShopperDeliveryProfile(
    address:(data['address']??'').toString(),area:(data['area']??'').toString(),
    city:(data['city']??'').toString(),displayName:(data['displayName']??'').toString(),
    email:(data['contactEmail']??data['email']??'').toString(),phone:(data['phone']??'').toString(),
    latitude:(data['latitude'] as num).toDouble(),
    longitude:(data['longitude'] as num).toDouble());
}

/// The device's last confirmed delivery destination is separate from an
/// authenticated shopper profile. Only location is retained after sign-out:
/// never expose another account's name, phone or email to a new user.
class ShopperDeviceDeliveryLocation {
  final String address,area,city;
  final double latitude,longitude;
  const ShopperDeviceDeliveryLocation({required this.address,
    required this.area,required this.city,required this.latitude,
    required this.longitude});
  factory ShopperDeviceDeliveryLocation.fromProfile(ShopperDeliveryProfile p)=>
    ShopperDeviceDeliveryLocation(address:p.address,area:p.area,city:p.city,
      latitude:p.latitude,longitude:p.longitude);
  bool get isValid=>address.trim().length>=8&&
    latitude.isFinite&&longitude.isFinite&&
    latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180&&
    (latitude!=0||longitude!=0);
  Map<String,dynamic> toJson()=>{'address':address,'area':area,'city':city,
    'latitude':latitude,'longitude':longitude};
  static ShopperDeviceDeliveryLocation? fromJson(Map data){
    final lat=data['latitude'],lng=data['longitude'];
    if(lat is! num||lng is! num)return null;
    final location=ShopperDeviceDeliveryLocation(
      address:(data['address']??'').toString(),
      area:(data['area']??'').toString(),
      city:(data['city']??'').toString(),
      latitude:lat.toDouble(),longitude:lng.toDouble());
    return location.isValid?location:null;
  }
}

class ShopperDeliveryProfileStore {
  ShopperDeliveryProfileStore({SessionStore? vault}):_vault=vault??SecureSessionStore();
  final SessionStore _vault;
  String _key(String? uid)=>'teyza_delivery_profile_'+(uid??'guest');
  static const _deviceLocationKey='teyza_last_confirmed_delivery_location';
  Future<ShopperDeviceDeliveryLocation?> loadDeviceLocation()async{
    final value=await _vault.read(_deviceLocationKey);
    if(value==null)return null;
    try{
      final parsed=jsonDecode(value);
      return parsed is Map?ShopperDeviceDeliveryLocation.fromJson(parsed):null;
    }catch(_){return null;}
  }
  Future<void> saveDeviceLocation(ShopperDeliveryProfile profile)async{
    final location=ShopperDeviceDeliveryLocation.fromProfile(profile);
    if(!location.isValid)throw ArgumentError('A complete delivery location is required.');
    await _vault.write(_deviceLocationKey,jsonEncode(location.toJson()));
  }
  Future<void> clearDeviceLocation()=>_vault.delete(_deviceLocationKey);
  Future<ShopperDeliveryProfile?> load(String? uid)async{
    final value=await _vault.read(_key(uid));
    if(value==null)return null;
    try{
      final data=jsonDecode(value);
      return data is Map?ShopperDeliveryProfile.fromJson(data):null;
    }catch(_){return null;}
  }
  Future<void> save(String? uid,ShopperDeliveryProfile profile)=>
    _vault.write(_key(uid),jsonEncode(profile.toJson()));
  Future<void> clear(String? uid)=>_vault.delete(_key(uid));
}

class ShopperDeliveryProfileSheet extends StatefulWidget {
  const ShopperDeliveryProfileSheet({super.key,required this.session,this.initial});
  final ShopperSession session;
  final ShopperDeliveryProfile? initial;
  @override State<ShopperDeliveryProfileSheet> createState()=>_ProfileSheetState();
}
class _ProfileSheetState extends State<ShopperDeliveryProfileSheet>{
  final form=GlobalKey<FormState>();
  late final address=TextEditingController(text:widget.initial?.address??'');
  late final contactName=TextEditingController(text:widget.initial?.displayName??widget.session.name??'');
  late final contactPhone=TextEditingController(text:widget.initial?.phone??widget.session.phoneNumber??'');
  late final contactEmail=TextEditingController(text:widget.initial?.email??widget.session.email??'');
  bool get signedInAccount=>widget.session.userId!=null&&!widget.session.anonymousShopper;
  bool busy=false;
  double? detectedLatitude,detectedLongitude;
  String? error,notice;
  @override void initState(){
    super.initState();
    if(widget.initial==null){
      WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)detectAddress();});
    }
  }
  Future<void> detectAddress()async{
    if(busy)return;
    setState((){busy=true;error=null;notice='Detecting your full delivery address…';});
    try{
      if(!await Geolocator.isLocationServiceEnabled())throw StateError('Enable location or enter your address manually.');
      var permission=await Geolocator.checkPermission();
      if(permission==LocationPermission.denied)permission=await Geolocator.requestPermission();
      if(permission==LocationPermission.denied||permission==LocationPermission.deniedForever)
        throw StateError('Location permission is unavailable. Enter your full address manually.');
      final position=await Geolocator.getCurrentPosition(locationSettings:const LocationSettings(accuracy:LocationAccuracy.high,timeLimit:Duration(seconds:18)));
      final places=await placemarkFromCoordinates(position.latitude,position.longitude).timeout(const Duration(seconds:16));
      if(places.isEmpty)throw StateError('Could not detect an address. Enter your street and suburb.');
      final p=places.first;
      final parts=[p.street,p.subLocality,p.locality,p.administrativeArea,p.postalCode]
        .whereType<String>().map((s)=>s.trim()).where((s)=>s.isNotEmpty).toSet();
      final full=parts.join(', ');
      if(full.length<8)throw StateError('The detected address is incomplete. Enter your street and suburb.');
      if(!mounted)return;
      setState((){address.text=full;detectedLatitude=position.latitude;detectedLongitude=position.longitude;
        notice='Confirm this address, then tap Save address.';});
    }catch(e){if(mounted)setState(()=>error=e is StateError?e.message.toString():'Automatic location failed. Enter your complete address manually.');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override void dispose(){address.dispose();contactName.dispose();contactPhone.dispose();contactEmail.dispose();super.dispose();}
  Future<void> save()async{
    if(!form.currentState!.validate()||busy)return;
    setState((){busy=true;error=null;});
    try{
      final full=address.text.trim();
      final sameAddress=widget.initial?.address.trim()==full;
      final results=detectedLatitude!=null||sameAddress?<Location>[]:
        await locationFromAddress(full).timeout(const Duration(seconds:16));
      if(results.isEmpty&&detectedLatitude==null&&!sameAddress)
        throw StateError('Address not found. Add your street number, suburb and city.');
      final lat=detectedLatitude??(sameAddress?widget.initial!.latitude:results.first.latitude);
      final lon=detectedLongitude??(sameAddress?widget.initial!.longitude:results.first.longitude);
      if(lat==0&&lon==0)throw StateError('Choose a real delivery address.');
      var area='',city='';
      try{
        final places=await placemarkFromCoordinates(lat,lon).timeout(const Duration(seconds:12));
        if(places.isNotEmpty){
          area=places.first.subLocality??places.first.locality??'';
          city=places.first.locality??places.first.administrativeArea??'';
        }
      }catch(_){/* Valid coordinates still work if reverse geocoding fails. */}
      if(!mounted)return;
      Navigator.pop(context,ShopperDeliveryProfile(
        address:full,area:area.isNotEmpty?area:city,city:city,
        displayName:contactName.text.trim(),
        email:contactEmail.text.trim(),
        phone:contactPhone.text.trim(),
        latitude:lat,longitude:lon));
    }catch(e){
      if(mounted)setState(()=>error=e is StateError?e.message.toString():
        'Could not find that delivery address. Enter your street number, suburb and city.');
    }finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>SafeArea(child:Padding(
    padding:EdgeInsets.fromLTRB(18,12,18,MediaQuery.of(context).viewInsets.bottom+18),
    child:SingleChildScrollView(child:Form(key:form,child:Column(
      mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('Set your delivery address',style:TextStyle(fontSize:24,fontWeight:FontWeight.w900)),
        const SizedBox(height:7),
        const Text('Find shops near you without creating an account. You can sign in when you are ready to shop.'),
        if(signedInAccount)...[
          const SizedBox(height:12),
          const Text('Your contact details',style:TextStyle(fontWeight:FontWeight.w800,fontSize:16)),
          const SizedBox(height:8),
          TextFormField(controller:contactName,enabled:!busy,textCapitalization:TextCapitalization.words,
            decoration:const InputDecoration(labelText:'Your full name',border:OutlineInputBorder()),
            validator:(v)=>(v??'').trim().length<2?'Enter your name.':null),
          const SizedBox(height:9),
          TextFormField(controller:contactPhone,enabled:!busy,keyboardType:TextInputType.phone,
            decoration:const InputDecoration(labelText:'Mobile number',hintText:'071 234 5678',border:OutlineInputBorder()),
            validator:(v){final digits=(v??'').replaceAll(RegExp(r'[^0-9]'),'');
              return digits.length<9||digits.length>15?'Enter a valid phone number.':null;}),
          const SizedBox(height:9),
          TextFormField(controller:contactEmail,enabled:!busy,keyboardType:TextInputType.emailAddress,
            decoration:const InputDecoration(labelText:'Email address (optional)',border:OutlineInputBorder(),
              helperText:'No extra email verification for Google, Facebook or Apple users.'),
            validator:(v){final x=(v??'').trim();if(x.isEmpty)return null;
              return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(x)?null:'Enter a valid email or leave it blank.';}),
          const SizedBox(height:10),
          const Text('Saved contact details help shops reach you about orders. Seller SMS verification is separate.',
            style:TextStyle(color:Colors.black54,fontSize:12)),
        ],
        const SizedBox(height:16),
        OutlinedButton.icon(onPressed:busy?null:detectAddress,
          icon:const Icon(Icons.my_location),label:const Text('Use my current location')),
        const SizedBox(height:12),
        TextFormField(key:const ValueKey('shopper-delivery-address'),controller:address,
          enabled:!busy,maxLines:2,keyboardType:TextInputType.streetAddress,
          onChanged:(_){detectedLatitude=null;detectedLongitude=null;},
          decoration:const InputDecoration(labelText:'Full delivery street address',
            hintText:'12 Main Road, KwaMashu, Durban',border:OutlineInputBorder()),
          validator:(v)=>(v??'').trim().length<8?'Enter your full street address.':null),
        if(notice!=null)Padding(padding:const EdgeInsets.only(top:9),
          child:Text(notice!,style:const TextStyle(color:Colors.green))),
        if(error!=null)Padding(padding:const EdgeInsets.only(top:9),
          child:Text(error!,style:const TextStyle(color:Colors.red))),
        const SizedBox(height:16),
        SizedBox(width:double.infinity,child:FilledButton.icon(onPressed:busy?null:save,
          icon:const Icon(Icons.place_outlined),
          label:Text(busy?'Saving…':'Save address & find nearby shops'))),
        const SizedBox(height:9),
        const Text('Email is optional. Your contact details are only shared with a seller when you place an order.',
          style:TextStyle(fontSize:11,color:Colors.black54))
      ])))));
}
