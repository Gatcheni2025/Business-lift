<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$user = require_user();
$workspaceId = user_workspace_id($user);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    $profile = read_store('profiles', $workspaceId, []);
    if (!$profile) {
        $profile = [
            'businessName' => clean_text($user['name'] ?? $user['email'] ?? 'Your business', 120),
            'profileComplete' => false,
            'setupProgress' => 0,
        ];
    }
    json_response(['status' => 'success', 'businessId' => $workspaceId, 'business' => $profile]);
}

if ($method === 'POST' || $method === 'PUT') {
    $input = request_json();
    $fields = ['businessName','businessType','industry','country','phone','address','about'];
    $profile = read_store('profiles', $workspaceId, []);
    foreach ($fields as $field) {
        if (array_key_exists($field, $input)) $profile[$field] = clean_text($input[$field], $field === 'about' ? 2000 : 250);
    }
    if (empty($profile['businessName']) || empty($profile['industry'])) {
        json_response(['status' => 'error', 'message' => 'Business name and industry are required.'], 422);
    }
    $filled = 0;
    foreach ($fields as $field) if (!empty(trim((string)($profile[$field] ?? '')))) $filled++;
    $profile['setupProgress'] = (int)round(($filled / count($fields)) * 100);
    $profile['profileComplete'] = $filled === count($fields);
    $profile['updatedAt'] = gmdate('c');
    $profile['ownerUid'] = $workspaceId;
    write_store('profiles', $workspaceId, $profile);
    json_response(['status' => 'success', 'businessId' => $workspaceId, 'business' => $profile]);
}

json_response(['status' => 'error', 'message' => 'Method not allowed.'], 405);
