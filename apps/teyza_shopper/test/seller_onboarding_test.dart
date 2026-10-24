import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/native_firebase.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/seller_onboarding.dart';
import 'package:teyza_shopper/seller_phone.dart';
import 'package:teyza_shopper/seller_tools.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'seller_experience_test.dart' as fixtures;

class OnboardApi extends TeyzaMobileApi {
 OnboardApi(super.session);
 bool offline=false,complete=false;
 final calls=<String>[];
 @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
  calls.add(action);if(offline)throw const ShopServiceUnavailable();
  if(action=='seller_onboarding')return {'legalType':'individual','phone':'+27712345678','phoneVerified':complete,
   if(complete)'identity':{'kind':'id'},if(complete)'selfie':{'status':'pending_review'}};
  return {'settings':{},'sellingStatus':'active'};
 }
}
class PhoneSession extends fixtures.Session {
 final links=<List<String>>[];
 @override Future<void> linkPhone(String id,String code,String number) async {links.add([id,code,number]);phoneVerified=true;phoneNumber=number;}
}
class FakeSender implements PhoneCodeSender {
 int sends=0;
 @override Future<void> send(String phone,{int? resendToken,required void Function(String,int?) onSent,
  required void Function(Object) onError,required void Function(String,String) onAutomatic,void Function(Future<void> Function())? onInstant}) async {sends++;onSent('real-verification-session',7);}
}
class InstantSender implements PhoneCodeSender {
 late void Function(Future<void> Function()) completion;
 @override Future<void> send(String phone,{int? resendToken,required void Function(String,int?) onSent,
  required void Function(Object) onError,required void Function(String,String) onAutomatic,void Function(Future<void> Function())? onInstant}) async {completion=onInstant!;}
}
void main(){
 const shop=SellerShop('Local Market','spaza','Durban','pending','not_listed',phone:'+27712345678');
 test('South African numbers normalize without changing international numbers or accepting missing country codes',(){
  expect(normalizeMobile('071 234 5678'),'+27712345678');expect(normalizeMobile('+264 81 123 4567'),'+264811234567');
  expect(()=>normalizeMobile('12345'),throwsFormatException);
  expect(NativeFirebase.validAppId('1:983479810697:web:aabb','android'),isFalse);
 });
 testWidgets('Selfie camera opens even when the shop service is unavailable',(tester) async{
  final session=fixtures.Session(),api=OnboardApi(fixtures.Session())..offline=true;
  final bytes=(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();var captured=false;
  await tester.pumpWidget(MaterialApp(home:SellerToolPage(session:session,api:api,tool:SellerTool.verification,
    captureSelfie:() async{captured=true;return bytes;})));await tester.pumpAndSettle();
  await fixtures.visibleTap(tester,find.text('Open selfie camera'));
  expect(captured,true);expect(find.text('Retake selfie'),findsOneWidget);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Document camera is independent of service health and cannot silently activate a seller',(tester) async{
  final session=fixtures.Session(),api=OnboardApi(fixtures.Session())..offline=true;
  final bytes=(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();var captured=false;
  await tester.pumpWidget(MaterialApp(home:SellerOnboardingPage(session:session,shop:shop,api:api,captureDocument:(_) async{captured=true;return bytes;})));
  await tester.pumpAndSettle();await fixtures.visibleTap(tester,find.text('Photograph document'));
  expect(captured,true);expect(find.byType(Image),findsOneWidget);
  final finish=find.widgetWithText(FilledButton,'Finish setup & start selling');
  await tester.scrollUntilVisible(finish,250,scrollable:find.byType(Scrollable).first);await tester.pumpAndSettle();expect(tester.widget<FilledButton>(finish).onPressed,isNull);
  expect(api.calls.contains('seller_onboarding_complete'),false);
  session.switchAccount();await tester.pump();expect(find.byType(Image),findsNothing);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('All three server-confirmed steps enable completion while pending manual review',(tester) async{
  final session=fixtures.Session(),api=OnboardApi(fixtures.Session())..complete=true;
  await tester.pumpWidget(MaterialApp(home:SellerOnboardingPage(session:session,shop:shop,api:api)));await tester.pumpAndSettle();
  final finish=find.widgetWithText(FilledButton,'Finish setup & start selling');await tester.scrollUntilVisible(finish,250,scrollable:find.byType(Scrollable).first);await tester.pumpAndSettle();
  expect(tester.widget<FilledButton>(finish).onPressed,isNotNull);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('OTP screen sends on consent and links the six digit code to the existing account',(tester) async{
  final session=PhoneSession(),sender=FakeSender();
  await tester.pumpWidget(MaterialApp(home:SellerPhonePage(session:session,phone:'0712345678',sender:sender)));await tester.pumpAndSettle();
  final send=find.widgetWithText(FilledButton,'Send SMS code');expect(tester.widget<FilledButton>(send).onPressed,isNull);
  await fixtures.visibleTap(tester,find.text('Send me a verification SMS'));await fixtures.visibleTap(tester,send);
  expect(sender.sends,1);await tester.enterText(find.byType(TextField),'123456');tester.testTextInput.hide();await tester.pump();
  await fixtures.visibleTap(tester,find.text('Verify mobile number'));
  expect(session.links,[['real-verification-session','123456','+27712345678']]);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 test('Service 404 has an actionable activation reference, rather than a misleading retry instruction',() async{
  final session=fixtures.Session();final client=MockClient((_) async=>http.Response('<h1>Not found</h1>',404));
  await expectLater(TeyzaMobileApi(session,client:client).call('seller_summary'),throwsA(isA<ShopServiceUnavailable>()));
  client.close();session.dispose();
 });
 test('Fallback registration creates only the strict owner-scoped pending profile',() async{
  final client=MockClient((request) async{
   final writes=jsonDecode(request.body)['writes'] as List;expect(writes.length,1);
   final write=writes.single as Map;expect(write['currentDocument'],{'exists':false});
   final update=write['update'] as Map;expect(update['name'],endsWith('teyzaSellerAccounts/owner'));
   final fields=update['fields'] as Map;expect(fields['uid'],{'stringValue':'owner'});expect(fields['approvalStatus'],{'stringValue':'pending'});
   expect(fields['listingStatus'],{'stringValue':'not_listed'});expect(fields.containsKey('sellingEnabled'),false);
   expect(write['updateTransforms'],hasLength(2));return http.Response('{}',200);
  });
  await SellerFirestore(uid:'owner',token:'token',client:client).registerShop(category:'spaza',shopName:'Local Market',phone:'+27712345678',address:'Durban',ownerEmail:'owner@test');
  client.close();
 });
 test('Offline batch retries skip existing drafts and never overwrite reserved stock',() async{
  var commits=0;
  final client=MockClient((request) async{
   if(request.method=='GET')return http.Response(jsonEncode({'documents':[{'name':'projects/demo/documents/teyzaDraftProducts/owner/items/bread',
    'fields':{'ownerUid':{'stringValue':'owner'},'status':{'stringValue':'draft'},'stockQty':{'integerValue':'0'}}}]}),200);
   commits++;final writes=jsonDecode(request.body)['writes'] as List;
   for(final write in writes){expect(write['currentDocument'],{'exists':false});}
   if(commits==1)return http.Response('{}',409);
   expect(writes,hasLength(1));expect(writes.single['update']['name'],endsWith('/milk'));return http.Response('{}',200);
  });
  final result=await SellerFirestore(uid:'owner',token:'t',client:client).saveNewDrafts([
   const SellerDraft(id:'bread',name:'Bread',category:'Bakery',priceCents:1800,stock:8),
   const SellerDraft(id:'milk',name:'Milk',category:'Dairy',priceCents:3000,stock:4)]);
  expect(commits,2);expect(result,['milk']);client.close();
 });
 testWidgets('A late Android instant-verification callback cannot link a changed account',(tester) async{
  final session=PhoneSession(),sender=InstantSender();var linked=false;
  await tester.pumpWidget(MaterialApp(home:SellerPhonePage(session:session,phone:'0712345678',sender:sender)));await tester.pumpAndSettle();
  await fixtures.visibleTap(tester,find.text('Send me a verification SMS'));
  await fixtures.visibleTap(tester,find.text('Send SMS code'));
  session.switchAccount();await tester.pump();sender.completion(() async{linked=true;});await tester.pump();expect(linked,false);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });

}
