import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/seller_workspace.dart';
import 'package:teyza_shopper/shopper_auth.dart';

class PreviewOwner extends ShopperSession {
  PreviewOwner(){isReady=true;emailVerified=true;userId='preview-owner';idToken='preview-token';}
  @override Future<String> freshIdToken() async=>'preview-token';
}
void main(){
  testWidgets('Seller dashboard renders the premium workspace with offline fixtures',(tester) async{
    await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
    await (FontLoader('PT Sans')..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf'))).load();
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final session=PreviewOwner();
    final client=MockClient((request) async=>http.Response(jsonEncode(request.url.path.contains('teyzaSellerAccounts')?{'fields':{
      'shopName':{'stringValue':'KwaMashu Fresh Market'},'category':{'stringValue':'spaza'},
      'address':{'stringValue':'KwaMashu, Durban'},'approvalStatus':{'stringValue':'pending'},'listingStatus':{'stringValue':'not_listed'}
    }}:{}),200));
    final boundary=GlobalKey();
    await tester.pumpWidget(MaterialApp(theme:ThemeData(useMaterial3:true,fontFamily:'PT Sans',
      colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xFF3BB77E))),
      home:RepaintBoundary(key:boundary,child:SellerWorkspacePage(session:session,openLogin:(){},
        apiFactory:(uid,token)=>SellerFirestore(uid:uid,token:token,client:client)))));
    await tester.pumpAndSettle();expect(find.text('Your shop dashboard'),findsOneWidget);
    expect(tester.takeException(),isNull);
    if(Platform.environment['TEYZA_CAPTURE_UI']=='1')await tester.runAsync(() async{
      final render=boundary.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final image=await render.toImage(pixelRatio:2),data=await image.toByteData(format:ui.ImageByteFormat.png);
      final path=File('build/ui-preview/seller-dashboard.png');await path.parent.create(recursive:true);
      await path.writeAsBytes(data!.buffer.asUint8List());image.dispose();
    });
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();client.close();
  });
}
