import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

class SellerLocationPage extends StatefulWidget {
  final ShopperSession session;
  final TeyzaMobileApi? api;
  final String shopAddress;
  final Future<({double latitude,double longitude,String area,String city})> Function()? locate;
  const SellerLocationPage({super.key,required this.session,this.api,this.shopAddress='',this.locate});
  @override State<SellerLocationPage> createState()=>_LocationState();
}
class _LocationState extends State<SellerLocationPage> {
  late final String? uid=widget.session.userId;
  late final TeyzaMobileApi api=widget.api??TeyzaMobileApi(widget.session);
  late final address=TextEditingController(text:widget.shopAddress);
  final area=TextEditingController(),city=TextEditingController(),lat=TextEditingController(),lng=TextEditingController();
  bool loading=true,working=false,consent=false,changed=false;String? error;
  @override void initState(){super.initState();widget.session.addListener(accountChanged);load();}
  @override void dispose(){widget.session.removeListener(accountChanged);for(final c in [address,area,city,lat,lng]){c.dispose();}super.dispose();}
  void accountChanged(){if(mounted&&uid!=widget.session.userId){for(final c in [address,area,city,lat,lng]){c.clear();}
    setState((){changed=true;consent=false;error='Your account changed. Close this page and sign in again.';});}}
  Future<void> load() async {
    try{final data=await api.call('seller_location_read');if(!mounted||uid!=widget.session.userId)return;
      final pin=data['location'];address.text=(data['address']??widget.shopAddress).toString();
      if(pin is Map){area.text=(pin['area']??'').toString();city.text=(pin['city']??'').toString();
        lat.text=(pin['latitude']??'').toString();lng.text=(pin['longitude']??'').toString();}
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> locate() async {
    if(loading||working||changed)return;setState((){working=true;error=null;consent=false;});
    try{
      double latitude,longitude;String suburb='',town='';
      if(widget.locate!=null){final p=await widget.locate!();latitude=p.latitude;longitude=p.longitude;suburb=p.area;town=p.city;}
      else{
        if(!await Geolocator.isLocationServiceEnabled())throw StateError('Turn on location services, or enter the shop coordinates below.');
        var permission=await Geolocator.checkPermission();if(permission==LocationPermission.denied)permission=await Geolocator.requestPermission();
        if(permission!=LocationPermission.always&&permission!=LocationPermission.whileInUse)throw StateError('Location access is off. Enter the shop coordinates below or allow location in device settings.');
        final p=await Geolocator.getCurrentPosition(locationSettings:const LocationSettings(accuracy:LocationAccuracy.high,timeLimit:Duration(seconds:20)));
        latitude=p.latitude;longitude=p.longitude;
        try{final places=await placemarkFromCoordinates(latitude,longitude).timeout(const Duration(seconds:6));
          if(places.isNotEmpty){final place=places.first;suburb=place.subLocality??'';town=place.locality??'';}
        }catch(_){/* The pin can be saved after the seller enters the area names. */}
      }
      if(mounted&&uid==widget.session.userId)setState((){
        lat.text=latitude.toStringAsFixed(6);lng.text=longitude.toStringAsFixed(6);
        if(suburb.isNotEmpty)area.text=suburb;if(town.isNotEmpty)city.text=town;
      });
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=e is StateError?e.message.toString():
      'Could not find your location. Try again at your shop or enter the coordinates.');}
    finally{if(mounted)setState(()=>working=false);}
  }
  Future<void> openMap() async {
    final query=double.tryParse(lat.text)!=null&&double.tryParse(lng.text)!=null?'${lat.text},${lng.text}':address.text.trim();
    if(query.isEmpty)return;
    try{if(!await launchUrl(Uri.https('www.google.com','/maps/search/',{'api':'1','query':query}),mode:LaunchMode.externalApplication))throw StateError('Map unavailable');}
    catch(_){if(mounted)setState(()=>error='Could not open the map. Please try again.');}
  }
  Future<void> save() async {
    if(working||loading||changed)return;final latitude=double.tryParse(lat.text.trim()),longitude=double.tryParse(lng.text.trim());
    if(address.text.trim().isEmpty||area.text.trim().isEmpty||city.text.trim().isEmpty||latitude==null||longitude==null||
      !latitude.isFinite||!longitude.isFinite||latitude.abs()>90||longitude.abs()>180||(latitude==0&&longitude==0)||!consent){
      setState(()=>error='Enter the shop address, suburb, city and a valid pin, then confirm that shoppers may see this shop location.');return;}
    setState((){working=true;error=null;});
    try{await api.call('seller_location_save',{'address':address.text.trim(),'area':area.text.trim(),'city':city.text.trim(),
      'latitude':latitude,'longitude':longitude,'consent':true});
      if(mounted&&uid==widget.session.userId){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Shop location saved. Approved shops can appear in nearby results.')));Navigator.pop(context,true);}
    }catch(e){if(mounted&&uid==widget.session.userId)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>working=false);}
  }
  Widget field(TextEditingController c,String label,{bool number=false})=>Padding(padding:const EdgeInsets.only(bottom:14),
    child:TextField(controller:c,enabled:!working&&!changed,keyboardType:number?const TextInputType.numberWithOptions(decimal:true,signed:true):TextInputType.streetAddress,
      decoration:InputDecoration(labelText:label,border:const OutlineInputBorder())));
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF6F7F2),
    appBar:AppBar(title:const Text('Shop location')),body:ListView(padding:const EdgeInsets.all(20),children:[
      const Text('Put your shop on the map',style:TextStyle(fontSize:25,fontWeight:FontWeight.w800)),const SizedBox(height:8),
      const Text('Nearby shoppers use this pin and area to find your approved shop. Planning delivery areas does not save your shop location.'),
      const SizedBox(height:18),if(loading)const LinearProgressIndicator(),
      const Text('Use your current location only when you are at your shop.'),const SizedBox(height:10),
      FilledButton.icon(onPressed:loading||working||changed?null:locate,icon:const Icon(Icons.my_location),label:Text(working?'Please wait…':'Use my shop’s current location')),
      const SizedBox(height:20),field(address,'Shop street address'),field(area,'Suburb / area'),field(city,'Town / city'),
      Row(children:[Expanded(child:field(lat,'Latitude',number:true)),const SizedBox(width:12),Expanded(child:field(lng,'Longitude',number:true))]),
      OutlinedButton.icon(onPressed:working||changed?null:openMap,icon:const Icon(Icons.map_outlined),label:const Text('Check pin on map')),
      CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:working||changed?null:(v)=>setState(()=>consent=v==true),
        title:const Text('This pin is at my shop. Show this business address and location to shoppers.')),
      if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
      const SizedBox(height:12),FilledButton(onPressed:working||loading||changed?null:save,child:const Text('Save shop location')),
    ]));
}
