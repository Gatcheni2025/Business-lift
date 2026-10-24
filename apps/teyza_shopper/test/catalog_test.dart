import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/main.dart';

void main() {
  test('Basic shops can display reviewed product names without exposing prices',(){
    final shop=Shop.fromJson({'id':'basic-shop','name':'Local Shop','products':[],
      'productHighlights':[{'id':'bread','name':'Bread','category':'Groceries','imageUrl':'https://example.test/bread.jpg'}]});
    expect(shop.products,isEmpty);expect(shop.highlights.single.name,'Bread');
    expect(shop.highlights.single.priceCents,0);
  });
  test('Rand prices are formatted from cents', () {
    expect(rand(1250), 'R12.50');
    expect(rand(0), 'R0.00');
  });

  test('Sold-out products remain visible with availability while invalid prices are excluded', () {
    final shop = Shop.fromJson({
      'id': 'shop1', 'name': 'Spaza One', 'area': 'Durban',
      'products': [
        {'id': 'bread', 'name': 'Bread', 'priceCents': 1800, 'stock': 10},
        {'id': 'empty', 'name': 'Milk', 'priceCents': 2200, 'stock': 0},
        {'id': 'free', 'name': 'Rice', 'priceCents': 0, 'stock': 3}
      ]
    });
    expect(shop.products.length, 2);
    expect(shop.products.first.name, 'Bread');
    expect(shop.products.last.inStock,isFalse);
  });

  test('Shop privacy defaults opt-in checkout off', () {
    final shop = Shop.fromJson({'id': 'a', 'name': 'Shop', 'products': []});
    expect(shop.phone, '');
    expect(shop.pickup, false);
  });
}
