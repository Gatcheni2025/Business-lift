import 'dart:convert';
import 'package:http/http.dart' as http;
import 'shopper_auth.dart' show teyzaFirebaseApiKey;

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

List<Map<String,dynamic>> parseTeyzaPublicDirectory(dynamic response) {
  if(response is! List)throw const FormatException('Invalid Teyza public directory response.');
  final output=<Map<String,dynamic>>[];
  for(final row in response) {
    if(row is! Map || row['document'] is! Map)continue;
    final document=row['document'] as Map;
    final data=decodeFields(document['fields']);
    final id=(document['name']??'').toString().split('/').last;
    if(data['status']!='active' || data['sellerUid']!=id
      || data['name'] is! String || (data['name'] as String).trim().length<2)continue;
    if(!RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(id))continue;
    output.add(<String,dynamic>{
      'id':id,'name':data['name'],'area':data['area']??'',
      'address':data['address']??'','shopCategory':data['shopCategory']=='retail'?'variety':'spaza',
      'photoUrl':data['photoUrl'] is String &&
        (data['photoUrl'] as String).startsWith('https://')
        ? data['photoUrl'] : '',
      'latitude': data['latitude'] is num ? data['latitude'] : null,
      'longitude': data['longitude'] is num ? data['longitude'] : null,
      'whatsappPhone':'',
      'pickupEnabled':data['pickupEnabled']==true,
      'deliveryEnabled':data['deliveryEnabled']==true,
      'products':data['products'] is List?data['products']:<dynamic>[],
      'sponsored':false,
    });
  }
  return output;
}

Future<List<Map<String,dynamic>>> fetchTeyzaPublicDirectory({http.Client? client}) async {
  final remote=client??http.Client();
  final owned=client==null;
  final url=Uri.https('firestore.googleapis.com',
    '/v1/projects/'+teyzaPublicProject+'/databases/(default)/documents:runQuery',
    {'key':teyzaFirebaseApiKey});
  final body=jsonEncode({'structuredQuery':{
    'from':[{'collectionId':teyzaPublicCollection}],
    'where':{'fieldFilter':{'field':{'fieldPath':'status'},'op':'EQUAL',
      'value':{'stringValue':'active'}}},
    'limit':200,
  }});
  try {
    final response=await remote.post(url,
      headers:const {'Content-Type':'application/json'},body:body)
      .timeout(const Duration(seconds:15));
    if(response.statusCode!=200)throw StateError(
      'Teyza verified shop directory unavailable (HTTP '+response.statusCode.toString()+').');
    return parseTeyzaPublicDirectory(jsonDecode(utf8.decode(response.bodyBytes)));
  }finally {if(owned)remote.close();}
}
