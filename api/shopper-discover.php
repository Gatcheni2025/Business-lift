<?php
declare(strict_types=1);
/**
 * Third-party online directory discovery. These shops are NOT Teyza merchants.
 * No product prices, stock, bookings, ratings or merchant approval are implied.
 * OpenStreetMap data: © OpenStreetMap contributors, ODbL.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('X-Content-Type-Options: nosniff');
function respond(array $data,int $status=200): never {
  http_response_code($status);
  echo json_encode($data,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}
function v($text,$max=150): string { return substr(trim((string)$text),0,$max); }
$lat=filter_var($_GET['lat']??null,FILTER_VALIDATE_FLOAT);
$lon=filter_var($_GET['lon']??null,FILTER_VALIDATE_FLOAT);
$hasPoint=$lat!==false && $lon!==false && $lat>=-35 && $lat<=-22 && $lon>=16 && $lon<=34;
$lat=$hasPoint?round((float)$lat,2):null;
$lon=$hasPoint?round((float)$lon,2):null;
$area=strtolower(v($_GET['area']??'',75));

// Public online listings gathered individually from searchable business directories.
// Source URLs are given for transparency; not a live trading or affiliation claim.
$curated=[
 ['id'=>'ext-melusi-inanda','name'=>'Melusi Tuckshop','area'=>'Amatikwe, Inanda','address'=>'47 109356 St, Amatikwe, Inanda, 4310','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Melusi%20Tuckshop%20Inanda'],
 ['id'=>'ext-isiqalo-inanda','name'=>'Isiqalo Spaza Shop','area'=>'Mshayazafe, Inanda','address'=>'1 108961 Street, Mshayazafe, Inanda, 4310','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Isiqalo%20Spaza%20Shop%20Inanda'],
 ['id'=>'ext-dikiza-inanda','name'=>'DIKIZA tuckshop','area'=>'Inanda Congo','address'=>'Inanda Congo, Inanda, 4310','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=DIKIZA%20tuckshop%20Inanda'],
 ['id'=>'ext-gcucwa-durban','name'=>"Gcucwa's Spaza Shop & Phone Inn",'area'=>'Durban','address'=>'A1165 Gashe Rd, Durban','sourceUrl'=>'https://www.africabizinfo.com/ZA/gcucwas-spaza-shop-phone-inn-031-772-2614'],
 ['id'=>'ext-penzance-umbilo','name'=>'Penzance Superette','area'=>'Umbilo, Durban','address'=>'646 Umbilo Rd, Umbilo, Durban','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Penzance%20Superette%20Durban'],
 ['id'=>'ext-pioneer-durban','name'=>'Pioneer Wholesale And Spaza','area'=>'Durban Central','address'=>'80 Johannes Nkosi St, Durban','sourceUrl'=>'https://rsa.worldorgs.com/catalog/durban/supermarket/pioneer-wholesale-and-spaza'],
 ['id'=>'ext-madiba-greyville','name'=>'Madiba Wholesale & Spaza','area'=>'Greyville, Durban','address'=>'165 Julius Nyerere St, Durban','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Madiba%20Wholesale%20Spaza%20Durban'],
];
$entryFn=static function(array $e): array {
  return ['id'=>$e['id'],'name'=>$e['name'],'area'=>$e['area'],
    'address'=>$e['address'],'sourceUrl'=>$e['sourceUrl'],
    'latitude'=>null,'longitude'=>null,'origin'=>'public_directory',
    'claimUrl'=>'https://teyza.co.za/?auth=register'];
};
$listed=[];
if ($area==='') {
  foreach ($curated as $e) $listed[]=$entryFn($e);
} else {
  foreach ($curated as $e) {
    $text=strtolower($e['area'].' '.$e['address']);
    if (str_contains($text,$area)||str_contains($area,'durban')&&str_contains($text,'durban'))
      $listed[]=$entryFn($e);
  }
}
$overpassError=false;
if ($hasPoint) {
  $key='teyza_discover_'.str_replace('-','m',str_replace('.','_',sprintf('%.2f_%.2f',$lat,$lon)));
  $cache=sys_get_temp_dir().'/'.$key.'.json';
  $payload=null;
  if (is_file($cache)&&filemtime($cache)>time()-3600) {
    $payload=json_decode((string)@file_get_contents($cache),true);
  } else {
    $query='[out:json][timeout:12];(nwr(around:6000,'.$lat.','.$lon.')["shop"~"^(convenience|general|grocery|kiosk)$"]["name"];);out center 75;';
    $ch=curl_init('https://overpass.kumi.systems/api/interpreter');
    curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>'data='.urlencode($query),
      CURLOPT_HTTPHEADER=>['Content-Type: application/x-www-form-urlencoded'],
      CURLOPT_USERAGENT=>'Teyza-Shopper-Directory/1.0 (https://teyza.co.za)',
      CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>15]);
    $raw=curl_exec($ch);
    $code=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
    $result=$code===200?json_decode((string)$raw,true):null;
    if (is_array($result)&&isset($result['elements'])&&is_array($result['elements'])) {
      $payload=$result;
      @file_put_contents($cache,json_encode($payload),LOCK_EX);
    }
  }
  if (is_array($payload)) {
    $seen=[];
    foreach ($payload['elements'] as $element) {
      if (count($seen)>=75) break;
      $tags=$element['tags']??[];
      $name=v($tags['name']??'',85);
      if ($name==='') continue;
      $lat2=$element['lat']??$element['center']['lat']??null;
      $lon2=$element['lon']??$element['center']['lon']??null;
      if (!is_numeric($lat2)||!is_numeric($lon2)) continue;
      $type=v($element['type']??'',10);
      $id=(int)($element['id']??0);
      if (!in_array($type,['node','way','relation'],true)||$id<=0) continue;
      $clean=strtolower(preg_replace('/\s+/',' ',trim($name)));
      if (isset($seen[$clean])) continue;
      $seen[$clean]=true;
      $address=implode(', ',array_filter([
        v($tags['addr:housenumber']??'',12).' '.v($tags['addr:street']??'',80),
        v($tags['addr:suburb']??$tags['addr:city']??'',75)
      ],fn($v)=>trim($v)!==''));
      $listed[]=[
        'id'=>'osm-'.$type.'-'.$id,'name'=>$name,
        'area'=>v($tags['addr:suburb']??$tags['addr:city']??'Public map listing',80),
        'address'=>$address,'sourceUrl'=>'https://www.openstreetmap.org/'.$type.'/'.$id,
        'latitude'=>(float)$lat2,'longitude'=>(float)$lon2,
        'origin'=>'openstreetmap','claimUrl'=>'https://teyza.co.za/?auth=register'
      ];
    }
  } else $overpassError=true;
}
respond(['ok'=>true,'entries'=>$listed,'count'=>count($listed),
 'areaSearchKm'=>$hasPoint?6:null,'openstreetmapTemporarilyUnavailable'=>$overpassError,
 'attribution'=>'© OpenStreetMap contributors · ODbL. Third-party online listings; not Teyza merchants.']);
