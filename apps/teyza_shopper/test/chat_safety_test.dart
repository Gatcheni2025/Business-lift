import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_chat.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'session_test.dart' show MemoryStore;

class ChatTestSession extends ShopperSession {
  ChatTestSession():super(store:MemoryStore()){
    isReady=true;userId='shopper1';idToken='test-token';emailVerified=true;
  }
}
class ModeratedApi extends TeyzaMobileApi {
  ModeratedApi(super.session);
  final calls=<Map<String,dynamic>>[];
  bool isBlocked=false;
  @override Future<Map<String,dynamic>> call(String action,
      [Map<String,dynamic> data=const {}])async{
    calls.add({'action':action,...data});
    if(action=='chat_read'||action=='chat_send')return {
      'blockedByMe':isBlocked,'blocked':isBlocked,
      'messages':[{'id':'msg-owner','senderUid':'shopowner',
        'text':'Do you want to buy bread?','sequence':1}]
    };
    if(action=='chat_block'){
      isBlocked=data['blocked']==true;
      return {'blocked':isBlocked};
    }
    if(action=='chat_report')return {'reported':true,'reference':'TZ-RPT-1'};
    return {'ok':true};
  }
}
void main(){
 testWidgets('Shopper reports a message and blocks/unblocks the chat',(tester)async{
   await tester.binding.setSurfaceSize(const Size(410,900));
   addTearDown(()=>tester.binding.setSurfaceSize(null));
   final session=ChatTestSession(),api=ModeratedApi(session);
   await tester.pumpWidget(MaterialApp(home:ShopperChatPage(
     session:session,api:api,initialThreadId:'conversation1',initialTitle:'Verified Shop')));
   await tester.pumpAndSettle();
   expect(find.text('Do you want to buy bread?'),findsOneWidget);
   await tester.tap(find.text('Report message'));await tester.pumpAndSettle();
   await tester.tap(find.text('Scam or fraud'));await tester.pumpAndSettle();
   expect(api.calls.last['action'],'chat_report');
   expect(api.calls.last['messageId'],'msg-owner');
   final popup=find.byTooltip('Chat safety');
   await tester.tap(popup);await tester.pumpAndSettle();
   await tester.tap(find.text('Block this user'));await tester.pumpAndSettle();
   expect(api.isBlocked,isTrue);
   expect(find.textContaining('You blocked this conversation'),findsOneWidget);
   expect(find.byTooltip('Send message'),findsNothing);
   await tester.tap(popup);await tester.pumpAndSettle();
   await tester.tap(find.text('Unblock conversation'));await tester.pumpAndSettle();
   expect(api.isBlocked,isFalse);
   await tester.pumpWidget(const SizedBox.shrink());
   session.dispose();
 });
}
