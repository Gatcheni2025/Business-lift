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

class ShopperDeliveryProfileStore {
  ShopperDeliveryProfileStore({SessionStore? vault}):_vault=vault??SecureSessionStore();
  final SessionStore _vault;
  String _key(String? uid)=>'teyza_delivery_profile_'+(uid??'guest');
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
  late final name=TextEditingController(text:widget.initial?.displayName??widget.session.name??'');
  late final email=TextEditingController(text:widget.session.email?.trim().isNotEmpty==true?
    widget.session.email!:widget.initial?.email??'');
  late final phone=TextEditingController(text:widget.initial?.phone??widget.session.phoneNumber??'');
  bool busy=false;
  bool addressSaved=false;
  double? detectedLatitude,detectedLongitude;
  String? error,notice;
  @override void initState(){super.initState();addressSaved=widget.initial!=null; if(widget.initial==null){WidgetsBinding.instance.addPostFrameCallback((_) { if(mounted) detectAddress(); });}}
  Future<void> detectAddress()async{
    if(busy)return;
    setState((){busy=true;error=null;notice='Detecting your full delivery address…';});
    try{
      if(!await Geolocator.isLocationServiceEnabled())throw StateError('Location is disabled. Enable GPS or enter your address manually.');
      var permission=await Geolocator.checkPermission();
      if(permission==LocationPermission.denied)permission=await Geolocator.requestPermission();
      if(permission==LocationPermission.denied||permission==LocationPermission.deniedForever)throw StateError('Location permission is unavailable. Enter the delivery address manually.');
      final position=await Geolocator.getCurrentPosition(locationSettings:const LocationSettings(accuracy:LocationAccuracy.high,timeLimit:Duration(seconds:18)));
      final places=await placemarkFromCoordinates(position.latitude,position.longitude).timeout(const Duration(seconds:16));
      if(places.isEmpty)throw StateError('Could not detect a full address. Enter or correct the address manually.');
      final p=places.first;
      final components=[p.street,p.subLocality,p.locality,p.administrativeArea,p.postalCode]
        .whereType<String>().map((v)=>v.trim()).where((v)=>v.isNotEmpty).toList();
      final full=components.toSet().join(', ');
      if(full.length<8)throw StateError('The detected address is incomplete. Enter your street and suburb manually.');
      if(!mounted)return;
      setState((){address.text=full;detectedLatitude=position.latitude;detectedLongitude=position.longitude;notice='Confirm the detected address, then save it.';});
    }catch(e){if(mounted)setState(()=>error=e is StateError?e.message.toString():'Automatic location failed. Enter your complete address manually.');}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override void dispose(){
    for(final input in [address,name,email,phone])input.dispose();
    super.dispose();
  }
  Future<void> verifyEmail()async{
    setState(()=>busy=true);
    try{
      if(widget.session.emailVerified){
        setState(()=>notice='Your email is verified.');
      }else{
        await widget.session.sendEmailVerification();
        if(mounted)setState(()=>notice='Verification email sent. Open the link to confirm your address.');
      }
    }catch(e){if(mounted)setState(()=>error=authMessage(e));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> save()async{
    if(!addressSaved){
      if((address.text.trim()).length<8){setState(()=>error='Enter or detect your full street address.');return;}
      setState((){addressSaved=true;error=null;notice=null;});return;
    }
    if(!form.currentState!.validate())return;
    setState((){busy=true;error=null;});
    try{
      final full=address.text.trim();
      final matches=detectedLatitude!=null&&detectedLongitude!=null
        ?<Location>[]:await locationFromAddress(full).timeout(const Duration(seconds:16));
      if(matches.isEmpty&&detectedLatitude==null)throw StateError('Address not found. Add the street, suburb and city.');
      final lat=detectedLatitude??matches.first.latitude,lon=detectedLongitude??matches.first.longitude;
      if(lat==0&&lon==0)throw StateError('Choose a real delivery address.');
      var area='',city='';
      try{
        final places=await placemarkFromCoordinates(lat,lon)
          .timeout(const Duration(seconds:12));
        if(places.isNotEmpty){
          area=places.first.subLocality??places.first.locality??'';
          city=places.first.locality??places.first.administrativeArea??'';
        }
      }catch(_){/* Coordinates still usable when reverse geocoding fails. */}
      final profile=ShopperDeliveryProfile(
        address:full,area:area.isNotEmpty?area:city,city:city,
        displayName:name.text.trim(),email:email.text.trim(),
        phone:phone.text.trim(),latitude:lat,longitude:lon);
      if(!mounted)return;
      Navigator.pop(context,profile);
    }catch(e){
      if(mounted)setState(()=>error=e is StateError?e.message.toString():
        'Could not find that delivery address. Enter the street number, suburb and city.');
    }finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>SafeArea(child:Padding(
    padding:EdgeInsets.fromLTRB(18,12,18,MediaQuery.of(context).viewInsets.bottom+18),
    child:SingleChildScrollView(child:Form(key:form,child:Column(
      mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('Set your delivery address',style:TextStyle(
        fontSize:24,fontWeight:FontWeight.w900)),
      const SizedBox(height:6),
      const Text('Save your street address and contact details so Teyza can find shops close to where orders should arrive.'),
      const SizedBox(height:16),
      if(!addressSaved) ...[
      OutlinedButton.icon(onPressed:busy?null:detectAddress,icon:const Icon(Icons.my_location),label:const Text('Detect my full address')),
      const SizedBox(height:10),
      ],
      if(!addressSaved) TextFormField(key:const ValueKey('shopper-delivery-address'),controller:address,
        enabled:!busy,maxLines:2,keyboardType:TextInputType.streetAddress,
        decoration:const InputDecoration(labelText:'Full delivery street address',
          hintText:'12 Main Road, KwaMashu, Durban',border:OutlineInputBorder()),
        validator:(x)=>(x??'').trim().length<8?'Enter a full street address.':null),
      if(addressSaved) ...[
      Text(address.text,style:const TextStyle(fontWeight:FontWeight.w700)),
      TextButton(onPressed:busy?null:()=>setState((){addressSaved=false;detectedLatitude=null;detectedLongitude=null;}),child:const Text('Change address')),
      const SizedBox(height:12),
      TextFormField(controller:name,enabled:!busy,
        decoration:const InputDecoration(labelText:'Full name',border:OutlineInputBorder()),
        validator:(x)=>(x??'').trim().length<2?'Enter your name.':null),
      const SizedBox(height:12),
      TextFormField(controller:email,enabled:!busy&&widget.session.email==null,
        keyboardType:TextInputType.emailAddress,
        decoration:const InputDecoration(labelText:'Email address',border:OutlineInputBorder()),
        validator:(x){
          final value=(x??'').trim();
          if(!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value))
            return 'Enter a valid email address.';
          if(widget.session.email!=null&&value.toLowerCase()!=widget.session.email!.toLowerCase())
            return 'Use the email linked to your signed-in account.';
          return null;
        }),
      if(widget.session.idToken!=null)
        Row(children:[
          Expanded(child:Text(widget.session.emailVerified?'Email verified':'Email confirmation required',
            style:const TextStyle(fontSize:12))),
          if(!widget.session.emailVerified)
            TextButton(onPressed:busy?null:verifyEmail,child:const Text('Send link')),
        ])
      else const Padding(padding:EdgeInsets.only(top:5),
        child:Text('Email verification is available when you create or sign in to a shopper account.',
          style:TextStyle(fontSize:11))),
      const SizedBox(height:12),
      TextFormField(controller:phone,enabled:!busy,
        keyboardType:TextInputType.phone,
        decoration:const InputDecoration(labelText:'Contact number',
          hintText:'082 123 4567',border:OutlineInputBorder()),
        validator:(x){
          final digits=(x??'').replaceAll(RegExp(r'[^0-9]'),'');
          return digits.length<9||digits.length>15?'Enter a valid phone number.':null;
        }),
      ],
      if(notice!=null)Padding(padding:const EdgeInsets.only(top:8),
        child:Text(notice!,style:const TextStyle(color:Colors.green))),
      if(error!=null)Padding(padding:const EdgeInsets.only(top:8),
        child:Text(error!,style:const TextStyle(color:Colors.red))),
      const SizedBox(height:15),
      SizedBox(width:double.infinity,child:FilledButton.icon(
        onPressed:busy?null:save,icon:const Icon(Icons.place_outlined),
        label:Text(busy?'Working…':addressSaved?'Save contact details and find nearby shops':'Save address and continue'))),
      const SizedBox(height:8),
      const Text('Your address is used to find nearby shops and prefill delivery requests. It is not shared with a seller until you submit an order.',
        style:TextStyle(fontSize:11,color:Colors.black54)),
    ])))));
}
