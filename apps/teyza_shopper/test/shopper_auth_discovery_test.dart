import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_discovery.dart';
import 'package:teyza_shopper/shopper_chat.dart';
import 'package:teyza_shopper/shopper_home.dart';

void main() {
  test('Firebase authentication errors have clear messages', () {
    expect(authMessage(StateError('INVALID_LOGIN_CREDENTIALS')), contains('Incorrect email'));
    expect(authMessage(StateError('EMAIL_EXISTS')), contains('already registered'));
    expect(authMessage(StateError('TOO_MANY_ATTEMPTS_TRY_LATER')), contains('Too many'));
  });
  test('Shopper chat requires a real Teyza seller business ID', () {
    expect(ShopperChatApi.isTeyzaShop('TZ_AB12CD34'),isTrue);
    expect(ShopperChatApi.isTeyzaShop('google-ChIJTest123'),isFalse);
    expect(ShopperChatApi.isTeyzaShop(''),isFalse);
  });
  test('Basic shop listing can appear without a priced catalogue', () {
    final listing=Shop.fromJson({
      'id':'TZ_AB12CD34','name':'Example Local Shop','area':'KwaMashu',
      'listingPlan':'basic','products':[]
    });
    expect(listing.products,isEmpty);
    expect(listing.name,'Example Local Shop');
  });
  test('Google spaza listing retains its maps link and provider attributions', () {
    final s=OnlineShop.fromJson({
      'id':'google-ChIJTest123','name':'Shalom Spaza',
      'address':'KwaMashu Durban',
      'origin':'google_places',
      'sourceUrl':'https://maps.google.com/?cid=123',
      'latitude':-29.74,'longitude':30.99,
      'attributions':[{'name':'Provider','url':'https://provider.example/'}]
    });
    expect(s.origin,'google_places');
    expect(s.source,contains('maps.google'));
    expect(s.providerAttributions.single['name'],'Provider');
  });
  test('Google photo and variety shop category parse with author links', () {
    final store=OnlineShop.fromJson({
      'id':'google-abcdef','name':'China Mall',
      'origin':'google_places','shopCategory':'variety',
      'photoRef':'places/test123456/photos/testphoto12345',
      'photoAttributions':[{'name':'Photographer','url':'https://example.org/author'}],
    });
    expect(store.shopCategory,'variety');
    expect(store.photoRef,contains('photos/'));
    expect(store.photoAttributions.first['name'],'Photographer');
  });
  test('Missing shop photos and services remain unknown', () {
    final store=OnlineShop.fromJson({'id':'listed-1','name':'Local store'});
    expect(store.photoRef,isNull);
    expect(store.photoAttributions,isEmpty);
    expect(store.shopCategory,'spaza');
  });

  test('Online listed stores do not invent stock or merchant approval', () {
    final s=OnlineShop.fromJson({
      'id':'osm-node-1','name':'Test listed spaza','area':'Inanda',
      'sourceUrl':'https://www.openstreetmap.org/node/1','origin':'openstreetmap',
      'latitude':-29.7,'longitude':30.9
    });
    expect(s.name,'Test listed spaza');
    expect(s.origin,'openstreetmap');
    expect(s.lat,-29.7);
    expect(s.claimUrl,'');
  });
}
