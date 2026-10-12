<?php
declare(strict_types=1);

const TEYZA_FIREBASE_API_KEY='AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U';

function teyzaJson(int $status,array $data): never {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data,JSON_UNESCAPED_SLASHES);
  exit;
}

function teyzaPrivateRoot(): string {
  return dirname(__DIR__).'/../private_html';
}

function teyzaDataDir(): string {
  $dir=teyzaPrivateRoot().'/teyza-data';
  if(!is_dir($dir)&&!mkdir($dir,0750,true)&&!is_dir($dir)){
    teyzaJson(500,['ok'=>false,'error'=>'Teyza seller storage is unavailable.']);
  }
  return $dir;
}

function teyzaPaymentDir(): string {
  $dir=teyzaPrivateRoot().'/teyza-payments';
  if(!is_dir($dir)&&!mkdir($dir,0750,true)&&!is_dir($dir)){
    teyzaJson(500,['ok'=>false,'error'=>'Teyza payment storage is unavailable.']);
  }
  return $dir;
}

function teyzaTransactionDir(): string {
  $dir=teyzaPaymentDir().'/transactions';
  if(!is_dir($dir)&&!mkdir($dir,0750,true)&&!is_dir($dir)){
    teyzaJson(500,['ok'=>false,'error'=>'Teyza transaction storage is unavailable.']);
  }
  return $dir;
}

function teyzaConfig(): array {
  $configFile=teyzaPaymentDir().'/config.php';
  $config=[];

  if(is_file($configFile)){
    $loaded=require $configFile;
    if(is_array($loaded))$config=$loaded;
  }

  $secret=(string)(getenv('PAYSTACK_SECRET_KEY')?:($config['secret_key']??''));

  return array_merge([
    'secret_key'=>$secret,
    'site_url'=>'https://teyza.co.za',
    'currency'=>'ZAR',
    'callback_url'=>'https://teyza.co.za/payment-success.html',
    'channels'=>[],
    'split_mode'=>'none',
    'platform_fee_percent'=>0,
    'platform_fee_flat_zar'=>0,
    'bearer'=>'account'
  ],$config,['secret_key'=>$secret]);
}

function teyzaPaystackSecret(): string {
  $secret=trim((string)(teyzaConfig()['secret_key']??''));
  if($secret===''||!str_starts_with($secret,'sk_')){
    teyzaJson(503,['ok'=>false,'error'=>'Paystack is not configured yet. Add the secret key in private_html/teyza-payments/config.php.']);
  }
  return $secret;
}

function teyzaPaystackRequest(string $method,string $path,?array $payload=null): array {
  $url='https://api.paystack.co'.$path;
  $headers=[
    'Authorization: Bearer '.teyzaPaystackSecret(),
    'Accept: application/json'
  ];

  $ch=curl_init($url);
  $options=[
    CURLOPT_RETURNTRANSFER=>true,
    CURLOPT_CUSTOMREQUEST=>$method,
    CURLOPT_HTTPHEADER=>$headers,
    CURLOPT_TIMEOUT=>25,
    CURLOPT_CONNECTTIMEOUT=>10
  ];

  if($payload!==null){
    $headers[]='Content-Type: application/json';
    $options[CURLOPT_HTTPHEADER]=$headers;
    $options[CURLOPT_POSTFIELDS]=json_encode($payload,JSON_UNESCAPED_SLASHES);
  }

  curl_setopt_array($ch,$options);
  $raw=curl_exec($ch);
  $error=curl_error($ch);
  $code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
  curl_close($ch);

  if($raw===false){
    throw new RuntimeException('Unable to reach Paystack: '.$error);
  }

  $data=json_decode((string)$raw,true);
  if(!is_array($data)){
    throw new RuntimeException('Paystack returned an invalid response.');
  }

  if($code<200||$code>=300||empty($data['status'])){
    $message=(string)($data['message']??'Paystack request failed.');
    throw new RuntimeException($message);
  }

  return $data;
}

function teyzaSellerPath(string $uid): string {
  $uid=preg_replace('/[^A-Za-z0-9_-]/','',$uid);
  return teyzaDataDir().'/'.$uid.'.json';
}

function teyzaLoadSellerByBusinessId(string $businessId): ?array {
  $businessId=trim($businessId);
  if($businessId==='')return null;

  foreach(glob(teyzaDataDir().'/*.json')?:[] as $path){
    $workspace=json_decode((string)file_get_contents($path),true);
    if(!is_array($workspace))continue;

    if((string)($workspace['business']['businessId']??'')===$businessId){
      $workspace['_path']=$path;
      return $workspace;
    }
  }

  return null;
}

function teyzaLoadSellerByUid(string $uid): ?array {
  $path=teyzaSellerPath($uid);
  if(!is_file($path))return null;

  $workspace=json_decode((string)file_get_contents($path),true);
  if(!is_array($workspace))return null;

  $workspace['_path']=$path;
  return $workspace;
}

function teyzaSellerApproved(array $workspace): bool {
  return strtolower((string)($workspace['companyApproval']['status']??'pending'))==='approved';
}

function teyzaFindProduct(array $workspace,string $productId): ?array {
  foreach(($workspace['products']??[]) as $product){
    if((string)($product['id']??'')===$productId)return $product;
  }
  return null;
}

function teyzaProductPublic(array $workspace,array $product): bool {
  if(!teyzaSellerApproved($workspace))return false;

  $status=strtolower((string)($product['verificationStatus']??'pending'));
  if(!in_array($status,['approved','active'],true))return false;

  if((int)($product['stock']??0)<=0)return false;

  $channels=is_array($product['channels']??null)?$product['channels']:[];
  $publishing=is_array($product['publishing']??null)?$product['publishing']:[];
  $normalizedChannels=[];
  foreach($channels as $channel){
    if(is_string($channel))$normalizedChannels[]=strtolower($channel);
  }

  $teyzaSelected=in_array('teyza',$normalizedChannels,true);
  $teyzaPublished=strtolower((string)($publishing['teyza']['status']??''))==='published';

  return $teyzaSelected||$teyzaPublished;
}

function teyzaPublicProduct(array $workspace,array $product): array {
  $business=$workspace['business']??[];
  $delivery=$workspace['settings']['delivery']??[];

  return [
    'id'=>$product['id']??'',
    'sellerId'=>$business['businessId']??'',
    'name'=>$product['name']??'Product',
    'description'=>$product['desc']??'',
    'category'=>$product['category']??'',
    'brand'=>$product['brand']??'',
    'condition'=>$product['condition']??'',
    'price'=>(float)($product['price']??0),
    'stock'=>(int)($product['stock']??0),
    'images'=>array_values(array_filter(is_array($product['images']??null)?$product['images']:[],'is_string')),
    'seller'=>[
      'businessName'=>$business['businessName']??'Teyza seller',
      'logoUrl'=>$business['logoUrl']??''
    ],
    'delivery'=>[
      'mode'=>$delivery['fulfilmentMode']??'courier',
      'provider'=>$delivery['courierPreference']??'',
      'fee'=>(float)($delivery['baseDeliveryFee']??0)
    ]
  ];
}

function teyzaReference(): string {
  return 'TYZ_'.gmdate('YmdHis').'_'.strtoupper(bin2hex(random_bytes(4)));
}

function teyzaOrderNumber(): string {
  return '#TZ-'.strtoupper(substr(bin2hex(random_bytes(5)),0,8));
}

function teyzaIndexPath(string $reference): string {
  $safe=preg_replace('/[^A-Za-z0-9_-]/','',$reference);
  return teyzaTransactionDir().'/'.$safe.'.json';
}

function teyzaWriteIndex(string $reference,array $index): void {
  file_put_contents(
    teyzaIndexPath($reference),
    json_encode($index,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),
    LOCK_EX
  );
}

function teyzaReadIndex(string $reference): ?array {
  $path=teyzaIndexPath($reference);
  if(!is_file($path))return null;
  $data=json_decode((string)file_get_contents($path),true);
  return is_array($data)?$data:null;
}

function teyzaUpdateSellerWorkspace(string $path,callable $callback): array {
  $handle=fopen($path,'c+');
  if(!$handle)throw new RuntimeException('Unable to open seller workspace.');

  try{
    if(!flock($handle,LOCK_EX))throw new RuntimeException('Unable to lock seller workspace.');

    rewind($handle);
    $raw=stream_get_contents($handle);
    $workspace=$raw!==''?json_decode($raw,true):[];

    if(!is_array($workspace))throw new RuntimeException('Seller workspace is invalid.');

    $workspace=$callback($workspace);

    rewind($handle);
    ftruncate($handle,0);
    fwrite($handle,json_encode($workspace,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));
    fflush($handle);
    flock($handle,LOCK_UN);

    return $workspace;
  }finally{
    fclose($handle);
  }
}

function teyzaFindOrderIndex(array $workspace,string $reference): int {
  foreach(($workspace['orders']??[]) as $i=>$order){
    if((string)($order['payment']['reference']??'')===$reference)return (int)$i;
  }
  return -1;
}

function teyzaReconcileSuccessfulPayment(string $reference,array $paystackData): array {
  $index=teyzaReadIndex($reference);
  if(!$index)throw new RuntimeException('Teyza payment reference was not found.');

  $sellerUid=(string)($index['sellerUid']??'');
  $path=teyzaSellerPath($sellerUid);
  if(!is_file($path))throw new RuntimeException('Seller workspace was not found.');

  $expectedAmount=(int)($index['amountCents']??0);
  $receivedAmount=(int)($paystackData['amount']??0);
  $currency=strtoupper((string)($paystackData['currency']??''));

  if($expectedAmount<=0||$receivedAmount!==$expectedAmount||$currency!=='ZAR'){
    throw new RuntimeException('Payment amount or currency did not match the Teyza order.');
  }

  $workspace=teyzaUpdateSellerWorkspace($path,function(array $workspace) use ($reference,$paystackData){
    $i=teyzaFindOrderIndex($workspace,$reference);
    if($i<0)throw new RuntimeException('Order was not found for this payment.');

    $order=$workspace['orders'][$i];

    if(($order['paymentStatus']??'')==='paid'){
      return $workspace;
    }

    $order['paymentStatus']='paid';
    $order['orderStatus']=$order['orderStatus']??'new';
    $order['updatedAt']=gmdate('c');
    $order['payment']=$order['payment']??[];
    $order['payment']['status']='paid';
    $order['payment']['paidAt']=$paystackData['paid_at']??gmdate('c');
    $order['payment']['channel']=$paystackData['channel']??null;
    $order['payment']['gatewayResponse']=$paystackData['gateway_response']??null;
    $order['payment']['paystackFeesCents']=$paystackData['fees']??null;

    if(empty($order['payment']['stockAdjusted'])){
      foreach(($order['items']??[]) as $item){
        $productId=(string)($item['productId']??'');
        $qty=max(1,(int)($item['quantity']??1));

        foreach(($workspace['products']??[]) as $pIndex=>$product){
          if((string)($product['id']??'')!==$productId)continue;

          $stock=(int)($product['stock']??0);
          if($stock>=$qty){
            $workspace['products'][$pIndex]['stock']=$stock-$qty;
          }else{
            $order['fulfilment']=$order['fulfilment']??[];
            $order['fulfilment']['stockIssue']=true;
            $order['fulfilment']['stockIssueAt']=gmdate('c');
          }
          break;
        }
      }

      $order['payment']['stockAdjusted']=true;
    }

    $workspace['orders'][$i]=$order;
    return $workspace;
  });

  $i=teyzaFindOrderIndex($workspace,$reference);
  return $workspace['orders'][$i]??[];
}

function teyzaBearerToken(): string {
  $header=$_SERVER['HTTP_AUTHORIZATION']??'';
  if(preg_match('/^Bearer\s+(.+)$/i',$header,$match))return trim($match[1]);
  return '';
}

function teyzaFirebaseUser(): array {
  $token=teyzaBearerToken();
  if($token==='')teyzaJson(401,['ok'=>false,'error'=>'Authentication required.']);

  $url='https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.rawurlencode(TEYZA_FIREBASE_API_KEY);

  $ch=curl_init($url);
  curl_setopt_array($ch,[
    CURLOPT_POST=>true,
    CURLOPT_RETURNTRANSFER=>true,
    CURLOPT_HTTPHEADER=>['Content-Type: application/json'],
    CURLOPT_POSTFIELDS=>json_encode(['idToken'=>$token]),
    CURLOPT_TIMEOUT=>15
  ]);

  $raw=curl_exec($ch);
  $code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
  curl_close($ch);

  $data=json_decode((string)$raw,true);

  if($code!==200||empty($data['users'][0]['localId'])){
    teyzaJson(401,['ok'=>false,'error'=>'Your session is no longer valid. Please sign in again.']);
  }

  return $data['users'][0];
}
