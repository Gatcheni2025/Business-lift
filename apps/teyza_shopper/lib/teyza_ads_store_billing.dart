import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_storekit/in_app_purchase_storekit.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

/// Fixed one-time, seven-day storefront SKUs; no subscriptions or web redirects.
String teyzaStoreAdsProductId(int km){
 if(km<1||km>50)throw RangeError.range(km,1,50);
 return 'teyza_ad7d_r'+(km<10?10:km).toString();
}
int teyzaStoreAdsPriceCents(int km){
 if(km<1||km>50)throw RangeError.range(km,1,50);
 return 2900+(km>10?km-10:0)*200;
}
class TeyzaStoreAdPurchase {
 TeyzaStoreAdPurchase({
  required this.session,required this.api,required this.onMessage,
  required this.onComplete,InAppPurchase? store,
 }):store=store??InAppPurchase.instance;
 final ShopperSession session;
 final TeyzaMobileApi api;
 final InAppPurchase store;
 final void Function(String message,bool error) onMessage;
 final VoidCallback onComplete;
 StreamSubscription<List<PurchaseDetails>>? subscription;
 bool purchasing=false,disposed=false;
 String? activeUid;
 String get _key=>'teyza_ads_store_intent_'+(activeUid??'none');
 bool get _sameAccount=>!disposed&&activeUid!=null&&activeUid==session.userId&&session.idToken!=null;
 void initialize(){
  if(disposed||(!Platform.isAndroid&&!Platform.isIOS))return;
  activeUid=session.userId;
  subscription=store.purchaseStream.listen((events){
   for(final purchase in events)unawaited(_handle(purchase));
  },onError:(Object _){onMessage('Store connection failed. Retry later.',true);});
 }
 Future<void> open(Map<String,dynamic> ad)async{
  if(purchasing||!_sameAccount||(!Platform.isAndroid&&!Platform.isIOS))return;
  purchasing=true;
  try{
   if(!await store.isAvailable())throw StateError('Store purchases are not available on this device.');
   final stored=await SharedPreferences.getInstance();
   if(stored.getString(_key)!=null)
    throw StateError('A previous store payment must be reconciled first. Use Refresh campaigns or contact support; do not pay twice.');
   final km=(ad['radiusKm'] as num?)?.toInt()??0;
   final expectedId=teyzaStoreAdsProductId(km),expected=teyzaStoreAdsPriceCents(km);
   final prepared=await api.call('ads_store_prepare',{
    'advertisementId':ad['id'],'platform':Platform.isIOS?'ios':'android'
   });
   if(!_sameAccount)return;
   final id=(prepared['productId']??'').toString(),
    intent=(prepared['intentId']??'').toString(),
    token=(prepared['accountToken']??'').toString();
   if(id!=expectedId||prepared['amountCents']!=expected||
      !RegExp(r'^ASI-[a-f0-9]{32}$').hasMatch(intent)||
      !RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$').hasMatch(token))
    throw StateError('Your seller identity or ad price has changed. No payment started.');
   final found=await store.queryProductDetails({id});
   if(found.error!=null||found.notFoundIDs.contains(id)||found.productDetails.length!=1)
    throw StateError('The approved advertising product is not available in this store.');
   final product=found.productDetails.single;
   if(product.currencyCode!='ZAR'||(product.rawPrice*100).round()!=expected)
    throw StateError('Store price mismatch: the R'+(expected/100).toStringAsFixed(2)+' offer is not available. No charge initiated.');
   final prefs=await SharedPreferences.getInstance();
   await prefs.setString(_key,jsonEncode({'ownerUid':activeUid,'intentId':intent,'productId':id}));
   if(!_sameAccount)return;
   onMessage('The store will charge '+product.price+' once for seven days, with no automatic renewal.',false);
   final param=Platform.isIOS?
    Sk2PurchaseParam(productDetails:product,applicationUserName:token):
    PurchaseParam(productDetails:product,applicationUserName:token);
   if(!await store.buyConsumable(purchaseParam:param,autoConsume:false))
    throw StateError('The store did not open the payment sheet. No ad was activated.');
  }catch(e){if(_sameAccount)onMessage(mobileError(e),true);}
  finally{purchasing=false;}
 }
 Future<void> _handle(PurchaseDetails p)async{
  if(!_sameAccount)return;
  if(p.status==PurchaseStatus.pending){
   onMessage('Your purchase is pending. Please do not buy again.',false);return;
  }
  if(p.status==PurchaseStatus.error){
   onMessage('Store purchase failed or was cancelled. Refresh before trying again.',true);return;
  }
  if(p.status!=PurchaseStatus.purchased&&p.status!=PurchaseStatus.restored)return;
  final prefs=await SharedPreferences.getInstance();
  final saved=prefs.getString(_key);
  if(saved==null){
   onMessage('An outstanding purchase needs support reconciliation. Do not pay twice.',true);return;
  }
  Map<String,dynamic> intent;
  try{intent=Map<String,dynamic>.from(jsonDecode(saved) as Map);}
  catch(_){onMessage('Saved store intent is damaged. Contact Teyza support.',true);return;}
  if(intent['ownerUid']!=activeUid||intent['productId']!=p.productID){
   onMessage('Purchase account or radius differs. Contact support before buying again.',true);return;
  }
  final proof=p.verificationData.serverVerificationData;
  if(proof.isEmpty){
   onMessage('Purchase proof is unavailable. Do not buy again.',true);return;
  }
  try{
   final result=await api.call('ads_store_verify',{
    'intentId':intent['intentId'],'platform':Platform.isIOS?'ios':'android',
    'productId':p.productID,'proof':proof
   });
   if(!_sameAccount)return;
   if(result['refundReviewRequired']==true){
    onMessage('Store payment needs refund review. Contact Teyza support.',true);return;
   }
   if(result['verified']!=true){
    onMessage('The purchase has not been independently verified.',true);return;
   }
   // Google Play's server has consumed/acknowledged the validated consumable.
   // StoreKit2 transactions are completed only AFTER successful server grant.
   if(Platform.isIOS&&p.pendingCompletePurchase)await store.completePurchase(p);
   await prefs.remove(_key);
   onMessage(result['status']=='test_paid'?
     'Sandbox receipt verified. This test ad is not publicly visible.':
     'Verified purchase received. Your ad is live for seven days.',false);
   onComplete();
  }catch(e){
   if(_sameAccount)onMessage('Verification pending. Do not pay twice. '+mobileError(e),true);
  }
 }
 Future<void> recover()async{
  if(!_sameAccount)return;
  try{
   final prefs=await SharedPreferences.getInstance();
   if(prefs.getString(_key)!=null){
    onMessage('Checking an outstanding purchase. Do not buy again until reconciled.',false);
    await store.restorePurchases();
   }
  }catch(_){
   if(_sameAccount)onMessage('Could not recover store purchases. Contact support.',true);
  }
 }
 void dispose(){disposed=true;subscription?.cancel();}
}
