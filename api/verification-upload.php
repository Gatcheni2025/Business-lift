<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
const FIREBASE_API_KEY='AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';
function out(int $s,array $d):never{http_response_code($s);echo json_encode($d,JSON_UNESCAPED_SLASHES);exit;}
function authUser():array{$h=$_SERVER['HTTP_AUTHORIZATION']??'';if(!preg_match('/^Bearer\s+(.+)$/i',$h,$m))out(401,['ok'=>false,'error'=>'Authentication required']);$ch=curl_init('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.rawurlencode(FIREBASE_API_KEY));curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['idToken'=>trim($m[1])]),CURLOPT_TIMEOUT=>12]);$raw=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);$j=json_decode((string)$raw,true);if($code!==200||empty($j['users'][0]['localId']))out(401,['ok'=>false,'error'=>'Your session is no longer valid']);return $j['users'][0];}
if($_SERVER['REQUEST_METHOD']!=='POST')out(405,['ok'=>false,'error'=>'Method not allowed']);
function iniBytes(string $value):int {
 $value=trim($value);$number=(float)$value;
 return (int)($number*match(strtolower(substr($value,-1))){'g'=>1073741824,'m'=>1048576,'k'=>1024,default=>1});
}
function uploadedFile(string $key,string $label):array {
 $file=$_FILES[$key]??null;$error=(int)($file['error']??UPLOAD_ERR_NO_FILE);
 if($error===UPLOAD_ERR_INI_SIZE||$error===UPLOAD_ERR_FORM_SIZE)out(413,['ok'=>false,'error'=>$label.' exceeds the server upload limit ('.ini_get('upload_max_filesize').'). Choose a smaller file.','code'=>'upload_too_large']);
 if($error===UPLOAD_ERR_PARTIAL)out(422,['ok'=>false,'error'=>$label.' was only partially uploaded. Please select the file and try again.','code'=>'upload_incomplete']);
 if($error===UPLOAD_ERR_NO_FILE)out(422,['ok'=>false,'error'=>'Choose '.$label.' before uploading.','code'=>'file_required']);
 if($error!==UPLOAD_ERR_OK)out(500,['ok'=>false,'error'=>'The server could not receive '.$label.'. Please try again later.','code'=>'upload_storage_error']);
 return $file;
}
$postLimit=iniBytes((string)ini_get('post_max_size'));
if($postLimit>0&&(int)($_SERVER['CONTENT_LENGTH']??0)>$postLimit)out(413,['ok'=>false,'error'=>'The upload exceeds the server request limit ('.ini_get('post_max_size').'). Choose smaller files.','code'=>'request_too_large']);
$u=authUser();$type=(string)($_POST['type']??'proof');
$uid=preg_replace('/[^A-Za-z0-9_-]/','',$u['localId']);
$verificationBase=dirname(__DIR__).'/../private_html/teyza-verification/'.$uid;
$dataPath=dirname(__DIR__).'/../private_html/teyza-data/'.$uid.'.json';

function loadWorkspaceFile(string $path):array{
 $w=is_file($path)?json_decode((string)file_get_contents($path),true):null;
 if(!is_array($w))out(404,['ok'=>false,'error'=>'Workspace not found']);
 return $w;
}

function ensureVerificationDir(string $base):void{
 if(!is_dir($base)&&!mkdir($base,0750,true)&&!is_dir($base)){
  out(500,['ok'=>false,'error'=>'Private verification storage is unavailable']);
 }
}

if($type==='identity-document-draft'){
 $doc=uploadedFile('document','an identity document');
 if((int)$doc['size']>8*1024*1024)out(413,['ok'=>false,'error'=>'Identity document must be 8 MB or smaller']);

 $fi=new finfo(FILEINFO_MIME_TYPE);
 $mime=$fi->file($doc['tmp_name']);
 $ext=['application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png'][$mime]??null;
 if(!$ext)out(415,['ok'=>false,'error'=>'Use PDF, JPG or PNG for the identity document']);

 ensureVerificationDir($verificationBase);
 foreach(glob($verificationBase.'/identity-document-draft.*')?:[] as $old)@unlink($old);

 $stored='identity-document-draft.'.$ext;
 if(!move_uploaded_file($doc['tmp_name'],$verificationBase.'/'.$stored))out(500,['ok'=>false,'error'=>'Could not save the identity document']);

 $w=loadWorkspaceFile($dataPath);
 $w['verification']=$w['verification']??[];
 $w['verification']['identityDraft']=$w['verification']['identityDraft']??[];
 $w['verification']['identityDraft']['documentStoredName']=$stored;
 $w['verification']['identityDraft']['documentOriginalName']=basename((string)$doc['name']);
 $w['verification']['identityDraft']['documentMime']=$mime;
 $w['verification']['identityDraft']['documentUploadedAt']=gmdate('c');

 file_put_contents($dataPath,json_encode($w,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);
 out(200,['ok'=>true,'draft'=>['documentSaved'=>true,'documentOriginalName'=>$w['verification']['identityDraft']['documentOriginalName']]]);
}

if($type==='identity-selfie-draft'){
 $selfie=uploadedFile('selfie','a live selfie');
 if((int)$selfie['size']>5*1024*1024)out(413,['ok'=>false,'error'=>'Live selfie must be 5 MB or smaller']);

 $fi=new finfo(FILEINFO_MIME_TYPE);
 $mime=$fi->file($selfie['tmp_name']);
 $ext=['image/jpeg'=>'jpg','image/png'=>'png'][$mime]??null;
 if(!$ext)out(415,['ok'=>false,'error'=>'Use JPG or PNG for the live selfie']);

 ensureVerificationDir($verificationBase);
 foreach(glob($verificationBase.'/identity-selfie-draft.*')?:[] as $old)@unlink($old);

 $stored='identity-selfie-draft.'.$ext;
 if(!move_uploaded_file($selfie['tmp_name'],$verificationBase.'/'.$stored))out(500,['ok'=>false,'error'=>'Could not save the live selfie']);

 $w=loadWorkspaceFile($dataPath);
 $w['verification']=$w['verification']??[];
 $w['verification']['identityDraft']=$w['verification']['identityDraft']??[];
 $w['verification']['identityDraft']['selfieStoredName']=$stored;
 $w['verification']['identityDraft']['selfieMime']=$mime;
 $w['verification']['identityDraft']['selfieUploadedAt']=gmdate('c');

 file_put_contents($dataPath,json_encode($w,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);
 out(200,['ok'=>true,'draft'=>['selfieSaved'=>true]]);
}

if($type==='identity-submit'){
 if(($_POST['consent']??'')!=='yes')out(422,['ok'=>false,'error'=>'Consent is required for identity verification']);

 $w=loadWorkspaceFile($dataPath);
 $draft=$w['verification']['identityDraft']??[];

 $docStored=(string)($draft['documentStoredName']??'');
 $selfieStored=(string)($draft['selfieStoredName']??'');

 if($docStored===''||!is_file($verificationBase.'/'.$docStored))out(422,['ok'=>false,'error'=>'Save the identity document before submitting']);
 if($selfieStored===''||!is_file($verificationBase.'/'.$selfieStored))out(422,['ok'=>false,'error'=>'Save the live selfie before submitting']);

 $docExt=pathinfo($docStored,PATHINFO_EXTENSION);
 $selfieExt=pathinfo($selfieStored,PATHINFO_EXTENSION);

 $docName='identity-document.'.$docExt;
 $selfieName='identity-selfie.'.$selfieExt;

 foreach(glob($verificationBase.'/identity-document.*')?:[] as $old)@unlink($old);
 foreach(glob($verificationBase.'/identity-selfie.*')?:[] as $old)@unlink($old);

 if(!rename($verificationBase.'/'.$docStored,$verificationBase.'/'.$docName))out(500,['ok'=>false,'error'=>'Could not finalize the identity document']);
 if(!rename($verificationBase.'/'.$selfieStored,$verificationBase.'/'.$selfieName))out(500,['ok'=>false,'error'=>'Could not finalize the live selfie']);

 $submittedAt=gmdate('c');
 $w['verification']=$w['verification']??[];
 $w['verification']['identity']=[
  'status'=>'pending',
  'verified'=>false,
  'documentName'=>$docName,
  'documentOriginalName'=>(string)($draft['documentOriginalName']??'Identity document'),
  'documentMime'=>(string)($draft['documentMime']??'application/octet-stream'),
  'selfieName'=>$selfieName,
  'selfieMime'=>(string)($draft['selfieMime']??'image/jpeg'),
  'consentAt'=>$submittedAt,
  'submittedAt'=>$submittedAt
 ];

 unset($w['verification']['identityDraft']);

 $w['companyApproval']=$w['companyApproval']??[];
 $w['companyApproval']['status']='pending';
 $w['companyApproval']['submittedAt']=$submittedAt;
 $w['companyApproval']['reviewedAt']=null;
 $w['companyApproval']['reviewedBy']=null;
 $w['companyApproval']['note']='Identity package submitted for Teyza review';

 file_put_contents($dataPath,json_encode($w,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);
 out(200,['ok'=>true,'identity'=>['status'=>'pending','submittedAt'=>$submittedAt],'companyApproval'=>['status'=>'pending','submittedAt'=>$submittedAt]]);
}

if($type==='identity'){
 $doc=uploadedFile('document','an identity document');$selfie=uploadedFile('selfie','a live selfie');
 if(($_POST['consent']??'')!=='yes')out(422,['ok'=>false,'error'=>'Consent is required for identity verification']);
 $base=$verificationBase;if(!is_dir($base)&&!mkdir($base,0750,true)&&!is_dir($base))out(500,['ok'=>false,'error'=>'Private verification storage is unavailable']);
 $fi=new finfo(FILEINFO_MIME_TYPE);$doc=$_FILES['document'];$selfie=$_FILES['selfie'];if((int)$doc['size']>8*1024*1024||(int)$selfie['size']>5*1024*1024)out(413,['ok'=>false,'error'=>'Verification file is too large']);
 $docMime=$fi->file($doc['tmp_name']);$docExt=['application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png'][$docMime]??null;$selfieMime=$fi->file($selfie['tmp_name']);$selfieExt=['image/jpeg'=>'jpg','image/png'=>'png'][$selfieMime]??null;if(!$docExt||!$selfieExt)out(415,['ok'=>false,'error'=>'Use PDF/JPG/PNG for ID and JPG/PNG for selfie']);
 foreach(glob($base.'/identity-*')?:[] as $old)@unlink($old);$docName='identity-document.'.$docExt;$selfieName='identity-selfie.'.$selfieExt;if(!move_uploaded_file($doc['tmp_name'],$base.'/'.$docName)||!move_uploaded_file($selfie['tmp_name'],$base.'/'.$selfieName))out(500,['ok'=>false,'error'=>'Could not store identity files']);
 $path=$dataPath;$w=is_file($path)?json_decode((string)file_get_contents($path),true):null;if(!is_array($w))out(404,['ok'=>false,'error'=>'Workspace not found']);$w['verification']=$w['verification']??[];$submittedAt=gmdate('c');$w['verification']['identity']=['status'=>'pending','verified'=>false,'documentName'=>$docName,'documentOriginalName'=>basename((string)$doc['name']),'documentMime'=>$docMime,'selfieName'=>$selfieName,'selfieMime'=>$selfieMime,'consentAt'=>$submittedAt,'submittedAt'=>$submittedAt];$w['companyApproval']=$w['companyApproval']??[];$w['companyApproval']['status']='pending';$w['companyApproval']['submittedAt']=$submittedAt;$w['companyApproval']['reviewedAt']=null;$w['companyApproval']['reviewedBy']=null;$w['companyApproval']['note']='Identity package submitted for Teyza review';file_put_contents($path,json_encode($w,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);out(200,['ok'=>true,'identity'=>['status'=>'pending','submittedAt'=>$submittedAt],'companyApproval'=>['status'=>'pending','submittedAt'=>$submittedAt]]);
}
uploadedFile('proof','a proof of address document');
$f=$_FILES['proof'];if((int)$f['size']>8*1024*1024)out(413,['ok'=>false,'error'=>'File must be 8 MB or smaller']);
$fi=new finfo(FILEINFO_MIME_TYPE);$mime=$fi->file($f['tmp_name']);$ext=['application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png'][$mime]??null;if(!$ext)out(415,['ok'=>false,'error'=>'Only PDF, JPG and PNG files are accepted']);
$dataDir=dirname(__DIR__).'/../private_html/teyza-data';$path=$dataDir.'/'.$uid.'.json';$w=is_file($path)?json_decode((string)file_get_contents($path),true):null;if(!is_array($w))out(404,['ok'=>false,'error'=>'Workspace not found']);
$location=$w['verification']['location']??[];$businessAddress=trim((string)($w['business']['address']??''));$mapAddress=trim((string)($location['address']??''));
$norm=function(string $value):string{return strtolower((string)preg_replace('/\s+/u',' ',trim($value)));};
if(empty($location['confirmed'])||!isset($location['lat'],$location['lng'])||$businessAddress===''||$mapAddress===''||$norm($businessAddress)!==$norm($mapAddress))out(422,['ok'=>false,'error'=>'Confirm the business address on the map before uploading proof of address']);
$base=dirname(__DIR__).'/../private_html/teyza-verification/'.$uid;if(!is_dir($base)&&!mkdir($base,0750,true)&&!is_dir($base))out(500,['ok'=>false,'error'=>'Private verification storage is unavailable']);
foreach(glob($base.'/proof-of-address.*')?:[] as $old)@unlink($old);$stored='proof-of-address.'.$ext;if(!move_uploaded_file($f['tmp_name'],$base.'/'.$stored))out(500,['ok'=>false,'error'=>'Could not store document']);
$w['verification']=$w['verification']??[];$w['verification']['proofOfAddress']=[
 'storedName'=>$stored,
 'originalName'=>basename((string)$f['name']),
 'mime'=>$mime,
 'uploadedAt'=>gmdate('c'),
 'addressAtUpload'=>$mapAddress,
 'latAtUpload'=>$location['lat'],
 'lngAtUpload'=>$location['lng'],
 'addressMatchVerified'=>false,
 'matchStatus'=>'pending_review'
];
$w['companyApproval']=$w['companyApproval']??[];$w['companyApproval']['status']='pending';$w['companyApproval']['reviewedAt']=null;$w['companyApproval']['reviewedBy']=null;$w['companyApproval']['note']='Proof of address uploaded and awaiting address-match review';
file_put_contents($path,json_encode($w,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),LOCK_EX);
out(200,['ok'=>true,'proofOfAddress'=>['originalName'=>basename((string)$f['name']),'uploadedAt'=>$w['verification']['proofOfAddress']['uploadedAt'],'addressAtUpload'=>$mapAddress,'matchStatus'=>'pending_review']]);
