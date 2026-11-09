import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_billing.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';

class _StatementApi extends TeyzaMobileApi {
  _StatementApi(super.session);
  final calls=<String>[];
  bool fail=false;
  String category='spaza';
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}])async{
    calls.add(action);
    if(fail)throw StateError('Billing temporarily unavailable');
    if(action=='seller_billing_overview')return {
      'sellerUid':'seller1','shopName':'Example shop','businessType':category,
      'provider':'paystack','status':'paid','paymentVerified':true,
      'monthlyFeeCents':9900,'introductoryFeeCents':1000,
      'nextBillingAt':1796083200000,'nextBillAmountCents':9900,
      'amountDueCents':null,'paidThrough':1796083200000,
      'transactions':[{'amountCents':1000,'status':'paid','kind':'intro',
        'environment':'live','paymentVerified':true,'date':1793452800000,'reference':'TZM_sample'}],
    };
    return {'ok':true};
  }
}
ShopperSession seller()=>ShopperSession()..userId='seller1'..idToken='seller-token';
void main(){
 test('Money is rand/cents and unknown amount must not be invented',(){
   expect(teyzaBillingMoney(9900),'R99.00');
   expect(teyzaBillingMoney(1000),'R10.00');
   expect(teyzaBillingMoney(null),'Not invoiced');
   expect(teyzaBillingStatus('payment_failed'),'Renewal payment failed');
 });
 testWidgets('Spaza owner sees monthly billing, next charge, due amount and Paystack statement',(tester)async{
   final session=seller(),api=_StatementApi(session);
   await tester.pumpWidget(MaterialApp(home:SellerBillingPage(session:session,api:api)));
   await tester.pumpAndSettle();
   expect(find.text('Spaza shop membership'),findsOneWidget);
   expect(find.text('Paid · active'),findsOneWidget);
   expect(find.text('R99.00'),findsWidgets);
   expect(find.text('Not invoiced'),findsOneWidget);
   expect(find.textContaining('TZM_sample'),findsOneWidget);
   expect(api.calls,contains('seller_billing_overview'));
   expect(api.calls,isNot(contains('billing_checkout')));
   expect(api.calls,isNot(contains('seller_mandate_submit')));
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Wholesaler has the same billing page with different business title',(tester)async{
   final session=seller(),api=_StatementApi(session)..category='wholesale';
   await tester.pumpWidget(MaterialApp(home:SellerBillingPage(session:session,api:api)));
   await tester.pumpAndSettle();
   expect(find.text('Wholesaler membership'),findsOneWidget);
   expect(find.text('R99.00'),findsWidgets);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Changing Firebase UID clears old statement rather than exposing another seller',(tester)async{
   final session=seller(),api=_StatementApi(session);
   await tester.pumpWidget(MaterialApp(home:SellerBillingPage(session:session,api:api)));
   await tester.pumpAndSettle();
   session.userId='seller2';
   session.notifyListenersForTest();
   await tester.pumpAndSettle();
   expect(find.textContaining('Account switched'),findsOneWidget);
   expect(find.textContaining('TZM_sample'),findsNothing);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
}
