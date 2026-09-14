<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

function social_secret(): string {
    $secret = getenv('OAUTH_STATE_SECRET') ?: '';
    if ($secret === '') throw new RuntimeException('OAUTH_STATE_SECRET is not configured on the server.');
    return $secret;
}

function b64url_encode_str(string $value): string {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function sign_oauth_state(array $payload): string {
    $payload['exp'] = time() + 600;
    $encoded = b64url_encode_str(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig = hash_hmac('sha256', $encoded, social_secret());
    return $encoded . '.' . $sig;
}

function read_oauth_state(string $state): array {
    [$encoded,$sig] = array_pad(explode('.', $state, 2), 2, '');
    if ($encoded === '' || $sig === '') throw new RuntimeException('Invalid OAuth state.');
    $expected = hash_hmac('sha256', $encoded, social_secret());
    if (!hash_equals($expected, $sig)) throw new RuntimeException('OAuth state mismatch.');
    $payload = json_decode(base64url_decode_str($encoded), true);
    if (!is_array($payload) || (int)($payload['exp'] ?? 0) < time()) throw new RuntimeException('OAuth state expired.');
    return $payload;
}

function app_url(): string {
    $configured = rtrim((string)(getenv('APP_URL') ?: ''), '/');
    if ($configured !== '') return $configured;
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'www.businessexpo.co.za';
    return $scheme . '://' . $host;
}

function social_callback_url(string $provider): string {
    return app_url() . '/api/social-callback.php?provider=' . rawurlencode($provider);
}

function safe_return_path(string $value): string {
    $path = parse_url($value, PHP_URL_PATH) ?: '/sales-channels.html';
    $allowed = ['/sales-channels.html','/seller-onboarding.html','/dashboard.html'];
    return in_array($path, $allowed, true) ? $path : '/sales-channels.html';
}

function social_state_for(string $uid): array {
    $data = read_store('connections', $uid, []);
    foreach (['meta','google','whatsapp'] as $provider) {
        if (!isset($data[$provider]) || !is_array($data[$provider])) {
            $data[$provider] = ['provider'=>$provider,'connected'=>false,'status'=>'not_connected'];
        }
    }
    return $data;
}

function save_social_state(string $uid, array $data): void {
    write_store('connections', $uid, $data);
}

function public_connection(string $provider, array $data): array {
    return [
        'provider'=>$provider,
        'connected'=>($data['status'] ?? '') === 'connected',
        'status'=>$data['status'] ?? 'not_connected',
        'displayName'=>$data['displayName'] ?? null,
        'pageId'=>$data['pageId'] ?? null,
        'instagramBusinessId'=>$data['instagramBusinessId'] ?? null,
        'merchantAccountId'=>$data['merchantAccountId'] ?? null,
        'availablePages'=>array_map(fn($p)=>['id'=>$p['id'] ?? '','name'=>$p['name'] ?? '','instagramBusinessId'=>$p['instagramBusinessId'] ?? null], is_array($data['pages'] ?? null) ? $data['pages'] : []),
        'availableAccounts'=>array_map(fn($a)=>['name'=>$a['name'] ?? '','accountId'=>$a['accountId'] ?? '','accountName'=>$a['accountName'] ?? 'Merchant Center'], is_array($data['accounts'] ?? null) ? $data['accounts'] : []),
    ];
}

function meta_graph_version(): string {
    return getenv('META_GRAPH_VERSION') ?: 'v23.0';
}
