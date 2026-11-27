<?php
declare(strict_types=1);
/** Verify Firebase ID tokens with Google's public securetoken X.509 keys, not a browser-restricted API key. */
function teyzaBase64UrlDecode(string $raw): string|false {
    if ($raw==='' || !preg_match('/^[A-Za-z0-9_-]+$/D',$raw)) return false;
    return base64_decode(strtr($raw,'-_','+/').str_repeat('=',(4-strlen($raw)%4)%4),true);
}
function teyzaVerifiedFirebaseUser(string $jwt,string $projectId='business-lift-3c19c'): array {
    if ($jwt==='' || strlen($jwt)>16384) respond(401,['ok'=>false,'error'=>'Firebase sign-in required.']);
    $parts=explode('.',$jwt);
    if (count($parts)!==3) respond(401,['ok'=>false,'error'=>'Malformed Firebase ID token.']);
    [$header,$payload,$signature]=$parts;
    $hj=teyzaBase64UrlDecode($header);$pj=teyzaBase64UrlDecode($payload);$sig=teyzaBase64UrlDecode($signature);
    if ($hj===false || $pj===false || $sig===false) respond(401,['ok'=>false,'error'=>'Invalid Firebase ID token.']);
    $h=json_decode($hj,true);$p=json_decode($pj,true);
    if (!is_array($h)||!is_array($p)||($h['alg']??'')!=='RS256'
        ||!is_string($h['kid']??null)||!preg_match('/^[A-Za-z0-9_-]{1,200}$/D',$h['kid']))
        respond(401,['ok'=>false,'error'=>'Untrusted Firebase token.']);
    $now=time();$uid=$p['sub']??null;
    if (($p['aud']??null)!==$projectId || ($p['iss']??null)!=='https://securetoken.google.com/'.$projectId
        || !is_string($uid) || $uid==='' || strlen($uid)>128
        || !isset($p['exp'],$p['iat'],$p['auth_time'])
        || !is_int($p['exp']) || !is_int($p['iat']) || !is_int($p['auth_time'])
        || $p['exp']<=$now || $p['iat']>$now+60 || $p['auth_time']>$now+60
        || $p['iat']<=0 || $p['auth_time']<=0)
        respond(401,['ok'=>false,'error'=>'Firebase session expired or belongs to a different project.']);
    if (!extension_loaded('openssl')||!extension_loaded('curl'))
        respond(503,['ok'=>false,'error'=>'Server cannot verify Firebase tokens. Contact website administrator.']);
    $cache=rtrim(sys_get_temp_dir(),DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.'teyza_securetoken_certs.json';
    $certs=null;
    if (is_file($cache) && time()-(int)filemtime($cache)<3000) {
        $cached=json_decode((string)@file_get_contents($cache),true);
        if (is_array($cached)) $certs=$cached;
    }
    if ($certs===null) {
        $url='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
        $ch=curl_init($url);
        curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>12,CURLOPT_CONNECTTIMEOUT=>6,
           CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false]);
        $body=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
        $cached=$status===200&&is_string($body)?json_decode($body,true):null;
        if (!is_array($cached) || !$cached)
            respond(503,['ok'=>false,'error'=>'Firebase verification service temporarily unavailable.']);
        $certs=$cached;@file_put_contents($cache,json_encode($certs),LOCK_EX);
    }
    $pem=$certs[$h['kid']]??null;
    if (!is_string($pem)||strpos($pem,'-----BEGIN CERTIFICATE-----')!==0) {
        @unlink($cache);
        respond(503,['ok'=>false,'error'=>'Firebase signing keys updated. Retry sign-in.']);
    }
    if (openssl_verify($header.'.'.$payload,$sig,$pem,OPENSSL_ALGO_SHA256)!==1)
        respond(401,['ok'=>false,'error'=>'Firebase token signature verification failed.']);
    return [
        'localId'=>$uid,'email'=>is_string($p['email']??null)?$p['email']:'',
        'displayName'=>is_string($p['name']??null)?$p['name']:'',
        'phoneNumber'=>is_string($p['phone_number']??null)?$p['phone_number']:'',
        'emailVerified'=>$p['email_verified']??false
    ];
}
