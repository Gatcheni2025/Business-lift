<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
const FIREBASE_API_KEY='AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';
function out(int $s,array $d):never{http_response_code($s);echo json_encode($d,JSON_UNESCAPED_SLASHES);exit;}
function authUser():array{$h=$_SERVER['HTTP_AUTHORIZATION']??'';if(!preg_match('/^Bearer\s+(.+)$/i',$h,$m))out(401,['ok'=>false,'error'=>'Sign in before uploading.']);$ch=curl_init('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.FIREBASE_API_KEY);curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['idToken'=>trim($m[1])]),CURLOPT_TIMEOUT=>12]);$r=json_decode((string)curl_exec($ch),true);curl_close($ch);if(empty($r['users'][0]['localId']))out(401,['ok'=>false,'error'=>'Session expired. Sign in again.']);return $r['users'][0];}
if($_SERVER['REQUEST_METHOD']!=='POST')out(405,['ok'=>false,'error'=>'POST required']);authUser();
$dir=__DIR__.'/uploads/products/';if(!is_dir($dir)&&!mkdir($dir,0755,true)&&!is_dir($dir))out(500,['ok'=>false,'error'=>'Upload folder is unavailable.']);
$images=[];$allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];$finfo=new finfo(FILEINFO_MIME_TYPE);
if(isset($_FILES['images']['tmp_name']))foreach((array)$_FILES['images']['tmp_name'] as $i=>$tmp){if((($_FILES['images']['error'][$i]??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK))continue;if((int)($_FILES['images']['size'][$i]??0)>5*1024*1024)out(413,['ok'=>false,'error'=>'Each compressed image must be 5MB or smaller.']);$mime=$finfo->file($tmp);if(!isset($allowed[$mime]))out(415,['ok'=>false,'error'=>'Only JPG, PNG and WebP images are supported.']);$file=bin2hex(random_bytes(12)).'.'.$allowed[$mime];if(!move_uploaded_file($tmp,$dir.$file))out(500,['ok'=>false,'error'=>'An image could not be uploaded.']);$images[]='uploads/products/'.$file;}
if(!$images)out(422,['ok'=>false,'error'=>'No images were received.']);out(200,['ok'=>true,'images'=>$images]);
