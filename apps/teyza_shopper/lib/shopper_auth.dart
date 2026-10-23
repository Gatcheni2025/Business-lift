import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:google_sign_in/google_sign_in.dart';

// Public Firebase configuration. All three account types use the same project;
// choosing a login purpose never grants seller permissions or approval.
const teyzaFirebaseApiKey = 'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';
const _googleWebClientId = String.fromEnvironment('TEYZA_GOOGLE_WEB_CLIENT_ID');
const _googleIosClientId = String.fromEnvironment('TEYZA_GOOGLE_IOS_CLIENT_ID');

class AppleIdentity {
  final String idToken,email,name;
  const AppleIdentity(this.idToken,{this.email='',this.name=''});
}


abstract class SessionStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureSessionStore implements SessionStore {
  static const _vault = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true));
  @override Future<String?> read(String key) => _vault.read(key:key);
  @override Future<void> write(String key,String value) => _vault.write(key:key,value:value);
  @override Future<void> delete(String key) => _vault.delete(key:key);
}

String authMessage(Object error) {
  final value = error.toString();
  if (value.contains('EMAIL_EXISTS')) return 'This email is already registered. Sign in instead.';
  if (value.contains('INVALID_LOGIN_CREDENTIALS') ||
      value.contains('EMAIL_NOT_FOUND') || value.contains('INVALID_PASSWORD')) {
    return 'Incorrect email or password. Try again or reset your password.';
  }
  if (value.contains('INVALID_EMAIL')) return 'Enter a valid email address.';
  if (value.contains('WEAK_PASSWORD')) return 'Choose a stronger password (at least six characters).';
  if (value.contains('TOO_MANY_ATTEMPTS_TRY_LATER')) return 'Too many attempts. Please try again later.';
  if (value.contains('OPERATION_NOT_ALLOWED')) return 'This sign-in method is not enabled yet. Try email login or contact Teyza support.';
  if (value.contains('Google sign-in is not configured')) return 'Google login setup is not complete for this build. Use email login while Teyza connects it.';
  if (error is SignInWithAppleAuthorizationException) return 'Could not complete Apple sign-in. Please try again or use email login.';
  if (value.contains('Apple sign-in is not configured')) return 'Apple login setup is not complete. Please use email login and contact Teyza support.';
  if (value.contains('DEVELOPER_ERROR') || value.contains('10:')) return 'Google login setup mismatch. Please use email login and contact Teyza support.';
  if (value.contains('ACCOUNT_EXISTS_WITH_DIFFERENT_CREDENTIAL')) return 'This email uses another sign-in method. Use your original method or reset your password.';
  if (value.contains('USER_DISABLED')) return 'This account is disabled. Contact Teyza support.';
  if (value.contains('TOKEN_EXPIRED') || value.contains('INVALID_REFRESH_TOKEN') ||
      value.contains('USER_NOT_FOUND') || value.contains('Session expired')) {
    return 'Your session has expired. Sign in again.';
  }
  if (error is TimeoutException || error is http.ClientException ||
      value.contains('NETWORK') || value.contains('SocketException')) {
    return 'Connection unavailable. Check your internet and try again.';
  }
  return 'Could not complete sign-in. Please try again.';
}

class ShopperSession extends ChangeNotifier {
  ShopperSession({http.Client? client,SessionStore? store,this.appleRequest})
    : _client=client??http.Client(), _ownsClient=client==null,
      _store=store??SecureSessionStore();
  final Future<AppleIdentity?> Function(String hashedNonce)? appleRequest;
  final http.Client _client;
  final bool _ownsClient;
  final SessionStore _store;
  bool isReady = false, isBusy = false, emailVerified = false;
  String? email, name, idToken, userId;
  String? _refreshToken;
  int _version=0;
  bool _disposed=false;
  Future<String>? _refreshing;
  Future<void> _storageQueue=Future<void>.value();

  bool get googleSignInAvailable => !kIsWeb &&
    [TargetPlatform.android,TargetPlatform.iOS].contains(defaultTargetPlatform);
  bool get appleSignInAvailable => !kIsWeb && defaultTargetPlatform==TargetPlatform.iOS;
  bool get googleSignInConfigured => _googleWebClientId.trim().isNotEmpty &&
    (defaultTargetPlatform!=TargetPlatform.iOS||_googleIosClientId.trim().isNotEmpty);

  void _changed(){if(!_disposed)notifyListeners();}
  @override void dispose(){
    _disposed=true;
    if(_ownsClient)_client.close();
    super.dispose();
  }
  Uri _auth(String action)=>Uri.https('identitytoolkit.googleapis.com',
    '/v1/accounts:'+action,{'key':teyzaFirebaseApiKey});
  Map<String,dynamic> _decode(http.Response response){
    final decoded=jsonDecode(response.body);
    if(decoded is! Map<String,dynamic>)throw const FormatException('Invalid authentication response.');
    if(response.statusCode<200||response.statusCode>=300){
      final error=decoded['error'];
      throw StateError(error is Map?(error['message']??'NETWORK_ERROR').toString():'NETWORK_ERROR');
    }
    return decoded;
  }
  Future<Map<String,dynamic>> _post(String action,Map<String,Object> params) async=>_decode(
    await _client.post(_auth(action),headers:const {'Content-Type':'application/json'},
      body:jsonEncode(params)).timeout(const Duration(seconds:16)));
  Future<Map<String,dynamic>> _refresh(String refreshToken) async=>_decode(
    await _client.post(Uri.https('securetoken.googleapis.com','/v1/token',
      {'key':teyzaFirebaseApiKey}),
      headers:const {'Content-Type':'application/x-www-form-urlencoded'},
      body:{'grant_type':'refresh_token','refresh_token':refreshToken})
      .timeout(const Duration(seconds:16)));
  Future<void> _persist() async {
    final refresh=_refreshToken;
    if(refresh==null)return;
    final version=_version;
    final values={'teyza_refresh':refresh,'teyza_email':email??'','teyza_name':name??''};
    final operation=_storageQueue.catchError((Object _){}).then((_) async {
      for(final entry in values.entries){
        if(version!=_version||_disposed)return;
        await _store.write(entry.key,entry.value);
      }
    });
    _storageQueue=operation;
    await operation;
  }
  Future<void> _clear() async {
    idToken=null;userId=null;email=null;name=null;_refreshToken=null;emailVerified=false;
    final operation=_storageQueue.catchError((Object _){}).then((_) async {
      for(final key in ['teyza_refresh','teyza_email','teyza_name']){
        await _store.delete(key);
      }
    });
    _storageQueue=operation;
    await operation;
  }
  bool _expired(Object error)=>RegExp(
    'INVALID_REFRESH_TOKEN|TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_ID_TOKEN')
    .hasMatch(error.toString());

  Future<void> restore() async {
    final version=++_version;
    isReady=false;isBusy=true;_changed();
    try {
      final refresh=await _store.read('teyza_refresh');
      if(refresh!=null&&refresh.isNotEmpty){
        final savedEmail=await _store.read('teyza_email');
        final savedName=await _store.read('teyza_name');
        final data=await _refresh(refresh);
        if(version!=_version||_disposed)return;
        final token=data['id_token']?.toString()??'';
        final uid=data['user_id']?.toString()??'';
        if(token.isEmpty||uid.isEmpty)throw StateError('INVALID_REFRESH_TOKEN');
        idToken=token;userId=uid;
        _refreshToken=data['refresh_token']?.toString()??refresh;
        email=savedEmail;name=savedName;
        await _persist();
        if(version!=_version||_disposed)return;
        await refreshEmailStatus();
      }
    } catch(error) {
      if(version==_version){
        idToken=null;userId=null;emailVerified=false;
        // Retain a securely stored refresh token during a temporary outage.
        if(_expired(error))await _clear();
      }
    } finally {
      if(version==_version){isReady=true;isBusy=false;_changed();}
    }
  }

  Future<void> _save(Map<String,dynamic> data,String fallbackEmail,String fallbackName,int version) async {
    if(version!=_version||_disposed)return;
    final token=data['idToken']?.toString()??'';
    final refresh=data['refreshToken']?.toString()??'';
    final uid=data['localId']?.toString()??'';
    if(token.isEmpty||refresh.isEmpty||uid.isEmpty)throw StateError('NETWORK_ERROR');
    idToken=token;userId=uid;_refreshToken=refresh;emailVerified=false;
    email=data['email']?.toString()??fallbackEmail;
    name=data['displayName']?.toString()??fallbackName;
    try{await _persist();}catch(_){if(version==_version)await _clear();rethrow;}
    if(version!=_version||_disposed)return;
    await refreshEmailStatus();
    _changed();
  }

  Future<void> refreshEmailStatus() async {
    final token=idToken;
    if(token==null){emailVerified=false;_changed();return;}
    try{
      final result=await _post('lookup',{'idToken':token});
      if(token!=idToken||_disposed)return;
      final profiles=result['users'];
      if(profiles is! List||profiles.isEmpty||profiles.first is! Map){
        throw StateError('INVALID_ID_TOKEN');
      }
      final profile=profiles.first as Map;
      if(profile['localId']!=userId)throw StateError('INVALID_ID_TOKEN');
      emailVerified=profile['emailVerified']==true;
      email=profile['email']?.toString()??email;
      name=profile['displayName']?.toString()??name;
      await _persist();
    }catch(error){
      if(token!=idToken)return;
      emailVerified=false;
      if(_expired(error)){await _clear();rethrow;}
    }finally{_changed();}
  }

  // All merchant requests refresh and use the authenticated UID. Never use a
  // selected role as authorization, or keep an expired account visible.
  Future<String> freshIdToken(){
    if(_refreshing!=null)return _refreshing!;
    final task=_freshIdToken();
    _refreshing=task;
    return task.whenComplete((){if(identical(_refreshing,task))_refreshing=null;});
  }
  Future<String> _freshIdToken() async {
    final refresh=_refreshToken;
    final version=_version;
    if(refresh==null)throw StateError('Session expired. Sign in again.');
    try{
      final data=await _refresh(refresh);
      if(version!=_version||_disposed)throw StateError('Session expired. Sign in again.');
      final token=data['id_token']?.toString()??'';
      final uid=data['user_id']?.toString()??'';
      if(token.isEmpty||uid.isEmpty||uid!=userId)throw StateError('INVALID_REFRESH_TOKEN');
      idToken=token;_refreshToken=data['refresh_token']?.toString()??refresh;
      await _persist();
      if(version!=_version||_disposed)throw StateError('Session expired. Sign in again.');
      _changed();
      return token;
    }catch(error){
      if(version==_version&&_expired(error)){await _clear();_changed();}
      rethrow;
    }
  }
  Future<void> sendEmailVerification() async {
    final token=await freshIdToken();
    await _post('sendOobCode',{'requestType':'VERIFY_EMAIL','idToken':token});
  }
  Future<void> signInWithGoogle() async {
    if(!googleSignInAvailable||!googleSignInConfigured)throw StateError('Google sign-in is not configured');
    final version=++_version;
    isBusy=true;_changed();
    try{
      final google=GoogleSignIn(scopes:const ['email'],serverClientId:_googleWebClientId,
        clientId:defaultTargetPlatform==TargetPlatform.iOS?_googleIosClientId:null);
      final account=await google.signIn();
      if(account==null)return;
      final tokens=await account.authentication;
      final token=tokens.idToken;
      if(token==null||token.isEmpty)throw StateError('Google sign-in is not configured');
      final reply=await _post('signInWithIdp',{
        'postBody':'id_token='+Uri.encodeQueryComponent(token)+'&providerId=google.com',
        'requestUri':'https://teyza.co.za','returnIdpCredential':false,'returnSecureToken':true});
      await _save(reply,account.email,account.displayName??'',version);
    }finally{if(version==_version){isBusy=false;isReady=true;_changed();}}
  }
  Future<void> signInWithApple() async {
    if(!appleSignInAvailable)throw StateError('Apple sign-in is not configured');
    final version=++_version;isBusy=true;_changed();
    try{
      final random=Random.secure();
      final nonce=base64Url.encode(List.generate(32,(_)=>random.nextInt(256))).replaceAll('=','');
      final hashed=sha256.convert(utf8.encode(nonce)).toString();
      AppleIdentity? identity;
      if(appleRequest!=null){identity=await appleRequest!(hashed);}
      else{
        if(!await SignInWithApple.isAvailable())throw StateError('Apple sign-in is not configured');
        final credential=await SignInWithApple.getAppleIDCredential(
          scopes:[AppleIDAuthorizationScopes.email,AppleIDAuthorizationScopes.fullName],nonce:hashed);
        identity=AppleIdentity(credential.identityToken??'',email:credential.email??'',
          name:[credential.givenName,credential.familyName].whereType<String>().join(' ').trim());
      }
      if(identity==null)return;
      if(identity.idToken.isEmpty)throw StateError('Apple sign-in is not configured');
      final response=await _post('signInWithIdp',{
        'postBody':Uri(queryParameters:{'id_token':identity.idToken,'providerId':'apple.com','nonce':nonce}).query,
        'requestUri':'https://teyza.co.za','returnSecureToken':true,'returnIdpCredential':false});
      await _save(response,identity.email,identity.name,version);
      if(version==_version&&idToken!=null&&identity.name.isNotEmpty){
        try{await _post('update',{'idToken':idToken!,'displayName':identity.name,'returnSecureToken':false});
          if(version==_version){name=identity.name;await _persist();}
        }catch(_){/* Firebase sign-in remains valid if saving the optional name fails. */}
      }
    }on SignInWithAppleAuthorizationException catch(error){
      if(error.code!=AuthorizationErrorCode.canceled)rethrow;
    }finally{if(version==_version){isBusy=false;isReady=true;_changed();}}
  }
  Future<void> signIn(String emailAddress,String password) async {
    final version=++_version;
    isBusy=true;_changed();
    try{
      final data=await _post('signInWithPassword',{
        'email':emailAddress.trim(),'password':password,'returnSecureToken':true});
      await _save(data,emailAddress.trim(),'',version);
    }finally{if(version==_version){isBusy=false;isReady=true;_changed();}}
  }
  Future<void> register(String displayName,String emailAddress,String password) async {
    if(displayName.trim().isEmpty)throw StateError('Enter your name.');
    final version=++_version;
    isBusy=true;_changed();
    try{
      final data=await _post('signUp',{
        'email':emailAddress.trim(),'password':password,'returnSecureToken':true});
      await _save(data,emailAddress.trim(),displayName.trim(),version);
      if(version!=_version||idToken==null)return;
      try{
        await _post('update',{'idToken':idToken!,'displayName':displayName.trim(),
          'returnSecureToken':false});
        name=displayName.trim();await _persist();
      }catch(_){/* Account is valid even if updating the display name fails. */}
    }finally{if(version==_version){isBusy=false;isReady=true;_changed();}}
  }
  Future<void> resetPassword(String emailAddress) async {
    if(!emailAddress.trim().contains('@'))throw StateError('INVALID_EMAIL');
    await _post('sendOobCode',{'requestType':'PASSWORD_RESET','email':emailAddress.trim()});
  }
  Future<void> signOut() async {
    ++_version;_refreshing=null;isBusy=false;isReady=true;
    await _clear();_changed();
  }
}
