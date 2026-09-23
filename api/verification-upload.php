<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
const FIREBASE_API_KEY='AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';
function out(int $s,array $d):never{http_response_code($s);echo json_encode($d,JSON_UNESCAPED_SLASHES);exit;}
function authUser():array{$h=$_SERVER['HTTP_AUTHORIZATION']??'';if(!preg_match('/^Bearer\s+(.+)$/i',$h,$m))out(401,['ok'=>false,'error'=>'Authentication required']);$ch=curl_init('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.rawurlencode(FIREBASE_API_KEY));curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['idToken'=>trim($m[1])]),CURLOPT_TIMEOUT=>12]);$raw=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);$j=json_decode((string)$raw,true);if($code!==200||empty($j['users'][0]['localId']))out(401,['ok'=>false,'error'=>'Your session is no longer valid']);return $j['users'][0];}
if($_SERVER['REQUEST_METHOD']!=='POST')out(405,['ok'=>false,'error'=>'Method not allowed']);
$u=authUser();if(empty($_FILES['proof'])||$_FILES['proof']['error']!==UPLOAD_ERR_OK)out(422,['ok'=>false,'error'=>'Choose a proof of address document']);
$f=$_FILES['proof'];if((int)$f['size']>8*1024*1024)out(413,['ok'=>false,'error'=>'File must be 8 MB or smaller']);
$fi=new finfo(FILEINFO_MIME_TYPE);$mime=$fi->file($f['tmp_name']);$ext=['application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png'][$mime]??null;if(!$ext)out(415,['ok'=>false,'error'=>'Only PDF, JPG and PNG files are accepted']);
$uid=preg_replace('/[^A-Za-z0-9_-]/','',$u['localId']);$base=dirname(__DIR__).'/../private_html/teyza-verification/'.$uid;if(!is_dir($base)&&!mkdir($base,0750,true)&&!is_dir($base))out(500,['ok'=>false,'error'=>'Private verification storage is unavailable']);
foreach(glob($base.'/proof-of-address.*')?:[] as $old)@unlink($old);$stored='proof-of-address.'.$ext;if(!move_uploaded_file($f['tmp_name'],$base.'/'.$stored))out(500,['ok'=>false,'error'=>'Could not store document']);
$dataDir=dirname(__DIR__).'/../private_html/teyza-data';$path=$dataDir.'/'.$uid.'.json';$w=is_file($path)?json_decode((string)file_get_contents($path),true):null;if(!is_array($w))out(404,['ok'=>false,'error'=>'Workspace not found']);
$w['verification']=$w['verification']??[];$w['verification']['proofOfAddress']=['storedName'=>$stored,'originalName'=>basename((string)$f['name']),'mime'=>$mime,'uploadedAt'=>gmdate('c')];file_put_contents($path,json_encode($w,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);
out(200,['ok'=>true,'proofOfAddress'=>['originalName'=>basename((string)$f['name']),'uploadedAt'=>$w['verification']['proofOfAddress']['uploadedAt']]]);
