import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:teyza_shopper/shopper_auth.dart';

class MemoryStore implements SessionStore {
  final values=<String,String>{};
  @override Future<String?> read(String key) async=>values[key];
  @override Future<void> write(String key,String value) async{values[key]=value;}
  @override Future<void> delete(String key) async{values.remove(key);}
}
class SlowStore extends MemoryStore {
  final started=Completer<void>(),finish=Completer<void>();
  bool first=true;
  @override Future<void> write(String key,String value) async{
    if(first){first=false;started.complete();await finish.future;}
    await super.write(key,value);
  }
}
http.Response jsonReply(Object data,[int status=200])=>http.Response(jsonEncode(data),status);
const login={'idToken':'id-token','refreshToken':'refresh-token','localId':'user1','email':'user@example.test'};
http.Response profile()=>jsonReply({'users':[{'localId':'user1','email':'user@example.test',
  'emailVerified':true,'displayName':'Teyza Customer'}]});
http.Response refreshed()=>jsonReply({'id_token':'new-token','refresh_token':'rotated-refresh','user_id':'user1'});

void main(){
  test('Email sign-in uses the existing Firebase project and secure session store',() async{
    final store=MemoryStore();
    final requests=<http.Request>[];
    final client=MockClient((request) async{
      requests.add(request);
      expect(request.url.host,'identitytoolkit.googleapis.com');
      expect(request.url.queryParameters['key'],teyzaFirebaseApiKey);
      if(request.url.path.endsWith('signInWithPassword')){
        expect(jsonDecode(request.body),{'email':'user@example.test','password':'password123','returnSecureToken':true});
        return jsonReply(login);
      }
      return profile();
    });
    final session=ShopperSession(client:client,store:store);
    await session.signIn('  user@example.test  ','password123');
    expect(session.userId,'user1');expect(session.emailVerified,isTrue);
    expect(session.name,'Teyza Customer');expect(session.isBusy,isFalse);
    expect(store.values['teyza_refresh'],'refresh-token');
    expect(store.values.values,isNot(contains('id-token')));
    expect(requests,hasLength(2));session.dispose();client.close();
  });
  test('Shopper signup creates an Auth account without creating a merchant',() async{
    final calls=<String>[];
    final client=MockClient((r) async{
      calls.add(r.url.path);
      expect(r.url.host,'identitytoolkit.googleapis.com');
      if(r.url.path.endsWith('signUp'))return jsonReply(login);
      if(r.url.path.endsWith('lookup'))return profile();
      expect(r.url.path,endsWith('update'));
      expect(jsonDecode(r.body)['returnSecureToken'],isFalse);
      return jsonReply({});
    });
    final session=ShopperSession(client:client,store:MemoryStore());
    await session.register('New Shopper','user@example.test','password123');
    expect(session.name,'New Shopper');expect(calls,hasLength(3));
    session.dispose();client.close();
  });
  test('Wrong password never creates an assumed authenticated session',() async{
    final store=MemoryStore();
    final client=MockClient((_) async=>jsonReply({'error':{'message':'INVALID_LOGIN_CREDENTIALS'}},400));
    final session=ShopperSession(client:client,store:store);
    await expectLater(session.signIn('user@example.test','wrong-password'),throwsStateError);
    expect(session.idToken,isNull);expect(session.userId,isNull);
    expect(session.isBusy,isFalse);expect(store.values,isEmpty);
    session.dispose();client.close();
  });
  test('Incomplete sign-in response cannot expose an owner workspace',() async{
    final client=MockClient((_) async=>jsonReply({'idToken':'incomplete'}));
    final session=ShopperSession(client:client,store:MemoryStore());
    await expectLater(session.signIn('user@example.test','password123'),throwsStateError);
    expect(session.idToken,isNull);expect(session.userId,isNull);
    session.dispose();client.close();
  });
  test('App reopening restores the same verified UID and rotated refresh token',() async{
    final store=MemoryStore()..values['teyza_refresh']='old-refresh';
    final client=MockClient((r) async{
      if(r.url.host=='securetoken.googleapis.com'){
        expect(r.bodyFields['refresh_token'],'old-refresh');return refreshed();
      }
      return profile();
    });
    final session=ShopperSession(client:client,store:store);
    await session.restore();
    expect(session.userId,'user1');expect(session.emailVerified,isTrue);
    expect(session.isReady,isTrue);expect(store.values['teyza_refresh'],'rotated-refresh');
    session.dispose();client.close();
  });
  test('Revoked login is cleared from memory and secure storage',() async{
    final store=MemoryStore()..values['teyza_refresh']='revoked';
    final client=MockClient((_) async=>jsonReply({'error':{'message':'INVALID_REFRESH_TOKEN'}},400));
    final session=ShopperSession(client:client,store:store);
    await session.restore();
    expect(session.idToken,isNull);expect(session.isReady,isTrue);expect(store.values,isEmpty);
    session.dispose();client.close();
  });
  test('Temporary network failure restores no assumed session but retains secure refresh for retry',() async{
    final store=MemoryStore()..values['teyza_refresh']='retry-refresh';
    final client=MockClient((_) async=>throw http.ClientException('Offline'));
    final session=ShopperSession(client:client,store:store);
    await session.restore();
    expect(session.idToken,isNull);expect(session.emailVerified,isFalse);
    expect(store.values['teyza_refresh'],'retry-refresh');expect(session.isBusy,isFalse);
    session.dispose();client.close();
  });
  test('Refresh UID mismatch clears the session before merchant requests',() async{
    final store=MemoryStore();
    final client=MockClient((r) async{
      if(r.url.host=='securetoken.googleapis.com')return jsonReply({
        'id_token':'wrong-user-token','refresh_token':'wrong-refresh','user_id':'different-user'});
      return r.url.path.endsWith('lookup')?profile():jsonReply(login);
    });
    final session=ShopperSession(client:client,store:store);
    await session.signIn('user@example.test','password123');
    await expectLater(session.freshIdToken(),throwsStateError);
    expect(session.idToken,isNull);expect(session.userId,isNull);expect(store.values,isEmpty);
    expect(session.isReady,isTrue);
    session.dispose();client.close();
  });
  test('Signing out during secure persistence cannot save an old login afterwards',() async{
    final store=SlowStore();
    final client=MockClient((r) async=>r.url.path.endsWith('lookup')?profile():jsonReply(login));
    final session=ShopperSession(client:client,store:store);
    final signingIn=session.signIn('user@example.test','password123');
    await store.started.future;
    final signingOut=session.signOut();
    store.finish.complete();await signingIn;await signingOut;
    expect(session.idToken,isNull);expect(session.userId,isNull);
    expect(session.isReady,isTrue);expect(store.values,isEmpty);
    session.dispose();client.close();
  });
  test('Signing out while restoration is pending cannot restore the old account',() async{
    final store=MemoryStore()..values['teyza_refresh']='pending-refresh';
    final reply=Completer<http.Response>();
    final started=Completer<void>();
    final client=MockClient((r){started.complete();return reply.future;});
    final session=ShopperSession(client:client,store:store);
    final restoring=session.restore();await started.future;
    await session.signOut();reply.complete(refreshed());await restoring;
    expect(session.idToken,isNull);expect(session.userId,isNull);expect(store.values,isEmpty);
    session.dispose();client.close();
  });
  test('Password recovery sends only the expected Firebase reset request',() async{
    final client=MockClient((r) async{
      expect(r.url.path,endsWith('sendOobCode'));
      expect(jsonDecode(r.body),{'requestType':'PASSWORD_RESET','email':'user@example.test'});
      return jsonReply({});
    });
    final session=ShopperSession(client:client,store:MemoryStore());
    await session.resetPassword(' user@example.test ');
    expect(session.idToken,isNull);session.dispose();client.close();
  });
  test('Invalid identity lookup cannot authorize a different Firebase UID',() async{
    final client=MockClient((r) async=>r.url.path.endsWith('lookup')?
      jsonReply({'users':[{'localId':'not-user1','emailVerified':true}]}):jsonReply(login));
    final store=MemoryStore();final session=ShopperSession(client:client,store:store);
    await expectLater(session.signIn('user@example.test','password123'),throwsStateError);
    expect(session.idToken,isNull);expect(session.emailVerified,isFalse);expect(store.values,isEmpty);
    session.dispose();client.close();
  });
}
