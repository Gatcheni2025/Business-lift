import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_discovery.dart';
import 'package:teyza_shopper/shopper_home.dart';

OnlineShop google(String name,{String type='grocery_store',String category='spaza',
  bool verified=false})=>OnlineShop(name,name,'Durban','Durban',
  'https://maps.google.com','google_places','',-29.8,31.02,
  shopCategory:category,types:[type],categorizationVerified:verified);

void main(){
 test('spaza search rejects Checkers, Spar, Shoprite and generic supermarkets even when tagged as grocery',(){
  for(final name in ['Checkers','SPAR Mount Edgecombe','Shoprite','Pick n Pay',
   'Woolworths Food','Makro','Game','Boxer Supermarket']){
   expect(teyzaMatchesShopCategory(google(name,type:'supermarket',verified:true),'spaza'),
     false,reason:name);
  }
  expect(teyzaMatchesShopCategory(google('Durban Big Supermarket',type:'supermarket'),'spaza'),false);
  expect(teyzaMatchesShopCategory(google('Main Street Spaza',type:'convenience_store'),'spaza'),true);
  expect(teyzaMatchesShopCategory(google('Community Tuck Shop'),'spaza'),true);
  expect(teyzaMatchesShopCategory(google('Unspecified Grocery',type:'grocery_store'),'spaza'),false);
 });
 test('public business service listings never become grocery or wholesale products',(){
  final shop=Shop.fromJson({
    'id':'business1','name':'Local Salon','shopCategory':'retail',
    'products':[{'id':'old','name':'Retail goods','priceCents':2000,'stock':3}],
    'serviceHighlights':[{'id':'hair','type':'Beauty & hair',
      'name':'Braiding','description':'Natural hair styling'}]
  });
  expect(shop.shopCategory,'variety');
  expect(shop.products,isEmpty);
  expect(shop.serviceHighlights.single['name'],'Braiding');
  expect(discoverShopProducts([shop],type:'spaza'),isEmpty);
 });
 test('Google retail business listings are mapped to local businesses, never spazas',(){
  final listing=OnlineShop.fromJson({
   'id':'google-salon-1','name':'Township Hair Salon',
   'origin':'google_places','shopCategory':'retail',
   'primaryType':'beauty_salon','latitude':-29.8,'longitude':31.02
  });
  expect(listing.shopCategory,'variety');
  expect(teyzaMatchesShopCategory(listing,'spaza'),false);
  expect(teyzaMatchesShopCategory(listing,'variety'),true);
 });

}
