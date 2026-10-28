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
   'approvalStatus':{'stringValue':'approved'},'identityVerified':{'booleanValue':true},
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
 test('Directory reads the approved server projection and rejects stale active-but-pending entries',() async {
  final mock=MockClient((request) async {
   expect(request.method,'GET');expect(request.url.host,'us-central1-business-lift-3c19c.cloudfunctions.net');
   expect(request.url.path,'/teyzaMobile');expect(request.url.queryParameters['publicShops'],'1');
   return http.Response(jsonEncode({'ok':true,'entries':[apiRow('good'),{...apiRow('pending'),'approvalStatus':'pending'}],'next':null}),200);
  });
  final shops=await fetchTeyzaPublicDirectory(client:mock);expect(shops.map((s)=>s['id']),['good']);
 });
 test('Directory follows the server cursor even when a filtered page contains no approved shops',() async {
  var pages=0;final mock=MockClient((request) async {
   pages++;if(pages==1)return http.Response(jsonEncode({'ok':true,'entries':[],'next':'seller199'}),200);
   expect(request.url.queryParameters['after'],'seller199');
   return http.Response(jsonEncode({'ok':true,'entries':[apiRow('seller200')],'next':null}),200);
  });
  final shops=await fetchTeyzaPublicDirectory(client:mock);expect(pages,2);expect(shops.single['id'],'seller200');
 });
 test('A denied or outdated service never falls back to unapproved Firestore listings',() async {
  for(final response in [http.Response('{"error":"PERMISSION_DENIED"}',403),http.Response('{"ok":true,"version":"3.15.0"}',200)]){
   final mock=MockClient((_) async=>response);await expectLater(fetchTeyzaPublicDirectory(client:mock),throwsStateError);
  }
 });
}
Map<String,dynamic> apiRow(String id)=>{'id':id,'sellerUid':id,'name':'Shop '+id,'status':'active','approvalStatus':'approved','identityVerified':true};
