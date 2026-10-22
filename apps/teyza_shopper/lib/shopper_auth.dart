import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:google_sign_in/google_sign_in.dart';

// Firebase Web API key is public project configuration, NOT a credential.
// Native Google OAuth is a separate integration and is not implied here.
const _projectApiKey = 'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';
const teyzaFirebaseApiKey = _projectApiKey;
// Public OAuth client ID must belong to the same Firebase Auth project as this API key.
// Embed at build time; never embed a client secret.
const _googleWebClientId=String.fromEnvironment('TEYZA_GOOGLE_WEB_CLIENT_ID');
const _vault = FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

String authMessage(Object error) {
  final value = error.toString();
  if (value.contains('EMAIL_EXISTS')) return 'This email is already registered. Sign in instead.';
  if (value.contains('INVALID_LOGIN_CREDENTIALS') ||
      value.contains('EMAIL_NOT_FOUND') || value.contains('INVALID_PASSWORD')) {
    return 'Incorrect email or password. Try again or reset your password.';
  }
  if (value.contains('WEAK_PASSWORD')) return 'Choose a stronger password (at least six characters).';
  if (value.contains('TOO_MANY_ATTEMPTS_TRY_LATER')) return 'Too many attempts. Please try again later.';
  if (value.contains('OPERATION_NOT_ALLOWED')) return 'Email sign-in is not enabled for this app yet.';
  if (value.contains('Google sign-in is not configured')) return 'Google sign-in needs the Android OAuth configuration. Please use email login until it is enabled.';
  if (value.contains('DEVELOPER_ERROR') || value.contains('10:')) return 'Google login setup mismatch. Check the OAuth client and signing certificate.';
  if (value.contains('NETWORK')) return 'Network unavailable. Check your connection and try again.';
  if (value.contains('USER_DISABLED')) return 'This account is disabled. Contact Teyza support.';
  return 'Could not complete sign-in. Please try again.';
}

class ShopperSession extends ChangeNotifier {
  bool isReady = false;
  bool isBusy = false;
  bool emailVerified = false;
  String? email, name, idToken, userId;
  String? _refreshToken;

  Future<Map<String,dynamic>> _post(Uri uri, Map<String,String> params) async {
    final response = await http.post(uri,
      headers: const {'Content-Type':'application/json'},
      body: jsonEncode(params)).timeout(const Duration(seconds: 16));
    final data = jsonDecode(response.body) as Map<String,dynamic>;
    if (response.statusCode >= 400) {
      final failure = data['error'] as Map<String,dynamic>?;
      throw StateError((failure?['message'] ?? 'NETWORK_ERROR').toString());
    }
    return data;
  }

  Future<void> restore() async {
    try {
      _refreshToken = await _vault.read(key:'teyza_refresh');
      email = await _vault.read(key:'teyza_email');
      name = await _vault.read(key:'teyza_name');
      if (_refreshToken != null) {
        final response = await http.post(
          Uri.parse('https://securetoken.googleapis.com/v1/token?key=$_projectApiKey'),
          headers:const {'Content-Type':'application/x-www-form-urlencoded'},
          body:{'grant_type':'refresh_token','refresh_token':_refreshToken!})
          .timeout(const Duration(seconds:16));
        if (response.statusCode == 200) {
          final data = jsonDecode(response.body) as Map<String,dynamic>;
          idToken = data['id_token'] as String?;
          userId = data['user_id'] as String?;
          _refreshToken = data['refresh_token'] as String? ?? _refreshToken;
          await _vault.write(key:'teyza_refresh',value:_refreshToken);
          await refreshEmailStatus();
        } else {
          idToken=null; _refreshToken=null; email=null; name=null;userId=null;
          await _vault.delete(key:'teyza_refresh');
          await _vault.delete(key:'teyza_email');
          await _vault.delete(key:'teyza_name');
        }
      }
    } catch (_) {
      // Preserve no assumed session when refresh cannot be verified.
      idToken = null; userId = null;
      emailVerified = false;
    } finally {
      isReady=true;
      notifyListeners();
    }
  }

  Future<void> _save(Map<String,dynamic> payload,String fallbackEmail,String fallbackName) async {
    idToken=payload['idToken'] as String?;
    userId=payload['localId'] as String?;
    _refreshToken=payload['refreshToken'] as String?;
    email=payload['email']?.toString() ?? fallbackEmail;
    name=fallbackName;
    if (idToken == null || _refreshToken == null) throw StateError('NETWORK_ERROR');
    await _vault.write(key:'teyza_refresh',value:_refreshToken);
    await _vault.write(key:'teyza_email',value:email);
    await _vault.write(key:'teyza_name',value:name);
    await refreshEmailStatus();
    notifyListeners();
  }

  Future<void> refreshEmailStatus() async {
    if (idToken == null) { emailVerified=false;notifyListeners();return; }
    try {
      final result = await _post(Uri.parse(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=$_projectApiKey'),
        {'idToken':idToken!});
      final profiles=result['users'];
      emailVerified=profiles is List && profiles.isNotEmpty &&
        profiles.first is Map && (profiles.first as Map)['emailVerified']==true;
      if(profiles is List && profiles.isNotEmpty && profiles.first is Map) {
        userId=(profiles.first as Map)['localId']?.toString()??userId;
      }
      notifyListeners();
    } catch (_) {
      emailVerified=false;
      notifyListeners();
    }
  }

  // Refresh before each seller write. The app never sends a stale ID token
  // or an admin credential to Firestore.
  Future<String> freshIdToken() async {
    if(_refreshToken==null)throw StateError('Sign in to manage your shop.');
    final response=await http.post(
      Uri.parse('https://securetoken.googleapis.com/v1/token?key=$_projectApiKey'),
      headers:const {'Content-Type':'application/x-www-form-urlencoded'},
      body:{'grant_type':'refresh_token','refresh_token':_refreshToken!})
      .timeout(const Duration(seconds:15));
    if(response.statusCode!=200)throw StateError('Session expired. Sign in again.');
    final data=jsonDecode(response.body) as Map<String,dynamic>;
    final token=(data['id_token']??'').toString();
    final uid=(data['user_id']??'').toString();
    if(token.isEmpty||uid.isEmpty)throw StateError('Session expired. Sign in again.');
    idToken=token;
    userId=uid;
    _refreshToken=data['refresh_token']?.toString()??_refreshToken;
    await _vault.write(key:'teyza_refresh',value:_refreshToken);
    notifyListeners();
    return token;
  }

  Future<void> sendEmailVerification() async {
    if (idToken==null) throw StateError('Sign in first.');
    await _post(Uri.parse(
      'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=$_projectApiKey'),
      {'requestType':'VERIFY_EMAIL','idToken':idToken!});
  }

  Future<void> signInWithGoogle() async {
    if(_googleWebClientId.trim().isEmpty) {
      throw StateError('Google sign-in is not configured for this Android build yet. Contact Teyza support.');
    }
    isBusy=true;notifyListeners();
    try {
      final google=GoogleSignIn(scopes:const ['email'],serverClientId:_googleWebClientId);
      final account=await google.signIn();
      if(account==null)return; // shopper cancelled account selection
      final tokens=await account.authentication;
      final googleIdToken=tokens.idToken;
      if(googleIdToken==null||googleIdToken.isEmpty) {
        throw StateError('Google did not return an identity token. Check the Android OAuth certificate SHA and web client ID.');
      }
      final reply=await _post(
        Uri.parse('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=$_projectApiKey'),
        {'postBody':'id_token='+Uri.encodeQueryComponent(googleIdToken)+'&providerId=google.com',
         'requestUri':'https://teyza.co.za','returnIdpCredential':'false','returnSecureToken':'true'});
      await _save(reply,account.email,account.displayName??'');
    } finally {isBusy=false;notifyListeners();}
  }

  Future<void> signIn(String emailAddress,String password) async {
    isBusy=true;notifyListeners();
    try {
      final data=await _post(
        Uri.parse('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$_projectApiKey'),
        {'email':emailAddress.trim(),'password':password,'returnSecureToken':'true'});
      final display=data['displayName']?.toString() ?? '';
      await _save(data,emailAddress.trim(),display);
    } finally { isBusy=false;notifyListeners(); }
  }

  Future<void> register(String displayName,String emailAddress,String password) async {
    if (displayName.trim().isEmpty) throw StateError('Enter your name.');
    isBusy=true;notifyListeners();
    try {
      final data=await _post(
        Uri.parse('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$_projectApiKey'),
        {'email':emailAddress.trim(),'password':password,'returnSecureToken':'true'});
      await _save(data,emailAddress.trim(),displayName.trim());
      try {
        await _post(Uri.parse('https://identitytoolkit.googleapis.com/v1/accounts:update?key=$_projectApiKey'),
          {'idToken':idToken!,'displayName':displayName.trim(),'returnSecureToken':'true'});
      } catch (_) { /* Account exists; the name is retained locally. */ }
    } finally { isBusy=false;notifyListeners(); }
  }

  Future<void> resetPassword(String emailAddress) async {
    if (!emailAddress.contains('@')) throw StateError('Enter your email address.');
    await _post(Uri.parse(
      'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=$_projectApiKey'),
      {'requestType':'PASSWORD_RESET','email':emailAddress.trim()});
  }

  Future<void> signOut() async {
    idToken=null;email=null;name=null;userId=null;_refreshToken=null;emailVerified=false;
    await _vault.delete(key:'teyza_refresh');
    await _vault.delete(key:'teyza_email');
    await _vault.delete(key:'teyza_name');
    notifyListeners();
  }
}
