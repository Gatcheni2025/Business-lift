import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_plan.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class _PlanApi extends TeyzaMobileApi {
 _PlanApi(super.session);
 final calls=<String>[];
 @override
 Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}])async{
   calls.add(action);
   if(action=='seller_summary')return {'ok':true,'listingPaid':false,
     'complimentaryAccess':false,'approvalStatus':'approved'};
   if(action=='seller_mandate_status')return {'ok':true,'mandate':null};
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
   expect(find.text('R99 / month'),findsOneWidget);
   expect(find.textContaining('This store build does not sell digital memberships'),findsOneWidget);
   expect(find.textContaining('Pay securely with Paystack'),findsNothing);
   expect(find.textContaining('R49'),findsNothing);
   expect(api.calls,contains('seller_summary'));
   expect(api.calls,never(contains('billing_checkout')));
   expect(api.calls,never(contains('promote_checkout')));
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Membership status reload is read-only and never initiates a debit',(tester)async{
   final session=ShopperSession(),api=_PlanApi(session);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:session,api:api)));
   await tester.pumpAndSettle();
   await tester.tap(find.text('Refresh membership status'));
   await tester.pumpAndSettle();
   expect(api.calls.where((x)=>x=='seller_summary').length,2);
   expect(api.calls.where((x)=>x=='seller_mandate_submit'),isEmpty);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
}
