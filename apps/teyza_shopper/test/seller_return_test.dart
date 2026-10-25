import 'dart:async';
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_phone.dart';
import 'package:teyza_shopper/seller_selfie_camera.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'seller_experience_test.dart' as fixtures;
import 'seller_onboarding_test.dart' as phoneFixtures;

class MemoryVault implements SessionStore {
  final values=<String,String>{};
  @override Future<String?> read(String key) async=>values[key];
  @override Future<void> write(String key,String value) async{values[key]=value;}
  @override Future<void> delete(String key) async{values.remove(key);}
}
class DelayedVault extends MemoryVault {
  final started=Completer<void>(),release=Completer<void>();
  @override Future<void> write(String key,String value) async{
    started.complete();await release.future;await super.write(key,value);
  }
}
class TestSelfieCamera implements SelfieCamera {
  final Uint8List bytes;
  final Object? initializationError;
  final Completer<Uint8List>? pendingCapture;
  bool disposed=false;
  int captures=0;
  TestSelfieCamera(this.bytes,{this.initializationError,this.pendingCapture});
  @override Future<void> initialize() async{if(initializationError!=null)throw initializationError!;}
  @override Widget preview()=>const ColoredBox(key:Key('front-camera-preview'),color:Color(0xFF243D42));
  @override Future<Uint8List> capture() async{captures++;return pendingCapture==null?bytes:await pendingCapture!.future;}
  @override Future<void> dispose() async{disposed=true;}
}

void main(){
  Future<Uint8List> photo() async=>(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();
  Future<void> controlTap(WidgetTester tester,String text) async{
    final finder=find.text(text);
    await tester.scrollUntilVisible(finder,180,scrollable:find.byType(Scrollable).first);
    await fixtures.visibleTap(tester,finder);
  }
  test('Pending SMS restores only the same owner and number, expires and stores no entered code',() async{
    final vault=MemoryVault();var time=DateTime.utc(2026,10,25,8);
    final store=PendingSmsStore(store:vault,now:()=>time);
    await store.save('owner','+27712345678','firebase-session');
    expect((await store.read('owner','+27712345678'))?.verificationId,'firebase-session');
    expect(await store.read('another-owner','+27712345678'),isNull);
    expect(vault.values.values.single, isNot(contains('smsCode')));
    time=time.add(const Duration(minutes:10));
    expect(await store.read('owner','+27712345678'),isNull);expect(vault.values,isEmpty);
    await store.save('owner','+27712345678','next-session');
    expect(await store.read('owner','+27700000000'),isNull);expect(vault.values,isEmpty);
  });
  test('Clearing a pending request is serialized after its write',() async{
    final vault=DelayedVault();
    final pending=PendingSmsStore(store:vault);
    final save=pending.save('owner','+27712345678','firebase-session');
    await vault.started.future;
    final clear=pending.clear('owner');vault.release.complete();await save;await clear;
    expect(vault.values,isEmpty);
  });
  testWidgets('Returning to OTP reuses the saved request and accepts the code without sending another SMS',(tester) async{
    final session=phoneFixtures.PhoneSession(),sender=phoneFixtures.FakeSender(),vault=MemoryVault();
    final store=PendingSmsStore(store:vault);
    await store.save('owner','+27712345678','saved-firebase-session');
    await tester.pumpWidget(MaterialApp(home:SellerPhonePage(session:session,phone:'0712345678',sender:sender,pendingStore:store)));
    await tester.pumpAndSettle();
    expect(sender.sends,0);expect(find.byType(TextField),findsOneWidget);
    await tester.enterText(find.byType(TextField),'123456');tester.testTextInput.hide();await tester.pump();
    await controlTap(tester,'Verify mobile number');
    expect(session.links,[['saved-firebase-session','123456','+27712345678']]);
    expect(vault.values,isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('Leaving and reopening OTP retains the received SMS session',(tester) async{
    final session=phoneFixtures.PhoneSession(),sender=phoneFixtures.FakeSender(),vault=MemoryVault();
    final store=PendingSmsStore(store:vault);
    Widget page()=>MaterialApp(home:SellerPhonePage(session:session,phone:'0712345678',sender:sender,pendingStore:store));
    await tester.pumpWidget(page());await tester.pumpAndSettle();
    await fixtures.visibleTap(tester,find.text('Send me a verification SMS'));
    await fixtures.visibleTap(tester,find.text('Send SMS code'));
    await tester.pumpWidget(const SizedBox.shrink());await tester.pumpAndSettle();
    await tester.pumpWidget(page());await tester.pumpAndSettle();
    expect(sender.sends,1);expect(find.byType(TextField),findsOneWidget);
    session.switchAccount();await tester.pumpAndSettle();
    expect(find.byType(TextField),findsNothing);expect(vault.values,isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('Selfie capture previews inside the app and returns only the selected photo',(tester) async{
    final session=fixtures.Session(),bytes=await photo(),camera=TestSelfieCamera(await photo());
    Uint8List? result;
    await tester.pumpWidget(MaterialApp(home:Builder(builder:(context)=>Scaffold(body:TextButton(
      onPressed:() async{result=await Navigator.push<Uint8List>(context,MaterialPageRoute(builder:(_)=>
        SellerSelfieCameraPage(session:session,cameraFactory:()=>camera)));},child:const Text('Open camera'))))));
    await fixtures.visibleTap(tester,find.text('Open camera'));
    expect(find.byKey(const Key('front-camera-preview')),findsOneWidget);
    await controlTap(tester,'Take selfie');
    expect(camera.captures,1);expect(camera.disposed,true);expect(find.byType(Image),findsOneWidget);expect(result,isNull);
    await controlTap(tester,'Use this selfie');
    expect(result,bytes);expect(find.text('Open camera'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('Selfie camera releases on backgrounding and reopens on resume',(tester) async{
    final session=fixtures.Session(),bytes=await photo(),cameras=<TestSelfieCamera>[];
    await tester.pumpWidget(MaterialApp(home:SellerSelfieCameraPage(session:session,cameraFactory:(){
      final camera=TestSelfieCamera(bytes);cameras.add(camera);return camera;})));
    await tester.pumpAndSettle();expect(cameras.length,1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);await tester.pumpAndSettle();
    expect(cameras.first.disposed,true);expect(find.byKey(const Key('front-camera-preview')),findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);await tester.pumpAndSettle();
    expect(cameras.length,2);expect(find.byKey(const Key('front-camera-preview')),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());await tester.pumpAndSettle();expect(cameras.last.disposed,true);session.dispose();
  });
  testWidgets('A selfie permission error provides a retry and never leaves the registration route',(tester) async{
    final session=fixtures.Session(),bytes=await photo();var attempts=0;
    await tester.pumpWidget(MaterialApp(home:SellerSelfieCameraPage(session:session,cameraFactory:()=>
      TestSelfieCamera(bytes,initializationError:attempts++==0?CameraException('CameraAccessDenied','Denied'):null))));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.textContaining('Allow camera access'),180,scrollable:find.byType(Scrollable).first);
    expect(find.textContaining('Allow camera access'),findsOneWidget);
    await controlTap(tester,'Try camera again');
    expect(find.byKey(const Key('front-camera-preview')),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
  testWidgets('A late selfie capture after switching accounts cannot preview or submit private bytes',(tester) async{
    final session=fixtures.Session(),bytes=await photo(),pending=Completer<Uint8List>();
    final camera=TestSelfieCamera(bytes,pendingCapture:pending);
    await tester.pumpWidget(MaterialApp(home:SellerSelfieCameraPage(session:session,cameraFactory:()=>camera)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Take selfie'),180,scrollable:find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Take selfie'));await tester.tap(find.text('Take selfie'));await tester.pump();
    session.switchAccount();pending.complete(bytes);await tester.pumpAndSettle();
    expect(find.byType(Image),findsNothing);expect(find.text('Use this selfie'),findsNothing);
    expect(find.textContaining('Your account changed'),findsOneWidget);expect(camera.disposed,true);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();
  });
}
