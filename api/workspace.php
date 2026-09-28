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
  $workspace=['uid'=>$uid,'email'=>$firebase['email']??'','firstName'=>$name?explode(' ',$name)[0]:'','business'=>['businessId'=>'TZ_'.strtoupper(substr(hash('sha256',$uid),0,8)),'businessName'=>'','profileComplete'=>false],'orders'=>[],'products'=>[],'createdAt'=>gmdate('c')];
  file_put_contents($path,json_encode($workspace,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX); return $workspace;
}
function saveWorkspace(array $firebase,array $workspace): void { file_put_contents(pathFor($firebase['localId']),json_encode($workspace,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX); }
function companyApproval(array $workspace): array {$a=$workspace['companyApproval']??[];return ['status'=>$a['status']??'pending','submittedAt'=>$a['submittedAt']??null,'reviewedAt'=>$a['reviewedAt']??null,'note'=>$a['note']??''];}
function adminRegistry(): array {$path=dirname(__DIR__).'/../private_html/teyza-admins.json';$saved=is_file($path)?json_decode((string)file_get_contents($path),true):[];$admins=is_array($saved)?$saved:[];$bootstrap='admin@teyza.co.za';$exists=false;foreach($admins as $a){if(strtolower((string)($a['email']??''))===$bootstrap){$exists=true;break;}}if(!$exists)$admins[]=['email'=>$bootstrap,'role'=>'super_admin','active'=>true,'bootstrap'=>true];return $admins;}
function adminRole(array $firebase): ?string {$email=strtolower(trim((string)($firebase['email']??'')));if($email==='admin@teyza.co.za')return 'super_admin';foreach(adminRegistry() as $a){if(!empty($a['active'])&&strtolower(trim((string)($a['email']??'')))===$email)return (string)($a['role']??'admin');}$configured=array_filter(array_map('trim',explode(',',strtolower((string)(getenv('TEYZA_ADMIN_EMAILS')?:'')))));return in_array($email,$configured,true)?'super_admin':null;}
function isAdmin(array $firebase): bool {return adminRole($firebase)!==null;}
function saveAdminRegistry(array $admins): void {$path=dirname(__DIR__).'/../private_html/teyza-admins.json';file_put_contents($path,json_encode($admins,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);}
function loadAllSellers(): array {$out=[];foreach(glob(dataDir().'/*.json')?:[] as $path){$w=json_decode((string)file_get_contents($path),true);if(!is_array($w))continue;$out[]=['uid'=>$w['uid']??basename($path,'.json'),'email'=>$w['email']??'','business'=>$w['business']??[],'verification'=>verificationState($w,[]),'companyApproval'=>companyApproval($w),'createdAt'=>$w['createdAt']??null];}return $out;}
function sameAddress(string $a,string $b): bool {return $a!==''&&$b!==''&&strtolower(preg_replace('/\s+/u',' ',trim($a)))===strtolower(preg_replace('/\s+/u',' ',trim($b)));}
function canonicalPhone(string $phone): string {$digits=preg_replace('/\D+/','',$phone);return preg_match('/^0\d{9}$/',$digits)?'27'.substr($digits,1):$digits;}

$user=verifyFirebase(bearer()); $workspace=loadWorkspace($user); $action=$_GET['action']??'context';
function verificationState(array $workspace,array $user): array {
  $v=$workspace['verification']??[];$business=$workspace['business']??[];
  $savedPhone=canonicalPhone((string)($business['phone']??''));$firebasePhone=canonicalPhone((string)($user['phoneNumber']??''));
  $storedPhone=canonicalPhone((string)($v['phone']['phone']??''));
  $phoneVerified=$savedPhone!==''&&(($savedPhone===$firebasePhone)||(!empty($v['phone']['verified'])&&$savedPhone===$storedPhone));
  $locationConfirmed=!empty($v['location']['confirmed'])&&isset($v['location']['lat'],$v['location']['lng'])&&sameAddress((string)($business['address']??''),(string)($v['location']['address']??''));
  $proofUploaded=!empty($v['proofOfAddress']['storedName']);
  $proofAddressMatchVerified=$proofUploaded&&!empty($v['proofOfAddress']['addressMatchVerified']);
  $identityVerified=!empty($v['identity']['verified']);
  $identityStatus=(string)($v['identity']['status']??($identityVerified?'verified':'not_submitted'));
  $identitySubmitted=!empty($v['identity']['submittedAt'])&&in_array($identityStatus,['pending','verified'],true);
  $completed=(int)$phoneVerified+(int)$identitySubmitted+(int)$locationConfirmed+(int)$proofUploaded;
  return [
    'phoneVerified'=>$phoneVerified,
    'phoneVerifiedAt'=>$v['phone']['verifiedAt']??null,
    'identityVerified'=>$identityVerified,
    'identitySubmitted'=>$identitySubmitted,
    'identityStatus'=>$identityStatus,
    'locationConfirmed'=>$locationConfirmed,
    'proofOfAddressUploaded'=>$proofUploaded,
    'proofAddressMatchVerified'=>$proofAddressMatchVerified,
    'proofAddressMatchStatus'=>$v['proofOfAddress']['matchStatus']??($proofUploaded?'pending_review':'not_uploaded'),
    'completed'=>$completed,
    'total'=>4,
    'location'=>$v['location']??null,
    'proofOfAddress'=>isset($v['proofOfAddress'])?[
      'uploadedAt'=>$v['proofOfAddress']['uploadedAt']??null,
      'originalName'=>$v['proofOfAddress']['originalName']??'Document uploaded',
      'addressAtUpload'=>$v['proofOfAddress']['addressAtUpload']??null,
      'matchStatus'=>$v['proofOfAddress']['matchStatus']??'pending_review',
      'addressMatchVerified'=>!empty($v['proofOfAddress']['addressMatchVerified']),
    ]:null
  ];
}
if($action==='verification'){
  if($_SERVER['REQUEST_METHOD']==='POST'){
    $input=json_decode((string)file_get_contents('php://input'),true)?:[];$type=(string)($input['type']??'');
    if($type==='phone'){
      $phone=trim((string)($input['phone']??''));
      $phoneToken=trim((string)($_SERVER['HTTP_X_PHONE_VERIFICATION_TOKEN']??''));
      if($phone===''||$phoneToken==='')respond(422,['ok'=>false,'error'=>'Verified phone proof is required']);
      $phoneUser=verifyFirebase($phoneToken);
      $verifiedPhone=canonicalPhone((string)($phoneUser['phoneNumber']??''));
      $requestedPhone=canonicalPhone($phone);
      if($verifiedPhone===''||$requestedPhone===''||$verifiedPhone!==$requestedPhone)respond(422,['ok'=>false,'error'=>'The verified SMS number does not match the business phone number']);
      $workspace['verification']=$workspace['verification']??[];
      $workspace['verification']['phone']=['verified'=>true,'phone'=>$phone,'verifiedAt'=>gmdate('c')];
      $workspace['business']['phone']=$phone;
      saveWorkspace($user,$workspace);
    }
    if($type==='location'){
      $lat=filter_var($input['lat']??null,FILTER_VALIDATE_FLOAT);$lng=filter_var($input['lng']??null,FILTER_VALIDATE_FLOAT);$address=trim((string)($input['address']??''));
      if($lat===false||$lng===false||$lat < -90||$lat > 90||$lng < -180||$lng > 180||$address==='')respond(422,['ok'=>false,'error'=>'Choose a valid map location and address']);
      $workspace['verification']=$workspace['verification']??[];$workspace['verification']['location']=['confirmed'=>true,'lat'=>$lat,'lng'=>$lng,'address'=>$address,'confirmedAt'=>gmdate('c')];$workspace['business']['address']=$address;
      if(!empty($workspace['verification']['proofOfAddress']['storedName'])){
        $workspace['verification']['proofOfAddress']['addressMatchVerified']=false;
        $workspace['verification']['proofOfAddress']['matchStatus']='pending_review';
      }
      if(isset($workspace['settings']['delivery'])){$workspace['settings']['delivery']['pickupAddress']=$address;$workspace['settings']['delivery']['pickupLocation']=['lat'=>$lat,'lng'=>$lng];}
      saveWorkspace($user,$workspace);
    }
  }
  respond(200,['ok'=>true,'verification'=>verificationState($workspace,$user)]);
}
if ($_SERVER['REQUEST_METHOD']==='POST' && $action==='bootstrap') {
  $input=json_decode((string)file_get_contents('php://input'),true)?:[];
  if (!empty($input['firstName'])) $workspace['firstName']=trim((string)$input['firstName']);
  if (!empty($input['businessName'])) $workspace['business']['businessName']=trim((string)$input['businessName']);
  foreach(['businessType','industry','country'] as $key) if(isset($input[$key])) $workspace['business'][$key]=trim((string)$input[$key]);
  saveWorkspace($user,$workspace);
}
if($action==='company-approval'){if($_SERVER['REQUEST_METHOD']==='POST'){$input=json_decode((string)file_get_contents('php://input'),true)?:[];if(($input['intent']??'')==='submit'){$workspace['companyApproval']=$workspace['companyApproval']??[];$workspace['companyApproval']['status']='pending';$workspace['companyApproval']['submittedAt']=gmdate('c');$workspace['companyApproval']['reviewedAt']=null;$workspace['companyApproval']['note']='';saveWorkspace($user,$workspace);}}respond(200,['ok'=>true,'companyApproval'=>companyApproval($workspace)]);}
if($action==='admin-session'){if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'This account does not have Teyza administrator access.']);respond(200,['ok'=>true,'admin'=>['email'=>$user['email']??'','name'=>$user['displayName']??'Teyza Admin','role'=>adminRole($user)]]);}
if($action==='admin-overview'){if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'Admin access required']);$s=loadAllSellers();$products=0;$orders=0;$pending=0;foreach($s as $seller){$path=pathFor($seller['uid']);$w=is_file($path)?json_decode((string)file_get_contents($path),true):[];$products+=count($w['products']??[]);$orders+=count($w['orders']??[]);if(($seller['companyApproval']['status']??'pending')==='pending')$pending++;}respond(200,['ok'=>true,'stats'=>['sellers'=>count($s),'pendingSellers'=>$pending,'products'=>$products,'orders'=>$orders],'recentSellers'=>array_slice($s,0,6)]);}
if($action==='admin-users'){if(adminRole($user)!=='super_admin')respond(403,['ok'=>false,'error'=>'Super Admin access required']);if($_SERVER['REQUEST_METHOD']==='POST'){$input=json_decode((string)file_get_contents('php://input'),true)?:[];$email=strtolower(trim((string)($input['email']??'')));$role=in_array(($input['role']??''),['admin','super_admin'],true)?$input['role']:'admin';if(!filter_var($email,FILTER_VALIDATE_EMAIL))respond(422,['ok'=>false,'error'=>'Enter a valid admin email']);$admins=adminRegistry();$found=false;foreach($admins as &$entry){if(strtolower((string)($entry['email']??''))===$email){$entry['role']=$role;$entry['active']=true;$found=true;break;}}unset($entry);if(!$found)$admins[]=['email'=>$email,'role'=>$role,'active'=>true,'createdAt'=>gmdate('c'),'createdBy'=>$user['email']??''];saveAdminRegistry($admins);}respond(200,['ok'=>true,'admins'=>adminRegistry()]);}
if($action==='admin-sellers'){if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'Admin access required']);respond(200,['ok'=>true,'sellers'=>loadAllSellers()]);}
if($action==='admin-identity'){if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'Admin access required']);if($_SERVER['REQUEST_METHOD']!=='POST')respond(405,['ok'=>false,'error'=>'Method not allowed']);$input=json_decode((string)file_get_contents('php://input'),true)?:[];$uid=preg_replace('/[^A-Za-z0-9_-]/','',(string)($input['uid']??''));$decision=(string)($input['status']??'');if(!$uid||!in_array($decision,['verified','rejected'],true))respond(422,['ok'=>false,'error'=>'Valid seller and identity decision required']);$path=pathFor($uid);if(!is_file($path))respond(404,['ok'=>false,'error'=>'Seller not found']);$target=json_decode((string)file_get_contents($path),true);if(empty($target['verification']['identity']['submittedAt']))respond(422,['ok'=>false,'error'=>'Seller has not submitted identity verification']);$target['verification']['identity']['status']=$decision;$target['verification']['identity']['verified']=$decision==='verified';$target['verification']['identity']['reviewedAt']=gmdate('c');$target['verification']['identity']['reviewedBy']=$user['email']??'admin';$target['verification']['identity']['note']=trim((string)($input['note']??''));file_put_contents($path,json_encode($target,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);respond(200,['ok'=>true]);}
if($action==='admin-address-proof'){
  if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'Admin access required']);
  if($_SERVER['REQUEST_METHOD']!=='POST')respond(405,['ok'=>false,'error'=>'Method not allowed']);
  $input=json_decode((string)file_get_contents('php://input'),true)?:[];
  $uid=preg_replace('/[^A-Za-z0-9_-]/','',(string)($input['uid']??''));
  $matches=filter_var($input['matches']??null,FILTER_VALIDATE_BOOLEAN,FILTER_NULL_ON_FAILURE);
  if(!$uid||$matches===null)respond(422,['ok'=>false,'error'=>'Seller and address decision are required']);
  $path=pathFor($uid);if(!is_file($path))respond(404,['ok'=>false,'error'=>'Seller not found']);
  $target=json_decode((string)file_get_contents($path),true);
  if(empty($target['verification']['proofOfAddress']['storedName'])||empty($target['verification']['location']['confirmed']))respond(422,['ok'=>false,'error'=>'Seller must upload proof of address and confirm the map location first']);
  $mapAddress=(string)($target['verification']['location']['address']??'');
  $uploadAddress=(string)($target['verification']['proofOfAddress']['addressAtUpload']??'');
  if(!sameAddress($mapAddress,$uploadAddress))respond(422,['ok'=>false,'error'=>'The map address changed after this proof was uploaded. Ask the seller to upload proof again']);
  $target['verification']['proofOfAddress']['addressMatchVerified']=$matches;
  $target['verification']['proofOfAddress']['matchStatus']=$matches?'verified':'mismatch';
  $target['verification']['proofOfAddress']['reviewedAt']=gmdate('c');
  $target['verification']['proofOfAddress']['reviewedBy']=$user['email']??'admin';
  $target['verification']['proofOfAddress']['reviewNote']=trim((string)($input['note']??''));
  if(!$matches){
    $target['companyApproval']=$target['companyApproval']??[];
    $target['companyApproval']['status']='pending';
    $target['companyApproval']['note']='Proof of address does not match the confirmed map address';
  }
  file_put_contents($path,json_encode($target,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);
  respond(200,['ok'=>true,'verification'=>verificationState($target,[])]);
}
if($action==='admin-catalog'){if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'Admin access required']);$products=[];$orders=[];foreach(glob(dataDir().'/*.json')?:[] as $path){$w=json_decode((string)file_get_contents($path),true);if(!is_array($w))continue;$seller=['uid'=>$w['uid']??basename($path,'.json'),'businessName'=>$w['business']['businessName']??'Unnamed business','email'=>$w['email']??''];foreach(($w['products']??[]) as $p)$products[]=array_merge($p,['seller'=>$seller]);foreach(($w['orders']??[]) as $o)$orders[]=array_merge($o,['seller'=>$seller]);}respond(200,['ok'=>true,'products'=>$products,'orders'=>$orders]);}
if($action==='admin-approval'){if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'Admin access required']);if($_SERVER['REQUEST_METHOD']!=='POST')respond(405,['ok'=>false,'error'=>'Method not allowed']);$input=json_decode((string)file_get_contents('php://input'),true)?:[];$uid=preg_replace('/[^A-Za-z0-9_-]/','',(string)($input['uid']??''));$status=(string)($input['status']??'');if(!$uid||!in_array($status,['approved','rejected'],true))respond(422,['ok'=>false,'error'=>'Seller and valid decision are required']);$path=pathFor($uid);if(!is_file($path))respond(404,['ok'=>false,'error'=>'Seller not found']);$target=json_decode((string)file_get_contents($path),true);
if($status==='approved'){
  $v=verificationState($target,[]);
  if(empty($v['phoneVerified']))respond(422,['ok'=>false,'error'=>'Verify the seller phone before approval']);
  if(empty($v['identityVerified']))respond(422,['ok'=>false,'error'=>'Approve the seller identity before company approval']);
  if(empty($v['locationConfirmed']))respond(422,['ok'=>false,'error'=>'The seller must confirm the business location on the map']);
  if(empty($v['proofOfAddressUploaded']))respond(422,['ok'=>false,'error'=>'The seller must upload proof of address']);
  if(empty($v['proofAddressMatchVerified']))respond(422,['ok'=>false,'error'=>'Confirm that the proof of address matches the map address before approval']);
}
$target['companyApproval']=['status'=>$status,'submittedAt'=>$target['companyApproval']['submittedAt']??null,'reviewedAt'=>gmdate('c'),'reviewedBy'=>$user['email']??'admin','note'=>trim((string)($input['note']??''))];file_put_contents($path,json_encode($target,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);respond(200,['ok'=>true,'companyApproval'=>companyApproval($target)]);}
if ($action==='seller-readiness') {
  $business=$workspace['business']??[];$required=['businessName','businessType','industry','country','phone','address','about'];$missing=[];foreach($required as $key)if(trim((string)($business[$key]??''))===''||($key==='businessName'&&trim((string)($business[$key]??''))==='Your Teyza Store'))$missing[]=$key;
  $settings=$workspace['settings']??[];$verification=verificationState($workspace,$user);
  if($_SERVER['REQUEST_METHOD']==='POST'){$input=json_decode((string)file_get_contents('php://input'),true)?:[];if(array_key_exists('deliveryComplete',$input))$workspace['setupFlow']['deliveryComplete']=!empty($input['deliveryComplete']);if(array_key_exists('paymentComplete',$input))$workspace['setupFlow']['paymentComplete']=!empty($input['paymentComplete']);if(array_key_exists('sellerSetupComplete',$input))$workspace['sellerSetupComplete']=!empty($input['sellerSetupComplete']);saveWorkspace($user,$workspace);$settings=$workspace['settings']??[];}
  // A confirmed map location may fill the address after the profile was last saved.
  // Derive readiness from the saved fields and checks, not a stale client flag.
  $businessComplete=empty($missing)&&((int)($verification['completed']??0)>=4);
  $deliveryComplete=in_array(($settings['delivery']['fulfilmentMode']??''),['courier','own_driver','pickup','digital'],true)
    &&isset($settings['delivery']['baseDeliveryFee'])&&is_numeric($settings['delivery']['baseDeliveryFee'])&&(float)$settings['delivery']['baseDeliveryFee']>=0
    &&!empty($verification['locationConfirmed'])&&sameAddress((string)($settings['delivery']['pickupAddress']??''),(string)($verification['location']['address']??''));
  $bank=$settings['banking']??[];$gateway=$settings['payfast']??[];$other=$settings['paymentPreferences']??[];
  $paymentComplete=(trim((string)($bank['bankName']??''))!==''&&trim((string)($bank['accountHolder']??''))!==''&&(trim((string)($bank['accountNumber']??''))!==''||trim((string)($bank['accountNumberLast4']??''))!==''))
    ||(trim((string)($gateway['merchantId']??''))!==''&&trim((string)($gateway['merchantKey']??''))!=='')
    ||trim((string)($other['otherGateway']??''))!=='';
  $approval=companyApproval($workspace);
  // Selling unlocks after Teyza has approved the verified seller. Delivery and
  // banking remain independent app tabs so sellers can configure them when needed.
  $productReady=$businessComplete&&(($approval['status']??'pending')==='approved');
  $steps=(int)$businessComplete+(int)$deliveryComplete+(int)$paymentComplete;
  respond(200,['ok'=>true,'businessComplete'=>$businessComplete,'businessVerification'=>$verification,'companyApproval'=>$approval,'deliveryComplete'=>$deliveryComplete,'paymentComplete'=>$paymentComplete,'productReady'=>$productReady,'sellerSetupComplete'=>$productReady,'sellerSetupCompletedSteps'=>$steps,'sellerSetupTotalSteps'=>3,'missingBusinessFields'=>$missing]);
}
if ($action==='summary') respond(200,['ok'=>true,'business'=>$workspace['business'],'firstName'=>$workspace['firstName'],'orders'=>$workspace['orders']??[],'products'=>$workspace['products']??[],'settings'=>$workspace['settings']??[]]);
if ($action==='section') {
  $section=preg_replace('/[^A-Za-z0-9_-]/','',(string)($_GET['section']??($_SERVER['HTTP_X_WORKSPACE_SECTION']??'')));
  if(!$section) respond(422,['ok'=>false,'error'=>'Section is required']);
  if($_SERVER['REQUEST_METHOD']==='POST'){
    $input=json_decode((string)file_get_contents('php://input'),true)?:[];
    if($section==='delivery'){
      $verified=verificationState($workspace,$user);$location=$verified['location']??[];
      if(empty($verified['locationConfirmed'])||!isset($location['lat'],$location['lng']))respond(422,['ok'=>false,'error'=>'Confirm your business address on the map before setting delivery.']);
      if(!in_array(($input['fulfilmentMode']??''),['courier','own_driver','pickup','digital'],true)||!isset($input['baseDeliveryFee'])||!is_numeric($input['baseDeliveryFee'])||(float)$input['baseDeliveryFee']<0)respond(422,['ok'=>false,'error'=>'Choose a delivery method and a valid customer fee.']);
      $input['pickupAddress']=(string)$location['address'];$input['pickupLocation']=['lat'=>$location['lat'],'lng'=>$location['lng']];
    }
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
if ($action==='order-status' && $_SERVER['REQUEST_METHOD']==='POST') {
  $input=json_decode((string)file_get_contents('php://input'),true)?:[];
  $orderId=trim((string)($input['orderId']??''));
  $status=strtolower(trim((string)($input['orderStatus']??'')));
  $allowed=['new','processing','shipping','completed'];
  if($orderId===''||!in_array($status,$allowed,true))respond(422,['ok'=>false,'error'=>'Order and valid delivery status are required']);
  $index=-1;foreach(($workspace['orders']??[]) as $i=>$order)if(($order['id']??'')===$orderId){$index=$i;break;}
  if($index<0)respond(404,['ok'=>false,'error'=>'Order not found']);
  $order=$workspace['orders'][$index];
  $previous=(string)($order['orderStatus']??'new');
  $order['orderStatus']=$status;
  $order['updatedAt']=gmdate('c');
  $order['fulfilment']=$order['fulfilment']??[];
  if(array_key_exists('trackingNumber',$input))$order['fulfilment']['trackingNumber']=trim((string)$input['trackingNumber']);
  $order['fulfilment']['status']=$status;
  $order['fulfilment']['updatedAt']=gmdate('c');
  $order['fulfilment']['history']=$order['fulfilment']['history']??[];
  $order['fulfilment']['history'][]=['from'=>$previous,'to'=>$status,'at'=>gmdate('c')];
  $workspace['orders'][$index]=$order;saveWorkspace($user,$workspace);
  respond(200,['ok'=>true,'order'=>$order]);
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
