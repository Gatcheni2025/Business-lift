import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

class SellingArea {
  final String name,city;
  final double lat,lng;
  const SellingArea(this.name,this.city,this.lat,this.lng);
}
// Reference suburb centres for delivery planning, not shop or shopper locations.
const sellingAreas=[
  SellingArea('Durban Central','Durban',-29.8587,31.0218),
  SellingArea('Umlazi','Durban',-29.9733,30.8789),SellingArea('KwaMashu','Durban',-29.7402,30.9920),
  SellingArea('Pinetown','Durban',-29.8145,30.8597),SellingArea('Umhlanga','Durban',-29.7248,31.0826),
  SellingArea('Chatsworth','Durban',-29.9199,30.8911),SellingArea('Phoenix','Durban',-29.7017,31.0040),
  SellingArea('Westville','Durban',-29.8390,30.9250),SellingArea('Newlands East','Durban',-29.7765,30.9860),
  SellingArea('Johannesburg Central','Johannesburg',-26.2041,28.0473),
  SellingArea('Soweto','Johannesburg',-26.2678,27.8585),SellingArea('Alexandra','Johannesburg',-26.1055,28.0970),
  SellingArea('Sandton','Johannesburg',-26.1076,28.0567),SellingArea('Randburg','Johannesburg',-26.0936,28.0064),
  SellingArea('Pretoria Central','Pretoria',-25.7479,28.2293),SellingArea('Mamelodi','Pretoria',-25.7109,28.3547),
  SellingArea('Soshanguve','Pretoria',-25.5225,28.1006),SellingArea('Centurion','Pretoria',-25.8603,28.1894),
  SellingArea('Cape Town Central','Cape Town',-33.9249,18.4241),SellingArea('Khayelitsha','Cape Town',-34.0390,18.6792),
  SellingArea('Mitchells Plain','Cape Town',-34.0486,18.6050),SellingArea('Bellville','Cape Town',-33.9000,18.6333),
  SellingArea('Gqeberha','Gqeberha',-33.9608,25.6022),SellingArea('East London','East London',-33.0153,27.9116),
  SellingArea('Bloemfontein','Bloemfontein',-29.0852,26.1596),SellingArea('Polokwane','Polokwane',-23.9045,29.4689),
  SellingArea('Mbombela','Mbombela',-25.4753,30.9694),SellingArea('Rustenburg','Rustenburg',-25.6676,27.2421),
];
double sellingDistance(SellingArea a,SellingArea b){
  final x=(b.lat-a.lat)*math.pi/180,y=(b.lng-a.lng)*math.pi/180;
  final h=math.sin(x/2)*math.sin(x/2)+math.cos(a.lat*math.pi/180)*math.cos(b.lat*math.pi/180)*math.sin(y/2)*math.sin(y/2);
  return 6371*2*math.asin(math.sqrt(h.clamp(0.0,1.0)));
}
List<SellingArea> nearbySellingAreas(SellingArea base)=>sellingAreas.where((a)=>a!=base&&sellingDistance(base,a)<=35).toList()
  ..sort((a,b)=>sellingDistance(base,a).compareTo(sellingDistance(base,b)));

class SellerAreasPage extends StatefulWidget {
  final String shopAddress;
  final Future<SellingArea> Function()? locate;
  final VoidCallback? onDeliverySettings;
  const SellerAreasPage({super.key,this.shopAddress='',this.locate,this.onDeliverySettings});
  @override State<SellerAreasPage> createState()=>_AreasState();
}
class _AreasState extends State<SellerAreasPage>{
  SellingArea? base;String? error;bool locating=false;
  @override void initState(){super.initState();
    final address=widget.shopAddress.toLowerCase();
    final exact=sellingAreas.where((a)=>address.contains(a.name.toLowerCase()));
    if(exact.isNotEmpty){base=exact.first;}
    else{final cities=sellingAreas.where((a)=>address.contains(a.city.toLowerCase()));if(cities.isNotEmpty)base=cities.first;}
  }
  Future<void> locate() async {
    if(locating)return;setState((){locating=true;error=null;});
    try{
      SellingArea result;
      if(widget.locate!=null){result=await widget.locate!();}
      else{
        if(!await Geolocator.isLocationServiceEnabled())throw StateError('Turn on location services, or choose a base area below.');
        var permission=await Geolocator.checkPermission();
        if(permission==LocationPermission.denied)permission=await Geolocator.requestPermission();
        if(permission!=LocationPermission.always&&permission!=LocationPermission.whileInUse)throw StateError('Location access is off. You can choose your base area below.');
        final p=await Geolocator.getCurrentPosition(locationSettings:const LocationSettings(accuracy:LocationAccuracy.medium,timeLimit:Duration(seconds:15)));
        result=SellingArea('My current location','',p.latitude,p.longitude);
      }
      if(mounted)setState(()=>base=result);
    }catch(e){if(mounted)setState(()=>error=e.toString().replaceFirst('Bad state: ',''));}
    finally{if(mounted)setState(()=>locating=false);}
  }
  Future<void> map(SellingArea area) async {
    try{if(!await launchUrl(Uri.https('www.google.com','/maps/search/',{'api':'1','query':'${area.lat},${area.lng}'}),mode:LaunchMode.externalApplication))throw StateError('Could not open the map.');}
    catch(_){if(mounted)setState(()=>error='Could not open the map. Please try again.');}
  }
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF6F7F2),
    appBar:AppBar(title:const Text('Areas around me')),body:ListView(padding:const EdgeInsets.all(20),children:[
      const Icon(Icons.near_me_outlined,color:Color(0xFF137B54),size:38),const SizedBox(height:12),
      const Text('Grow your local reach',style:TextStyle(fontSize:25,fontWeight:FontWeight.w800)),const SizedBox(height:8),
      const Text('Explore nearby areas and plan deliveries from your shop. This view contains areas, not other shops.'),
      const SizedBox(height:20),FilledButton.icon(onPressed:locating?null:locate,icon:const Icon(Icons.my_location),
        label:Text(locating?'Finding your area…':'Use my location')),
      const SizedBox(height:16),DropdownButtonFormField<SellingArea>(isExpanded:true,
        initialValue:sellingAreas.contains(base)?base:null,
        decoration:const InputDecoration(labelText:'Or choose a base area',border:OutlineInputBorder()),
        items:sellingAreas.map((a)=>DropdownMenuItem(value:a,child:Text('${a.name} · ${a.city}',overflow:TextOverflow.ellipsis))).toList(),
        onChanged:locating?null:(a)=>setState((){base=a;error=null;})),
      if(error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text(error!,style:const TextStyle(color:Color(0xFF9A3412)))),
      if(base!=null)...[
        const SizedBox(height:20),Text('Around ${base!.name}',style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
        const SizedBox(height:7),const Text('Reference areas within 35 km. Distances are straight-line estimates; they do not confirm delivery coverage.'),
        TextButton.icon(onPressed:()=>map(base!),icon:const Icon(Icons.map_outlined),label:const Text('Open area map')),
        if(nearbySellingAreas(base!).isEmpty)const Padding(padding:EdgeInsets.symmetric(vertical:14),child:Text('No reference suburbs are listed within 35 km. Use the map to explore your area.')),
        for(final area in nearbySellingAreas(base!))Card(child:ListTile(leading:const Icon(Icons.location_on_outlined),
          title:Text(area.name),subtitle:Text(area.city),trailing:Text('~${sellingDistance(base!,area).toStringAsFixed(1)} km'),
          onTap:()=>map(area))),
      ],
      if(widget.onDeliverySettings!=null)Padding(padding:const EdgeInsets.only(top:16),child:OutlinedButton.icon(
        onPressed:widget.onDeliverySettings,icon:const Icon(Icons.local_shipping_outlined),label:const Text('Set delivery radius & fee'))),
    ]));
}
