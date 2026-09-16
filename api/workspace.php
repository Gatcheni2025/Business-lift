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
if ($action==='summary') respond(200,['ok'=>true,'business'=>$workspace['business'],'firstName'=>$workspace['firstName'],'orders'=>$workspace['orders']??[],'products'=>$workspace['products']??[]]);
respond(200,['ok'=>true,'businessId'=>$workspace['business']['businessId'],'business'=>$workspace['business'],'userData'=>['firstName'=>$workspace['firstName'],'email'=>$workspace['email']]]);
