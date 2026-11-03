import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_home.dart';
import 'package:teyza_shopper/shopper_delivery_profile.dart';
import 'session_test.dart' show MemoryStore;

const savedShopper=ShopperDeliveryProfile(
  address:'12 Main Road, KwaMashu, Durban',
  area:'KwaMashu',city:'Durban',displayName:'Private Shopper',
  email:'private@example.test',phone:'082 123 4567',
  latitude:-29.736,longitude:30.987);

class SignedInTestSession extends ShopperSession {
  SignedInTestSession(SessionStore store):super(store:store){
    isReady=true;userId='shopper-1';email='private@example.test';
    name='Private Shopper';
  }
}

Widget homeFor(ShopperSession session,ShopperDeliveryProfileStore profiles)=>
  MaterialApp(home:ShopperHome(session:session,shopperProfileStore:profiles,
    enableBackgroundServices:false,catalogueLoader:()async=>[],
    directoryLoader:(area,category,radius)async=>[]));

void main(){
  test('Only the confirmed location survives logout, never personal contact data',()async{
    final vault=MemoryStore(),profiles=ShopperDeliveryProfileStore(vault:vault);
    await profiles.save('shopper-1',savedShopper);
    await profiles.saveDeviceLocation(savedShopper);
    final loc=await ShopperDeliveryProfileStore(vault:vault).loadDeviceLocation();
    expect(loc!.address,'12 Main Road, KwaMashu, Durban');
    expect(loc.latitude,-29.736);
    expect(vault.values['teyza_last_confirmed_delivery_location'],isNot(contains('Private Shopper')));
    expect(vault.values['teyza_last_confirmed_delivery_location'],isNot(contains('private@example.test')));
    expect(vault.values['teyza_last_confirmed_delivery_location'],isNot(contains('082 123')));
    expect(await profiles.load('shopper-2'),isNull);
    expect((await profiles.load('shopper-1'))!.displayName,'Private Shopper');
  });

  testWidgets('Logging out returns to nearby shops without Set your delivery address popup',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final vault=MemoryStore(),profiles=ShopperDeliveryProfileStore(vault:vault),
      session=SignedInTestSession(vault);
    await profiles.save('shopper-1',savedShopper);
    await tester.pumpWidget(homeFor(session,profiles));
    await tester.pumpAndSettle();
    expect(find.text('Set your delivery address'),findsNothing);
    expect(find.textContaining('12 Main Road'),findsWidgets);

    await session.signOut();
    await tester.pumpAndSettle();
    expect(session.userId,isNull);
    expect(find.text('Set your delivery address'),findsNothing);
    expect(find.textContaining('12 Main Road'),findsWidgets);
    final location=await profiles.loadDeviceLocation();
    expect(location?.address,'12 Main Road, KwaMashu, Durban');

    await tester.pumpWidget(const SizedBox.shrink());
    session.dispose();
    // An app restart while signed out also restores the location alone.
    final another=ShopperSession(store:vault)..isReady=true;
    await tester.pumpWidget(homeFor(another,profiles));
    await tester.pumpAndSettle();
    expect(find.text('Set your delivery address'),findsNothing);
    expect(find.textContaining('12 Main Road'),findsWidgets);
    await tester.pumpWidget(const SizedBox.shrink());
    another.dispose();
  });

  testWidgets('A different signed-in UID never inherits a previous shopper personal profile',(tester)async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final vault=MemoryStore(),profiles=ShopperDeliveryProfileStore(vault:vault);
    await profiles.save('shopper-1',savedShopper);
    await profiles.saveDeviceLocation(savedShopper);
    final visitor=ShopperSession(store:vault)..isReady=true..userId='different-uid';
    await tester.pumpWidget(homeFor(visitor,profiles));
    await tester.pumpAndSettle();
    expect(find.text('Set your delivery address'),findsNothing);
    expect(find.textContaining('12 Main Road'),findsWidgets);
    expect(await profiles.load('different-uid'),isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    visitor.dispose();
  });
}
