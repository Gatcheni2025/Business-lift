<?php
declare(strict_types=1);
/**
 * Live Google Places (New) search for SA neighbourhood spazas.
 * Never stores/caches Google Places Content. Place IDs are identifiers only.
 * Secret must be installed in the domain root /teyza-config or the server environment,
 * never in public_html or DirectAdmin's possibly web-exposed private_html.
 */
function teyzaGooglePlacesKey(): string {
    $key = trim((string)(getenv('TEYZA_GOOGLE_PLACES_API_KEY') ?: ($_SERVER['TEYZA_GOOGLE_PLACES_API_KEY'] ?? '')));
    if ($key === '') {
        $private = dirname(__DIR__,2).'/teyza-config/google-places-key.php';
        if (is_file($private) && is_readable($private)) {
            $value = require $private; // private file must return the key, not echo it
            if (is_string($value)) $key=trim($value);
        }
    }
    return preg_match('/^AIza[A-Za-z0-9_-]{20,180}$/D',$key) ? $key : '';
}
function teyzaGoogleDistance(float $lat1,float $lon1,float $lat2,float $lon2): float {
    $r=6371.0;
    $a=deg2rad($lat2-$lat1);$b=deg2rad($lon2-$lon1);
    $h=sin($a/2)**2+cos(deg2rad($lat1))*cos(deg2rad($lat2))*sin($b/2)**2;
    return $r*2*atan2(sqrt(max(0,$h)),sqrt(max(0,1-$h)));
}
function teyzaGooglePlacesRateAllowed(): bool {
    // Limit accidental repeat refreshes and costs. Google-side quotas are ALSO required.
    $ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
    $key=hash('sha256','teyza-google-v1-'.gmdate('YmdH').'-'.$ip);
    $filename=sys_get_temp_dir().'/teyza_places_rate_'.$key;
    $fp=@fopen($filename,'c+');
    if ($fp===false) return false;
    if (!flock($fp,LOCK_EX)){fclose($fp);return false;}
    $raw=stream_get_contents($fp);
    $count=is_numeric(trim((string)$raw))?(int)$raw:0;
    if ($count>=18) {flock($fp,LOCK_UN);fclose($fp);return false;}
    rewind($fp);ftruncate($fp,0);fwrite($fp,(string)($count+1));fflush($fp);
    flock($fp,LOCK_UN);fclose($fp);
    return true;
}
function teyzaGoogleTextSearch(string $key,string $query,float $lat,float $lon): ?array {
    if(!function_exists('curl_init')) return null;
    $body=json_encode([
        'textQuery'=>$query,
        'locationBias'=>['circle'=>['center'=>['latitude'=>$lat,'longitude'=>$lon],'radius'=>6500]],
        'languageCode'=>'en',
        'regionCode'=>'ZA',
        'rankPreference'=>'DISTANCE',
        'maxResultCount'=>20
    ]);
    $handle=curl_init('https://places.googleapis.com/v1/places:searchText');
    if($handle===false) return null;
    curl_setopt_array($handle,[
        CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$body,
        CURLOPT_HTTPHEADER=>[
            'Content-Type: application/json',
            'X-Goog-Api-Key: '.$key,
            // Request minimal non-sensitive business details; avoid expensive reviews/hours/photos.
            'X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus,places.primaryType,places.attributions,places.photos'
        ],
        CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>3,
        CURLOPT_TIMEOUT=>9,CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS
    ]);
    $text=curl_exec($handle);
    $status=(int)curl_getinfo($handle,CURLINFO_HTTP_CODE);
    curl_close($handle);
    if($status!==200||!is_string($text)||strlen($text)>800000) return null;
    $decoded=json_decode($text,true);
    return is_array($decoded)&&isset($decoded['places'])&&is_array($decoded['places'])
        ?$decoded['places']:null;
}
function teyzaGoogleSpazaEntries(float $lat,float $lon,string $category='spaza'): ?array {
    $key=teyzaGooglePlacesKey();
    if ($key===''||!teyzaGooglePlacesRateAllowed()) return null;
    $results=[];$seen=[];
    $isVariety=($category==='variety');
    // Focus search on real retail destinations, not generic malls or unrelated businesses.
    $queries=$isVariety
      ? ['China Mall','China Mart','variety and discount store']
      : ['spaza shop','tuck shop'];
    foreach($queries as $query) {
        $places=teyzaGoogleTextSearch($key,$query,$lat,$lon);
        if($places===null) continue;
        foreach($places as $p) {
            if(!is_array($p)) continue;
            $pid=(string)($p['id']??'');
            $name=trim((string)($p['displayName']['text']??''));
            $lat2=$p['location']['latitude']??null;
            $lon2=$p['location']['longitude']??null;
            if(!preg_match('/^[A-Za-z0-9_-]{8,200}$/D',$pid) || $name==='' ||
               !is_numeric($lat2)||!is_numeric($lon2) ||
               ($p['businessStatus']??'')==='CLOSED_PERMANENTLY') continue;
            $km=teyzaGoogleDistance($lat,$lon,(float)$lat2,(float)$lon2);
            if($km>11.0||isset($seen[$pid]))continue;
            $primaryType=strtolower((string)($p['primaryType']??''));
            if ($isVariety) {
                if (!preg_match('/china\\s?(?:mall|mart|market|city)|variety|discount|bargain|wholesale|general\\s?(?:dealer|merchandise)|value\\s?(?:mart|center)|factory\\s?(?:store|shop)|import|bazaar|hypermarket/i',$name)
                    && !in_array($primaryType,['discount_store','department_store','shopping_mall'],true)) continue;
            } else {
                if(!preg_match('/spaza|tuck.?shop|mini.?market|superette|grocery|convenience|corner.?shop|general.?store/i',$name)
                    && !in_array($primaryType,['grocery_store','convenience_store'],true)) continue;
            }
            $seen[$pid]=true;
            $source=(string)($p['googleMapsUri']??'');
            if(!str_starts_with($source,'https://maps.google.') &&
               !str_starts_with($source,'https://www.google.')) {
                $source='https://www.google.com/maps/search/?api=1&query_place_id='.rawurlencode($pid)
                    .'&query='.rawurlencode($name);
            }
            $attr=[];
            foreach(($p['attributions']??[]) as $attribution) {
                if(!is_array($attribution))continue;
                $provider=substr(trim((string)($attribution['provider']??'')),0,80);
                $url=(string)($attribution['providerUri']??'');
                if($provider!==''&&str_starts_with($url,'https://'))
                    $attr[]=['name'=>$provider,'url'=>$url];
            }
            // Include at most one photo per result. Photo media is fetched only when
            // a shopper views the result; neither the server nor app persists Google images.
            $photoRef=null;$photoAttributions=[];
            $photo=$p['photos'][0]??null;
            if(is_array($photo)) {
                $candidate=(string)($photo['name']??'');
                if(preg_match('#^places/[A-Za-z0-9_-]{8,200}/photos/[A-Za-z0-9_-]{8,600}$#D',$candidate)) {
                    $photoRef=$candidate;
                    foreach(($photo['authorAttributions']??[]) as $credit) {
                        if(!is_array($credit))continue;
                        $person=substr(trim((string)($credit['displayName']??'')),0,100);
                        $url=(string)($credit['uri']??'');
                        if($person!=='' && str_starts_with($url,'https://'))
                          $photoAttributions[]=['name'=>$person,'url'=>$url];
                    }
                }
            }
            $results[]=[
                'id'=>'google-'.$pid,
                'googlePlaceId'=>$pid,
                'name'=>mb_substr($name,0,110),
                'area'=>'Near your selected location',
                'address'=>mb_substr((string)($p['formattedAddress']??''),0,190),
                'sourceUrl'=>$source,
                'latitude'=>(float)$lat2,'longitude'=>(float)$lon2,
                'distanceKm'=>round($km,1),
                'origin'=>'google_places','shopCategory'=>$isVariety?'variety':'spaza',
                'photoRef'=>$photoRef,'photoAttributions'=>$photoAttributions,
                'attributions'=>$attr,
                'claimUrl'=>'https://teyza.co.za/?auth=register'
            ];
        }
        if(count($results)>=22)break;
    }
    if(!$results)return null;
    usort($results,static fn($a,$b)=>$a['distanceKm']<=>$b['distanceKm']);
    return array_slice($results,0,28);
}
