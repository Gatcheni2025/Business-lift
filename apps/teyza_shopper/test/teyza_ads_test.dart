import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/teyza_ads_page.dart';

void main(){
 test('Seven-day ad price is R29 up to 10 km, then R2 for each extra kilometre',(){
  expect(teyzaAdsPriceCents(1),2900);
  expect(teyzaAdsPriceCents(10),2900);
  expect(teyzaAdsPriceCents(11),3100);
  expect(teyzaAdsPriceCents(15),3900);
  expect(teyzaAdsPriceCents(20),4900);
  expect(teyzaAdsPriceCents(30),6900);
  expect(teyzaAdsPriceCents(50),10900);
  expect(teyzaAdsDays,7);
  expect(teyzaAdRand(3900),'R39.00');
  expect(()=>teyzaAdsPriceCents(0),throwsRangeError);
  expect(()=>teyzaAdsPriceCents(51),throwsRangeError);
 });
}
