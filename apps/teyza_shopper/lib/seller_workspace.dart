import 'dart:math';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'seller_firestore.dart';
import 'seller_tools.dart';
import 'shopper_chat.dart';
import 'shop_orders.dart';
import 'teyza_mobile_api.dart';
import 'product_catalogue.dart';
import 'seller_product_picker.dart';
import 'seller_registration.dart';
import 'seller_onboarding.dart';
import 'seller_notifications.dart';
import 'seller_premium.dart';
import 'seller_mandate.dart';
import 'seller_selling.dart';
import 'seller_areas.dart';

class SellerWorkspacePage extends StatefulWidget{
  final ShopperSession session;
  final VoidCallback openLogin;
  final SellerFirestore Function(String uid,String token)? apiFactory;
  final TeyzaMobileApi? mobileApi;
  final String? initialTarget;
  final bool sellerMode;
  const SellerWorkspacePage({super.key,required this.session,required this.openLogin,this.apiFactory,this.mobileApi,this.initialTarget,this.sellerMode=false});
  @override State<SellerWorkspacePage> createState()=>_SellerWorkspaceState();
}
class _SellerWorkspaceState extends State<SellerWorkspacePage> with WidgetsBindingObserver{
  SellerShop? shop;
  List<SellerDraft> drafts=[];
  SellerFirestore? api;
  String? loadedUid,error,draftError,accessReference;
  bool loading=false,busy=false,productsView=false;
  int sellerTab=0;
  String? mandatePromptUid;
  Future<void> openMandate() async {
    if(shop==null)return;
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerMandatePage(session:widget.session,api:widget.mobileApi,phone:shop!.phone)));
  }
  Future<void> promptMandate(String uid) async {
    if(!liveUpdates||shop==null||mandatePromptUid==uid)return;mandatePromptUid=uid;
    try{final r=await mobile.call('seller_mandate_status');if(mounted&&uid==widget.session.userId&&r['required']==true)await openMandate();}catch(_){/* The membership form remains available from My business. */}
  }
  Map<String,String> productPhotos={};
  String? rangeStatus;
  int unread=0;String verification='not_submitted';Timer? activityWatch;bool activityLoading=false,openedInitial=false;
  String? publicationStatus;bool sellingEnabled=false,identityVerified=false;
  double? shopRating;int ratingCount=0;
  bool get liveUpdates=>widget.apiFactory==null||widget.mobileApi!=null;
  TeyzaMobileApi get mobile=>widget.mobileApi??TeyzaMobileApi(widget.session);
  @override void initState(){
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.session.addListener(_sessionChanged);
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)_sessionChanged();});
  }
  @override void dispose(){
    activityWatch?.cancel();WidgetsBinding.instance.removeObserver(this);
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }
  @override void didChangeAppLifecycleState(AppLifecycleState state){
    if(state==AppLifecycleState.resumed){refreshActivity();startActivity();}else{activityWatch?.cancel();}
  }
  void startActivity(){activityWatch?.cancel();if(liveUpdates)activityWatch=Timer.periodic(const Duration(seconds:25),(_)=>refreshActivity());}
  Future<void> refreshActivity() async{
    if(!liveUpdates||activityLoading||shop==null||loadedUid!=widget.session.userId)return;
    final uid=widget.session.userId;activityLoading=true;
    try{final results=await Future.wait([mobile.call('seller_summary'),widget.session.contactVerified?mobile.call('notification_list'):Future.value(<String,dynamic>{'unread':0})]);
      if(mounted&&uid==widget.session.userId)setState((){unread=(results[1]['unread'] as num? ??0).toInt();
        publicationStatus=results[0]['publicationStatus']?.toString();sellingEnabled=results[0]['sellingEnabled']==true;identityVerified=results[0]['identityVerified']==true;
        shopRating=(results[0]['rating'] as num?)?.toDouble();ratingCount=(results[0]['ratingCount'] as num?)?.toInt()??0;
        final v=results[0]['verification'];verification=v is Map?v['status']?.toString()??'not_submitted':'not_submitted';});
    }catch(_){/* Account and private products remain usable during service outages. */}
    finally{activityLoading=false;}
  }
  Future<void> registerShop() async{
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerRegistrationPage(session:widget.session,api:widget.mobileApi)));
    if(mounted)load();
  }
  void openDestination(String target){
    if(widget.sellerMode&&['orders','chat','products'].contains(target)){
      selectSellerTab(target=='orders'?2:target=='chat'?3:1);return;
    }
    if(!mounted||widget.session.userId!=loadedUid)return;
    switch(target){
      case 'orders':Navigator.push(context,MaterialPageRoute(builder:(_)=>Scaffold(appBar:AppBar(title:const Text('Shop orders')),
        body:ShopOrdersPanel(session:widget.session,asOwner:true))));
      case 'chat':Navigator.push(context,MaterialPageRoute(builder:(_)=>ShopperChatPage(session:widget.session,asOwner:true)));
      case 'products':openProducts();
      case 'verification':openTool(SellerTool.verification);
      default:openNotifications();
    }
  }
  Future<void> openNotifications() async{
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerNotificationsPage(session:widget.session,api:widget.mobileApi,onOpen:openDestination)));
    if(mounted){refreshActivity();load();}
  }
  void _sessionChanged(){
    final uid=widget.session.userId;
    if(loadedUid!=null&&loadedUid!=uid&&mounted)setState((){
      mandatePromptUid=null;loadedUid=null;api=null;shop=null;drafts=[];productPhotos={};error=null;draftError=null;accessReference=null;unread=0;verification='not_submitted';publicationStatus=null;sellingEnabled=false;identityVerified=false;shopRating=null;ratingCount=0;
    });
    if(widget.session.idToken==null||uid==null){
      if(loadedUid!=null && mounted)setState((){
        mandatePromptUid=null;loadedUid=null;api=null;shop=null;drafts=[];productPhotos={};error=null;draftError=null;accessReference=null;
      });
      return;
    }
    if(loadedUid!=uid && !loading){
      load();
    }
  }
  Future<void> load() async{
    if(loading || !mounted)return;
    setState((){loading=true;error=null;draftError=null;accessReference=null;});
    final requestedUid=widget.session.userId;
    try{
      final token=await widget.session.freshIdToken();
      final uid=widget.session.userId;
      if(uid==null)throw StateError('Sign in again.');
      if(uid!=requestedUid)return;
      final nextApi=widget.apiFactory?.call(uid,token)??SellerFirestore(uid:uid,token:token);
      final nextShop=await nextApi.shop();
      var nextDrafts=<SellerDraft>[];
      String? nextDraftError,nextReference;
      if(nextShop?.hasRegisteredCategory==true){
        try{nextDrafts=await nextApi.drafts();}
        catch(e){
          nextDraftError=e is SellerAccessException?e.toString():
            'Your products could not be loaded. Please retry.';
          if(e is SellerAccessException)nextReference=e.reference;
        }
      }
      if(mounted&&widget.session.userId==uid&&widget.session.idToken!=null)setState((){
        api=nextApi;shop=nextShop;drafts=nextDrafts;loadedUid=uid;
        draftError=nextDraftError;accessReference=nextReference;
      });
      if(mounted&&widget.session.userId==uid){refreshActivity();startActivity();
        if(widget.initialTarget==null&&nextShop?.hasRegisteredCategory==true)WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)promptMandate(uid);});
        if(widget.initialTarget!=null&&!openedInitial&&nextShop!=null){openedInitial=true;
          WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)openDestination(widget.initialTarget!);});}}
    }catch(e){
      if(mounted&&widget.session.userId==requestedUid)setState((){
        error=e.toString().replaceFirst('Bad state: ','');loadedUid=requestedUid;
        api=null;shop=null;drafts=[];productPhotos={};draftError=null;
        accessReference=e is SellerAccessException?e.reference:null;
      });
    }finally{
      if(mounted){
        setState(()=>loading=false);
        if(widget.session.userId!=requestedUid)_sessionChanged();
      }
    }
  }
  Future<void> openProducts() async {
    final uid=widget.session.userId;
    setState((){productsView=true;if(widget.sellerMode)sellerTab=1;});
    try{final result=await mobile.call('seller_summary');
      if(mounted&&uid==widget.session.userId)setState(()=>productPhotos={for(final p in mobileRows(result['photos']))p['id'].toString():p['url'].toString()});
    }catch(_){/* Product drafting remains available when optional services are offline. */}
  }
  Future<void> chooseProducts() async {
    if(busy||draftError!=null)return;
    final requestedUid=widget.session.userId;
    final result=await Navigator.push<Map<String,dynamic>>(context,MaterialPageRoute(builder:(_)=>SellerProductPickerPage(
      session:widget.session,existingIds:drafts.map((p)=>p.id).toSet(),api:widget.mobileApi,draftApiFactory:widget.apiFactory)));
    if(result==null||!mounted||widget.session.userId!=requestedUid)return;
    await load();
    if(mounted&&widget.sellerMode)setState((){sellerTab=1;productsView=true;});
    if(mounted){setState(()=>rangeStatus=result['publication']=='live'?
      'Your selected range is visible to shoppers.':result['serviceUnavailable']==true?'Products saved privately. Contact Teyza support to activate shop services before publishing.':'Products saved privately. Complete seller registration to start selling.');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(rangeStatus!)));}
  }
  Future<void> syncRange({String? removedId}) async {
    try{
      final result=await TeyzaMobileApi(widget.session).call('catalogue_sync',{
        if(removedId!=null)'removedProductId':removedId});
      if(mounted)setState(()=>rangeStatus=result['publication']=='live'?
        'Shopper range updated. Public prices follow your listing plan.':'Products stay private until seller registration is complete.');
    }catch(_){if(mounted)setState(()=>rangeStatus='Products saved. The shopper update is pending. Tap Refresh shopper range to retry.');}
  }
  Future<void> productPhoto(SellerDraft product) async {
    if(busy)return;
    final uid=widget.session.userId;
    final source=await showModalBottomSheet<ImageSource>(context:context,builder:(ctx)=>SafeArea(child:Column(mainAxisSize:MainAxisSize.min,children:[
      ListTile(leading:const Icon(Icons.camera_alt_outlined),title:const Text('Take a product photo'),onTap:()=>Navigator.pop(ctx,ImageSource.camera)),
      ListTile(leading:const Icon(Icons.photo_library_outlined),title:const Text('Choose a product photo'),onTap:()=>Navigator.pop(ctx,ImageSource.gallery))
    ])));
    if(source==null||!mounted||uid==null||uid!=widget.session.userId)return;
    setState(()=>busy=true);
    try{
      final file=await ImagePicker().pickImage(source:source,maxWidth:1400,maxHeight:1400,imageQuality:80,requestFullMetadata:false);
      if(file==null)return;
      final bytes=await file.readAsBytes();
      if(bytes.length>2000000)throw StateError('Choose a photo smaller than 2 MB.');
      if(uid!=widget.session.userId)return;
      final result=await TeyzaMobileApi(widget.session).call('product_photo',{
        'productId':product.id,'imageBase64':base64Encode(bytes),'consent':true});
      if(mounted&&uid==widget.session.userId)setState(()=>productPhotos[product.id]=result['url'].toString());
      try{await File(file.path).delete();}catch(_){}
    }catch(error){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(mobileError(error))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> submitCatalogue() async {
    if(busy)return;setState(()=>busy=true);
    try{await mobile.call('catalogue_submit');
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Catalogue submitted for review. Your drafts are not public yet.')));
    }catch(error){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(mobileError(error))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> openTool(SellerTool tool) async{
    if(tool==SellerTool.verification&&shop!=null){
      await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerOnboardingPage(session:widget.session,shop:shop!,api:widget.mobileApi)));
      if(mounted){load();refreshActivity();}return;
    }
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerToolPage(session:widget.session,tool:tool,api:widget.mobileApi)));
    if(mounted){refreshActivity();load();}
  }
  Future<void> editProfile() async {
    if(shop==null)return;
    final changed=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>SellerProfilePage(session:widget.session,shop:shop!)));
    if(changed==true&&mounted)load();
  }
  Future<void> _save(SellerDraft p) async{
    if(api==null || busy)return;
    final uid=loadedUid;if(uid==null||uid!=widget.session.userId)return;
    setState(()=>busy=true);
    try{
      final token=await widget.session.freshIdToken();
      if(uid!=widget.session.userId)return;
      await SellerFirestore(uid:uid,token:token).save(p);
      await loadAfterSave();
      await syncRange();
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Product saved as a private draft.')));
    }catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content:Text(e.toString().replaceFirst('Bad state: ',''))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> loadAfterSave() async{
    final uid=widget.session.userId;
    final token=await widget.session.freshIdToken();
    if(uid==null||widget.session.userId!=uid)return;
    final current=widget.apiFactory?.call(uid,token)??SellerFirestore(uid:uid,token:token);
    final items=await current.drafts();
    if(mounted&&widget.session.userId==uid)setState((){drafts=items;api=current;draftError=null;accessReference=null;});
  }
  Future<void> _delete(SellerDraft item) async{
    if(busy)return;
    final uid=widget.session.userId;if(uid==null)return;
    final accept=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Delete product draft?'),
      content:Text('Remove '+item.name+' from your private stock list?'),
      actions:[
        TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
        TextButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Delete'))
      ]));
    if(accept!=true||!mounted||uid!=widget.session.userId)return;
    setState(()=>busy=true);
    try{
      final token=await widget.session.freshIdToken();
      if(uid!=widget.session.userId)return;
      await SellerFirestore(uid:uid,token:token).delete(item.id);
      await loadAfterSave();
      await syncRange(removedId:item.id);
    }catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content:Text(e.toString().replaceFirst('Bad state: ',''))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> _edit([SellerDraft? existing]) async{
    if(busy)return;
    final uid=widget.session.userId;
    final name=TextEditingController(text:existing?.name??'');
    final category=TextEditingController(text:existing?.category??(shop?.category=='retail'?'General retail':'Groceries'));
    final description=TextEditingController(text:existing?.description??'');
    final price=TextEditingController(text:existing!=null?(existing.priceCents/100).toStringAsFixed(2):'');
    final stock=TextEditingController(text:existing?.stock.toString()??'');
    final key=GlobalKey<FormState>();
    final fromCatalogue=existing!=null&&cataloguePhotoForDraft(existing.id)!=null;
    final result=await showModalBottomSheet<SellerDraft>(context:context,isScrollControlled:true,
      useSafeArea:true,showDragHandle:true,
      builder:(ctx)=>Padding(padding:EdgeInsets.only(left:20,right:20,top:10,
        bottom:MediaQuery.of(ctx).viewInsets.bottom+20),
        child:SingleChildScrollView(child:Form(key:key,child:Column(
          mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,
          children:[
            Text(existing==null?'Add a product':'Edit product',
              style:Theme.of(ctx).textTheme.headlineSmall),
            const SizedBox(height:10),
            Text(fromCatalogue?'Update your price and stock. Your active shop’s range updates for shoppers.':
              'Custom products are saved privately and submitted for review.'),
            const SizedBox(height:16),
            TextFormField(controller:name,maxLength:120,readOnly:fromCatalogue,
              decoration:const InputDecoration(labelText:'Product name',border:OutlineInputBorder()),
              validator:(v)=>v==null||v.trim().length<2?'Enter a product name':null),
            const SizedBox(height:8),
            TextFormField(controller:category,maxLength:60,readOnly:fromCatalogue,
              decoration:const InputDecoration(labelText:'Category',border:OutlineInputBorder()),
              validator:(v)=>v==null||v.trim().isEmpty?'Enter a category':null),
            const SizedBox(height:8),
            TextFormField(controller:description,maxLength:500,maxLines:2,
              decoration:const InputDecoration(labelText:'Description (optional)',border:OutlineInputBorder())),
            const SizedBox(height:8),
            TextFormField(controller:price,keyboardType:const TextInputType.numberWithOptions(decimal:true),
              decoration:const InputDecoration(labelText:'Price (R)',border:OutlineInputBorder()),
              validator:(v){final amount=double.tryParse((v??'').replaceAll(',','.'));
                return amount==null||!amount.isFinite||amount<=0||amount>1000000?'Enter a valid price':null;}),
            const SizedBox(height:8),
            TextFormField(controller:stock,keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'Quantity in stock',border:OutlineInputBorder()),
              validator:(v){final n=int.tryParse((v??'').trim());
                return n==null||n<0||n>100000?'Enter a valid stock quantity':null;}),
            const SizedBox(height:14),
            FilledButton.icon(icon:const Icon(Icons.save_outlined),label:const Text('Save draft'),
              onPressed:(){
                if(key.currentState!.validate()) {
                  Navigator.of(ctx).pop(SellerDraft(
                    id:existing?.id??'p'+DateTime.now().microsecondsSinceEpoch.toString()+
                      Random.secure().nextInt(100000).toString(),
                    name:name.text.trim(),category:category.text.trim(),
                    description:description.text.trim(),createdAt:existing?.createdAt,updateTime:existing?.updateTime,
                    priceCents:(double.parse(price.text.replaceAll(',','.'))*100).round(),
                    stock:int.parse(stock.text.trim())));
                }
              }),
          ])))));
    name.dispose();category.dispose();description.dispose();price.dispose();stock.dispose();
    if(result!=null&&uid==widget.session.userId)await _save(result);
  }
  Widget _card(Widget child)=>Card(color:Colors.white,child:Padding(
    padding:const EdgeInsets.all(16),child:child));
  void selectSellerTab(int tab){
    if(tab==1){openProducts();return;}
    setState((){sellerTab=tab;productsView=false;});
  }
  Future<void> signOutSeller() async {
    if(busy)return;setState(()=>busy=true);
    try{await widget.session.signOut();if(mounted)widget.openLogin();}
    catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(mobileError(e))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> openAreas() async {
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerAreasPage(shopAddress:shop?.address??'',
      onDeliverySettings:()=>openTool(SellerTool.services))));
  }
  Widget businessTile(IconData icon,String title,String detail,VoidCallback tap)=>Card(color:Colors.white,
    child:ListTile(leading:Icon(icon,color:ownerGreen),title:Text(title,style:const TextStyle(fontWeight:FontWeight.w700)),
      subtitle:Text(detail),trailing:const Icon(Icons.chevron_right),onTap:tap));
  Widget sellerBusiness()=>ListView(padding:const EdgeInsets.all(18),children:[
    Text(shop!.name,style:const TextStyle(fontSize:24,fontWeight:FontWeight.w800)),
    Text(shop!.address,style:const TextStyle(color:Color(0xFF60736B))),const SizedBox(height:16),
    businessTile(Icons.near_me_outlined,'Areas around me','Plan local deliveries',openAreas),
    businessTile(Icons.account_balance_outlined,'Apply for stock finance','Send an enquiry and view its progress',()=>openTool(SellerTool.finance)),
    businessTile(Icons.local_shipping_outlined,'Delivery & shop services','Collection, delivery, cards, cashback & chat',()=>openTool(SellerTool.services)),
    businessTile(Icons.schedule_outlined,'Trading hours','Keep your opening times current',()=>openTool(SellerTool.hours)),
    businessTile(Icons.add_a_photo_outlined,'Shop photo & verification','Shop front, documents, selfie & mobile',()=>openTool(SellerTool.verification)),
    businessTile(Icons.assignment_turned_in_outlined,'Membership & R99 mandate','View your membership agreement',openMandate),
    businessTile(Icons.notifications_active_outlined,'Notifications','Orders, customer messages & shop updates',openNotifications),
    businessTile(Icons.inventory_2_outlined,'Order stock','Prepare your supplier shopping list',()=>openTool(SellerTool.stock)),
    businessTile(Icons.edit_outlined,'Edit shop profile','Business details and address',editProfile),
    Card(child:ListTile(leading:const Icon(Icons.star_rounded,color:Color(0xFFB57800)),
      title:Text(ratingCount>0&&shopRating!=null?'${shopRating!.toStringAsFixed(1)} from $ratingCount shoppers':'No ratings yet'),
      subtitle:const Text('Ratings from completed Teyza orders.'))),
    if(!widget.session.emailVerified)...[
      TextButton.icon(onPressed:() async{try{await widget.session.sendEmailVerification();
        if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Verification link sent. Check your inbox.')));
      }catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(authMessage(e))));}},
        icon:const Icon(Icons.mark_email_unread_outlined),label:const Text('Verify your email')),
      TextButton(onPressed:() async{try{await widget.session.refreshEmailStatus();}catch(_){}}
        ,child:const Text('Check email verification')),
    ],
    const SizedBox(height:16),OutlinedButton.icon(onPressed:busy?null:signOutSeller,
      icon:const Icon(Icons.logout),label:const Text('Sign out')),
  ]);
  Widget sellingBody()=>switch(sellerTab){
    1=>RefreshIndicator(onRefresh:load,child:ListView(physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.all(16),children:[
      if(draftError!=null)_card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(draftError!),
        TextButton(onPressed:load,child:const Text('Retry products'))])),
      productList(),const SizedBox(height:12),
      FilledButton.icon(onPressed:busy||draftError!=null||drafts.isEmpty?null:submitCatalogue,
        icon:const Icon(Icons.publish_outlined),label:const Text('Submit custom products for review')),
      const Padding(padding:EdgeInsets.all(12),child:Text('Selected products appear after shop setup. Custom products and replacement photos need review.',
        style:TextStyle(fontSize:12,color:Color(0xFF60736B)))),
    ])),
    2=>ShopOrdersPanel(session:widget.session,asOwner:true,api:widget.mobileApi),
    3=>ShopperChatPage(session:widget.session,api:widget.mobileApi,asOwner:true),
    4=>sellerBusiness(),
    _=>RefreshIndicator(onRefresh:load,child:SellerSellingDashboard(shopName:shop!.name,
      live:publicationStatus=='active',verified:identityVerified,productCount:draftError==null?drafts.length:null,
      onAdd:busy||draftError!=null?null:chooseProducts,onProducts:openProducts,onOrders:()=>selectSellerTab(2),
      onChat:()=>selectSellerTab(3),onFinance:()=>openTool(SellerTool.finance),onAreas:openAreas,
      onBusiness:()=>selectSellerTab(4),onVerify:()=>openTool(SellerTool.verification))),
  };
  Widget productList()=>_card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            Row(children:[
              const Expanded(child:Text('My products',style:TextStyle(fontSize:20,
                fontWeight:FontWeight.bold))),
              IconButton(onPressed:busy?null:load,icon:const Icon(Icons.refresh))
            ]),
            Text(draftError!=null?'Products are temporarily unavailable.':
              drafts.isEmpty?'No products saved yet.':'Your shop products: '+drafts.length.toString()),
            const SizedBox(height:10),
            FilledButton.icon(onPressed:busy||draftError!=null?null:chooseProducts,
              icon:const Icon(Icons.add),label:const Text('Add a product')),
            TextButton.icon(onPressed:busy||draftError!=null?null:()=>_edit(),
              icon:const Icon(Icons.edit_note),label:const Text('Add a custom product')),
            if(rangeStatus!=null)Padding(padding:const EdgeInsets.symmetric(vertical:8),child:Text(rangeStatus!)),
            OutlinedButton.icon(onPressed:busy?null:syncRange,icon:const Icon(Icons.sync),label:Text(widget.sellerMode?'Sync product listing':'Refresh shopper range')),
            for(final item in drafts)
              Column(children:[
                const Divider(),
                ListTile(contentPadding:EdgeInsets.zero,
                  leading:productPhotos[item.id]!=null?ClipRRect(borderRadius:BorderRadius.circular(10),child:Image.network(
                    productPhotos[item.id]!,width:48,height:48,fit:BoxFit.cover,errorBuilder:(_,__,___)=>const Icon(Icons.photo_outlined))):
                      cataloguePhotoForDraft(item.id)!=null?CataloguePhoto(photoKey:cataloguePhotoForDraft(item.id)!,size:48):null,
                  title:Text(item.name),
                  subtitle:Text(item.category+'  ·  Stock: '+item.stock.toString()+
                    (cataloguePhotoForDraft(item.id)!=null?'  ·  Selected range':'  ·  Private draft')),
                  trailing:Text('R'+(item.priceCents/100).toStringAsFixed(2)),
                  onTap:busy?null:()=>_edit(item)),
                Wrap(alignment:WrapAlignment.end,children:[
                  TextButton.icon(onPressed:busy?null:()=>_edit(item),
                    icon:const Icon(Icons.edit_outlined),label:const Text('Edit')),
                  TextButton.icon(onPressed:busy?null:()=>productPhoto(item),
                    icon:const Icon(Icons.add_a_photo_outlined),label:const Text('Photo')),
                  TextButton.icon(onPressed:busy?null:()=>_delete(item),
                    icon:const Icon(Icons.delete_outline),label:const Text('Delete'))
                ])
              ])
          ]));
  @override Widget build(BuildContext context){
    final session=widget.session;
    return Scaffold(
      backgroundColor:sellerCanvas,
      appBar:widget.sellerMode&&sellerTab==3&&shop!=null?null:AppBar(backgroundColor:sellerCanvas,foregroundColor:ownerInk,
        automaticallyImplyLeading:!widget.sellerMode,
        title:Text(widget.sellerMode?['Seller dashboard','My products','Customer orders','Customer chat','My business'][sellerTab]:productsView?'Shop setup & products':'My business'),
        leading:!widget.sellerMode&&productsView?BackButton(onPressed:()=>setState(()=>productsView=false)):null,
        actions:widget.sellerMode?[
          if(shop!=null)IconButton(tooltip:'Shop notifications',onPressed:openNotifications,
            icon:Badge(isLabelVisible:unread>0,label:Text(unread>99?'99+':'$unread'),child:const Icon(Icons.notifications_none_rounded))),
          IconButton(tooltip:'Sign out',onPressed:busy?null:signOutSeller,icon:const Icon(Icons.logout)),
        ]:[if(shop!=null)IconButton(tooltip:'Membership & mandate',onPressed:openMandate,icon:const Icon(Icons.assignment_turned_in_outlined)),if(shop!=null&&productsView)IconButton(tooltip:'Shop notifications',onPressed:openNotifications,icon:const Icon(Icons.notifications_none_rounded))]),
      bottomNavigationBar:widget.sellerMode&&shop?.hasRegisteredCategory==true?
        SellerNavigation(selected:sellerTab,onSelect:selectSellerTab):null,
      body:SafeArea(child:AnimatedBuilder(animation:session,builder:(ctx,child){
      if(session.idToken==null)return ListView(padding:const EdgeInsets.all(18),children:[
        _card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Icon(Icons.storefront_outlined,size:44,color:Color(0xFF008D64)),
          const SizedBox(height:8),
          const Text('Manage your Teyza shop',
            style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),
          const SizedBox(height:8),
          const Text('Sign in using the same Google or email account you used on teyza.co.za.'),
          const SizedBox(height:14),
          FilledButton(onPressed:widget.openLogin,child:const Text('Shop owner sign in'))
        ]))
      ]);
      if(loading)return const Center(child:CircularProgressIndicator());
      if(widget.sellerMode&&error==null&&shop?.hasRegisteredCategory==true)return sellingBody();
      return RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(16),children:[
        if(error!=null)_card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(error!,style:const TextStyle(color:Colors.red)),
          if(accessReference!=null)Text('Support reference: $accessReference',style:const TextStyle(fontSize:12)),
          TextButton(onPressed:load,child:const Text('Retry')),
          TextButton(onPressed:() async{
            await session.signOut();if(mounted)widget.openLogin();
          },child:const Text('Sign in with another account'))
        ])),
        if(error==null&&(shop==null||!shop!.hasRegisteredCategory))_card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('No registered shop found',style:TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
          const SizedBox(height:9),
          const Text('Create your Spaza Shop or Other Retail / Wholesale profile here, then use the camera to verify the owner.'),
          const SizedBox(height:14),
          FilledButton(onPressed:registerShop,child:const Text('Register a shop')),
          OutlinedButton(onPressed:load,child:const Text('Refresh my shop')),
        ]))
        else if(shop?.hasRegisteredCategory==true) ...[
          SellerShopHero(shop:shop!,identityVerified:identityVerified,publicationStatus:publicationStatus,sellingEnabled:sellingEnabled,productCount:draftError==null?drafts.length:null,unread:unread,onNotifications:openNotifications),
          const SizedBox(height:16),
          if(!sellingEnabled)FilledButton.icon(onPressed:()=>openTool(SellerTool.verification),icon:const Icon(Icons.verified_user_outlined),label:const Text('Complete registration & start selling')),
          if(draftError!=null)_card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(draftError!,style:const TextStyle(color:Color(0xFF8A5A00))),
            if(accessReference!=null)Text('Support reference: $accessReference',style:const TextStyle(fontSize:12)),
            TextButton(onPressed:load,child:const Text('Retry products'))
          ])),
          const SizedBox(height:12),
          if(!productsView)...[
            FilledButton.icon(onPressed:busy||draftError!=null?null:chooseProducts,
              icon:const Icon(Icons.add),label:const Text('Add a product')),
            const SizedBox(height:16),
          OutlinedButton.icon(onPressed:openMandate,icon:const Icon(Icons.assignment_turned_in_outlined),label:const Text('Membership & R99 mandate')),
            SellerSetupCard(products:draftError==null?drafts.length:null,verification:verification,
              onVerify:()=>openTool(SellerTool.verification),onProducts:openProducts),
            const SizedBox(height:24),
            SellerDashboard(productCount:draftError==null?drafts.length:null,onProducts:openProducts,
              onChat:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>ShopperChatPage(session:session,asOwner:true))),
              onOrders:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>Scaffold(
                appBar:AppBar(title:const Text('Shop orders')),body:ShopOrdersPanel(session:session,asOwner:true)))),
              onProfile:editProfile,onTool:openTool),
          Card(child:ListTile(leading:const Icon(Icons.star_rounded,color:Color(0xFFB57800)),
            title:Text(ratingCount>0&&shopRating!=null?'${shopRating!.toStringAsFixed(1)} from $ratingCount shoppers':'No ratings yet'),
            subtitle:const Text('Ratings from completed Teyza orders. One current rating per shopper.'))),
          ],
          if(productsView)productList(),
          const SizedBox(height:12),
          if(productsView)...[
            OutlinedButton.icon(onPressed:editProfile,icon:const Icon(Icons.edit_outlined),label:const Text('Edit shop profile')),
            FilledButton.icon(onPressed:busy||drafts.isEmpty?null:submitCatalogue,icon:const Icon(Icons.publish_outlined),
              label:const Text('Submit catalogue for review')),
            const Padding(padding:EdgeInsets.all(12),child:Text('Complete seller registration to publish your selected range. Custom products and replacement product photos are reviewed separately.',
              style:TextStyle(fontSize:12,color:Color(0xFF6C7880))))
          ],
        ]
      ]));
    })));
  }
}
