import 'dart:async';
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
      codeSent:(id,token){sentId=id;onSent(id,token);forward();},verificationFailed:onError,codeAutoRetrievalTimeout:(_){},
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
  const SellerPhonePage({super.key,required this.session,required this.phone,this.sender});
  @override State<SellerPhonePage> createState()=>_SellerPhoneState();
}
class _SellerPhoneState extends State<SellerPhonePage> {
  final code=TextEditingController();
  late final String? uid;
  String? verificationId,error;
  int? resendToken;
  int seconds=0,generation=0;
  bool consent=false,sending=false,confirming=false,changed=false;
  Timer? cooldown,sendTimeout;
  @override void initState(){super.initState();uid=widget.session.userId;widget.session.addListener(accountChanged);}
  void accountChanged(){if(mounted&&uid!=widget.session.userId){generation++;cooldown?.cancel();sendTimeout?.cancel();code.clear();
    setState((){changed=true;verificationId=null;error='Your account changed. Close this page and sign in again.';});}}
  @override void dispose(){generation++;cooldown?.cancel();sendTimeout?.cancel();widget.session.removeListener(accountChanged);code.dispose();super.dispose();}
  bool current(int value)=>mounted&&!changed&&generation==value&&uid==widget.session.userId;
  void startCooldown(){cooldown?.cancel();seconds=60;cooldown=Timer.periodic(const Duration(seconds:1),(timer){
    if(!mounted){timer.cancel();return;}
    setState(()=>seconds--);if(seconds<=0)timer.cancel();
  });}
  Future<void> send() async {
    if(sending||confirming||seconds>0||changed||!consent)return;
    final request=++generation;
    setState((){sending=true;error=null;verificationId=null;code.clear();});
    sendTimeout?.cancel();sendTimeout=Timer(const Duration(seconds:70),(){if(current(request)&&sending){
      generation++;setState((){sending=false;error='The SMS request timed out. Please try again.';});
    }});
    try{
      await (widget.sender??FirebasePhoneCodeSender(widget.session)).send(normalizeMobile(widget.phone),resendToken:resendToken,
        onSent:(id,token){if(!current(request))return;sendTimeout?.cancel();setState((){sending=false;verificationId=id;resendToken=token;startCooldown();});},
        onError:(e){if(!current(request))return;sendTimeout?.cancel();setState((){sending=false;error=phoneError(e);});},
        onAutomatic:(id,value){if(!current(request)||confirming)return;sendTimeout?.cancel();setState((){sending=false;verificationId=id;code.text=value;});confirm();},
        onInstant:(verify){if(!current(request)||confirming)return;sendTimeout?.cancel();instant(request,verify);});
    }catch(e){if(current(request)){sendTimeout?.cancel();setState((){sending=false;error=phoneError(e);});}}
  }
  Future<void> instant(int request,Future<void> Function() verify) async {
    setState((){sending=false;confirming=true;error=null;});
    try{await verify();if(!widget.session.phoneVerified||widget.session.phoneNumber!=normalizeMobile(widget.phone))throw StateError('Phone verification could not be confirmed. Please try again.');
      if(current(request))Navigator.pop(context,true);}
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
      if(current(request))Navigator.pop(context,true);
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
      FilledButton(onPressed:changed||!consent||sending||confirming||seconds>0?null:send,
        child:Text(sending?'Requesting code…':seconds>0?'Resend in ${seconds}s':verificationId==null?'Send SMS code':'Resend SMS code')),
      if(confirming&&verificationId==null)const Padding(padding:EdgeInsets.all(16),child:Text('Confirming your mobile number…')),
      if(verificationId!=null)...[
        const SizedBox(height:24),TextField(controller:code,enabled:!confirming&&!changed,keyboardType:TextInputType.number,
          autofillHints:const [AutofillHints.oneTimeCode],inputFormatters:[FilteringTextInputFormatter.digitsOnly,LengthLimitingTextInputFormatter(6)],
          decoration:const InputDecoration(labelText:'Six-digit code',border:OutlineInputBorder()),onSubmitted:(_)=>confirm()),
        const SizedBox(height:16),FilledButton(onPressed:changed||confirming?null:confirm,child:Text(confirming?'Verifying…':'Verify mobile number'))
      ]
    ])));
}
