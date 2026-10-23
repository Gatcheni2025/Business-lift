import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/seller_workspace.dart';

class OwnerSession extends ShopperSession {
  OwnerSession(){isReady=true;userId='owner1';idToken='owner-token';emailVerified=true;}
  @override Future<String> freshIdToken() async=>'owner-token';
  @override Future<void> signOut() async{userId=null;idToken=null;notifyListeners();}
}
http.Response account(String category)=>http.Response(jsonEncode({'fields':{
  'shopName':{'stringValue':'Saved Shop'},'category':{'stringValue':category},
  'approvalStatus':{'stringValue':'pending'},'listingStatus':{'stringValue':'not_listed'}
}}),200);
void main(){
  for(final category in ['spaza','retail']){
    testWidgets('$category owner sees the saved category and private workspace',(tester) async{
      final session=OwnerSession();
      final client=MockClient((r) async{
        expect(r.headers['Authorization'],'Bearer owner-token');
        expect(r.url.path,contains('owner1'));
        return r.url.path.contains('teyzaSellerAccounts')?account(category):http.Response('{}',200);
      });
      await tester.pumpWidget(MaterialApp(home:SellerWorkspacePage(session:session,openLogin:(){},
        apiFactory:(uid,token)=>SellerFirestore(uid:uid,token:token,client:client))));
      await tester.pumpAndSettle();
      expect(find.text('Saved Shop'),findsOneWidget);
      expect(find.text(category=='spaza'?'Spaza Shop':'Other Retail / Wholesale'),findsOneWidget);
      expect(find.text('Shop is not live yet'),findsOneWidget);
      expect(find.text('Add a product'),findsOneWidget);
      expect(tester.takeException(),isNull);
      await session.signOut();await tester.pumpAndSettle();
      expect(find.text('Saved Shop'),findsNothing);expect(find.text('Shop owner sign in'),findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());session.dispose();client.close();
    });
  }
  testWidgets('Shopper without a seller record is offered setup and no merchant writes',(tester) async{
    final session=OwnerSession();var reads=0;
    final client=MockClient((r) async{reads++;expect(r.method,'GET');return http.Response('{}',404);});
    await tester.pumpWidget(MaterialApp(home:SellerWorkspacePage(session:session,openLogin:(){},
      apiFactory:(uid,token)=>SellerFirestore(uid:uid,token:token,client:client))));
    await tester.pumpAndSettle();
    expect(find.text('No registered shop found'),findsOneWidget);
    expect(find.text('Add a product'),findsNothing);expect(reads,1);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();client.close();
  });
  testWidgets('Permission error offers retry without claiming the shop is missing',(tester) async{
    final session=OwnerSession();
    final client=MockClient((_) async=>http.Response('{}',403));
    await tester.pumpWidget(MaterialApp(home:SellerWorkspacePage(session:session,openLogin:(){},
      apiFactory:(uid,token)=>SellerFirestore(uid:uid,token:token,client:client))));
    await tester.pumpAndSettle();
    expect(find.text('Retry'),findsOneWidget);
    expect(find.text('No registered shop found'),findsNothing);
    expect(find.text('Add a product'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();client.close();
  });
  testWidgets('Signing out during a shop read cannot display the previous owner data',(tester) async{
    final session=OwnerSession();final reply=Completer<http.Response>();
    final client=MockClient((r) async=>r.url.path.contains('teyzaSellerAccounts')?
      reply.future:http.Response('{}',200));
    await tester.pumpWidget(MaterialApp(home:SellerWorkspacePage(session:session,openLogin:(){},
      apiFactory:(uid,token)=>SellerFirestore(uid:uid,token:token,client:client))));
    await tester.pump();await tester.pump();
    await session.signOut();reply.complete(account('spaza'));await tester.pumpAndSettle();
    expect(find.text('Saved Shop'),findsNothing);expect(find.text('Shop owner sign in'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();client.close();
  });
  test('Unknown saved category is never silently classified as a Spaza',(){
    final shop=SellerShop.fromFields({'shopName':'Unknown'});
    expect(shop.hasRegisteredCategory,isFalse);expect(shop.categoryLabel,'Shop setup required');
  });
}
