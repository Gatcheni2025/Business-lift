import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/shopper_discovery.dart';

void main(){
  test('Google search and photo endpoints use dedicated HTTPS PHP backend',(){
    final search=teyzaPlacesUrl('shopper-discover.php',{'category':'spaza'});
    expect(search.scheme,'https');
    expect(search.host,'discover.teyza.co.za');
    expect(search.path,'/api/shopper-discover.php');
    expect(teyzaGooglePhotoUrl('places/test12345/photos/samplephoto123')
      .path,'/api/shopper-place-photo.php');
  });
  test('Live Places response retains Google photo reference and attributions',() async {
    final client=MockClient((req) async {
      expect(req.url.host,'discover.teyza.co.za');
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
  test('Unavailable Google/PHP feed falls back to attributed live OSM map data',() async {
    final client=MockClient((req) async {
      if(req.url.host=='discover.teyza.co.za'){
        return http.Response('Missing endpoint',404);
      }
      expect(req.url.host,'overpass-api.de');
      expect(req.body,contains('around:4500'));
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
