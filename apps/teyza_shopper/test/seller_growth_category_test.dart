import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_discovery.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/seller_growth_page.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'seller_mode_test.dart' as seller;

class GrowthFixture extends TeyzaMobileApi {
 GrowthFixture(super.session);
 final requests=<Map<String,dynamic>>[];
 @override Future<Map<String,dynamic>> call(String action,
   [Map<String,dynamic> data=const {}]) async{
  if(action!='seller_growth_interest')throw StateError('Unexpected backend action: $action');
  requests.add(data);
  return {'ok':true,'requested':true,'whatsappStatus':'pending_configuration'};
 }
}

void main(){
 test('Only explicit spaza types render as Spaza Shops',(){
  Shop merchant(String category)=>Shop.fromJson({
   'id':'m$category','name':'Seller $category','shopCategory':category});
  OnlineShop publicPlace(String category)=>OnlineShop.fromJson({
   'id':'p$category','name':'Business $category','shopCategory':category});
  final spaza=merchant('spaza'),business=merchant('business'),
    retail=merchant('retail'),unknown=merchant('unrecognised'),
    missing=Shop.fromJson({'id':'legacy','name':'Legacy seller'});
  expect(spaza.shopCategory,'spaza');
  for(final s in [business,retail,unknown])expect(s.shopCategory,'variety');
  expect(missing.shopCategory,'spaza',reason:'Legacy uncategorized grocery records stay discoverable.');
  expect(merchant('wholesale').shopCategory,'wholesale');
  expect(publicPlace('business').shopCategory,'variety');
  expect(publicPlace('retail').shopCategory,'variety');
  expect(publicPlace('spaza').shopCategory,'spaza');
  expect(teyzaNormalizedShopCategory('Spaza Shop'),'spaza');
  expect(teyzaNormalizedShopCategory('Other Business'),'variety');

  final entries=<NearbyListing>[
   NearbyListing(merchant:spaza),
   NearbyListing(merchant:business),
   NearbyListing(directory:publicPlace('retail')),
   NearbyListing(merchant:retail,directory:publicPlace('spaza')),
   NearbyListing(directory:publicPlace('spaza')),
  ];
  final visible=teyzaSpazaStoryEntries(entries);
  expect(visible.length,2);
  expect(visible.first.merchant?.id,'mspaza');
  expect(visible.last.directory?.shopCategory,'spaza');
 });

 testWidgets('Growth buttons request WhatsApp information with consent and no mobile payment link',(tester) async{
  final session=seller.SellerSession()..useSellerWorkspace();
  final api=GrowthFixture(session);
  await tester.pumpWidget(MaterialApp(home:SellerGrowthPage(
   session:session,api:api,businessApproved:true)));
  await tester.pumpAndSettle();
  expect(find.text('What upgrading can do for you'),findsOneWidget);
  expect(find.text('Access discounted wholesale stock'),findsOneWidget);
  expect(find.text('Explore business finance'),findsOneWidget);
  await tester.scrollUntilVisible(find.byKey(const ValueKey('growth-upgrade')),220,
    scrollable:find.byType(Scrollable).last);
  await tester.tap(find.byKey(const ValueKey('growth-upgrade')));
  await tester.pumpAndSettle();
  expect(find.textContaining('We will use the mobile number'),findsOneWidget);
  expect(api.requests,isEmpty);
  await tester.tap(find.text('I agree · Request WhatsApp'));await tester.pumpAndSettle();
  expect(api.requests.length,1);
  expect(api.requests.single,{'purpose':'upgrade','whatsappConsent':true});
  expect(find.textContaining('Request received.'),findsOneWidget);
  await tester.pumpWidget(const SizedBox.shrink());await tester.pumpAndSettle();
  session.dispose();
 });
}
