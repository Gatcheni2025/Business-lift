<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const FIREBASE_API_KEY = 'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';

function respond(int $status, array $data): never { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_SLASHES); exit; }
function bearer(): string { $h=$_SERVER['HTTP_AUTHORIZATION']??''; return preg_match('/^Bearer\s+(.+)$/i',$h,$m)?trim($m[1]):''; }
function verifyFirebase(string $token): array {
  if (!$token) respond(401,['ok'=>false,'error'=>'Authentication required']);
  $url='https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.rawurlencode(FIREBASE_API_KEY);
  $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['idToken'=>$token]),CURLOPT_TIMEOUT=>12]);
  $raw=curl_exec($ch); $code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch);
  $json=json_decode((string)$raw,true);
  if ($code!==200 || empty($json['users'][0]['localId'])) respond(401,['ok'=>false,'error'=>'Your session is no longer valid. Please sign in again.']);
  return $json['users'][0];
}
function dataDir(): string {
  $dir=dirname(__DIR__).'/../private_html/teyza-data';
  if (!is_dir($dir) && !mkdir($dir,0750,true) && !is_dir($dir)) respond(500,['ok'=>false,'error'=>'Workspace storage is unavailable']);
  return $dir;
}
function pathFor(string $uid): string { return dataDir().'/'.preg_replace('/[^A-Za-z0-9_-]/','',$uid).'.json'; }
function loadWorkspace(array $firebase): array {
  $uid=$firebase['localId']; $path=pathFor($uid);
  if (is_file($path)) { $saved=json_decode((string)file_get_contents($path),true); if(is_array($saved)) return $saved; }
  $name=trim((string)($firebase['displayName']??''));
  $workspace=['uid'=>$uid,'email'=>$firebase['email']??'','firstName'=>$name?explode(' ',$name)[0]:'','business'=>['businessId'=>'TZ_'.strtoupper(substr(hash('sha256',$uid),0,8)),'businessName'=>'Your Teyza Store','profileComplete'=>false],'orders'=>[],'products'=>[],'createdAt'=>gmdate('c')];
  file_put_contents($path,json_encode($workspace,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX); return $workspace;
}
function saveWorkspace(array $firebase,array $workspace): void { file_put_contents(pathFor($firebase['localId']),json_encode($workspace,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX); }

$user=verifyFirebase(bearer()); $workspace=loadWorkspace($user); $action=$_GET['action']??'context';
if ($_SERVER['REQUEST_METHOD']==='POST' && $action==='bootstrap') {
  $input=json_decode((string)file_get_contents('php://input'),true)?:[];
  if (!empty($input['firstName'])) $workspace['firstName']=trim((string)$input['firstName']);
  if (!empty($input['businessName'])) $workspace['business']['businessName']=trim((string)$input['businessName']);
  foreach(['businessType','industry','country'] as $key) if(isset($input[$key])) $workspace['business'][$key]=trim((string)$input[$key]);
  saveWorkspace($user,$workspace);
}
if ($action==='summary') respond(200,['ok'=>true,'business'=>$workspace['business'],'firstName'=>$workspace['firstName'],'orders'=>$workspace['orders']??[],'products'=>$workspace['products']??[],'settings'=>$workspace['settings']??[]]);
if ($action==='section') {
  $section=preg_replace('/[^A-Za-z0-9_-]/','',(string)($_GET['section']??''));
  if(!$section) respond(422,['ok'=>false,'error'=>'Section is required']);
  if($_SERVER['REQUEST_METHOD']==='POST'){
    $input=json_decode((string)file_get_contents('php://input'),true)?:[];
    $workspace['settings']=$workspace['settings']??[];$workspace['settings'][$section]=$input;
    saveWorkspace($user,$workspace); respond(200,['ok'=>true,'section'=>$section,'data'=>$input]);
  }
  respond(200,['ok'=>true,'section'=>$section,'data'=>$workspace['settings'][$section]??[]]);
}
if ($action==='business' && $_SERVER['REQUEST_METHOD']==='POST') {
  $input=json_decode((string)file_get_contents('php://input'),true)?:[];
  $allowed=['businessName','businessType','industry','country','phone','address','about','profileComplete','setupProgress'];
  foreach($allowed as $key) if(array_key_exists($key,$input)) $workspace['business'][$key]=$input[$key];
  $workspace['business']['updatedAt']=gmdate('c'); saveWorkspace($user,$workspace);
  respond(200,['ok'=>true,'business'=>$workspace['business']]);
}
if ($action==='product') {
  $productId=trim((string)($_GET['productId']??'')); if(!$productId) respond(422,['ok'=>false,'error'=>'Product is required']);
  $index=-1; foreach(($workspace['products']??[]) as $i=>$item) if(($item['id']??'')===$productId){$index=$i;break;} if($index<0) respond(404,['ok'=>false,'error'=>'Product not found']);
  if($_SERVER['REQUEST_METHOD']==='DELETE'){array_splice($workspace['products'],$index,1);saveWorkspace($user,$workspace);respond(200,['ok'=>true]);}
  if($_SERVER['REQUEST_METHOD']==='POST'){
    $input=json_decode((string)file_get_contents('php://input'),true)?:[];$product=$workspace['products'][$index];
    foreach(['name','sku','category','brand','condition','desc','targetArea','targetLat','targetLng','targetGender'] as $key) if(array_key_exists($key,$input))$product[$key]=trim((string)$input[$key]);
    foreach(['price','costPrice'] as $key) if(array_key_exists($key,$input))$product[$key]=(float)$input[$key]; if(array_key_exists('stock',$input))$product['stock']=(int)$input['stock'];
    if(array_key_exists('targetPopulation',$input))$product['targetPopulation']=max(5000,min(1000000,(int)$input['targetPopulation']));
    if(isset($input['channels'])&&is_array($input['channels'])){$allowed=['facebook','instagram','x','whatsapp','tiktok','google'];$product['channels']=array_values(array_intersect($allowed,$input['channels']));$product['publishing']=array_reduce($product['channels'],function($out,$channel){$out[$channel]=['status'=>'waiting_verification','externalId'=>null,'lastSyncedAt'=>null,'error'=>null];return $out;},[]);}
    $pop=(int)($product['targetPopulation']??50000);$product['reachFee']=$pop<=50000?0:($pop<=100000?50:($pop<=250000?100:($pop<=500000?200:350)));$product['verificationStatus']='pending';$product['verificationNote']='Awaiting Teyza review';$product['updatedAt']=gmdate('c');$workspace['products'][$index]=$product;saveWorkspace($user,$workspace);respond(200,['ok'=>true,'product'=>$product]);
  }
  respond(405,['ok'=>false,'error'=>'Method not allowed']);
}
if ($action==='publishing') {
  $productId=trim((string)($_GET['productId']??''));
  if(!$productId) respond(422,['ok'=>false,'error'=>'Product is required']);
  $index=-1; foreach(($workspace['products']??[]) as $i=>$p) if(($p['id']??'')===$productId){$index=$i;break;}
  if($index<0) respond(404,['ok'=>false,'error'=>'Product not found']);
  $product=$workspace['products'][$index]; $channels=$product['channels']??[];
  if(!isset($product['publishing'])||!is_array($product['publishing'])) $product['publishing']=[];
  foreach($channels as $channel) if(!isset($product['publishing'][$channel])) $product['publishing'][$channel]=['status'=>'waiting_verification','externalId'=>null,'lastSyncedAt'=>null,'error'=>null];
  if($_SERVER['REQUEST_METHOD']==='POST'){
    $input=json_decode((string)file_get_contents('php://input'),true)?:[];
    $channel=preg_replace('/[^a-z0-9_-]/','',strtolower((string)($input['channel']??'')));
    if(!in_array($channel,$channels,true)) respond(422,['ok'=>false,'error'=>'Channel is not selected for this product']);
    $allowed=['queued','publishing','published','error','setup_required','waiting_verification'];
    $status=(string)($input['status']??'queued'); if(!in_array($status,$allowed,true)) $status='queued';
    $product['publishing'][$channel]=['status'=>$status,'externalId'=>$input['externalId']??null,'lastSyncedAt'=>in_array($status,['published','error'],true)?gmdate('c'):null,'error'=>$input['error']??null];
    $workspace['products'][$index]=$product; saveWorkspace($user,$workspace);
  }
  respond(200,['ok'=>true,'productId'=>$productId,'publishing'=>$product['publishing']]);
}
if ($action==='orders') {
  if($_SERVER['REQUEST_METHOD']==='POST'){
    $input=json_decode((string)file_get_contents('php://input'),true)?:[];
    $productId=trim((string)($input['productId']??''));$customerId=trim((string)($input['customerId']??''));$quantity=max(1,(int)($input['quantity']??1));
    $product=null;foreach(($workspace['products']??[]) as $p)if(($p['id']??'')===$productId){$product=$p;break;}
    if(!$product)respond(422,['ok'=>false,'error'=>'Select a valid product']);if(!$customerId)respond(422,['ok'=>false,'error'=>'Customer is required']);
    $shipping=max(0,(float)($input['shipping']??0));$tax=max(0,(float)($input['tax']??0));$subtotal=(float)($product['price']??0)*$quantity;
    $order=['id'=>'ord_'.bin2hex(random_bytes(5)),'orderNumber'=>'#TZ-'.strtoupper(substr(bin2hex(random_bytes(4)),0,6)),'customerId'=>$customerId,'customerName'=>$customerId,'items'=>[['productId'=>$productId,'name'=>$product['name']??'Product','quantity'=>$quantity,'price'=>(float)($product['price']??0)]],'subtotal'=>$subtotal,'shipping'=>$shipping,'tax'=>$tax,'total'=>$subtotal+$shipping+$tax,'paymentStatus'=>(string)($input['paymentStatus']??'pending'),'orderStatus'=>(string)($input['orderStatus']??'new'),'createdAt'=>gmdate('c'),'updatedAt'=>gmdate('c')];
    $workspace['orders']=$workspace['orders']??[];array_unshift($workspace['orders'],$order);saveWorkspace($user,$workspace);respond(200,['ok'=>true,'order'=>$order]);
  }
  respond(200,['ok'=>true,'orders'=>$workspace['orders']??[],'products'=>$workspace['products']??[]]);
}
respond(200,['ok'=>true,'businessId'=>$workspace['business']['businessId'],'business'=>$workspace['business'],'userData'=>['firstName'=>$workspace['firstName'],'email'=>$workspace['email']]]);
