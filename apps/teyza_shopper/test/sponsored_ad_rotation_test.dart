import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/sponsored_ad_rotation.dart';

Map<String,dynamic> ad(String id,{int? endsAt})=> {
  'id':id,'shopId':'seller-shop-$id','title':'Local grocery special',
  'shopName':'Community Spaza','message':'Stock available today',
  'sponsored':true,'endsAt':endsAt??DateTime(2030).millisecondsSinceEpoch,
  'imageUrl':'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile?shopperAdPhoto=$id'
};

void main(){
  test('each local ad stays for three minutes before cycling',(){
    expect(teyzaHomeAdRotationInterval,const Duration(minutes:3));
    expect(teyzaNextHomeAdIndex(0,3),1);
    expect(teyzaNextHomeAdIndex(1,3),2);
    expect(teyzaNextHomeAdIndex(2,3),0);
    expect(teyzaNextHomeAdIndex(0,1),0);
    expect(teyzaNextHomeAdIndex(0,0),0);
    expect(teyzaNextHomeAdIndex(-1,3),0);
  });
  test('only server-published sponsored campaigns with an unexpired image can display',(){
    final now=DateTime(2026,11,18);
    expect(teyzaHomeAdEligible(ad('approved-1'),now),true);
    expect(teyzaHomeAdEligible({...ad('approved-1'),'sponsored':false},now),false);
    expect(teyzaHomeAdEligible(ad('approved-1',endsAt:now.millisecondsSinceEpoch),now),false);
    expect(teyzaHomeAdEligible({...ad('approved-1'),'title':''},now),false);
    expect(teyzaHomeAdEligible({...ad('approved-1'),'endsAt':'forever'},now),false);
    expect(teyzaHomeAdEligible({...ad('approved-1'),
      'imageUrl':'https://other.example.com/?shopperAdPhoto=approved-1'},now),false);
    expect(teyzaHomeAdEligible({...ad('approved-1'),
      'imageUrl':'http://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile?shopperAdPhoto=approved-1'},now),false);
    expect(teyzaHomeAdEligible({...ad('approved-1'),
      'imageUrl':'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile?shopperAdPhoto=another-ad'},now),false);
  });
  test('limits local placement to eight campaigns and drops expired ads',(){
    final now=DateTime(2026,11,18);
    final ads=[ad('expired',endsAt:now.millisecondsSinceEpoch-1),
      for(var i=0;i<12;i++)ad('paid-$i')];
    final visible=teyzaHomeEligibleAds(ads,now);
    expect(visible.length,8);
    expect(visible.any((x)=>x['id']=='expired'),false);
    expect(visible.first['id'],'paid-0');
  });
}
