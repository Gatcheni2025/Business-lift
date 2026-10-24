import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'shopper_auth.dart';

const teyzaMobileEndpoint=String.fromEnvironment('TEYZA_MOBILE_ENDPOINT',
  defaultValue:'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile');

class ShopServiceUnavailable implements Exception {
  const ShopServiceUnavailable();
  @override String toString()=> 'Teyza’s shop service needs activation. Contact Teyza support with reference SHOP_SERVICE_UNAVAILABLE. Camera capture and private product drafts are still available.';
}

class TeyzaMobileApi {
  final ShopperSession session;
  final http.Client? client;
  const TeyzaMobileApi(this.session,{this.client});
  Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
    final uid=session.userId;
    if(uid==null||session.idToken==null)throw StateError('Sign in to continue.');
    final token=await session.freshIdToken();
    if(uid!=session.userId)throw StateError('Your account changed. Please reopen this page.');
    final remote=client??http.Client();
    try{
      final response=await remote.post(Uri.parse(teyzaMobileEndpoint),
        headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
        body:jsonEncode({'action':action,'data':data})).timeout(const Duration(seconds:35));
      if(uid!=session.userId||session.idToken==null)throw StateError('Your account changed. Please reopen this page.');
      if(response.statusCode==404)throw const ShopServiceUnavailable();
      Map<String,dynamic> result;
      try{result=jsonDecode(response.body) as Map<String,dynamic>;}
      catch(_){throw StateError('Shop services are temporarily unavailable. Please try again.');}
      if(response.statusCode!=200||result['ok']!=true){
        throw StateError(result['error']?.toString()??'Could not complete your request.');
      }
      return result;
    }on TimeoutException{throw StateError('The connection is slow. Please try again.');}
    on http.ClientException{throw StateError('Check your connection and try again.');}
    finally{if(client==null)remote.close();}
  }
}

String mobileError(Object error)=>error.toString().replaceFirst('Bad state: ','');
String money(int cents)=>'R'+(cents/100).toStringAsFixed(2);
List<Map<String,dynamic>> mobileRows(dynamic value)=>value is List?
  value.whereType<Map>().map((x)=>Map<String,dynamic>.from(x)).toList():[];

class TradingDay {
  final bool closed;
  final String open,close;
  const TradingDay({this.closed=false,this.open='08:00',this.close='17:00'});
  factory TradingDay.fromJson(Map<String,dynamic> data)=>TradingDay(
    closed:data['closed']==true,open:data['open']?.toString()??'08:00',close:data['close']?.toString()??'17:00');
  Map<String,dynamic> toJson()=>{'closed':closed,'open':open,'close':close};
}
String shopHoursLabel(List<TradingDay> hours,{DateTime? now}) {
  if(hours.length!=7)return 'Ask the shop for opening hours';
  final local=(now??DateTime.now()).toUtc().add(const Duration(hours:2));
  final index=local.weekday-1,minute=local.hour*60+local.minute;
  int parse(String value){final parts=value.split(':');
    return parts.length==2?(int.tryParse(parts[0])??0)*60+(int.tryParse(parts[1])??0):0;}
  final day=hours[index],yesterday=hours[(index+6)%7];
  if(!yesterday.closed&&parse(yesterday.close)<parse(yesterday.open)&&minute<parse(yesterday.close)){
    return 'Open now · closes '+yesterday.close;
  }
  if(day.closed)return 'Closed today';
  final opens=parse(day.open),closes=parse(day.close);
  if((closes>opens&&minute>=opens&&minute<closes)||(closes<opens&&minute>=opens)){
    return 'Open now · closes '+day.close;
  }
  return 'Closed · opens '+day.open;
}
