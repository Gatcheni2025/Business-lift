import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'seller_firestore.dart';
import 'seller_selfie_camera.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

const ownerGreen=Color(0xFF3BB77E),ownerInk=Color(0xFF010F1C);
enum SellerTool {services,hours,finance,stock,verification}
const sellerToolNames={SellerTool.services:'Delivery & shop services',SellerTool.hours:'Opening & closing times',
  SellerTool.finance:'Finance & stock credit',SellerTool.stock:'Order stock',SellerTool.verification:'Owner verification'};
class SellerDashboard extends StatelessWidget {
  final int? productCount;
  final VoidCallback onProducts,onChat,onOrders,onProfile;
  final ValueChanged<SellerTool> onTool;
  const SellerDashboard({super.key,required this.productCount,required this.onProducts,
    required this.onChat,required this.onOrders,required this.onProfile,required this.onTool});
  @override Widget build(BuildContext context){
    final tiles=<({String title,String detail,IconData icon,VoidCallback tap})>[
      (title:'Shop setup',detail:'Profile, products & photos',icon:Icons.storefront_outlined,tap:onProducts),
      (title:'Live chat',detail:'Talk to your customers',icon:Icons.chat_bubble_outline_rounded,tap:onChat),
      (title:'Customer orders',detail:'Confirm, prepare & fulfil',icon:Icons.receipt_long_outlined,tap:onOrders),
      (title:'Delivery & collect',detail:'Delivery, cash back & cards',icon:Icons.local_shipping_outlined,tap:()=>onTool(SellerTool.services)),
      (title:'Trading hours',detail:'Set when your shop is open',icon:Icons.schedule_rounded,tap:()=>onTool(SellerTool.hours)),
      (title:'Finance & credit',detail:'Request a funding follow-up',icon:Icons.account_balance_outlined,tap:()=>onTool(SellerTool.finance)),
      (title:'Order stock',detail:'Stock list & supermarket links',icon:Icons.inventory_2_outlined,tap:()=>onTool(SellerTool.stock)),
      (title:'Verify owner',detail:'Documents, selfie & mobile OTP',icon:Icons.face_retouching_natural,tap:()=>onTool(SellerTool.verification)),
    ];
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      const Text('Your shop dashboard',style:TextStyle(fontSize:24,color:ownerInk,fontWeight:FontWeight.w800)),
      const SizedBox(height:5),const Text('A little care. A stronger local business.',
        style:const TextStyle(color:Color(0xFF6C7880),height:1.4)),
      const SizedBox(height:16),
      LayoutBuilder(builder:(context,constraints)=>GridView.count(
        crossAxisCount:constraints.maxWidth<360||MediaQuery.textScalerOf(context).scale(14)>18?1:constraints.maxWidth>650?4:2,shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),
        mainAxisSpacing:12,crossAxisSpacing:12,mainAxisExtent:155+(MediaQuery.textScalerOf(context).scale(14)-14)*5,
        children:[for(final tile in tiles)Material(color:Colors.white,shape:RoundedRectangleBorder(
          side:const BorderSide(color:Color(0xFFE5EAE1)),borderRadius:BorderRadius.circular(22)),
          child:InkWell(onTap:tile.tap,borderRadius:BorderRadius.circular(22),child:Padding(
            padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Row(children:[Container(padding:const EdgeInsets.all(10),decoration:BoxDecoration(color:const Color(0xFFEAF5E8),
                borderRadius:BorderRadius.circular(13)),child:Icon(tile.icon,color:const Color(0xFF168657),size:24)),
                const Spacer(),const Icon(Icons.north_east_rounded,size:17,color:Color(0xFF96A691))]),
              const Spacer(),Text(tile.title,maxLines:2,style:const TextStyle(fontSize:16,fontWeight:FontWeight.w800,color:ownerInk)),
              const SizedBox(height:4),Text(tile.detail,maxLines:2,style:const TextStyle(fontSize:11,color:Color(0xFF6C7880),height:1.3))
            ]))))])),
      const SizedBox(height:12),OutlinedButton.icon(onPressed:onProfile,icon:const Icon(Icons.edit_outlined),
        label:const Text('Edit shop profile')),
    ]);
  }
}

class SellerToolPage extends StatefulWidget {
  final ShopperSession session;
  final SellerTool tool;
  final TeyzaMobileApi? api;
  final Future<Uint8List?> Function()? captureSelfie;
  const SellerToolPage({super.key,required this.session,required this.tool,this.api,this.captureSelfie});
  @override State<SellerToolPage> createState()=>_SellerToolState();
}
class _SellerToolState extends State<SellerToolPage> {
  late final api=widget.api??TeyzaMobileApi(widget.session);
  late final String? uid;
  final fee=TextEditingController(),radius=TextEditingController(),notes=TextEditingController();
  final amount=TextEditingController(),purpose=TextEditingController(),phone=TextEditingController();
  final stockName=TextEditingController(),stockQuantity=TextEditingController();
  Map<String,dynamic> summary={};
  List<Map<String,dynamic>> stock=[];
  List<TradingDay> days=List.generate(7,(_)=>const TradingDay());
  bool loading=true,working=false,capturing=false,ready=false,delivery=false,pickup=false,cashback=false,cards=false,liveChat=true,consent=false;
  String? error,status;
  Uint8List? selfie;
  @override void initState(){super.initState();uid=widget.session.userId;widget.session.addListener(accountChanged);load();}
  void accountChanged(){if(uid!=widget.session.userId&&mounted)setState((){
    selfie=null;summary={};ready=false;error='Your account changed. Close this page and sign in again.';
  });}
  @override void dispose(){widget.session.removeListener(accountChanged);
    for(final controller in [fee,radius,notes,amount,purpose,phone,stockName,stockQuantity]){controller.dispose();}super.dispose();}
  Future<void> load() async {
    setState((){loading=true;error=null;});
    try{
      final result=await api.call('seller_summary');
      if(!mounted||uid!=widget.session.userId)return;
      final settings=result['settings'] is Map?Map<String,dynamic>.from(result['settings'] as Map):<String,dynamic>{};
      setState((){
        summary=result;ready=true;delivery=settings['deliveryEnabled']==true;pickup=settings['pickupEnabled']==true;
        cashback=settings['cashback']==true;cards=settings['cardPayments']==true;liveChat=settings['liveChatEnabled']!=false;
        fee.text=((settings['deliveryFeeCents'] as num? ??0)/100).toStringAsFixed(2);
        radius.text=(settings['deliveryRadiusKm']??5).toString();notes.text=settings['deliveryNotes']?.toString()??'';
        stock=mobileRows(settings['restockList']);
        final hours=mobileRows(settings['hours']);
        days=hours.length==7?hours.map(TradingDay.fromJson).toList():List.generate(7,(_)=>const TradingDay());
      });
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> save(String action,Map<String,dynamic> data,String success) async {
    if(working||uid!=widget.session.userId)return;
    setState((){working=true;error=null;status=null;});
    try{await api.call(action,data);if(mounted&&uid==widget.session.userId)setState(()=>status=success);}
    catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>working=false);}
  }
  Future<void> pickTime(int index,bool opening) async {
    final day=days[index],parts=(opening?day.open:day.close).split(':');
    final time=await showTimePicker(context:context,initialTime:TimeOfDay(
      hour:int.tryParse(parts.first)??8,minute:int.tryParse(parts.last)??0));
    if(time==null||!mounted)return;
    final value=time.hour.toString().padLeft(2,'0')+':'+time.minute.toString().padLeft(2,'0');
    setState(()=>days[index]=TradingDay(closed:day.closed,open:opening?value:day.open,close:opening?day.close:value));
  }
  Future<void> camera() async {
    if(capturing||working||uid!=widget.session.userId)return;
    setState((){error=null;capturing=true;});
    try{
      final bytes=widget.captureSelfie!=null?await widget.captureSelfie!():
        await Navigator.push<Uint8List>(context,MaterialPageRoute(builder:(_)=>SellerSelfieCameraPage(session:widget.session)));
      if(bytes==null)return;
      if(bytes.isEmpty||bytes.length>2000000)throw StateError('Please retake a clear selfie smaller than 2 MB.');
      if(mounted&&uid==widget.session.userId)setState((){selfie=bytes;consent=false;status=null;});
    }catch(_){if(mounted)setState(()=>error='Could not open the camera. Allow camera access in your device settings and try again.');}
    finally{if(mounted)setState(()=>capturing=false);}
  }
  Widget card(Widget child)=>Padding(padding:const EdgeInsets.only(bottom:14),
    child:Material(color:Colors.white,borderRadius:BorderRadius.circular(22),
      child:Padding(padding:const EdgeInsets.all(18),child:child)));
  Widget field(TextEditingController controller,String label,{bool number=false,int lines=1})=>Padding(
    padding:const EdgeInsets.only(bottom:14),child:TextField(controller:controller,maxLines:lines,
      keyboardType:number?const TextInputType.numberWithOptions(decimal:true):TextInputType.text,
      decoration:InputDecoration(labelText:label,border:const OutlineInputBorder())));
  Widget button(String label,VoidCallback action)=>SizedBox(width:double.infinity,
    child:FilledButton(onPressed:working||uid!=widget.session.userId||(!ready&&widget.tool!=SellerTool.verification)?null:action,child:Text(working?'Please wait…':label)));
  Widget services()=>card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    const Text('Choose what your shop offers',style:TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
    const SizedBox(height:10),
    SwitchListTile(contentPadding:EdgeInsets.zero,title:const Text('Pay & collect'),subtitle:const Text('Customers collect and arrange payment with your shop'),
      value:pickup,onChanged:(v)=>setState(()=>pickup=v)),
    SwitchListTile(contentPadding:EdgeInsets.zero,title:const Text('Delivery service'),value:delivery,onChanged:(v)=>setState(()=>delivery=v)),
    if(delivery)...[field(fee,'Delivery fee (R)',number:true),field(radius,'Delivery radius (km)',number:true),
      field(notes,'Delivery areas and instructions',lines:3)],
    SwitchListTile(contentPadding:EdgeInsets.zero,title:const Text('Cash back'),subtitle:const Text('Subject to cash available at your shop'),value:cashback,onChanged:(v)=>setState(()=>cashback=v)),
    SwitchListTile(contentPadding:EdgeInsets.zero,title:const Text('Card payments at the shop'),value:cards,onChanged:(v)=>setState(()=>cards=v)),
    SwitchListTile(contentPadding:EdgeInsets.zero,title:const Text('Live chat with shoppers'),value:liveChat,onChanged:(v)=>setState(()=>liveChat=v)),
    const SizedBox(height:12),button('Save shop services',(){
      final price=double.tryParse(fee.text.replaceAll(',','.'));
      final distance=int.tryParse(radius.text);
      if(delivery&&(price==null||!price.isFinite||price<0||price>1000||distance==null||distance<1||distance>100)){
        setState(()=>error='Enter a delivery fee and a radius from 1 to 100 km.');return;
      }
      save('save_services',{'deliveryEnabled':delivery,'pickupEnabled':pickup,'cashback':cashback,'cardPayments':cards,
        'liveChatEnabled':liveChat,'deliveryFeeCents':delivery?((price??0)*100).round():0,
        'deliveryRadiusKm':delivery?distance:0,'deliveryNotes':notes.text.trim()},'Shop services saved.');
    })
  ]));
  Widget hours()=>Column(children:[
    card(const Text('Set your weekly trading hours. Times are shown in South African time. For overnight trading, choose a closing time earlier than opening.')),
    for(var i=0;i<7;i++)card(Column(children:[
      Row(children:[Expanded(child:Text(const ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i],
        style:const TextStyle(fontSize:17,fontWeight:FontWeight.w700))),
        Text(days[i].closed?'Closed':'Open'),Switch(value:!days[i].closed,onChanged:(v)=>setState(()=>days[i]=TradingDay(
          closed:!v,open:days[i].open,close:days[i].close)))]),
      if(!days[i].closed)Row(children:[Expanded(child:OutlinedButton(onPressed:()=>pickTime(i,true),child:Text('Opens '+days[i].open))),
        const SizedBox(width:10),Expanded(child:OutlinedButton(onPressed:()=>pickTime(i,false),child:Text('Closes '+days[i].close)))])
    ])),
    button('Save trading hours',()=>save('save_hours',{'hours':days.map((x)=>x.toJson()).toList()},'Trading hours saved.'))
  ]);
  Widget finance()=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    card(const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Icon(Icons.account_balance_outlined,color:ownerGreen,size:34),SizedBox(height:12),
      Text('Need help funding stock?',style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),SizedBox(height:8),
      Text('Send a finance enquiry and request a follow-up. This does not approve credit or create a loan. Any offer will have its own eligibility checks and terms.')
    ])),
    card(Column(children:[field(amount,'Amount needed (R)',number:true),field(purpose,'What will the funding be used for?',lines:3),
      field(phone,'Contact number'),CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,
        onChanged:(v)=>setState(()=>consent=v==true),title:const Text('Teyza may contact me about this finance enquiry.')),
      button('Request finance follow-up',() async {
        final value=double.tryParse(amount.text.replaceAll(',','.'));
        if(value==null||!value.isFinite||value<100||value>500000||purpose.text.trim().isEmpty||phone.text.trim().length<9||!consent){
          setState(()=>error='Enter an amount from R100 to R500,000, a purpose and contact number, then agree to be contacted.');return;}
        await save('credit_enquiry',{'amountCents':(value*100).round(),'purpose':purpose.text.trim(),
          'phone':phone.text.trim(),'consent':consent},'Enquiry received. Credit has not been approved.');
        if(status!=null){await load();if(mounted)setState(()=>consent=false);}
      })])),
    if(mobileRows(summary['credit']).isNotEmpty)card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('Your enquiries',style:TextStyle(fontSize:19,fontWeight:FontWeight.w800)),
      for(final item in mobileRows(summary['credit']))ListTile(contentPadding:EdgeInsets.zero,
        title:Text(money((item['amountCents'] as num? ??0).toInt())),subtitle:Text(item['purpose']?.toString()??''),
        trailing:const Text('Enquiry received',style:TextStyle(fontSize:11)))
    ]))
  ]);
  Future<void> supplier(String url) async {
    if(!await launchUrl(Uri.parse(url),mode:LaunchMode.externalApplication)&&mounted){
      setState(()=>error='Could not open the supplier website. Please try again.');}
  }
  Widget restock()=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      const Text('Your stock shopping list',style:TextStyle(fontSize:22,fontWeight:FontWeight.w800)),
      const SizedBox(height:8),const Text('Save the items you need, then order directly from your chosen supplier.'),const SizedBox(height:18),
      field(stockName,'Item, e.g. White bread'),field(stockQuantity,'Quantity, e.g. 2 cases'),
      OutlinedButton.icon(onPressed:(){
        if(stockName.text.trim().isEmpty||stockQuantity.text.trim().isEmpty||stock.length>=50)return;
        setState((){stock.add({'name':stockName.text.trim(),'quantity':stockQuantity.text.trim()});stockName.clear();stockQuantity.clear();});
      },icon:const Icon(Icons.add),label:const Text('Add to stock list')),
      for(var i=0;i<stock.length;i++)ListTile(contentPadding:EdgeInsets.zero,title:Text(stock[i]['name'].toString()),
        subtitle:Text(stock[i]['quantity'].toString()),trailing:IconButton(tooltip:'Remove stock item',
          onPressed:()=>setState(()=>stock.removeAt(i)),icon:const Icon(Icons.close))),
      button('Save stock list',()=>save('save_restock',{'items':stock},'Stock list saved. Place your order on the supplier website.'))
    ])),
    const Padding(padding:EdgeInsets.fromLTRB(2,8,2,12),child:Text('Supermarkets & wholesalers',style:TextStyle(fontSize:21,fontWeight:FontWeight.w800))),
    for(final provider in const [
      ('Shoprite Cash & Carry','Bulk groceries & essentials','https://www.shopritecashandcarry.co.za/'),
      ('Makro','Groceries, household & business supplies','https://www.makro.co.za/'),
      ('Kit Kat Cash & Carry','Groceries & wholesale stock','https://kitkatgroup.com/Shop/')
    ])card(ListTile(contentPadding:EdgeInsets.zero,leading:const Icon(Icons.store_mall_directory_outlined,color:ownerGreen),
      title:Text(provider.$1),subtitle:Text(provider.$2),trailing:const Icon(Icons.open_in_new,size:20),onTap:()=>supplier(provider.$3))),
    const Text('You order and pay on the supplier’s website. The supplier confirms prices, delivery areas and availability.',
      style:TextStyle(fontSize:12,color:Color(0xFF6C7880),height:1.4))
  ]);
  Widget verification()=>card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
    const Icon(Icons.face_retouching_natural,color:ownerGreen,size:52),const SizedBox(height:12),
    const Text('Verify the shop owner',textAlign:TextAlign.center,style:TextStyle(fontSize:24,fontWeight:FontWeight.w800)),
    const SizedBox(height:12),const Text('Take a clear selfie in good light. Keep your face visible and remove sunglasses. Your photo is private and will be reviewed with your shop registration.'),
    const SizedBox(height:14),
    if(summary['verification'] is Map)Chip(label:Text(switch((summary['verification'] as Map)['status']){'approved'=>'Owner review approved','needs_new_photo'=>'Please submit a new selfie','rejected'=>'Registration needs attention',_=>'Selfie awaiting review'})),
    if(summary['verification'] is Map&&(summary['verification'] as Map)['reviewNote']?.toString().isNotEmpty==true)
      Padding(padding:const EdgeInsets.symmetric(vertical:12),child:Text((summary['verification'] as Map)['reviewNote'].toString())),
    if(selfie!=null)Padding(padding:const EdgeInsets.symmetric(vertical:16),child:ClipRRect(borderRadius:BorderRadius.circular(22),
      child:Image.memory(selfie!,height:260,fit:BoxFit.contain))),
    OutlinedButton.icon(onPressed:working||capturing?null:camera,icon:const Icon(Icons.camera_alt_outlined),
      label:Text(selfie==null?'Open selfie camera':'Retake selfie')),
    CheckboxListTile(contentPadding:EdgeInsets.zero,value:consent,onChanged:(v)=>setState(()=>consent=v==true),
      title:const Text('I agree to submit my selfie for Teyza shop-owner verification.'),
      subtitle:const Text('Only authorised reviewers may access it. The photo is removed after 90 days.')),
    button('Submit selfie for review',() async {
      if(selfie==null||!consent){setState(()=>error='Take a selfie and agree to submit it for review.');return;}
      await save('verification_selfie',{'imageBase64':base64Encode(selfie!),'consent':true},'Selfie submitted. Owner verification is pending review.');
      if(status!=null&&mounted)setState((){selfie=null;consent=false;summary['verification']={'status':'pending_review'};});
    })
  ]));
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF7F9F7),
    appBar:AppBar(backgroundColor:const Color(0xFFF7F9F7),foregroundColor:ownerInk,title:Text(sellerToolNames[widget.tool]!)),body:SafeArea(child:loading&&widget.tool!=SellerTool.verification?const Center(child:CircularProgressIndicator()):
      ListView(padding:const EdgeInsets.all(18),children:[
        if(error!=null)card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(error!,style:const TextStyle(color:Color(0xFF9A3412))),if(!ready)TextButton(onPressed:load,child:const Text('Retry'))])),
        if(status!=null)card(Text(status!,style:const TextStyle(color:Color(0xFF087D5E),fontWeight:FontWeight.w700))),
        if(uid==widget.session.userId&&(ready||widget.tool==SellerTool.verification))switch(widget.tool){SellerTool.services=>services(),SellerTool.hours=>hours(),SellerTool.finance=>finance(),
          SellerTool.stock=>restock(),SellerTool.verification=>verification()},
        if(!ready&&widget.tool==SellerTool.stock)restock(),
      ])));
}

class SellerProfilePage extends StatefulWidget {
  final ShopperSession session;final SellerShop shop;
  const SellerProfilePage({super.key,required this.session,required this.shop});
  @override State<SellerProfilePage> createState()=>_ProfileState();
}
class _ProfileState extends State<SellerProfilePage>{
  late final name=TextEditingController(text:widget.shop.name),address=TextEditingController(text:widget.shop.address),
    phone=TextEditingController(text:widget.shop.phone);
  bool saving=false;String? error;
  @override void dispose(){name.dispose();address.dispose();phone.dispose();super.dispose();}
  Future<void> save() async {
    final uid=widget.session.userId;if(uid==null)return;
    if(name.text.trim().length<2||address.text.trim().isEmpty||phone.text.trim().length<9){
      setState(()=>error='Enter your shop name, address and contact number.');return;}
    setState((){saving=true;error=null;});
    try{final token=await widget.session.freshIdToken();if(uid!=widget.session.userId)return;
      await SellerFirestore(uid:uid,token:token).saveProfile(name.text,address.text,phone.text);
      if(mounted)Navigator.pop(context,true);
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>saving=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(appBar:AppBar(title:const Text('Shop profile')),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      Text(widget.shop.categoryLabel,style:const TextStyle(color:ownerGreen,fontWeight:FontWeight.w700)),const SizedBox(height:18),
      for(final field in [(name,'Shop name'),(address,'Shop address'),(phone,'Contact number')])Padding(
        padding:const EdgeInsets.only(bottom:18),child:TextField(controller:field.$1,
          decoration:InputDecoration(labelText:field.$2,border:const OutlineInputBorder()))),
      if(error!=null)Text(error!,style:const TextStyle(color:Colors.red)),
      FilledButton(onPressed:saving?null:save,child:Text(saving?'Saving…':'Save shop profile'))
    ]));
}
