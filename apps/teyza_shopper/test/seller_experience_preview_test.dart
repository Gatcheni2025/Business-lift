import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_notifications.dart';
import 'package:teyza_shopper/seller_registration.dart';
import 'package:teyza_shopper/seller_review.dart';
import 'package:teyza_shopper/seller_tools.dart';
import 'package:teyza_shopper/seller_onboarding.dart';
import 'package:teyza_shopper/seller_phone.dart';
import 'package:teyza_shopper/seller_selfie_camera.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'seller_experience_test.dart' as fixtures;
import 'seller_onboarding_test.dart' as onboardingFixtures;

class PreviewSelfieCamera implements SelfieCamera {
 @override Future<void> initialize() async{}
 @override Widget preview()=>const ColoredBox(color:Color(0xFF253D43),child:Center(child:Icon(Icons.face_outlined,size:150,color:Colors.white38)));
 @override Future<Uint8List> capture() async=>throw StateError('Offline preview has no device camera.');
 @override Future<void> dispose() async{}
}

void main(){
 testWidgets('Premium seller registration, notification and reviewer screens render with offline fixtures',(tester) async{
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  await (FontLoader('PT Sans')..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
   ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf'))).load();
  await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  final session=fixtures.Session(),api=fixtures.ExperienceApi(fixtures.Session());
  final pages=<String,Widget>{
   'seller-onboarding':SellerOnboardingPage(session:session,shop:const SellerShop('KwaMashu Local Market','spaza','Durban','pending','not_listed',phone:'+27712345678'),api:api),
   'seller-phone-otp':SellerPhonePage(session:session,phone:'+27712345678',pendingStore:PendingSmsStore(store:onboardingFixtures.TestPhoneStore())),
   'seller-in-app-selfie':SellerSelfieCameraPage(session:session,cameraFactory:()=>PreviewSelfieCamera()),
   'seller-notifications':SellerNotificationsPage(session:session,api:api),
   'seller-registration':SellerRegistrationPage(session:session,api:api),
   'seller-review-desk':SellerReviewPage(session:session,api:api),
   'seller-camera-verification':SellerToolPage(session:session,tool:SellerTool.verification,api:api,captureSelfie:() async=>null),
  };
  for(final entry in pages.entries){
   final boundary=GlobalKey();
   await tester.pumpWidget(MaterialApp(theme:ThemeData(useMaterial3:true,fontFamily:'PT Sans',
    colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xFF3BB77E)),
    filledButtonTheme:FilledButtonThemeData(style:FilledButton.styleFrom(backgroundColor:const Color(0xFF3BB77E),foregroundColor:Colors.white))),
    home:RepaintBoundary(key:boundary,child:entry.value)));
   await tester.pumpAndSettle();expect(tester.takeException(),isNull);
   if(Platform.environment['TEYZA_CAPTURE_UI']=='1')await tester.runAsync(() async{
    final render=boundary.currentContext!.findRenderObject() as RenderRepaintBoundary;
    final image=await render.toImage(pixelRatio:2),data=await image.toByteData(format:ui.ImageByteFormat.png);
    final path=File('build/ui-preview/${entry.key}.png');await path.parent.create(recursive:true);await path.writeAsBytes(data!.buffer.asUint8List());image.dispose();
   });
   await tester.pumpWidget(const SizedBox.shrink());
  }
  session.dispose();api.session.dispose();
 });
}
