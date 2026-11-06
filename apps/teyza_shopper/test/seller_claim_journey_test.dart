import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_discovery.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'shopper_ui_helpers.dart';

class _Session extends ShopperSession {
 _Session({bool signedIn=true}){isReady=true;if(signedIn){userId='owner';idToken='token';emailVerified=true;}}
 @override Future<String> freshIdToken() async=>'token';
 void signInAsOwner(){userId='owner';idToken='token';emailVerified=true;useSellerWorkspace();}
}
class _ShopRepo extends SellerFirestore {
 const _ShopRepo({required super.uid,required super.token});
 @override Future<SellerShop?> shop() async=>null;
 @override Future<List<SellerDraft>> drafts() async=>[];
}
class _Api extends TeyzaMobileApi {
 _Api(super.session);
 final actions=<String>[];
 @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
  actions.add(action);
  if(action=='seller_claim_by_id')return {'claim':{'name':'Corner Shop','displayAddress':'12 Main Road, Durban',
   'claimSelection':'signed-claim','addressSelection':{'address':'12 Main Road, Durban','area':'Durban','city':'Durban',
    'addressSelection':'signed-address','placeId':'place-123','latitude':-29.85,'longitude':31.02}}};
  return {};
 }
}
void main(){
 testWidgets('Claiming an unlinked Google shop opens native registration with that listing',(tester) async{
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  final session=_Session(),api=_Api(session);
  final place=OnlineShop.fromJson({'id':'google-1','name':'Corner Shop','placeId':'place-123',
   'origin':'google_places','shopCategory':'spaza','categorizationVerified':true,'latitude':-29.8587,'longitude':31.0218});
  await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,initialArea:areas.first,
   enableBackgroundServices:false,sellerMobileApi:api,sellerApiFactory:(uid,token)=>_ShopRepo(uid:uid,token:token),
   catalogueLoader:() async=>[],directoryLoader:(_,type,__) async=>type=='spaza'?[place]:[])));
  await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
  final card=find.byKey(const ValueKey('nearby-google-1'));await revealShopperHome(tester,card);await tester.tap(card);await tester.pumpAndSettle();
  final claim=find.text('Own this shop? Claim it on Teyza');
  for(var i=0;i<12&&claim.evaluate().isEmpty;i++){
   await tester.drag(find.byType(ListView).first,const Offset(0,-220));await tester.pumpAndSettle();
  }
  expect(claim,findsOneWidget);await tester.ensureVisible(claim);await tester.tap(claim);await tester.pumpAndSettle();
  expect(api.actions,contains('seller_claim_by_id'));
  expect(find.text('Google Maps: Corner Shop'),findsOneWidget);
  expect(find.text('Shop address from Google Maps'),findsOneWidget);
  expect(tester.takeException(),isNull);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('A guest retains the chosen Google listing when signing in as an owner',(tester) async{
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  final session=_Session(signedIn:false),api=_Api(session);
  final place=OnlineShop.fromJson({'id':'google-1','name':'Corner Shop','placeId':'place-123',
   'origin':'google_places','shopCategory':'spaza','categorizationVerified':true,'latitude':-29.8587,'longitude':31.0218});
  await tester.pumpWidget(MaterialApp(home:ShopperHome(session:session,initialArea:areas.first,
   enableBackgroundServices:false,sellerMobileApi:api,sellerApiFactory:(uid,token)=>_ShopRepo(uid:uid,token:token),
   catalogueLoader:() async=>[],directoryLoader:(_,type,__) async=>type=='spaza'?[place]:[])));
  await tester.pump();await tester.pump(const Duration(seconds:1));await tester.pumpAndSettle();
  final card=find.byKey(const ValueKey('nearby-google-1'));await revealShopperHome(tester,card);await tester.tap(card);await tester.pumpAndSettle();
  final claim=find.text('Own this shop? Claim it on Teyza');
  for(var i=0;i<12&&claim.evaluate().isEmpty;i++){await tester.drag(find.byType(ListView).first,const Offset(0,-220));await tester.pumpAndSettle();}
  await tester.ensureVisible(claim);await tester.tap(claim);await tester.pumpAndSettle();
  expect(find.text('Continue as Shop Owner'),findsOneWidget);
  session.signInAsOwner();await tester.pumpAndSettle();
  expect(api.actions,contains('seller_claim_by_id'));expect(find.text('Google Maps: Corner Shop'),findsOneWidget);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
}

