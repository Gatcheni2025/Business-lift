import 'dart:async';
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'native_firebase.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

String normalizeMobile(String value){
  var number=value.replaceAll(RegExp(r'[\s()-]'),'');
  if(RegExp(r'^0\d{9}$').hasMatch(number))number='+27${number.substring(1)}';
  if(!RegExp(r'^\+[1-9]\d{8,14}$').hasMatch(number))throw const FormatException('Enter a mobile number with its country code, such as +27 71 234 5678.');
  return number;
}
String phoneError(Object error){
  if(error is FirebaseAuthException){
    switch(error.code){
      case 'credential-already-in-use':case 'account-exists-with-different-credential':return 'This mobile number belongs to another account. Sign in to that account or contact Teyza support.';
      case 'invalid-phone-number':return 'Check your mobile number and country code.';
      case 'too-many-requests':case 'quota-exceeded':return 'SMS verification is temporarily limited. Please try again later.';
      case 'operation-not-allowed':case 'app-not-authorized':case 'invalid-app-credential':case 'missing-client-identifier':case 'captcha-check-failed':
        return 'Phone verification needs Teyza’s device setup. Contact Teyza support.';
      case 'network-request-failed':return 'Check your connection and request the code again.';
      default:return 'Could not send the SMS code. Please try again or contact Teyza support.';
    }
  }
  if(error is TimeoutException)return 'The SMS request timed out. Please try again.';
  final message=authMessage(error);
  return message=='Could not complete sign-in. Please try again.'?error.toString().replaceFirst('Bad state: ',''):message;
}

class PendingSms {
  final String verificationId;
  final DateTime resendAfter;
  const PendingSms(this.verificationId,this.resendAfter);
}

// Store the Firebase verification session, never the SMS code. It is scoped to
// the existing owner and number, expires after ten minutes and grants no proof.
class PendingSmsStore {
  final SessionStore store;
  final DateTime Function() now;
  Future<void> _work=Future<void>.value();
  PendingSmsStore({SessionStore? store,DateTime Function()? now}):store=store??SecureSessionStore(),now=now??DateTime.now;
  String key(String uid)=>'teyza_pending_sms_v1_$uid';
  Future<T> serial<T>(Future<T> Function() operation){
    final result=_work.catchError((Object _){}).then((_)=>operation());
    _work=result.then<void>((_){},onError:(Object _,StackTrace __){});
    return result;
  }
  Future<void> save(String uid,String phone,String verificationId)=>serial(() async {
    final time=now();
    await store.write(key(uid),jsonEncode({'uid':uid,'phone':phone,'verificationId':verificationId,
      'createdAt':time.millisecondsSinceEpoch,'expiresAt':time.add(const Duration(minutes:10)).millisecondsSinceEpoch,
      'resendAfter':time.add(const Duration(seconds:60)).millisecondsSinceEpoch}));
  });
  Future<void> clear(String uid)=>serial(()=>store.delete(key(uid)));
  Future<PendingSms?> read(String uid,String phone)=>serial(() async {
    final raw=await store.read(key(uid));if(raw==null)return null;
    try{
      final data=jsonDecode(raw),time=now().millisecondsSinceEpoch;
      if(data is! Map||data['uid']!=uid||data['phone']!=phone||data['verificationId'] is! String||
        (data['verificationId'] as String).isEmpty||data['createdAt'] is! int||data['expiresAt'] is! int||
        data['resendAfter'] is! int||data['expiresAt']<=time||data['createdAt']>time+30000||
        data['expiresAt']>data['createdAt']+600000||data['resendAfter']>data['createdAt']+60000){
        await store.delete(key(uid));return null;
      }
      return PendingSms(data['verificationId'] as String,DateTime.fromMillisecondsSinceEpoch(data['resendAfter'] as int));
    }catch(_){await store.delete(key(uid));return null;}
  });
}
abstract class PhoneCodeSender {
  Future<void> send(String phone,{int? resendToken,required void Function(String,int?) onSent,
    required void Function(Object) onError,required void Function(String,String) onAutomatic,void Function(Future<void> Function())? onInstant});
}
class FirebasePhoneCodeSender implements PhoneCodeSender {
  final ShopperSession session;
  FirebasePhoneCodeSender(this.session);
  @override Future<void> send(String phone,{int? resendToken,required void Function(String,int?) onSent,
    required void Function(Object) onError,required void Function(String,String) onAutomatic,void Function(Future<void> Function())? onInstant}) async {
    await NativeFirebase.ensure();
    String? sentId,retrievedCode;
    void forward(){if(sentId!=null&&retrievedCode!=null)onAutomatic(sentId!,retrievedCode!);}
    await FirebaseAuth.instance.verifyPhoneNumber(phoneNumber:phone,timeout:const Duration(seconds:60),forceResendingToken:resendToken,
      codeSent:(id,token){sentId=id;onSent(id,token);forward();},verificationFailed:onError,
      codeAutoRetrievalTimeout:(id){if(sentId==null){sentId=id;onSent(id,null);forward();}},
      verificationCompleted:(credential){
        final code=credential.smsCode;
        if(code!=null){retrievedCode=code;forward();}
        else if(onInstant!=null){onInstant(()=>linkInstant(phone,credential));}
        else{onError(StateError('Please request an SMS code to finish mobile verification.'));}
      });
    // Manual SMS links through REST. Android instant proof links to the exact
    // same UID through a short-lived, server-authorized native session.
  }
  Future<void> linkInstant(String phone,PhoneAuthCredential credential) async {
    final uid=session.userId;
    if(uid==null)throw StateError('Sign in again.');
    final result=await TeyzaMobileApi(session).call('seller_phone_session');
    if(uid!=session.userId||result['uid']!=uid)throw StateError('Your account changed. Close this page.');
    final native=FirebaseAuth.instance;
    try{
      final signed=await native.signInWithCustomToken(result['token'] as String);
      final user=signed.user;
      if(user==null||user.uid!=uid||session.userId!=uid)throw StateError('Your account changed. Close this page.');
      final linked=user.phoneNumber==phone?await user.reauthenticateWithCredential(credential):await user.linkWithCredential(credential);
      if(linked.user?.uid!=uid||session.userId!=uid)throw StateError('Your account changed. Close this page.');
      await session.confirmLinkedPhone(phone);
    }finally{if(native.currentUser?.uid==uid)await native.signOut();}
  }
}
class SellerPhonePage extends StatefulWidget {
  final ShopperSession session;
  final String phone;
  final PhoneCodeSender? sender;
  final PendingSmsStore? pendingStore;
  const SellerPhonePage({super.key,required this.session,required this.phone,this.sender,this.pendingStore});
  @override State<SellerPhonePage> createState()=>_SellerPhoneState();
}
class _SellerPhoneState extends State<SellerPhonePage> with WidgetsBindingObserver {
  final code=TextEditingController();
  late final String? uid;
  late final pending=widget.pendingStore??PendingSmsStore();
  String? verificationId,error;
  int? resendToken;
  int seconds=0,generation=0;
  bool consent=false,sending=false,confirming=false,changed=false,restoring=true;
  Timer? cooldown,sendTimeout;
  @override void initState(){super.initState();uid=widget.session.userId;widget.session.addListener(accountChanged);
    WidgetsBinding.instance.addObserver(this);
    if(uid==null){changed=true;restoring=false;error='Sign in again before verifying your mobile number.';}else{restorePending();}}
  Future<void> clearPending() async {if(uid!=null){try{await pending.clear(uid!);}catch(_){}}}
  Future<void> restorePending() async {
    final request=generation;
    try{
      final saved=uid==null?null:await pending.read(uid!,normalizeMobile(widget.phone));
      if(current(request)&&saved!=null&&verificationId==null&&!sending&&!confirming){
        setState((){verificationId=saved.verificationId;consent=true;error=null;
          startCooldown((saved.resendAfter.difference(DateTime.now()).inMilliseconds/1000).ceil());});
      }
    }catch(_){/* An unavailable vault must not prevent a fresh SMS request. */}
    finally{if(current(request))setState(()=>restoring=false);}
  }
  @override void didChangeAppLifecycleState(AppLifecycleState state){
    if(state==AppLifecycleState.resumed&&!changed&&!sending&&!confirming)restorePending();
  }
  void accountChanged(){if(mounted&&uid!=widget.session.userId){generation++;cooldown?.cancel();sendTimeout?.cancel();code.clear();
    clearPending();setState((){changed=true;restoring=false;verificationId=null;error='Your account changed. Close this page and sign in again.';});}}
  @override void dispose(){generation++;cooldown?.cancel();sendTimeout?.cancel();WidgetsBinding.instance.removeObserver(this);
    widget.session.removeListener(accountChanged);code.dispose();super.dispose();}
  bool current(int value)=>mounted&&!changed&&uid!=null&&generation==value&&uid==widget.session.userId;
  void startCooldown([int remaining=60]){cooldown?.cancel();seconds=remaining.clamp(0,60).toInt();if(seconds==0)return;
    cooldown=Timer.periodic(const Duration(seconds:1),(timer){
    if(!mounted){timer.cancel();return;}
    setState(()=>seconds--);if(seconds<=0)timer.cancel();
  });}
  Future<void> send() async {
    if(restoring||sending||confirming||seconds>0||changed||!consent)return;
    final request=++generation;
    setState((){sending=true;error=null;verificationId=null;code.clear();});
    await clearPending();if(!current(request))return;
    sendTimeout?.cancel();sendTimeout=Timer(const Duration(minutes:3),(){if(current(request)&&sending){
      setState((){sending=false;error='The SMS request timed out. Return to Teyza after the security check or try again.';});
    }});
    try{
      await (widget.sender??FirebasePhoneCodeSender(widget.session)).send(normalizeMobile(widget.phone),resendToken:resendToken,
        onSent:(id,token){if(!current(request))return;sendTimeout?.cancel();
          pending.save(uid!,normalizeMobile(widget.phone),id).catchError((Object _){});
          setState((){sending=false;error=null;verificationId=id;resendToken=token;startCooldown();});},
        onError:(e){if(!current(request))return;sendTimeout?.cancel();setState((){sending=false;error=phoneError(e);});},
        onAutomatic:(id,value){if(!current(request)||confirming)return;sendTimeout?.cancel();setState((){sending=false;verificationId=id;code.text=value;});confirm();},
        onInstant:(verify){if(!current(request)||confirming)return;sendTimeout?.cancel();instant(request,verify);});
    }catch(e){if(current(request)){sendTimeout?.cancel();setState((){sending=false;error=phoneError(e);});}}
  }
  Future<void> instant(int request,Future<void> Function() verify) async {
    setState((){sending=false;confirming=true;error=null;});
    try{await verify();if(!widget.session.phoneVerified||widget.session.phoneNumber!=normalizeMobile(widget.phone))throw StateError('Phone verification could not be confirmed. Please try again.');
      if(current(request)){await clearPending();if(current(request))Navigator.pop(context,true);}}
    catch(e){if(current(request))setState(()=>error=phoneError(e));}
    finally{if(current(request))setState(()=>confirming=false);}
  }
  Future<void> confirm() async {
    if(changed||confirming||verificationId==null)return;
    if(!RegExp(r'^\d{6}$').hasMatch(code.text.trim())){setState(()=>error='Enter the six-digit SMS code.');return;}
    final request=generation;
    setState((){confirming=true;error=null;});
    try{
      await widget.session.linkPhone(verificationId!,code.text.trim(),normalizeMobile(widget.phone));
      if(current(request)){await clearPending();if(current(request))Navigator.pop(context,true);}
    }catch(e){if(current(request))setState(()=>error=phoneError(e));}
    finally{if(current(request))setState(()=>confirming=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF7F8F5),
    appBar:AppBar(title:const Text('Verify your mobile')),
    body:SafeArea(child:ListView(padding:const EdgeInsets.all(24),children:[
      const Icon(Icons.sms_outlined,size:52,color:Color(0xFF3BB77E)),const SizedBox(height:20),
      const Text('One code. Your shop, connected.',style:TextStyle(fontSize:28,fontWeight:FontWeight.w800)),
      const SizedBox(height:12),Text('We’ll send a six-digit code to ${widget.phone}. This number stays linked to your current account.',style:const TextStyle(height:1.5)),
      const SizedBox(height:16),if(error!=null)Text(error!,style:const TextStyle(color:Color(0xFF9A3412))),
      CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:changed||sending||confirming?null:(v)=>setState(()=>consent=v==true),
        title:const Text('Send me a verification SMS'),subtitle:const Text('Google processes your number for authentication and spam prevention. Standard SMS rates may apply.')),
      FilledButton(onPressed:restoring||changed||!consent||sending||confirming||seconds>0?null:send,
        child:Text(restoring?'Checking your SMS session…':sending?'Requesting code…':seconds>0?'Resend in ${seconds}s':verificationId==null?'Send SMS code':'Resend SMS code')),
      if(sending)const Padding(padding:EdgeInsets.only(top:12),child:Text('A security check may open briefly. Return to Teyza to enter your SMS code.')),
      if(confirming&&verificationId==null)const Padding(padding:EdgeInsets.all(16),child:Text('Confirming your mobile number…')),
      if(verificationId!=null)...[
        const SizedBox(height:16),const Text('Your code is ready to enter. Opening your messages or returning to this page keeps this verification request.'),
        const SizedBox(height:24),TextField(controller:code,enabled:!confirming&&!changed,keyboardType:TextInputType.number,
          autofillHints:const [AutofillHints.oneTimeCode],inputFormatters:[FilteringTextInputFormatter.digitsOnly,LengthLimitingTextInputFormatter(6)],
          decoration:const InputDecoration(labelText:'Six-digit code',border:OutlineInputBorder()),onSubmitted:(_)=>confirm()),
        const SizedBox(height:16),FilledButton(onPressed:changed||confirming?null:confirm,child:Text(confirming?'Verifying…':'Verify mobile number'))
      ]
    ])));
}
