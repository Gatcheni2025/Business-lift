import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

// Native app identity is public configuration, never a web app ID or guessed ID.
class NativeFirebase {
  static Future<FirebaseApp>? _starting;
  static bool validAppId(String id,String platform)=>RegExp('^1:983479810697:$platform:[a-fA-F0-9]+\$').hasMatch(id);
  static Future<FirebaseApp> ensure(){
    if(Firebase.apps.isNotEmpty)return Future.value(Firebase.app());
    return _starting??=_initialize().whenComplete(()=>_starting=null);
  }
  static Future<FirebaseApp> _initialize() async {
    if(kIsWeb||![TargetPlatform.android,TargetPlatform.iOS].contains(defaultTargetPlatform)){
      throw StateError('Phone verification is available in the Android and iPhone app.');
    }
    final ios=defaultTargetPlatform==TargetPlatform.iOS;
    var appId=ios?const String.fromEnvironment('TEYZA_FIREBASE_IOS_APP_ID'):
      const String.fromEnvironment('TEYZA_FIREBASE_ANDROID_APP_ID');
    if(appId.trim().isEmpty){
      final bundled=jsonDecode(await rootBundle.loadString('assets/config/firebase_native.json'));
      if(bundled is Map&&bundled['projectId']=='business-lift-3c19c'){
        appId=bundled[ios?'iosAppId':'androidAppId']?.toString()??'';
      }
    }
    // Android can receive public app identity after service activation. iOS also
    // requires the matching callback scheme compiled into its native bundle.
    if(!ios&&!validAppId(appId,'android')){
      final client=http.Client();
      try{
        final response=await client.get(Uri.parse(teyzaMobileEndpoint).replace(queryParameters:{'nativeConfig':'android'})).timeout(const Duration(seconds:15));
        if(response.statusCode!=200)throw const ShopServiceUnavailable();
        final config=jsonDecode(response.body);
        if(config is Map&&config['projectId']=='business-lift-3c19c')appId=config['androidAppId']?.toString()??'';
      }finally{client.close();}
    }
    if(!validAppId(appId,ios?'ios':'android')){
      throw StateError('Phone verification is awaiting Teyza’s device setup. Contact Teyza support. Your setup details are safe.');
    }
    return Firebase.initializeApp(options:FirebaseOptions(apiKey:teyzaFirebaseApiKey,appId:appId,
      messagingSenderId:'983479810697',projectId:'business-lift-3c19c',storageBucket:'business-lift-3c19c.firebasestorage.app',
      iosBundleId:ios?const String.fromEnvironment('TEYZA_IOS_BUNDLE_ID',defaultValue:'za.co.teyza.shopper'):null));
  }
}
