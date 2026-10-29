import 'dart:async';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'package:teyza_shopper/seller_tools.dart';
import 'package:teyza_shopper/shopper_account.dart';
import 'package:teyza_shopper/shop_orders.dart';

class TestStore implements SessionStore {
  final data=<String,String>{};
  @override Future<String?> read(String key) async=>data[key];
  @override Future<void> write(String key,String value) async{data[key]=value;}
  @override Future<void> delete(String key) async{data.remove(key);}
}
class TestSession extends ShopperSession {
  TestSession(){userId='owner1';idToken='old';emailVerified=true;isReady=true;}
  @override Future<String> freshIdToken() async=>'fresh-token';
}
class FakeMobile extends TeyzaMobileApi {
  final calls=<Map<String,dynamic>>[];
  FakeMobile(super.session);
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
    calls.add({'action':action,'data':data});
    if(action=='seller_summary')return {'settings':{'pickupEnabled':true,'deliveryEnabled':false,
      'deliveryFeeCents':0,'deliveryRadiusKm':5},'credit':[],'verification':{'status':'pending_review'}};
    if(action=='order_list')return {'orders':[]};
    if(action=='order_quote')return {'quote':{'quoteId':'checked-total','items':[{'id':'bread','name':'Bread','quantity':2,'priceCents':1800}],
      'subtotalCents':3600,'deliveryFeeCents':0,'cashDiscountCents':0,'cardFeeCents':0,'totalCents':3600}};
    return {'ok':true,'id':'request1','status':'requested'};
  }
}
void main(){
  test('Mobile API sends a refreshed Firebase identity and rejects stale account results',() async{
    final session=TestSession();final response=Completer<http.Response>(),started=Completer<void>();
    final client=MockClient((r){
      expect(r.headers['Authorization'],'Bearer fresh-token');
      expect(r.url.host,'us-central1-business-lift-3c19c.cloudfunctions.net');
      expect(jsonDecode(r.body)['action'],'seller_summary');started.complete();return response.future;
    });
    final call=TeyzaMobileApi(session,client:client).call('seller_summary');await started.future;
    session.userId='different-account';response.complete(http.Response('{"ok":true,"settings":{"private":"previous"}}',200));
    await expectLater(call,throwsStateError);session.dispose();client.close();
  });
  test('Trading hours use South African time and the previous overnight opening',(){
    final hours=List.generate(7,(_)=>const TradingDay(closed:true));
    hours[0]=const TradingDay(open:'20:00',close:'02:00');
    expect(shopHoursLabel(hours,now:DateTime.utc(2026,10,19,23,30)),'Open now · closes 02:00');
    expect(shopHoursLabel(hours,now:DateTime.utc(2026,10,20,1)),'Closed today');
    expect(shopHoursLabel([]),'Ask the shop for opening hours');
  });
  test('Apple sign-in passes a hashed random nonce to Apple and its original to Firebase',() async{
    debugDefaultTargetPlatformOverride=TargetPlatform.iOS;addTearDown(()=>debugDefaultTargetPlatformOverride=null);
    String? appleHash;
    final client=MockClient((r) async{
      if(r.url.path.endsWith('signInWithIdp')){
        final body=jsonDecode(r.body) as Map;
        final form=Uri.splitQueryString(body['postBody'] as String);
        expect(form['providerId'],'apple.com');expect(form['id_token'],'apple-test-token');
        expect(sha256.convert(utf8.encode(form['nonce']!)).toString(),appleHash);
        expect(form['nonce'],isNot(appleHash));
        return http.Response(jsonEncode({'localId':'apple-user','idToken':'firebase-token',
          'refreshToken':'firebase-refresh','email':'private@relay.example'}),200);
      }
      if(r.url.path.endsWith('lookup'))return http.Response(jsonEncode({'users':[{
        'localId':'apple-user','email':'private@relay.example','emailVerified':true}]}),200);
      return http.Response('{}',200);
    });
    final session=ShopperSession(client:client,store:TestStore(),appleRequest:(hash) async{
      appleHash=hash;expect(hash.length,64);return const AppleIdentity('apple-test-token',name:'Apple Shopper');
    });
    await session.signInWithApple();expect(session.userId,'apple-user');expect(session.emailVerified,isTrue);
    expect(session.name,'Apple Shopper');session.dispose();client.close();
  });
  testWidgets('iPhone shopper login offers Google and Apple with email',(tester) async{
    final session=ShopperSession(store:TestStore())..isReady=true;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(session:session))));
    await tester.tap(find.text('Continue as Shopper'));await tester.pumpAndSettle();
    expect(find.text('Continue with Google'),findsOneWidget);expect(find.text('Continue with Apple'),findsOneWidget);
    expect(find.text('Sign in as shopper'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  },variant:TargetPlatformVariant.only(TargetPlatform.iOS));
  testWidgets('Owner dashboard exposes all requested tools on a narrow screen',(tester) async{
    await tester.binding.setSurfaceSize(const Size(320,740));addTearDown(()=>tester.binding.setSurfaceSize(null));
    final selected=<SellerTool>[];var products=false,chat=false,orders=false;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:MediaQuery(
      data:const MediaQueryData(textScaler:TextScaler.linear(1.5)),child:SingleChildScrollView(child:SellerDashboard(
        productCount:3,onProducts:()=>products=true,onChat:()=>chat=true,onOrders:()=>orders=true,
        onProfile:(){},onTool:selected.add))))));
    expect(tester.takeException(),isNull);
    for(final label in ['Shop setup','Live chat','Customer orders','Delivery & collect','Trading hours','Finance & credit','Order stock','Verify owner']){
      final target=find.text(label);await tester.ensureVisible(target);await tester.tap(target);await tester.pumpAndSettle();
    }
    expect(products,isTrue);expect(chat,isTrue);expect(orders,isTrue);expect(selected,hasLength(5));
    expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('Seller services save actual toggles through the authenticated API',(tester) async{
    final session=TestSession(),api=FakeMobile(TestSession());
    await tester.pumpWidget(MaterialApp(home:SellerToolPage(session:session,tool:SellerTool.services,api:api)));
    await tester.pumpAndSettle();
    final target=find.text('Cash back');await tester.ensureVisible(target);await tester.tap(target);await tester.pumpAndSettle();
    final save=find.text('Save shop services');await tester.ensureVisible(save);await tester.tap(save);await tester.pumpAndSettle();
    final request=api.calls.last;expect(request['action'],'save_services');
    expect(request['data']['cashback'],isTrue);expect(request['data']['pickupEnabled'],isTrue);
    expect(request['data']['deliveryEnabled'],isFalse);expect(find.text('Shop services saved.'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
  testWidgets('A selfie submission is shown as pending review, not an automatic face match',(tester) async{
    final session=TestSession();final api=FakeMobile(session);
    await tester.pumpWidget(MaterialApp(home:SellerToolPage(session:session,tool:SellerTool.verification,api:api)));
    await tester.pumpAndSettle();expect(find.text('Selfie awaiting review'),findsOneWidget);
    expect(find.text('Open selfie camera'),findsOneWidget);expect(find.text('Face verified'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('Checkout sends product IDs and quantities without client totals',(tester) async{
    final session=TestSession();final api=FakeMobile(session);
    await tester.pumpWidget(MaterialApp(home:ShopperCheckoutPage(session:session,shopId:'shop1',shopName:'Corner Shop',
      items:const [{'id':'bread','name':'Bread','quantity':2,'priceCents':1800}],delivery:true,collection:true,api:api)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first,'0712345678');
    tester.testTextInput.hide();await tester.pumpAndSettle();
    final send=find.text('Send order request');
    await tester.scrollUntilVisible(send,180,scrollable:find.byType(Scrollable).first);
    await tester.tap(send);await tester.pumpAndSettle();
    final data=api.calls.last['data'] as Map;expect(data['mode'],'collection');
    expect(data['items'],[{'id':'bread','quantity':2}]);expect(data.containsKey('totalCents'),isFalse);
    expect(data['expectedQuoteId'],'checked-total');
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
}
