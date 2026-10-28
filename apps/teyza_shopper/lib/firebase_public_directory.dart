import 'dart:convert';
import 'package:http/http.dart' as http;


// Public app directory, separate from identity evidence and private seller drafts.
const teyzaPublicProject='business-lift-3c19c';
const teyzaPublicCollection='teyzaPublicShops';

Map<String,dynamic> decodeFields(dynamic fields) {
  if(fields is! Map)return <String,dynamic>{};
  final result=<String,dynamic>{};
  for(final entry in fields.entries) {
    if(entry.key is! String || entry.value is! Map)continue;
    final typed=entry.value as Map;
    if(typed.containsKey('stringValue'))result[entry.key as String]=typed['stringValue'];
    else if(typed.containsKey('booleanValue'))result[entry.key as String]=typed['booleanValue'];
    else if(typed.containsKey('integerValue'))result[entry.key as String]=int.tryParse(typed['integerValue'].toString())??0;
    else if(typed.containsKey('doubleValue'))result[entry.key as String]=(typed['doubleValue'] as num?)?.toDouble()??0.0;
    else if(typed['mapValue'] is Map)result[entry.key as String]=decodeFields((typed['mapValue'] as Map)['fields']);
    else if(typed['geoPointValue'] is Map)result[entry.key as String]=Map<String,dynamic>.from(typed['geoPointValue'] as Map);
    else if(typed.containsKey('arrayValue')) {
      final values=(typed['arrayValue'] is Map)?(typed['arrayValue'] as Map)['values']:null;
      result[entry.key as String]=values is List ? values.map((p) {
        if(p is Map && p['mapValue'] is Map)return decodeFields((p['mapValue'] as Map)['fields']);
        return <String,dynamic>{};
      }).toList():<Map<String,dynamic>>[];
    }
  }
  return result;
}

String publishedMerchantPhoto(Map<String,dynamic> data) {
  // Admin-approved seller listings may use any of these standard image keys.
  // External images must be secure; empty images receive a bundled local image.
  for(final field in [
    'photoUrl','shopPhotoUrl','shopImageUrl','coverImageUrl','logoUrl','imageUrl'
  ]){
    final value=data[field];
    if(value is! String)continue;
    final uri=Uri.tryParse(value.trim());
    if(uri!=null && uri.scheme=='https' && uri.host.isNotEmpty) {
      return value.trim();
    }
  }
  return '';
}

List<Map<String,dynamic>> parseTeyzaPublicDirectory(dynamic response) {
  if(response is! List)throw const FormatException('Invalid Teyza public directory response.');
  final output=<Map<String,dynamic>>[];
  for(final row in response) {
    if(row is! Map || row['document'] is! Map)continue;
    final document=row['document'] as Map;
    final data=decodeFields(document['fields']);
    final id=(document['name']??'').toString().split('/').last;
    if(data['status']!='active' || data['approvalStatus']!='approved' || data['identityVerified']!=true || data['sellerUid']!=id
      || data['name'] is! String || (data['name'] as String).trim().length<2)continue;
    if(!RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(id))continue;
    output.add(<String,dynamic>{
      'id':id,'name':data['name'],'area':data['area']??'',
      'address':data['address']??'','city':data['city']??'','shopCategory':['retail','variety','other-retail'].contains(data['shopCategory'])?'variety':'spaza',
      'photoUrl':publishedMerchantPhoto(data),
      'latitude': data['latitude'] is num ? data['latitude'] : null,
      'longitude': data['longitude'] is num ? data['longitude'] : null,
      'whatsappPhone':'','identityVerified':data['identityVerified']==true,
      'pickupEnabled':data['pickupEnabled']==true,
      'deliveryEnabled':data['deliveryEnabled']==true,
      'services':data['services'] is Map?data['services']:<String,dynamic>{},
      'products':data['products'] is List?data['products']:<dynamic>[],
      'productHighlights':data['productHighlights'] is List?data['productHighlights']:<dynamic>[],
      'hours':data['hours'] is List?data['hours']:<dynamic>[],
      'deliveryFeeCents':data['deliveryFeeCents'] is num?data['deliveryFeeCents']:0,
      'sponsored':false,
      'rating':data['ratingSource']=='teyza_completed_orders'?data['rating']:null,
      'ratingCount':data['ratingSource']=='teyza_completed_orders'?data['ratingCount']:0,
    });
  }
  return output;
}

Future<List<Map<String,dynamic>>> fetchTeyzaPublicDirectory({http.Client? client}) async {
  final remote=client??http.Client();
  try {
    final shops=<Map<String,dynamic>>[];String? cursor;
    while(true){
      final url=Uri.https('us-central1-business-lift-3c19c.cloudfunctions.net','/teyzaMobile',
        {'publicShops':'1',if(cursor!=null)'after':cursor});
      final response=await remote.get(url).timeout(const Duration(seconds:20));
      if(response.statusCode!=200)throw StateError('The approved shop directory is temporarily unavailable.');
      final data=jsonDecode(utf8.decode(response.bodyBytes));
      if(data is! Map||data['ok']!=true||data['entries'] is! List)throw StateError('The shop directory needs the latest Teyza service update.');
      for(final value in data['entries'] as List){
        if(value is! Map)continue;
        final row=Map<String,dynamic>.from(value),id=row['id'];
        if(id is! String||!RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(id)||row['sellerUid']!=id||
          row['status']!='active'||row['approvalStatus']!='approved'||row['identityVerified']!=true||
          row['name'] is! String||(row['name'] as String).trim().length<2)continue;
        shops.add({...row,'shopCategory':['retail','variety','other-retail'].contains(row['shopCategory'])?'variety':'spaza',
          'photoUrl':publishedMerchantPhoto(row),'whatsappPhone':'','sponsored':false});
      }
      final next=data['next'];if(next==null||next=='')break;
      if(next is! String||next==cursor)throw const FormatException('Shop directory pagination did not advance.');
      cursor=next;
    }
    return shops;
  }finally {if(client==null)remote.close();}
}
