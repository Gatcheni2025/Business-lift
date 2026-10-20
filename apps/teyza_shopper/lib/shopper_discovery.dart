import 'dart:convert';
import 'package:http/http.dart' as http;

class OnlineShop {
  final String id, name, area, address, source, origin, claimUrl;
  final double? lat, lng;
  final List<Map<String,String>> providerAttributions;
  final List<Map<String,String>> photoAttributions;
  final String? photoRef;
  final String shopCategory;
  const OnlineShop(this.id,this.name,this.area,this.address,this.source,
    this.origin,this.claimUrl,this.lat,this.lng,{
      this.providerAttributions=const [],
      this.photoAttributions=const [],
      this.photoRef,
      this.shopCategory='spaza',
    });
  factory OnlineShop.fromJson(Map<String,dynamic> p) => OnlineShop(
    (p['id']??'').toString(),(p['name']??'').toString(),
    (p['area']??'').toString(),(p['address']??'').toString(),
    (p['sourceUrl']??'').toString(),(p['origin']??'').toString(),
    (p['claimUrl']??'').toString(),
    (p['latitude'] as num?)?.toDouble(),(p['longitude'] as num?)?.toDouble(),
    photoRef:p['photoRef'] is String ? p['photoRef'] as String : null,
    shopCategory:p['shopCategory']=='variety'?'variety':'spaza',
    photoAttributions:((p['photoAttributions'] as List?)??const [])
      .whereType<Map>()
      .map((v)=>{'name':(v['name']??'').toString(),'url':(v['url']??'').toString()})
      .where((v)=>v['name']!.isNotEmpty && v['url']!.startsWith('https://'))
      .toList(),
    providerAttributions:((p['attributions'] as List?)??const [])
      .whereType<Map>()
      .map((v)=>{'name':(v['name']??'').toString(),'url':(v['url']??'').toString()})
      .where((v)=>v['name']!.isNotEmpty && v['url']!.startsWith('https://'))
      .toList());
}

Future<List<OnlineShop>> findOnlineShops({String area='',double? latitude,
  double? longitude,String category='spaza',http.Client? client}) async {
  final uri=Uri.parse('https://teyza.co.za/api/shopper-discover.php')
    .replace(queryParameters:{
      if(area.isNotEmpty)'area':area,
      'category':category=='variety'?'variety':'spaza',
      if(latitude!=null && longitude!=null) ...{
        'lat':latitude.toStringAsFixed(2),
        'lon':longitude.toStringAsFixed(2),
      },
    });
  final httpClient=client??http.Client();
  try {
    final response=await httpClient.get(uri,headers:const{'Accept':'application/json'})
      .timeout(const Duration(seconds:18));
    if(response.statusCode!=200)throw StateError('Online directory unavailable (HTTP '+response.statusCode.toString()+').');
    final data=jsonDecode(utf8.decode(response.bodyBytes));
    if(data is! Map||data['ok']!=true||data['entries'] is! List) {
      throw const FormatException('Unexpected online directory response.');
    }
    final unique=<String,OnlineShop>{};
    for(final row in data['entries'] as List) {
      if(row is! Map) continue;
      final s=OnlineShop.fromJson(Map<String,dynamic>.from(row));
      if(s.name.trim().isEmpty||s.id.trim().isEmpty) continue;
      final key=s.name.toLowerCase().trim();
      unique.putIfAbsent(key,()=>s);
    }
    return unique.values.toList();
  }finally {
    if(client==null)httpClient.close();
  }
}
