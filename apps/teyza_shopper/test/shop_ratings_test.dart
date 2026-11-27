import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shop_orders.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/teyza_mobile_api.dart';
import 'seller_experience_test.dart' as fixtures;

class RatingApi extends TeyzaMobileApi {
  RatingApi(super.session);
  Map<String,dynamic>? rating;
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
    if(action=='shop_rate'){rating=data;return {'saved':true};}
    return {'orders':[{'id':'done1','status':'completed','shopName':'Corner shop','items':[],'totalCents':1000,'mode':'collection'},
      {'id':'pending1','status':'requested','shopName':'Other shop','items':[],'totalCents':1000,'mode':'collection'}]};
  }
}
void main(){
  test('Merchant services include live-chat availability and genuine rating summary',(){
    final shop=Shop.fromJson({'id':'seller1','name':'Shop','identityVerified':true,
      'rating':4.5,'ratingCount':2,'services':{'liveChat':false,'cashback':true}});
    expect(shop.identityVerified,isTrue);expect(shop.liveChat,isFalse);expect(shop.cashback,isTrue);
    expect(shop.rating,4.5);expect(shop.ratingCount,2);
  });
  testWidgets('Only completed orders offer a rating and submit the selected order and stars',(tester) async {
    final session=fixtures.Session(),api=RatingApi(fixtures.Session());
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:ShopOrdersPanel(session:session,api:api))));
    await tester.pumpAndSettle();expect(find.text('Rate shop'),findsOneWidget);
    await fixtures.visibleTap(tester,find.text('Rate shop'));
    await fixtures.visibleTap(tester,find.text('5 stars'));
    expect(api.rating,{'orderId':'done1','stars':5});
    expect(find.text('Your shop rating has been saved.'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });
}
