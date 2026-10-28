import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/firebase_public_directory.dart';

Map<String,dynamic> row(String status,String name,{String id='seller100'}) => {
 'document':{
  'name':'projects/business-lift-3c19c/databases/(default)/documents/teyzaPublicShops/'+id,
  'fields':{
   'sellerUid':{'stringValue':id},
   'status':{'stringValue':status},
   'name':{'stringValue':name},
   'shopCategory':{'stringValue':'spaza'},
   'address':{'stringValue':'123 Main Street, Durban'},
   'area':{'stringValue':'Durban'},
   'pickupEnabled':{'booleanValue':true},
   'deliveryEnabled':{'booleanValue':false},
   'products':{'arrayValue':{'values':[]}},
  }
 }
};
void main(){
 test('Public merchant ratings must identify Teyza completed orders as their source',(){
  final listing=row('active','Rated shop');
  final fields=(listing['document'] as Map)['fields'] as Map;
  fields['rating']={'doubleValue':4.5};fields['ratingCount']={'integerValue':'2'};
  expect(parseTeyzaPublicDirectory([listing]).single['rating'],isNull);
  fields['ratingSource']={'stringValue':'teyza_completed_orders'};
  expect(parseTeyzaPublicDirectory([listing]).single['rating'],4.5);
  expect(parseTeyzaPublicDirectory([listing]).single['ratingCount'],2);
 });
 test('Pending and invalid shops never appear in directory',(){
  final shops=parseTeyzaPublicDirectory([
    row('active','Verified Spaza'),
    row('pending','Private Spaza',id:'private'),
    row('active','',id:'bad')
  ]);
  expect(shops.length,1);
  expect(shops.single['name'],'Verified Spaza');
  expect(shops.single.containsKey('ownerEmail'),false);
  expect(shops.single['products'],isEmpty);
 });
 test('Approved shops show their published cover or shop logo',(){
  final listing=row('active','Nearby Spaza');
  final fields=(listing['document'] as Map)['fields'] as Map;
  fields['shopPhotoUrl']={'stringValue':'https://firebasestorage.googleapis.com/v0/b/shop-photo'};
  final shops=parseTeyzaPublicDirectory([listing]);
  expect(shops.single['photoUrl'],startsWith('https://'));
  expect(publishedMerchantPhoto({'photoUrl':'http://unsafe.example/shop.jpg'}),'');
  expect(publishedMerchantPhoto({'logoUrl':'https://example.com/logo.png'}),
    'https://example.com/logo.png');
 });
 test('Firestore public query constrains active status',() async {
  final mock=MockClient((request) async {
   expect(request.url.path,isNot(contains('teyzaPublicShops')));
   expect(request.body,contains('"fieldPath":"status"'));
   expect(request.body,contains('"stringValue":"active"'));
   expect(request.body,isNot(contains('teyzaDraftProducts')));
   return http.Response(jsonEncode([row('active','Verified Spaza')]),200);
  });
  final rows=await fetchTeyzaPublicDirectory(client:mock);
  expect(rows.length,1);
  expect(rows.single['id'],'seller100');
 });
 test('Active shops after the first 200 are fetched using an exclusive document cursor',() async {
  var pages=0;
  final mock=MockClient((request) async {
   final query=(jsonDecode(request.body) as Map)['structuredQuery'] as Map;
   pages++;
   if(pages==1){expect(query.containsKey('startAt'),false);
    return http.Response(jsonEncode(List.generate(200,(n)=>row('active','Shop $n',id:'seller${n.toString().padLeft(3,'0')}'))),200);}
   expect((query['startAt'] as Map)['before'],false);
   expect(query['startAt'].toString(),contains('seller199'));
   return http.Response(jsonEncode([row('active','Last shop',id:'seller200')]),200);
  });
  final shops=await fetchTeyzaPublicDirectory(client:mock);
  expect(pages,2);expect(shops.length,201);expect(shops.last['id'],'seller200');
 });
 test('Denied Firestore query is never replaced with unverified shops',() async {
  final mock=MockClient((_) async => http.Response('{"error":"PERMISSION_DENIED"}',403));
  expect(fetchTeyzaPublicDirectory(client:mock),throwsStateError);
 });
}
