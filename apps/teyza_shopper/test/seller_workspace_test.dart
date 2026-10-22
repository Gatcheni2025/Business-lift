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
    expect(req.method,'POST');
    expect(req.url.path,contains('documents:commit'));
    expect(req.body,contains('teyzaDraftProducts/sellerTEST123/items/test-item1'));
    expect(req.headers['Authorization'],'Bearer mock-id-token');
    final body=jsonDecode(req.body) as Map;
    final write=(body['writes'] as List).first as Map;
    final fields=(write['update'] as Map)['fields'] as Map;
    expect((write['currentDocument'] as Map)['exists'],false);
    final transforms=write['updateTransforms'] as List;
    expect(transforms.length,2);
    expect((fields['status'] as Map)['stringValue'],'draft');
    expect((fields['ownerUid'] as Map)['stringValue'],owner);
    expect(body.toString(),isNot(contains('approvalStatus')));
    expect(body.toString(),isNot(contains('listingStatus')));
    expect(body.toString(),isNot(contains('teyzaPublicShops')));
    expect((fields['stockQty'] as Map)['integerValue'],'8');
    expect((fields['description'] as Map)['stringValue'],'');
    return http.Response(jsonEncode({'writeResults':[]}),200);
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
        'priceCents':{'integerValue':'1999'},'stockQty':{'integerValue':'4'},
        'createdAt':{'timestampValue':'2026-10-21T10:00:00Z'}}},
    {'name':'projects/demo/documents/teyzaDraftProducts/$owner/items/item2',
      'fields':{'ownerUid':{'stringValue':'another'},'status':{'stringValue':'draft'}}}
  ]}),200));
  final items=await SellerFirestore(uid:owner,token:'t',client:client).drafts();
  expect(items.length,1);
  expect(items.single.priceCents,1999);
 });
 test('Editing a draft preserves its server-set createdAt',() async{
  final client=MockClient((req) async{
    final body=jsonDecode(req.body) as Map;
    final write=(body['writes'] as List).single as Map;
    expect(write.containsKey('currentDocument'),false);
    final fields=(write['update'] as Map)['fields'] as Map;
    expect((fields['createdAt'] as Map)['timestampValue'],'2026-10-21T10:00:00Z');
    expect((write['updateTransforms'] as List).length,1);
    expect((write['updateTransforms'] as List).single['fieldPath'],'updatedAt');
    return http.Response('{"writeResults":[]}',200);
  });
  await SellerFirestore(uid:owner,token:'t',client:client).save(
    const SellerDraft(id:'existing1',name:'Bread',category:'Groceries',
      description:'500g',priceCents:2000,stock:5,
      createdAt:'2026-10-21T10:00:00Z'));
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
