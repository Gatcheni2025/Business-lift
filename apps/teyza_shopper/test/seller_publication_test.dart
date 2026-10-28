import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_location.dart';
import 'package:teyza_shopper/seller_selling.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'seller_experience_test.dart' as fixtures;

class LocationApi extends TeyzaMobileApi {
  LocationApi(super.session);
  Map<String,dynamic>? saved;
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
    if(action=='seller_location_save'){saved=data;return {'saved':true};}
    return {'address':'12 Main Road, Durban','location':null};
  }
}
void main(){
 testWidgets('An unapproved stale active state never says the shop is live',(tester) async {
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(home:Scaffold(body:SellerSellingDashboard(shopName:'Pending shop',live:true,verified:false,
    publicationStatus:'active',hasLocation:false,productCount:1,onAdd:(){},onProducts:(){},onOrders:(){},onChat:(){},
    onFinance:(){},onAreas:(){},onBusiness:(){},onVerify:(){}))));
  await tester.pumpAndSettle();expect(find.text('Shop is live'),findsNothing);expect(find.text('Awaiting approval'),findsOneWidget);
  expect(find.text('Help shoppers find your shop'),findsOneWidget);expect(find.textContaining('after Teyza approves'),findsOneWidget);
  expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());
 });
 testWidgets('A seller saves the shop pin only after explicit public-location consent',(tester) async {
  await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
  final session=fixtures.Session(),api=LocationApi(fixtures.Session());
  await tester.pumpWidget(MaterialApp(home:Builder(builder:(context)=>Scaffold(body:TextButton(onPressed:()=>Navigator.push(context,
    MaterialPageRoute(builder:(_)=>SellerLocationPage(session:session,api:api,locate:() async=>(latitude:-29.7402,longitude:30.992,area:'KwaMashu',city:'Durban')))),child:const Text('Open location'))))));
  await tester.tap(find.text('Open location'));await tester.pumpAndSettle();
  await fixtures.visibleTap(tester,find.text('Use my shop’s current location'));
  final save=find.widgetWithText(FilledButton,'Save shop location');await tester.scrollUntilVisible(save,180,scrollable:find.byType(Scrollable).first);await fixtures.visibleTap(tester,save);expect(api.saved,isNull);
  await fixtures.visibleTap(tester,find.byType(CheckboxListTile));await fixtures.visibleTap(tester,save);
  expect(api.saved,{'address':'12 Main Road, Durban','area':'KwaMashu','city':'Durban','latitude':-29.7402,'longitude':30.992,'consent':true});
  expect(api.saved!.containsKey('approvalStatus'),isFalse);expect(find.text('Open location'),findsOneWidget);
  expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 testWidgets('Changing accounts clears a prepared shop location and prevents saving it',(tester) async {
  final session=fixtures.Session(),api=LocationApi(fixtures.Session());
  await tester.pumpWidget(MaterialApp(home:SellerLocationPage(session:session,api:api,
    locate:() async=>(latitude:-29.7402,longitude:30.992,area:'KwaMashu',city:'Durban'))));
  await tester.pumpAndSettle();await fixtures.visibleTap(tester,find.text('Use my shop’s current location'));
  session.switchAccount();await tester.pumpAndSettle();
  for(final field in tester.widgetList<TextField>(find.byType(TextField))){expect(field.controller!.text,isEmpty);}
  final save=find.widgetWithText(FilledButton,'Save shop location');await tester.scrollUntilVisible(save,180,scrollable:find.byType(Scrollable).first);await tester.ensureVisible(save);expect(tester.widget<FilledButton>(save).onPressed,isNull);
  expect(api.saved,isNull);await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
 });
 test('Nearby shops use their saved pin or structured area without confusing Durbanville with Durban',(){
  const durban=Area('Durban','eThekwini',-29.8587,31.0218);
  final pinned=Shop.fromJson({'id':'local','name':'Local','latitude':-29.85,'longitude':31.02});
  final named=Shop.fromJson({'id':'named','name':'Shop','area':'KwaMashu','city':'Durban'});
  final other=Shop.fromJson({'id':'other','name':'Durban Shop','area':'Durbanville','city':'Cape Town'});
  final distant=Shop.fromJson({'id':'far','name':'Shop','area':'Durban','latitude':-26.2,'longitude':28.04});
  expect(shopMatchesArea(pinned,durban),isTrue);expect(shopMatchesArea(named,durban),isTrue);
  expect(shopMatchesArea(Shop.fromJson({'id':'unset','name':'Shop','area':'Durban','latitude':0,'longitude':0}),durban),isTrue);
  expect(shopMatchesArea(Shop.fromJson({'id':'street','name':'Shop','address':'12 Durban Road','city':'Cape Town'}),durban),isFalse);
  expect(shopMatchesArea(other,durban),isFalse);expect(shopMatchesArea(distant,durban),isFalse);
  expect(shopMatchesArea(distant,durban,allRegistered:true),isTrue);
 });
}
