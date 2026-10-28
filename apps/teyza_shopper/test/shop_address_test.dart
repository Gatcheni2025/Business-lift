import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shop_address.dart';
import 'package:teyza_shopper/seller_registration.dart';
import 'seller_experience_test.dart' as fixtures;

class SlowAddressApi extends fixtures.ExperienceApi {
  SlowAddressApi(super.session);
  final first=Completer<Map<String,dynamic>>();
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) {
    if(action=='seller_address_suggest'&&data['query']=='Old address')return first.future;
    return super.call(action,data);
  }
}
void main(){
 test('Address sessions are distinct version 4 UUIDs and unusable coordinates cannot be selected',(){
  final first=newAddressSession(),second=newAddressSession();expect(first,isNot(second));
  expect(first,matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
  expect(()=>ShopAddressSelection.fromJson({...fixtures.addressFixture,'latitude':0,'longitude':0}),throwsStateError);
 });
 testWidgets('Typing a street does not register a seller, and editing a selected address invalidates it',(tester) async {
  final session=fixtures.Session(),api=fixtures.ExperienceApi(fixtures.Session());
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(home:SellerRegistrationPage(session:session,api:api)));await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextFormField).at(0),'Local Market');await tester.enterText(find.byType(TextFormField).at(1),'0712345678');
  final field=find.byKey(const ValueKey('shop-address-search'));await tester.ensureVisible(field);await tester.enterText(field,'Main Road');
  tester.testTextInput.hide();await tester.pump(const Duration(milliseconds:500));await tester.pumpAndSettle();
  await fixtures.visibleTap(tester,find.text('Continue to seller verification'));
  expect(find.text('Select your full shop address from the suggestions.'),findsOneWidget);
  expect(api.calls.where((c)=>c.action=='seller_register'),isEmpty);
  await fixtures.selectAddress(tester);expect(find.text('Full address selected'),findsOneWidget);
  await tester.ensureVisible(field);await tester.enterText(field,'Different street');tester.testTextInput.hide();
  await tester.pump(const Duration(milliseconds:500));await tester.pumpAndSettle();
  expect(find.text('Full address selected'),findsNothing);
  await fixtures.visibleTap(tester,find.text('Continue to seller verification'));expect(api.calls.where((c)=>c.action=='seller_register'),isEmpty);
  expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('A delayed result cannot replace suggestions for the latest address',(tester) async {
  final session=fixtures.Session(),api=SlowAddressApi(fixtures.Session());
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:ShopAddressPicker(session:session,api:api,onChanged:(_){}))));
  final field=find.byKey(const ValueKey('shop-address-search'));
  await tester.enterText(field,'Old address');await tester.pump(const Duration(milliseconds:500));
  await tester.enterText(field,'12 Main Road Durban');await tester.pump(const Duration(milliseconds:500));await tester.pumpAndSettle();
  api.first.complete({'suggestions':[{'label':'Wrong old address','predictionToken':'old'}]});await tester.pumpAndSettle();
  expect(find.text('Wrong old address'),findsNothing);expect(find.widgetWithText(ListTile,fixtures.addressFixture['address'] as String),findsOneWidget);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Switching account during address search clears the form and discards the reply',(tester) async {
  final session=fixtures.Session(),api=SlowAddressApi(fixtures.Session());ShopAddressSelection? selected;
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:ShopAddressPicker(session:session,api:api,onChanged:(value)=>selected=value))));
  final field=find.byKey(const ValueKey('shop-address-search'));
  await tester.enterText(field,'Old address');await tester.pump(const Duration(milliseconds:500));session.switchAccount();await tester.pump();
  api.first.complete({'suggestions':[{'label':'Private old address','predictionToken':'old'}]});await tester.pumpAndSettle();
  expect(find.text('Private old address'),findsNothing);expect(selected,isNull);
  expect(tester.widget<TextFormField>(field).enabled,isFalse);expect(tester.widget<TextFormField>(field).controller!.text,isEmpty);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
}
