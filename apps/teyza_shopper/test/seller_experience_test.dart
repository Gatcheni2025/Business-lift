import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_notifications.dart';
import 'package:teyza_shopper/seller_premium.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/seller_registration.dart';
import 'package:teyza_shopper/seller_review.dart';
import 'package:teyza_shopper/seller_tools.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class Session extends ShopperSession{
 Session(){isReady=true;userId='owner';emailVerified=true;idToken='token';}
 @override Future<String> freshIdToken() async=>'token';
 void switchAccount(){userId='another';notifyListeners();}
}
class ExperienceApi extends TeyzaMobileApi{
 ExperienceApi(super.session);
 final calls=<({String action,Map<String,dynamic> data})>[];
 bool denied=false;
 Uint8List? image;
 @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
  calls.add((action:action,data:data));
  if(denied)throw StateError('Teyza administrator access is required.');
  return switch(action){
   'notification_list'=>{'notifications':[{'id':'notice','title':'New order request','body':'Open your orders to respond.','read':false,'target':'orders'}]},
   'admin_seller_queue'=>{'sellers':[{'sellerUid':'seller1','submissionId':'submission1','shopName':'Durban Corner Shop','category':'spaza',
    'address':'KwaMashu, Durban','phone':'0712345678','ownerEmail':'owner@example.test','approvalStatus':'pending','listingStatus':'not_listed'}]},
   'verification_read'=>{'imageBase64':base64Encode(image!)},
   'seller_summary'=>{'settings':{},'credit':[]},
   _=>{'ok':true}
  };
 }
}
Future<void> visibleTap(WidgetTester tester,Finder finder) async{
 await tester.ensureVisible(finder);await tester.pumpAndSettle();
 expect(finder.hitTestable(),findsOneWidget);await tester.tap(finder);await tester.pumpAndSettle();
}
void main(){
 testWidgets('Notifications mark only the selected item and clear private rows on account switch',(tester) async{
  final session=Session(),api=ExperienceApi(Session());
  await tester.pumpWidget(MaterialApp(home:SellerNotificationsPage(session:session,api:api)));
  await tester.pumpAndSettle();expect(find.text('New order request'),findsOneWidget);
  await visibleTap(tester,find.text('New order request'));
  expect(api.calls.last.data,{'ids':['notice']});
  session.switchAccount();await tester.pump();expect(find.text('New order request'),findsNothing);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Review desk denies non-admins and cannot expose seller registrations',(tester) async{
  final session=Session(),api=ExperienceApi(Session())..denied=true;
  await tester.pumpWidget(MaterialApp(home:SellerReviewPage(session:session,api:api)));await tester.pumpAndSettle();
  expect(find.text('Teyza administrator access is required.'),findsOneWidget);expect(find.text('Durban Corner Shop'),findsNothing);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Admin approval requires opening the private photo, confirming review and confirming the decision',(tester) async{
  final session=Session(),api=ExperienceApi(Session());
  api.image=(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();
  await tester.pumpWidget(MaterialApp(home:SellerReviewPage(session:session,api:api)));await tester.pumpAndSettle();
  await tester.tap(find.text('Durban Corner Shop'));await tester.pumpAndSettle();
  var approve=find.widgetWithText(FilledButton,'Approve seller');
  await tester.scrollUntilVisible(approve,200);await tester.pumpAndSettle();
  expect(tester.widget<FilledButton>(approve).onPressed,isNull);
  await visibleTap(tester,find.text('View private selfie'));
  expect(api.calls.last.data,{'sellerUid':'seller1','submissionId':'submission1'});
  final confirmed=find.text('I have reviewed this selfie and the shop registration.');
  await visibleTap(tester,confirmed);
  await visibleTap(tester,approve);
  await tester.tap(find.text('Confirm review'));await tester.pumpAndSettle();
  final call=api.calls.firstWhere((r)=>r.action=='admin_seller_review');expect(call.data['status'],'approved');
  expect(call.data['submissionId'],'submission1');expect(call.data.containsKey('listingStatus'),isFalse);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Seller registration is native and cannot continue without required shop details',(tester) async{
  final session=Session(),api=ExperienceApi(Session());
  await tester.pumpWidget(MaterialApp(home:SellerRegistrationPage(session:session,api:api)));await tester.pumpAndSettle();
  final button=find.text('Continue to camera verification');await visibleTap(tester,button);
  expect(api.calls,isEmpty);expect(find.text('Enter shop name'),findsOneWidget);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Owner camera preview requires consent and submits a pending review, never an approval',(tester) async{
  final session=Session(),api=ExperienceApi(Session());
  final bytes=(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();
  await tester.pumpWidget(MaterialApp(home:SellerToolPage(session:session,tool:SellerTool.verification,api:api,captureSelfie:() async=>bytes)));
  await tester.pumpAndSettle();await visibleTap(tester,find.text('Open selfie camera'));
  expect(find.text('Retake selfie'),findsOneWidget);
  await visibleTap(tester,find.text('Submit selfie for review'));
  expect(api.calls.where((r)=>r.action=='verification_selfie'),isEmpty);
  final consent=find.text('I agree to submit my selfie for Teyza shop-owner verification.');await visibleTap(tester,consent);
  await visibleTap(tester,find.text('Submit selfie for review'));
  final submission=api.calls.firstWhere((r)=>r.action=='verification_selfie');expect(submission.data['consent'],true);
  expect(submission.data.containsKey('status'),false);expect(find.text('Selfie awaiting review'),findsOneWidget);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Camera denial gives a recoverable permission message without submitting a selfie',(tester) async{
  final session=Session(),api=ExperienceApi(Session());
  await tester.pumpWidget(MaterialApp(home:SellerToolPage(session:session,tool:SellerTool.verification,api:api,
   captureSelfie:() async=>throw StateError('Camera denied'))));await tester.pumpAndSettle();
  await visibleTap(tester,find.text('Open selfie camera'));
  expect(find.textContaining('Allow camera access'),findsOneWidget);expect(api.calls.where((r)=>r.action=='verification_selfie'),isEmpty);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Premium shop header and setup remain readable at 320px with larger text',(tester) async{
  await tester.binding.setSurfaceSize(const Size(320,740));addTearDown(()=>tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:MediaQuery(data:const MediaQueryData(textScaler:TextScaler.linear(1.5)),
   child:ListView(padding:const EdgeInsets.all(16),children:[
    SellerShopHero(shop:const SellerShop('KwaMashu Fresh Market','retail','Durban','pending','not_listed'),productCount:184,unread:100,onNotifications:(){}),
    SellerSetupCard(products:184,verification:'pending_review',onVerify:(){},onProducts:(){})
   ])))));await tester.pumpAndSettle();expect(tester.takeException(),isNull);
  await tester.pumpWidget(const SizedBox.shrink());
 });
}
