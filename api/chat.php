<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const FIREBASE_API_KEY = 'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';

function out(int $status, array $data): never {
  http_response_code($status);
  echo json_encode($data, JSON_UNESCAPED_SLASHES);
  exit;
}
function bearer(): string {
  $h=$_SERVER['HTTP_AUTHORIZATION']??'';
  return preg_match('/^Bearer\\s+(.+)$/i',$h,$m)?trim($m[1]):'';
}
function firebaseUser(string $token): array {
  if(!$token) out(401,['ok'=>false,'error'=>'Authentication required']);
  $url='https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.rawurlencode(FIREBASE_API_KEY);
  $ch=curl_init($url);
  curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['idToken'=>$token]),CURLOPT_TIMEOUT=>12]);
  $raw=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
  $json=json_decode((string)$raw,true);
  if($code!==200||empty($json['users'][0]['localId'])) out(401,['ok'=>false,'error'=>'Your session is no longer valid. Please sign in again.']);
  return $json['users'][0];
}
function workspaceDir(): string {
  $dir=dirname(__DIR__).'/../private_html/teyza-data';
  if(!is_dir($dir)) out(503,['ok'=>false,'error'=>'Seller workspace storage is unavailable']);
  return $dir;
}
function chatDir(): string {
  $dir=dirname(__DIR__).'/../private_html/teyza-chat';
  if(!is_dir($dir)&&!mkdir($dir,0750,true)&&!is_dir($dir)) out(500,['ok'=>false,'error'=>'Chat storage is unavailable']);
  return $dir;
}
function businessId(string $value): string {
  $id=strtoupper(trim($value));
  if(!preg_match('/^TZ_[A-F0-9]{8}$/',$id)) out(422,['ok'=>false,'error'=>'A valid Teyza business is required']);
  return $id;
}
function findSeller(string $businessId): ?array {
  foreach(glob(workspaceDir().'/*.json')?:[] as $path){
    $w=json_decode((string)file_get_contents($path),true);
    if(!is_array($w)) continue;
    if(strtoupper((string)($w['business']['businessId']??''))===$businessId) return ['path'=>$path,'workspace'=>$w];
  }
  return null;
}
function chatPath(string $businessId): string { return chatDir().'/'.$businessId.'.json'; }
function loadChat(string $businessId): array {
  $path=chatPath($businessId);
  if(!is_file($path)) return ['businessId'=>$businessId,'threads'=>[],'updatedAt'=>gmdate('c')];
  $saved=json_decode((string)file_get_contents($path),true);
  return is_array($saved)?$saved:['businessId'=>$businessId,'threads'=>[],'updatedAt'=>gmdate('c')];
}
function saveChat(string $businessId,array $chat): void {
  $chat['businessId']=$businessId;$chat['updatedAt']=gmdate('c');
  file_put_contents(chatPath($businessId),json_encode($chat,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);
}
function cleanText(mixed $value,int $max): string {
  $text=trim(preg_replace('/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/u','',(string)$value)??'');
  if(strlen($text)>$max)$text=substr($text,0,$max);
  return $text;
}
function tokenHash(string $token): string { return hash('sha256',$token); }
function validToken(string $token): bool { return (bool)preg_match('/^[a-f0-9]{48}$/',$token); }
function publicThread(array $thread): array {
  return [
    'id'=>$thread['id']??'',
    'clientName'=>$thread['clientName']??'Customer',
    'messages'=>array_map(fn($m)=>[
      'id'=>$m['id']??'',
      'sender'=>$m['sender']??'client',
      'text'=>$m['text']??'',
      'createdAt'=>$m['createdAt']??null,
    ],$thread['messages']??[]),
    'updatedAt'=>$thread['updatedAt']??null,
    'unreadClient'=>(int)($thread['unreadClient']??0),
  ];
}
function sellerBusiness(array $firebase): array {
  $uid=(string)$firebase['localId'];
  $path=workspaceDir().'/'.preg_replace('/[^A-Za-z0-9_-]/','',$uid).'.json';
  if(!is_file($path)) out(404,['ok'=>false,'error'=>'Teyza seller workspace not found']);
  $w=json_decode((string)file_get_contents($path),true);
  if(!is_array($w)) out(500,['ok'=>false,'error'=>'Seller workspace could not be read']);
  $id=businessId((string)($w['business']['businessId']??''));
  return ['businessId'=>$id,'workspace'=>$w];
}
function threadIndex(array $threads,string $threadId): int {
  foreach($threads as $i=>$thread) if(($thread['id']??'')===$threadId)return $i;
  return -1;
}
function clientThreadIndex(array $threads,string $hash): int {
  foreach($threads as $i=>$thread) if(hash_equals((string)($thread['clientTokenHash']??''),$hash))return $i;
  return -1;
}

$method=$_SERVER['REQUEST_METHOD']??'GET';
$mode=(string)($_GET['mode']??'');

if($method==='GET'&&$mode==='public-info'){
  $id=businessId((string)($_GET['businessId']??''));
  $seller=findSeller($id);
  if(!$seller)out(404,['ok'=>false,'error'=>'Seller not found']);
  $name=cleanText($seller['workspace']['business']['businessName']??'Teyza seller',120);
  out(200,['ok'=>true,'businessId'=>$id,'businessName'=>$name?:'Teyza seller']);
}

if($method==='GET'&&$mode==='client-thread'){
  $id=businessId((string)($_GET['businessId']??''));
  if(!findSeller($id))out(404,['ok'=>false,'error'=>'Seller not found']);
  $token=strtolower(trim((string)($_GET['clientToken']??'')));
  if(!validToken($token))out(200,['ok'=>true,'thread'=>null]);
  $chat=loadChat($id);$index=clientThreadIndex($chat['threads']??[],tokenHash($token));
  if($index<0)out(200,['ok'=>true,'thread'=>null]);
  $chat['threads'][$index]['unreadClient']=0;
  saveChat($id,$chat);
  out(200,['ok'=>true,'thread'=>publicThread($chat['threads'][$index])]);
}

if($method==='GET'&&in_array($mode,['seller-inbox','seller-thread'],true)){
  $firebase=firebaseUser(bearer());$seller=sellerBusiness($firebase);$id=$seller['businessId'];$chat=loadChat($id);
  if($mode==='seller-inbox'){
    $threads=array_map(function($t){
      $messages=$t['messages']??[];$last=$messages?end($messages):null;
      return [
        'id'=>$t['id']??'',
        'clientName'=>$t['clientName']??'Customer',
        'clientEmail'=>$t['clientEmail']??'',
        'updatedAt'=>$t['updatedAt']??null,
        'unreadSeller'=>(int)($t['unreadSeller']??0),
        'lastMessage'=>$last['text']??'',
        'lastSender'=>$last['sender']??'client',
      ];
    },$chat['threads']??[]);
    usort($threads,fn($a,$b)=>strcmp((string)($b['updatedAt']??''),(string)($a['updatedAt']??'')));
    out(200,['ok'=>true,'businessId'=>$id,'threads'=>$threads]);
  }
  $threadId=preg_replace('/[^a-f0-9]/','',strtolower((string)($_GET['threadId']??'')));
  $index=threadIndex($chat['threads']??[],$threadId);
  if($index<0)out(404,['ok'=>false,'error'=>'Conversation not found']);
  $chat['threads'][$index]['unreadSeller']=0;saveChat($id,$chat);
  $t=$chat['threads'][$index];
  unset($t['clientTokenHash']);
  out(200,['ok'=>true,'thread'=>$t]);
}

if($method!=='POST')out(405,['ok'=>false,'error'=>'Method not allowed']);
$input=json_decode((string)file_get_contents('php://input'),true)?:[];
$action=(string)($input['action']??'');

if($action==='client-message'){
  $id=businessId((string)($input['businessId']??''));
  $seller=findSeller($id);if(!$seller)out(404,['ok'=>false,'error'=>'Seller not found']);
  $message=cleanText($input['message']??'',2000);if($message==='')out(422,['ok'=>false,'error'=>'Write a message first']);
  $name=cleanText($input['name']??'',80);$email=cleanText($input['email']??'',160);
  if($email!==''&&!filter_var($email,FILTER_VALIDATE_EMAIL))out(422,['ok'=>false,'error'=>'Enter a valid email address']);
  $token=strtolower(trim((string)($input['clientToken']??'')));
  if(!validToken($token))$token=bin2hex(random_bytes(24));
  $chat=loadChat($id);$threads=$chat['threads']??[];$index=clientThreadIndex($threads,tokenHash($token));
  $now=gmdate('c');
  if($index<0){
    if($name==='')out(422,['ok'=>false,'error'=>'Enter your name to start the chat']);
    $threads[]=[
      'id'=>bin2hex(random_bytes(12)),
      'clientTokenHash'=>tokenHash($token),
      'clientName'=>$name,
      'clientEmail'=>$email,
      'createdAt'=>$now,'updatedAt'=>$now,
      'unreadSeller'=>0,'unreadClient'=>0,'messages'=>[]
    ];
    $index=count($threads)-1;
  }else{
    if($name!=='')$threads[$index]['clientName']=$name;
    if($email!=='')$threads[$index]['clientEmail']=$email;
  }
  if(count($threads[$index]['messages']??[])>=150)out(429,['ok'=>false,'error'=>'This conversation has reached its message limit. Start a new chat later.']);
  $threads[$index]['messages'][]=['id'=>bin2hex(random_bytes(8)),'sender'=>'client','text'=>$message,'createdAt'=>$now];
  $threads[$index]['updatedAt']=$now;$threads[$index]['unreadSeller']=(int)($threads[$index]['unreadSeller']??0)+1;
  $chat['threads']=$threads;saveChat($id,$chat);
  out(200,['ok'=>true,'clientToken'=>$token,'thread'=>publicThread($threads[$index])]);
}

if($action==='seller-message'){
  $firebase=firebaseUser(bearer());$seller=sellerBusiness($firebase);$id=$seller['businessId'];
  $threadId=preg_replace('/[^a-f0-9]/','',strtolower((string)($input['threadId']??'')));
  $message=cleanText($input['message']??'',2000);if($message==='')out(422,['ok'=>false,'error'=>'Write a reply first']);
  $chat=loadChat($id);$threads=$chat['threads']??[];$index=threadIndex($threads,$threadId);
  if($index<0)out(404,['ok'=>false,'error'=>'Conversation not found']);
  $now=gmdate('c');
  $threads[$index]['messages'][]=['id'=>bin2hex(random_bytes(8)),'sender'=>'seller','text'=>$message,'createdAt'=>$now];
  $threads[$index]['updatedAt']=$now;$threads[$index]['unreadClient']=(int)($threads[$index]['unreadClient']??0)+1;$threads[$index]['unreadSeller']=0;
  $chat['threads']=$threads;saveChat($id,$chat);
  $t=$threads[$index];unset($t['clientTokenHash']);
  out(200,['ok'=>true,'thread'=>$t]);
}

out(422,['ok'=>false,'error'=>'Unsupported chat action']);
