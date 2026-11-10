import 'dart:math';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:image_picker/image_picker.dart';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'account_deletion_page.dart';
import 'seller_plan.dart';
import 'wholesale_market.dart';
import 'wholesale_connections.dart';
import 'wholesale_advertising.dart';
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
import 'seller_selling.dart';
import 'seller_areas.dart';
import 'seller_review.dart';
import 'seller_location.dart';
import 'seller_shop_photo.dart';
import 'seller_push.dart';

class SellerWorkspacePage extends StatefulWidget{
  final ShopperSession session;
  final VoidCallback openLogin;
  final SellerFirestore Function(String uid,String token)? apiFactory;
  final TeyzaMobileApi? mobileApi;
  final String? initialTarget;
  final String? initialClaimPlaceId;
  final bool sellerMode;
  const SellerWorkspacePage({super.key,required this.session,required this.openLogin,this.apiFactory,this.mobileApi,this.initialTarget,this.initialClaimPlaceId,this.sellerMode=false});
  @override State<SellerWorkspacePage> createState()=>_SellerWorkspaceState();
}
class _SellerWorkspaceState extends State<SellerWorkspacePage> with WidgetsBindingObserver{
  SellerShop? shop;
  List<SellerDraft> drafts=[];
  SellerFirestore? api;
  String? loadedUid,error,draftError,accessReference;
  bool loading=false,busy=false,productsView=false;
  int sellerTab=0;
  Map<String,String> productPhotos={};
  String? rangeStatus;
  int unread=0;String verification='not_submitted';Timer? activityWatch;bool activityLoading=false,openedInitial=false,openedClaim=false;
  String? publicationStatus;bool sellingEnabled=false,identityVerified=false,shopLive=false;
  String approvalStatus='pending',listingPlan='free';bool listingPaid=false,complimentaryAccess=false,mandateAccess=false,promotionActive=false;int? paidUntil,mandateUntil,promotionEndsAt;bool hasLocation=false;
  bool get sellerApproved=>approvalStatus=='approved';
  bool get hasProductAccess=>sellerApproved&&(listingPaid||complimentaryAccess||mandateAccess);
  // A public shop listing is free. Selling/advertising needs a separate
  // verified entitlement. Temporary admin access is not a paid subscription.
  bool get premiumAccount=>sellerApproved&&listingPaid;
  bool get needsMembership=>sellerApproved&&shopLive&&!hasProductAccess;
  String get businessAccessLabel=>premiumAccount?'Premium account':
      !sellerApproved?'Shop approval pending':
      !shopLive?'Shop listing pending':
      complimentaryAccess||mandateAccess?'Temporary selling access':
      'Unable to sell · membership inactive';
  bool get canOfferDirectMandate=>teyzaCanOpenMembershipPage(isAndroid:Platform.isAndroid,channel:teyzaPaymentChannel);
  double? shopRating;int ratingCount=0;
  Map<String,dynamic> shopServices={};bool servicesReady=false,shopPhotoLoading=false,noticesPrimed=false;
  Uint8List? shopPhoto;String? shopPhotoId;int photoRequest=0;
  final seenOrderNotices=<String>{};StreamSubscription<void>? pushUpdates;
  bool get liveUpdates=>widget.apiFactory==null||widget.mobileApi!=null;
  TeyzaMobileApi get mobile=>widget.mobileApi??TeyzaMobileApi(widget.session);
  @override void initState(){
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.session.addListener(_sessionChanged);
    pushUpdates=SellerPush(widget.session).updates.stream.listen((_)=>refreshActivity());
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)_sessionChanged();});
  }
  @override void dispose(){
    activityWatch?.cancel();WidgetsBinding.instance.removeObserver(this);
    pushUpdates?.cancel();photoRequest++;shopPhoto=null;
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }
  @override void didChangeAppLifecycleState(AppLifecycleState state){
    if(state==AppLifecycleState.resumed){refreshActivity();startActivity();}else{activityWatch?.cancel();}
  }
  void startActivity(){activityWatch?.cancel();if(liveUpdates)activityWatch=Timer.periodic(const Duration(seconds:25),(_)=>refreshActivity());}
  Future<void> refreshActivity() async{
    if(!liveUpdates||activityLoading||shop==null||loadedUid!=widget.session.userId)return;
    final uid=widget.session.userId;if(uid==null)return;activityLoading=true;
    try{final results=await Future.wait([mobile.call('seller_summary'),widget.session.contactVerified?mobile.call('notification_list'):Future.value(<String,dynamic>{'unread':0})]);
      if(!mounted||uid!=widget.session.userId)return;
      final notices=mobileRows(results[1]['notifications']).where((n)=>n['target']=='orders').toList();
      final fresh=noticesPrimed?notices.where((n)=>n['read']!=true&&!seenOrderNotices.contains(n['id'].toString())).toList():<Map<String,dynamic>>[];
      seenOrderNotices.addAll(notices.map((n)=>n['id'].toString()));noticesPrimed=true;
      if(seenOrderNotices.length>500)seenOrderNotices.removeAll(seenOrderNotices.take(seenOrderNotices.length-500).toList());
      // Website Paystack payments are reconciled by Firebase, not by a
      // browser callback or mobile checkout. Only server-reported entitlement
      // can unlock the existing seller tools when this app resumes.
      final newlyVerifiedMembership=!listingPaid&&results[0]['listingPaid']==true&&
          results[0]['approvalStatus']=='approved';
      setState((){unread=(results[1]['unread'] as num? ??0).toInt();
        publicationStatus=results[0]['publicationStatus']?.toString();sellingEnabled=results[0]['sellingEnabled']==true;identityVerified=results[0]['identityVerified']==true;shopLive=results[0]['shopLive']==true;
        approvalStatus=results[0]['approvalStatus']?.toString()??shop?.approvalStatus??'pending';listingPlan=results[0]['listingPlan']?.toString()??'free';listingPaid=results[0]['listingPaid']==true;complimentaryAccess=results[0]['complimentaryAccess']==true;mandateAccess=results[0]['mandateAccessActive']==true;mandateUntil=(results[0]['mandateAccessUntil'] as num?)?.toInt();promotionActive=results[0]['promotionActive']==true;paidUntil=(results[0]['paidUntil'] as num?)?.toInt();promotionEndsAt=(results[0]['promotionEndsAt'] as num?)?.toInt();hasLocation=results[0]['hasLocation']==true;
        shopRating=(results[0]['rating'] as num?)?.toDouble();ratingCount=(results[0]['ratingCount'] as num?)?.toInt()??0;
        shopServices=results[0]['settings'] is Map?Map<String,dynamic>.from(results[0]['settings'] as Map):{};servicesReady=true;
        final v=results[0]['verification'];verification=v is Map?v['status']?.toString()??'not_submitted':'not_submitted';});
      if(newlyVerifiedMembership&&mounted&&widget.sellerMode){
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:Text('Your verified Teyza membership is active. Start selling is now available.')));
      }
      final front=results[0]['shopFront'];unawaited(loadShopPhoto(uid,front is Map?front['photoId']?.toString():null));
      if(fresh.isNotEmpty&&widget.sellerMode)ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content:Text(fresh.length==1?fresh.first['title']?.toString()??'New order update':'${fresh.length} new order updates'),
        action:SnackBarAction(label:'View orders',onPressed:()=>openDestination('orders'))));
    }catch(_){/* Account and private products remain usable during service outages. */}
    finally{activityLoading=false;}
  }
  Future<void> loadShopPhoto(String uid,String? id) async {
    if(!mounted||uid!=widget.session.userId)return;
    if(id==null){photoRequest++;setState((){shopPhoto=null;shopPhotoId=null;shopPhotoLoading=false;});return;}
    if(shopPhotoId==id&&(shopPhoto!=null||shopPhotoLoading))return;
    final request=++photoRequest;setState((){shopPhotoId=id;shopPhoto=null;shopPhotoLoading=true;});
    try{final result=await mobile.call('shop_front_read'),front=result['shopFront'];
      if(!mounted||uid!=widget.session.userId||photoRequest!=request||front is! Map||front['photoId']!=id||front['imageBase64'] is! String)return;
      final bytes=base64Decode(front['imageBase64'] as String);if(bytes.length>2000000)return;
      setState(()=>shopPhoto=bytes);
    }catch(_){/* The photo manager remains available to retry or replace a photo. */}
    finally{if(mounted&&photoRequest==request)setState(()=>shopPhotoLoading=false);}
  }
  Future<void> openShopPhoto() async {
    final changed=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>SellerShopPhotoPage(session:widget.session,api:widget.mobileApi)));
    if(changed==true&&mounted){shopPhotoId=null;await refreshActivity();}
  }
  Future<void> enableOrderAlerts() async {
    if(SellerPush(widget.session).isEnabled){await openNotifications();return;}
    final uid=widget.session.userId;if(uid==null||busy)return;setState(()=>busy=true);
    try{
      await SellerPush(widget.session).enable();if(!mounted||uid!=widget.session.userId)return;
      final result=await mobile.call('notification_list');if(uid!=widget.session.userId)return;
      final prefs=result['preferences'] is Map?result['preferences'] as Map:const {};
      await mobile.call('notification_preferences',{for(final key in ['orders','messages','stock','reviews'])key:key=='orders'||prefs[key]!=false});
      if(mounted&&uid==widget.session.userId)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Phone order alerts enabled. Every order also stays in your inbox.')));
    }catch(e){if(mounted&&uid==widget.session.userId)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(mobileError(e))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> registerShop() async{
    await Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerRegistrationPage(session:widget.session,api:widget.mobileApi,initialGooglePlaceId:widget.initialClaimPlaceId)));
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
      photoRequest++;shopPhoto=null;shopPhotoId=null;shopPhotoLoading=false;shopServices={};servicesReady=false;noticesPrimed=false;seenOrderNotices.clear();
      loadedUid=null;api=null;shop=null;drafts=[];productPhotos={};error=null;draftError=null;accessReference=null;unread=0;verification='not_submitted';publicationStatus=null;sellingEnabled=false;identityVerified=false;shopLive=false;approvalStatus='pending';listingPlan='free';listingPaid=false;complimentaryAccess=false;promotionActive=false;paidUntil=null;promotionEndsAt=null;hasLocation=false;shopRating=null;ratingCount=0;
    });
    if(widget.session.idToken==null||uid==null){
      if(loadedUid!=null && mounted)setState((){
        loadedUid=null;api=null;shop=null;drafts=[];productPhotos={};error=null;draftError=null;accessReference=null;
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

        if(!openedClaim&&widget.initialClaimPlaceId!=null){openedClaim=true;
          WidgetsBinding.instance.addPostFrameCallback((_){if(!mounted)return;
            if(nextShop==null)registerShop();else ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content:Text('This account already has a shop. Contact Teyza support to link a Google Maps business.')));});}

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
  void openSupplierAdvertising()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>
    WholesaleAdvertisingPage(session:widget.session,api:widget.mobileApi,supplierMode:true)));
  void openSpazaSupplierOffers()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>
    WholesaleAdvertisingPage(session:widget.session,api:widget.mobileApi,supplierMode:false)));
  Future<void> openProducts() async {
    if(shop?.category=='wholesale'){openSupplierAdvertising();return;}
    final uid=widget.session.userId;
    setState((){productsView=true;if(widget.sellerMode)sellerTab=1;});
    if(uid==null)return;
    try{
      final result=await mobile.call('seller_summary');
      if(!mounted||uid!=widget.session.userId)return;
      setState(()=>productPhotos={for(final p in mobileRows(result['photos']))p['id'].toString():p['url'].toString()});
      // Opening My Products is an explicit owner request to display saved
      // stock. Recover drafts previously stored via the Firestore fallback
      // while the mobile service was offline. Never auto-publish on login.
      if(shop?.category!='wholesale'&&drafts.isNotEmpty){
        if(result['approvalStatus']=='approved'&&result['setupComplete']==true&&
          (result['listingPaid']==true||result['complimentaryAccess']==true||result['mandateAccessActive']==true)){
          await syncRange();
        }else{
          setState(()=>rangeStatus='Your products are saved privately. Seller approval, completed shop setup and active selling eligibility are required to display prices to shoppers.');
        }
      }
    }catch(error){
      if(mounted&&uid==widget.session.userId)setState(()=>rangeStatus=
        'Your saved products are still available. The publication service could not be checked: ${mobileError(error)}');
    }
  }
  Future<void> openUpgrade({bool promote=false,bool fromProductAction=false}) async {
    final uid=widget.session.userId;
    final saved=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>SellerPlanPage(
      session:widget.session,api:widget.mobileApi,businessType:shop?.category??'spaza',showPromotion:promote,fromProductAction:fromProductAction)));
    if(!mounted||uid!=widget.session.userId)return;
    if(saved==true){
      setState((){sellerTab=0;productsView=false;});
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Shop eligibility information refreshed.')));
    }
    await refreshActivity();
  }
  Future<void> chooseProducts() async {
    if(busy)return;
    if(shop?.category=='wholesale'){
      openSupplierAdvertising();return;
    }
    // Never rely on the last periodic dashboard refresh for entitlement.
    // Admin review alone is not a verified debit or a selling grant.
    final uid=widget.session.userId;
    if(uid==null)return;
    Map<String,dynamic> current;
    try{current=await mobile.call('seller_summary');}
    catch(e){
      if(mounted&&uid==widget.session.userId)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text('Could not check selling access. Please try again: ${mobileError(e)}')));
      return;
    }
    if(!mounted||uid!=widget.session.userId)return;
    final verified=current['approvalStatus']=='approved';
    final active=current['listingPaid']==true||current['complimentaryAccess']==true||current['mandateAccessActive']==true;
    setState((){
      approvalStatus=verified?'approved':'pending';
      listingPaid=current['listingPaid']==true;
      complimentaryAccess=current['complimentaryAccess']==true;mandateAccess=current['mandateAccessActive']==true;mandateUntil=(current['mandateAccessUntil'] as num?)?.toInt();
      sellingEnabled=current['sellingEnabled']==true;
    });
    if(!verified){await openUpgrade(fromProductAction:true);return;}
    if(!active){
      // Review the current entitlement; payment is exclusively website-side.
      if(mounted&&uid==widget.session.userId)await openUpgrade(fromProductAction:true);
      return;
    }
    if(current['sellingEnabled']!=true){
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Seller approval and selling access are active, but your shop setup or public listing is not ready. Complete shop setup before publishing.')));
      return;
    }
    if(draftError!=null){
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Your product list is unavailable. Refresh it before continuing.')));
      return;
    }
    if(drafts.isNotEmpty){
      // "Start selling" is an explicit request to publish the selected stock.
      // Syncing can opt legacy catalogues in only after backend access checks.
      try{
        final sync=await mobile.call('catalogue_sync');
        if(!mounted||uid!=widget.session.userId)return;
        if(sync['publication']=='private'){
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Your products are still private. Check shop verification and verified selling access, then retry.')));
          return;
        }
      }catch(e){
        if(mounted&&uid==widget.session.userId)ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content:Text('Could not publish saved products. Retry Sync product listing: ${mobileError(e)}')));
        return;
      }
    }
    final requestedUid=widget.session.userId;
    final result=await Navigator.push<Map<String,dynamic>>(context,MaterialPageRoute(builder:(_)=>SellerProductPickerPage(
      session:widget.session,existingIds:drafts.map((p)=>p.id).toSet(),api:widget.mobileApi,draftApiFactory:widget.apiFactory)));
    if(result==null||!mounted||widget.session.userId!=requestedUid)return;
    await load();
    if(mounted&&widget.sellerMode)setState((){sellerTab=1;productsView=true;});
    if(mounted){setState(()=>rangeStatus=result['publication']=='live'?
      shop?.category=='wholesale'?'Your wholesale range is available only to approved spaza owners.':'Your selected range is visible to shoppers.':result['serviceUnavailable']==true?'Products saved privately. Contact Teyza support to activate shop services before publishing.':'Products saved privately. Complete seller verification and activate product access to start selling.');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(rangeStatus!)));}
  }
  Future<void> syncRange({String? removedId}) async {
    final uid=widget.session.userId;
    try{
      final result=await mobile.call('catalogue_sync',{
        if(removedId!=null)'removedProductId':removedId});
      if(!mounted||uid!=widget.session.userId)return;
      final visible=(result['publicCount'] as num?)?.toInt()??0;
      setState(()=>rangeStatus=shop?.category=='wholesale'?
        'Your wholesaler shop is listed, but supplier products and prices are not public.':
        result['publication']=='live'&&visible>0?
          '$visible products published to the shopper catalogue. Refresh the shopper app to see them.':
        result['publication']=='live'?
          'No priced products published yet. Check that saved stock has a valid price and refresh the listing.':
          'Products are saved privately. Complete shop verification and activate selling access before publication.');
    }catch(error){
      if(mounted&&uid==widget.session.userId)setState(()=>rangeStatus=
        'Your products are saved but not confirmed live. Retry Sync product listing. ${mobileError(error)}');
    }
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
    final changed=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>SellerProfilePage(
      session:widget.session,shop:shop!,api:widget.mobileApi,
      serviceSettings:shopServices,servicesReady:servicesReady,
      onServicesSaved:refreshActivity)));
    if(changed==true&&mounted)load();
  }
  Future<void> _save(SellerDraft p) async{
    if(api==null || busy)return;
    if(!sellerApproved){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Wait for seller approval before adding products.')));return;}
    if(!hasProductAccess){await openUpgrade(fromProductAction:true);return;}
    final uid=loadedUid;if(uid==null||uid!=widget.session.userId)return;
    setState(()=>busy=true);
    try{
      final token=await widget.session.freshIdToken();
      if(uid!=widget.session.userId)return;
      await SellerFirestore(uid:uid,token:token).save(p);
      await loadAfterSave();
      await syncRange();
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content:Text(rangeStatus??'Product saved.')));
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
    if(!hasProductAccess){await openUpgrade(fromProductAction:true);return;}
    final uid=widget.session.userId;
    final name=TextEditingController(text:existing?.name??'');
    final category=TextEditingController(text:existing?.category??(shop?.category=='wholesale'?'Bulk stock / wholesale':shop?.category=='retail'?'General retail':'Groceries'));
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
              'Products publish automatically when your registration is approved and product access is active.'),
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
              decoration:InputDecoration(labelText:shop?.category=='wholesale'?'Wholesale price per unit or pack (R)':'Retail selling price (R)',border:const OutlineInputBorder()),
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
    if(tab==1){if(shop?.category=='wholesale')openSupplierAdvertising();else openProducts();return;}
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
  Future<void> openLocation() async {
    final changed=await Navigator.push<bool>(context,MaterialPageRoute(builder:(_)=>SellerLocationPage(
      session:widget.session,api:widget.mobileApi,shopAddress:shop?.address??'')));
    if(changed==true&&mounted){await load();refreshActivity();}
  }
  Widget businessTile(IconData icon,String title,String detail,VoidCallback tap)=>Card(color:Colors.white,
    child:ListTile(leading:Icon(icon,color:ownerGreen),title:Text(title,style:const TextStyle(fontWeight:FontWeight.w700)),
      subtitle:Text(detail),trailing:const Icon(Icons.chevron_right),onTap:tap));
  Widget sellerBusiness()=>ListView(padding:const EdgeInsets.all(18),children:[
    Text(shop!.category=='wholesale'?'Wholesaler · '+shop!.name:shop!.category=='spaza'?'Spaza Shop · '+shop!.name:shop!.name,style:const TextStyle(fontSize:24,fontWeight:FontWeight.w800)),
    Text(shop!.address,style:const TextStyle(color:Color(0xFF60736B))),const SizedBox(height:16),
    businessTile(Icons.location_on_outlined,'Shop location',hasLocation?'View or update your shop pin':'Add a pin to appear in nearby search',openLocation),
    businessTile(Icons.near_me_outlined,'Areas around me','Plan local deliveries',openAreas),
    businessTile(Icons.account_balance_outlined,'Apply for stock finance','Send an enquiry and view its progress',()=>openTool(SellerTool.finance)),
    businessTile(Icons.edit_outlined,'Edit shop profile','Delivery, radius, card payments & shop details',editProfile),
    businessTile(Icons.schedule_outlined,'Trading hours','Keep your opening times current',()=>openTool(SellerTool.hours)),
    businessTile(Icons.add_a_photo_outlined,'Shop photo & verification','Shop front, documents, selfie & mobile',()=>openTool(SellerTool.verification)),
    businessTile(Icons.photo_camera_outlined,'Shop-front photo','View or change the photo on your dashboard and listing',openShopPhoto),
    if(shop?.category=='wholesale')businessTile(Icons.handshake_outlined,'Spaza partnership requests',
      'Approve connections, set real discounts and delivery fees, then chat',
      ()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>
        WholesaleConnectionsPage(session:widget.session,api:widget.mobileApi)))),
    if(shop?.category=='spaza')businessTile(Icons.receipt_long_outlined,'My wholesale stock orders',
      'Follow up orders and deliveries from your suppliers',
      ()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>
        Scaffold(appBar:AppBar(title:const Text('My wholesale stock orders')),
          body:ShopOrdersPanel(session:widget.session,asOwner:false,wholesaleOnly:true,api:widget.mobileApi))))),
    if(shop?.category=='wholesale')businessTile(Icons.campaign_outlined,'Advertise to participating spaza shops',
      'Connect with opted-in spazas through moderated supplier offers and invitations. No public wholesaler products.',
      openSupplierAdvertising),
    if(shop?.category=='spaza')businessTile(Icons.campaign_outlined,'Supplier offers for my spaza',
      'Choose whether to receive private in-app offers from verified wholesalers.',
      openSpazaSupplierOffers),
    businessTile(Icons.inventory_2_outlined,'Order stock','Prepare your supplier shopping list',()=>openTool(SellerTool.stock)),
    businessTile(Icons.delete_outline,'Privacy & Security · Delete My Account',
      'Request permanent account and shop listing deletion',
      ()=>Navigator.push(context,MaterialPageRoute(
        builder:(_)=>TeyzaDeleteAccountPage(session:widget.session,api:widget.mobileApi)))),
    if(widget.session.hasAdminClaim&&widget.session.emailVerified)
      businessTile(Icons.admin_panel_settings_outlined,'Seller review desk','Administrator access',()=>Navigator.push(context,
        MaterialPageRoute(builder:(_)=>SellerReviewPage(session:widget.session,api:widget.mobileApi)))),
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
      const Padding(padding:EdgeInsets.all(12),child:Text('Products and photos publish automatically once your registration and product access are active.',
        style:TextStyle(fontSize:12,color:Color(0xFF60736B)))),
    ])),
    2=>ShopOrdersPanel(session:widget.session,asOwner:true,api:widget.mobileApi),
    3=>ShopperChatPage(session:widget.session,api:widget.mobileApi,asOwner:true,
      onOpenUpdates:openNotifications,unreadUpdates:unread),
    4=>sellerBusiness(),
    _=>RefreshIndicator(onRefresh:load,child:SellerSellingDashboard(shopName:shop!.name,
      live:shopLive,verified:identityVerified,publicationStatus:publicationStatus,
      hasLocation:hasLocation,onLocation:openLocation,productCount:draftError==null?drafts.length:null,
      shopPhoto:shopPhoto,photoLoading:shopPhotoLoading,onPhoto:openShopPhoto,unread:unread,
      onEditProfile:editProfile,
      onAdd:busy?null:chooseProducts,onProducts:shop?.category=='wholesale'?openSupplierAdvertising:openProducts,onOrders:()=>selectSellerTab(2),
      onShop:shop?.category=='spaza'?()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>
         WholesaleMarketPage(session:widget.session,api:widget.mobileApi,businessAddress:shop?.address??''))):null,
       onChat:()=>selectSellerTab(3),onFinance:()=>openTool(SellerTool.finance),onAreas:openAreas,
      onBusiness:()=>selectSellerTab(4),onVerify:()=>openTool(SellerTool.verification))),
  };
  Widget productList()=>_card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            if(!sellerApproved)const Padding(padding:EdgeInsets.only(bottom:12),child:Text('Your registration is under review. Product access and payments become available after approval.',style:TextStyle(color:Color(0xFF8A5A00),height:1.4))),
            Row(children:[
              const Expanded(child:Text('My products',style:TextStyle(fontSize:20,
                fontWeight:FontWeight.bold))),
              IconButton(onPressed:busy?null:load,icon:const Icon(Icons.refresh))
            ]),
            Text(draftError!=null?'Products are temporarily unavailable.':
              drafts.isEmpty?'No products saved yet.':'Your shop products: '+drafts.length.toString()),
            const SizedBox(height:10),
            FilledButton.icon(onPressed:busy?null:chooseProducts,
              icon:const Icon(Icons.add),label:const Text('Start selling')),
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
                    (cataloguePhotoForDraft(item.id)!=null?'  ·  Selected range':'  ·  Custom product')),
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
        title:Text(widget.sellerMode?(shop?.category=='wholesale'?['Wholesaler dashboard','Advertise to spazas','Partner orders','Partner chat','My business']:['Seller dashboard','My products','Customer orders','Customer chat','My business'])[sellerTab]:productsView?'Shop setup & products':'My business'),
        leading:!widget.sellerMode&&productsView?BackButton(onPressed:()=>setState(()=>productsView=false)):null,
        actions:widget.sellerMode?[
          IconButton(tooltip:'Sign out',onPressed:busy?null:signOutSeller,icon:const Icon(Icons.logout)),
        ]:null),
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
          TextButton.icon(onPressed:()=>Navigator.push(context,
            MaterialPageRoute(builder:(_)=>TeyzaDeleteAccountPage(session:session,api:widget.mobileApi))),
            icon:const Icon(Icons.delete_outline,color:Colors.red),label:const Text('Delete My Account')),
          TextButton(onPressed:() async{
            await session.signOut();if(mounted)widget.openLogin();
          },child:const Text('Sign in with another account'))
        ])),
        if(error==null&&(shop==null||!shop!.hasRegisteredCategory))_card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('No registered shop found',style:TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
          const SizedBox(height:9),
          const Text('Choose Spaza Shop, Wholesaler supplying spaza shops, or Other Business. Your seller dashboard will reflect that choice after sign-in.'),
          const SizedBox(height:14),
          FilledButton(onPressed:registerShop,child:const Text('Register a shop')),
          OutlinedButton(onPressed:load,child:const Text('Refresh my shop')),
          TextButton.icon(onPressed:()=>Navigator.push(context,
            MaterialPageRoute(builder:(_)=>TeyzaDeleteAccountPage(session:session,api:widget.mobileApi))),
            icon:const Icon(Icons.delete_outline,color:Colors.red),label:const Text('Delete My Account')),
        ]))
        else if(shop?.hasRegisteredCategory==true) ...[
          SellerShopHero(shop:shop!,identityVerified:identityVerified,publicationStatus:publicationStatus,sellingEnabled:sellingEnabled,shopLive:shopLive,premiumAccount:premiumAccount,hasProductAccess:hasProductAccess,productCount:draftError==null?drafts.length:null),
          if(!hasProductAccess)Card(child:ListTile(
            leading:Icon(Icons.storefront_outlined),
            title:Text('Your business registration is free'),
            subtitle:Text(canOfferDirectMandate?'Once approved, your shop can appear nearby. Review the membership options before publishing products.':'Once approved, your shop can appear nearby. Product tools become available when the account is eligible.'))),
          const SizedBox(height:16),
          if(!sellerApproved)FilledButton.icon(onPressed:()=>openTool(SellerTool.verification),icon:const Icon(Icons.verified_user_outlined),label:const Text('Complete seller verification')),
          if(needsMembership)const Padding(padding:EdgeInsets.symmetric(vertical:6),child:Text('Shop is live · Unable to sell until membership is active.',style:TextStyle(fontWeight:FontWeight.w700,color:Color(0xFF8A5A00)))),
          if(draftError!=null)_card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(draftError!,style:const TextStyle(color:Color(0xFF8A5A00))),
            if(accessReference!=null)Text('Support reference: $accessReference',style:const TextStyle(fontSize:12)),
            TextButton(onPressed:load,child:const Text('Retry products'))
          ])),
          const SizedBox(height:12),
          if(!productsView)...[
            FilledButton.icon(onPressed:busy?null:chooseProducts,
              icon:const Icon(Icons.add),label:const Text('Start selling')),
            const SizedBox(height:16),
          OutlinedButton.icon(onPressed:()=>Navigator.push(context,
              MaterialPageRoute(builder:(_)=>SellerPlanPage(session:session,api:widget.mobileApi,businessType:shop?.category??'spaza')))
              .then((_){if(mounted)refreshActivity();}),
            icon:const Icon(Icons.workspace_premium_outlined),
            label:Text(premiumAccount?'Premium account':needsMembership?'Upgrade to sell on Teyza':businessAccessLabel)),

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
            const Padding(padding:EdgeInsets.all(12),child:Text('Products and photos publish automatically once your registration and product access are active.',
              style:TextStyle(fontSize:12,color:Color(0xFF6C7880))))
          ],
        ]
      ]));
    })));
  }
}

