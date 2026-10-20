<?php
/* Temporary, read-only Teyza server health probe.
 * No user data, absolute paths, Firebase tokens, or credentials are exposed.
 * Delete this endpoint once the deployment has been diagnosed.
 * Written with PHP 7 syntax so it can report a PHP 8.1+ compatibility problem.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
ini_set('display_errors','0');
$privateRoot=dirname(__DIR__).'/../private_html';
$sellerDir=$privateRoot.'/teyza-data';
$helper=__DIR__.'/teyza-firebase-verify.php';
$checks=array(
  'php_at_least_8_1'=>version_compare(PHP_VERSION,'8.1.0','>='),
  'firebase_verifier_present'=>is_file($helper)&&is_readable($helper),
  'private_html_exists'=>@is_dir($privateRoot),
  'teyza_data_exists'=>@is_dir($sellerDir),
  'teyza_data_readable'=>@is_dir($sellerDir)&&@is_readable($sellerDir),
  'teyza_data_writable'=>@is_dir($sellerDir)&&@is_writable($sellerDir),
  'curl_extension'=>extension_loaded('curl'),
  'openssl_extension'=>extension_loaded('openssl'),
  'json_extension'=>extension_loaded('json')
);
$problems=array();
foreach($checks as $key=>$passed) if(!$passed)$problems[]=$key;
http_response_code(200); // Health check must remain readable even when workspace is not.
echo json_encode(array(
  'release'=>'TEYZA_PHP_WORKSPACE_500_RECOVERY_20261020',
  'ok'=>count($problems)===0,
  'checks'=>$checks,
  'failing_checks'=>$problems,
  'next_step'=>count($problems)===0?
    'Environment checks passed. Check the PHP error log for an application-level exception.':
    'Correct failing server checks in cPanel. Do not reset or delete shop records.'
),JSON_UNESCAPED_SLASHES);
