import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/main.dart';

void main() {
  test('Rand prices are formatted from cents', () {
    expect(rand(1250), 'R12.50');
    expect(rand(0), 'R0.00');
  });

  test('Shopper only displays products with positive stock and price', () {
    final shop = Shop.fromJson({
      'id': 'shop1', 'name': 'Spaza One', 'area': 'Durban',
      'products': [
        {'id': 'bread', 'name': 'Bread', 'priceCents': 1800, 'stock': 10},
        {'id': 'empty', 'name': 'Milk', 'priceCents': 2200, 'stock': 0},
        {'id': 'free', 'name': 'Rice', 'priceCents': 0, 'stock': 3}
      ]
    });
    expect(shop.products.length, 1);
    expect(shop.products.single.name, 'Bread');
  });

  test('Shop privacy defaults opt-in checkout off', () {
    final shop = Shop.fromJson({'id': 'a', 'name': 'Shop', 'products': []});
    expect(shop.phone, '');
    expect(shop.pickup, false);
  });
}
