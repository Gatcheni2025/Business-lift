import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/teyza_account_chooser.dart';

const active='active-shop';
const inactive='other-owner';
Widget host(Future<void> Function(BuildContext) open)=>MaterialApp(home:Scaffold(
  body:Builder(builder:(context)=>FilledButton(
    onPressed:()=>open(context),child:const Text('Choose account'))),
));
void main(){
  test('Account type labels and deletion states do not imply approval',(){
    expect(teyzaAccountLabel('spaza'),'Spaza shop owner');
    expect(teyzaAccountLabel('wholesale'),'Wholesaler');
    expect(teyzaAccountLabel('retail'),'Other business');
    expect(teyzaAccountStatus({'approvalStatus':'pending'}),'Awaiting seller verification');
    expect(teyzaAccountStatus({'approvalStatus':'approved','deletionPending':true}),'Deletion pending · unavailable');
  });
  testWidgets('A different UID requests a new sign-in rather than access transfer',(tester)async{
    String? selected;
    await tester.pumpWidget(host((context)async{
      selected=await showTeyzaAccountChooser(context,currentUid:active,accounts:[
        {'sellerUid':active,'shopName':'Home Spaza','category':'spaza','approvalStatus':'approved'},
        {'sellerUid':inactive,'shopName':'Bulk Supplier','category':'wholesale','approvalStatus':'pending'},
      ]);
    }));
    await tester.tap(find.text('Choose account'));await tester.pumpAndSettle();
    expect(find.textContaining('Bulk Supplier'),findsOneWidget);
    expect(find.text('Awaiting seller verification'),findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('teyza-account-other-owner')));
    await tester.pumpAndSettle();
    expect(selected,'signin');
  });
  testWidgets('Deleting account is unavailable while shopper access remains selectable',(tester)async{
    String? selected;
    await tester.pumpWidget(host((context)async{
      selected=await showTeyzaAccountChooser(context,currentUid:active,accounts:[
        {'sellerUid':inactive,'shopName':'Old Shop','category':'retail','approvalStatus':'pending','deletionPending':true},
      ]);
    }));
    await tester.tap(find.text('Choose account'));await tester.pumpAndSettle();
    final tile=tester.widget<ListTile>(find.byKey(const ValueKey('teyza-account-other-owner')));
    expect(tile.enabled,isFalse);
    await tester.tap(find.byKey(const ValueKey('teyza-account-shopper')));
    await tester.pumpAndSettle();
    expect(selected,'shopper');
  });
}
