<?php
declare(strict_types=1);
// Public, read-only catalogue of shops approved to appear in TEYZA Shopper.
// No personal, banking, identity, financing or internal merchant data is returned.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=45');
header('X-Content-Type-Options: nosniff');

$directory = dirname(__DIR__).'/../private_html/teyza-data';
if (!is_dir($directory) || !is_readable($directory)) {
  http_response_code(503);
  echo json_encode(['ok'=>false,'error'=>'Shop catalogue is temporarily unavailable']);
  exit;
}
function publicUrl(string $value): string {
  $value=trim($value);
  if ($value==='') return '';
  if (preg_match('#^https://#i',$value)) return $value;
  if (preg_match('#^(?:/?assets/catalog-real/[a-z0-9-]+\.webp|/?uploads/(?:business-logos|products)/[A-Za-z0-9_.?=-]+)$#D',$value))
    return 'https://teyza.co.za/'.ltrim($value,'/');
  return '';
}
function label($value,int $length=130): string {
  if (!is_string($value) && !is_numeric($value)) return '';
  return substr(trim((string)$value),0,$length);
}
$shops=[];
foreach (glob($directory.'/*.json') ?: [] as $file) {
  if (count($shops)>=250) break;
  if (!is_file($file) || filesize($file)>3*1024*1024) continue;
  $raw=@file_get_contents($file);
  $merchant=$raw===false?null:json_decode($raw,true);
  if (!is_array($merchant)) continue;
  $business=$merchant['business']??[];
  if (!is_array($business)) continue;
  // Never show an unapproved seller or a seller who has not opted into the app.
  if (($merchant['companyApproval']['status']??'')!=='approved'
      || ($business['shopperEnabled']??false)!==true) continue;
  $subscription=$merchant['subscription']??null;
  $subscriptionPlan='legacy';
  $sponsored=false;
  $allowProducts=true;
  if(is_array($subscription)) {
    $status=(string)($subscription['status']??'not_selected');
    $expiry=strtotime((string)($subscription['expiresAt']??''));
    if($status!=='active'||$expiry===false||$expiry<=time())continue;
    $subscriptionPlan=(string)($subscription['plan']??'basic');
    $allowProducts=in_array($subscriptionPlan,['plus','sponsored'],true);
    $sponsored=$subscriptionPlan==='sponsored';
  }
  $name=label($business['businessName']??'',110);
  if ($name==='') continue;
  $products=[];
  foreach ($allowProducts?($merchant['products']??[]):[] as $product) {
    if (count($products)>=120) break;
    if (!is_array($product)) continue;
    $status=strtolower(label($product['verificationStatus']??'',35));
    if (!in_array($status,['approved','published'],true)
      || ($product['marketplaceVisible']??true)===false) continue;
    $stock=filter_var($product['stock']??null,FILTER_VALIDATE_INT);
    $price=filter_var($product['price']??null,FILTER_VALIDATE_FLOAT);
    if ($stock===false || $stock<=0 || $price===false || $price<=0 || $price>100000) continue;
    $id=label($product['id']??'',100);
    if ($id==='') continue;
    $category=label($product['category']??'other',40);
    $picture='';
    if (!empty($product['images'][0]) && is_string($product['images'][0])) $picture=publicUrl($product['images'][0]);
    if ($picture==='' && preg_match('/^[a-z]+$/D',$category)) $picture=publicUrl('assets/catalog-real/'.$category.'.webp');
    $products[]=['id'=>$id,'name'=>label($product['name']??'',110),
      'category'=>$category,'priceCents'=>(int)round($price*100),'stock'=>$stock,'imageUrl'=>$picture];
  }
  if (count($products)===0 && $subscriptionPlan==='legacy') continue;
  $settings=$merchant['settings']['delivery']??[];
  $pickupEnabled=(($settings['fulfilmentMode']??'pickup')==='pickup') || !empty($settings['pickupEnabled']);
  $deliveryEnabled=in_array(($settings['fulfilmentMode']??''),['own_driver','courier'],true) || !empty($settings['deliveryEnabled']);
  if (!$pickupEnabled && !$deliveryEnabled) $pickupEnabled=true;
  $publicPhone='';
  $whatsappOptIn=($business['shopperWhatsAppOptIn']??false)===true;
  if ($whatsappOptIn) {
    $digits=preg_replace('/\D+/','',label($business['phone']??'',25));
    if (preg_match('/^0[0-9]{9}$/',$digits)) $digits='27'.substr($digits,1);
    if (preg_match('/^27[0-9]{9}$/',$digits)) $publicPhone=$digits;
  }
  // Share only approximate location when an approved merchant explicitly opts in.
  // 3 decimal places is roughly 100 metres: never expose exact verification coordinates.
  $approxLat=null; $approxLng=null;
  if (($business['shopperLocationOptIn']??false)===true) {
    $loc=$merchant['verification']['location']??[];
    if (!empty($loc['confirmed']) && isset($loc['lat'],$loc['lng']) &&
        is_numeric($loc['lat']) && is_numeric($loc['lng'])) {
      $lat=(float)$loc['lat']; $lng=(float)$loc['lng'];
      if ($lat>=-90 && $lat<=90 && $lng>=-180 && $lng<=180) {
        $approxLat=round($lat,3); $approxLng=round($lng,3);
      }
    }
  }
  // Public service flags are opt-in by the approved shop owner.
  // Missing values must remain unknown, not be shown as enabled or disabled.
  $shopperServices=is_array($business['shopperServices']??null)?$business['shopperServices']:[];
  $cardPayments=isset($shopperServices['cardPayments']) && is_bool($shopperServices['cardPayments'])
    ?$shopperServices['cardPayments']:null;
  $cashback=isset($shopperServices['cashback']) && is_bool($shopperServices['cashback'])
    ?$shopperServices['cashback']:null;
  $shopperType=(($business['shopperCategory']??'spaza')==='variety')?'variety':'spaza';
  $shops[]=[
    'id'=>label($business['businessId']??basename($file,'.json'),128),
    'name'=>$name,'area'=>label($business['suburb']??$business['city']??$business['address']??'',120),
    'photoUrl'=>publicUrl(label($business['logoUrl']??'',300)),
    'latitude'=>$approxLat,'longitude'=>$approxLng,
    'pickupEnabled'=>$pickupEnabled,'deliveryEnabled'=>$deliveryEnabled,
    'listingPlan'=>$subscriptionPlan,'sponsored'=>$sponsored,
    'shopCategory'=>$shopperType,'services'=>['cardPayments'=>$cardPayments,'cashback'=>$cashback],
    'deliveryFeeCents'=>$deliveryEnabled?(int)round(max(0,(float)($settings['baseDeliveryFee']??0))*100):0,
    'whatsappPhone'=>$publicPhone,'products'=>$products
  ];
}
usort($shops,fn($a,$b)=>(int)$b['sponsored']<=>(int)$a['sponsored'] ?: strnatcasecmp($a['name'],$b['name']));
echo json_encode(['ok'=>true,'version'=>1,'shops'=>$shops,'count'=>count($shops)],JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);
