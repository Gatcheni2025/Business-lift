import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/agent_workspace.dart';
import 'package:teyza_shopper/teyza_mode_chooser.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'session_test.dart' as auth;

class MockSession extends ShopperSession{
 MockSession():super(store:auth.MemoryStore()){isReady=true;userId='verifiedAgent';idToken='session-1';}
 @override Future<String> freshIdToken()async=>'session-1';
}
class MockAgentService extends TeyzaMobileApi{
 MockAgentService(super.session);
 @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}])async{
  return switch(action){
   'agent_profile'=>{'profile':{'uid':'verifiedAgent','name':'Test Field Agent','status':'approved'}},
   'agent_nearby'=>{'registered':[{'name':'Published Teyza Shop','address':'1 Main Road, Durban',
     'latitude':-29.857,'longitude':31.02,'status':'registered'}],
      'google':[{'name':'Independent Spaza Shop','address':'10 Market Road, Durban',
       'latitude':-29.858,'longitude':31.021,'shopCategory':'spaza','distanceMeters':1200}],
      'leads':[]},
   'agent_visits'=>{'visits':[]},
   _=>{'ok':true}
  };
 }
}
void main(){
 test('Agent mode requires an approved profile attached to the signed-in UID',(){
  expect(agentShouldOfferMode({'profile':{'status':'approved'}}),isTrue);
  for(final value in ['pending','suspended','rejected','unknown']){
   expect(agentShouldOfferMode({'profile':{'status':value}}),isFalse);
  }
  expect(agentShouldOfferMode({'profile':null}),isFalse);
  expect(agentShouldOfferMode({}),isFalse);
 });
 test('Owner invitation uses WhatsApp and keeps private confirmation token on the owner device',(){
  final link=ownerWhatsAppLink('082 123 4567',
   'https://teyza.co.za/owner-confirm.html#uniquePrivateToken','Local Spaza');
  expect(link,isNotNull);expect(link,startsWith('https://wa.me/27821234567'));
  expect(Uri.parse(link!).queryParameters['text'],contains('owner-confirm.html#uniquePrivateToken'));
  expect(ownerWhatsAppLink('invalid','https://teyza.co.za','Shop'),isNull);
 });
 testWidgets('Role chooser shows Agent only for Admin-approved field workers',(tester)async{
  await tester.binding.setSurfaceSize(const Size(390,844));
  addTearDown(()=>tester.binding.setSurfaceSize(null));
  var selected='';
  await tester.pumpWidget(MaterialApp(home:TeyzaModeChooser(agentApproved:false,
   onShopper:()=>selected='shopper',onAgent:()=>selected='agent',onSeller:()=>selected='seller')));
  expect(find.byKey(const ValueKey('mode-agent')),findsNothing);
  expect(find.byKey(const ValueKey('mode-shopper')),findsOneWidget);
  expect(find.byKey(const ValueKey('mode-seller')),findsOneWidget);
  await tester.tap(find.byKey(const ValueKey('mode-shopper')));
  expect(selected,'shopper');
  await tester.pumpWidget(MaterialApp(home:TeyzaModeChooser(agentApproved:true,
   onShopper:()=>selected='shopper',onAgent:()=>selected='agent',onSeller:()=>selected='seller')));
  await tester.pump();
  expect(find.byKey(const ValueKey('mode-agent')),findsOneWidget);
  await tester.ensureVisible(find.byKey(const ValueKey('mode-agent')));
  await tester.tap(find.byKey(const ValueKey('mode-agent')));
  expect(selected,'agent');
 });
 testWidgets('Verified agent receives native discovery, business results and explicit map key fallback',(tester)async{
  await tester.binding.setSurfaceSize(const Size(390,844));
  addTearDown(()=>tester.binding.setSurfaceSize(null));
  final session=MockSession();
  await tester.pumpWidget(MaterialApp(home:AgentWorkspacePage(session:session,
    mobileApi:MockAgentService(session),onShopper:(){},onSeller:(){})));
  await tester.pumpAndSettle();
  expect(find.text('Find shops near you'),findsOneWidget);
  expect(find.text('Independent Spaza Shop'),findsOneWidget);
  expect(find.text('Shop search and directions are ready'),findsOneWidget);
  expect(find.textContaining('R90'),findsWidgets);
 });
}
