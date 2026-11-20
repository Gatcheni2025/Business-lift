import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/shopper_discovery.dart';
import 'package:teyza_shopper/shopper_home.dart';

void main(){
  test('Only a known legacy manual area can be restored without guessing GPS',(){
    expect(teyzaLegacySavedArea('Durban')?.city,'Durban');
    expect(teyzaLegacySavedArea('  kwAMASHu  ')?.label,'KwaMashu');
    expect(teyzaLegacySavedArea('gps'),isNull);
    expect(teyzaLegacySavedArea('Unknown city'),isNull);
    expect(teyzaLegacySavedArea(null),isNull);
  });
  test('Google-only spaza protection still excludes large retailers',(){
    final checkers=OnlineShop('google-checkers','Checkers','Durban','Durban',
      'https://maps.google.com','google_places','',-29.858,31.02,
      shopCategory:'spaza',types:const ['convenience_store'],
      categorizationVerified:true);
    expect(teyzaMatchesShopCategory(checkers,'spaza'),isFalse);
    final grocery=OnlineShop('google-grocery','Unclassified Grocery','Durban','Durban',
      'https://maps.google.com','google_places','',-29.858,31.02,
      shopCategory:'spaza',types:const ['grocery_store']);
    expect(teyzaMatchesShopCategory(grocery,'spaza'),isFalse);
  });

  test('Clearly tagged OSM convenience shop remains discoverable when Google is unavailable',()async{
    final client=MockClient((request)async{
      if(request.url.host=='us-central1-business-lift-3c19c.cloudfunctions.net')
        return http.Response('{"error":"temporarily unavailable"}',503);
      expect(request.url.host,'overpass-api.de');
      expect(request.method,'POST');
      return http.Response(jsonEncode({'elements':[
        {'type':'node','id':987654201,'lat':-29.8155,'lon':31.0281,
          'tags':{'shop':'convenience','name':'Neighbourhood Corner Market'}},
        {'type':'node','id':987654202,'lat':-29.8156,'lon':31.0282,
          'tags':{'shop':'convenience','name':'Checkers'}}
      ]}),200);
    });
    final listings=await findOnlineShops(latitude:-29.8155,longitude:31.0281,
      area:'Durban',category:'spaza',client:client);
    expect(listings.map((s)=>s.name),['Neighbourhood Corner Market']);
    expect(listings.single.origin,'openstreetmap');
    expect(listings.single.categorizationVerified,isFalse);
    expect(listings.single.placeId,isEmpty);
  });

  test('OSM wholesalers retain their identity without exposing inventory',()async{
    final client=MockClient((request)async{
      if(request.url.host=='us-central1-business-lift-3c19c.cloudfunctions.net')
        return http.Response('',502);
      return http.Response(jsonEncode({'elements':[
        {'type':'node','id':987654301,'lat':-29.8221,'lon':31.0418,
         'tags':{'shop':'wholesale','name':'Fresh Depot Suppliers'}}
      ]}),200);
    });
    final places=await findOnlineShops(latitude:-29.8221,longitude:31.0418,
      area:'Durban',category:'wholesale',client:client);
    expect(places,hasLength(1));
    expect(places.single.shopCategory,'wholesale');
    expect(places.single.origin,'openstreetmap');
    expect(places.single.categorizationVerified,isFalse);
    expect(places.single.name,'Fresh Depot Suppliers');
  });

  test('OSM variety_store is treated as independent local business',()async{
    final client=MockClient((request)async{
      if(request.url.host=='us-central1-business-lift-3c19c.cloudfunctions.net')
        return http.Response('',503);
      return http.Response(jsonEncode({'elements':[
        {'type':'node','id':987654401,'lat':-29.8238,'lon':31.0462,
         'tags':{'shop':'variety_store','name':'Mthembu Family Store'}}
      ]}),200);
    });
    final places=await findOnlineShops(latitude:-29.8238,longitude:31.0462,
      area:'Durban',category:'variety',client:client);
    expect(places,hasLength(1));
    expect(places.single.shopCategory,'variety');
    expect(places.single.origin,'openstreetmap');
    final merchant=Shop.fromJson({
      'id':'registered-business','name':'Local Repair Shop','shopCategory':'retail',
      'products':[], 'identityVerified':true});
    expect(merchant.shopCategory,'variety');
    expect(merchant.products,isEmpty);
  });
}
