import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_plan.dart';
import 'package:teyza_shopper/seller_mandate.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class _PlanApi extends TeyzaMobileApi {
 _PlanApi(super.session);
 final calls=<String>[];
 bool approved=true,failSummary=false,setupReady=true,failMandateStatus=false;
 @override
 Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}])async{
   calls.add(action);
   if(action=='seller_summary'&&failSummary)throw StateError('Temporary seller status failure');
   if(action=='seller_summary')return {'ok':true,'listingPaid':false,
     'complimentaryAccess':false,'approvalStatus':approved?'approved':'pending','setupComplete':approved&&setupReady};
   if(action=='seller_mandate_status'&&failMandateStatus)throw StateError('Mandate service unavailable');
   if(action=='seller_mandate_status')return {'ok':true,'mandate':null,'termsVersion':'test-terms',
     'termsTemplate':'R99 from {firstDate}, on day {collectionDay}.',
     'banks':[{'name':'FNB','branchCode':'250655'}],
     'identity':{'kind':'id','evidenceId':'current-id'},
     'seller':{'shopName':'Example shop','shopAddress':'Test road','phone':'0710000000',
       'firstName':'Test','surname':'Owner','accountHolder':'Test Owner'}};
   return {'ok':true};
 }
}
void main(){
 test('External mandate entry is gated to direct-distributed Android builds only',(){
   expect(teyzaCanOpenMembershipPage(isAndroid:true,channel:'direct'),isTrue);
   expect(teyzaCanOpenMembershipPage(isAndroid:true,channel:'store'),isFalse);
   expect(teyzaCanOpenMembershipPage(isAndroid:false,channel:'direct'),isFalse);
   expect(teyzaSellerMembershipPage.host,'teyza.co.za');
   expect(teyzaSellerMembershipPage.query,isEmpty);
 });
 testWidgets('Store build shows membership information without Paystack seller purchase',(tester)async{
   await tester.binding.setSurfaceSize(const Size(420,860));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=ShopperSession(),api=_PlanApi(session);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api)));
   await tester.pumpAndSettle();
   expect(find.text('R99 / month'),findsNothing);
   expect(find.text('Sell on Teyza'),findsWidgets);
   await tester.scrollUntilVisible(find.textContaining('There is no membership purchase in this app.'),300);
   expect(find.textContaining('There is no membership purchase in this app.'),findsOneWidget);
   expect(find.text('Upgrade now'),findsNothing);
   expect(find.textContaining('Netcash'),findsNothing);
   expect(find.textContaining('debit-order'),findsNothing);
   expect(find.textContaining('R99'),findsNothing);
   expect(find.textContaining('Pay securely with Paystack'),findsNothing);
   expect(find.textContaining('R49'),findsNothing);
   expect(api.calls,contains('seller_summary'));
   expect(api.calls,isNot(contains('seller_mandate_status')));
   expect(api.calls,isNot(contains('seller_mandate_submit')));
   expect(api.calls,isNot(contains('billing_checkout')));
   expect(api.calls,isNot(contains('promote_checkout')));
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Approved direct-channel seller sees benefits and opens the prefilled mandate',(tester)async{
   await tester.binding.setSurfaceSize(const Size(420,860));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=ShopperSession(),api=_PlanApi(session);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api,directMandateOverride:true)));
   await tester.pumpAndSettle();
   expect(find.text('R99 / month'),findsOneWidget);
   await tester.scrollUntilVisible(find.text('Upgrade now'),350);
   await tester.tap(find.text('Upgrade now'));await tester.pumpAndSettle();
   expect(find.text('Membership & mandate'),findsOneWidget);
   await tester.scrollUntilVisible(find.byKey(const ValueKey('mandate-bank')),300,scrollable:find.byType(Scrollable).first);
   expect(find.text('Account holder: Test Owner'),findsOneWidget);
   expect(find.byKey(const ValueKey('mandate-bank')),findsOneWidget);
   expect(api.calls,isNot(contains('seller_mandate_submit')));
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Successful mandate route returns through Sell on Teyza to the dashboard',(tester)async{
   await tester.binding.setSurfaceSize(const Size(420,860));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=ShopperSession(),api=_PlanApi(session);
   await tester.pumpWidget(MaterialApp(home:Scaffold(body:Builder(builder:(ctx)=>FilledButton(
     onPressed:()=>Navigator.push<bool>(ctx,MaterialPageRoute(builder:(_)=>SellerPlanPage(
       session:session,api:api,directMandateOverride:true))),
     child:const Text('Seller dashboard'))))));
   await tester.tap(find.text('Seller dashboard'));await tester.pumpAndSettle();
   await tester.scrollUntilVisible(find.text('Upgrade now'),350);
   await tester.tap(find.text('Upgrade now'));await tester.pumpAndSettle();
   expect(find.text('Membership & mandate'),findsOneWidget);
   Navigator.of(tester.element(find.byType(SellerMandatePage))).pop(true);
   await tester.pumpAndSettle();
   expect(find.text('Seller dashboard'),findsOneWidget);
   expect(find.byType(SellerPlanPage),findsNothing);
   expect(find.byType(SellerMandatePage),findsNothing);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Approved seller can open mandate even when other shop setup is incomplete',(tester)async{
   await tester.binding.setSurfaceSize(const Size(420,860));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=ShopperSession(),api=_PlanApi(session)..setupReady=false;
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api,directMandateOverride:true)));
   await tester.pumpAndSettle();
   await tester.scrollUntilVisible(find.byKey(const ValueKey('seller-upgrade-now')),350);
   final upgrade=find.byKey(const ValueKey('seller-upgrade-now'));
   expect(tester.widget<FilledButton>(upgrade).onPressed,isNotNull);
   expect(find.textContaining('You can complete your R99 mandate now'),findsOneWidget);
   await tester.tap(upgrade);await tester.pumpAndSettle();
   expect(find.text('Membership & mandate'),findsOneWidget);
   expect(api.calls,contains('seller_mandate_status'));
   expect(api.calls,isNot(contains('billing_checkout')));
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Mandate status failure does not hide the button from an approved seller',(tester)async{
   await tester.binding.setSurfaceSize(const Size(420,860));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=ShopperSession(),api=_PlanApi(session)..failMandateStatus=true;
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api,directMandateOverride:true)));
   await tester.pumpAndSettle();
   await tester.scrollUntilVisible(find.byKey(const ValueKey('seller-upgrade-now')),350);
   final upgrade=find.byKey(const ValueKey('seller-upgrade-now'));
   expect(tester.widget<FilledButton>(upgrade).onPressed,isNotNull);
   await tester.tap(upgrade);await tester.pumpAndSettle();
   expect(find.text('Membership & mandate'),findsOneWidget);
   expect(find.text('Retry'),findsOneWidget);
   expect(api.calls,isNot(contains('billing_checkout')));
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Pending sellers can read benefits but cannot open a mandate',(tester)async{
   final session=ShopperSession(),api=_PlanApi(session)..approved=false;
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api,directMandateOverride:true)));
   await tester.pumpAndSettle();
   await tester.scrollUntilVisible(find.text('Upgrade now'),350);
   expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Upgrade now')).onPressed,isNull);
   expect(find.textContaining('Waiting for admin approval'),findsOneWidget);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Seller still sees R99 benefits and retry when status service is unavailable',(tester)async{
   final session=ShopperSession(),api=_PlanApi(session)..failSummary=true;
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api,directMandateOverride:true)));
   await tester.pumpAndSettle();
   expect(find.text('R99 / month'),findsOneWidget);
   expect(find.textContaining('Could not refresh your seller status'),findsOneWidget);
   expect(find.byType(LinearProgressIndicator),findsNothing);
   api.failSummary=false;
   await tester.tap(find.text('Try again'));
   await tester.pumpAndSettle();
   expect(find.textContaining('Could not refresh your seller status'),findsNothing);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Membership status reload is read-only and never initiates a debit',(tester)async{
   final session=ShopperSession(),api=_PlanApi(session);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api)));
   await tester.pumpAndSettle();
   await tester.scrollUntilVisible(find.text('Refresh membership status'),350);
   await tester.ensureVisible(find.text('Refresh membership status'));
   await tester.pumpAndSettle();
   await tester.tap(find.widgetWithText(OutlinedButton,'Refresh membership status'));
   await tester.pumpAndSettle();
   expect(api.calls.where((x)=>x=='seller_summary').length,2);
   expect(api.calls.where((x)=>x=='seller_mandate_submit'),isEmpty);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
}
