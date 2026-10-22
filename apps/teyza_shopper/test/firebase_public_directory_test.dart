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
 test('Denied Firestore query is never replaced with unverified shops',() async {
  final mock=MockClient((_) async => http.Response('{"error":"PERMISSION_DENIED"}',403));
  expect(fetchTeyzaPublicDirectory(client:mock),throwsStateError);
 });
}
