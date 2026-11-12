import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_selling.dart';

void main(){
  for(final (category,primary,secondary) in [
    ('spaza','Products','Orders'),
    ('retail','Services','Enquiries'),
    ('wholesale','Advertise','Partners')
  ]){
    testWidgets('$category dashboard navigation uses correct business tools',(tester)async{
      await tester.pumpWidget(MaterialApp(home:Scaffold(
        bottomNavigationBar:SellerNavigation(selected:0,accountType:category,onSelect:(_){})
      )));
      expect(find.text(primary),findsOneWidget);
      expect(find.text(secondary),findsOneWidget);
      if(category!='spaza')expect(find.text('Products'),findsNothing);
      expect(find.text('Chat'),findsNothing);
      expect(find.byKey(const ValueKey('seller-nav-3')),findsNothing);
      expect(find.byKey(const ValueKey('seller-nav-4')),findsOneWidget);
    });
  }
}
