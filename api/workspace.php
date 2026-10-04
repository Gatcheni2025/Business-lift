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
function companyApproval(array $workspace): array {$a=$workspace['companyApproval']??[];return ['status'=>$a['status']??'pending','submittedAt'=>$a['submittedAt']??null,'reviewedAt'=>$a['reviewedAt']??null,'reviewedBy'=>$a['reviewedBy']??null,'note'=>$a['note']??''];}
function adminRegistry(): array {$path=dirname(__DIR__).'/../private_html/teyza-admins.json';$saved=is_file($path)?json_decode((string)file_get_contents($path),true):[];$admins=is_array($saved)?$saved:[];$bootstrap='admin@teyza.co.za';$exists=false;foreach($admins as $a){if(strtolower((string)($a['email']??''))===$bootstrap){$exists=true;break;}}if(!$exists)$admins[]=['email'=>$bootstrap,'role'=>'super_admin','active'=>true,'bootstrap'=>true];return $admins;}
function adminRole(array $firebase): ?string {$email=strtolower(trim((string)($firebase['email']??'')));if($email==='admin@teyza.co.za')return 'super_admin';foreach(adminRegistry() as $a){if(!empty($a['active'])&&strtolower(trim((string)($a['email']??'')))===$email)return (string)($a['role']??'admin');}$configured=array_filter(array_map('trim',explode(',',strtolower((string)(getenv('TEYZA_ADMIN_EMAILS')?:'')))));return in_array($email,$configured,true)?'super_admin':null;}
function isAdmin(array $firebase): bool {return adminRole($firebase)!==null;}
function saveAdminRegistry(array $admins): void {$path=dirname(__DIR__).'/../private_html/teyza-admins.json';file_put_contents($path,json_encode($admins,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);}
function loadAllSellers(): array {
  $out=[];
  foreach(glob(dataDir().'/*.json')?:[] as $path){
    $w=json_decode((string)file_get_contents($path),true);
    if(!is_array($w))continue;
    $out[]=[
      'uid'=>$w['uid']??basename($path,'.json'),
      'email'=>$w['email']??'',
      'firstName'=>$w['firstName']??'',
      'business'=>$w['business']??[],
      'verification'=>verificationState($w,[]),
      'companyApproval'=>companyApproval($w),
      'setupFlow'=>$w['setupFlow']??[],
      'sellerSetupComplete'=>!empty($w['sellerSetupComplete']),
      'productCount'=>count($w['products']??[]),
      'orderCount'=>count($w['orders']??[]),
      'createdAt'=>$w['createdAt']??null
    ];
  }
  usort($out,function($a,$b){
    return strcmp((string)($b['createdAt']??''),(string)($a['createdAt']??''));
  });
  return $out;
}
function sameAddress(string $a,string $b): bool {return $a!==''&&$b!==''&&strtolower(preg_replace('/\s+/u',' ',trim($a)))===strtolower(preg_replace('/\s+/u',' ',trim($b)));}
function canonicalPhone(string $phone): string {$digits=preg_replace('/\D+/','',$phone);return preg_match('/^0\d{9}$/',$digits)?'27'.substr($digits,1):$digits;}


function adminPaymentView(array $settings): array {
  $bank=$settings['banking']??[];
  $payfast=$settings['payfast']??[];
  $other=$settings['paymentPreferences']??[];

  return [
    'banking'=>[
      'bankName'=>$bank['bankName']??'',
      'accountHolder'=>$bank['accountHolder']??'',
      'accountNumber'=>$bank['accountNumber']??'',
      'accountNumberLast4'=>$bank['accountNumberLast4']??'',
      'branchCode'=>$bank['branchCode']??'',
      'accountType'=>$bank['accountType']??''
    ],
    'payfast'=>[
      'merchantId'=>$payfast['merchantId']??'',
      'connected'=>!empty($payfast['connected']),
      'sandboxMode'=>!empty($payfast['sandboxMode']),
      'merchantKeyConfigured'=>trim((string)($payfast['merchantKey']??''))!=='',
      'passphraseConfigured'=>trim((string)($payfast['passphrase']??''))!==''
    ],
    'paymentPreferences'=>[
      'otherGateway'=>$other['otherGateway']??''
    ]
  ];
}

function normalizeSellerChannels(array $workspace): array {
  $settings=$workspace['settings']??[];
  $raw=$settings['sellingChannels']??($settings['salesChannels']??($settings['channels']??[]));
  $channels=[];

  if(is_array($raw)){
    if(array_is_list($raw)){
      foreach($raw as $value){
        if(is_string($value)&&trim($value)!=='')$channels[]=strtolower(trim($value));
      }
    }else{
      $selected=$raw['selected']??($raw['channels']??[]);
      if(is_array($selected)){
        foreach($selected as $value){
          if(is_string($value)&&trim($value)!=='')$channels[]=strtolower(trim($value));
        }
      }else{
        foreach($raw as $key=>$value){
          if($value===true||$value===1||$value==='1')$channels[]=strtolower((string)$key);
        }
      }
    }
  }

  foreach(($workspace['products']??[]) as $product){
    foreach(($product['channels']??[]) as $channel){
      if(is_string($channel)&&trim($channel)!=='')$channels[]=strtolower(trim($channel));
    }
  }

  array_unshift($channels,'teyza');
  $channels=array_values(array_unique(array_filter($channels)));

  return $channels;
}

function adminSellerChecklist(array $workspace): array {
  $business=$workspace['business']??[];
  $settings=$workspace['settings']??[];
  $verification=verificationState($workspace,[]);
  $approval=companyApproval($workspace);

  $required=['businessName','businessType','industry','country','phone','address','about'];
  $missing=[];
  foreach($required as $key){
    $value=trim((string)($business[$key]??''));
    if($value===''||($key==='businessName'&&$value==='Your Teyza Store'))$missing[]=$key;
  }

  $businessProfileComplete=empty($missing);

  $delivery=$settings['delivery']??[];
  $deliveryComplete=
    in_array((string)($delivery['fulfilmentMode']??''),['courier','own_driver','pickup','digital'],true) &&
    isset($delivery['baseDeliveryFee']) &&
    is_numeric($delivery['baseDeliveryFee']) &&
    (float)$delivery['baseDeliveryFee']>=0 &&
    !empty($verification['locationConfirmed']) &&
    sameAddress(
      (string)($delivery['pickupAddress']??''),
      (string)($verification['location']['address']??'')
    );

  $bank=$settings['banking']??[];
  $payfast=$settings['payfast']??[];
  $other=$settings['paymentPreferences']??[];

  $paymentComplete=
    (
      trim((string)($bank['bankName']??''))!=='' &&
      trim((string)($bank['accountHolder']??''))!=='' &&
      (
        trim((string)($bank['accountNumber']??''))!=='' ||
        trim((string)($bank['accountNumberLast4']??''))!==''
      )
    ) ||
    (
      trim((string)($payfast['merchantId']??''))!=='' &&
      trim((string)($payfast['merchantKey']??''))!==''
    ) ||
    trim((string)($other['otherGateway']??''))!=='';

  $audience=$settings['audience']??[];
  $audienceComplete=trim((string)($audience['gender']??''))!=='';

  $sellerSetupComplete=$deliveryComplete&&$paymentComplete&&$audienceComplete;
  $verificationComplete=((int)($verification['completed']??0)>=4);
  $approved=(($approval['status']??'pending')==='approved');

  $items=[
    ['key'=>'business','label'=>'Business profile','complete'=>$businessProfileComplete],
    ['key'=>'logo','label'=>'Seller photo / business logo','complete'=>trim((string)($business['logoUrl']??''))!==''],
    ['key'=>'phone','label'=>'Phone verification','complete'=>!empty($verification['phoneVerified'])],
    ['key'=>'location','label'=>'Business location','complete'=>!empty($verification['locationConfirmed'])],
    ['key'=>'proof','label'=>'Proof of address uploaded','complete'=>!empty($verification['proofOfAddressUploaded'])],
    ['key'=>'proofMatch','label'=>'Proof matches confirmed address','complete'=>!empty($verification['proofAddressMatchVerified'])],
    ['key'=>'identity','label'=>'Identity verification','complete'=>!empty($verification['identityVerified'])],
    ['key'=>'delivery','label'=>'Delivery setup','complete'=>$deliveryComplete],
    ['key'=>'payments','label'=>'Payment / banking setup','complete'=>$paymentComplete],
    ['key'=>'audience','label'=>'Audience setup','complete'=>$audienceComplete],
    ['key'=>'approval','label'=>'Admin approval','complete'=>$approved]
  ];

  $done=0;
  foreach($items as $item)if(!empty($item['complete']))$done++;

  return [
    'items'=>$items,
    'completed'=>$done,
    'total'=>count($items),
    'missingBusinessFields'=>$missing,
    'businessProfileComplete'=>$businessProfileComplete,
    'verificationComplete'=>$verificationComplete,
    'deliveryComplete'=>$deliveryComplete,
    'paymentComplete'=>$paymentComplete,
    'audienceComplete'=>$audienceComplete,
    'sellerSetupComplete'=>$sellerSetupComplete,
    'dashboardAccess'=>$sellerSetupComplete,
    'productReady'=>$sellerSetupComplete&&$businessProfileComplete&&$verificationComplete&&$approved
  ];
}

function adminSellerDetail(array $workspace): array {
  $settings=$workspace['settings']??[];
  return [
    'uid'=>$workspace['uid']??'',
    'email'=>$workspace['email']??'',
    'firstName'=>$workspace['firstName']??'',
    'createdAt'=>$workspace['createdAt']??null,
    'business'=>$workspace['business']??[],
    'verification'=>verificationState($workspace,[]),
    'verificationRaw'=>[
      'phone'=>$workspace['verification']['phone']??null,
      'location'=>$workspace['verification']['location']??null,
      'proofOfAddress'=>$workspace['verification']['proofOfAddress']??null,
      'identity'=>$workspace['verification']['identity']??null,
      'identityDraft'=>$workspace['verification']['identityDraft']??null
    ],
    'companyApproval'=>companyApproval($workspace),
    'setupFlow'=>$workspace['setupFlow']??[],
    'sellerSetupComplete'=>!empty($workspace['sellerSetupComplete']),
    'checklist'=>adminSellerChecklist($workspace),
    'settings'=>[
      'shop'=>$settings['shop']??[],
      'delivery'=>$settings['delivery']??[],
      'audience'=>$settings['audience']??[],
      'setupGuide'=>$settings['setupGuide']??[],
      'payments'=>adminPaymentView($settings),
      'sellingChannels'=>normalizeSellerChannels($workspace)
    ],
    'products'=>$workspace['products']??[],
    'orders'=>$workspace['orders']??[]
  ];
}

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
  $identityDraft=$v['identityDraft']??[];
  $identityDocumentDraft=!empty($identityDraft['documentStoredName']);
  $identitySelfieDraft=!empty($identityDraft['selfieStoredName']);
  $completed=(int)$phoneVerified+(int)$identitySubmitted+(int)$locationConfirmed+(int)$proofUploaded;
  return [
    'phoneVerified'=>$phoneVerified,
    'phoneVerifiedAt'=>$v['phone']['verifiedAt']??null,
    'identityVerified'=>$identityVerified,
    'identitySubmitted'=>$identitySubmitted,
    'identityStatus'=>$identityStatus,
    'identityDocumentDraft'=>$identityDocumentDraft,
    'identitySelfieDraft'=>$identitySelfieDraft,
    'identityDraft'=>[
      'documentOriginalName'=>$identityDraft['documentOriginalName']??null,
      'documentUploadedAt'=>$identityDraft['documentUploadedAt']??null,
      'selfieUploadedAt'=>$identityDraft['selfieUploadedAt']??null,
    ],
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
if($action==='admin-seller-detail'){
  if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'Admin access required']);
  $uid=preg_replace('/[^A-Za-z0-9_-]/','',(string)($_GET['uid']??''));
  if($uid==='')respond(422,['ok'=>false,'error'=>'Seller is required']);
  $path=pathFor($uid);
  if(!is_file($path))respond(404,['ok'=>false,'error'=>'Seller not found']);
  $target=json_decode((string)file_get_contents($path),true);
  if(!is_array($target))respond(500,['ok'=>false,'error'=>'Seller workspace could not be read']);
  respond(200,['ok'=>true,'seller'=>adminSellerDetail($target)]);
}

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

if($action==='admin-product-review'){
  if(!isAdmin($user))respond(403,['ok'=>false,'error'=>'Admin access required']);
  if($_SERVER['REQUEST_METHOD']!=='POST')respond(405,['ok'=>false,'error'=>'Method not allowed']);

  $input=json_decode((string)file_get_contents('php://input'),true)?:[];
  $uid=preg_replace('/[^A-Za-z0-9_-]/','',(string)($input['uid']??''));
  $productId=trim((string)($input['productId']??''));
  $decision=strtolower(trim((string)($input['decision']??'')));
  $note=trim((string)($input['note']??''));

  if(!$uid||$productId===''||!in_array($decision,['approved','rejected'],true)){
    respond(422,['ok'=>false,'error'=>'Seller, product and a valid review decision are required']);
  }

  $path=pathFor($uid);
  if(!is_file($path))respond(404,['ok'=>false,'error'=>'Seller workspace not found']);
  $target=json_decode((string)file_get_contents($path),true);
  if(!is_array($target))respond(500,['ok'=>false,'error'=>'Seller workspace could not be read']);

  $index=-1;
  foreach(($target['products']??[]) as $i=>$product){
    if((string)($product['id']??'')===$productId){$index=$i;break;}
  }
  if($index<0)respond(404,['ok'=>false,'error'=>'Product not found']);

  $product=$target['products'][$index];
  $images=is_array($product['images']??null)?$product['images']:[];
  if($decision==='approved'&&count($images)<2){
    respond(422,['ok'=>false,'error'=>'This product needs at least 2 images before it can be approved']);
  }

  $now=gmdate('c');
  $product['verificationStatus']=$decision;
  $product['verificationNote']=$note!==''?$note:($decision==='approved'?'Approved by Teyza admin':'Rejected by Teyza admin');
  $product['reviewedAt']=$now;
  $product['reviewedBy']=$user['email']??'admin';

  $channels=is_array($product['channels']??null)?$product['channels']:[];
  $product['publishing']=[];
  foreach($channels as $channel){
    if($decision==='approved'){
      $product['publishing'][$channel]=[
        'status'=>$channel==='teyza'?'published':'queued',
        'externalId'=>null,
        'lastSyncedAt'=>$channel==='teyza'?$now:null,
        'error'=>null
      ];
    }else{
      $product['publishing'][$channel]=[
        'status'=>'waiting_verification',
        'externalId'=>null,
        'lastSyncedAt'=>null,
        'error'=>$product['verificationNote']
      ];
    }
  }

  $product['updatedAt']=$now;
  $target['products'][$index]=$product;
  file_put_contents($path,json_encode($target,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);

  respond(200,['ok'=>true,'product'=>$product]);
}

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
if ($action === 'seller-readiness') {

    /*
     * =====================================================
     * SELLER ONBOARDING READINESS
     *
     * This endpoint is the single source of truth for
     * whether a seller may enter the Teyza dashboard.
     *
     * Never trust a browser/localStorage flag for
     * sellerSetupComplete.
     * =====================================================
     */

    $business = $workspace['business'] ?? [];

    $required = [
        'businessName',
        'businessType',
        'industry',
        'country',
        'phone',
        'address',
        'about'
    ];

    $missing = [];

    foreach ($required as $key) {

        $value = trim(
            (string)($business[$key] ?? '')
        );

        if (
            $value === '' ||
            (
                $key === 'businessName' &&
                $value === 'Your Teyza Store'
            )
        ) {
            $missing[] = $key;
        }
    }


    $settings =
        $workspace['settings'] ?? [];

    $verification =
        verificationState(
            $workspace,
            $user
        );


    /*
     * -----------------------------------------------------
     * BUSINESS PROFILE + VERIFICATION
     * -----------------------------------------------------
     *
     * IMPORTANT:
     * Completing the seller's own onboarding and passing
     * Teyza verification are two different states.
     *
     * The seller may enter the dashboard after completing
     * their own setup. Verification/admin approval can remain
     * pending and will only control selling/publishing access.
     */

    $businessProfileComplete =
        empty($missing);

    $verificationComplete =
        ((int)($verification['completed'] ?? 0) >= 4);

    /*
     * Preserve the existing businessComplete response field
     * as the fully verified business state for compatibility.
     */
    $businessComplete =
        $businessProfileComplete &&
        $verificationComplete;


    /*
     * -----------------------------------------------------
     * DELIVERY
     * -----------------------------------------------------
     *
     * Collection address must match the verified business
     * location.
     */

    $delivery =
        $settings['delivery'] ?? [];

    $fulfilmentMode =
        (string)($delivery['fulfilmentMode'] ?? '');


    $validDeliveryMethod =
        in_array(
            $fulfilmentMode,
            [
                'courier',
                'own_driver',
                'pickup',
                'digital'
            ],
            true
        );


    $validDeliveryFee =
        isset($delivery['baseDeliveryFee']) &&
        is_numeric($delivery['baseDeliveryFee']) &&
        (float)$delivery['baseDeliveryFee'] >= 0;


    $locationConfirmed =
        !empty(
            $verification['locationConfirmed']
        );


    $pickupMatchesVerifiedAddress =
        $locationConfirmed &&
        sameAddress(
            (string)($delivery['pickupAddress'] ?? ''),
            (string)(
                $verification['location']['address'] ?? ''
            )
        );


    $deliveryComplete =
        $validDeliveryMethod &&
        $validDeliveryFee &&
        $locationConfirmed &&
        $pickupMatchesVerifiedAddress;


    /*
     * -----------------------------------------------------
     * PAYMENT / BANKING
     * -----------------------------------------------------
     */

    $bank =
        $settings['banking'] ?? [];

    $gateway =
        $settings['payfast'] ?? [];

    $other =
        $settings['paymentPreferences'] ?? [];


    $bankComplete =
        trim(
            (string)($bank['bankName'] ?? '')
        ) !== '' &&

        trim(
            (string)($bank['accountHolder'] ?? '')
        ) !== '' &&

        (
            trim(
                (string)($bank['accountNumber'] ?? '')
            ) !== '' ||

            trim(
                (string)($bank['accountNumberLast4'] ?? '')
            ) !== ''
        );


    $gatewayComplete =
        trim(
            (string)($gateway['merchantId'] ?? '')
        ) !== '' &&

        trim(
            (string)($gateway['merchantKey'] ?? '')
        ) !== '';


    $otherPaymentComplete =
        trim(
            (string)($other['otherGateway'] ?? '')
        ) !== '';


    $paymentComplete =
        $bankComplete ||
        $gatewayComplete ||
        $otherPaymentComplete;


    /*
     * -----------------------------------------------------
     * AUDIENCE
     * -----------------------------------------------------
     *
     * This is Step 4 of the seller-owned onboarding wizard.
     */

    $audience =
        $settings['audience'] ?? [];

    $audienceComplete =
        trim(
            (string)($audience['gender'] ?? '')
        ) !== '';


    /*
     * -----------------------------------------------------
     * COMPANY APPROVAL
     * -----------------------------------------------------
     */

    $approval =
        companyApproval($workspace);


    $approved =
        (
            ($approval['status'] ?? 'pending')
            ===
            'approved'
        );


    /*
     * -----------------------------------------------------
     * DASHBOARD ACCESS VS SELLING ACCESS
     * -----------------------------------------------------
     *
     * sellerSetupComplete means:
     * "The seller has completed the setup they control."
     *
     * It MUST NOT depend on Teyza/admin approval or identity
     * verification. Otherwise a completed seller is forced
     * back into Step 1 forever while approval is pending.
     *
     * Verification and approval continue to control
     * productReady/publishing.
     */

    /*
     * Dashboard access follows the seller-owned 4-step wizard.
     * Step 1 is complete because Teyza Store is always included.
     * Verification/admin approval remains separate and controls
     * productReady, not access to the dashboard.
     */
    $sellingComplete =
        true;

    $sellerSetupComplete =
        $sellingComplete &&
        $deliveryComplete &&
        $paymentComplete &&
        $audienceComplete;

    $dashboardAccess =
        $sellerSetupComplete;


    /*
     * Selling/publishing remains locked until:
     * - seller-owned setup is complete
     * - all required verification is complete
     * - Teyza/admin approval is approved
     */

    $productReady =
        $sellerSetupComplete &&
        $businessProfileComplete &&
        $verificationComplete &&
        $approved;


    /*
     * Progress indicator for the 4-step onboarding wizard.
     *
     * Selling is always available through Teyza Store, so
     * Step 1 is considered complete without requiring any
     * external social channel to be connected.
     */

    $steps =
        1 +
        (int)$deliveryComplete +
        (int)$paymentComplete +
        (int)$audienceComplete;


    /*
     * -----------------------------------------------------
     * SAVE DERIVED STATE
     * -----------------------------------------------------
     *
     * Save the SERVER-calculated state.
     * Never accept sellerSetupComplete from the browser.
     */

    $previousComplete =
        !empty(
            $workspace['sellerSetupComplete']
        );


    $workspace['sellerSetupComplete'] =
        $sellerSetupComplete;


    $workspace['setupFlow'] =
        $workspace['setupFlow'] ?? [];


    $workspace['setupFlow']['sellingComplete'] =
        $sellingComplete;

    $workspace['setupFlow']['businessProfileComplete'] =
        $businessProfileComplete;

    $workspace['setupFlow']['verificationComplete'] =
        $verificationComplete;

    /*
     * Compatibility field: this remains the fully verified
     * business state, not dashboard access.
     */
    $workspace['setupFlow']['businessComplete'] =
        $businessComplete;

    $workspace['setupFlow']['approvalComplete'] =
        $approved;

    $workspace['setupFlow']['deliveryComplete'] =
        $deliveryComplete;

    $workspace['setupFlow']['paymentComplete'] =
        $paymentComplete;

    $workspace['setupFlow']['audienceComplete'] =
        $audienceComplete;

    $workspace['setupFlow']['dashboardAccess'] =
        $dashboardAccess;

    $workspace['setupFlow']['productReady'] =
        $productReady;

    $workspace['setupFlow']['completedSteps'] =
        $steps;

    $workspace['setupFlow']['totalSteps'] =
        4;


    /*
     * Record completion time only when the account
     * becomes complete for the first time.
     */

    if (
        $sellerSetupComplete &&
        !$previousComplete
    ) {
        $workspace['setupFlow']['completedAt'] =
            gmdate('c');
    }


    saveWorkspace(
        $user,
        $workspace
    );


    /*
     * -----------------------------------------------------
     * RESPONSE
     * -----------------------------------------------------
     */

    respond(
        200,
        [
            'ok' => true,

            'sellingComplete' =>
                $sellingComplete,

            'businessProfileComplete' =>
                $businessProfileComplete,

            'businessComplete' =>
                $businessComplete,

            'verificationComplete' =>
                $verificationComplete,

            'businessVerification' =>
                $verification,

            'companyApproval' =>
                $approval,

            'approvalComplete' =>
                $approved,

            'deliveryComplete' =>
                $deliveryComplete,

            'paymentComplete' =>
                $paymentComplete,

            'audienceComplete' =>
                $audienceComplete,

            'dashboardAccess' =>
                $dashboardAccess,

            'productReady' =>
                $productReady,

            'sellerSetupComplete' =>
                $sellerSetupComplete,

            'sellerSetupCompletedSteps' =>
                $steps,

            'sellerSetupTotalSteps' =>
                4,

            'missingBusinessFields' =>
                $missing
        ]
    );
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
    if(isset($input['channels'])&&is_array($input['channels'])){$allowed=['teyza','facebook','instagram','x','youtube','whatsapp','tiktok','google'];$product['channels']=array_values(array_intersect($allowed,$input['channels']));if(!in_array('teyza',$product['channels'],true))array_unshift($product['channels'],'teyza');$product['publishing']=array_reduce($product['channels'],function($out,$channel){$out[$channel]=['status'=>'waiting_verification','externalId'=>null,'lastSyncedAt'=>null,'error'=>null];return $out;},[]);}
    $pop=max(5000,(int)($product['targetPopulation']??5000));$product['reachFee']=max(0,(int)ceil(($pop-5000)/1000))*20;$product['verificationStatus']='pending';$product['verificationNote']='Awaiting Teyza admin verification';$product['submittedForVerificationAt']=gmdate('c');$product['updatedAt']=gmdate('c');$workspace['products'][$index]=$product;saveWorkspace($user,$workspace);respond(200,['ok'=>true,'product'=>$product]);
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
