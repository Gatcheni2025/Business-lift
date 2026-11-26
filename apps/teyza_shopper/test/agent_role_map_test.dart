import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
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
   'agent_visits'=>{'visits':[], 'next':null},
   'agent_rewards'=>{'approvedPendingPaymentCents':18000,'approvedCount':2,'partial':false,'next':null},
   _=>{'ok':true}
  };
 }
}
void main(){
 test('Agent mode requires an approved profile attached to the signed-in UID',(){
  expect(agentShouldOfferMode({'profile':{'uid':'verifiedAgent','status':'approved'}},
   currentUid:'verifiedAgent'),isTrue);
  expect(agentShouldOfferMode({'profile':{'uid':'otherAgent','status':'approved'}},
   currentUid:'verifiedAgent'),isFalse);
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
  final invitation=Uri.parse(link!).queryParameters['text'];
  expect(invitation,contains('owner-confirm.html#uniquePrivateToken'));
  expect(invitation,contains('https://apps.apple.com/za/app/id6827037733'));
  expect(invitation,contains('https://play.google.com/store/apps/details?id=com.asiyedriver.asiye'));
  expect(invitation,isNot(contains('teyza.co.za/download.html')));
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
  final boundary=GlobalKey();
  await tester.pumpWidget(MaterialApp(home:RepaintBoundary(key:boundary,child:AgentWorkspacePage(session:session,
    mobileApi:MockAgentService(session),onShopper:(){},onSeller:(){}))));
  await tester.pumpAndSettle();
  expect(find.byKey(const ValueKey('agent-dashboard')),findsOneWidget);
  expect(find.text('R180.00'),findsOneWidget);
  if(Platform.environment['TEYZA_CAPTURE_UI']=='1'){
    await tester.runAsync(()async{
      final image=await (boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary).toImage(pixelRatio:2);
      final bytes=await image.toByteData(format:ui.ImageByteFormat.png);
      final output=File('build/ui-preview/agent-dashboard.png');
      await output.parent.create(recursive:true);
      await output.writeAsBytes(bytes!.buffer.asUint8List());image.dispose();
    });
  }
  await tester.tap(find.byKey(const ValueKey('agent-invite-business')));
  await tester.pumpAndSettle();
  expect(find.text('Start owner registration visit'),findsOneWidget);
  Navigator.of(tester.element(find.text('Start owner registration visit'))).pop();
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('agent-nav-0')));
  await tester.pumpAndSettle();
  expect(find.text('Find shops near you'),findsOneWidget);
  expect(find.text('Shop search and directions are ready'),findsOneWidget);
  await tester.drag(find.byType(ListView).first,const Offset(0,-550));
  await tester.pumpAndSettle();
  expect(find.text('Independent Spaza Shop'),findsOneWidget);
  expect(find.textContaining('R90'),findsWidgets);
 });
}
