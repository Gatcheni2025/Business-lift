import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_marketplace/market_api.dart';

void main() {
  test('Teyza currency parser works in integer cents', () {
    expect(randCents('12.50'), 1250);
    expect(randCents('100'), 10000);
    expect(randCents('7,5'), 750);
    expect(randCents('0.01'), 1);
  });

  test('Teyza rejects ambiguous or invalid price formats', () {
    expect(() => randCents(''), throwsFormatException);
    expect(() => randCents('12.345'), throwsFormatException);
    expect(() => randCents('R 12'), throwsFormatException);
    expect(() => randCents('-5'), throwsFormatException);
  });
}
