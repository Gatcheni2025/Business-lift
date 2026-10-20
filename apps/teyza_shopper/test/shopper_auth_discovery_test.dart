import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_discovery.dart';

void main() {
  test('Firebase authentication errors have clear messages', () {
    expect(authMessage(StateError('INVALID_LOGIN_CREDENTIALS')), contains('Incorrect email'));
    expect(authMessage(StateError('EMAIL_EXISTS')), contains('already registered'));
    expect(authMessage(StateError('TOO_MANY_ATTEMPTS_TRY_LATER')), contains('Too many'));
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
