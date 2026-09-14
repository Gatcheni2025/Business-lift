<?php
declare(strict_types=1);
require_once __DIR__ . '/secret-store.php';

$user = require_user();
$workspaceId = user_workspace_id($user);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$allowedSections = ['delivery','shop','partner','banking','payfast','paymentPreferences','audience'];

function public_settings(array $settings): array {
    if (isset($settings['banking']) && is_array($settings['banking'])) {
        unset($settings['banking']['accountNumber'], $settings['banking']['accountNumberEncrypted']);
    }
    if (isset($settings['payfast']) && is_array($settings['payfast'])) {
        unset($settings['payfast']['merchantKey'], $settings['payfast']['merchantKeyEncrypted'], $settings['payfast']['passphrase'], $settings['payfast']['passphraseEncrypted']);
    }
    return $settings;
}
function clean_bool(mixed $value, bool $default = false): bool {
    if (is_bool($value)) return $value;
    if ($value === null) return $default;
    return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
}
function clean_number(mixed $value, float $default = 0): float {
    $n = filter_var($value, FILTER_VALIDATE_FLOAT);
    return $n === false ? $default : max(0, (float)$n);
}
function digits(mixed $value): string { return preg_replace('/\D+/', '', (string)$value) ?? ''; }
function sanitize_banking(array $data, array $existing): array {
    $incoming = digits($data['accountNumber'] ?? '');
    $legacy = digits($existing['accountNumber'] ?? '');
    $encrypted = (string)($existing['accountNumberEncrypted'] ?? '');
    $last4 = (string)($existing['accountNumberLast4'] ?? '');
    if ($incoming !== '') {
        $encrypted = encrypt_secret($incoming);
        $last4 = substr($incoming, -4);
    } elseif ($encrypted === '' && $legacy !== '') {
        $encrypted = encrypt_secret($legacy);
        $last4 = substr($legacy, -4);
    }
    return [
        'bankName' => clean_text($data['bankName'] ?? ($existing['bankName'] ?? ''), 120),
        'accountHolder' => clean_text($data['accountHolder'] ?? ($existing['accountHolder'] ?? ''), 180),
        'accountNumberEncrypted' => $encrypted,
        'accountNumberLast4' => $last4,
        'branchCode' => digits($data['branchCode'] ?? ($existing['branchCode'] ?? '')),
        'accountType' => clean_text($data['accountType'] ?? ($existing['accountType'] ?? 'Business'), 80),
        'updatedAt' => gmdate('c'),
    ];
}
function sanitize_payfast(array $data, array $existing): array {
    $merchantId = clean_text($data['merchantId'] ?? ($existing['merchantId'] ?? ''), 160);
    $incomingKey = clean_text($data['merchantKey'] ?? '', 300);
    $legacyKey = clean_text($existing['merchantKey'] ?? '', 300);
    $keyEncrypted = (string)($existing['merchantKeyEncrypted'] ?? '');
    if ($incomingKey !== '') $keyEncrypted = encrypt_secret($incomingKey);
    elseif ($keyEncrypted === '' && $legacyKey !== '') $keyEncrypted = encrypt_secret($legacyKey);

    $incomingPassphrase = clean_text($data['passphrase'] ?? '', 300);
    $legacyPassphrase = clean_text($existing['passphrase'] ?? '', 300);
    $passphraseEncrypted = (string)($existing['passphraseEncrypted'] ?? '');
    if ($incomingPassphrase !== '') $passphraseEncrypted = encrypt_secret($incomingPassphrase);
    elseif ($passphraseEncrypted === '' && $legacyPassphrase !== '') $passphraseEncrypted = encrypt_secret($legacyPassphrase);

    return [
        'merchantId' => $merchantId,
        'merchantKeyEncrypted' => $keyEncrypted,
        'passphraseEncrypted' => $passphraseEncrypted,
        'sandboxMode' => clean_bool($data['sandboxMode'] ?? ($existing['sandboxMode'] ?? false)),
        'splitPaymentsEnabled' => clean_bool($data['splitPaymentsEnabled'] ?? ($existing['splitPaymentsEnabled'] ?? true), true),
        'connected' => $merchantId !== '' && $keyEncrypted !== '',
        'updatedAt' => gmdate('c'),
    ];
}
function sanitize_section(string $section, array $data, array $existing = []): array {
    return match ($section) {
        'delivery' => [
            'fulfilmentMode' => in_array(($data['fulfilmentMode'] ?? 'courier'), ['courier','pickup','own-driver','hybrid'], true) ? $data['fulfilmentMode'] : 'courier',
            'courierPreference' => clean_text($data['courierPreference'] ?? '', 120),
            'pickupAddress' => clean_text($data['pickupAddress'] ?? '', 500),
            'baseDeliveryFee' => clean_number($data['baseDeliveryFee'] ?? 0),
            'freeDeliveryThreshold' => clean_number($data['freeDeliveryThreshold'] ?? 0),
            'deliveryRadiusKm' => clean_number($data['deliveryRadiusKm'] ?? 0),
            'allowCustomerPickup' => clean_bool($data['allowCustomerPickup'] ?? false),
            'trackingEnabled' => clean_bool($data['trackingEnabled'] ?? true, true),
            'updatedAt' => gmdate('c'),
        ],
        'shop' => [
            'shopName' => clean_text($data['shopName'] ?? '', 160),
            'supportEmail' => clean_text($data['supportEmail'] ?? '', 240),
            'supportPhone' => clean_text($data['supportPhone'] ?? '', 80),
            'returnsPolicy' => clean_text($data['returnsPolicy'] ?? '', 5000),
            'orderNotifications' => clean_bool($data['orderNotifications'] ?? true, true),
            'lowStockNotifications' => clean_bool($data['lowStockNotifications'] ?? true, true),
            'updatedAt' => gmdate('c'),
        ],
        'partner' => [
            'discoverable' => clean_bool($data['discoverable'] ?? true, true),
            'category' => clean_text($data['category'] ?? '', 160),
            'serviceArea' => clean_text($data['serviceArea'] ?? '', 240),
            'offers' => clean_text($data['offers'] ?? '', 2500),
            'needs' => clean_text($data['needs'] ?? '', 2500),
            'allowContact' => clean_bool($data['allowContact'] ?? true, true),
            'updatedAt' => gmdate('c'),
        ],
        'banking' => sanitize_banking($data, $existing),
        'payfast' => sanitize_payfast($data, $existing),
        'paymentPreferences' => [
            'otherGateway' => clean_text($data['otherGateway'] ?? '', 160),
            'otherReference' => clean_text($data['otherReference'] ?? '', 300),
            'updatedAt' => gmdate('c'),
        ],
        'audience' => [
            'gender' => in_array(($data['gender'] ?? 'all'), ['all','women','men'], true) ? $data['gender'] : 'all',
            'ageRange' => clean_text($data['ageRange'] ?? 'All adults', 100),
            'targetArea' => clean_text($data['targetArea'] ?? '', 240),
            'updatedAt' => gmdate('c'),
        ],
        default => [],
    };
}

$settings = read_store('settings', $workspaceId, []);
if (!is_array($settings)) $settings = [];
if ($method === 'GET') {
    $section = (string)($_GET['section'] ?? '');
    $public = public_settings($settings);
    if ($section !== '') {
        if (!in_array($section, $allowedSections, true)) json_response(['status'=>'error','message'=>'Unknown settings section.'], 404);
        json_response(['status'=>'success','section'=>$section,'data'=>$public[$section] ?? []]);
    }
    json_response(['status'=>'success','settings'=>$public]);
}
if ($method === 'POST' || $method === 'PUT' || $method === 'PATCH') {
    $input = request_json();
    $section = (string)($input['section'] ?? '');
    if (!in_array($section, $allowedSections, true)) json_response(['status'=>'error','message'=>'Invalid settings section.'], 422);
    $data = is_array($input['data'] ?? null) ? $input['data'] : [];
    $current = is_array($settings[$section] ?? null) ? $settings[$section] : [];
    $settings[$section] = sanitize_section($section, $data, $current);
    write_store('settings', $workspaceId, $settings);
    $public = public_settings($settings);
    json_response(['status'=>'success','section'=>$section,'data'=>$public[$section] ?? []]);
}
json_response(['status'=>'error','message'=>'Method not allowed.'], 405);
