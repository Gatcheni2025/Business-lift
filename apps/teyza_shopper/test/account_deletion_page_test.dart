import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/account_deletion_page.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'session_test.dart' show MemoryStore;

class _Session extends ShopperSession {
  _Session():super(store:MemoryStore()){
    isReady=true;userId='test-owner';idToken='test-token';
  }
  int signOutCount=0;
  @override Future<void> signOut() async {
    signOutCount++;
    await super.signOut();
  }
}
class _AppleSession extends _Session {
  _AppleSession({this.revocationFails=false}):super(){appleProviderLinked=true;}
  final bool revocationFails;
  int revocations=0;
  @override Future<void> revokeAppleForDeletion()async{
    revocations++;
    if(revocationFails)throw StateError('Apple provider unavailable');
  }
}
class _Api extends TeyzaMobileApi {
  _Api(super.session,{this.oldRequest=false});
  final bool oldRequest;
  final calls=<String>[];
  @override Future<Map<String,dynamic>> call(String action,
      [Map<String,dynamic> data=const {}]) async {
    calls.add(action);
    if(action=='account_deletion_status')return oldRequest?
      {'requested':true,'signInBlocked':true,'status':'pending_review','reference':'TZ-DEL-OLD'}:
      {'requested':false};
    if(action=='account_deletion_request'){
      expect(data['confirmation'],'DELETE');
      return {'requested':true,'signInBlocked':true,'status':'pending_review','reference':'TZ-DEL-NEW'};
    }
    throw StateError('Unexpected action');
  }
}

void main(){
 testWidgets('DELETE closes Firebase session and shows that data erasure is pending',(tester)async{
   await tester.binding.setSurfaceSize(const Size(430,900));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=_Session(),api=_Api(session);
   await tester.pumpWidget(MaterialApp(home:TeyzaDeleteAccountPage(session:session,api:api)));
   await tester.pumpAndSettle();
   await tester.enterText(find.byType(TextField).first,'DELETE');
   await tester.scrollUntilVisible(find.byType(CheckboxListTile),220,
     scrollable:find.byType(Scrollable).first);
   await tester.tap(find.byType(CheckboxListTile));await tester.pumpAndSettle();
   final button=find.text('Close account and request deletion');
   await tester.scrollUntilVisible(button,220,
     scrollable:find.byType(Scrollable).first);
   await tester.tap(button);await tester.pumpAndSettle();
   expect(api.calls,contains('account_deletion_request'));
   expect(session.signOutCount,1);
   expect(session.userId,isNull);
   expect(find.text('Account closed for sign-in'),findsOneWidget);
   expect(find.textContaining('Data erasure:'),findsOneWidget);
   expect(find.textContaining('Personal-data erasure and lawful retention review'),findsOneWidget);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Old pending request gets closed for login on status check',(tester)async{
   final session=_Session(),api=_Api(session,oldRequest:true);
   await tester.pumpWidget(MaterialApp(home:TeyzaDeleteAccountPage(session:session,api:api)));
   await tester.pumpAndSettle();
   expect(session.signOutCount,1);
   expect(session.userId,isNull);
   expect(find.text('Account closed for sign-in'),findsOneWidget);
   expect(find.textContaining('TZ-DEL-OLD'),findsOneWidget);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Apple-linked shopper attempts revocation before account closure',(tester)async{
   await tester.binding.setSurfaceSize(const Size(430,900));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=_AppleSession(revocationFails:true),api=_Api(session);
   await tester.pumpWidget(MaterialApp(home:TeyzaDeleteAccountPage(session:session,api:api)));
   await tester.pumpAndSettle();
   expect(find.textContaining('Apple may ask you to authorize again'),findsOneWidget);
   await tester.scrollUntilVisible(find.byType(TextField).first,220,
     scrollable:find.byType(Scrollable).first);
   await tester.enterText(find.byType(TextField).first,'DELETE');
   await tester.scrollUntilVisible(find.byType(CheckboxListTile),180,
     scrollable:find.byType(Scrollable).first);
   await tester.tap(find.byType(CheckboxListTile));await tester.pumpAndSettle();
   await tester.scrollUntilVisible(find.text('Close account and request deletion'),200,
     scrollable:find.byType(Scrollable).first);
   await tester.tap(find.text('Close account and request deletion'));await tester.pumpAndSettle();
   expect(session.revocations,1);
   expect(api.calls,contains('account_deletion_request'));
   expect(session.userId,isNull);
   await tester.scrollUntilVisible(find.textContaining('Apple token revocation could not be confirmed'),180,
     scrollable:find.byType(Scrollable).first);
   expect(find.textContaining('Apple token revocation could not be confirmed'),findsOneWidget);
   await tester.pumpWidget(const SizedBox.shrink());session.dispose();
 });

}
