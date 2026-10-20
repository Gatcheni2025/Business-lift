<?php
declare(strict_types=1);
/**
 * Ephemeral Google Places Photo (New) redirect for shopper thumbnails.
 * Never exposes the server API key to clients, never caches images/content.
 * The Flutter UI must display Google Maps and any author attributions.
 */
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
require_once __DIR__.'/shopper-google-places-provider.php';

$reference=(string)($_GET['ref']??'');
if (strlen($reference)>900 ||
    !preg_match('#^places/[A-Za-z0-9_-]{8,200}/photos/[A-Za-z0-9_-]{8,600}$#D',$reference)) {
    http_response_code(400); exit;
}
$key=teyzaGooglePlacesKey();
if($key==='' || !function_exists('curl_init')) {
    http_response_code(503); exit;
}
// Limit billable photo requests independently of main search quota.
$ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
$path=sys_get_temp_dir().'/teyza_places_photo_'.hash('sha256',$ip.'-'.gmdate('YmdH'));
$fp=@fopen($path,'c+');
if($fp===false){http_response_code(503);exit;}
if(!flock($fp,LOCK_EX)){fclose($fp);http_response_code(503);exit;}
$count=(int)trim((string)stream_get_contents($fp));
if($count>=90){flock($fp,LOCK_UN);fclose($fp);http_response_code(429);exit;}
rewind($fp);ftruncate($fp,0);fwrite($fp,(string)($count+1));fflush($fp);
flock($fp,LOCK_UN);fclose($fp);

$endpoint='https://places.googleapis.com/v1/'.$reference.'/media?maxWidthPx=640&skipHttpRedirect=true';
$ch=curl_init($endpoint);
curl_setopt_array($ch,[
  CURLOPT_HTTPHEADER=>['X-Goog-Api-Key: '.$key,'Accept: application/json'],
  CURLOPT_RETURNTRANSFER=>true,
  CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>9,
  CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS
]);
$result=curl_exec($ch);
$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
curl_close($ch);
$json=($status===200 && is_string($result) && strlen($result)<16000)
    ?json_decode($result,true):null;
$uri=is_array($json)?(string)($json['photoUri']??''):'';
$parts=parse_url($uri);
$host=strtolower((string)($parts['host']??''));
if(($parts['scheme']??'')!=='https' || $host==='' ||
   !(preg_match('/(^|\\.)googleusercontent\\.com$/',$host) ||
     preg_match('/(^|\\.)googleapis\\.com$/',$host) ||
     preg_match('/(^|\\.)gstatic\\.com$/',$host) ||
     preg_match('/(^|\\.)ggpht\\.com$/',$host))) {
    http_response_code(404); exit;
}
header('Location: '.$uri,true,302);
exit;
