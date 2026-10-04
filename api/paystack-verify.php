<?php
declare(strict_types=1);
require_once __DIR__.'/_paystack.php';

$reference=trim((string)($_GET['reference']??''));
if($reference==='')teyzaJson(422,['ok'=>false,'error'=>'Payment reference is required.']);

$index=teyzaReadIndex($reference);
if(!$index)teyzaJson(404,['ok'=>false,'error'=>'Teyza could not find this payment reference.']);

$sellerWorkspace=teyzaLoadSellerByUid((string)($index['sellerUid']??''));

try{
  $paystack=teyzaPaystackRequest('GET','/transaction/verify/'.rawurlencode($reference));
}catch(Throwable $e){
  teyzaJson(502,['ok'=>false,'error'=>'Paystack verification failed: '.$e->getMessage()]);
}

$data=$paystack['data']??[];
$status=strtolower((string)($data['status']??'pending'));
$order=null;

if($status==='success'){
  try{
    $order=teyzaReconcileSuccessfulPayment($reference,$data);
    $sellerWorkspace=teyzaLoadSellerByUid((string)($index['sellerUid']??''));
  }catch(Throwable $e){
    teyzaJson(409,['ok'=>false,'error'=>$e->getMessage()]);
  }
}else if($sellerWorkspace){
  $i=teyzaFindOrderIndex($sellerWorkspace,$reference);
  if($i>=0)$order=$sellerWorkspace['orders'][$i];
}

$sellerName=$sellerWorkspace['business']['businessName']??'Teyza seller';

$publicOrder=$order?[
  'orderNumber'=>$order['orderNumber']??($index['orderNumber']??''),
  'sellerName'=>$sellerName,
  'total'=>(float)($order['total']??((int)$index['amountCents']/100))
]:[
  'orderNumber'=>$index['orderNumber']??'',
  'sellerName'=>$sellerName,
  'total'=>(float)(((int)$index['amountCents'])/100)
];

teyzaJson(200,[
  'ok'=>true,
  'paymentStatus'=>$status==='success'?'paid':($status?:'pending'),
  'order'=>$publicOrder
]);
