import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_plan.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class _PlanApi extends TeyzaMobileApi {
  _PlanApi(super.session);
  final calls=<String>[];
  bool failBilling=false;
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}])async{
    calls.add(action);
    if(action=='seller_billing_overview'){
      if(failBilling)throw StateError('Membership service temporarily unavailable');
      return {
        'sellerUid':'seller1','shopName':'Example shop','businessType':'spaza',
        'provider':'paystack','status':'not_subscribed','monthlyFeeCents':9900,
        'introductoryFeeCents':1000,'nextBillingAt':null,'amountDueCents':null,
        'transactions':<Map<String,dynamic>>[],
      };
    }
    return {'ok':true};
  }
}
ShopperSession session()=>ShopperSession()..userId='seller1'..idToken='token';

void main(){
 test('No mobile distribution channel can open a retired debit-order form',(){
   expect(teyzaCanOpenMembershipPage(isAndroid:true,channel:'direct'),isFalse);
   expect(teyzaCanOpenMembershipPage(isAndroid:true,channel:'store'),isFalse);
   expect(teyzaCanOpenMembershipPage(isAndroid:false,channel:'direct'),isFalse);
 });
 testWidgets('Spaza seller reads benefits and Paystack billing without bank mandate or checkout',(tester)async{
   final owner=session(),api=_PlanApi(owner);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:owner,api:api)));
   await tester.pumpAndSettle();
   expect(find.text('Benefits for your shop'),findsOneWidget);
   expect(find.text('Subscription & billing'),findsNothing);
   expect(find.textContaining('Paystack'),findsNothing);
   expect(find.textContaining('Amount due'),findsNothing);
   expect(find.text('Upgrade now'),findsNothing);
   expect(find.text('Membership & mandate'),findsNothing);
   expect(find.byKey(const ValueKey('mandate-bank')),findsNothing);
   expect(api.calls,isNot(contains('seller_billing_overview')));
   expect(api.calls,isNot(contains('seller_mandate_status')));
   expect(api.calls,isNot(contains('seller_mandate_submit')));
   expect(api.calls,isNot(contains('billing_checkout')));
   await tester.pumpWidget(const SizedBox.shrink());owner.dispose();
 });
 testWidgets('Wholesaler sees advertising benefits with the same R99 membership statement',(tester)async{
   final owner=session(),api=_PlanApi(owner);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:owner,api:api,businessType:'wholesale',
     directMandateOverride:true)));
   await tester.pumpAndSettle();
   expect(find.text('Wholesale business membership'),findsOneWidget);
   expect(find.text('Advertise to spaza shops'),findsOneWidget);
   expect(find.text('Subscription & billing'),findsNothing);
   expect(find.byKey(const ValueKey('mandate-bank')),findsNothing);
   expect(api.calls,isNot(contains('seller_mandate_submit')));
   await tester.pumpWidget(const SizedBox.shrink());owner.dispose();
 });
 testWidgets('Store app has no website payment CTA or payable amount',(tester)async{
   final owner=session(),api=_PlanApi(owner);
   await tester.pumpWidget(MaterialApp(home:SellerPlanPage(session:owner,api:api)));
   await tester.pumpAndSettle();
   expect(find.textContaining('Paystack'),findsNothing);
   expect(find.textContaining('Amount due'),findsNothing);
   expect(find.text('Upgrade now'),findsNothing);
   expect(find.byKey(const ValueKey('seller-open-statement')),findsNothing);
   expect(api.calls.where((x)=>x=='seller_mandate_submit'||x=='billing_checkout'||x=='seller_billing_overview'),isEmpty);
   await tester.pumpWidget(const SizedBox.shrink());owner.dispose();
 });
}
