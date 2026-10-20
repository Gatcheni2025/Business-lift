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
$shopCategory=(($_GET['category']??'spaza')==='variety')?'variety':'spaza';

// Google Places (New) is preferred when a server-side key is configured.
// A live Google response is never cached and is displayed with Google Maps attribution.
// When not configured/unavailable, existing public-directory/OpenStreetMap fallback works.
require_once __DIR__.'/shopper-google-places-provider.php';
if ($hasPoint) {
  $fromGoogle=teyzaGoogleSpazaEntries((float)$lat,(float)$lon,$shopCategory);
  if ($fromGoogle!==null && count($fromGoogle)>0) {
    header('Cache-Control: private, no-store, max-age=0');
    respond([
      'ok'=>true,
      'entries'=>$fromGoogle,
      'count'=>count($fromGoogle),
      'provider'=>'google_places','shopCategory'=>$shopCategory,
      'attribution'=>'Google Maps',
      'googleAttributionRequired'=>true,
      'areaSearchKm'=>11,
      'note'=>'Business listings from Google Maps. Not registered Teyza shops; no guaranteed stock or prices.'
    ]);
  }
}

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
 // Additional individually named online listings. Presence/stock/hours NOT verified by Teyza.
 ['id'=>'ext-mbali-inanda','name'=>"Mbali's Tuckshop",'area'=>'Amatikwe, Inanda','address'=>'55 109356 St, Amatikwe, Inanda, 4310','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Mbali%27s%20Tuckshop%20Inanda'],
 ['id'=>'ext-ebhasini-inanda','name'=>'Ebhasini Tuckshop','area'=>'Inanda Congo','address'=>'20 120046 St, Inanda Congo, Inanda, 4310','sourceUrl'=>'https://ethekwini.co.za/places/ebhasini-tuckshop/'],
 ['id'=>'ext-ziphozakhe-inanda','name'=>'Ziphozakhe tuck shop','area'=>'Inanda Glebe','address'=>'58 107617 St, Inanda Glebe, Inanda, 4310','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Ziphozakhe%20tuck%20shop%20Inanda'],
 ['id'=>'ext-shalom-kwamashu','name'=>'Shalom Spaza','area'=>'Emlanjeni, KwaMashu','address'=>'Isipingo Rd, Emlanjeni, KwaMashu, 4051','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Shalom%20Spaza%20KwaMashu'],
 ['id'=>'ext-yolanda-kwamashu','name'=>"Yolanda's Tuck Shop",'area'=>'KwaMashu','address'=>'M2294 Umhlabelo Grove, KwaMashu, 4360','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Yolandas%20Tuck%20Shop%20KwaMashu'],
 ['id'=>'ext-edombolweni-umlazi','name'=>'Edombolweni Tuck Shop','area'=>'Umlazi N, Durban','address'=>'54 Mdumiseni Close, Umlazi N, Umlazi, 4066','sourceUrl'=>'https://www.google.com/maps/search/?api=1&query=Edombolweni%20Tuck%20Shop%20Umlazi'],
 ['id'=>'ext-masuku-kwamashu','name'=>'Masuku Tuck Shop','area'=>'KwaMashu','address'=>'H443 Mpunzi Road, KwaMashu','sourceUrl'=>'https://www.kznedtea.gov.za/documents/tender/Bids/2025/Request%20For%20Quotation%202026030304%20Pest%20Control%20Services.pdf'],
 ['id'=>'ext-thandi-kwamashu','name'=>"Thandi's Tuck Shop",'area'=>'KwaMashu','address'=>'L1195 Mbondwe Road, KwaMashu','sourceUrl'=>'https://www.kznedtea.gov.za/documents/tender/Bids/2025/Request%20For%20Quotation%202026030304%20Pest%20Control%20Services.pdf'],
 ['id'=>'ext-stella-kwamashu','name'=>'Stella Tuckshop','area'=>'KwaMashu','address'=>'P297 Ithunge Road, KwaMashu','sourceUrl'=>'https://www.kznedtea.gov.za/documents/tender/Bids/2025/Request%20For%20Quotation%202026030304%20Pest%20Control%20Services.pdf'],
 ['id'=>'ext-pioneer-inanda-square','name'=>'Pioneer Xpress - Inanda Square','area'=>'Newlands West, Durban','address'=>'Inanda Square Centre, Newlands West, Durban','sourceUrl'=>'https://www.findglocal.com/ZA/Durban/103707884911720/Pioneer-Xpress'],

];
$entryFn=static function(array $e): array {
  return ['id'=>$e['id'],'name'=>$e['name'],'area'=>$e['area'],
    'address'=>$e['address'],'sourceUrl'=>$e['sourceUrl'],
    'latitude'=>null,'longitude'=>null,'origin'=>'public_directory',
    'claimUrl'=>'https://teyza.co.za/?auth=register'];
};
$listed=[];
if ($area==='' && $shopCategory==='spaza') {
  foreach ($curated as $e) $listed[]=$entryFn($e);
} else {
  foreach ($curated as $e) {
    $text=strtolower($e['area'].' '.$e['address']);
    if ($shopCategory==='spaza' &&
        (str_contains($text,$area)||str_contains($area,'durban')&&str_contains($text,'durban')))
      $listed[]=$entryFn($e);
  }
}
$overpassError=false;
if ($hasPoint) {
  $key='teyza_discover_'.$shopCategory.'_'.str_replace('-','m',str_replace('.','_',sprintf('%.2f_%.2f',$lat,$lon)));
  $cache=sys_get_temp_dir().'/'.$key.'.json';
  $payload=null;
  if (is_file($cache)&&filemtime($cache)>time()-3600) {
    $payload=json_decode((string)@file_get_contents($cache),true);
  } else {
    $shopFilter=$shopCategory==='variety'?'^(variety_store|department_store|general|wholesale|mall)
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
        'origin'=>'openstreetmap','shopCategory'=>$shopCategory,'claimUrl'=>'https://teyza.co.za/?auth=register'
      ];
    }
  } else $overpassError=true;
}
respond(['ok'=>true,'entries'=>$listed,'count'=>count($listed),'shopCategory'=>$shopCategory,
 'areaSearchKm'=>$hasPoint?6:null,'openstreetmapTemporarilyUnavailable'=>$overpassError,
 'attribution'=>'© OpenStreetMap contributors · ODbL. Third-party online listings; not Teyza merchants.']);
:'^(convenience|general|grocery|kiosk)
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
;
    $query='[out:json][timeout:12];(nwr(around:6000,'.$lat.','.$lon.')["shop"~"'.$shopFilter.'"]["name"];);out center 75;';
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
