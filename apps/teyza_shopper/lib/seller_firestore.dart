import 'dart:convert';
import 'package:http/http.dart' as http;

// Firebase ID-token authenticated seller workspace. Admin decisions, payments
// and public listing are intentionally NOT writable by this client.
const teyzaSellerProject='business-lift-3c19c';

class SellerShop {
  final String name,category,address,approvalStatus,listingStatus,phone;
  const SellerShop(this.name,this.category,this.address,this.approvalStatus,this.listingStatus,{this.phone=''});
  factory SellerShop.fromFields(Map<String,dynamic> d)=>SellerShop(
    (d['shopName']??'').toString(),(d['category']??'').toString(),
    (d['address']??'').toString(),(d['approvalStatus']??'pending').toString(),
    (d['listingStatus']??'not_listed').toString(),phone:(d['phone']??'').toString());
  bool get isLive=>approvalStatus=='approved'&&listingStatus=='active';
  bool get hasRegisteredCategory=>category=='spaza'||category=='retail';
  String get categoryLabel=>category=='spaza'?'Spaza Shop':
    category=='retail'?'Other Retail / Wholesale':'Shop setup required';
}
class SellerDraft {
  final String id,name,category,description;
  final String? createdAt;
  final int priceCents,stock;
  const SellerDraft({required this.id,required this.name,required this.category,
    required this.priceCents,required this.stock,this.description='',this.createdAt});
  factory SellerDraft.fromFields(String id,Map<String,dynamic> d)=>SellerDraft(
    id:id,name:(d['name']??'').toString(),category:(d['category']??'Other').toString(),
    description:(d['description']??'').toString(),
    createdAt:d['createdAt']?.toString(),
    priceCents:(d['priceCents'] is num)?(d['priceCents'] as num).toInt():0,
    stock:(d['stockQty'] is num)?(d['stockQty'] as num).toInt():0);
}
Map<String,dynamic> sellerDecodeFields(dynamic fields){
  if(fields is! Map)return {};
  final out=<String,dynamic>{};
  for(final entry in fields.entries){
    if(entry.key is! String||entry.value is! Map)continue;
    final data=entry.value as Map;
    if(data.containsKey('stringValue'))out[entry.key as String]=data['stringValue'];
    else if(data.containsKey('integerValue'))out[entry.key as String]=int.tryParse(data['integerValue'].toString())??0;
    else if(data.containsKey('booleanValue'))out[entry.key as String]=data['booleanValue']==true;
    else if(data.containsKey('timestampValue'))out[entry.key as String]=data['timestampValue'];
  }
  return out;
}
class SellerFirestore {
  final String uid,token;
  final http.Client? client;
  const SellerFirestore({required this.uid,required this.token,this.client});
  static bool validDocumentId(String input)=>RegExp(r'^[A-Za-z0-9_-]{1,128}$').hasMatch(input);
  Uri _document(String path,[Map<String,String>? query])=>Uri.https(
    'firestore.googleapis.com',
    '/v1/projects/'+teyzaSellerProject+'/databases/(default)/documents/'+path,query);
  Map<String,String> get headers=>{
    'Authorization':'Bearer '+token,'Accept':'application/json',
    'Content-Type':'application/json'};
  Future<http.Response> _request(String method,Uri uri,{Object? body}) async{
    if(!validDocumentId(uid)||token.isEmpty)throw StateError('Sign in again.');
    final httpClient=client??http.Client();
    try{
      final request=http.Request(method,uri)..headers.addAll(headers);
      if(body!=null)request.body=jsonEncode(body);
      final stream=await httpClient.send(request).timeout(const Duration(seconds:18));
      return await http.Response.fromStream(stream);
    }finally{if(client==null)httpClient.close();}
  }
  Map<String,dynamic> _parse(http.Response response){
    if(response.statusCode==401)throw StateError('Session expired. Sign in again.');
    if(response.statusCode==403)throw StateError('Permission denied. Check private shop rules.');
    if(response.statusCode<200||response.statusCode>=300){
      throw StateError('Shop service unavailable (HTTP '+response.statusCode.toString()+').');
    }
    final data=jsonDecode(utf8.decode(response.bodyBytes));
    if(data is! Map)throw const FormatException('Unexpected shop response.');
    return Map<String,dynamic>.from(data);
  }
  Future<SellerShop?> shop() async{
    final response=await _request('GET',_document('teyzaSellerAccounts/'+uid));
    if(response.statusCode==404)return null;
    final data=_parse(response);
    return SellerShop.fromFields(sellerDecodeFields(data['fields']));
  }
  Future<void> saveProfile(String name,String address,String phone) async {
    if(name.trim().length<2||name.trim().length>120||address.trim().isEmpty||address.length>250||phone.length>25){
      throw const FormatException('Enter a valid shop name, address and contact number.');
    }
    final path='projects/'+teyzaSellerProject+'/databases/(default)/documents/teyzaSellerAccounts/'+uid;
    final response=await _request('POST',Uri.https('firestore.googleapis.com',
      '/v1/projects/'+teyzaSellerProject+'/databases/(default)/documents:commit'),body:{'writes':[{
        'update':{'name':path,'fields':{'shopName':{'stringValue':name.trim()},
          'address':{'stringValue':address.trim()},'phone':{'stringValue':phone.trim()}}},
        'updateMask':{'fieldPaths':['shopName','address','phone']},'currentDocument':{'exists':true},
        'updateTransforms':[{'fieldPath':'updatedAt','setToServerValue':'REQUEST_TIME'}]
      }]});
    _parse(response);
  }
  Future<List<SellerDraft>> drafts() async{
    final response=await _request('GET',_document(
      'teyzaDraftProducts/'+uid+'/items',{'pageSize':'100'}));
    if(response.statusCode==404)return [];
    final data=_parse(response);
    final docs=data['documents'];
    if(docs is! List)return [];
    final output=<SellerDraft>[];
    for(final value in docs){
      if(value is! Map)continue;
      final id=(value['name']??'').toString().split('/').last;
      if(!validDocumentId(id))continue;
      final fields=sellerDecodeFields(value['fields']);
      if(fields['ownerUid']!=uid||fields['status']!='draft')continue;
      output.add(SellerDraft.fromFields(id,fields));
    }
    return output;
  }
  static Map<String,dynamic> _fields(SellerDraft p,String uid)=>{
    'ownerUid':{'stringValue':uid},
    'name':{'stringValue':p.name.trim()},
    'category':{'stringValue':p.category.trim()},
    'description':{'stringValue':p.description.trim()},
    'priceCents':{'integerValue':p.priceCents.toString()},
    'stockQty':{'integerValue':p.stock.toString()},
    'status':{'stringValue':'draft'},
    if(p.createdAt!=null)'createdAt':{'timestampValue':p.createdAt!}
  };
  static void validateDraft(SellerDraft p){
    if(!validDocumentId(p.id))throw const FormatException('Invalid product ID.');
    if(p.name.trim().length<2||p.name.length>120)throw const FormatException('Enter a product name (2–120 characters).');
    if(p.category.trim().isEmpty||p.category.length>60)throw const FormatException('Enter a product category.');
    if(p.description.length>500)throw const FormatException('Description is too long.');
    if(p.priceCents<=0||p.priceCents>99999900)throw const FormatException('Enter a valid price.');
    if(p.stock<0||p.stock>100000)throw const FormatException('Enter valid stock.');
  }
  Future<void> save(SellerDraft draft) async{
    validateDraft(draft);
    // Match the existing R2.7 web seller schema and strict Firestore rules:
    // server timestamp transforms, immutable createdAt on update, draft only.
    final isNew=draft.createdAt==null;
    final name='projects/'+teyzaSellerProject+
      '/databases/(default)/documents/teyzaDraftProducts/'+uid+'/items/'+draft.id;
    final data={'writes':[{
      'update':{'name':name,'fields':_fields(draft,uid)},
      if(isNew)'currentDocument':{'exists':false},
      'updateTransforms':[
        if(isNew){'fieldPath':'createdAt','setToServerValue':'REQUEST_TIME'},
        {'fieldPath':'updatedAt','setToServerValue':'REQUEST_TIME'}
      ]
    }]};
    final response=await _request('POST',
      Uri.https('firestore.googleapis.com',
        '/v1/projects/'+teyzaSellerProject+'/databases/(default)/documents:commit'),
      body:data);
    _parse(response);
  }
  Future<void> delete(String id) async{
    if(!validDocumentId(id))throw const FormatException('Invalid product ID.');
    final response=await _request('DELETE',_document(
      'teyzaDraftProducts/'+uid+'/items/'+id));
    if(response.statusCode==404||response.statusCode==200||response.statusCode==204)return;
    _parse(response);
  }
}
