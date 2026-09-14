<?php
declare(strict_types=1);
require_once __DIR__ . '/social-lib.php';

$user = require_user();
$uid = user_workspace_id($user);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    $action = $_GET['action'] ?? 'list';
    if ($action !== 'list') json_response(['status'=>'error','message'=>'Unsupported action.'], 400);
    $state = social_state_for($uid);
    json_response([
        'status'=>'success',
        'connections'=>[
            'meta'=>public_connection('meta',$state['meta']),
            'google'=>public_connection('google',$state['google']),
            'whatsapp'=>public_connection('whatsapp',$state['whatsapp']),
        ]
    ]);
}

$input = request_json();
$action = (string)($input['action'] ?? '');
$state = social_state_for($uid);

try {
    if ($action === 'connect_url') {
        $provider = (string)($input['provider'] ?? '');
        $returnTo = safe_return_path((string)($input['returnTo'] ?? '/sales-channels.html'));
        $oauthState = sign_oauth_state(['uid'=>$uid,'provider'=>$provider,'returnTo'=>$returnTo]);
        if ($provider === 'meta') {
            $appId = getenv('META_APP_ID') ?: '';
            if ($appId === '') throw new RuntimeException('META_APP_ID is not configured on the server.');
            $params = http_build_query([
                'client_id'=>$appId,
                'redirect_uri'=>social_callback_url('meta'),
                'state'=>$oauthState,
                'response_type'=>'code',
                'scope'=>'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management',
            ]);
            json_response(['status'=>'success','url'=>'https://www.facebook.com/'.meta_graph_version().'/dialog/oauth?'.$params]);
        }
        if ($provider === 'google') {
            $clientId = getenv('GOOGLE_CLIENT_ID') ?: '';
            if ($clientId === '') throw new RuntimeException('GOOGLE_CLIENT_ID is not configured on the server.');
            $params = http_build_query([
                'client_id'=>$clientId,
                'redirect_uri'=>social_callback_url('google'),
                'response_type'=>'code',
                'scope'=>'https://www.googleapis.com/auth/content',
                'access_type'=>'offline',
                'include_granted_scopes'=>'true',
                'prompt'=>'consent',
                'state'=>$oauthState,
            ]);
            json_response(['status'=>'success','url'=>'https://accounts.google.com/o/oauth2/v2/auth?'.$params]);
        }
        throw new RuntimeException('Unsupported provider.');
    }

    if ($action === 'disconnect') {
        $provider = (string)($input['provider'] ?? '');
        if (!in_array($provider,['meta','google','whatsapp'],true)) throw new RuntimeException('Unsupported provider.');
        $state[$provider] = ['provider'=>$provider,'connected'=>false,'status'=>'not_connected'];
        save_social_state($uid,$state);
        json_response(['status'=>'success','provider'=>$provider]);
    }

    if ($action === 'select_meta_page') {
        $pageId = (string)($input['pageId'] ?? '');
        $pages = is_array($state['meta']['pages'] ?? null) ? $state['meta']['pages'] : [];
        $page = null; foreach ($pages as $candidate) if (($candidate['id'] ?? '') === $pageId) {$page=$candidate;break;}
        if (!$page) throw new RuntimeException('Facebook Page not found.');
        $state['meta']['status']='connected';
        $state['meta']['displayName']=$page['name'] ?? 'Facebook Page';
        $state['meta']['pageId']=$page['id'] ?? null;
        $state['meta']['pageAccessToken']=$page['pageAccessToken'] ?? null;
        $state['meta']['instagramBusinessId']=$page['instagramBusinessId'] ?? null;
        save_social_state($uid,$state);
        json_response(['status'=>'success','connection'=>public_connection('meta',$state['meta'])]);
    }

    if ($action === 'select_google_account') {
        $accountId = (string)($input['accountId'] ?? '');
        $accounts = is_array($state['google']['accounts'] ?? null) ? $state['google']['accounts'] : [];
        $account = null; foreach ($accounts as $candidate) if (($candidate['accountId'] ?? '') === $accountId) {$account=$candidate;break;}
        if (!$account) throw new RuntimeException('Merchant account not found.');
        $state['google']['status']='connected';
        $state['google']['merchantAccountId']=$account['accountId'] ?? null;
        $state['google']['displayName']=$account['accountName'] ?? 'Google Merchant Center';
        save_social_state($uid,$state);
        json_response(['status'=>'success','connection'=>public_connection('google',$state['google'])]);
    }

    if ($action === 'whatsapp_config') {
        $appId = getenv('META_APP_ID') ?: '';
        $configId = getenv('META_WHATSAPP_CONFIG_ID') ?: '';
        if ($appId === '' || $configId === '') throw new RuntimeException('WhatsApp Embedded Signup is not configured on the server.');
        json_response(['status'=>'success','appId'=>$appId,'configId'=>$configId,'graphVersion'=>meta_graph_version()]);
    }

    if ($action === 'whatsapp_complete') {
        $appId = getenv('META_APP_ID') ?: '';
        $appSecret = getenv('META_APP_SECRET') ?: '';
        $code = (string)($input['code'] ?? '');
        $wabaId = (string)($input['wabaId'] ?? '');
        $phoneNumberId = (string)($input['phoneNumberId'] ?? '');
        if ($appId==='' || $appSecret==='' || $code==='' || $wabaId==='' || $phoneNumberId==='') throw new RuntimeException('WhatsApp connection data is incomplete.');
        $tokenRes = http_request('https://graph.facebook.com/'.meta_graph_version().'/oauth/access_token?'.http_build_query([
            'client_id'=>$appId,'client_secret'=>$appSecret,'code'=>$code
        ]));
        if ($tokenRes['status'] < 200 || $tokenRes['status'] >= 300 || empty($tokenRes['body']['access_token'])) throw new RuntimeException('Unable to exchange WhatsApp authorization code.');
        $state['whatsapp'] = [
            'provider'=>'whatsapp','status'=>'connected','displayName'=>'WhatsApp Business',
            'wabaId'=>$wabaId,'phoneNumberId'=>$phoneNumberId,'accessToken'=>$tokenRes['body']['access_token'],'connectedAt'=>gmdate('c')
        ];
        save_social_state($uid,$state);
        json_response(['status'=>'success','connection'=>public_connection('whatsapp',$state['whatsapp'])]);
    }

    throw new RuntimeException('Unsupported action.');
} catch (Throwable $error) {
    json_response(['status'=>'error','message'=>$error->getMessage()], 422);
}
