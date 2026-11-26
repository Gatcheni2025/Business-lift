import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

const _forest=Color(0xFF064B43),_mint=Color(0xFFD8F5E7),_violet=Color(0xFF7866D6);
const bool _nativeMapsReady=bool.fromEnvironment('TEYZA_NATIVE_MAPS_READY',defaultValue:false);

class AgentTown {
  final String name,province;
  final double latitude,longitude;
  const AgentTown(this.name,this.province,this.latitude,this.longitude);
}
const agentTowns=<AgentTown>[
  AgentTown('Durban','KwaZulu-Natal',-29.8587,31.0218),
  AgentTown('Umlazi','KwaZulu-Natal',-29.9667,30.8833),
  AgentTown('KwaMashu','KwaZulu-Natal',-29.7500,30.9833),
  AgentTown('Pinetown','KwaZulu-Natal',-29.8167,30.8500),
  AgentTown('Pietermaritzburg','KwaZulu-Natal',-29.6167,30.3833),
  AgentTown('Johannesburg','Gauteng',-26.2041,28.0473),
  AgentTown('Soweto','Gauteng',-26.2485,27.8540),
  AgentTown('Pretoria','Gauteng',-25.7479,28.2293),
  AgentTown('Cape Town','Western Cape',-33.9249,18.4241),
  AgentTown('Gqeberha','Eastern Cape',-33.9608,25.6022),
  AgentTown('Polokwane','Limpopo',-23.9045,29.4689),
  AgentTown('Mbombela','Mpumalanga',-25.4753,30.9694),
  AgentTown('Bloemfontein','Free State',-29.0852,26.1596),
  AgentTown('Mahikeng','North West',-25.8652,25.6442),
  AgentTown('Kimberley','Northern Cape',-28.7282,24.7499),
];
bool agentApproved(Map<String,dynamic>? record)=>record?['status']=='approved';
bool agentShouldOfferMode(Map<String,dynamic>? response,{String? currentUid}){
 final p=response?['profile'] is Map?Map<String,dynamic>.from(response!['profile'] as Map):null;
 return agentApproved(p)&&(currentUid==null||p?['uid']==currentUid);
}
String agentCategoryName(String raw)=>raw=='wholesale'?'Wholesaler':
 raw=='variety'||raw=='business'||raw=='service'||raw=='retail'?'Business':'Spaza / local shop';
String agentVisitStatus(String status)=>switch(status){
 'approved'=>'Admin approved', 'submitted'=>'Awaiting Admin review',
 'needs_changes'=>'Changes requested', 'rejected'=>'Not approved', _=>'In progress'
};
String? ownerWhatsAppLink(String raw,String privateUrl,String shopName){
 var digits=raw.replaceAll(RegExp(r'[^0-9]'),'');
 if(RegExp(r'^0[0-9]{9}$').hasMatch(digits))digits='27'+digits.substring(1);
 if(!RegExp(r'^27[0-9]{9}$').hasMatch(digits))return null;
 final message='Hello. As agreed during our visit to '+shopName+
 ', please download Teyza from Google Play: https://play.google.com/store/apps/details?id=com.asiyedriver.asiye or the App Store: https://apps.apple.com/za/app/id6827037733. '+
 'Register or sign in as the business owner using your own account, then personally confirm our visit: '+
 privateUrl+'. Registration is free. Admin reviews verification before selling. Do not share OTPs or passwords.';
 return Uri.https('wa.me','/'+digits,{'text':message}).toString();
}

class AgentWorkspacePage extends StatefulWidget {
 final ShopperSession session;
 final VoidCallback onShopper;
 final VoidCallback onSeller;
 final TeyzaMobileApi? mobileApi;
 const AgentWorkspacePage({super.key,required this.session,required this.onShopper,
   required this.onSeller,this.mobileApi});
 @override State<AgentWorkspacePage> createState()=>_AgentWorkspaceState();
}
class _AgentWorkspaceState extends State<AgentWorkspacePage>{
 TeyzaMobileApi get service=>widget.mobileApi??TeyzaMobileApi(widget.session);
 final _phone=TextEditingController();
 Map<String,dynamic>? profile,visit;
 List<Map<String,dynamic>> registered=[],google=[],leads=[],visits=[];
 int page=4,request=0;
 String? nextVisit,nextReward;
 int rewardCount=0,rewardCents=0;
 bool rewardsReady=false,rewardsPartial=false;
 String rewardError='';
 String category='all',error='',message='',reference='';
 AgentTown area=agentTowns.first;
 double latitude=-29.8587,longitude=31.0218;
 bool loading=true,busy=false,ownerConsent=false,photoConsent=false;
 bool registeredOnly=false;
 @override void initState(){super.initState();widget.session.addListener(_sessionChanged);_load();}
 @override void dispose(){widget.session.removeListener(_sessionChanged);_phone.dispose();super.dispose();}
 void _sessionChanged(){
   if(widget.session.userId==null){widget.onShopper();return;}
   if(!mounted)return;
 }
 Future<void> _operate(Future<void> Function() fn)async{
   if(busy)return;setState(()=>busy=true);
   try{await fn();if(mounted)setState(()=>error='');}
   catch(e){if(mounted)setState(()=>error=mobileError(e));}
   finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> _load()async{
   final uid=widget.session.userId,ticket=++request;
   try{
     final data=await service.call('agent_profile');
     if(!mounted||ticket!=request||widget.session.userId!=uid)return;
     final p=data['profile'] is Map?Map<String,dynamic>.from(data['profile'] as Map):null;
     if(!agentShouldOfferMode({'profile':p},currentUid:uid)){setState((){profile=p;loading=false;error='Your field-agent account is not approved. Contact Teyza Admin.';});return;}
     setState((){profile=p;loading=false;error='';});
     try{await _refreshDashboard();}
     catch(e){if(mounted&&widget.session.userId==uid)setState(()=>error=mobileError(e));}
   }catch(e){if(mounted&&ticket==request)setState((){loading=false;error=mobileError(e);});}
 }
 Future<void> _search()async{
   final uid=widget.session.userId,ticket=++request;
   final result=await service.call('agent_nearby',{
    'latitude':latitude,'longitude':longitude,'radiusMeters':5000,'category':category});
   if(!mounted||uid!=widget.session.userId||ticket!=request)return;
   setState((){
    google=mobileRows(result['google']);registered=mobileRows(result['registered']);
    leads=mobileRows(result['leads']);message=result['warning']?.toString()??'';
   });
 }
 Future<void> _loadVisits({bool more=false})async{
   final uid=widget.session.userId,cursor=more?nextVisit:null;
   if(more&&cursor==null)return;
   final result=await service.call('agent_visits',{if(cursor!=null)'after':cursor});
   if(mounted&&widget.session.userId==uid)setState((){
     final rows=mobileRows(result['visits']);
     visits=more?[...visits,...rows.where((v)=>!visits.any((old)=>old['id']==v['id']))]:rows;
     nextVisit=result['next'] is String?result['next'] as String:null;
   });
 }
 Future<void> _loadRewards({bool more=false})async{
   final uid=widget.session.userId,cursor=more?nextReward:null;
   if(more&&cursor==null)return;
   try{
     final result=await service.call('agent_rewards',{if(cursor!=null)'after':cursor});
     if(!mounted||widget.session.userId!=uid)return;
     if(result['approvedPendingPaymentCents'] is! num||result['approvedCount'] is! num)
       throw StateError('Reward summary unavailable');
     setState((){
       rewardCents=(more?rewardCents:0)+(result['approvedPendingPaymentCents'] as num).toInt();
       rewardCount=(more?rewardCount:0)+(result['approvedCount'] as num).toInt();
       nextReward=result['next'] is String?result['next'] as String:null;
       rewardsPartial=result['partial']==true||nextReward!=null;
       rewardsReady=true;rewardError='';
     });
   }catch(_){
     if(mounted&&widget.session.userId==uid)setState((){
       if(!more)rewardsReady=false;
       rewardError='Could not verify rewards. Refresh to try again.';
     });
   }
 }
 Future<void> _refreshDashboard()async{
   await Future.wait([_loadVisits(),_loadRewards()]);
 }
 Future<void> _selectTown(AgentTown town)async{
   setState((){area=town;latitude=town.latitude;longitude=town.longitude;});
   await _operate(_search);
 }
 Future<void> _currentArea()async{
   await _operate(()async{
    final enabled=await Geolocator.isLocationServiceEnabled();
    if(!enabled)throw StateError('Turn on location services or choose a town.');
    var permission=await Geolocator.checkPermission();
    if(permission==LocationPermission.denied)permission=await Geolocator.requestPermission();
    if(permission==LocationPermission.denied||permission==LocationPermission.deniedForever)
      throw StateError('Location permission is needed only while finding or visiting shops. You can choose a town instead.');
    final pos=await Geolocator.getCurrentPosition(desiredAccuracy:LocationAccuracy.high)
      .timeout(const Duration(seconds:20));
    if(!mounted)return;
    setState((){latitude=pos.latitude;longitude=pos.longitude;});
    await _search();
   });
 }
 Map<String,dynamic>? get selectedVisit=>visit;
 Future<void> _reloadVisit(String visitId)async{
   final uid=widget.session.userId;
   final result=await service.call('agent_visit_get',{'visitId':visitId});
   if(mounted&&uid==widget.session.userId)setState((){
     visit=Map<String,dynamic>.from(result['visit'] as Map);page=2;ownerConsent=false;
   });
 }
 Future<void> _openVisit(Map<String,dynamic> value)async{
   await _operate(()=>_reloadVisit(value['id'].toString()));
 }
 Future<void> _startVisit(Map<String,dynamic>? listing)async{
  final name=TextEditingController(text:listing?['name']?.toString()??'');
  final address=TextEditingController(text:listing?['address']?.toString()??'');
  final suburb=TextEditingController(text:area.name);
  var checked=false;
  final id='visit_'+DateTime.now().microsecondsSinceEpoch.toString()+'_'+Random.secure().nextInt(99999999).toString();
  try{
   await showModalBottomSheet<void>(context:context,isScrollControlled:true,showDragHandle:true,
    builder:(ctx)=>StatefulBuilder(builder:(ctx,setSheet)=>Padding(
     padding:EdgeInsets.fromLTRB(20,12,20,MediaQuery.viewInsetsOf(ctx).bottom+22),
     child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('Invite a business owner',style:TextStyle(fontSize:23,fontWeight:FontWeight.w800,color:_forest)),
      const SizedBox(height:8),
      const Text('Invite a spaza shop or any eligible local business. Record the visit with permission; the owner registers on their own account.'),
      const SizedBox(height:14),TextField(controller:name,decoration:const InputDecoration(labelText:'Shop / business name',border:OutlineInputBorder())),
      const SizedBox(height:12),TextField(controller:address,decoration:const InputDecoration(labelText:'Full street address',border:OutlineInputBorder())),
      const SizedBox(height:12),TextField(controller:suburb,decoration:const InputDecoration(labelText:'Town or suburb',border:OutlineInputBorder())),
      const SizedBox(height:8),CheckboxListTile(contentPadding:EdgeInsets.zero,
       title:const Text('The owner permits this visit and the shop photos.'),
       value:checked,onChanged:(v)=>setSheet(()=>checked=v??false)),
      FilledButton.icon(onPressed:checked&&!busy?()async{
       if(name.text.trim().length<2||address.text.trim().length<12||suburb.text.trim().isEmpty){ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content:Text('Enter the full shop details.')));return;}
       try{
        final result=await service.call('agent_visit_start',{'requestId':id,
         'shopName':name.text.trim(),'address':address.text.trim(),
         'area':suburb.text.trim(),'province':area.province,'ownerPermission':true});
        if(!ctx.mounted)return;
        Navigator.pop(ctx);
        await _openVisit(Map<String,dynamic>.from(result['visit'] as Map));
        await _loadVisits();
       }catch(e){if(ctx.mounted)ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content:Text(mobileError(e))));}
      }:null,icon:const Icon(Icons.camera_alt_outlined),label:const Text('Start owner registration visit')),
     ]))),
    ));
  }finally{name.dispose();address.dispose();suburb.dispose();}
 }
 Future<void> _gps()async{
  await _operate(()async{
   final v=visit;if(v==null)return;
   final enabled=await Geolocator.isLocationServiceEnabled();
   if(!enabled)throw StateError('Enable location while you are physically at this shop.');
   var permission=await Geolocator.checkPermission();
   if(permission==LocationPermission.denied)permission=await Geolocator.requestPermission();
   if(permission==LocationPermission.denied||permission==LocationPermission.deniedForever)throw StateError('Allow location access at the shop.');
   final pos=await Geolocator.getCurrentPosition(desiredAccuracy:LocationAccuracy.best)
     .timeout(const Duration(seconds:25));
   if(pos.accuracy>100)throw StateError('GPS accuracy is over 100 metres. Move outside and try again.');
   await service.call('agent_location',{'visitId':v['id'],'revision':v['revision'],
    'latitude':pos.latitude,'longitude':pos.longitude,'accuracy':pos.accuracy,
    'capturedAt':pos.timestamp.millisecondsSinceEpoch});
   await _reloadVisit(v['id'].toString());
  });
 }
 Future<void> _photo(String kind)async{
  await _operate(()async{
   final v=visit;if(v==null)return;
   if(v['location']==null)throw StateError('Capture your live shop location before taking pictures.');
   // Begin an expiring server challenge before opening the device camera.
   final challenge=await service.call('agent_capture_begin',{'visitId':v['id'],'kind':kind});
   final snap=await ImagePicker().pickImage(source:ImageSource.camera,maxWidth:1200,imageQuality:80);
   if(snap==null)return;
   try{
    final bytes=await snap.readAsBytes();
    if(bytes.length>6500000)throw StateError('Photo is too large. Retake the picture.');
    if(widget.session.idToken==null)throw StateError('Session expired.');
    if(!mounted)return;
    final allowed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
     title:Text(kind=='shop'?'Confirm shop photo':'Confirm in-shop selfie'),
     content:Text('Captured for private Admin review. Show the shop signage or shop interior. Visit code: '+(challenge['nonce']?.toString()??'')),
     actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Retake later')),
      FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Save private photo'))]));
    if(allowed!=true)return;
    await service.call('agent_photo_submit',{'visitId':v['id'],
     'captureId':challenge['captureId'],'imageBase64':base64Encode(bytes),'consent':true});
    await _reloadVisit(v['id'].toString());
   }finally{try{await File(snap.path).delete();}catch(_){}}
  });
 }
 Future<void> _sendInvite()async{
  final v=visit;if(v==null)return;
  await _operate(()async{
    if(!ownerConsent)throw StateError('The owner must first agree to the WhatsApp invitation.');
    final digits=_phone.text;
    if(ownerWhatsAppLink(digits,'https://teyza.co.za/owner-confirm.html#placeholder',v['shopName']?.toString()??'business')==null)
      throw StateError('Enter a South African WhatsApp number, e.g. 082 123 4567.');
    final result=await service.call('agent_owner_link',{'visitId':v['id']});
    final url=result['url']?.toString()??'';
    if(!url.startsWith('https://teyza.co.za/owner-confirm.html#'))throw StateError('Invalid owner confirmation link.');
    final link=ownerWhatsAppLink(digits,url,v['shopName']?.toString()??'shop')!;
    if(!await launchUrl(Uri.parse(link),mode:LaunchMode.externalApplication))
     throw StateError('Could not open WhatsApp. Copy the private link and share with the consenting owner.');
    _phone.clear();
    if(mounted)setState((){ownerConsent=false;message='WhatsApp opened. The owner must send/receive and personally confirm; nothing is automatically verified.';});
  });
 }
 Future<void> _submit()async{
  await _operate(()async{
   final v=visit;if(v==null)return;
   await service.call('agent_visit_submit',{'visitId':v['id'],'revision':v['revision']});
   await _reloadVisit(v['id'].toString());await _loadVisits();
  });
 }
 Future<void> _directions(Map<String,dynamic> row)async{
  final lat=(row['latitude'] as num?)?.toDouble(),lon=(row['longitude'] as num?)?.toDouble();
  if(lat==null||lon==null)return;
  final uri=Uri.https('www.google.com','/maps/dir/',{'api':'1','destination':lat.toString()+','+lon.toString(),'travelmode':'driving'});
  await launchUrl(uri,mode:LaunchMode.externalApplication);
 }
 List<Map<String,dynamic>> get opportunities=>[...google,...leads];
 Color _pinColor(Map<String,dynamic> row)=>row['status']=='registered'?const Color(0xFF1B9E72):
 row['shopCategory']=='wholesale'?_violet:
 row['shopCategory']=='variety'||row['shopCategory']=='business'?const Color(0xFFFFA443):const Color(0xFF4A8DE0);
 double _pinHue(Map<String,dynamic> row)=>row['status']=='registered'?BitmapDescriptor.hueGreen:
 row['shopCategory']=='wholesale'?BitmapDescriptor.hueViolet:
 row['shopCategory']=='variety'?BitmapDescriptor.hueOrange:BitmapDescriptor.hueAzure;
 Widget _mapPane(){
  final rows=[...registered.map((x)=>{...x,'status':'registered'}),...opportunities];
  if(!_nativeMapsReady)return Container(key:const ValueKey('agent-maps-setup'),
   height:250,decoration:BoxDecoration(color:const Color(0xFFEAF1FA),borderRadius:BorderRadius.circular(22)),
   child:Center(child:SingleChildScrollView(padding:const EdgeInsets.all(16),child:Column(mainAxisSize:MainAxisSize.min,children:[
    const Icon(Icons.map_outlined,size:42,color:_forest),const SizedBox(height:8),
    const Text('Shop search and directions are ready',textAlign:TextAlign.center,style:TextStyle(fontSize:16,fontWeight:FontWeight.w800,color:_forest)),
    const SizedBox(height:7),const Text('The interactive map requires mobile Maps SDK keys. Use the live shop list and tap Directions meanwhile.',textAlign:TextAlign.center,style:TextStyle(fontSize:12)),
   ]))));
  final pins=<Marker>{};
  for(var i=0;i<rows.length;i++){
   final row=rows[i],lat=(row['latitude'] as num?)?.toDouble(),lon=(row['longitude'] as num?)?.toDouble();
   if(lat==null||lon==null)continue;
   pins.add(Marker(markerId:MarkerId('agent-'+i.toString()),
    position:LatLng(lat,lon),icon:BitmapDescriptor.defaultMarkerWithHue(_pinHue(row)),
    infoWindow:InfoWindow(title:row['name']?.toString()??'Shop',
     snippet:row['status']=='registered'?'Registered on Teyza':'Potential lead — verify with owner',
     onTap:()=>_directions(row)),onTap:()=>setState(()=>reference=row['name']?.toString()??'')));
  }
  return ClipRRect(borderRadius:BorderRadius.circular(22),child:SizedBox(height:320,
   child:GoogleMap(initialCameraPosition:CameraPosition(target:LatLng(latitude,longitude),zoom:12),
    markers:pins,myLocationButtonEnabled:false,zoomControlsEnabled:false,
    mapToolbarEnabled:true,compassEnabled:true,onMapCreated:(map)=>map.moveCamera(CameraUpdate.newLatLngZoom(LatLng(latitude,longitude),12)))));
 }
 Widget _shopCard(Map<String,dynamic> row,{bool alreadyRegistered=false}){
  final distance=(row['distanceMeters'] as num?)?.toDouble();
  return Card(elevation:0,margin:const EdgeInsets.only(bottom:9),color:Colors.white,
   shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(16),side:const BorderSide(color:Color(0xFFE6EDEB))),
   child:Padding(padding:const EdgeInsets.all(12),child:Row(children:[
    Container(width:48,height:48,decoration:BoxDecoration(color:_pinColor(row).withOpacity(.13),borderRadius:BorderRadius.circular(13)),
     child:Icon(alreadyRegistered?Icons.verified_outlined:Icons.storefront_outlined,color:_pinColor(row))),
    const SizedBox(width:10),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Text(row['name']?.toString()??'Local shop',maxLines:1,overflow:TextOverflow.ellipsis,
       style:const TextStyle(fontWeight:FontWeight.w800)),
     Text(row['address']?.toString()??'Address to confirm',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:12)),
     Text(alreadyRegistered?'Verified Teyza listing':row['possibleTeyzaMatch']==true?
       'Possible match — check with Admin':agentCategoryName(row['shopCategory']?.toString()??'spaza')+
       (distance==null?'':' · '+(distance/1000).toStringAsFixed(1)+' km'),
       style:TextStyle(fontSize:11,fontWeight:FontWeight.w700,color:alreadyRegistered?_forest:Colors.deepOrange)),
     Wrap(spacing:6,runSpacing:4,children:[
       TextButton.icon(onPressed:()=>_directions(row),icon:const Icon(Icons.directions_outlined,size:16),label:const Text('Directions')),
       if(!alreadyRegistered&&row['possibleTeyzaMatch']!=true)
        TextButton.icon(onPressed:()=>_startVisit(row),icon:const Icon(Icons.add_circle_outline,size:17),label:const Text('Visit & register')),
     ])
    ]))
   ])));
 }
 Widget _header(){
  return Container(padding:const EdgeInsets.fromLTRB(20,18,20,14),
   decoration:const BoxDecoration(gradient:LinearGradient(colors:[Color(0xFF083D40),Color(0xFF147D70)],begin:Alignment.topLeft,end:Alignment.bottomRight)),
   child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Row(children:[const Icon(Icons.store_mall_directory_outlined,color:Color(0xFFC4F5D2)),
     const SizedBox(width:8),const Expanded(child:Text('TEYZA · FIELD TEAM',style:TextStyle(color:Colors.white,fontSize:14,fontWeight:FontWeight.w800))),
     PopupMenuButton<String>(icon:const Icon(Icons.switch_account_outlined,color:Colors.white),
      onSelected:(mode){if(mode=='shopper')widget.onShopper();else if(mode=='seller')widget.onSeller();},
      itemBuilder:(_)=>[const PopupMenuItem(value:'shopper',child:Text('Shopper mode')),const PopupMenuItem(value:'seller',child:Text('Seller mode'))])]),
    const SizedBox(height:18),
    Text('Hello, '+(profile?['name']?.toString().split(' ').first??'Agent'),
       style:const TextStyle(color:Colors.white,fontSize:27,fontWeight:FontWeight.w800)),
    const Text('Connect businesses. Grow your community.',style:TextStyle(color:Color(0xFFD7F7E8),fontSize:13)),
    const SizedBox(height:14),
    Container(padding:const EdgeInsets.all(11),decoration:BoxDecoration(color:Colors.white.withOpacity(.13),borderRadius:BorderRadius.circular(14)),
     child:const Row(children:[Icon(Icons.shield_outlined,color:Colors.white),SizedBox(width:10),
      Expanded(child:Text('R90 per qualifying new verified business · no automatic payout',style:TextStyle(color:Colors.white,fontSize:11,fontWeight:FontWeight.w700)))])),
   ]));
 }
 Widget _dashboard(){
   final submitted=visits.where((v)=>v['status']=='submitted').length;
   final confirmed=visits.where((v)=>v['ownerConfirmed']==true).length;
   return RefreshIndicator(onRefresh:()=>_operate(_refreshDashboard),child:ListView(
    key:const ValueKey('agent-dashboard'),padding:const EdgeInsets.fromLTRB(16,16,16,30),children:[
     Container(padding:const EdgeInsets.all(20),decoration:BoxDecoration(
       color:_forest,borderRadius:BorderRadius.circular(24)),
       child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        const Text('APPROVED REWARDS',style:TextStyle(color:Color(0xFFC4F5D2),fontSize:11,fontWeight:FontWeight.w800,letterSpacing:1.5)),
        const SizedBox(height:8),
        Text(rewardsReady?'R'+(rewardCents/100).toStringAsFixed(2):'Unavailable',
          key:const ValueKey('agent-approved-rewards'),
          style:const TextStyle(color:Colors.white,fontSize:32,fontWeight:FontWeight.w900)),
        const SizedBox(height:5),
        Text(rewardsReady?'$rewardCount verified registrations · awaiting payment':'Refresh to check your approved rewards',
          style:const TextStyle(color:Colors.white,fontSize:12)),
        if(rewardsPartial)const Padding(padding:EdgeInsets.only(top:6),
          child:Text('Loaded rewards only. More records are available.',style:TextStyle(color:Colors.white,fontSize:11))),
        if(rewardError.isNotEmpty)Text(rewardError,style:const TextStyle(color:Colors.white,fontSize:12)),
        if(nextReward!=null)TextButton(onPressed:busy?null:()=>_operate(()=>_loadRewards(more:true)),
          child:const Text('Load more rewards',style:TextStyle(color:Colors.white))),
       ])),
     const SizedBox(height:12),
     Row(children:[
       Expanded(child:_metric('Visits loaded',visits.length)),
       const SizedBox(width:8),Expanded(child:_metric('Owner confirmed',confirmed)),
       const SizedBox(width:8),Expanded(child:_metric('Awaiting review',submitted)),
     ]),
     if(nextVisit!=null)const Text('More visits available in My visits.',style:TextStyle(fontSize:11)),
     const SizedBox(height:18),
     FilledButton.icon(key:const ValueKey('agent-invite-business'),
       onPressed:busy?null:()=>_startVisit(null),icon:const Icon(Icons.person_add_alt_1_outlined),
       label:const Text('Invite a business owner'),style:FilledButton.styleFrom(minimumSize:const Size.fromHeight(54))),
     const SizedBox(height:8),
     OutlinedButton.icon(key:const ValueKey('agent-find-opportunities'),onPressed:busy?null:()async{
       setState(()=>page=0);await _operate(_search);},
       icon:const Icon(Icons.map_outlined),label:const Text('Find shops & businesses on the map')),
     const SizedBox(height:16),
     const Text('How you earn R90',style:TextStyle(color:_forest,fontSize:18,fontWeight:FontWeight.w800)),
     const SizedBox(height:8),
     const Text('1. Visit a new shop or business with permission.\n2. Invite the owner to register using their own account.\n3. Complete owner confirmation and private visit evidence.\n4. Teyza reviews the registration and your work. Each qualifying verified seller earns one R90 reward. No overall referral cap.',
       style:TextStyle(fontSize:13,height:1.5)),
     const SizedBox(height:14),
     const Text('Rewards awaiting payment are not bank transfers. Never collect owner passwords, OTPs or banking details.',
       style:TextStyle(fontSize:12,color:Color(0xFF657D7A),height:1.5)),
   ]));
 }
 Widget _metric(String label,int value)=>Container(
   constraints:const BoxConstraints(minHeight:95),
   padding:const EdgeInsets.all(10),decoration:BoxDecoration(color:Colors.white,
     borderRadius:BorderRadius.circular(14),border:Border.all(color:const Color(0xFFE2ECE9))),
   child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Text(value.toString(),style:const TextStyle(fontSize:22,fontWeight:FontWeight.w800,color:_forest)),
     const SizedBox(height:5),Text(label,style:const TextStyle(fontSize:10,height:1.2)),
   ]));
 Widget _explore(){
  final rows=registeredOnly?registered:opportunities;
  return RefreshIndicator(onRefresh:()=>_search(),child:ListView(padding:const EdgeInsets.all(16),children:[
   Text('Find shops near you',style:Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight:FontWeight.w800,color:_forest)),
   const SizedBox(height:4),const Text('Choose an area, view verified shops and contact new owners only with permission.'),
   const SizedBox(height:12),
   DropdownButtonFormField<AgentTown>(isExpanded:true,value:agentTowns.contains(area)?area:agentTowns.first,
    decoration:InputDecoration(labelText:'Area / town',prefixIcon:const Icon(Icons.place_outlined),border:OutlineInputBorder(borderRadius:BorderRadius.circular(14))),
    items:agentTowns.map((t)=>DropdownMenuItem(value:t,child:Text(t.name+' · '+t.province,maxLines:1,overflow:TextOverflow.ellipsis))).toList(),
    onChanged:(value){if(value!=null)_selectTown(value);}),
   const SizedBox(height:8),
   Row(children:[Expanded(child:OutlinedButton.icon(onPressed:busy?null:_currentArea,icon:const Icon(Icons.my_location),label:const Text('My location'))),
    const SizedBox(width:8),Expanded(child:OutlinedButton.icon(onPressed:busy?null:()=>_operate(_search),icon:const Icon(Icons.refresh),label:const Text('Refresh shops')))]),
   const SizedBox(height:8),
   SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[
    for(final entry in const <String,String>{'all':'All','spaza':'Spaza','variety':'Businesses','wholesale':'Wholesalers'}.entries)
     Padding(padding:const EdgeInsets.only(right:6),child:ChoiceChip(label:Text(entry.value),selected:category==entry.key,
      onSelected:(_){setState(()=>category=entry.key);_operate(_search);})),
   ])),
   const SizedBox(height:10),_mapPane(),const SizedBox(height:13),
   Row(children:[Expanded(child:Text(registeredOnly?'Registered on Teyza':'Potential onboarding leads',
     style:const TextStyle(fontSize:17,fontWeight:FontWeight.w800,color:_forest))),
     TextButton(onPressed:()=>setState(()=>registeredOnly=!registeredOnly),child:Text(registeredOnly?'Show Google leads':'See registered'))]),
   if(message.isNotEmpty)Text(message,style:const TextStyle(fontSize:12,color:Colors.orange)),
   if(rows.isEmpty)const Padding(padding:EdgeInsets.all(22),child:Text('No shops loaded in this area. Try another town or refresh. This does not mean none exist.')),
   for(final row in rows.take(60))_shopCard(row,alreadyRegistered:registeredOnly),
   const SizedBox(height:90),
  ]));
 }
 Widget _visits(){
  return RefreshIndicator(onRefresh:()=>_operate(_refreshDashboard),child:ListView(padding:const EdgeInsets.all(16),children:[
    Row(children:[const Expanded(child:Text('Your business visits',style:TextStyle(fontSize:24,fontWeight:FontWeight.w800,color:_forest))),
      TextButton.icon(onPressed:()=>_startVisit(null),icon:const Icon(Icons.add),label:const Text('Invite owner'))]),
    const Text('Only Admin-approved registrations qualify for a R90 reward. A visit alone is not a payment.'),
    const SizedBox(height:14),
    if(visits.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(24),child:Text('No visits yet. Choose a shop on the Explore map, or create a visit with the owner.'))),
    for(final v in visits)Card(child:ListTile(
      leading:const Icon(Icons.storefront_outlined,color:_forest),
      title:Text(v['shopName']?.toString()??'Shop'),
      subtitle:Text((v['area']?.toString()??'')+' · '+agentVisitStatus(v['status']?.toString()??'')),
      trailing:const Icon(Icons.chevron_right),onTap:()=>_openVisit(v))),
    if(nextVisit!=null) OutlinedButton(onPressed:busy?null:()=>_operate(()=>_loadVisits(more:true)),child:const Text('Load more visits')),
    const SizedBox(height:90),
  ]));
 }
 Widget _step(String title,String note,bool done,Widget? control){
  return Container(margin:const EdgeInsets.only(bottom:12),padding:const EdgeInsets.all(14),
   decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(16),border:Border.all(color:done?const Color(0xFFB1E6C4):const Color(0xFFE2ECE9))),
   child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Row(children:[Icon(done?Icons.check_circle:Icons.radio_button_unchecked,color:done?_forest:_violet),
      const SizedBox(width:8),Expanded(child:Text(title,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:15)))]),
    const SizedBox(height:6),Text(note,style:const TextStyle(fontSize:12)),
    if(control!=null)Padding(padding:const EdgeInsets.only(top:10),child:control),
   ]));
 }
 Widget _visitDetails(){
  final v=visit;if(v==null)return const Center(child:Text('Select a visit'));
  final photos=v['photos'] is Map?Map<String,dynamic>.from(v['photos'] as Map):<String,dynamic>{};
  final isEditable=['draft','needs_changes'].contains(v['status']);
  final gps=v['location']!=null,shop=photos['shop']!=null,selfie=photos['selfie']!=null,confirmed=v['ownerConfirmed']==true;
  return ListView(padding:const EdgeInsets.all(16),children:[
   TextButton.icon(onPressed:()=>setState(()=>page=1),icon:const Icon(Icons.arrow_back),label:const Text('My visits')),
   Text(v['shopName']?.toString()??'Visit',style:const TextStyle(fontSize:25,fontWeight:FontWeight.w800,color:_forest)),
   Text((v['address']?.toString()??'')+' · '+agentVisitStatus(v['status']?.toString()??'')),
   const SizedBox(height:16),
   _step('1 · Check in at the shop','Capture accurate GPS while at the owner’s premises.',gps,
      isEditable?FilledButton.icon(onPressed:busy?null:_gps,icon:const Icon(Icons.my_location),label:Text(gps?'Retake GPS':'Capture GPS')):null),
   _step('2 · Photograph the shop','Show its storefront and identifying signage.',shop,
      isEditable&&gps?FilledButton.icon(onPressed:busy?null:()=>_photo('shop'),icon:const Icon(Icons.camera_alt),label:Text(shop?'Retake shop photo':'Take shop photo')):null),
   _step('3 · In-shop agent selfie','Private reviewer evidence; the owner must consent to people visible in photos.',selfie,
      isEditable&&gps?FilledButton.icon(onPressed:busy?null:()=>_photo('selfie'),icon:const Icon(Icons.camera_front),label:Text(selfie?'Retake selfie':'Take selfie')):null),
   _step('4 · Invite owner to confirm','The owner downloads Teyza, registers or signs into their own seller account, then confirms your private link. Never request an OTP.',confirmed,
     isEditable&&!confirmed?Column(children:[
       TextField(controller:_phone,keyboardType:TextInputType.phone,decoration:const InputDecoration(labelText:'Owner WhatsApp number',border:OutlineInputBorder(),hintText:'082 123 4567')),
       CheckboxListTile(contentPadding:EdgeInsets.zero,title:const Text('Owner asked me to send the invitation'),value:ownerConsent,onChanged:(v)=>setState(()=>ownerConsent=v??false)),
       FilledButton.icon(onPressed:busy?null:_sendInvite,icon:const Icon(Icons.message),label:const Text('Open WhatsApp invitation')),
     ]):null),
   _step('5 · Submit for Admin review','Admin verifies both the owner’s new seller account and your evidence before a R90 reward can be approved.',
      v['status']=='submitted'||v['status']=='approved',
      isEditable&&confirmed&&shop&&selfie&&gps?FilledButton.icon(onPressed:busy?null:_submit,icon:const Icon(Icons.verified_user_outlined),label:const Text('Submit visit')):null),
   if(!confirmed)TextButton.icon(onPressed:busy?null:()=>_openVisit(v),icon:const Icon(Icons.refresh),label:const Text('Check owner confirmation')),
   const SizedBox(height:80),
  ]);
 }
 @override Widget build(BuildContext context){
  if(loading)return const Scaffold(body:Center(child:CircularProgressIndicator()));
  if(!agentApproved(profile))return Scaffold(appBar:AppBar(title:const Text('Field agent access')),body:Center(child:Padding(padding:const EdgeInsets.all(20),
   child:Column(mainAxisSize:MainAxisSize.min,children:[
    const Icon(Icons.lock_outline,size:40,color:_forest),
    Text(error.isEmpty?'This account is not an approved field agent.':error,textAlign:TextAlign.center),
    FilledButton(onPressed:_load,child:const Text('Check approval again')),
    TextButton(onPressed:widget.onShopper,child:const Text('Continue as Shopper'))
   ]))));
  return Scaffold(backgroundColor:const Color(0xFFF7F9FC),
   body:SafeArea(child:Column(children:[
     _header(),
     if(error.isNotEmpty)Container(width:double.infinity,color:const Color(0xFFFFF0E7),padding:const EdgeInsets.all(9),child:Text(error,style:const TextStyle(color:Colors.deepOrange))),
     if(busy)const LinearProgressIndicator(minHeight:3,color:_violet),
     Expanded(child:page==4?_dashboard():page==0?_explore():page==1?_visits():_visitDetails()),
   ])),
   bottomNavigationBar:SafeArea(top:false,child:Container(padding:const EdgeInsets.fromLTRB(24,9,24,12),color:Colors.white,child:Row(mainAxisAlignment:MainAxisAlignment.spaceEvenly,children:[
    _nav(Icons.space_dashboard_outlined,'Dashboard',4),_nav(Icons.map_outlined,'Explore',0),_nav(Icons.assignment_outlined,'My visits',1),
    _nav(Icons.person_outline,'Shopper',3),
   ]))));
 }
 Widget _nav(IconData icon,String label,int target){
  final active=target==page||(target==1&&page==2);
  return Expanded(child:InkWell(borderRadius:BorderRadius.circular(12),
   key:ValueKey('agent-nav-$target'),
   onTap:()async{
     if(target==3){widget.onShopper();return;}
     setState(()=>page=target);
     if(target==0)await _operate(_search);
     if(target==4)await _operate(_refreshDashboard);
   },
   child:Container(padding:const EdgeInsets.symmetric(vertical:5),decoration:BoxDecoration(
    color:active?_mint:Colors.transparent,borderRadius:BorderRadius.circular(12)),
    child:Column(mainAxisSize:MainAxisSize.min,children:[
     Icon(icon,color:active?_forest:const Color(0xFF657D7A),size:22),
     const SizedBox(height:3),Text(label,maxLines:1,overflow:TextOverflow.ellipsis,
      style:TextStyle(fontSize:11,fontWeight:FontWeight.w700,color:active?_forest:const Color(0xFF657D7A))),
    ]))));
 }
}
