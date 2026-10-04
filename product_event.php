<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out(int $code,array $body): never {
  http_response_code($code);
  echo json_encode($body,JSON_UNESCAPED_SLASHES);
  exit;
}
if($_SERVER['REQUEST_METHOD']!=='POST')out(405,['ok'=>false,'error'=>'POST required']);

$raw=(string)file_get_contents('php://input');
$input=json_decode($raw,true);
if(!is_array($input))$input=$_POST;

$businessId=trim((string)($input['businessId']??''));
$productId=trim((string)($input['productId']??''));
$event=strtolower(trim((string)($input['event']??'view')));
$allowed=['view','click','enquiry','add_to_cart'];

if($businessId===''||$productId===''||!in_array($event,$allowed,true)){
  out(422,['ok'=>false,'error'=>'Valid businessId, productId and event are required']);
}

$dataDir=__DIR__.'/../private_html/teyza-data';
if(!is_dir($dataDir))out(503,['ok'=>false,'error'=>'Analytics storage unavailable']);

$path=null;$workspace=null;$productIndex=-1;
foreach(glob($dataDir.'/*.json')?:[] as $candidate){
  $saved=json_decode((string)file_get_contents($candidate),true);
  if(!is_array($saved))continue;
  if((string)($saved['business']['businessId']??'')!==$businessId)continue;
  foreach(($saved['products']??[]) as $i=>$product){
    if((string)($product['id']??'')===$productId){$path=$candidate;$workspace=$saved;$productIndex=$i;break 2;}
  }
}
if(!$workspace||$productIndex<0)out(404,['ok'=>false,'error'=>'Product not found']);

$product=$workspace['products'][$productIndex];
$status=strtolower((string)($product['verificationStatus']??'pending'));
if(!in_array($status,['approved','active'],true))out(409,['ok'=>false,'error'=>'Product is not published']);

$date=gmdate('Y-m-d');
$product['analytics']=$product['analytics']??[];
$product['analytics']['teyza']=$product['analytics']['teyza']??[];
$product['analytics']['teyza']['daily']=$product['analytics']['teyza']['daily']??[];
$day=$product['analytics']['teyza']['daily'][$date]??[
  'views'=>0,'uniqueViews'=>0,'clicks'=>0,'enquiries'=>0,'addToCart'=>0,'visitors'=>[]
];

if($event==='view'){
  $day['views']=(int)($day['views']??0)+1;
  $ip=(string)($_SERVER['REMOTE_ADDR']??'');
  $ua=substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,300);
  $visitor=hash('sha256',$businessId.'|'.$productId.'|'.$date.'|'.$ip.'|'.$ua);
  $visitors=is_array($day['visitors']??null)?$day['visitors']:[];
  if(!isset($visitors[$visitor])){
    $day['uniqueViews']=(int)($day['uniqueViews']??0)+1;
    if(count($visitors)<10000)$visitors[$visitor]=1;
  }
  $day['visitors']=$visitors;
}elseif($event==='click'){
  $day['clicks']=(int)($day['clicks']??0)+1;
}elseif($event==='enquiry'){
  $day['enquiries']=(int)($day['enquiries']??0)+1;
}elseif($event==='add_to_cart'){
  $day['addToCart']=(int)($day['addToCart']??0)+1;
}

$product['analytics']['teyza']['daily'][$date]=$day;
$product['analytics']['teyza']['updatedAt']=gmdate('c');
$workspace['products'][$productIndex]=$product;

$encoded=json_encode($workspace,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
if(file_put_contents($path,$encoded,LOCK_EX)===false)out(500,['ok'=>false,'error'=>'Unable to save analytics']);
out(200,['ok'=>true]);
