<?php
declare(strict_types=1);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const FIREBASE_API_KEY='AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';

function fail(int $status,string $message):never{
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok'=>false,'error'=>$message],JSON_UNESCAPED_SLASHES);
  exit;
}
function bearer():string{
  $h=$_SERVER['HTTP_AUTHORIZATION']??'';
  return preg_match('/^Bearer\s+(.+)$/i',$h,$m)?trim($m[1]):'';
}
function firebaseUser(string $token):array{
  if(!$token)fail(401,'Authentication required');
  $ch=curl_init('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.rawurlencode(FIREBASE_API_KEY));
  curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['idToken'=>$token]),CURLOPT_TIMEOUT=>12]);
  $raw=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
  $json=json_decode((string)$raw,true);
  if($code!==200||empty($json['users'][0]['localId']))fail(401,'Your session is no longer valid');
  return $json['users'][0];
}
function admins():array{
  $path=dirname(__DIR__).'/../private_html/teyza-admins.json';
  $saved=is_file($path)?json_decode((string)file_get_contents($path),true):[];
  $items=is_array($saved)?$saved:[];
  $items[]=['email'=>'admin@teyza.co.za','role'=>'super_admin','active'=>true];
  return $items;
}
function isAdmin(array $user):bool{
  $email=strtolower(trim((string)($user['email']??'')));
  if($email==='admin@teyza.co.za')return true;
  foreach(admins() as $a)if(!empty($a['active'])&&strtolower(trim((string)($a['email']??'')))===$email)return true;
  $configured=array_filter(array_map('trim',explode(',',strtolower((string)(getenv('TEYZA_ADMIN_EMAILS')?:'')))));
  return in_array($email,$configured,true);
}

$user=firebaseUser(bearer());
if(!isAdmin($user))fail(403,'Admin access required');

$uid=preg_replace('/[^A-Za-z0-9_-]/','',(string)($_GET['uid']??''));
$type=(string)($_GET['type']??'proof');
if(!$uid||!in_array($type,['proof','identity-document','identity-selfie','identity-document-draft','identity-selfie-draft'],true))fail(422,'Invalid verification file request');

$dataPath=dirname(__DIR__).'/../private_html/teyza-data/'.$uid.'.json';
if(!is_file($dataPath))fail(404,'Seller not found');
$workspace=json_decode((string)file_get_contents($dataPath),true);
if(!is_array($workspace))fail(404,'Seller verification record not found');

$verification=$workspace['verification']??[];
if($type==='proof')$stored=$verification['proofOfAddress']['storedName']??'';
elseif($type==='identity-document')$stored=$verification['identity']['documentName']??'';
elseif($type==='identity-selfie')$stored=$verification['identity']['selfieName']??'';
elseif($type==='identity-document-draft')$stored=$verification['identityDraft']['documentStoredName']??'';
else $stored=$verification['identityDraft']['selfieStoredName']??'';

$stored=basename((string)$stored);
if($stored==='')fail(404,'Verification file not found');
$base=dirname(__DIR__).'/../private_html/teyza-verification/'.$uid;
$path=$base.'/'.$stored;
$realBase=realpath($base);$realPath=realpath($path);
if(!$realBase||!$realPath||strpos($realPath,$realBase.DIRECTORY_SEPARATOR)!==0||!is_file($realPath))fail(404,'Verification file not found');

$mime=(new finfo(FILEINFO_MIME_TYPE))->file($realPath)?:'application/octet-stream';
header('Content-Type: '.$mime);
header('Content-Length: '.filesize($realPath));
header('Content-Disposition: inline; filename="'.str_replace('"','',basename($stored)).'"');
readfile($realPath);
exit;
