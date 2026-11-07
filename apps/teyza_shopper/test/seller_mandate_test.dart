import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_mandate.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'seller_experience_test.dart' as fixtures;
class MandateApi extends TeyzaMobileApi {
 MandateApi(super.session);
 final submissions=<Map<String,dynamic>>[];
 @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
  if(action=='seller_mandate_status')return {'amountCents':9900,'termsVersion':'teyza-debit-request-v2','termsTemplate':'Authorise R99.00 starting {firstDate}, monthly day {collectionDay}.','banks':[{'name':'FNB','branchCode':'250655'}],'benefits':['Visibility on Teyza'],'identity':{'kind':'id','evidenceId':'current-id'},'seller':{'shopName':'Example spaza','shopAddress':'12 Shop Road, Durban','phone':'0712345678','firstName':'Test','surname':'Owner','accountHolder':'Test Owner'}};
  if(action=='seller_mandate_submit'){submissions.add(data);return {'mandate':{'mandateId':data['requestId'],'status':'pending_provider_authentication','bankName':'FNB','accountLast4':'8901','collectionDay':data['collectionDay'],'firstDate':data['firstDate'],'terms':'R99 consent'}};}
  return {};
 }
}
Finder field(String label)=>find.byWidgetPredicate((w)=>w is TextField&&w.decoration?.labelText==label);
Future<void> fill(WidgetTester t,String label,String value) async {final f=field(label);await t.ensureVisible(f);await t.pumpAndSettle();await t.enterText(f,value);await t.pumpAndSettle();}
void main(){
 testWidgets('Bank selection fills the branch code while the personal account number stays empty',(t) async {
  final session=fixtures.Session(),api=MandateApi(fixtures.Session());
  await t.pumpWidget(MaterialApp(home:SellerMandatePage(session:session,api:api)));await t.pumpAndSettle();
  final bank=find.byKey(const ValueKey('mandate-bank'));
  await fixtures.visibleTap(t,bank);await t.tap(find.text('FNB').last);await t.pumpAndSettle();
  expect(t.widget<TextField>(field('Branch code (filled when bank is selected)')).controller!.text,'250655');
  expect(t.widget<TextField>(field('Account number')).controller!.text,isEmpty);
  await fixtures.visibleTap(t,find.text('Sign & submit R99 mandate'));expect(api.submissions,isEmpty);
  await t.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('The exact R99 date, current ID and explicit consents are submitted; account changes clear private fields',(t) async {
  final session=fixtures.Session(),api=MandateApi(fixtures.Session());
  await t.pumpWidget(MaterialApp(home:SellerMandatePage(session:session,api:api)));await t.pumpAndSettle();
  await t.scrollUntilVisible(find.text('Test Owner · 0712345678'),250);
  expect(find.text('Test Owner · 0712345678'),findsOneWidget);
  expect(field('ID / passport number'),findsNothing,
    reason:'Verified ID is reused without retyping its number');
  final bank=find.byKey(const ValueKey('mandate-bank'));await fixtures.visibleTap(t,bank);await t.tap(find.text('FNB').last);await t.pumpAndSettle();
  expect(find.text('Account holder: Test Owner'),findsOneWidget);
  await fill(t,'Account number','12345678901');
  await fixtures.visibleTap(t,find.byKey(const ValueKey('mandate-collection-date')));await t.pumpAndSettle();await t.tap(find.text('OK'));await t.pumpAndSettle();
  await fixtures.visibleTap(t,find.text('I consent to Teyza processing this private ID/passport for owner verification.'));
  await fixtures.visibleTap(t,find.text('I have read and authorise the exact amount, dates and bank account above.'));
  await fixtures.visibleTap(t,find.text('Sign & submit R99 mandate'));await t.pumpAndSettle();
  expect(api.submissions.length,1);final d=api.submissions.single;expect(d['amountCents'],9900);expect(d['identityEvidenceId'],'current-id');expect(d['identityConsent'],true);expect(d['consent'],true);expect(d['firstDate'],isNotEmpty);expect(find.text('Mandate securely submitted for administrator review. No debit has been collected.'),findsOneWidget);
  session.switchAccount();await t.pumpAndSettle();expect(find.text('Your account changed. Close this form and sign in again.'),findsOneWidget);expect(find.textContaining('8901'),findsNothing);
  await t.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
}
