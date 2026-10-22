import 'dart:convert';
import 'dart:math' as math;
import 'package:http/http.dart' as http;

// Firebase-only Google Places: 2nd-gen HTTPS Cloud Function with managed TLS.
// The Google Places API key stays in Firebase Secret Manager, never in APKs.
const teyzaPlacesBackend = String.fromEnvironment(
  'TEYZA_PLACES_FUNCTION_URL',
  defaultValue:'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces');
Uri teyzaPlacesUrl(String path,[Map<String,String> params=const {}]) {
  final base=Uri.tryParse(teyzaPlacesBackend.trim());
  if(base==null || base.scheme!='https' ||
      base.host!='us-central1-business-lift-3c19c.cloudfunctions.net' ||
      base.path!='/teyzaPlaces' || base.userInfo.isNotEmpty ||
      base.hasQuery || base.hasFragment ||
      !['shopper-discover.php','shopper-place-photo.php'].contains(path)) {
    throw const FormatException('Teyza Google Places Function URL is invalid.');
  }
  return base.replace(path:'/teyzaPlaces/$path',
    queryParameters:params.isEmpty?null:params);
}
Uri teyzaGooglePhotoUrl(String ref)=>teyzaPlacesUrl('shopper-place-photo.php',{'ref':ref});

class OnlineShop {
  final String id, name, area, address, source, origin, claimUrl;
  final double? lat, lng;
  final List<Map<String,String>> providerAttributions;
  final List<Map<String,String>> photoAttributions;
  final String? photoRef;
  // R3.4 backend returns a short-lived photo proxy URL; older releases send photoRef.
  final String? photoUrl;
  final String shopCategory;
  bool get hasPhoto => (photoUrl?.isNotEmpty ?? false) || (photoRef?.isNotEmpty ?? false);
  String? get displayPhotoUrl {
    final direct = photoUrl;
    final uri = direct == null ? null : Uri.tryParse(direct);
    if(uri != null && uri.scheme == 'https' &&
      uri.host == 'us-central1-business-lift-3c19c.cloudfunctions.net' &&
      uri.path == '/teyzaPlaces/shopper-place-photo.php') return direct;
    if(photoRef != null && photoRef!.isNotEmpty) {
      return teyzaGooglePhotoUrl(photoRef!).toString();
    }
    return null;
  }
  const OnlineShop(this.id,this.name,this.area,this.address,this.source,
    this.origin,this.claimUrl,this.lat,this.lng,{
      this.providerAttributions=const [],
      this.photoAttributions=const [],
      this.photoRef,
      this.photoUrl,
      this.shopCategory='spaza',
    });
  factory OnlineShop.fromJson(Map<String,dynamic> p) => OnlineShop(
    (p['id']??'').toString(),(p['name']??'').toString(),
    (p['area']??'').toString(),(p['address']??'').toString(),
    (p['sourceUrl']??'').toString(),(p['origin']??'').toString(),
    (p['claimUrl']??'').toString(),
    (p['latitude'] as num?)?.toDouble(),(p['longitude'] as num?)?.toDouble(),
    photoRef:p['photoRef'] is String ? p['photoRef'] as String : null,
    photoUrl:p['photoUrl'] is String ? p['photoUrl'] as String : null,
    shopCategory:p['shopCategory']=='variety'?'variety':'spaza',
    photoAttributions:((p['photoAttributions'] as List?)??const [])
      .whereType<Map>()
      .map((v)=>{'name':(v['name']??'').toString(),'url':(v['url']??'').toString()})
      .where((v)=>v['name']!.isNotEmpty)
      .toList(),
    providerAttributions:((p['attributions'] as List?)??const [])
      .whereType<Map>()
      .map((v)=>{'name':(v['name']??'').toString(),'url':(v['url']??'').toString()})
      .where((v)=>v['name']!.isNotEmpty && v['url']!.startsWith('https://'))
      .toList());
}

/// Keep categories honest even when older deployed Places functions return
/// mixed search results. Google results are not verified Teyza merchants.
bool teyzaMatchesShopCategory(OnlineShop shop, String category) {
  if(shop.origin != 'google_places') return true;
  final name = shop.name.toLowerCase();
  if(category == 'variety') {
    if(RegExp(r'spaza|tuck\s?shop|takeaway|restaurant|tyres?|motor spares|printing|salon').hasMatch(name)) return false;
    return RegExp(r'china\s?mall|shopping|mall|wholesale|cash\s?(and|&)\s?carry|variety|department|retail|supermarket|hypermarket|furniture|homeware|bazaar|clothing|fashion|market|trading').hasMatch(name);
  }
  if(category == 'spaza') {
    return RegExp(r'spaza|tuck\s?shop|convenience|mini\s?market|supermarket|grocer|general dealer|corner shop|food store').hasMatch(name);
  }
  return true;
}

// Rate-limited in-memory OSM fallback for nearby public map businesses.
// Does not invent Google listings, photographs or merchant verification.
final _osmCache=<String,({DateTime fetched,List<OnlineShop> shops})>{};
Future<List<OnlineShop>> _osmFallback({
  required double latitude,required double longitude,
  required String category,required http.Client client}) async {
  if(latitude < -35 || latitude > -22 || longitude < 16 || longitude > 34)return [];
  final lat=latitude.toStringAsFixed(2),lon=longitude.toStringAsFixed(2);
  final key='$lat:$lon:$category';
  final cached=_osmCache[key];
  if(cached!=null && DateTime.now().difference(cached.fetched)<const Duration(minutes:10))return cached.shops;
  final types=category=='variety'
    ?r'^(variety_store|department_store|wholesale|mall|general)$'
    :r'^(convenience|grocery|kiosk|general|supermarket)$';
  final query='[out:json][timeout:8];(nwr(around:4500,$lat,$lon)["shop"~"$types"]["name"];);out center 35;';
  final res=await client.post(Uri.https('overpass-api.de','/api/interpreter'),
    body:{'data':query},headers:const{'Accept':'application/json'})
    .timeout(const Duration(seconds:12));
  if(res.statusCode!=200)throw StateError('Nearby map directory unavailable.');
  final data=jsonDecode(utf8.decode(res.bodyBytes));
  if(data is! Map || data['elements'] is! List)throw const FormatException('Invalid map directory response.');
  final result=<OnlineShop>[],names=<String>{};
  for(final item in data['elements'] as List){
    if(item is! Map || item['tags'] is! Map)continue;
    final tags=item['tags'] as Map;
    final name=(tags['name']??'').toString().trim();
    if(name.length<2 || name.length>110 || !names.add(name.toLowerCase()))continue;
    final type=(item['type']??'').toString(),id=(item['id']??'').toString();
    if(!['node','way','relation'].contains(type)||!RegExp(r'^[0-9]+$').hasMatch(id))continue;
    final center=item['center'] is Map?item['center'] as Map:item;
    final la=center['lat'],lo=center['lon'];
    if(la is! num||lo is! num)continue;
    final address=[tags['addr:housenumber'],tags['addr:street'],tags['addr:suburb']]
      .where((v)=>v!=null&&v.toString().trim().isNotEmpty)
      .map((v)=>v.toString().trim()).join(', ');
    result.add(OnlineShop(
      'osm-$type-$id',name,(tags['addr:suburb']??tags['addr:city']??'Nearby').toString(),
      address,'https://www.openstreetmap.org/$type/$id',
      'openstreetmap','https://teyza.co.za/?auth=register',
      la.toDouble(),lo.toDouble(),shopCategory:category,
      providerAttributions:const[
        {'name':'© OpenStreetMap contributors','url':'https://www.openstreetmap.org/copyright'}
      ]));
    if(result.length>=35)break;
  }
  _osmCache[key]=(fetched:DateTime.now(),shops:result);
  return result;
}

Future<List<OnlineShop>> findOnlineShops({String area='',double? latitude,
  double? longitude,String category='spaza',http.Client? client}) async {
  final kind=category=='variety'?'variety':'spaza';
  final uri=teyzaPlacesUrl('shopper-discover.php',{
    if(area.isNotEmpty)'area':area,'category':kind,
    if(latitude!=null && longitude!=null)...{
      'lat':latitude.toStringAsFixed(4),'lon':longitude.toStringAsFixed(4),
    },
  });
  final httpClient=client??http.Client();
  try{
    try{
      final response=await httpClient.get(uri,headers:const{'Accept':'application/json'})
        .timeout(const Duration(seconds:13));
      if(response.statusCode!=200){
        throw StateError('Shop discovery unavailable (HTTP '+response.statusCode.toString()+').');
      }
      final data=jsonDecode(utf8.decode(response.bodyBytes));
      if(data is! Map||data['ok']!=true||data['entries'] is! List){
        throw const FormatException('Unexpected online directory response.');
      }
      final unique=<String,OnlineShop>{};
      for(final row in data['entries'] as List){
        if(row is! Map)continue;
        final s=OnlineShop.fromJson(Map<String,dynamic>.from(row));
        if(s.name.trim().isEmpty||s.id.trim().isEmpty)continue;
        if(!teyzaMatchesShopCategory(s,kind))continue;
        unique.putIfAbsent(s.id,()=>s);
      }
      if(unique.isNotEmpty){
        final sorted=unique.values.toList();
        if(latitude != null && longitude != null) {
          double distance(OnlineShop s) {
            if(s.lat == null || s.lng == null) return double.infinity;
            const radius=6371.0;
            final a=(s.lat!-latitude)*math.pi/180;
            final b=(s.lng!-longitude)*math.pi/180;
            final v=math.sin(a/2)*math.sin(a/2)+
              math.cos(latitude*math.pi/180)*math.cos(s.lat!*math.pi/180)*
              math.sin(b/2)*math.sin(b/2);
            return radius*2*math.asin(math.sqrt(v.clamp(0.0,1.0)));
          }
          sorted.sort((a,b)=>distance(a).compareTo(distance(b)));
        }
        return sorted;
      }
    }catch(_){
      // Never claim third-party fallback entries are sourced from Google.
    }
    if(latitude!=null && longitude!=null){
      return await _osmFallback(latitude:latitude,longitude:longitude,
        category:kind,client:httpClient);
    }
    return <OnlineShop>[];
  }finally{if(client==null)httpClient.close();}
}
