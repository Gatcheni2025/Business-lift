import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'package:teyza_shopper/shopper_delivery_profile.dart';
import 'session_test.dart' show MemoryStore;

class RoutingSession extends ShopperSession {
  RoutingSession():super(store:MemoryStore()) {
    isReady=true;userId='existingUid';idToken='existingToken';emailVerified=true;
  }
  @override Future<String> freshIdToken() async=>'existingToken';
}
class RoutingShop extends SellerFirestore {
  final SellerShop? account;
  final Future<SellerShop?>? pending;
  const RoutingShop({required super.uid,required super.token,this.account,this.pending});
  @override Future<SellerShop?> shop() async=>pending!=null?await pending:account;
  @override Future<List<SellerDraft>> drafts() async=>[];
}
class RoutingApi extends TeyzaMobileApi {
  final bool shopper,agent;
  final String? invitedStatus;
  bool fail=false;
  RoutingApi(super.session,{this.shopper=false,this.agent=false,this.invitedStatus});
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
    if(action=='shopper_profile_read'){
      if(fail)throw StateError('Offline');
      return {'profile':shopper?{'ownerUid':session.userId}:null};
    }
    if(action=='agent_access_status')return {'status':invitedStatus};
    if(action=='agent_profile')return {'profile':agent?{'uid':session.userId,'status':'approved'}:invitedStatus!=null?{'uid':session.userId,'status':invitedStatus}:null};
    return {'ok':true,'settings':{},'photos':[],'notifications':[],'orders':[],
      'credit':[],'scope':'owner','threads':[]};
  }
}
Future<void> start(WidgetTester t,RoutingSession session,RoutingApi api,
  {SellerShop? seller,Future<SellerShop?>? pending}) async {
  SharedPreferences.setMockInitialValues({});
  await t.pumpWidget(MaterialApp(home:ShopperHome(session:session,
    enableBackgroundServices:false,initialArea:areas.first,sellerMobileApi:api,
    shopperProfileStore:ShopperDeliveryProfileStore(vault:MemoryStore()),
    sellerApiFactory:(uid,token)=>RoutingShop(uid:uid,token:token,account:seller,pending:pending),
    catalogueLoader:()async=>[],directoryLoader:(_,__,___)async=>[])));
  await t.pumpAndSettle();
}
void main(){
  testWidgets('Unverified invited agent sees verification instead of shopper registration',(t)async{
    final session=RoutingSession()..emailVerified=false..email='agent@example.test';
    final api=RoutingApi(session,invitedStatus:'pending');
    await start(t,session,api);
    await t.tap(find.byKey(const ValueKey('nav-account')));await t.pumpAndSettle();
    expect(find.text('Verify your account email'),findsOneWidget);
    expect(find.text('Send verification email'),findsOneWidget);
    expect(find.text('Finish registration'),findsNothing);
    expect(find.byKey(const ValueKey('agent-dashboard')),findsNothing);
    await t.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('Verified pending agent does not receive work access or need duplicate registration',(t)async{
    final session=RoutingSession(),api=RoutingApi(session,invitedStatus:'pending');
    await start(t,session,api);
    await t.tap(find.byKey(const ValueKey('nav-account')));await t.pumpAndSettle();
    expect(find.text('Awaiting agent approval'),findsOneWidget);
    expect(find.text('Finish registration'),findsNothing);
    expect(find.byKey(const ValueKey('agent-dashboard')),findsNothing);
    await t.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  for(final type in ['spaza','retail','wholesale']){
    testWidgets('Existing $type account launches to home and opens only after explicit role switch',(t)async{
      final session=RoutingSession(),api=RoutingApi(RoutingSession());
      await start(t,session,api,seller:SellerShop('Existing business',type,'Durban','approved','active'));
      expect(session.sellerWorkspace,false);
      expect(find.byKey(const ValueKey('nav-home')),findsOneWidget);
      expect(find.text('Select account'),findsNothing);
      expect(session.userId,'existingUid');
      await t.tap(find.byKey(const ValueKey('teyza-mode-switch')));await t.pumpAndSettle();
      expect(find.text('Select account'),findsOneWidget);
      expect(find.byKey(const ValueKey('mode-seller')),findsOneWidget);
      await t.tap(find.byKey(const ValueKey('mode-seller')));await t.pumpAndSettle();
      expect(session.sellerWorkspace,true);
      expect(find.byKey(const ValueKey('seller-nav-0')),findsOneWidget);
      await t.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
    });
  }
  for(final chooseSeller in [false,true]){
    testWidgets('Multiple existing accounts show Select account before routing to ${chooseSeller?'seller':'shopper'}',(t)async{
      final session=RoutingSession(),api=RoutingApi(RoutingSession(),shopper:true);
      await start(t,session,api,seller:const SellerShop('My salon','retail','Durban','approved','active'));
      expect(find.byKey(const ValueKey('nav-home')),findsOneWidget);
      expect(find.text('Select account'),findsNothing);
      expect(session.sellerWorkspace,false);
      await t.tap(find.byKey(const ValueKey('teyza-mode-switch')));await t.pumpAndSettle();
      expect(find.text('Select account'),findsOneWidget);
      expect(find.text('Business owner'),findsOneWidget);
      await t.tap(find.byKey(ValueKey(chooseSeller?'mode-seller':'mode-shopper')));
      await t.pumpAndSettle();
      expect(session.sellerWorkspace,chooseSeller);
      expect(session.userId,'existingUid');expect(session.hasAdminClaim,false);
      expect(find.text('Select account'),findsNothing);
      await t.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
    });
  }
  testWidgets('First social login opens home and offers Shopper / Business owner on account request',(t)async{
    final session=RoutingSession(),api=RoutingApi(RoutingSession());
    await start(t,session,api);
    expect(find.byKey(const ValueKey('nav-home')),findsOneWidget);
    expect(find.text('Finish registration'),findsNothing);
    await t.tap(find.byKey(const ValueKey('nav-account')));await t.pumpAndSettle();
    expect(find.text('Finish registration'),findsOneWidget);
    expect(find.byKey(const ValueKey('registration-shopper')),findsOneWidget);
    expect(find.byKey(const ValueKey('registration-seller')),findsOneWidget);
    expect(find.byKey(const ValueKey('registration-business-wholesale_supplier')),findsNothing);
    await t.tap(find.byKey(const ValueKey('registration-seller')));await t.pumpAndSettle();
    final category=find.text('Wholesalers & distributors').first;
    await t.ensureVisible(category);
    await t.pumpAndSettle();
    await t.tap(category);await t.pumpAndSettle();
    await t.ensureVisible(find.byKey(const ValueKey('registration-business-wholesale_supplier')));
    await t.tap(find.byKey(const ValueKey('registration-business-wholesale_supplier')));await t.pumpAndSettle();
    expect(session.requestedSellerCategory,'wholesale');
    expect(session.requestedBusinessType,'wholesale_supplier');
    expect(session.userId,'existingUid');
    expect(session.sellerWorkspace,true);expect(session.hasAdminClaim,false);
    await t.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('Account lookup failure offers retry and does not start a new registration',(t)async{
    final session=RoutingSession(),api=RoutingApi(RoutingSession(),shopper:true)..fail=true;
    await start(t,session,api);
    expect(find.byKey(const ValueKey('nav-home')),findsOneWidget);
    expect(find.text('Try again'),findsNothing);
    await t.tap(find.byKey(const ValueKey('nav-account')));await t.pumpAndSettle();
    expect(find.text('Try again'),findsOneWidget);
    expect(find.text('Finish registration'),findsNothing);
    api.fail=false;
    await t.tap(find.text('Try again'));await t.pumpAndSettle();
    expect(find.text('Try again'),findsNothing);expect(session.userId,'existingUid');
    expect(session.sellerWorkspace,false);
    await t.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('A late account lookup cannot reopen the seller workspace after logout',(t)async{
    final session=RoutingSession(),api=RoutingApi(RoutingSession());
    final pending=Completer<SellerShop?>();
    SharedPreferences.setMockInitialValues({});
    await t.pumpWidget(MaterialApp(home:ShopperHome(session:session,
      enableBackgroundServices:false,initialArea:areas.first,sellerMobileApi:api,
      sellerApiFactory:(uid,token)=>RoutingShop(uid:uid,token:token,pending:pending.future),
      catalogueLoader:()async=>[],directoryLoader:(_,__,___)async=>[])));
    await t.pump();await session.signOut();
    pending.complete(const SellerShop('Old shop','spaza','Durban','approved','active'));
    await t.pumpAndSettle();
    expect(session.userId,isNull);expect(session.sellerWorkspace,false);
    expect(find.text('Select account'),findsNothing);
    await t.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
}
