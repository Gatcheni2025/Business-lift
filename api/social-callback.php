<?php
declare(strict_types=1);
require_once __DIR__ . '/social-lib.php';

$returnTo = '/sales-channels.html';
$provider = (string)($_GET['provider'] ?? '');

try {
    if (!empty($_GET['error'])) {
        header('Location: ' . app_url() . $returnTo . '?social=cancelled');
        exit;
    }
    $code = (string)($_GET['code'] ?? '');
    $payload = read_oauth_state((string)($_GET['state'] ?? ''));
    $returnTo = safe_return_path((string)($payload['returnTo'] ?? $returnTo));
    $uid = (string)($payload['uid'] ?? '');
    if ($uid === '' || $code === '' || ($payload['provider'] ?? '') !== $provider) throw new RuntimeException('Invalid OAuth callback.');

    $state = social_state_for($uid);

    if ($provider === 'meta') {
        $appId = getenv('META_APP_ID') ?: '';
        $appSecret = getenv('META_APP_SECRET') ?: '';
        if ($appId === '' || $appSecret === '') throw new RuntimeException('Meta connection is not configured.');
        $token = http_request('https://graph.facebook.com/'.meta_graph_version().'/oauth/access_token?'.http_build_query([
            'client_id'=>$appId,'client_secret'=>$appSecret,'redirect_uri'=>social_callback_url('meta'),'code'=>$code
        ]));
        $short = $token['body']['access_token'] ?? '';
        if ($token['status'] < 200 || $token['status'] >= 300 || $short === '') throw new RuntimeException('Meta authorization failed.');
        $longRes = http_request('https://graph.facebook.com/'.meta_graph_version().'/oauth/access_token?'.http_build_query([
            'grant_type'=>'fb_exchange_token','client_id'=>$appId,'client_secret'=>$appSecret,'fb_exchange_token'=>$short
        ]));
        $userToken = $longRes['body']['access_token'] ?? $short;
        $pagesRes = http_request('https://graph.facebook.com/'.meta_graph_version().'/me/accounts?'.http_build_query([
            'fields'=>'id,name,access_token,instagram_business_account','access_token'=>$userToken
        ]));
        $pages = [];
        foreach (($pagesRes['body']['data'] ?? []) as $page) {
            $pages[] = [
                'id'=>(string)($page['id'] ?? ''),
                'name'=>(string)($page['name'] ?? 'Facebook Page'),
                'pageAccessToken'=>$page['access_token'] ?? null,
                'instagramBusinessId'=>$page['instagram_business_account']['id'] ?? null,
            ];
        }
        $selected = count($pages) === 1 ? $pages[0] : null;
        $state['meta'] = [
            'provider'=>'meta','status'=>count($pages)===1?'connected':(count($pages)>1?'needs_page':'no_pages'),
            'userAccessToken'=>$userToken,'pages'=>$pages,
            'displayName'=>$selected['name'] ?? null,'pageId'=>$selected['id'] ?? null,
            'pageAccessToken'=>$selected['pageAccessToken'] ?? null,'instagramBusinessId'=>$selected['instagramBusinessId'] ?? null,
            'connectedAt'=>gmdate('c')
        ];
        save_social_state($uid,$state);
    } elseif ($provider === 'google') {
        $clientId = getenv('GOOGLE_CLIENT_ID') ?: '';
        $clientSecret = getenv('GOOGLE_CLIENT_SECRET') ?: '';
        if ($clientId === '' || $clientSecret === '') throw new RuntimeException('Google connection is not configured.');
        $tokenRes = http_request('https://oauth2.googleapis.com/token','POST',http_build_query([
            'code'=>$code,'client_id'=>$clientId,'client_secret'=>$clientSecret,'redirect_uri'=>social_callback_url('google'),'grant_type'=>'authorization_code'
        ]),['Content-Type: application/x-www-form-urlencoded']);
        $token = $tokenRes['body'];
        if ($tokenRes['status'] < 200 || $tokenRes['status'] >= 300 || empty($token['access_token'])) throw new RuntimeException('Google authorization failed.');
        $accountsRes = http_request('https://merchantapi.googleapis.com/accounts/v1/accounts','GET',null,[
            'Authorization: Bearer '.$token['access_token']
        ]);
        $accounts = [];
        foreach (($accountsRes['body']['accounts'] ?? []) as $account) {
            $name = (string)($account['name'] ?? '');
            $accounts[] = [
                'name'=>$name,
                'accountId'=>basename($name),
                'accountName'=>(string)($account['accountName'] ?? $account['account_name'] ?? 'Merchant Center'),
            ];
        }
        $selected = count($accounts) === 1 ? $accounts[0] : null;
        $state['google'] = [
            'provider'=>'google','status'=>count($accounts)===1?'connected':(count($accounts)>1?'needs_account':'no_accounts'),
            'accessToken'=>$token['access_token'],'refreshToken'=>$token['refresh_token'] ?? null,'accounts'=>$accounts,
            'merchantAccountId'=>$selected['accountId'] ?? null,'displayName'=>$selected['accountName'] ?? null,'connectedAt'=>gmdate('c')
        ];
        save_social_state($uid,$state);
    } else {
        throw new RuntimeException('Unsupported provider.');
    }

    header('Location: ' . app_url() . $returnTo . '?social=connected&provider=' . rawurlencode($provider));
    exit;
} catch (Throwable $error) {
    error_log('Business Expo social callback: ' . $error->getMessage());
    header('Location: ' . app_url() . $returnTo . '?social=error');
    exit;
}
