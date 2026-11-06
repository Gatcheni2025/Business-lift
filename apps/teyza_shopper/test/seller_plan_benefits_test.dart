import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_plan.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class _PlanApi extends TeyzaMobileApi {
 _PlanApi(super.session,{this.introEligible=true});
 final bool? introEligible;
 final calls=<String>[];
 @override
 Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
  calls.add(action);
  if(action=='seller_summary')return {'ok':true,'listingPaid':false,'promotionActive':false,
    if(introEligible!=null)'introEligible':introEligible};
  return {'ok':true};
 }
}
void main(){
 test('website checkout is available only to explicitly direct-distributed Android builds',(){
  expect(teyzaCanOpenMembershipPage(isAndroid:true,channel:'direct'),isTrue);
  expect(teyzaCanOpenMembershipPage(isAndroid:true,channel:'store'),isFalse);
  expect(teyzaCanOpenMembershipPage(isAndroid:false,channel:'direct'),isFalse);
  expect(teyzaCanOpenMembershipPage(isAndroid:false,channel:'store'),isFalse);
  expect(teyzaSellerMembershipPage.scheme,'https');
  expect(teyzaSellerMembershipPage.host,'teyza.co.za');
  expect(teyzaSellerMembershipPage.query,isEmpty);
 });
 testWidgets('recurring prices are shown before a seller agrees to checkout',(tester)async{
  bool? agreed;
  await tester.pumpWidget(MaterialApp(home:Builder(builder:(context)=>Scaffold(body:
   TextButton(onPressed:()async{agreed=await showDialog<bool>(context:context,
    builder:(_)=>const SellerSubscriptionTermsDialog());},child:const Text('Open terms'))))));
  await tester.tap(find.text('Open terms'));await tester.pumpAndSettle();
  expect(find.textContaining('R49'),findsOneWidget);
  expect(find.textContaining('R99 each month'),findsOneWidget);
  expect(find.textContaining('until you cancel'),findsOneWidget);
  await tester.tap(find.text('Not now'));await tester.pumpAndSettle();expect(agreed,false);
  await tester.tap(find.text('Open terms'));await tester.pumpAndSettle();
  await tester.tap(find.text('Agree and continue'));await tester.pumpAndSettle();expect(agreed,true);
 });
 testWidgets('free signup prompts upgrade only on product action and offers R49, R99, and paid-only promotion',
  (tester)async{
   await tester.binding.setSurfaceSize(const Size(420,860));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=ShopperSession(),api=_PlanApi(session);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api)));
   await tester.pumpAndSettle();
   expect(find.textContaining('R49 first month'),findsOneWidget);
   await tester.scrollUntilVisible(find.textContaining('R29 for 7 days'),220);
   expect(find.textContaining('R29 for 7 days'),findsOneWidget);
   expect(find.textContaining('7-day trial'),findsNothing);
   expect(api.calls,equals(['seller_summary']),
    reason:'Opening upgrade information must not create a charge or subscription');
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('viewing membership does not offer checkout until a product action',(tester)async{
   final session=ShopperSession(),api=_PlanApi(session);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api)));
   await tester.pumpAndSettle();
   final button=tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Add a product to upgrade'));
   expect(button.onPressed,isNull);
   expect(api.calls,equals(['seller_summary']));
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('returning sellers see the actual R99 price rather than the introductory offer',(tester)async{
   await tester.binding.setSurfaceSize(const Size(420,860));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=ShopperSession(),api=_PlanApi(session,introEligible:false);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api)));
   await tester.pumpAndSettle();
   expect(find.text('R99/month'),findsOneWidget);
   expect(find.textContaining('R49 first month'),findsNothing);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('older services still explain the R49 introductory offer without initiating checkout',(tester)async{
   final session=ShopperSession(),api=_PlanApi(session,introEligible:null);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api)));
   await tester.pumpAndSettle();
   expect(find.text('R49 first month · then R99/month'),findsOneWidget);
   expect(api.calls,equals(['seller_summary']));
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
}

