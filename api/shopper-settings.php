<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function output(int $code,array $payload): never {
 http_response_code($code);
 echo json_encode($payload,JSON_UNESCAPED_SLASHES);
 exit;
}
function token(): string {
 $auth=$_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'';
 if (!$auth && function_exists('getallheaders'))
   foreach (getallheaders() as $key=>$val) if (strtolower($key)==='authorization') $auth=$val;
 return preg_match('/^Bearer\s+(.+)$/i',$auth,$m)?trim($m[1]):'';
}
require_once __DIR__.'/teyza-firebase-verify.php';
$user=teyzaVerifiedFirebaseUser(token());
$uid=(string)($user['localId']??'');
if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/D',$uid))
 output(401,['ok'=>false,'error'=>'Sign in to your Teyza shop.']);
$directory=dirname(__DIR__).'/../private_html/teyza-data';
$path=$directory.'/'.$uid.'.json';
if (!is_file($path)) output(404,['ok'=>false,'error'=>'Shop profile not found.']);
$fp=fopen($path,'c+');
if (!$fp || !flock($fp,LOCK_EX)) output(503,['ok'=>false,'error'=>'Shop record is busy. Try again.']);
$raw=stream_get_contents($fp);
$workspace=json_decode((string)$raw,true);
if (!is_array($workspace)) output(500,['ok'=>false,'error'=>'Shop record is unavailable.']);
$business=$workspace['business']??[];
$approval=(string)($workspace['companyApproval']['status']??'pending');
$method=$_SERVER['REQUEST_METHOD']??'GET';
if ($method==='GET') {
 output(200,['ok'=>true,'approved'=>$approval==='approved',
  'approvalStatus'=>$approval,'shopperEnabled'=>($business['shopperEnabled']??false)===true,
  'shopperWhatsAppOptIn'=>($business['shopperWhatsAppOptIn']??false)===true,
  'shopperLocationOptIn'=>($business['shopperLocationOptIn']??false)===true,
  'productsVisible'=>count(array_filter($workspace['products']??[],
    static fn($p)=>is_array($p)&&($p['marketplaceVisible']??false)===true&&(int)($p['stock']??0)>0))]);
}
if ($method!=='POST') output(405,['ok'=>false,'error'=>'Method not allowed']);
$input=json_decode((string)file_get_contents('php://input'),true);
if (!is_array($input)) output(400,['ok'=>false,'error'=>'Invalid request']);
$enable=($input['shopperEnabled']??false)===true;
$whatsapp=($input['shopperWhatsAppOptIn']??false)===true;
$locationOptIn=($input['shopperLocationOptIn']??false)===true;
if ($enable && $approval!=='approved') {
 output(403,['ok'=>false,'error'=>'Teyza must approve your shop before it appears in the shopper app.']);
}
if ($enable && (trim((string)($business['businessName']??''))==='' ||
  trim((string)($business['address']??''))==='' ||
  trim((string)($business['phone']??''))==='')) {
 output(422,['ok'=>false,'error'=>'Enter your shop name, address and business phone first.']);
}
if ($whatsapp && !$enable) output(422,['ok'=>false,'error'=>'Enable your shop listing before WhatsApp requests.']);
$business['shopperEnabled']=$enable;
$business['shopperWhatsAppOptIn']=$whatsapp && $enable;
$business['shopperLocationOptIn']=$locationOptIn && $enable;
$business['updatedAt']=gmdate('c');
$workspace['business']=$business;
$published=0;
foreach (($workspace['products']??[]) as $index=>$product) {
 if (!is_array($product)) continue;
 // Explicit merchant action after admin approves the shop. Never publish zero-priced or invalid stock.
 $price=(float)($product['price']??0);
 $stock=(int)($product['stock']??0);
 $valid=($price>0 && $price<=100000 && $stock>=0 && trim((string)($product['name']??''))!=='');
 $workspace['products'][$index]['marketplaceVisible']=$enable && $valid;
 if ($enable && $valid) {
   $workspace['products'][$index]['verificationStatus']='published';
   $published++;
 }
}
$encoded=json_encode($workspace,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);
if ($encoded===false || ftruncate($fp,0)===false || rewind($fp)===false ||
    fwrite($fp,$encoded)===false || fflush($fp)===false) {
 output(500,['ok'=>false,'error'=>'Could not save shopper settings']);
}
flock($fp,LOCK_UN); fclose($fp);
output(200,['ok'=>true,'shopperEnabled'=>$enable,'shopperWhatsAppOptIn'=>$whatsapp&&$enable,
 'shopperLocationOptIn'=>$locationOptIn&&$enable,'publishedProducts'=>$published]);
