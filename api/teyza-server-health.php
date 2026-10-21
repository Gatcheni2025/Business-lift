<?php
/* Temporary read-only TEYZA environment diagnostic.
 * Never read or return account contents, token details or absolute paths.
 * Remove this endpoint after restoring the website.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
ini_set('display_errors','0');

$webRoot=dirname(__DIR__);
$privateRoot=$webRoot.'/../private_html';
$privateReal=@realpath($privateRoot);
$webReal=@realpath($webRoot);
$sellerDir=$privateRoot.'/teyza-data';
$chatDir=$privateRoot.'/teyza-chat';
$publicSellerDir=$webRoot.'/teyza-data';
$helper=__DIR__.'/teyza-firebase-verify.php';
$privateOutsidePublic=$privateReal!==false&&$webReal!==false
   &&$privateReal!==$webReal
   &&strpos($privateReal,$webReal.DIRECTORY_SEPARATOR)!==0;
$publicJsonFiles=@glob($publicSellerDir.'/*.json');
$publicHasRecords=is_array($publicJsonFiles)&&count($publicJsonFiles)>0;
$checks=array(
  'php_at_least_8_1'=>version_compare(PHP_VERSION,'8.1.0','>='),
  'firebase_verifier_present'=>is_file($helper)&&is_readable($helper),
  'private_html_exists'=>@is_dir($privateRoot),
  'private_html_outside_public_root'=>$privateOutsidePublic,
  'teyza_data_exists'=>@is_dir($sellerDir),
  'teyza_data_readable'=>@is_dir($sellerDir)&&@is_readable($sellerDir),
  'teyza_data_writable'=>@is_dir($sellerDir)&&@is_writable($sellerDir),
  'chat_storage_available'=>@is_dir($chatDir)?
      (@is_readable($chatDir)&&@is_writable($chatDir)):
      (@is_dir($privateRoot)&&@is_writable($privateRoot)),
  'curl_extension'=>extension_loaded('curl'),
  'openssl_extension'=>extension_loaded('openssl'),
  'json_extension'=>extension_loaded('json'),
);
$fail=array();
foreach($checks as $name=>$passed)if(!$passed)$fail[]=$name;
$warnings=array();
if($publicHasRecords)$warnings[]='PUBLIC_WEB_ROOT_SELLER_JSON_FOUND';
if(!$privateOutsidePublic && @is_dir($privateRoot))
  $warnings[]='PRIVATE_DIRECTORY_NOT_OUTSIDE_WEB_ROOT';
http_response_code(200);
echo json_encode(array(
  'release'=>'TEYZA_STORAGE_DIAGNOSTIC_R1_20261021',
  'ok'=>count($fail)===0&&count($warnings)===0,
  'checks'=>$checks,
  'failing_checks'=>$fail,
  'security_warnings'=>$warnings,
  'public_seller_records_detected'=>$publicHasRecords,
  'next_step'=>$publicHasRecords?
   'Potential seller data exposure: restrict public teyza-data access, back up and carefully migrate existing files outside the document root. Do not overwrite existing private shop files.':
   (count($fail)>0?
    'Check the failing private folder, PHP version and auth helper settings in hosting File Manager. Do not delete or recreate seller records.':
    'Storage environment appears ready. Inspect PHP error logs if workspace still fails.')
),JSON_UNESCAPED_SLASHES);
