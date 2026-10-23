import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:google_sign_in/google_sign_in.dart';

// Public Firebase configuration. All three account types use the same project;
// choosing a login purpose never grants seller permissions or approval.
const teyzaFirebaseApiKey = 'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';
const _googleWebClientId = String.fromEnvironment('TEYZA_GOOGLE_WEB_CLIENT_ID');

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
  if (value.contains('Google sign-in is not configured')) return 'Use email and password to sign in on this device.';
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
  ShopperSession({http.Client? client,SessionStore? store})
    : _client=client??http.Client(), _ownsClient=client==null,
      _store=store??SecureSessionStore();
  final http.Client _client;
  final bool _ownsClient;
  final SessionStore _store;
  bool isReady = false, isBusy = false, emailVerified = false;
  String? email, name, idToken, userId;
  String? _refreshToken;
  int _version=0;
  bool _disposed=false;
  Future<String>? _refreshing;

  // The initial iOS release uses Teyza email/password login. Enable social
  // login there only after native OAuth and an equivalent private login exist.
  bool get googleSignInAvailable => !kIsWeb &&
    defaultTargetPlatform==TargetPlatform.android && _googleWebClientId.trim().isNotEmpty;

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
    await _store.write('teyza_refresh',_refreshToken!);
    await _store.write('teyza_email',email??'');
    await _store.write('teyza_name',name??'');
  }
  Future<void> _clear() async {
    idToken=null;userId=null;email=null;name=null;_refreshToken=null;emailVerified=false;
    for(final key in ['teyza_refresh','teyza_email','teyza_name']){
      await _store.delete(key);
    }
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
        final data=await _refresh(refresh);
        if(version!=_version||_disposed)return;
        final token=data['id_token']?.toString()??'';
        final uid=data['user_id']?.toString()??'';
        if(token.isEmpty||uid.isEmpty)throw StateError('INVALID_REFRESH_TOKEN');
        idToken=token;userId=uid;
        _refreshToken=data['refresh_token']?.toString()??refresh;
        email=await _store.read('teyza_email');
        name=await _store.read('teyza_name');
        await _persist();
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
    try{await _persist();}catch(_){await _clear();rethrow;}
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
      await _persist();_changed();
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
    if(!googleSignInAvailable)throw StateError('Google sign-in is not configured');
    final version=++_version;
    isBusy=true;_changed();
    try{
      final google=GoogleSignIn(scopes:const ['email'],serverClientId:_googleWebClientId);
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
    ++_version;_refreshing=null;isBusy=false;
    await _clear();_changed();
  }
}
