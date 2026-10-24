import 'dart:async';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

// Push uses native Firebase installation identity. Account authorization always
// uses the existing REST-authenticated session at the private mobile API.
class SellerPush {
  static final _instances=Expando<SellerPush>();
  factory SellerPush(ShopperSession session)=>_instances[session]??=SellerPush._(session);
  SellerPush._(this.session){session.addListener(changed);session.beforeSignOut=disable;}
  final ShopperSession session;
  final updates=StreamController<void>.broadcast();
  StreamSubscription<String>? refresh;
  StreamSubscription<RemoteMessage>? foreground,opened;
  void Function()? onOpen;
  String? token,owner;bool starting=false,disposed=false,stopping=false;
  bool get configured=>!kIsWeb&&(defaultTargetPlatform==TargetPlatform.android||defaultTargetPlatform==TargetPlatform.iOS)&&
    RegExp('^1:983479810697:${defaultTargetPlatform==TargetPlatform.iOS?'ios':'android'}:[a-fA-F0-9]+\$').hasMatch(
      defaultTargetPlatform==TargetPlatform.iOS?const String.fromEnvironment('TEYZA_FIREBASE_IOS_APP_ID'):
      const String.fromEnvironment('TEYZA_FIREBASE_ANDROID_APP_ID'));
  Future<void> initialize() async{
    if(!configured)throw StateError('Phone alerts are awaiting Teyza’s Firebase device setup. Your in-app inbox is still available.');
    if(Firebase.apps.isEmpty)await Firebase.initializeApp(options:FirebaseOptions(apiKey:teyzaFirebaseApiKey,
      appId:Platform.isIOS?const String.fromEnvironment('TEYZA_FIREBASE_IOS_APP_ID'):const String.fromEnvironment('TEYZA_FIREBASE_ANDROID_APP_ID'),
      messagingSenderId:'983479810697',projectId:'business-lift-3c19c',storageBucket:'business-lift-3c19c.firebasestorage.app',
      iosBundleId:Platform.isIOS?const String.fromEnvironment('TEYZA_IOS_BUNDLE_ID',defaultValue:'za.co.teyza.shopper'):null));
  }
  Future<void> restore() async{
    if(disposed||starting||stopping||owner!=null||session.userId==null||!session.emailVerified)return;
    starting=true;
    try{final prefs=await SharedPreferences.getInstance();if(prefs.getString('teyza_seller_push_uid')==session.userId)await enable(request:false);}
    catch(_){/* Inbox works independently of push or its device configuration. */}
    finally{starting=false;}
  }
  void changed(){
    if(owner!=null&&owner!=session.userId){owner=null;token=null;refresh?.cancel();refresh=null;
      if(Firebase.apps.isNotEmpty)unawaited(FirebaseMessaging.instance.deleteToken().catchError((Object _){}));}
    if(!disposed)unawaited(restore());
  }
  Future<void> enable({bool request=true}) async{
    final uid=session.userId;if(uid==null||!session.emailVerified)throw StateError('Sign in and verify your email first.');
    await initialize();
    final messaging=FirebaseMessaging.instance;
    final settings=request?await messaging.requestPermission(alert:true,badge:true,sound:true):await messaging.getNotificationSettings();
    if(settings.authorizationStatus!=AuthorizationStatus.authorized&&settings.authorizationStatus!=AuthorizationStatus.provisional)
      throw StateError('Phone alerts are off. Allow notifications in your device settings. Your in-app inbox remains available.');
    if(Platform.isIOS&&await messaging.getAPNSToken()==null)throw StateError('Apple notification registration is still pending. Please try again shortly.');
    final value=await messaging.getToken();if(value==null)throw StateError('Could not register this device. Please try again.');
    await messaging.setAutoInitEnabled(true);
    if(disposed||uid!=session.userId){await messaging.deleteToken();return;}
    owner=uid;token=value;
    await TeyzaMobileApi(session).call('notification_device_save',{'token':value,'platform':Platform.isIOS?'ios':'android'});
    if(disposed||uid!=session.userId){await messaging.deleteToken();return;}
    final prefs=await SharedPreferences.getInstance();await prefs.setString('teyza_seller_push_uid',uid);
    await refresh?.cancel();refresh=messaging.onTokenRefresh.listen((value) async{
      if(disposed||owner!=session.userId)return;token=value;
      try{await TeyzaMobileApi(session).call('notification_device_save',{'token':value,'platform':Platform.isIOS?'ios':'android'});}catch(_){}
    });
    foreground??=FirebaseMessaging.onMessage.listen((m){if(m.data['ownerUid']==session.userId&&!disposed)updates.add(null);});
    opened??=FirebaseMessaging.onMessageOpenedApp.listen(open);
    final initial=await messaging.getInitialMessage();if(initial!=null)open(initial);
  }
  void open(RemoteMessage message){if(!disposed&&session.userId!=null&&message.data['ownerUid']==session.userId)onOpen?.call();}
  Future<void> disable() async{
    stopping=true;
    final value=token;owner=null;token=null;await refresh?.cancel();refresh=null;
    if(value!=null&&session.userId!=null){try{await TeyzaMobileApi(session).call('notification_device_delete',{'token':value}).timeout(const Duration(seconds:4));}catch(_){} }
    try{if(Firebase.apps.isNotEmpty){await FirebaseMessaging.instance.setAutoInitEnabled(false);await FirebaseMessaging.instance.deleteToken().timeout(const Duration(seconds:4));}}catch(_){}
    try{final prefs=await SharedPreferences.getInstance();await prefs.remove('teyza_seller_push_uid');}finally{stopping=false;}
  }
  void dispose(){disposed=true;session.removeListener(changed);session.beforeSignOut=null;refresh?.cancel();foreground?.cancel();opened?.cancel();updates.close();}
}
