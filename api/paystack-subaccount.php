<?php
declare(strict_types=1);
require_once __DIR__.'/_paystack.php';

$user=teyzaFirebaseUser();
$uid=(string)$user['localId'];
$workspace=teyzaLoadSellerByUid($uid);

if(!$workspace){
  teyzaJson(404,['ok'=>false,'error'=>'Seller workspace not found.']);
}

$action=(string)($_GET['action']??'banks');

function teyzaPaystackBanks(): array {
  $data=teyzaPaystackRequest(
    'GET',
    '/bank?currency=ZAR&enabled_for_verification=true&perPage=100'
  );

  $banks=[];

  foreach(($data['data']??[]) as $bank){
    if(isset($bank['active'])&&!$bank['active'])continue;
    if(isset($bank['enabled_for_verification'])&&!$bank['enabled_for_verification'])continue;

    $code=trim((string)($bank['code']??''));
    if($code==='')continue;

    $banks[]=[
      'name'=>$bank['name']??'Bank',
      'code'=>$code,
      'slug'=>$bank['slug']??''
    ];
  }

  usort($banks,function(array $a,array $b){
    return strcmp((string)$a['name'],(string)$b['name']);
  });

  return $banks;
}

function teyzaFindBank(string $bankCode): ?array {
  foreach(teyzaPaystackBanks() as $bank){
    if((string)$bank['code']===$bankCode)return $bank;
  }
  return null;
}

function teyzaValidateSouthAfricanBankAccount(
  string $bankCode,
  string $accountNumber,
  string $accountName,
  string $accountOwnership,
  string $documentType,
  string $documentNumber
): array {
  if(!in_array($accountOwnership,['personal','business'],true)){
    throw new RuntimeException('Account ownership must be personal or business.');
  }

  if($accountOwnership==='business'){
    $documentType='businessRegistrationNumber';
  }elseif(!in_array($documentType,['identityNumber','passportNumber'],true)){
    throw new RuntimeException('Choose a South African ID number or passport number.');
  }

  $result=teyzaPaystackRequest(
    'POST',
    '/bank/validate',
    [
      'bank_code'=>$bankCode,
      'country_code'=>'ZA',
      'account_number'=>$accountNumber,
      'account_name'=>$accountName,
      'account_type'=>$accountOwnership,
      'document_type'=>$documentType,
      'document_number'=>$documentNumber
    ]
  );

  $validation=is_array($result['data']??null)?$result['data']:[];

  if(empty($validation['verified'])){
    $message=trim((string)($validation['verificationMessage']??''));
    if($message==='')$message='Paystack could not verify this South African bank account.';
    throw new RuntimeException($message);
  }

  if(array_key_exists('accountHolderMatch',$validation)&&!$validation['accountHolderMatch']){
    throw new RuntimeException(
      'The account holder name or identification details do not match the bank account.'
    );
  }

  if(array_key_exists('accountOpen',$validation)&&!$validation['accountOpen']){
    throw new RuntimeException('This bank account is not currently open.');
  }

  if(array_key_exists('accountAcceptsCredits',$validation)&&!$validation['accountAcceptsCredits']){
    throw new RuntimeException(
      'This bank account cannot currently receive payout credits.'
    );
  }

  return $validation;
}

if($action==='banks'){
  try{
    teyzaJson(200,['ok'=>true,'banks'=>teyzaPaystackBanks()]);
  }catch(Throwable $e){
    teyzaJson(502,[
      'ok'=>false,
      'error'=>'Unable to load Paystack-verifiable South African banks: '.$e->getMessage()
    ]);
  }
}

if($_SERVER['REQUEST_METHOD']!=='POST'){
  teyzaJson(405,['ok'=>false,'error'=>'Method not allowed.']);
}

$input=json_decode((string)file_get_contents('php://input'),true);

if(!is_array($input)){
  teyzaJson(400,['ok'=>false,'error'=>'Invalid banking request.']);
}

$bankCode=trim((string)($input['bankCode']??''));
$accountNumber=preg_replace('/\D+/','',(string)($input['accountNumber']??''));
$accountName=trim((string)($input['accountName']??''));
$accountOwnership=strtolower(trim((string)($input['accountOwnership']??'')));
$documentType=trim((string)($input['documentType']??''));
$documentNumber=trim((string)($input['documentNumber']??''));

if(
  $bankCode==='' ||
  strlen($accountNumber)<5 ||
  $accountName==='' ||
  !in_array($accountOwnership,['personal','business'],true) ||
  $documentNumber===''
){
  teyzaJson(422,[
    'ok'=>false,
    'error'=>'Complete the bank account, account holder and verification details.'
  ]);
}

if($action==='connect'){
  try{
    $selected=teyzaFindBank($bankCode);

    if(!$selected){
      throw new RuntimeException(
        'This bank is not currently available for Paystack South Africa account validation.'
      );
    }

    $validation=teyzaValidateSouthAfricanBankAccount(
      $bankCode,
      $accountNumber,
      $accountName,
      $accountOwnership,
      $documentType,
      $documentNumber
    );

    $business=$workspace['business']??[];
    $businessName=trim((string)($business['businessName']??''));

    if($businessName===''){
      $businessName='Teyza Seller';
    }

    $subaccountPayload=[
      'business_name'=>$businessName,
      'settlement_bank'=>$bankCode,
      'account_number'=>$accountNumber,
      'percentage_charge'=>0,
      'description'=>'Teyza seller payout account',
      'primary_contact_email'=>$workspace['email']??($user['email']??''),
      'primary_contact_name'=>$workspace['firstName']??$businessName,
      'primary_contact_phone'=>$business['phone']??'',
      'metadata'=>json_encode([
        'teyza_uid'=>$uid,
        'business_id'=>$business['businessId']??'',
        'account_ownership'=>$accountOwnership
      ],JSON_UNESCAPED_SLASHES)
    ];

    $existingCode=trim(
      (string)($workspace['settings']['banking']['paystackSubaccountCode']??'')
    );

    $sub=[];

    if($existingCode!==''){
      try{
        $updated=teyzaPaystackRequest(
          'PUT',
          '/subaccount/'.rawurlencode($existingCode),
          $subaccountPayload
        );
        $sub=$updated['data']??[];
      }catch(Throwable $updateError){
        $created=teyzaPaystackRequest(
          'POST',
          '/subaccount',
          $subaccountPayload
        );
        $sub=$created['data']??[];
      }
    }else{
      $created=teyzaPaystackRequest(
        'POST',
        '/subaccount',
        $subaccountPayload
      );
      $sub=$created['data']??[];
    }

    $subCode=trim((string)($sub['subaccount_code']??''));

    if($subCode===''){
      throw new RuntimeException(
        'Paystack did not return a seller subaccount code.'
      );
    }

    $path=(string)$workspace['_path'];

    $saved=teyzaUpdateSellerWorkspace(
      $path,
      function(array $current) use (
        $selected,
        $bankCode,
        $accountNumber,
        $accountName,
        $accountOwnership,
        $sub,
        $validation
      ){
        $current['settings']=$current['settings']??[];
        $current['settings']['banking']=$current['settings']['banking']??[];

        $bank=&$current['settings']['banking'];

        $bank['bankName']=$selected['name'];
        $bank['paystackBankCode']=$bankCode;
        $bank['accountHolder']=$accountName;
        $bank['accountNumberLast4']=substr($accountNumber,-4);
        $bank['accountType']=ucfirst($accountOwnership);
        $bank['accountOwnership']=$accountOwnership;

        $bank['payoutStatus']='connected';
        $bank['bankValidationStatus']='verified';
        $bank['bankValidatedAt']=gmdate('c');
        $bank['accountAcceptsCredits']=$validation['accountAcceptsCredits']??null;
        $bank['accountHolderMatch']=$validation['accountHolderMatch']??null;

        $bank['paystackSubaccountCode']=$sub['subaccount_code']??'';
        $bank['paystackSubaccountId']=$sub['id']??null;
        $bank['payoutConnectedAt']=gmdate('c');

        unset($bank['accountNumber']);
        unset($bank['branchCode']);
        unset($bank['documentNumber']);
        unset($bank['identityNumber']);
        unset($bank['passportNumber']);
        unset($bank['businessRegistrationNumber']);

        return $current;
      }
    );

    $banking=$saved['settings']['banking']??[];

    teyzaJson(200,[
      'ok'=>true,
      'banking'=>[
        'bankName'=>$banking['bankName']??'',
        'accountHolder'=>$banking['accountHolder']??'',
        'accountNumberLast4'=>$banking['accountNumberLast4']??'',
        'accountType'=>$banking['accountType']??'',
        'accountOwnership'=>$banking['accountOwnership']??'',
        'payoutStatus'=>$banking['payoutStatus']??'connected',
        'bankValidationStatus'=>$banking['bankValidationStatus']??'verified',
        'paystackSubaccountCode'=>$banking['paystackSubaccountCode']??''
      ]
    ]);
  }catch(Throwable $e){
    teyzaJson(422,[
      'ok'=>false,
      'error'=>'Payout account could not be connected: '.$e->getMessage()
    ]);
  }
}

teyzaJson(404,['ok'=>false,'error'=>'Unknown payout action.']);
