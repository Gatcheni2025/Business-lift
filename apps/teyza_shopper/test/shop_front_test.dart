import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_shop_photo.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'seller_experience_test.dart' as fixtures;
class FrontApi extends TeyzaMobileApi{
 FrontApi(super.session);bool fail=true;int saves=0;
 @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async{
  if(action=='shop_front_read')return {'shopFront':null};
  saves++;expect(data['consent'],true);expect(base64Decode(data['imageBase64'] as String),isNotEmpty);
  if(fail)throw StateError('Photo storage has not been activated (UPLOAD_STORAGE_MISSING).');return {'saved':true};
 }
}
void main(){
 testWidgets('Shop photo capture remains available during a storage failure and retry preserves the image',(tester) async{
  final session=fixtures.Session(),api=FrontApi(fixtures.Session());
  final bytes=(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();
  await tester.pumpWidget(MaterialApp(home:SellerShopPhotoPage(session:session,api:api,capture:(_)async=>bytes)));
  await tester.pumpAndSettle();await fixtures.visibleTap(tester,find.text('Photograph shop front'));
  expect(find.byType(Image),findsOneWidget);
  final save=find.widgetWithText(FilledButton,'Save shop-front photo');
  await tester.scrollUntilVisible(save,180,scrollable:find.byType(Scrollable).first);expect(tester.widget<FilledButton>(save).onPressed,isNull);
  await fixtures.visibleTap(tester,find.text('Show this photo on my shop listing'));await fixtures.visibleTap(tester,save);
  expect(api.saves,1);expect(find.byType(Image),findsOneWidget);
  api.fail=false;await tester.scrollUntilVisible(save,180,scrollable:find.byType(Scrollable).first);await fixtures.visibleTap(tester,save);expect(api.saves,2);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Changing accounts clears a captured shop photo and prevents saving it',(tester) async{
  final session=fixtures.Session(),api=FrontApi(fixtures.Session());
  final bytes=(await rootBundle.load('assets/images/essentials/bread.webp')).buffer.asUint8List();
  await tester.pumpWidget(MaterialApp(home:SellerShopPhotoPage(session:session,api:api,capture:(_)async=>bytes)));
  await tester.pumpAndSettle();await fixtures.visibleTap(tester,find.text('Photograph shop front'));
  session.switchAccount();await tester.pumpAndSettle();expect(find.byType(Image),findsNothing);
  final save=find.widgetWithText(FilledButton,'Save shop-front photo');await tester.scrollUntilVisible(save,180,scrollable:find.byType(Scrollable).first);
  expect(tester.widget<FilledButton>(save).onPressed,isNull);expect(api.saves,0);
  await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
}
