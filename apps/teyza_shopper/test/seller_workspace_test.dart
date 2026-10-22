import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/seller_firestore.dart';

void main(){
 const owner='sellerTEST123';
 test('Seller account parses approval and pending listing separately',() async{
  final client=MockClient((req) async{
    expect(req.url.path,contains('teyzaSellerAccounts/sellerTEST123'));
    expect(req.headers['Authorization'],'Bearer mock-id-token');
    return http.Response(jsonEncode({'fields':{
      'shopName':{'stringValue':'KZN Corner Shop'},
      'category':{'stringValue':'spaza'},
      'approvalStatus':{'stringValue':'pending'},
      'listingStatus':{'stringValue':'not_listed'}
    }}),200);
  });
  final shop=await SellerFirestore(uid:owner,token:'mock-id-token',client:client).shop();
  expect(shop?.name,'KZN Corner Shop');
  expect(shop?.isLive,false);
 });
 test('Shop not registered returns null without creating an account',() async{
  final client=MockClient((_) async=>http.Response('{}',404));
  expect(await SellerFirestore(uid:owner,token:'t',client:client).shop(),isNull);
 });
 test('Owner creates only a private draft and does not publish to shopper catalogue',() async{
  final client=MockClient((req) async{
    expect(req.method,'PATCH');
    expect(req.url.path,contains('teyzaDraftProducts/sellerTEST123/items/test-item1'));
    expect(req.headers['Authorization'],'Bearer mock-id-token');
    final body=jsonDecode(req.body) as Map;
    final fields=body['fields'] as Map;
    expect((fields['status'] as Map)['stringValue'],'draft');
    expect((fields['ownerUid'] as Map)['stringValue'],owner);
    expect(body.toString(),isNot(contains('approvalStatus')));
    expect(body.toString(),isNot(contains('listingStatus')));
    expect(body.toString(),isNot(contains('teyzaPublicShops')));
    return http.Response(jsonEncode({'fields':fields}),200);
  });
  await SellerFirestore(uid:owner,token:'mock-id-token',client:client).save(
    const SellerDraft(id:'test-item1',name:'Bread',category:'Groceries',
      priceCents:1899,stock:8));
 });
 test('Draft product retrieval excludes other sellers and non-draft items',() async{
  final client=MockClient((_) async=>http.Response(jsonEncode({'documents':[
    {'name':'projects/demo/documents/teyzaDraftProducts/$owner/items/item1',
      'fields':{'ownerUid':{'stringValue':owner},'status':{'stringValue':'draft'},
        'name':{'stringValue':'Milk'},'category':{'stringValue':'Groceries'},
        'priceCents':{'integerValue':'1999'},'stock':{'integerValue':'4'}}},
    {'name':'projects/demo/documents/teyzaDraftProducts/$owner/items/item2',
      'fields':{'ownerUid':{'stringValue':'another'},'status':{'stringValue':'draft'}}}
  ]}),200));
  final items=await SellerFirestore(uid:owner,token:'t',client:client).drafts();
  expect(items.length,1);
  expect(items.single.priceCents,1999);
 });
 test('Unsafe product IDs and invalid prices are rejected before network access',(){
  expect(()=>SellerFirestore.validateDraft(
    const SellerDraft(id:'../bad',name:'A bread',category:'Grocery',priceCents:500,stock:2)),
    throwsFormatException);
  expect(()=>SellerFirestore.validateDraft(
    const SellerDraft(id:'item1',name:'A bread',category:'Grocery',priceCents:0,stock:2)),
    throwsFormatException);
 });
}
