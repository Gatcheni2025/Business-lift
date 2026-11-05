import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_plan.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class _PlanApi extends TeyzaMobileApi {
 _PlanApi(super.session,{this.introEligible=true});
 final bool introEligible;
 final calls=<String>[];
 @override
 Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
  calls.add(action);
  if(action=='seller_summary')return {'ok':true,'listingPaid':false,'promotionActive':false,'introEligible':introEligible};
  return {'ok':true};
 }
}
void main(){
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
}

