<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
const FIREBASE_API_KEY='AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';
function out(int $s,array $d):never{http_response_code($s);echo json_encode($d,JSON_UNESCAPED_SLASHES);exit;}
function authUser():array{$h=$_SERVER['HTTP_AUTHORIZATION']??'';if(!preg_match('/^Bearer\s+(.+)$/i',$h,$m))out(401,['ok'=>false,'error'=>'Sign in before uploading.']);$ch=curl_init('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.FIREBASE_API_KEY);curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['idToken'=>trim($m[1])]),CURLOPT_TIMEOUT=>12]);$r=json_decode((string)curl_exec($ch),true);curl_close($ch);if(empty($r['users'][0]['localId']))out(401,['ok'=>false,'error'=>'Session expired. Sign in again.']);return $r['users'][0];}
if($_SERVER['REQUEST_METHOD']!=='POST')out(405,['ok'=>false,'error'=>'POST required']);$user=authUser();
$name=trim((string)($_POST['name']??''));$price=(float)($_POST['price']??0);$desc=trim((string)($_POST['desc']??''));if($name==='')out(422,['ok'=>false,'error'=>'Product name is required.']);
$allowedChannels=['teyza','facebook','instagram','x','youtube','whatsapp','tiktok','google'];
$submitted=json_decode((string)($_POST['channels']??'[]'),true);
$channels=array_values(array_intersect($allowedChannels,is_array($submitted)?$submitted:[]));
if(!in_array('teyza',$channels,true))array_unshift($channels,'teyza');

$submittedConnected=json_decode((string)($_POST['connectedChannels']??'[]'),true);
$connectedChannels=array_values(array_intersect(
  $allowedChannels,
  is_array($submittedConnected)?$submittedConnected:[]
));
if(!in_array('teyza',$connectedChannels,true))array_unshift($connectedChannels,'teyza');
$dir=__DIR__.'/uploads/products/';if(!is_dir($dir)&&!mkdir($dir,0755,true)&&!is_dir($dir))out(500,['ok'=>false,'error'=>'Upload folder is unavailable.']);
$staged=json_decode((string)($_POST['stagedImages']??'[]'),true);$images=[];if(is_array($staged))foreach($staged as $img){if(is_string($img)&&preg_match('#^uploads/products/[a-f0-9]{24}\\.(jpg|png|webp)$#',$img))$images[]=$img;}$allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];$finfo=new finfo(FILEINFO_MIME_TYPE);
if(isset($_FILES['images']['tmp_name'])){foreach((array)$_FILES['images']['tmp_name'] as $i=>$tmp){if((($_FILES['images']['error'][$i]??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK))continue;if((int)($_FILES['images']['size'][$i]??0)>5*1024*1024)out(413,['ok'=>false,'error'=>'Each image must be 5MB or smaller.']);$mime=$finfo->file($tmp);if(!isset($allowed[$mime]))out(415,['ok'=>false,'error'=>'Only JPG, PNG and WebP images are supported.']);$file=bin2hex(random_bytes(12)).'.'.$allowed[$mime];if(!move_uploaded_file($tmp,$dir.$file))out(500,['ok'=>false,'error'=>'An image could not be saved.']);$images[]='uploads/products/'.$file;}}
if(!$images)out(422,['ok'=>false,'error'=>'Add at least one product image.']);
$targetPopulation=max(5000,min(1000000,(int)($_POST['targetPopulation']??5000)));
$reachFee=max(0,(int)ceil(($targetPopulation-5000)/1000))*20;
$id='prod_'.bin2hex(random_bytes(6));$dataDir=dirname(__DIR__).'/../private_html/teyza-data';$path=$dataDir.'/'.preg_replace('/[^A-Za-z0-9_-]/','',$user['localId']).'.json';$workspace=is_file($path)?json_decode((string)file_get_contents($path),true):[];if(!is_array($workspace))$workspace=[];$workspace['products']=$workspace['products']??[];
{
  // Enforce the same backend onboarding gate used by the dashboard.
  $business=$workspace['business']??[];$settings=$workspace['settings']??[];$approval=$workspace['companyApproval']['status']??'pending';
  $required=['businessName','businessType','industry','country','phone','address','about'];$missing=false;foreach($required as $key){if(trim((string)($business[$key]??''))===''){$missing=true;break;}}
  $delivery=$settings['delivery']??[];$deliveryOk=in_array(($delivery['fulfilmentMode']??''),['courier','own_driver','pickup','digital'],true)&&isset($delivery['baseDeliveryFee']);
  $bank=$settings['banking']??[];$payfast=$settings['payfast']??[];$pref=$settings['paymentPreferences']??[];$paymentOk=(trim((string)($bank['bankName']??''))!==''&&trim((string)($bank['accountHolder']??''))!==''&&(trim((string)($bank['accountNumber']??''))!==''||trim((string)($bank['accountNumberLast4']??''))!==''))||(trim((string)($payfast['merchantId']??''))!==''&&trim((string)($payfast['merchantKey']??''))!=='')||trim((string)($pref['otherGateway']??''))!=='';
  $v=$workspace['verification']??[];$verificationOk=!empty($v['phone']['verified'])&&!empty($v['identity']['verified'])&&!empty($v['location']['confirmed'])&&!empty($v['proofOfAddress']['storedName'])&&!empty($v['proofOfAddress']['addressMatchVerified']);
  // Company approval does not block product creation. Products can be prepared
  // while approval is pending; external publishing remains pending until approval.
  $blocking=[];
  if($missing)$blocking[]='business profile';
  if(!$verificationOk)$blocking[]='seller verification';
  if(!$deliveryOk)$blocking[]='delivery setup';
  if(!$paymentOk)$blocking[]='payment setup';
  if($blocking)out(403,['ok'=>false,'error'=>'Complete '.implode(', ',$blocking).' before adding products.','blocking'=>$blocking]);
}

$companyApproved=$approval==='approved';
$productVerificationStatus=$companyApproved?'active':'pending_company_approval';
$productVerificationNote=$companyApproved?'Seller onboarding complete — product is live':'Product saved — waiting for Teyza company approval';
$publishInitialStatus=$companyApproved?'queued':'waiting_verification';

$publishing=[];
foreach($channels as $channel){
  $isConnected=in_array($channel,$connectedChannels,true);
  $status=$isConnected?$publishInitialStatus:'setup_required';
  $publishing[$channel]=[
    'status'=>$status,
    'externalId'=>null,
    'lastSyncedAt'=>null,
    'error'=>null,
    'connectionRequired'=>!$isConnected
  ];
}

$product=['id'=>$id,'name'=>$name,'sku'=>trim((string)($_POST['sku']??'')),'category'=>trim((string)($_POST['category']??'')),'brand'=>trim((string)($_POST['brand']??'')),'condition'=>trim((string)($_POST['condition']??'New')),'price'=>$price,'costPrice'=>(float)($_POST['costPrice']??0),'desc'=>$desc,'images'=>$images,'stock'=>(int)($_POST['stock']??0),'channels'=>$channels,'connectedChannelsAtSubmission'=>$connectedChannels,'targetArea'=>trim((string)($_POST['targetArea']??'')),'targetLat'=>trim((string)($_POST['targetLat']??'')),'targetLng'=>trim((string)($_POST['targetLng']??'')),'targetPopulation'=>$targetPopulation,'reachFee'=>$reachFee,'reachPaymentStatus'=>$reachFee===0?'free':'payment_required','targetGender'=>trim((string)($_POST['targetGender']??'all')),'deliveryMethod'=>trim((string)($_POST['deliveryMethod']??'')),'deliveryProvider'=>trim((string)($_POST['deliveryProvider']??'')),'deliveryFee'=>(float)($_POST['deliveryFee']??0),'verificationStatus'=>$productVerificationStatus,'verificationNote'=>$productVerificationNote,'publishing'=>$publishing,'createdAt'=>gmdate('c'),'updatedAt'=>gmdate('c')];
$workspace['products'][]=$product;if(!is_dir($dataDir))mkdir($dataDir,0750,true);file_put_contents($path,json_encode($workspace,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);out(200,['ok'=>true,'status'=>$companyApproved?'success':'pending_company_approval','product'=>$product]);
