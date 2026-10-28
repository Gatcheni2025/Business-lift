import 'dart:async';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:teyza_shopper/shopper_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/facebook_identity.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'session_test.dart' show MemoryStore;
http.Response reply(Object value)=>http.Response(jsonEncode(value),200);
http.Response authenticated()=>reply({'idToken':'firebase-token','refreshToken':'refresh-token','localId':'existing-user','email':'owner@example.test'});
http.Response profile()=>reply({'users':[{'localId':'existing-user','email':'owner@example.test','emailVerified':true}]});
class FakeFacebookSession extends ShopperSession {
 FakeFacebookSession():super(store:MemoryStore()){isReady=true;}
 @override bool get facebookSignInAvailable=>true;
 @override Future<void> signInWithFacebook() async {idToken='firebase-session';userId='existing-user';emailVerified=true;notifyListeners();}
}
void main(){
 for(final owner in [false,true])testWidgets('Facebook returns to the selected ${owner?'owner':'shopper'} workspace',(t) async {
  var ownerCalls=0,shopperCalls=0;final session=FakeFacebookSession();
  await t.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(session:session,onOpenOwner:()=>ownerCalls++,onShopperSignedIn:()=>shopperCalls++))));
  await t.tap(find.text(owner?'Continue as Shop Owner':'Continue as Shopper'));await t.pumpAndSettle();
  final button=find.text('Continue with Facebook');await t.ensureVisible(button);await t.pumpAndSettle();await t.tap(button);await t.pumpAndSettle();
  expect(ownerCalls,owner?1:0);expect(shopperCalls,owner?0:1);expect(session.hasAdminClaim,false);
  await t.pumpWidget(const SizedBox.shrink());session.dispose();
 });

 test('Google credentials use the same Firebase session, never local seller/admin permissions',() async {
  final client=MockClient((r) async {if(r.url.path.endsWith('signInWithIdp')){final d=jsonDecode(r.body),body=Uri.splitQueryString(d['postBody']);expect(body,{'id_token':'google-token','providerId':'google.com'});expect(d['returnIdpCredential'],false);return authenticated();}return profile();});
  final s=ShopperSession(client:client,store:MemoryStore(),googleRequest:() async=>const AppleIdentity('google-token'));
  await s.signInWithGoogle();expect(s.userId,'existing-user');expect(s.hasAdminClaim,false);expect(s.isBusy,false);s.dispose();client.close();
 });
 for(final limited in [false,true])test('Facebook ${limited?'Limited':'Classic'} credential is exchanged for the verified Firebase identity',() async {
  String? hashed;
  final store=MemoryStore(),client=MockClient((r) async {if(!r.url.path.endsWith('signInWithIdp'))return profile();final d=jsonDecode(r.body),body=Uri.splitQueryString(d['postBody']);expect(body['providerId'],'facebook.com');expect(body[limited?'id_token':'access_token'],'facebook-token');expect(d['returnIdpCredential'],false);if(limited){expect(sha256.convert(utf8.encode(body['nonce']!)).toString(),hashed);}else{expect(body.containsKey('nonce'),false);}return authenticated();});
  final s=ShopperSession(client:client,store:store,facebookRequest:(nonce) async{hashed=nonce;return FacebookIdentity('facebook-token',limited:limited);});
  await s.signInWithFacebook();expect(s.userId,'existing-user');expect(s.emailVerified,true);expect(store.values.values, isNot(contains('facebook-token')));expect(s.hasAdminClaim,false);s.dispose();client.close();
 });
 test('Facebook cancellation and empty tokens never create an account or issue a Firebase request',() async {
  var calls=0;final client=MockClient((r) async {calls++;return authenticated();});
  final s=ShopperSession(client:client,store:MemoryStore(),facebookRequest:(_) async=>null);await s.signInWithFacebook();expect(s.userId,isNull);expect(s.isBusy,false);expect(calls,0);s.dispose();
  final invalid=ShopperSession(client:client,store:MemoryStore(),facebookRequest:(_) async=>const FacebookIdentity(''));await expectLater(invalid.signInWithFacebook(),throwsStateError);expect(calls,0);expect(invalid.idToken,isNull);invalid.dispose();client.close();
 });
 test('A delayed Facebook or Google result cannot restore a signed-out session',() async {
  for(final facebook in [true,false]){var calls=0;final client=MockClient((r) async{calls++;return authenticated();}),fb=Completer<FacebookIdentity?>(),google=Completer<AppleIdentity?>();
   final s=ShopperSession(client:client,store:MemoryStore(),facebookRequest:(_)=>fb.future,googleRequest:()=>google.future);final pending=facebook?s.signInWithFacebook():s.signInWithGoogle();await s.signOut();if(facebook){fb.complete(const FacebookIdentity('late-token'));}else{google.complete(const AppleIdentity('late-token'));}await pending;expect(s.idToken,isNull);expect(s.userId,isNull);expect(calls,0);s.dispose();client.close();}
 });
 test('Apple is offered on iPhone alongside Google; Facebook activation is explicit',() {
  debugDefaultTargetPlatformOverride=TargetPlatform.iOS;addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  final s=ShopperSession(store:MemoryStore());expect(s.appleSignInAvailable,true);expect(s.googleSignInAvailable,true);s.dispose();
 });
}
