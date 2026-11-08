import 'package:flutter/foundation.dart' show debugDefaultTargetPlatformOverride;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/shopper_account.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'package:teyza_shopper/shopper_delivery_profile.dart';
import 'package:teyza_shopper/shopper_payment_preference.dart';
import 'session_test.dart' show MemoryStore;

class ProfileShopperSession extends ShopperSession {
  ProfileShopperSession(SessionStore store):super(store:store){
    isReady=true;userId='shopper-123';idToken='test-id';
    email=null;name=null;emailVerified=false;anonymousShopper=false;
  }
}

const profile=ShopperDeliveryProfile(
  address:'12 Main Road, KwaMashu, Durban',
  area:'KwaMashu',city:'Durban',displayName:'Saved Shopper',
  email:'shopper@example.test',phone:'082 123 4567',
  latitude:-29.736,longitude:30.987);

void main(){
 test('Shopper profile and preference survive local encrypted-store restart',()async{
   final vault=MemoryStore(),profiles=ShopperDeliveryProfileStore(vault:vault),
     payments=ShopperPaymentPreferenceStore(vault:vault);
   await profiles.save('shopper-123',profile);
   await payments.save('shopper-123',ShopperPaymentPreferenceStore.cardAtShop);
   final restored=await ShopperDeliveryProfileStore(vault:vault).load('shopper-123');
   expect(restored!.displayName,'Saved Shopper');
   expect(restored.phone,'082 123 4567');
   expect(restored.email,'shopper@example.test');
   expect(restored.address,'12 Main Road, KwaMashu, Durban');
   expect(await ShopperPaymentPreferenceStore(vault:vault).load('shopper-123'),
     ShopperPaymentPreferenceStore.cardAtShop);
   expect(await ShopperPaymentPreferenceStore(vault:vault).load('a-different-user'),
     ShopperPaymentPreferenceStore.cash);
 });
 testWidgets('Registered shopper account displays saved details, verification and no owner shortcut',(t)async{
   await t.binding.setSurfaceSize(const Size(400,900));
   addTearDown(()=>t.binding.setSurfaceSize(null));
   final vault=MemoryStore(),session=ProfileShopperSession(vault),
     profiles=ShopperDeliveryProfileStore(vault:vault),
     payments=ShopperPaymentPreferenceStore(vault:vault);
   await profiles.save('shopper-123',profile);
   var edits=0,ownerCalls=0;
   await t.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(
     session:session,deliveryStore:profiles,paymentStore:payments,
     onOpenOwner:()=>ownerCalls++,onChangeDeliveryAddress:()=>edits++))));
   await t.pumpAndSettle();
   expect(find.text('My Teyza account'),findsOneWidget);
   expect(find.text('Saved Shopper'),findsWidgets);
   expect(find.text('082 123 4567'),findsOneWidget);
   expect(find.text('shopper@example.test'),findsOneWidget);
   expect(find.text('Email not verified'),findsOneWidget);
   expect(find.text('Open shop owner workspace'),findsNothing);
   expect(ownerCalls,0);
   final payment=find.text('Payment method');
   await t.ensureVisible(payment);
   await t.pumpAndSettle();
   await t.tap(payment);await t.pumpAndSettle();
   await t.tap(find.text('Card at the shop').last);await t.pumpAndSettle();
   expect(await payments.load('shopper-123'),ShopperPaymentPreferenceStore.cardAtShop);
   await t.tap(find.text('Payment method'));await t.pumpAndSettle();
   await t.tap(find.text('Pay online by card').last);await t.pumpAndSettle();
   expect(await payments.load('shopper-123'),ShopperPaymentPreferenceStore.cardOnline);
   final terms=find.text('Terms of Service');
   await t.scrollUntilVisible(terms,180,scrollable:find.byType(Scrollable).first);
   expect(terms,findsOneWidget);
   await t.pumpWidget(const SizedBox.shrink());
   session.dispose();
 });
 testWidgets('Contact email is not falsely verified by an unrelated Google email',(t)async{
   await t.binding.setSurfaceSize(const Size(400,900));
   addTearDown(()=>t.binding.setSurfaceSize(null));
   final vault=MemoryStore(),session=ProfileShopperSession(vault);
   session.email='different@google.test';session.emailVerified=true;
   await t.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(
     session:session,savedProfile:profile,
     deliveryStore:ShopperDeliveryProfileStore(vault:vault),
     paymentStore:ShopperPaymentPreferenceStore(vault:vault)))));
   await t.pumpAndSettle();
   expect(find.text('Email not verified'),findsOneWidget);
   expect(find.text('Verified sign-in email'),findsOneWidget);
   expect(find.text('shopper@example.test'),findsOneWidget);
   await t.pumpWidget(const SizedBox.shrink());
   session.dispose();
 });
 testWidgets('New user registration is social-only; legacy email login remains available',(t)async{
   debugDefaultTargetPlatformOverride=TargetPlatform.android;
   addTearDown(()=>debugDefaultTargetPlatformOverride=null);
   await t.binding.setSurfaceSize(const Size(400,900));
   addTearDown(()=>t.binding.setSurfaceSize(null));
   final vault=MemoryStore(),session=ProfileShopperSession(vault);
   session.idToken=null;session.userId=null;session.email=null;
   await t.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(session:session))));
   await t.pumpAndSettle();
   await t.tap(find.text('Continue as Shopper'));
   await t.pumpAndSettle();
   final signup=find.text('New to Teyza? Register with Google, Facebook or Apple');
   await t.ensureVisible(signup);await t.tap(signup);await t.pumpAndSettle();
   expect(find.text('Join Teyza'),findsOneWidget);
   expect(find.text('Continue with Google'),findsOneWidget);
   expect(find.textContaining('separate email confirmation is not required'),findsOneWidget);
   expect(find.widgetWithText(TextFormField,'Email address'),findsNothing);
   expect(find.byType(TextFormField),findsNothing);
   final oldLogin=find.text('Already registered? Sign in with email');
   await t.ensureVisible(oldLogin);await t.tap(oldLogin);await t.pumpAndSettle();
   expect(find.byType(TextFormField),findsNWidgets(2));
   expect(find.text('Sign in as shopper'),findsOneWidget);
   await t.pumpWidget(const SizedBox.shrink());session.dispose();
 });
 testWidgets('Anonymous browsing identity is invited to register at the account tab',(t)async{
   final vault=MemoryStore(),session=ProfileShopperSession(vault);
   session.anonymousShopper=true;
   await t.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(session:session))));
   await t.pumpAndSettle();
   expect(find.text('My Teyza account'),findsNothing);
   expect(find.text('Continue as Shopper'),findsOneWidget);
   await t.pumpWidget(const SizedBox.shrink());
   session.dispose();
 });

}
