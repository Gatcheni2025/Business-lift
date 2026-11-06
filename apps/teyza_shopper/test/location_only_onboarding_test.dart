import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_delivery_profile.dart';

void main(){
  testWidgets('Delivery onboarding collects only a location, not registration details',(tester)async{
    final session=ShopperSession();
    const saved=ShopperDeliveryProfile(
      address:'12 Main Road, KwaMashu, Durban',
      area:'KwaMashu',city:'Durban',displayName:'',email:'',phone:'',
      latitude:-29.736,longitude:30.987);
    await tester.pumpWidget(MaterialApp(home:Scaffold(
      body:ShopperDeliveryProfileSheet(session:session,initial:saved))));
    expect(find.text('Set your delivery address'),findsOneWidget);
    expect(find.text('Full delivery street address'),findsOneWidget);
    expect(find.text('Full name'),findsNothing);
    expect(find.text('Email address'),findsNothing);
    expect(find.text('Contact number'),findsNothing);
    expect(find.text('Save address & find nearby shops'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
  });
}
