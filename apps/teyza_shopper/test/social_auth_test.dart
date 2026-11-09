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
class FakeEmailAfterGoogleErrorSession extends ShopperSession {
 FakeEmailAfterGoogleErrorSession():super(store:MemoryStore()){isReady=true;}
 int googleCalls=0;
 @override bool get googleSignInAvailable=>true;
 @override Future<void> signInWithGoogle() async {
   googleCalls++;
   throw StateError('PlatformException(sign_in_failed, ApiException: 10: DEVELOPER_ERROR)');
 }
 @override Future<void> signIn(String address,String pass) async {
   idToken='firebase-email-session';userId='email-user';
   email=address;emailVerified=true;notifyListeners();
 }
}
void main(){
 testWidgets('Successful email sign-in removes an earlier Google OAuth mismatch warning',(t)async{
  debugDefaultTargetPlatformOverride=TargetPlatform.android;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  final session=FakeEmailAfterGoogleErrorSession();
  await t.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(session:session))));
  await t.tap(find.text('Continue as Shopper'));await t.pumpAndSettle();
  await t.tap(find.text('Continue with Google'));await t.pumpAndSettle();
  expect(session.googleCalls,1);
  await t.enterText(find.byType(TextFormField).at(0),'owner@example.test');
  await t.enterText(find.byType(TextFormField).at(1),'password123');
  await t.tap(find.text('Sign in as shopper'));await t.pumpAndSettle();
  expect(session.userId,'email-user');
  expect(find.text('My Teyza account'),findsOneWidget);
  expect(find.textContaining('Google sign-in configuration mismatch'),findsNothing);
  // The success status may be below a lazily-built ListView viewport.
  // UID and My Teyza account are the reliable on-screen success evidence.
  await t.pumpWidget(const SizedBox.shrink());session.dispose();
  debugDefaultTargetPlatformOverride=null;
 });

 for(final owner in [false,true])testWidgets('New social registration hides email password entry', (t)async{
  debugDefaultTargetPlatformOverride=TargetPlatform.android;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  final session=FakeFacebookSession();
  await t.pumpWidget(MaterialApp(home:Scaffold(body:ShopperAccountPanel(session:session))));
  await t.tap(find.text(owner?'Continue as Shop Owner':'Continue as Shopper'));
  await t.pumpAndSettle();
  final signup=owner?find.text('New shop owner? Register your shop'):
    find.text('New to Teyza? Register with Google, Facebook or Apple');
  await t.ensureVisible(signup);await t.pumpAndSettle();
  await t.tap(signup);await t.pumpAndSettle();
  expect(find.text('Join Teyza'),findsOneWidget);
  expect(find.byType(TextFormField),findsNothing);
  expect(find.text('Continue with Google'),findsOneWidget);
  expect(find.text('Continue with Facebook'),findsOneWidget);
  expect(find.text('Create shopper account'),findsNothing);
  expect(find.text('Create shop owner account'),findsNothing);
  final login=find.text('Already registered? Sign in with email');
  await t.ensureVisible(login);await t.pumpAndSettle();
  await t.tap(login);await t.pumpAndSettle();
  expect(find.byType(TextFormField),findsNWidgets(2));
  expect(find.text(owner?'Sign in as shop owner':'Sign in as shopper'),findsOneWidget);
  await t.pumpWidget(const SizedBox.shrink());session.dispose();
  debugDefaultTargetPlatformOverride=null;
 });
 test('Google OAuth mismatch explains Android test versus Play certificates',(){
  debugDefaultTargetPlatformOverride=TargetPlatform.android;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  final message=authMessage(StateError(
    'PlatformException(sign_in_failed, com.google.android.gms.common.api.ApiException: 10: )'));
  expect(message,contains('APK signing certificate'));
  expect(message,contains('Firebase'));
  expect(message,contains('Google Play'));
 });
 test('Google and Apple iPhone configuration errors have actionable messages',(){
  debugDefaultTargetPlatformOverride=TargetPlatform.iOS;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  expect(authMessage(StateError('DEVELOPER_ERROR')),contains('iOS OAuth client'));
  expect(authMessage(StateError('INVALID_IDP_RESPONSE')),contains('Google/Apple'));
 });
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

 test('Apple ID token uses SHA-256 challenge and raw nonce in Firebase REST exchange',() async {
  debugDefaultTargetPlatformOverride=TargetPlatform.iOS;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  String? hashedChallenge;
  var exchanges=0;
  final client=MockClient((request) async {
   if(request.url.path.endsWith('signInWithIdp')){
    exchanges++;
    final payload=jsonDecode(request.body);
    final query=Uri.splitQueryString(payload['postBody']);
    expect(query['providerId'],'apple.com');
    expect(query['id_token'],'apple-token');
    expect(query['nonce'],isNotEmpty);
    expect(sha256.convert(utf8.encode(query['nonce']!)).toString(),hashedChallenge);
    expect(payload['returnIdpCredential'],false);
    return authenticated();
   }
   return profile();
  });
  final session=ShopperSession(client:client,store:MemoryStore(),
   appleRequest:(hashed) async {
    hashedChallenge=hashed;
    return const AppleIdentity('apple-token');
   });
  await session.signInWithApple();
  expect(exchanges,1);
  expect(session.userId,'existing-user');
  expect(session.idToken,'firebase-token');
  expect(session.hasAdminClaim,false);
  expect(session.isBusy,false);
  session.dispose();client.close();
 });

 test('Link Google verifies existing anonymous shopper without changing UID or wiping shopping state',() async{
  debugDefaultTargetPlatformOverride=TargetPlatform.android;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  final vault=MemoryStore();
  var linked=false,accountCreations=0;
  final client=MockClient((request)async{
    if(request.url.path.endsWith('signUp')){
      accountCreations++;
      return reply({'idToken':'anon-id','refreshToken':'anon-refresh','localId':'saved-shopper-uid'});
    }
    if(request.url.host=='securetoken.googleapis.com')
      return reply({'id_token':'fresh-anon','refresh_token':'anon-refresh','user_id':'saved-shopper-uid'});
    if(request.url.path.endsWith('signInWithIdp')){
      final d=jsonDecode(request.body);
      expect(d['idToken'],'fresh-anon');
      final query=Uri.splitQueryString(d['postBody']);
      expect(query['providerId'],'google.com');
      expect(query['id_token'],'verified-google-token');
      linked=true;
      return reply({'idToken':'linked-id','refreshToken':'linked-refresh',
        'localId':'saved-shopper-uid','email':'saved@example.test',
        'displayName':'Provider name'});
    }
    if(request.url.path.endsWith('lookup')){
      return reply({'users':[{'localId':'saved-shopper-uid',
        'email':linked?'saved@example.test':'',
        'emailVerified':linked,
        'providerUserInfo':linked?[{'providerId':'google.com'}]:[]}]});
    }
    if(request.url.path.endsWith('update'))return reply({'localId':'saved-shopper-uid'});
    throw StateError('Unexpected authentication call ${request.url}');
  });
  final session=ShopperSession(client:client,store:vault,googleRequest:() async=>
    const AppleIdentity('verified-google-token',email:'saved@example.test'));
  await session.ensureShoppingIdentity();
  expect(session.userId,'saved-shopper-uid');
  session.name='Shopper display name';
  await session.verifyShopperWithGoogle();
  expect(session.userId,'saved-shopper-uid');
  expect(session.name,'Shopper display name');
  expect(session.anonymousShopper,false);
  expect(session.googleProviderLinked,true);
  expect(session.emailVerified,true);
  expect(session.email,'saved@example.test');
  expect(accountCreations,1);
  expect(vault.values['teyza_anonymous_shopper_uid'],'');
  session.dispose();client.close();
 });

 test('Link Apple verifies the same account with the correct nonce and preserves shopper UID',()async{
  debugDefaultTargetPlatformOverride=TargetPlatform.iOS;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  final vault=MemoryStore();String? challenge;var linked=false;
  final client=MockClient((request)async{
    if(request.url.path.endsWith('signUp'))return reply({
      'idToken':'anon-id','refreshToken':'anon-refresh','localId':'same-shopper'});
    if(request.url.host=='securetoken.googleapis.com')return reply({
      'id_token':'fresh-apple-anon','refresh_token':'anon-refresh','user_id':'same-shopper'});
    if(request.url.path.endsWith('signInWithIdp')){
      final d=jsonDecode(request.body);
      expect(d['idToken'],'fresh-apple-anon');
      final q=Uri.splitQueryString(d['postBody']);
      expect(q['providerId'],'apple.com');
      expect(q['id_token'],'signed-apple-id-token');
      expect(sha256.convert(utf8.encode(q['nonce']!)).toString(),challenge);
      linked=true;
      return reply({'idToken':'linked-apple','refreshToken':'apple-refresh','localId':'same-shopper',
        'email':'private@privaterelay.appleid.com'});
    }
    if(request.url.path.endsWith('lookup'))return reply({'users':[{
      'localId':'same-shopper','email':linked?'private@privaterelay.appleid.com':'',
      'emailVerified':linked,'providerUserInfo':linked?[{'providerId':'apple.com'}]:[]}]});
    throw StateError('Unexpected ${request.url}');
  });
  final session=ShopperSession(client:client,store:vault,
    appleRequest:(nonce)async{
      challenge=nonce;
      return const AppleIdentity('signed-apple-id-token',
        email:'private@privaterelay.appleid.com');
    });
  await session.ensureShoppingIdentity();
  await session.verifyShopperWithApple();
  expect(session.userId,'same-shopper');
  expect(session.appleProviderLinked,true);
  expect(session.emailVerified,true);
  expect(session.anonymousShopper,false);
  session.dispose();client.close();
 });

 test('Provider account conflict never switches the saved shopper account',()async{
  debugDefaultTargetPlatformOverride=TargetPlatform.android;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  final client=MockClient((request)async{
    if(request.url.path.endsWith('signUp'))return reply({
      'idToken':'anon-id','refreshToken':'anon-refresh','localId':'current-shopper'});
    if(request.url.host=='securetoken.googleapis.com')return reply({
      'id_token':'fresh-anon','refresh_token':'anon-refresh','user_id':'current-shopper'});
    if(request.url.path.endsWith('lookup'))return reply({'users':[{
      'localId':'current-shopper','emailVerified':false,'providerUserInfo':[]}]});
    if(request.url.path.endsWith('signInWithIdp'))
      return reply({'idToken':'unexpected-id','refreshToken':'other-refresh','localId':'different-user'});
    throw StateError('Unexpected ${request.url}');
  });
  final store=MemoryStore(),session=ShopperSession(client:client,store:store,
    googleRequest:()async=>const AppleIdentity('conflicting-google-id'));
  await session.ensureShoppingIdentity();
  await expectLater(session.verifyShopperWithGoogle(),throwsStateError);
  expect(session.userId,'current-shopper');
  // Refreshing the original UID legitimately rotated its Firebase ID token;
  // the rejected provider credential did not replace that UID or refresh token.
  expect(session.idToken,'fresh-anon');
  expect(session.idToken,isNot('unexpected-id'));
  expect(session.anonymousShopper,true);
  expect(store.values['teyza_anonymous_shopper_uid'],'current-shopper');
  session.dispose();client.close();
 });

 test('Apple cancellation never creates a Firebase identity or seller privilege',() async {
  debugDefaultTargetPlatformOverride=TargetPlatform.iOS;
  addTearDown(()=>debugDefaultTargetPlatformOverride=null);
  var calls=0;
  final client=MockClient((_) async {calls++;return authenticated();});
  final session=ShopperSession(client:client,store:MemoryStore(),appleRequest:(_) async=>null);
  await session.signInWithApple();
  expect(calls,0);
  expect(session.userId,isNull);
  expect(session.hasAdminClaim,false);
  expect(session.isBusy,false);
  session.dispose();client.close();
 });
}
