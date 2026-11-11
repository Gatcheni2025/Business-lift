import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/teyza_ads_store_billing.dart';

void main(){
 test('Apple StoreKit and Google Play share exactly the same 41 seven-day SKUs',(){
  final seen=<String>{};
  for(var radius=1;radius<=50;radius++){
   final id=teyzaStoreAdsProductId(radius);
   expect(id,'teyza_ad7d_r'+(radius<10?10:radius).toString());
   seen.add(id);
   expect(teyzaStoreAdsPriceCents(radius),2900+(radius>10?radius-10:0)*200);
  }
  expect(seen.length,41);
  expect(teyzaStoreAdsPriceCents(10),2900);
  expect(teyzaStoreAdsPriceCents(15),3900);
  expect(teyzaStoreAdsPriceCents(30),6900);
  expect(teyzaStoreAdsPriceCents(50),10900);
  expect(()=>teyzaStoreAdsProductId(0),throwsRangeError);
  expect(()=>teyzaStoreAdsPriceCents(51),throwsRangeError);
 });
}
