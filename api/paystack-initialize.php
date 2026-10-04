<?php
declare(strict_types=1);
require_once __DIR__.'/_paystack.php';

if($_SERVER['REQUEST_METHOD']!=='POST'){
  teyzaJson(405,['ok'=>false,'error'=>'Method not allowed.']);
}

$input=json_decode((string)file_get_contents('php://input'),true);
if(!is_array($input))teyzaJson(400,['ok'=>false,'error'=>'Invalid checkout request.']);

$sellerId=trim((string)($input['seller']??''));
$productId=trim((string)($input['productId']??''));
$quantity=max(1,min(50,(int)($input['quantity']??1)));
$buyer=is_array($input['buyer']??null)?$input['buyer']:[];

$name=trim((string)($buyer['name']??''));
$email=trim((string)($buyer['email']??''));
$phone=trim((string)($buyer['phone']??''));

if($name===''||!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen(preg_replace('/\D+/','',$phone))<9){
  teyzaJson(422,['ok'=>false,'error'=>'Enter a valid buyer name, email and mobile number.']);
}

$workspace=teyzaLoadSellerByBusinessId($sellerId);
if(!$workspace||!teyzaSellerApproved($workspace)){
  teyzaJson(404,['ok'=>false,'error'=>'This seller is not available for checkout.']);
}

$product=teyzaFindProduct($workspace,$productId);
if(!$product||!teyzaProductPublic($workspace,$product)){
  teyzaJson(404,['ok'=>false,'error'=>'This product is not available for purchase.']);
}

$stock=(int)($product['stock']??0);
if($quantity>$stock){
  teyzaJson(409,['ok'=>false,'error'=>"Only {$stock} item(s) are currently available."]);
}

$delivery=$workspace['settings']['delivery']??[];
$mode=(string)($delivery['fulfilmentMode']??'courier');

if(!in_array($mode,['pickup','digital'],true)){
  $address=trim((string)($buyer['address']??''));
  $city=trim((string)($buyer['city']??''));
  $province=trim((string)($buyer['province']??''));

  if($address===''||$city===''||$province===''){
    teyzaJson(422,['ok'=>false,'error'=>'Complete the buyer delivery address.']);
  }
}

$price=(float)($product['price']??0);
$subtotal=round($price*$quantity,2);
$shipping=in_array($mode,['pickup','digital'],true)?0.0:max(0,(float)($delivery['baseDeliveryFee']??0));
$tax=0.0;
$total=round($subtotal+$shipping+$tax,2);

if($total<1){
  teyzaJson(422,['ok'=>false,'error'=>'The order total is too low for Paystack checkout.']);
}

$amountCents=(int)round($total*100);
$config=teyzaConfig();
$splitMode=strtolower((string)($config['split_mode']??'none'));
$banking=$workspace['settings']['banking']??[];
$subaccount=trim((string)($banking['paystackSubaccountCode']??''));

$platformFeeCents=0;
$sellerGrossCents=$amountCents;

if(in_array($splitMode,['percent','flat'],true)){
  if($subaccount===''){
    teyzaJson(409,['ok'=>false,'error'=>'This seller payout account is not connected yet. Please try again later.']);
  }

  if($splitMode==='percent'){
    $percent=max(0,min(100,(float)($config['platform_fee_percent']??0)));
    $platformFeeCents=(int)round($amountCents*($percent/100));
  }else{
    $platformFeeCents=(int)round(max(0,(float)($config['platform_fee_flat_zar']??0))*100);
  }

  $platformFeeCents=min($platformFeeCents,max(0,$amountCents-1));
  $sellerGrossCents=$amountCents-$platformFeeCents;
}

$reference=teyzaReference();
$orderId='ord_'.bin2hex(random_bytes(6));
$orderNumber=teyzaOrderNumber();

$payload=[
  'email'=>$email,
  'amount'=>$amountCents,
  'currency'=>(string)($config['currency']??'ZAR'),
  'reference'=>$reference,
  'callback_url'=>(string)($config['callback_url']??'https://teyza.co.za/payment-success.html'),
  'metadata'=>json_encode([
    'teyza_order_id'=>$orderId,
    'teyza_order_number'=>$orderNumber,
    'seller_business_id'=>$sellerId,
    'product_id'=>$productId,
    'buyer_name'=>$name
  ],JSON_UNESCAPED_SLASHES)
];

$channels=$config['channels']??[];
if(is_array($channels)&&count($channels)>0){
  $payload['channels']=array_values($channels);
}

if(in_array($splitMode,['percent','flat'],true)){
  $payload['subaccount']=$subaccount;
  $payload['transaction_charge']=$platformFeeCents;
  $payload['bearer']=in_array(($config['bearer']??'account'),['account','subaccount'],true)
    ?$config['bearer']
    :'account';
}

try{
  $paystack=teyzaPaystackRequest('POST','/transaction/initialize',$payload);
}catch(Throwable $e){
  teyzaJson(502,['ok'=>false,'error'=>'Paystack could not start the payment: '.$e->getMessage()]);
}

$paystackData=$paystack['data']??[];
$authorizationUrl=(string)($paystackData['authorization_url']??'');
$accessCode=(string)($paystackData['access_code']??'');

if($authorizationUrl===''){
  teyzaJson(502,['ok'=>false,'error'=>'Paystack did not return a checkout URL.']);
}

$order=[
  'id'=>$orderId,
  'orderNumber'=>$orderNumber,
  'customerId'=>'guest_'.substr(hash('sha256',strtolower($email).'|'.$phone),0,16),
  'customerName'=>$name,
  'customerEmail'=>$email,
  'customerPhone'=>$phone,
  'customerAddress'=>[
    'address'=>trim((string)($buyer['address']??'')),
    'city'=>trim((string)($buyer['city']??'')),
    'province'=>trim((string)($buyer['province']??'')),
    'postalCode'=>trim((string)($buyer['postalCode']??''))
  ],
  'customerNote'=>trim((string)($buyer['note']??'')),
  'items'=>[[
    'productId'=>$productId,
    'name'=>$product['name']??'Product',
    'quantity'=>$quantity,
    'price'=>$price,
    'image'=>is_array($product['images']??null)?($product['images'][0]??null):null
  ]],
  'subtotal'=>$subtotal,
  'shipping'=>$shipping,
  'tax'=>$tax,
  'total'=>$total,
  'paymentStatus'=>'pending',
  'orderStatus'=>'new',
  'payment'=>[
    'provider'=>'paystack',
    'reference'=>$reference,
    'accessCode'=>$accessCode,
    'status'=>'pending',
    'splitMode'=>$splitMode,
    'platformFee'=>(float)($platformFeeCents/100),
    'sellerGross'=>(float)($sellerGrossCents/100),
    'bearer'=>$payload['bearer']??'account'
  ],
  'fulfilment'=>[
    'status'=>'new',
    'method'=>$mode,
    'provider'=>$delivery['courierPreference']??'',
    'deliveryFee'=>$shipping
  ],
  'createdAt'=>gmdate('c'),
  'updatedAt'=>gmdate('c')
];

$path=(string)$workspace['_path'];

try{
  teyzaUpdateSellerWorkspace($path,function(array $current) use ($order){
    $current['orders']=$current['orders']??[];
    array_unshift($current['orders'],$order);
    return $current;
  });

  teyzaWriteIndex($reference,[
    'reference'=>$reference,
    'sellerUid'=>$workspace['uid']??basename($path,'.json'),
    'businessId'=>$sellerId,
    'orderId'=>$orderId,
    'orderNumber'=>$orderNumber,
    'amountCents'=>$amountCents,
    'currency'=>'ZAR',
    'createdAt'=>gmdate('c')
  ]);
}catch(Throwable $e){
  teyzaJson(500,['ok'=>false,'error'=>'Payment was initialized but Teyza could not save the order. Contact support with reference '.$reference.'.']);
}

teyzaJson(200,[
  'ok'=>true,
  'reference'=>$reference,
  'orderNumber'=>$orderNumber,
  'authorizationUrl'=>$authorizationUrl,
  'split'=>[
    'mode'=>$splitMode,
    'platformFee'=>(float)($platformFeeCents/100),
    'sellerGross'=>(float)($sellerGrossCents/100)
  ]
]);
