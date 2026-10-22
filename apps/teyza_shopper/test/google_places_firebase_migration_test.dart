import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/shopper_discovery.dart';

void main(){
  test('Google search and photo endpoints use Firebase Cloud Function with Google-managed HTTPS',(){
    final search=teyzaPlacesUrl('shopper-discover.php',{'category':'spaza'});
    expect(search.scheme,'https');
    expect(search.host,'us-central1-business-lift-3c19c.cloudfunctions.net');
    expect(search.path,'/teyzaPlaces/shopper-discover.php');
    expect(teyzaGooglePhotoUrl('places/test12345/photos/samplephoto123')
      .path,'/teyzaPlaces/shopper-place-photo.php');
  });
  test('Live Places response retains Google photo reference and attributions',() async {
    final client=MockClient((req) async {
      expect(req.url.host,'us-central1-business-lift-3c19c.cloudfunctions.net');
      return http.Response(jsonEncode({'ok':true,'provider':'google_places','entries':[{
        'id':'google-ChIJ0123456789','name':'Real Spaza',
        'origin':'google_places','latitude':-29.74,'longitude':30.99,
        'photoRef':'places/ChIJ0123456789/photos/Photo_123456789',
        'photoAttributions':[{'name':'Shop photographer','url':'https://example.org/credit'}]
      }]}),200);
    });
    final shops=await findOnlineShops(
      latitude:-29.74,longitude:30.99,client:client);
    expect(shops.length,1);
    expect(shops.single.origin,'google_places');
    expect(shops.single.photoRef,contains('/photos/'));
    expect(shops.single.photoAttributions.single['name'],'Shop photographer');
  });
  test('R3.4 Cloud Function photo URL and contributor credit survive parsing',(){
    final shop=OnlineShop.fromJson({
      'id':'google-ChIJ9876','name':'China Mall','origin':'google_places',
      'shopCategory':'variety',
      'photoUrl':'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-place-photo.php?name=places%2FChIJ9876%2Fphotos%2FATabc',
      'photoAttributions':[{'name':'Store photo owner','url':''}]
    });
    expect(shop.hasPhoto,isTrue);
    expect(shop.displayPhotoUrl,contains('shopper-place-photo.php'));
    expect(shop.photoAttributions.single['name'],'Store photo owner');
    expect(teyzaMatchesShopCategory(shop,'variety'),isTrue);
  });
  test('A fake photo host is rejected and old Google reference is supported',(){
    final external=OnlineShop.fromJson({
      'id':'google-1','name':'Spaza Shop','photoUrl':'https://untrusted.example/photo'
    });
    expect(external.displayPhotoUrl,isNull);
    final legacy=OnlineShop.fromJson({
      'id':'google-2','name':'Real Spaza','photoRef':'places/ChIJabc/photos/ATabc'
    });
    expect(legacy.displayPhotoUrl,contains('ref='));
  });
  test('Spaza and variety search do not mix unrelated businesses',(){
    OnlineShop example(String name)=>OnlineShop.fromJson({
      'id':'google-'+name,'name':name,'origin':'google_places'
    });
    expect(teyzaMatchesShopCategory(example('China Mall'),'variety'),isTrue);
    expect(teyzaMatchesShopCategory(example('Qolo Tuckshop'),'variety'),isFalse);
    expect(teyzaMatchesShopCategory(example('Las G Tyres'),'variety'),isFalse);
    expect(teyzaMatchesShopCategory(example('Phoenix Group of Companies'),'spaza'),isFalse);
    expect(teyzaMatchesShopCategory(example('Shalom Spaza'),'spaza'),isTrue);
  });
  test('Unavailable Firebase Places feed falls back to attributed live OSM map data',() async {
    final client=MockClient((req) async {
      if(req.url.host=='us-central1-business-lift-3c19c.cloudfunctions.net'){
        return http.Response('Missing endpoint',404);
      }
      expect(req.url.host,'overpass-api.de');
      expect(req.bodyFields['data'],contains('around:4500'));
      return http.Response(jsonEncode({'elements':[{
        'type':'node','id':12345,'lat':-29.80,'lon':30.97,
        'tags':{'name':'Observed Tuckshop','shop':'convenience'}
      }]}),200);
    });
    final shops=await findOnlineShops(latitude:-29.80,longitude:30.97,client:client);
    expect(shops,hasLength(1));
    expect(shops.single.origin,'openstreetmap');
    expect(shops.single.source,contains('openstreetmap.org'));
    expect(shops.single.photoRef,isNull);
  });
}
